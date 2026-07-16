import { describe, test, expect, vi } from 'vitest';
import { getStationActions } from './stationCommands';
import type { CommandContext } from './commands';
import type { PhaseInfo } from '../../stores/journeyStore';

const ctx = (over: Partial<CommandContext> = {}): CommandContext => ({
  projectId: 'p1', navigate: vi.fn(), phase: 2, ...over,
});

// Minimal phases stub: only the fields getStationActions reads.
const phases = (nextByPhase: Partial<Record<number, PhaseInfo['nextAction']>>): PhaseInfo[] =>
  ([1, 2, 3, 4, 5, 6] as const).map((p) => ({
    phase: p, admLabel: '', name: '', description: '', isDone: !nextByPhase[p],
    progress: { current: 0, target: 1, label: '' },
    nextAction: nextByPhase[p] ?? null,
  }));

describe('getStationActions (THE-492)', () => {
  test('vision always offers a next-step hint, even when its phase is done (no empty cluster)', () => {
    // phases({}) → every phase done (nextAction null) → vision has no primary.
    const actions = getStationActions('vision', phases({}), ctx({ phase: 1 }));
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some((a) => a.id === 'goto:model')).toBe(true);
  });

  test('primary is the station-phase nextAction, resolved, first', () => {
    const p = phases({ 2: { label: 'Add Connections', route: '__connection_mode__' } });
    const actions = getStationActions('model', p, ctx());
    expect(actions[0].label).toBe('Add Connections');
    actions[0].run(ctx()); // navigates to the resolved classic route
  });

  test('caps at 4 and dedups by resolved route', () => {
    const p = phases({ 3: { label: 'Map to Matrix', route: '/project/p1/compliance/matrix' } });
    // explore primary already routes to matrix; the 'open:matrix' secondary must be deduped
    const actions = getStationActions('explore', p, ctx({ phase: 3 }));
    expect(actions.length).toBeLessThanOrEqual(4);
    const matrixCount = actions.filter((a) => a.id === 'primary' || a.id === 'open:matrix').length;
    expect(matrixCount).toBe(1);
  });

  test('a done phase (nextAction null) yields no primary but keeps secondaries', () => {
    const actions = getStationActions('govern', phases({}), ctx({ phase: 5 }));
    expect(actions.every((a) => a.id !== 'primary')).toBe(true);
    expect(actions.some((a) => a.id === 'open:approvals')).toBe(true);
  });

  // The analyze gate is dormant in 3a production (plan station is always phase 4); this exercises the filter mechanism, which becomes load-bearing in Slice 3b's palette.
  test('drops actions failing available() (analyze before phase 4)', () => {
    const actions = getStationActions('plan', phases({}), ctx({ phase: 3 }));
    expect(actions.some((a) => a.id === 'open:analyze')).toBe(false);
  });
});
