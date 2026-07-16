import { describe, test, expect, vi } from 'vitest';
import { buildCommandRegistry, resolveActionRoute, type CommandContext } from './commands';

const ctx = (over: Partial<CommandContext> = {}): CommandContext => ({
  projectId: 'p1',
  navigate: vi.fn(),
  phase: 2,
  ...over,
});

describe('resolveActionRoute (THE-492)', () => {
  test('sentinel routes resolve to the classic project view', () => {
    expect(resolveActionRoute('__envision__', 'p1')).toBe('/project/p1');
    expect(resolveActionRoute('__connection_mode__', 'p1')).toBe('/project/p1');
  });
  test('real routes pass through unchanged', () => {
    expect(resolveActionRoute('/project/p1/compliance/standards', 'p1')).toBe('/project/p1/compliance/standards');
  });
});

describe('buildCommandRegistry (THE-492)', () => {
  test('builds keyed safe commands whose run() navigates', () => {
    const c = ctx();
    const reg = buildCommandRegistry(c);
    expect(reg['goto:model']).toBeDefined();
    expect(reg['open:matrix']).toBeDefined();
    reg['open:matrix'].run(c);
    expect(c.navigate).toHaveBeenCalledWith('/project/p1/compliance/matrix');
  });
  test('analyze command is unavailable before phase 4 (reuses isToolbarActionVisible gating)', () => {
    expect(buildCommandRegistry(ctx({ phase: 3 }))['open:analyze'].available?.(ctx({ phase: 3 }))).toBe(false);
    expect(buildCommandRegistry(ctx({ phase: 4 }))['open:analyze'].available?.(ctx({ phase: 4 }))).toBe(true);
  });
});

describe('buildCommandRegistry — 3b curated expansion (THE-493)', () => {
  test('grows to the curated jump-to-any-tool set (≥25 commands)', () => {
    const reg = buildCommandRegistry(ctx({ phase: 6 }));
    expect(Object.keys(reg).length).toBeGreaterThanOrEqual(25);
  });

  test('the 3a command ids stay frozen (StationActions contract)', () => {
    const reg = buildCommandRegistry(ctx());
    for (const id of ['goto:model', 'open:model-classic', 'open:matrix', 'open:analyze', 'open:approvals', 'open:audit']) {
      expect(reg[id]).toBeDefined();
    }
  });

  test('every command carries keywords for the palette search', () => {
    const reg = buildCommandRegistry(ctx());
    for (const cmd of Object.values(reg)) {
      expect(cmd.keywords && cmd.keywords.length > 0).toBe(true);
    }
  });

  test('comply sections are phase-gated via getVisibleSections', () => {
    const reg1 = buildCommandRegistry(ctx({ phase: 1 }));
    const reg5 = buildCommandRegistry(ctx({ phase: 5 }));
    // comply is empty for phases 1-2 → unavailable; visible from its phase on
    expect(reg1['open:comply-standards'].available?.(ctx({ phase: 1 }))).toBe(false);
    expect(reg5['open:comply-standards'].available?.(ctx({ phase: 5 }))).toBe(true);
    // 'approvals' keeps its frozen id (open:approvals, not open:comply-approvals) — StationActions contract.
    expect(reg5['open:approvals'].available?.(ctx({ phase: 5 }))).toBe(true);
  });

  test('analyze sections are phase-gated (empty before phase 4)', () => {
    expect(buildCommandRegistry(ctx({ phase: 3 }))['open:analyze-risk'].available?.(ctx({ phase: 3 }))).toBe(false);
    expect(buildCommandRegistry(ctx({ phase: 4 }))['open:analyze-risk'].available?.(ctx({ phase: 4 }))).toBe(true);
  });

  test('a new command navigates to its real route', () => {
    const c = ctx();
    buildCommandRegistry(c)['open:blueprint'].run(c);
    expect(c.navigate).toHaveBeenCalledWith('/project/p1/blueprint');
  });
});
