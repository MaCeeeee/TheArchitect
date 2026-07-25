// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// ─── api mock ───
const list = vi.fn();
const getStats = vi.fn();
const health = vi.fn();
const getRisk = vi.fn();
const getCost = vi.fn();
const getPortfolio = vi.fn();
vi.mock('../services/api', () => ({
  projectAPI: { list: (...a: unknown[]) => list(...a), getStats: (...a: unknown[]) => getStats(...a) },
  advisorAPI: { health: (...a: unknown[]) => health(...a) },
  analyticsAPI: { getRisk: (...a: unknown[]) => getRisk(...a), getCost: (...a: unknown[]) => getCost(...a) },
  compliancePipelineAPI: { getPortfolio: (...a: unknown[]) => getPortfolio(...a) },
}));

// stores touched during a fetch — stub the mutations
import { useArchitectureStore } from '../stores/architectureStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { usePortfolioData, __resetPortfolioCacheForTests } from './usePortfolioData';

const ok = (data: unknown) => Promise.resolve({ data });

beforeEach(() => {
  __resetPortfolioCacheForTests();
  list.mockReset().mockReturnValue(ok([{ _id: 'p1', name: 'Alpha' }, { _id: 'p2', name: 'Beta' }]));
  getStats.mockReset().mockReturnValue(ok({ elementCount: 1, connectionCount: 0, currentPhase: 1, healthScore: 80 }));
  health.mockReset().mockReturnValue(ok({ total: 80, trend: 'stable', trendDelta: 0, factors: [] }));
  getRisk.mockReset().mockReturnValue(ok({ summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, averageScore: 0 } }));
  getCost.mockReset().mockReturnValue(ok({ totalCost: 0, optimizationTotal: 0, byCategory: {}, byStatus: {} }));
  getPortfolio.mockReset().mockReturnValue(ok({ totalStandards: 0, trackedStandards: 0, portfolio: [] }));
  useArchitectureStore.setState({ clearProject: vi.fn() } as never);
  useWorkspaceStore.setState({ setWorkspaces: vi.fn() } as never);
});

describe('usePortfolioData — remount-safe fetch (THE-512)', () => {
  test('loads and enriches all projects on first mount', async () => {
    const { result } = renderHook(() => usePortfolioData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.projects).toHaveLength(2);
    expect(list).toHaveBeenCalledTimes(1);
    // advisor/health fired once per project — the expensive call we must not multiply
    expect(health).toHaveBeenCalledTimes(2);
  });

  test('REGRESSION: a remount within TTL reuses the cache and fires NO new network', async () => {
    const first = renderHook(() => usePortfolioData());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(list).toHaveBeenCalledTimes(1);
    expect(health).toHaveBeenCalledTimes(2);

    first.unmount();

    // Simulate the WebGL-context-loss remount storm: mount again immediately.
    const second = renderHook(() => usePortfolioData());
    // Cache is warm → data available synchronously, no loading flash, no refetch.
    await waitFor(() => expect(second.result.current.projects).toHaveLength(2));
    expect(list).toHaveBeenCalledTimes(1);   // still ONE — the fix
    expect(health).toHaveBeenCalledTimes(2); // advisor scan not re-run
  });

  test('two concurrent mounts dedupe to a single in-flight fetch', async () => {
    const a = renderHook(() => usePortfolioData());
    const b = renderHook(() => usePortfolioData());
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    expect(list).toHaveBeenCalledTimes(1);
    expect(health).toHaveBeenCalledTimes(2);
  });

  test('refresh() forces a fresh fetch past the cache', async () => {
    const { result } = renderHook(() => usePortfolioData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(list).toHaveBeenCalledTimes(1);

    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  test('surfaces a load failure as error', async () => {
    __resetPortfolioCacheForTests();
    list.mockReturnValue(Promise.reject(new Error('boom')));
    const { result } = renderHook(() => usePortfolioData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed to load projects');
  });
});
