// @vitest-environment jsdom
/**
 * UC-GAP-001 (THE-307) — GapAnalysis view + complianceStore.gaps slice.
 * Covers AC-4 (global overview KPIs), AC-7 (empty state), AC-2 (item fields),
 * AC-6 (CSV export content) and the store slice load path (AC-8).
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/api')>();
  return {
    ...original,
    requirementsAPI: {
      ...original.requirementsAPI,
      gaps: vi.fn(),
      update: vi.fn(),
    },
  };
});
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

import { requirementsAPI, type GapItem, type GapsSummary } from '../../services/api';
import { useComplianceStore } from '../../stores/complianceStore';
import GapAnalysis, { buildGapsCsv } from './GapAnalysis';

const gapsMock = vi.mocked(requirementsAPI.gaps);

function gapItem(partial: Partial<GapItem> & Pick<GapItem, '_id' | 'title' | 'priority' | 'status'>): GapItem {
  return {
    regulationId: 'reg-1',
    regulationTitle: 'LkSG',
    description: 'desc',
    linkedElementIds: ['el-1'],
    ageDays: 3,
    createdBy: 'human',
    createdAt: '2026-06-01T00:00:00Z',
    ...partial,
  };
}

function summary(partial: Partial<GapsSummary> = {}): GapsSummary {
  return {
    total: 0,
    open: 0,
    inProgress: 0,
    done: 0,
    waived: 0,
    openMust: 0,
    unlinked: 0,
    byRegulation: [],
    topElements: [],
    ...partial,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/project/p1/compliance/gaps']}>
      <Routes>
        <Route path="/project/:projectId/compliance/:section" element={<GapAnalysis />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useComplianceStore.setState({ gaps: [], gapsSummary: null, isLoadingGaps: false });
});

describe('buildGapsCsv (AC-6)', () => {
  test('renders header + rows and escapes commas/quotes', () => {
    const csv = buildGapsCsv([
      gapItem({ _id: '1', title: 'Simple requirement', priority: 'must', status: 'open' }),
      gapItem({ _id: '2', title: 'Has, comma and "quote"', priority: 'may', status: 'in_progress', ageDays: 7 }),
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Regulation,Requirement,Priority,Status,Age (days),Linked elements');
    expect(lines[1]).toBe('LkSG,Simple requirement,must,open,3,1');
    expect(lines[2]).toBe('LkSG,"Has, comma and ""quote""",may,in_progress,7,1');
  });
});

describe('GapAnalysis view', () => {
  test('shows the all-fulfilled empty state when no open items remain (AC-7)', async () => {
    gapsMock.mockResolvedValue({
      data: { success: true, data: { items: [gapItem({ _id: '1', title: 'Closed one', priority: 'must', status: 'done' })], summary: summary({ total: 1, done: 1 }) } },
    } as never);

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('gap-empty-state')).toBeInTheDocument();
    });
    expect(screen.getByText('All requirements fulfilled — no gaps.')).toBeInTheDocument();
  });

  test('renders KPIs, per-regulation breakdown and open items (AC-2, AC-4)', async () => {
    gapsMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          items: [
            gapItem({ _id: '1', title: 'Conduct risk analysis', priority: 'must', status: 'open', ageDays: 12, linkedElementIds: [] }),
            gapItem({ _id: '2', title: 'Publish policy statement', priority: 'should', status: 'in_progress' }),
          ],
          summary: summary({
            total: 9,
            open: 4,
            inProgress: 1,
            done: 4,
            openMust: 2,
            unlinked: 1,
            byRegulation: [
              { regulationId: 'reg-1', regulationTitle: 'LkSG', total: 9, open: 5, done: 4, openMust: 2, pctOpen: 56 },
            ],
            topElements: [{ elementId: 'el-1', open: 3, openMust: 2 }],
          }),
        },
      },
    } as never);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('gap-kpis')).toBeInTheDocument();
    });
    // KPI: open = open + inProgress = 5; MUST = 2
    expect(screen.getByText('5 of 9 open (56%)')).toBeInTheDocument();
    // AC-2: item fields — age + unlinked marker
    expect(screen.getByText('Conduct risk analysis')).toBeInTheDocument();
    expect(screen.getByText('12d old')).toBeInTheDocument();
    expect(screen.getByText('unlinked')).toBeInTheDocument();
    // Cross-link to remediation (AC-5)
    expect(screen.getAllByText('Remediate').length).toBeGreaterThan(0);
    // must sorts before should (display sort)
    const titles = screen.getAllByText(/Conduct risk analysis|Publish policy statement/).map((n) => n.textContent);
    expect(titles[0]).toBe('Conduct risk analysis');
  });

  test('store slice: loadGaps populates gaps + summary; error clears loading (AC-8)', async () => {
    gapsMock.mockResolvedValueOnce({
      data: { success: true, data: { items: [gapItem({ _id: '1', title: 'One requirement', priority: 'must', status: 'open' })], summary: summary({ total: 1, open: 1, openMust: 1 }) } },
    } as never);

    await useComplianceStore.getState().loadGaps('p1');
    expect(useComplianceStore.getState().gaps).toHaveLength(1);
    expect(useComplianceStore.getState().gapsSummary?.openMust).toBe(1);
    expect(useComplianceStore.getState().isLoadingGaps).toBe(false);

    gapsMock.mockRejectedValueOnce(new Error('boom'));
    await useComplianceStore.getState().loadGaps('p1');
    expect(useComplianceStore.getState().isLoadingGaps).toBe(false);
    expect(useComplianceStore.getState().error).toBe('boom');
  });
});
