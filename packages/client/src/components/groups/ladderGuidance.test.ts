/**
 * UC-METH-002 (REQ .2/.4) — when the action field offers "Make a group", and what it says afterwards.
 * Run: cd packages/client && npx vitest run src/components/groups/ladderGuidance.test.ts
 */
import { describe, test, expect } from 'vitest';
import type { LadderReport, LadderRung } from '@thearchitect/shared';
import { ladderGuidance, groupFeedback, groupsWithMembers } from './ladderGuidance';

const rung = (index: LadderRung['index'], status: LadderRung['status'], facts: LadderRung['facts'] = []): LadderRung => ({
  index, title: `t${index}`, provides: '', math: '', status, facts, warnings: [], next: status === 'reached' ? null : 'next',
});
const report = (projectId: string, reachedUpTo: number, groupFacts: LadderRung['facts'] = [{ label: 'groups', value: 0 }, { label: 'groups with members', value: 0 }]): LadderReport => ({
  projectId,
  highestRung: reachedUpTo < 0 ? null : (reachedUpTo as LadderRung['index']),
  rungs: ([0, 1, 2, 3, 4, 5] as const).map((i) =>
    rung(i, i <= reachedUpTo ? 'reached' : i === reachedUpTo + 1 ? 'open' : 'locked', i === 2 ? groupFacts : [])),
  cohomology: [], tolerance: 1e-6, cohomologyMethod: { id: 'x', name: 'x', question: '', formula: '', limits: '' }, methods: [], timestamp: '',
} as LadderReport);

describe('ladderGuidance', () => {
  test('step 2 open, 6 elements → the panel headline and the short next step', () => {
    expect(ladderGuidance(report('p1', 1), 'p1', 6)).toEqual({
      rung: 2,
      headline: 'Model check: step 1 of 5',
      next: 'Next step: Make a minimum of two groups.',
    });
  });
  test('step 2 reached → no guidance (the phase hint stays)', () => {
    expect(ladderGuidance(report('p1', 2), 'p1', 6)).toBeNull();
  });
  test('fewer than 2 elements → no guidance', () => {
    expect(ladderGuidance(report('p1', 1), 'p1', 1)).toBeNull();
    expect(ladderGuidance(report('p1', 1), 'p1', 0)).toBeNull();
  });
  test('the report of another project → no guidance', () => {
    expect(ladderGuidance(report('p2', 1), 'p1', 6)).toBeNull();
  });
  test('no report → no guidance', () => {
    expect(ladderGuidance(null, 'p1', 6)).toBeNull();
  });
  test('step 1 still open → no guidance for groups', () => {
    expect(ladderGuidance(report('p1', 0), 'p1', 6)).toBeNull();
  });
  test('more groups than the check analyses → no guidance (the step asks to remove groups)', () => {
    expect(ladderGuidance(report('p1', 1, [{ label: 'groups', value: 250 }]), 'p1', 300)).toBeNull();
  });
});

describe('groupFeedback', () => {
  test('one group with members, step 2 still open → count and "one more"', () => {
    const r = report('p1', 1, [{ label: 'groups', value: 1 }, { label: 'groups with members', value: 1 }]);
    expect(groupsWithMembers(r)).toBe(1);
    expect(groupFeedback(r, 'p1', [])).toEqual({ lines: ['You have 1 group. Make one more group.'], offerAnother: true });
  });
  test('step 2 reached → completed, no further offer', () => {
    expect(groupFeedback(report('p1', 2), 'p1', [])).toEqual({ lines: ['You completed step 2.'], offerAnother: false });
  });
  test('skipped members are named, with the reason once', () => {
    const r = report('p1', 1, [{ label: 'groups', value: 1 }, { label: 'groups with members', value: 1 }]);
    expect(groupFeedback(r, 'p1', [{ id: 'g', name: 'Revenue', type: 'goal', reason: 'composition_not_valid' }]).lines).toEqual([
      'You have 1 group. Make one more group.',
      'Revenue is not a member of the group.',
      'A Grouping element cannot have this type of element as a member.',
    ]);
  });
  test('no report for this project → "made" and an offer for one more', () => {
    expect(groupFeedback(null, 'p1', [])).toEqual({ lines: ['The software made the group.'], offerAnother: true });
  });
});
