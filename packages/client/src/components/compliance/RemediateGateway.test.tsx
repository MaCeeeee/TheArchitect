// @vitest-environment jsdom
/**
 * THE-638/640 — Remediate zählt aus EINER Quelle (der Norm-Facade).
 *
 * Der Bug: Das Gateway leitete seine Zahlen selbst aus der Upload-Route ab
 * (`standardsAPI.getMappings`, `status==='gap'`) und meldete „No gaps
 * detected" bei 14 offenen MUST-Pflichten — der Korpus kennt kein
 * `gap`-Urteil, dort ist die offene Sektion `unmapped`.
 *
 * Diese Suite pinnt: (1) der Korpus-Fall zeigt offene Punkte und speist
 * Generate mit den Section-Ids, (2) „No gaps detected" nur wenn wirklich
 * nichts offen ist, (3) die alte Upload-Route wird NICHT mehr gerufen —
 * die Negativ-Kontrolle gegen die zweite Zählquelle.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useParams: () => ({ projectId: 'p1' }),
}));

vi.mock('../../services/api', () => ({
  normsAPI: { remediationScope: vi.fn() },
  // Die alte Quelle bleibt gemockt und WIRFT — wird sie gerufen, ist die
  // zweite Zählquelle zurück, und genau das soll auffliegen.
  standardsAPI: {
    getMappings: vi.fn(() => {
      throw new Error('standardsAPI.getMappings darf nicht mehr die Quelle sein (THE-638)');
    }),
  },
}));

const generate = vi.fn();
const remState = {
  proposals: [],
  loadProposals: vi.fn(),
  generate,
  isGenerating: false,
  isApplying: false,
  generationProgress: null as string | null,
  error: null as string | null,
  applyProposal: vi.fn(),
  rollbackProposal: vi.fn(),
  editProposal: vi.fn(),
  selectProposal: vi.fn(),
};
vi.mock('../../stores/remediationStore', () => ({
  useRemediationStore: (sel: (s: typeof remState) => unknown) => sel(remState),
}));

const archState = { projectId: 'p1' };
vi.mock('../../stores/architectureStore', () => ({
  useArchitectureStore: (sel: (s: typeof archState) => unknown) => sel(archState),
}));

const compliance = {
  selectedStandardId: 'corpus:dsgvo',
  portfolioOverview: {
    portfolio: [{ standardId: 'corpus:dsgvo', standardName: 'DSGVO' }],
  },
};
vi.mock('../../stores/complianceStore', () => ({
  useComplianceStore: () => compliance,
}));

import { normsAPI, standardsAPI } from '../../services/api';
import RemediateGateway from './RemediateGateway';

const scopeMock = vi.mocked(normsAPI.remediationScope);

const scope = (over: Partial<Record<string, unknown>> = {}) => ({
  data: {
    success: true,
    data: {
      total: 1, compliant: 0, partial: 0, gap: 0, unmapped: 1,
      openSectionIds: ['dsgvo:art-32'],
      ...over,
    },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  remState.error = null;
  remState.isGenerating = false;
});

describe('RemediateGateway — eine Zählquelle (THE-638)', () => {
  test('der Korpus-Fall aus Produktion: offene Sektion sichtbar, kein „No gaps detected"', async () => {
    scopeMock.mockResolvedValue(scope() as never);
    render(<RemediateGateway />);

    // Die Gaps-Kachel zählt gap + unmapped — die offene Korpus-Sektion.
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    expect(screen.queryByText(/no gaps detected/i)).not.toBeInTheDocument();
  });

  test('Generate bekommt die openSectionIds der Facade — nicht eine eigene Ableitung', async () => {
    scopeMock.mockResolvedValue(scope() as never);
    render(<RemediateGateway />);

    const btn = await screen.findByRole('button', { name: /generate ai fix for 1 unmapped gap/i });
    fireEvent.click(btn);
    expect(generate).toHaveBeenCalledWith('p1', {
      source: 'compliance',
      standardId: 'corpus:dsgvo',
      gapSectionIds: ['dsgvo:art-32'],
    });
  });

  test('„No gaps detected" NUR wenn wirklich nichts offen ist', async () => {
    scopeMock.mockResolvedValue(
      scope({ compliant: 1, unmapped: 0, openSectionIds: [] }) as never,
    );
    render(<RemediateGateway />);
    await waitFor(() => expect(screen.getByText(/no gaps detected/i)).toBeInTheDocument());
  });

  test('Upload bleibt byte-gleich: gap-Mappings zählen und speisen Generate', async () => {
    scopeMock.mockResolvedValue(
      scope({ total: 3, gap: 2, unmapped: 0, openSectionIds: ['s-a', 's-b'] }) as never,
    );
    render(<RemediateGateway />);

    await screen.findByRole('button', { name: /generate ai fix for 2 unmapped gaps/i });
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  test('NEGATIV-KONTROLLE: die alte Upload-Route wird nicht mehr gerufen', async () => {
    scopeMock.mockResolvedValue(scope() as never);
    render(<RemediateGateway />);
    await waitFor(() => expect(scopeMock).toHaveBeenCalledWith('p1', 'corpus:dsgvo'));
    expect(standardsAPI.getMappings).not.toHaveBeenCalled();
  });
});

/**
 * THE-644 — ein Fehlschlag ist zu SEHEN.
 *
 * Der Server meldete den Cast-Fehler als `data: {"type":"error"}` in einem
 * SSE-Strom (HTTP 200, weil `flushHeaders()` vorher lief). Der Store setzte
 * `error` korrekt — nur diese Flaeche las ihn nie aus. Fuer den Nutzer
 * passierte fuenf Minuten lang schlicht nichts.
 *
 * Die Suite pinnt beide Richtungen: der Fehler erscheint, wenn einer da ist,
 * UND die Flaeche bleibt still, wenn keiner da ist — sonst wuerde ein
 * dauerhaft sichtbarer Kasten den Test auch bestehen.
 */
describe('RemediateGateway — ein Fehlschlag ist sichtbar (THE-644)', () => {
  test('die Server-Meldung erscheint im Klartext auf der Fläche', async () => {
    scopeMock.mockResolvedValue(scope() as never);
    remState.error =
      'RemediationProposal validation failed: sourceRef.standardId: ' +
      'Cast to ObjectId failed for value "corpus:dsgvo" (type string)';
    render(<RemediateGateway />);

    // Im Klartext, nicht als generisches „Something went wrong": die Meldung
    // ist das Einzige, was den Nutzer zur Ursache fuehrt.
    expect(await screen.findByText(/cast to objectid failed/i)).toBeInTheDocument();
  });

  test('der Fehler-Kasten steht NICHT da, wenn nichts schiefging', async () => {
    scopeMock.mockResolvedValue(scope() as never);
    render(<RemediateGateway />);

    await screen.findByRole('button', { name: /generate ai fix/i });
    expect(screen.queryByTestId('remediate-error')).not.toBeInTheDocument();
  });

  test('der Fehler bleibt sichtbar, waehrend der Knopf wieder bereit steht', async () => {
    // `isGenerating` faellt beim Fehler zurueck (remediationStore:122) — genau
    // dann darf der Knopf nicht so aussehen, als waere nie etwas passiert.
    scopeMock.mockResolvedValue(scope() as never);
    remState.error = 'norm not found';
    render(<RemediateGateway />);

    expect(await screen.findByTestId('remediate-error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate ai fix/i })).toBeInTheDocument();
  });
});
