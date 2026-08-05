// @vitest-environment jsdom
/**
 * THE-569 AC 1+2+3 in der Fläche: expliziter Aufruf, Quoten + Fehlerrest-Satz
 * sichtbar, verdrängte Paare als eigener Fall, Confirm erst nach Element-Wahl.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../services/api', () => ({
  harmonizationAPI: { propose: vi.fn(), confirm: vi.fn(), candidates: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));
vi.mock('react-router-dom', () => ({
  useParams: () => ({ projectId: 'p1' }),
}));

import { harmonizationAPI } from '../../services/api';
import SharedMeasuresPanel from './SharedMeasuresPanel';

const propose = vi.mocked(harmonizationAPI.propose);
const candidates = vi.mocked(harmonizationAPI.candidates);

const preview = {
  total: 3, candidatePairs: 2, excludedByDisplacement: 1,
  cap: 50, wouldCap: 0, needsClassification: 0, unmappedAddressee: 0,
  selectionOrder: 'id-ascending' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  candidates.mockResolvedValue({ data: { success: true, data: preview } } as never);
});

const proposeResult = {
  grouping: {
    measures: [{ id: 'm1', memberIds: ['s1', 's2'], laws: ['nis2', 'dsgvo'] }],
    excludedByDisplacement: [
      {
        a: 's1', b: 's3', displaced: 'nis2', prevailing: 'dora',
        citations: ['DORA Art. 1 Abs. 2 — lex specialis zur NIS2-Richtlinie'],
      },
    ],
    cappedPairs: 0,
  },
  memberDetails: [
    { systemRequirementId: 's1', requirementId: 'r1', title: 'Meldung übermitteln (NIS2)', linkedElementIds: ['el-shared'] },
    { systemRequirementId: 's2', requirementId: 'r2', title: 'Meldung übermitteln (DSGVO)', linkedElementIds: [] },
  ],
  stats: { total: 3, unmappedAddressee: 0, unclassified: 0, pairsJudged: 2, addresseeFromCorpus: 0, addresseeFromLexicon: 3 },
};

/** Ein Lauf, der gekappt hat: 2 von 9 Kandidaten geurteilt. */
const cappedResult = {
  ...proposeResult,
  grouping: { ...proposeResult.grouping, cappedPairs: 7, candidatePairs: 9, selectionOrder: 'id-ascending' as const },
  stats: { ...proposeResult.stats, pairsJudged: 2 },
};

test('shows candidates, displaced pairs, quotas and the error-rest sentence; confirm needs an element', async () => {
  propose.mockResolvedValue({ data: { success: true, data: proposeResult } } as never);

  render(<SharedMeasuresPanel />);
  expect(screen.getByText(/68\.8% agreement/)).toBeInTheDocument(); // Satz steht VOR dem Lauf in der Fläche

  fireEvent.click(screen.getByRole('button', { name: /propose shared measures/i }));
  await waitFor(() => expect(screen.getByTestId('measure-candidate')).toBeInTheDocument());

  expect(screen.getByTestId('harmonization-stats').textContent).toMatch(/2 pairs judged/);
  expect(screen.getByTestId('displacement-info').textContent).toMatch(/DORA displaces NIS2/);
  expect(screen.getByText(/Meldung übermitteln \(NIS2\)/)).toBeInTheDocument();

  const confirmBtn = screen.getByRole('button', { name: /confirm sharing/i });
  expect(confirmBtn).toBeDisabled(); // ohne Element-Wahl kein Confirm — der Mensch wählt

  fireEvent.change(screen.getByLabelText(/shared element/i), { target: { value: 'el-shared' } });
  expect(confirmBtn).not.toBeDisabled();
});

test('a group whose members have no linked element gets the link-first hint instead of a confirm', async () => {
  propose.mockResolvedValue({
    data: {
      success: true,
      data: {
        ...proposeResult,
        memberDetails: proposeResult.memberDetails.map((d) => ({ ...d, linkedElementIds: [] })),
      },
    },
  } as never);

  render(<SharedMeasuresPanel />);
  fireEvent.click(screen.getByRole('button', { name: /propose shared measures/i }));
  await waitFor(() => expect(screen.getByTestId('link-first-hint')).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /confirm sharing/i })).not.toBeInTheDocument();
});


