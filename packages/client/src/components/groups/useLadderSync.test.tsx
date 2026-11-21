// @vitest-environment jsdom
/**
 * UC-METH-002 (REQ .4) — the ladder is loaded per project without the advisor panel, and again
 * after the model changes its number of elements or relationships.
 * Run: cd packages/client && npx vitest run src/components/groups/useLadderSync.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAdvisorStore } from '../../stores/advisorStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useGroupModeStore } from '../../stores/groupModeStore';
import { useLadderSync, LADDER_RELOAD_DELAY_MS } from './useLadderSync';

vi.mock('../../services/api', () => ({
  groupsAPI: { create: vi.fn() },
  advisorAPI: { scan: vi.fn(), health: vi.fn(), ladder: vi.fn() },
  architectureAPI: { createElement: vi.fn(), createConnection: vi.fn() },
}));

const loadLadder = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.useFakeTimers();
  loadLadder.mockClear();
  useAdvisorStore.setState({ loadLadder } as never);
  useArchitectureStore.setState({ elements: [], connections: [] } as never);
});
afterEach(() => vi.useRealTimers());

describe('useLadderSync', () => {
  test('loads the ladder of the project at once', () => {
    renderHook(() => useLadderSync('p1'));
    expect(loadLadder).toHaveBeenCalledWith('p1');
  });

  test('another project → loads that project', () => {
    const { rerender } = renderHook(({ id }) => useLadderSync(id), { initialProps: { id: 'p1' } });
    rerender({ id: 'p2' });
    expect(loadLadder).toHaveBeenLastCalledWith('p2');
  });

  test('more elements → loads again after the delay, once', () => {
    renderHook(() => useLadderSync('p1'));
    loadLadder.mockClear();
    act(() => { useArchitectureStore.setState({ elements: [{ id: 'a' }, { id: 'b' }] } as never); });
    act(() => { useArchitectureStore.setState({ elements: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } as never); });
    expect(loadLadder).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(LADDER_RELOAD_DELAY_MS); });
    expect(loadLadder).toHaveBeenCalledTimes(1);
  });

  test('no project → nothing is loaded', () => {
    renderHook(() => useLadderSync(undefined));
    expect(loadLadder).not.toHaveBeenCalled();
  });

  test('opening another project ends the group mode of the previous one and removes its feedback', () => {
    useGroupModeStore.getState().start('p1');
    useGroupModeStore.getState().toggle('a');
    useGroupModeStore.setState({ feedback: { lines: ['You have 1 group. Make one more group.'], offerAnother: true } });
    const { rerender } = renderHook(({ id }) => useLadderSync(id), { initialProps: { id: 'p1' } });
    expect(useGroupModeStore.getState().active).toBe(true);
    rerender({ id: 'p2' });
    expect(useGroupModeStore.getState().active).toBe(false);
    expect(useGroupModeStore.getState().selected).toEqual([]);
    expect(useGroupModeStore.getState().feedback).toBeNull();
  });
});
