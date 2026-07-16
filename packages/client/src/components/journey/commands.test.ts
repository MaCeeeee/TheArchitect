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
    const early = buildCommandRegistry(ctx({ phase: 3 }));
    const late = buildCommandRegistry(ctx({ phase: 4 }));
    expect(early['open:analyze'].available?.(ctx({ phase: 3 }))).toBe(false);
    expect(late['open:analyze'].available?.(ctx({ phase: 4 }))).toBe(true);
  });
});
