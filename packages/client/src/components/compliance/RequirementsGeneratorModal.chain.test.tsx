// @vitest-environment jsdom
/**
 * ADR-0008 Phase 1 (THE-562 AC 3) — die Ketten-Sichtbarkeit im Generator:
 * Engine-Badge, Quoten-Zeile und der gemessene Fehlerrest-Satz stehen in der
 * Fläche, nicht in einer Fußnote.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../services/api', () => ({
  requirementsAPI: {
    generate: vi.fn(),
    confirm: vi.fn(),
    projectToModel: vi.fn(),
  },
  regulationsAPI: { create: vi.fn() },
  // THE-570: der Dialog laedt die Korpus-Gesetze beim Oeffnen.
  normsAPI: { list: vi.fn().mockResolvedValue({ data: { data: [], available: [] } }), getSection: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));
vi.mock('../../stores/architectureStore', () => ({
  useArchitectureStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ projectId: 'p1', elements: [], setElements: () => {}, setConnections: () => {} }),
}));

import { requirementsAPI } from '../../services/api';
import RequirementsGeneratorModal from './RequirementsGeneratorModal';

const generate = vi.mocked(requirementsAPI.generate);

beforeEach(() => vi.clearAllMocks());

test('shows chain stats and the measured error-rest sentence after a chain generate', async () => {
  generate.mockResolvedValue({
    data: {
      success: true,
      data: {
        engine: 'chain',
        regulation: { source: 'nis2', paragraphNumber: 'Art. 23' },
        requirements: [
          {
            title: 'Meldung übermitteln',
            description: 'Das Unternehmen meldet Sicherheitsvorfälle fristgerecht.',
            priority: 'must',
            linkedElementIds: [],
            chain: {
              regulationKey: 'nis2:art23',
              clauseContentId: 'a3f19b2c4d5e6f70',
              clauseText: 'Die Einrichtungen übermitteln … eine Meldung.',
              stakeholderRequirement: {
                text: 'Das Unternehmen übermittelt eine Meldung an das CSIRT.',
                slots: { action: 'Meldung übermitteln', recipient: 'CSIRT', modality: 'pflicht', condition: '' },
                kind: 'requirement',
                deadline: null,
              },
              systemRequirement: {
                text: 'Das Unternehmen meldet Sicherheitsvorfälle fristgerecht.',
                schutzgut: 'Netzsysteme',
                verpflichteter: 'wesentliche Einrichtung',
                ausloeser: 'Vorfall',
                nachweis: 'Meldung',
                implementationFree: true,
              },
            },
          },
        ],
        chainStats: {
          clauses: 3,
          unreadableExtractions: 0,
          splitCount: 1,
          clausesWithoutRequirement: 1,
          implFreedomViolations: 1,
          unreadableSysReqs: 0,
        },
      },
    },
  } as never);

  render(<RequirementsGeneratorModal isOpen onClose={() => {}} />);

  fireEvent.change(screen.getByPlaceholderText(/paste/i), {
    target: { value: 'Die Einrichtungen übermitteln binnen 72 Stunden nach Kenntnisnahme eine Meldung an das CSIRT.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));

  await waitFor(() => expect(screen.getByTestId('chain-stats')).toBeInTheDocument());
  expect(screen.getByTestId('chain-stats').textContent).toMatch(/3 clauses/);
  expect(screen.getByTestId('chain-stats').textContent).toMatch(/1 rejected \(implementation-bound\)/);
  expect(screen.getByText(/68\.8% agreement/)).toBeInTheDocument();
});

test('no chain stats box for a legacy (reqgen) response', async () => {
  generate.mockResolvedValue({
    data: { success: true, data: { regulation: {}, requirements: [] } },
  } as never);

  render(<RequirementsGeneratorModal isOpen onClose={() => {}} />);
  fireEvent.change(screen.getByPlaceholderText(/paste/i), {
    target: { value: 'Ein ausreichend langer Absatz ohne Ketten-Engine für den Legacy-Pfad des Generators.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));

  await waitFor(() => expect(generate).toHaveBeenCalled());
  expect(screen.queryByTestId('chain-stats')).not.toBeInTheDocument();
});

test('a chain candidate shows chain provenance instead of misleading 0.00 scores', async () => {
  generate.mockResolvedValue({
    data: {
      success: true,
      data: {
        engine: 'chain',
        regulation: { source: 'nis2', paragraphNumber: 'Art. 23' },
        requirements: [
          {
            title: 'Meldung übermitteln',
            description: 'Das Unternehmen meldet Sicherheitsvorfälle fristgerecht.',
            priority: 'must',
            linkedElementIds: [],
            chain: {
              regulationKey: 'nis2:art23',
              clauseContentId: 'a3f19b2c4d5e6f70',
              clausePath: 'Abs. 2',
              clauseText: 'Die Einrichtungen übermitteln … eine Meldung.',
              stakeholderRequirement: {
                text: 'Das Unternehmen übermittelt eine Meldung an das CSIRT.',
                slots: { action: 'Meldung übermitteln', recipient: 'CSIRT', modality: 'pflicht', condition: '' },
                kind: 'requirement',
                deadline: null,
              },
              systemRequirement: {
                text: 'Das Unternehmen meldet Sicherheitsvorfälle fristgerecht.',
                schutzgut: 'Netzsysteme', verpflichteter: 'wesentliche Einrichtung',
                ausloeser: 'Vorfall', nachweis: 'Meldung', implementationFree: true,
              },
            },
          },
        ],
        chainStats: { clauses: 1, unreadableExtractions: 0, splitCount: 0, clausesWithoutRequirement: 0, implFreedomViolations: 0, unreadableSysReqs: 0 },
      },
    },
  } as never);

  render(<RequirementsGeneratorModal isOpen onClose={() => {}} />);
  fireEvent.change(screen.getByPlaceholderText(/paste/i), {
    target: { value: 'Die Einrichtungen übermitteln binnen 72 Stunden nach Kenntnisnahme eine Meldung an das CSIRT.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));
  await waitFor(() => expect(screen.getByTestId('chain-provenance')).toBeInTheDocument());
  expect(screen.getByTestId('chain-provenance').textContent).toMatch(/Abs\. 2/);
  expect(screen.queryByText(/Extraction/)).not.toBeInTheDocument(); // keine 0.00-Pille bei chain
});

// ─── THE-570: Korpus-Auswahl statt Kopieren-und-Einfuegen ───────────────
import { normsAPI } from '../../services/api';
const normsList = vi.mocked(normsAPI.list);
const getSection = vi.mocked(normsAPI.getSection);

const corpusNorms = {
  data: [],
  available: [
    { identity: { workId: 'corpus:nis2', expressionLanguage: 'en' }, source: 'corpus', title: 'nis2', sectionCount: 46,
      sections: [{ eId: 'nis2:art23', number: 'Art. 23', heading: 'Meldepflichten' }] },
    { identity: { workId: 'corpus:nis2-de', expressionLanguage: 'de' }, source: 'corpus', title: 'nis2-de', sectionCount: 46,
      sections: [{ eId: 'nis2-de:art23', number: 'Art. 23', heading: 'Berichtspflichten' }] },
    { identity: { workId: 'corpus:lksg', expressionLanguage: 'de' }, source: 'corpus', title: 'lksg', sectionCount: 24,
      sections: [{ eId: 'lksg:p6', number: '§ 6', heading: 'Praeventionsmassnahmen' }] },
  ],
};

test('THE-570: picking a law from the corpus loads its articles and previews the text read-only', async () => {
  normsList.mockResolvedValue({ data: corpusNorms } as never);
  getSection.mockResolvedValue({
    data: { success: true, data: { eId: 'nis2-de:art23', heading: 'Berichtspflichten', number: 'Art. 23',
      text: 'Die Einrichtungen uebermitteln binnen 24 Stunden eine Fruehwarnung.', expressionLanguage: 'de' } },
  } as never);

  render(<RequirementsGeneratorModal isOpen onClose={() => {}} />);
  const sourceSelect = await screen.findByRole('combobox', { name: /source/i }).catch(() => screen.getAllByRole('combobox')[0]);
  await waitFor(() => expect(within(sourceSelect as HTMLElement).getByText('NIS2')).toBeInTheDocument());

  fireEvent.change(sourceSelect as HTMLElement, { target: { value: 'nis2' } });
  await waitFor(() => expect(screen.getByTestId('section-select')).toBeInTheDocument());

  fireEvent.change(screen.getByTestId('section-select'), { target: { value: 'nis2-de:art23' } });
  await waitFor(() =>
    expect((screen.getByTestId('regulation-text') as HTMLTextAreaElement).value).toMatch(/Fruehwarnung/),
  );
  // Vorschau ist schreibgeschuetzt — der Text kommt aus dem Korpus, nicht aus der Tastatur.
  expect((screen.getByTestId('regulation-text') as HTMLTextAreaElement).readOnly).toBe(true);
  // Und der Anker-Hinweis erscheint NICHT, weil es einen Anker gibt.
  expect(screen.queryByTestId('no-anchor-hint')).not.toBeInTheDocument();
});

// ─── Produktionsfehler 03.08.: „source must be one of …" ────────────────
//
// Der Gruppenschlüssel der Auswahl ist eine ANZEIGE-Konstruktion (der
// gemeinsame Wortstamm zweier Sprachfassungen), KEINE Normquelle. Beim AI Act
// heißt der Stamm `ai-act` — den gibt es als Quelle nicht, es gibt nur
// `ai-act-de` und `ai-act-en`. Das Speichern brach mit 400 ab.
//
// WARUM DIE BESTEHENDEN TESTS DAS DURCHLIESSEN: Die Fixture kannte nur `nis2`
// und `lksg`. Deren Stamm IST zufällig eine gültige Quelle — der Fehler war
// unsichtbar, solange niemand ein Gesetz mit Sprach-Suffix in BEIDEN Fassungen
// speicherte. Deshalb steht der AI Act ab jetzt in der Fixture.
import { regulationsAPI } from '../../services/api';

test('THE-570 regression: saving uses the resolved norm source, not the display group key', async () => {
  normsList.mockResolvedValue({
    data: {
      data: [],
      available: [
        { identity: { workId: 'corpus:ai-act-de', expressionLanguage: 'de' }, source: 'corpus', title: 'ai-act-de', sectionCount: 113,
          sections: [{ eId: 'ai-act-de:art-50', number: 'Art. 50', heading: 'Transparenzpflichten' }] },
        { identity: { workId: 'corpus:ai-act-en', expressionLanguage: 'en' }, source: 'corpus', title: 'ai-act-en', sectionCount: 112,
          sections: [{ eId: 'ai-act-en:art-50', number: 'Art. 50', heading: 'Transparency obligations' }] },
      ],
    },
  } as never);
  getSection.mockResolvedValue({
    data: { success: true, data: { eId: 'ai-act-de:art-50', heading: 'Transparenzpflichten', number: 'Art. 50',
      text: 'Das Unternehmen muss offenlegen, dass Text kuenstlich erzeugt oder manipuliert wurde, bevor er verbreitet wird.',
      expressionLanguage: 'de' } },
  } as never);
  generate.mockResolvedValue({
    data: { success: true, data: { engine: 'chain', regulation: { source: 'ai-act-de', paragraphNumber: 'Art. 50' },
      requirements: [{ title: 'offenlegen, dass Text kuenstlich erzeugt wurde',
        description: 'Das Unternehmen muss der Oeffentlichkeit offenlegen, dass Text kuenstlich erzeugt wurde.',
        priority: 'must', linkedElementIds: [] }] } },
  } as never);
  vi.mocked(regulationsAPI.create).mockResolvedValue({ data: { data: { _id: 'reg1' } } } as never);
  vi.mocked(requirementsAPI.confirm).mockResolvedValue({ data: { success: true, data: [] } } as never);

  render(<RequirementsGeneratorModal isOpen onClose={() => {}} />);
  const sourceSelect = screen.getAllByRole('combobox')[0];
  await waitFor(() => expect(within(sourceSelect).getByText('AI-ACT')).toBeInTheDocument());

  // Der Nutzer wählt „AI-ACT" — der Optionswert ist der Gruppenschlüssel.
  fireEvent.change(sourceSelect, { target: { value: 'ai-act' } });
  await waitFor(() => expect(screen.getByTestId('section-select')).toBeInTheDocument());
  fireEvent.change(screen.getByTestId('section-select'), { target: { value: 'ai-act-de:art-50' } });
  await waitFor(() => expect((screen.getByTestId('regulation-text') as HTMLTextAreaElement).value).toMatch(/kuenstlich/));

  fireEvent.click(screen.getByRole('button', { name: /generate/i }));
  await waitFor(() => expect(screen.getByRole('button', { name: /save 1 requirement/i })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /save 1 requirement/i }));

  await waitFor(() => expect(regulationsAPI.create).toHaveBeenCalled());
  const body = vi.mocked(regulationsAPI.create).mock.calls[0][1] as { source: string; title: string };
  // DIE Zeile: `ai-act` waere keine Normquelle und der Server antwortet 400.
  expect(body.source).toBe('ai-act-de');
  expect(body.title).toMatch(/AI-ACT-DE/);
});

test('THE-570: a law with only one language version says so instead of loading the wrong one', async () => {
  normsList.mockResolvedValue({ data: corpusNorms } as never);
  render(<RequirementsGeneratorModal isOpen onClose={() => {}} />);
  const sourceSelect = screen.getAllByRole('combobox')[0];
  await waitFor(() => expect(within(sourceSelect).getByText('LKSG')).toBeInTheDocument());

  // Dialog steht auf Deutsch, LkSG existiert nur deutsch → kein Hinweis noetig.
  fireEvent.change(sourceSelect, { target: { value: 'lksg' } });
  await waitFor(() => expect(screen.getByTestId('section-select')).toBeInTheDocument());
  expect(screen.queryByTestId('lang-hint')).not.toBeInTheDocument();
});
