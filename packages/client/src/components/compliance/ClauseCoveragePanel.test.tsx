// @vitest-environment jsdom
/**
 * THE-565 AC 1 in der Fläche: je Klausel Anforderungszahl + Coverage-Ampel;
 * die Lücke ist sichtbar, Legacy ehrlich getrennt, leer ist gültig.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../services/api', () => ({
  traceAPI: { forward: vi.fn(), driftCheck: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));
vi.mock('react-router-dom', () => ({ useParams: () => ({ projectId: 'p1' }) }));

import { traceAPI } from '../../services/api';
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
