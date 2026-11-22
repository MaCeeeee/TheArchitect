// @vitest-environment jsdom
/**
 * UC-METH-002 (REQ .4) — from the action field label to the same step in the ladder panel.
 * Run: cd packages/client && npx vitest run src/components/groups/showLadderStep.test.ts
 */
import { describe, test, expect, vi } from 'vitest';

import { useAdvisorStore } from '../../stores/advisorStore';
import { useUIStore } from '../../stores/uiStore';
import { showLadderStep } from './showLadderStep';

describe('showLadderStep', () => {
  test('opens the copilot sidebar on the advisor tab and marks the rung', () => {
    const events: string[] = [];
    const spy = vi.spyOn(window, 'dispatchEvent').mockImplementation((e) => { events.push(`${e.type}:${JSON.stringify((e as CustomEvent).detail)}`); return true; });
    useUIStore.setState({ sidebarPanel: 'envision', isSidebarOpen: false } as never);
    showLadderStep(2);
    expect(useUIStore.getState().sidebarPanel).toBe('copilot');
    expect(useUIStore.getState().isSidebarOpen).toBe(true);
    expect(useAdvisorStore.getState().focusRung).toBe(2);
    expect(events).toContain('copilot:setTab:{"tab":"advisor"}');
    spy.mockRestore();
  });
});
