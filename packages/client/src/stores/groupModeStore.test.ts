/**
 * UC-METH-002 (REQ .3) — the group mode: select, name, make; errors stay in the mode.
 * Run: cd packages/client && npx vitest run src/stores/groupModeStore.test.ts
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { LadderReport } from '@thearchitect/shared';

vi.mock('../services/api', () => ({
  groupsAPI: { create: vi.fn() },
  advisorAPI: { scan: vi.fn(), health: vi.fn(), ladder: vi.fn() },
  architectureAPI: { createElement: vi.fn(), createConnection: vi.fn() },
}));

import { useGroupModeStore } from './groupModeStore';
import { useArchitectureStore } from './architectureStore';
import { useAdvisorStore } from './advisorStore';
import { useUIStore } from './uiStore';
import { groupsAPI, architectureAPI, advisorAPI } from '../services/api';

const realLoadLadder = useAdvisorStore.getState().loadLadder;

const create = vi.mocked(groupsAPI.create);
const state = () => useGroupModeStore.getState();
const ladderAfter = (groupsWithMembers: number, reached: boolean) => ({
  projectId: 'p1', highestRung: reached ? 2 : 1,
  rungs: [0, 1, 2, 3, 4, 5].map((i) => ({
    index: i, title: '', provides: '', math: '', warnings: [], next: null,
    status: i < 2 || (i === 2 && reached) ? 'reached' : i === (reached ? 3 : 2) ? 'open' : 'locked',
    facts: i === 2 ? [{ label: 'groups', value: groupsWithMembers }, { label: 'groups with members', value: groupsWithMembers }] : [],
  })),
}) as unknown as LadderReport;
const serverAnswer = {
  data: { success: true, data: {
    element: { id: 'g1', projectId: 'p1', type: 'grouping', name: 'Sales', description: '', layer: 'business', togafDomain: 'business', maturityLevel: 1, riskLevel: 'low', status: 'current', position3D: { x: 1, y: 8, z: 1 }, metadata: {} },
    connections: [{ id: 'c1', sourceId: 'g1', targetId: 'a', type: 'composition', label: '' }, { id: 'c2', sourceId: 'g1', targetId: 'b', type: 'composition', label: '' }],
    skipped: [],
  } },
};

beforeEach(() => {
  create.mockReset();
  useGroupModeStore.getState().reset();
  useArchitectureStore.setState({ projectId: 'p1', elements: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as never, connections: [], selectedElementIds: new Set(['a']), selectedElementId: 'a' });
  useUIStore.setState({ isConnectionMode: true });
  useAdvisorStore.setState({ ladder: null, loadLadder: vi.fn(async () => { const r = ladderAfter(1, false); useAdvisorStore.setState({ ladder: r }); return r; }) } as never);
});

describe('groupModeStore', () => {
  test('start: mode on for this project, connection mode off, the old selection is cleared', () => {
    state().start('p1');
    expect(state().active).toBe(true);
    expect(state().projectId).toBe('p1');
    expect(state().phase).toBe('select');
    expect(useUIStore.getState().isConnectionMode).toBe(false);
    expect(useArchitectureStore.getState().selectedElementIds.size).toBe(0);
  });

  test('a select adds an element, a second select removes it', () => {
    state().start('p1');
    state().toggle('a'); state().toggle('b'); state().toggle('a');
    expect(state().selected).toEqual(['b']);
  });

  test('naming needs 2 elements', () => {
    state().start('p1'); state().toggle('a');
    state().toNaming();
    expect(state().phase).toBe('select');
    state().toggle('b'); state().toNaming();
    expect(state().phase).toBe('name');
  });

  test('cancel after 2 selects: nothing is sent, mode off', () => {
    state().start('p1'); state().toggle('a'); state().toggle('b');
    state().cancel();
    expect(state().active).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  test('outside the mode a toggle does nothing', () => {
    state().toggle('a');
    expect(state().selected).toEqual([]);
  });

  test('make: one call with name and members; the answer goes into the model without a second POST; feedback from the reloaded ladder', async () => {
    create.mockResolvedValue(serverAnswer as never);
    state().start('p1'); state().toggle('a'); state().toggle('b'); state().toNaming(); state().setName('  Sales ');
    await state().submit('p1');
    expect(create).toHaveBeenCalledWith('p1', { name: 'Sales', type: 'grouping', memberIds: ['a', 'b'] });
    const arch = useArchitectureStore.getState();
    expect(arch.elements.map((e) => e.id)).toContain('g1');
    expect(arch.connections.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(architectureAPI.createElement).not.toHaveBeenCalled();
    expect(architectureAPI.createConnection).not.toHaveBeenCalled();
    expect(state().active).toBe(false);
    expect(state().feedback).toEqual({ lines: ['You have 1 group. Make one more group.'], offerAnother: true });
  });

  test('step 2 reached after the second group → "completed"', async () => {
    create.mockResolvedValue(serverAnswer as never);
    useAdvisorStore.setState({ loadLadder: vi.fn(async () => { const r = ladderAfter(2, true); useAdvisorStore.setState({ ladder: r }); return r; }) } as never);
    state().start('p1'); state().toggle('a'); state().toggle('b'); state().toNaming(); state().setName('Sales');
    await state().submit('p1');
    expect(state().feedback).toEqual({ lines: ['You completed step 2.'], offerAnother: false });
  });

  test('server refuses (unknown member) → message in the mode, mode and selection stay, model unchanged', async () => {
    create.mockRejectedValue(Object.assign(new Error('400'), { response: { status: 400, data: { error: 'Unknown members', unknownIds: ['x'] } } }));
    state().start('p1'); state().toggle('a'); state().toggle('b'); state().toNaming(); state().setName('Sales');
    await state().submit('p1');
    expect(state().active).toBe(true);
    expect(state().phase).toBe('name');
    expect(state().selected).toEqual(['a', 'b']);
    expect(state().error).toBe('The software did not make the group. Each element must be in this model.');
    expect(useArchitectureStore.getState().elements).toHaveLength(3);
  });

  test('conflict → "The model changed." and "Do the procedure again."', async () => {
    create.mockRejectedValue(Object.assign(new Error('409'), { response: { status: 409, data: {} } }));
    state().start('p1'); state().toggle('a'); state().toggle('b'); state().toNaming(); state().setName('Sales');
    await state().submit('p1');
    expect(state().error).toBe('The software did not make the group. The model changed. Do the procedure again.');
  });

  test('fewer than 2 valid members → the refusal names the members that cannot be in a group', async () => {
    create.mockRejectedValue(Object.assign(new Error('400'), { response: { status: 400, data: {
      error: 'A group needs a minimum of 2 valid members',
      skipped: [{ id: 'g', name: 'Revenue', type: 'goal', reason: 'composition_not_valid' }],
    } } }));
    state().start('p1'); state().toggle('a'); state().toggle('g'); state().toNaming(); state().setName('Sales');
    await state().submit('p1');
    expect(state().error).toBe('The software did not make the group. Revenue is not a member of the group. A Grouping element cannot have this type of element as a member.');
  });

  test('a submit for another project than the one the mode was started for sends nothing', async () => {
    state().start('p1'); state().toggle('a'); state().toggle('b'); state().toNaming(); state().setName('Sales');
    await state().submit('p2');
    expect(create).not.toHaveBeenCalled();
  });

  test('an empty name sends nothing', async () => {
    state().start('p1'); state().toggle('a'); state().toggle('b'); state().toNaming(); state().setName('   ');
    await state().submit('p1');
    expect(create).not.toHaveBeenCalled();
  });

  const named = (name = 'Sales') => { state().start('p1'); state().toggle('a'); state().toggle('b'); state().toNaming(); state().setName(name); };
  const pendingCreate = () => {
    let resolve!: (v: never) => void;
    create.mockReturnValue(new Promise((res) => { resolve = res as never; }) as never);
    return (v: unknown) => resolve(v as never);
  };

  test('cancel while the request runs: the answer is not added, no feedback', async () => {
    const answer = pendingCreate();
    named();
    const done = state().submit('p1');
    state().reset();
    answer(serverAnswer);
    await done;
    expect(useArchitectureStore.getState().elements).toHaveLength(3);
    expect(state().feedback).toBeNull();
    expect(state().active).toBe(false);
  });

  test('another project opened while the request runs: the answer is not added, no feedback', async () => {
    const answer = pendingCreate();
    named();
    const done = state().submit('p1');
    useArchitectureStore.setState({ projectId: 'p2' });
    answer(serverAnswer);
    await done;
    expect(useArchitectureStore.getState().elements).toHaveLength(3);
    expect(state().feedback).toBeNull();
  });

  test('feedback uses the report of its own request, not a newer one', async () => {
    create.mockResolvedValue(serverAnswer as never);
    const ladderApi = vi.mocked(advisorAPI.ladder);
    let first!: (v: unknown) => void;
    ladderApi.mockReset();
    ladderApi.mockReturnValueOnce(new Promise((res) => { first = res; }) as never);
    ladderApi.mockResolvedValueOnce({ data: { data: ladderAfter(2, true) } } as never);
    useAdvisorStore.setState({ loadLadder: realLoadLadder } as never);
    named();
    const done = state().submit('p1');
    await vi.waitFor(() => expect(ladderApi).toHaveBeenCalledTimes(1));
    await useAdvisorStore.getState().loadLadder('p1');
    first({ data: { data: ladderAfter(1, false) } });
    await done;
    expect(state().feedback).toEqual({ lines: ['You have 1 group. Make one more group.'], offerAnother: true });
  });

  test('cancel while the request runs is ignored: the mode stays and the answer lands in the model (no second group)', async () => {
    const answer = pendingCreate();
    named();
    const done = state().submit('p1');
    state().cancel();
    expect(state()).toMatchObject({ active: true, busy: true, phase: 'name', selected: ['a', 'b'] });
    answer(serverAnswer);
    await done;
    expect(useArchitectureStore.getState().elements.map((e) => e.id)).toContain('g1');
    expect(state().active).toBe(false);
    expect(state().feedback).toEqual({ lines: ['You have 1 group. Make one more group.'], offerAnother: true });
  });

  test('a second submit while busy sends nothing', async () => {
    const answer = pendingCreate();
    named();
    const first = state().submit('p1');
    await state().submit('p1');
    expect(create).toHaveBeenCalledTimes(1);
    answer(serverAnswer);
    await first;
  });

  test('a generic error → the generic text', async () => {
    create.mockRejectedValue(Object.assign(new Error('500'), { response: { status: 500, data: {} } }));
    named();
    await state().submit('p1');
    expect(state().error).toBe('The software did not make the group. Do the procedure again.');
  });

  test('success with skipped members → the feedback names them', async () => {
    const skipped = [{ id: 'g', name: 'Revenue', type: 'goal', reason: 'composition_not_valid' }];
    create.mockResolvedValue({ data: { data: { ...serverAnswer.data.data, skipped } } } as never);
    named();
    await state().submit('p1');
    expect(state().feedback?.lines).toEqual([
      'You have 1 group. Make one more group.',
      'Revenue is not a member of the group.',
      'A Grouping element cannot have this type of element as a member.',
    ]);
  });

  test('400 with an empty skipped list → the generic text', async () => {
    create.mockRejectedValue(Object.assign(new Error('400'), { response: { status: 400, data: { skipped: [] } } }));
    named();
    await state().submit('p1');
    expect(state().error).toBe('The software did not make the group. Do the procedure again.');
  });

  test('pruneSelection drops deleted elements; in the naming phase fewer than 2 go back to select', () => {
    named();
    state().pruneSelection(['a', 'b', 'c']);
    expect(state().phase).toBe('name');
    state().pruneSelection(new Set(['a', 'c']));
    expect(state().selected).toEqual(['a']);
    expect(state().phase).toBe('select');
  });

  test('cancel clears the error; reset clears everything', () => {
    named();
    useGroupModeStore.setState({ error: 'x', feedback: { lines: ['y'], offerAnother: true } });
    state().cancel();
    expect(state().error).toBeNull();
    state().reset();
    expect(state()).toMatchObject({ active: false, selected: [], error: null, feedback: null, projectId: null });
  });

  test('an old answer does not end a new mode started after a cancel in the same project', async () => {
    const answer = pendingCreate();
    named();
    const done = state().submit('p1');
    state().cancel();
    state().start('p1');
    state().toggle('c');
    answer(serverAnswer);
    await done;
    expect(state().active).toBe(true);
    expect(state().selected).toEqual(['c']);
    expect(state().feedback).toBeNull();
    expect(useArchitectureStore.getState().elements).toHaveLength(3);
  });

  test('an old error does not write into the idle store or a new mode', async () => {
    let reject!: (e: unknown) => void;
    create.mockReturnValue(new Promise((_res, rej) => { reject = rej; }) as never);
    named();
    const done = state().submit('p1');
    state().reset();
    reject(Object.assign(new Error('500'), { response: { status: 500, data: {} } }));
    await done;
    expect(state().error).toBeNull();
    expect(state().busy).toBe(false);
  });
});
