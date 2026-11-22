/**
 * UC-METH-002 (REQ .4) — from the action field to the same step in the ladder panel: opens the
 * copilot sidebar on the advisor tab and marks the rung. Classic view only (v2 has no sidebar).
 */
import { useAdvisorStore } from '../../stores/advisorStore';
import { useUIStore } from '../../stores/uiStore';

export function showLadderStep(rung: number): void {
  useAdvisorStore.getState().focusLadderRung(rung);
  useUIStore.getState().setSidebarPanel('copilot');
  useUIStore.setState({ isSidebarOpen: true });
  window.dispatchEvent(new CustomEvent('copilot:setTab', { detail: { tab: 'advisor' } }));
}
