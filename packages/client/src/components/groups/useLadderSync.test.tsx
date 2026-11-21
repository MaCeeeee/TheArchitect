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
import { groupsAPI } from '../../services/api';

vi.mock('../../services/api', () => ({
  groupsAPI: { create: vi.fn() },
  advisorAPI: { scan: vi.fn(), health: vi.fn(), ladder: vi.fn() },
  architectureAPI: { createElement: vi.fn(), createConnection: vi.fn() },
}));

const loadLadder = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.useFakeTimers();
  useGroupModeStore.getState().reset();
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

  test('mount → exactly one load, also after the delay', () => {
    renderHook(() => useLadderSync('p1'));
    act(() => { vi.advanceTimersByTime(LADDER_RELOAD_DELAY_MS * 2); });
    expect(loadLadder).toHaveBeenCalledTimes(1);
  });

  test('more elements → loads one more time after the delay, once', () => {
    renderHook(() => useLadderSync('p1'));
    act(() => { vi.advanceTimersByTime(LADDER_RELOAD_DELAY_MS); });
    expect(loadLadder).toHaveBeenCalledTimes(1);
    act(() => { useArchitectureStore.setState({ elements: [{ id: 'a' }, { id: 'b' }] } as never); });
    act(() => { useArchitectureStore.setState({ elements: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } as never); });
    expect(loadLadder).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(LADDER_RELOAD_DELAY_MS); });
    expect(loadLadder).toHaveBeenCalledTimes(2);
  });

  test('a changed element count prunes the group selection at once', () => {
    useArchitectureStore.setState({ elements: [{ id: 'a' }, { id: 'b' }] } as never);
    useGroupModeStore.getState().start('p1');
    useGroupModeStore.getState().toggle('a');
    useGroupModeStore.getState().toggle('b');
    renderHook(() => useLadderSync('p1'));
    act(() => { useArchitectureStore.setState({ elements: [{ id: 'a' }] } as never); });
    expect(useGroupModeStore.getState().selected).toEqual(['a']);
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

  test('while the project data is loading nothing is loaded; when it is in, exactly one load', () => {
    const { rerender } = renderHook(({ ready }) => useLadderSync('p1', ready), { initialProps: { ready: false } });
    act(() => { useArchitectureStore.setState({ elements: [{ id: 'a' }, { id: 'b' }], connections: [{ id: 'c' }] } as never); });
    act(() => { vi.advanceTimersByTime(LADDER_RELOAD_DELAY_MS * 2); });
    expect(loadLadder).not.toHaveBeenCalled();
    rerender({ ready: true });
    expect(loadLadder).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(LADDER_RELOAD_DELAY_MS * 2); });
    expect(loadLadder).toHaveBeenCalledTimes(1);
  });

  test('a group made: the ladder load of the submit is the only one for the new counts', async () => {
    useArchitectureStore.setState({ projectId: 'p1', elements: [{ id: 'a' }, { id: 'b' }], connections: [] } as never);
    renderHook(() => useLadderSync('p1'));
    expect(loadLadder).toHaveBeenCalledTimes(1);
    vi.mocked(groupsAPI.create).mockResolvedValue({ data: { success: true, data: {
      element: { id: 'g1', projectId: 'p1', type: 'grouping', name: 'Sales', description: '', layer: 'business', togafDomain: 'business', maturityLevel: 1, riskLevel: 'low', status: 'current', position3D: { x: 0, y: 8, z: 0 }, metadata: {} },
      connections: [{ id: 'c1', sourceId: 'g1', targetId: 'a', type: 'composition', label: '' }, { id: 'c2', sourceId: 'g1', targetId: 'b', type: 'composition', label: '' }],
      skipped: [],
    } } } as never);
    const g = useGroupModeStore.getState();
    g.start('p1'); g.toggle('a'); g.toggle('b'); g.toNaming(); g.setName('Sales');
    await act(async () => { await useGroupModeStore.getState().submit('p1'); });
    expect(useArchitectureStore.getState().elements).toHaveLength(3);
    expect(loadLadder).toHaveBeenCalledTimes(2); // the submit loads it for the new model
    act(() => { vi.advanceTimersByTime(LADDER_RELOAD_DELAY_MS * 2); });
    expect(loadLadder).toHaveBeenCalledTimes(2); // no second load for the same counts
  });
});
