// @vitest-environment jsdom
/**
 * THE-548/555 — LegalApplicabilityCheck: vier Zustände, Zitat, ehrliche Lücken.
 *
 * Die Kern-Prüfungen entsprechen den Server-Garantien: verdrängt trägt sein
 * Zitat, unbestimmt ist nie „gilt nicht", Korpus-Ausfall ist ein eigener
 * Zustand, und ein magerer Beleg (1–2 Normsätze) wird markiert statt versteckt.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/api')>();
  return {
    ...original,
    normsAPI: { ...original.normsAPI, legalApplicability: vi.fn(), getSection: vi.fn() },
    projectAPI: { ...original.projectAPI, get: vi.fn(), update: vi.fn() },
  };
});
import { normsAPI, projectAPI } from '../../services/api';
import LegalApplicabilityCheck from './LegalApplicabilityCheck';

const laMock = normsAPI.legalApplicability as ReturnType<typeof vi.fn>;
const projMock = projectAPI.get as ReturnType<typeof vi.fn>;

function mount() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1/compliance']}>
      <Routes>
        <Route path="/projects/:projectId/compliance" element={<LegalApplicabilityCheck />} />
      </Routes>
    </MemoryRouter>,
  );
}

const BASE = {
  profilePresent: true,
  corpus: 'ok',
  disclaimer: 'Assessment based on suggested corpus typing … not legal advice.',
  laws: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  projMock.mockResolvedValue({ data: { legalProfile: { addresseeClasses: ['controller'] } } });
});

describe('LegalApplicabilityCheck', () => {
  test('renders the four states with their evidence', async () => {
    laMock.mockResolvedValue({
      data: {
        data: {
          ...BASE,
          laws: [
            { law: 'dora', expression: 'dora', state: 'applicable', reason: 'Binds …', matchedRoles: ['financial_entity'], provisionsBinding: 26, provisionsTyped: 56, provisionsTotal: 63 },
            { law: 'nis2', expression: 'nis2', state: 'displaced', reason: 'Displaced …', prevailingSource: 'dora', citations: ['DORA Art. 1 Abs. 2'], provisionsTyped: 35, provisionsTotal: 46 },
            { law: 'mdr', expression: 'mdr-de', state: 'not_applicable', reason: 'None …', missingRoles: ['manufacturer'], provisionsTyped: 101, provisionsTotal: 123 },
            { law: 'lksg', expression: 'lksg', state: 'undetermined', reason: 'No consumable typing …', provisionsTyped: 0, provisionsTotal: 24 },
          ],
        },
      },
    });
    mount();
    await waitFor(() => expect(screen.getByText('dora')).toBeInTheDocument());
    expect(screen.getByText(/binds 26\/56 typed provisions/i)).toBeInTheDocument();
    expect(screen.getByText(/— by DORA/)).toBeInTheDocument();
    expect(screen.getByText('Not applicable')).toBeInTheDocument();
    expect(screen.getByText('Undetermined')).toBeInTheDocument();
    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument();
  });

  test('marks thin evidence — one typed provision must not look like solid ground', async () => {
    laMock.mockResolvedValue({
      data: {
        data: {
          ...BASE,
          laws: [{ law: 'emoney', expression: 'emoney-de', state: 'applicable', reason: 'Binds …', provisionsBinding: 1, provisionsTyped: 15, provisionsTotal: 24 }],
        },
      },
    });
    mount();
    await waitFor(() => expect(screen.getByText(/thin evidence/i)).toBeInTheDocument());
  });

  test('missing profile: says undetermined is NOT "does not apply"', async () => {
    laMock.mockResolvedValue({ data: { data: { ...BASE, profilePresent: false } } });
    projMock.mockResolvedValue({ data: { legalProfile: undefined } });
    mount();
    await waitFor(() =>
      expect(screen.getByText(/Unknown is not/)).toBeInTheDocument(),
    );
  });

  test('corpus outage is its own state, not an empty "nothing applies"', async () => {
    laMock.mockResolvedValue({ data: { data: { ...BASE, corpus: 'unavailable' } } });
    mount();
    await waitFor(() => expect(screen.getByText(/corpus is currently unavailable/i)).toBeInTheDocument());
    expect(screen.getByText(/not.*“no law applies”/i)).toBeInTheDocument();
  });

  // ─── THE-573 (REQ-573.2): WELCHE Artikel binden ────────────────────────
  test('names the binding articles and keeps the truncated remainder visible', async () => {
    laMock.mockResolvedValue({
      data: {
        data: {
          ...BASE,
          laws: [{
            law: 'dsgvo', expression: 'dsgvo', state: 'applicable', reason: 'Binds …',
            matchedRoles: ['controller'],
            provisionsBinding: 39,                                  // die VOLLE Zahl
            bindingProvisionEIds: Array.from({ length: 10 }, (_, i) => `dsgvo:art-${30 + i}`),
            provisionsTyped: 78, provisionsTotal: 99,
          }],
        },
      },
    });
    mount();
    await waitFor(() => expect(screen.getByText('dsgvo')).toBeInTheDocument());
    fireEvent.click(screen.getByText('dsgvo'));

    // Der Nutzer erfährt WELCHE — nicht nur wie viele.
    expect(await screen.findByTestId('binding-provisions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dsgvo:art-30/ })).toBeInTheDocument();
    // 39 gebunden, 10 genannt → 29 müssen sichtbar bleiben. Stille Kappung ist der Fehler.
    expect(screen.getByText(/29 more/i)).toBeInTheDocument();
  });

  test('binding articles and displacement citations stay two separate things', async () => {
    laMock.mockResolvedValue({
      data: {
        data: {
          ...BASE,
          laws: [
            { law: 'dora', expression: 'dora', state: 'applicable', reason: 'Binds …',
              provisionsBinding: 2, bindingProvisionEIds: ['dora:art-5', 'dora:art-6'],
              provisionsTyped: 56, provisionsTotal: 63 },
            { law: 'nis2', expression: 'nis2', state: 'displaced', reason: 'Displaced …',
              prevailingSource: 'dora', citations: ['DORA Art. 1 Abs. 2'],
              provisionsTyped: 35, provisionsTotal: 46 },
          ],
        },
      },
    });
    mount();
    await waitFor(() => expect(screen.getByText('dora')).toBeInTheDocument());
    fireEvent.click(screen.getByText('dora'));
    fireEvent.click(screen.getByText('nis2'));

    // Bindende Artikel hängen am anwendbaren Gesetz …
    expect(await screen.findByTestId('binding-provisions')).toBeInTheDocument();
    // … die Verdrängungs-Belege am verdrängten. Zwei Blöcke, zwei Aussagen.
    expect(screen.getByTestId('displacement-citations')).toBeInTheDocument();
    expect(screen.getByText(/DORA Art\. 1 Abs\. 2/)).toBeInTheDocument();
  });

  test('clicking a binding article shows the law text from the corpus', async () => {
    // Der Kern von AC 3: Eine Kennung, die man nicht nachlesen kann, ist nur
    // eine hübschere Zahl. Die workId muss aus der FASSUNG kommen (dsgvo →
    // corpus:dsgvo), nicht aus dem Gesetzesnamen.
    const getSection = normsAPI.getSection as ReturnType<typeof vi.fn>;
    getSection.mockResolvedValue({
      data: { success: true, data: { eId: 'dsgvo:art-33', number: 'Art. 33', heading: 'Meldung von Verletzungen',
        text: 'Im Falle einer Verletzung des Schutzes personenbezogener Daten meldet der Verantwortliche …' } },
    });
    laMock.mockResolvedValue({
      data: {
        data: {
          ...BASE,
          laws: [{ law: 'dsgvo', expression: 'dsgvo', state: 'applicable', reason: 'Binds …',
            provisionsBinding: 1, bindingProvisionEIds: ['dsgvo:art-33'],
            provisionsTyped: 78, provisionsTotal: 99 }],
        },
      },
    });
    mount();
    await waitFor(() => expect(screen.getByText('dsgvo')).toBeInTheDocument());
    fireEvent.click(screen.getByText('dsgvo'));
    fireEvent.click(await screen.findByRole('button', { name: /dsgvo:art-33/ }));

    await waitFor(() => expect(screen.getByTestId('article-preview')).toBeInTheDocument());
    expect(getSection).toHaveBeenCalledWith('p1', 'corpus:dsgvo', 'dsgvo:art-33');
    expect(await screen.findByText(/Verletzung des Schutzes personenbezogener Daten/)).toBeInTheDocument();
  });

  test('a failed article lookup says so instead of showing an empty box', async () => {
    const getSection = normsAPI.getSection as ReturnType<typeof vi.fn>;
    getSection.mockRejectedValue(new Error('corpus down'));
    laMock.mockResolvedValue({
      data: {
        data: {
          ...BASE,
          laws: [{ law: 'dora', expression: 'dora', state: 'applicable', reason: 'Binds …',
            provisionsBinding: 1, bindingProvisionEIds: ['dora:art-5'], provisionsTyped: 56, provisionsTotal: 63 }],
        },
      },
    });
    mount();
    await waitFor(() => expect(screen.getByText('dora')).toBeInTheDocument());
    fireEvent.click(screen.getByText('dora'));
    fireEvent.click(await screen.findByRole('button', { name: /dora:art-5/ }));
    expect(await screen.findByText(/Could not load the article text/i)).toBeInTheDocument();
  });

  test('an applicable law with NO binding list renders no empty article block', async () => {
    // Negativ-Kontrolle der Fläche: fehlende Liste darf nicht als leere Liste
    // erscheinen — ein leerer Kasten liest sich wie „nichts bindet dich".
    laMock.mockResolvedValue({
      data: {
        data: {
          ...BASE,
          laws: [{ law: 'lksg', expression: 'lksg', state: 'undetermined', reason: 'No consumable typing …', provisionsTyped: 0, provisionsTotal: 24 }],
        },
      },
    });
    mount();
    await waitFor(() => expect(screen.getByText('lksg')).toBeInTheDocument());
    fireEvent.click(screen.getByText('lksg'));
    expect(screen.queryByTestId('binding-provisions')).not.toBeInTheDocument();
  });
});
