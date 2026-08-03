// @vitest-environment jsdom
/**
 * THE-565 AC 1 in der Fläche: je Klausel Anforderungszahl + Coverage-Ampel;
 * die Lücke ist sichtbar, Legacy ehrlich getrennt, leer ist gültig.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../services/api', () => ({
  traceAPI: { forward: vi.fn(), driftCheck: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));
vi.mock('react-router-dom', () => ({ useParams: () => ({ projectId: 'p1' }) }));

import { traceAPI } from '../../services/api';
import toast from 'react-hot-toast';
import ClauseCoveragePanel from './ClauseCoveragePanel';

const forward = vi.mocked(traceAPI.forward);

beforeEach(() => vi.clearAllMocks());

test('renders per-clause coverage with uncovered flag and the honest legacy hint', async () => {
  forward.mockResolvedValue({
    data: {
      success: true,
      data: {
        norms: [
          {
            regulationKey: 'nis2:art23',
            clauses: [
              {
                contentId: 'aaaa19b2c4d5e6f7',
                clausePath: 'Abs. 1',
                clauseText: 'Die Einrichtungen übermitteln eine Frühwarnung.',
                requirements: [{ id: 'r1', title: 'Frühwarnung senden', priority: 'must' }],
                linkedElementIds: ['el-1'],
              },
              {
                contentId: 'bbbb19b2c4d5e6f7',
                clausePath: 'Abs. 2',
                clauseText: 'Die Einrichtungen legen einen Abschlussbericht vor.',
                requirements: [{ id: 'r2', title: 'Bericht vorlegen', priority: 'must' }],
                linkedElementIds: [],
              },
            ],
          },
        ],
        withoutClauseAnchor: { count: 2, requirementIds: ['x', 'y'] },
      },
    },
  } as never);

  render(<ClauseCoveragePanel />);
  await waitFor(() => expect(screen.getAllByTestId('clause-row')).toHaveLength(2));

  expect(screen.getByText('nis2:art23')).toBeInTheDocument();
  expect(screen.getByText('uncovered')).toBeInTheDocument(); // die Lücke ist der Punkt
  expect(screen.getByText(/1 element/)).toBeInTheDocument();
  expect(screen.getByTestId('without-anchor-hint').textContent).toMatch(/2 legacy requirements without clause anchor/);
});

test('an empty state is a valid result, not an error', async () => {
  forward.mockResolvedValue({
    data: { success: true, data: { norms: [], withoutClauseAnchor: { count: 0, requirementIds: [] } } },
  } as never);

  render(<ClauseCoveragePanel />);
  await waitFor(() => expect(screen.getByText(/No chain requirements yet/)).toBeInTheDocument());
});

// ─── THE-575: der Lauf verschweigt nicht, was er nicht angesehen hat ──────
//
// Der Bericht meldete am echten Bestand `{checked: 2, skipped: 0}` bei 15
// Ketten-Anforderungen. Ein Nutzer las „2 geprüft, 0 veraltet" und durfte
// glauben, sein Bestand sei durchgesehen. 13 waren nie im Blick.
test('THE-575: the drift toast names what it could NOT examine', async () => {
  forward.mockResolvedValue({
    data: { success: true, data: { norms: [], withoutClauseAnchor: { count: 0, requirementIds: [] } } },
  } as never);
  vi.mocked(traceAPI.driftCheck).mockResolvedValue({
    data: { success: true, data: { checked: 2, staled: 0, skipped: 0, unanchored: 13, evidenceStaled: 0, attestedReset: 0 } },
  } as never);

  render(<ClauseCoveragePanel />);
  await waitFor(() => expect(screen.getByRole('button', { name: /drift check/i })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /drift check/i }));

  await waitFor(() => expect(toast.success).toHaveBeenCalled());
  const msg = vi.mocked(toast.success).mock.calls[0][0] as string;
  expect(msg).toMatch(/2 checked/);
  // DIE Zeile: ohne sie liest sich der Bericht wie „alles geprüft".
  expect(msg).toMatch(/13 not checkable/i);
});

test('THE-575 NEGATIV-KONTROLLE: nothing checkable does not look like nothing to do', async () => {
  forward.mockResolvedValue({
    data: { success: true, data: { norms: [], withoutClauseAnchor: { count: 0, requirementIds: [] } } },
  } as never);
  vi.mocked(traceAPI.driftCheck).mockResolvedValue({
    data: { success: true, data: { checked: 0, staled: 0, skipped: 0, unanchored: 15, evidenceStaled: 0, attestedReset: 0 } },
  } as never);

  render(<ClauseCoveragePanel />);
  await waitFor(() => expect(screen.getByRole('button', { name: /drift check/i })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /drift check/i }));

  await waitFor(() => expect(toast.success).toHaveBeenCalled());
  const msg = vi.mocked(toast.success).mock.calls[0][0] as string;
  // „0 geprüft, 0 veraltet" allein wäre von „alles in Ordnung" nicht zu unterscheiden.
  expect(msg).toMatch(/15 not checkable/i);
});