/**
 * THE-590 Slice 1 — die Fläche sagt den Umfang VOR dem Lauf und die
 * Unvollständigkeit NACH ihm.
 *
 * Der Kern von AC-3: Ein gekappter Lauf, der nichts gefunden hat, darf nicht
 * „that is a valid result" sagen. Ein leeres Ergebnis aus einem
 * abgeschnittenen Lauf ist kein Befund, sondern eine Nichtaussage — und der
 * Unterschied entscheidet, ob ein Mensch dem Vorschlag trauen darf.
 */
describe('THE-590 — Umfang vorher, Unvollständigkeit nachher', () => {
  test('announces the scope BEFORE the run — the human decides knowing the cost', async () => {
    render(<SharedMeasuresPanel />);
    await waitFor(() => expect(screen.getByTestId('candidate-preview')).toBeInTheDocument());
    expect(screen.getByTestId('candidate-preview').textContent).toMatch(/2 candidate pairs/i);
    expect(propose).not.toHaveBeenCalled(); // die Vorschau loest den teuren Lauf NICHT aus
  });

  test('warns in the preview when the cap would bite', async () => {
    candidates.mockResolvedValue({
      data: { success: true, data: { ...preview, candidatePairs: 9, wouldCap: 7 } },
    } as never);
    render(<SharedMeasuresPanel />);
    await waitFor(() => expect(screen.getByTestId('candidate-preview').textContent).toMatch(/7 .*not be judged/i));
  });

  test('names what it could not place — the count is a floor, not a promise', async () => {
    candidates.mockResolvedValue({
      data: { success: true, data: { ...preview, needsClassification: 4 } },
    } as never);
    render(<SharedMeasuresPanel />);
    await waitFor(() => expect(screen.getByTestId('candidate-preview').textContent).toMatch(/4 .*classified/i));
  });

  test('flags a capped run as incomplete, and says by what it selected', async () => {
    propose.mockResolvedValue({ data: { success: true, data: cappedResult } } as never);
    render(<SharedMeasuresPanel />);
    fireEvent.click(screen.getByRole('button', { name: /propose shared measures/i }));

    await waitFor(() => expect(screen.getByTestId('incomplete-run')).toBeInTheDocument());
    const banner = screen.getByTestId('incomplete-run').textContent ?? '';
    expect(banner).toMatch(/2 of 9/);
    expect(banner).toMatch(/id order/i);
    expect(banner).toMatch(/not a ranking/i);
  });

  test('does NOT flag a complete run — a warning that always shows is not read', async () => {
    propose.mockResolvedValue({ data: { success: true, data: proposeResult } } as never);
    render(<SharedMeasuresPanel />);
    fireEvent.click(screen.getByRole('button', { name: /propose shared measures/i }));

    await waitFor(() => expect(screen.getByTestId('measure-candidate')).toBeInTheDocument());
    expect(screen.queryByTestId('incomplete-run')).not.toBeInTheDocument();
  });

  // AC-3, der wichtigste Fall: leer WEIL gekappt ist kein Befund.
  test('an empty capped run is a non-statement, not a valid result', async () => {
    propose.mockResolvedValue({
      data: { success: true, data: { ...cappedResult, grouping: { ...cappedResult.grouping, measures: [] }, memberDetails: [] } },
    } as never);
    render(<SharedMeasuresPanel />);
    fireEvent.click(screen.getByRole('button', { name: /propose shared measures/i }));

    await waitFor(() => expect(screen.getByTestId('incomplete-run')).toBeInTheDocument());
    expect(screen.queryByText(/that is a valid result/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('empty-because-capped')).toBeInTheDocument();
  });

  test('an empty COMPLETE run still reports a valid result', async () => {
    propose.mockResolvedValue({
      data: { success: true, data: { ...proposeResult, grouping: { ...proposeResult.grouping, measures: [], candidatePairs: 2 }, memberDetails: [] } },
    } as never);
    render(<SharedMeasuresPanel />);
    fireEvent.click(screen.getByRole('button', { name: /propose shared measures/i }));

    await waitFor(() => expect(screen.getByText(/that is a valid result/i)).toBeInTheDocument());
    expect(screen.queryByTestId('empty-because-capped')).not.toBeInTheDocument();
  });
});
