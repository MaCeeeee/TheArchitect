// @vitest-environment jsdom
/**
 * THE-569 AC 1+2+3 in der Fläche: expliziter Aufruf, Quoten + Fehlerrest-Satz
 * sichtbar, verdrängte Paare als eigener Fall, Confirm erst nach Element-Wahl.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../services/api', () => ({
  harmonizationAPI: { propose: vi.fn(), confirm: vi.fn() },
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

beforeEach(() => vi.clearAllMocks());

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
  stats: { total: 3, unmappedAddressee: 0, unclassified: 0, pairsJudged: 2 },
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
