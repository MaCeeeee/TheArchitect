/**
 * UC-METH-002 (REQ .1) — which members a group gets, which it skips and why, where it is placed.
 * Run: cd packages/server && npx jest src/__tests__/planGroup.test.ts
 */
import { LAYER_Y } from '@thearchitect/shared';
import { planGroup, GROUP_CLEARANCE, type MemberRow } from '../services/groups/planGroup';

const row = (id: string, type: string, posX: number | null = 0, posZ: number | null = 0, posY: number | null = null): MemberRow => ({ id, name: `name-${id}`, type, posX, posY, posZ });

describe('planGroup', () => {
  test('process, application component and node are members of a grouping', () => {
    const plan = planGroup('grouping', [row('p', 'process'), row('a', 'application_component'), row('n', 'node')]);
    expect(plan.members.map((m) => m.id)).toEqual(['a', 'n', 'p']);
    expect(plan.skipped).toEqual([]);
    expect(plan.layer).toBe('business');
    expect(plan.togafDomain).toBe('business');
  });

  test('a goal cannot be composed by a grouping: skipped with its reason', () => {
    const plan = planGroup('grouping', [row('p', 'process'), row('g', 'goal')]);
    expect(plan.members.map((m) => m.id)).toEqual(['p']);
    expect(plan.skipped).toEqual([{ id: 'g', name: 'name-g', type: 'goal', reason: 'composition_not_valid' }]);
  });

  test('a group is never a member of a new group', () => {
    const plan = planGroup('grouping', [row('p', 'process'), row('x', 'grouping'), row('l', 'location')]);
    expect(plan.members.map((m) => m.id)).toEqual(['p']);
    expect(plan.skipped.map((s) => [s.id, s.reason])).toEqual([['l', 'is_a_group'], ['x', 'is_a_group']]);
  });

  test('an unknown type has no composition: skipped', () => {
    const plan = planGroup('grouping', [row('p', 'process'), row('u', 'no_such_type')]);
    expect(plan.skipped.map((s) => s.reason)).toEqual(['composition_not_valid']);
  });

  test('position: mean x and z of the valid members, y on the plane of the group layer', () => {
    const plan = planGroup('grouping', [row('a', 'process', 0, 0), row('b', 'process', 4, 2), row('g', 'goal', 100, 100)]);
    expect(plan.position).toEqual({ x: 2, y: LAYER_Y.business, z: 1 });
  });

  test('a member without a stored position counts as 0', () => {
    const plan = planGroup('grouping', [row('a', 'process', null, null), row('b', 'process', 6, 6)]);
    expect(plan.position).toEqual({ x: 3, y: LAYER_Y.business, z: 3 });
  });

  test('location: technology layer and domain', () => {
    const plan = planGroup('location', [row('n', 'node'), row('d', 'device')]);
    expect(plan.layer).toBe('technology');
    expect(plan.togafDomain).toBe('technology');
    expect(plan.position.y).toBe(LAYER_Y.technology);
  });

  test('the result does not depend on the order of the rows', () => {
    const rows = [row('b', 'process', 4, 2), row('a', 'process', 0, 0), row('g', 'goal')];
    expect(planGroup('grouping', rows)).toEqual(planGroup('grouping', [...rows].reverse()));
  });

  test('not on a member: three members in a row on the business plane → the group moves off the middle one', () => {
    const y = LAYER_Y.business;
    const plan = planGroup('grouping', [row('a', 'process', 0, 0, y), row('b', 'process', 4, 0, y), row('c', 'process', 8, 0, y)]);
    expect(plan.position.x).toBe(4);
    expect(plan.position.y).toBe(y);
    for (const m of [[0, 0], [4, 0], [8, 0]]) {
      expect(Math.hypot(plan.position.x - m[0], plan.position.z - m[1])).toBeGreaterThanOrEqual(GROUP_CLEARANCE);
    }
  });

  test('legacy type names are read as their ArchiMate type: business_process is a member', () => {
    const plan = planGroup('grouping', [row('p', 'business_process'), row('a', 'application_component')]);
    expect(plan.members.map((m) => m.id)).toEqual(['a', 'p']);
    expect(plan.skipped).toEqual([]);
  });

  test('at the scene boundary the group still gets a free spot (clamping cannot pull it onto a member)', () => {
    const y = LAYER_Y.business;
    const plan = planGroup('grouping', [row('a', 'process', -1, 1000, y), row('b', 'process', 1, 1000, y)]);
    for (const m of [[-1, 1000], [1, 1000]]) {
      expect(Math.hypot(plan.position.x - m[0], plan.position.z - m[1])).toBeGreaterThanOrEqual(GROUP_CLEARANCE);
    }
    expect(Math.abs(plan.position.z)).toBeLessThanOrEqual(1000);
  });
});
