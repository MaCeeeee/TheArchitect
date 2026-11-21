/**
 * UC-METH-002 (REQ .4) — keeps the ladder report of the open project current without the advisor
 * panel: loads it when the project opens and again when the number of elements or relationships
 * changes (debounced; the ladder endpoint allows 30 requests per minute).
 * Mount it once per view: ProjectView (classic) and JourneyShell (v2).
 */
import { useEffect, useRef } from 'react';
import { useAdvisorStore } from '../../stores/advisorStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useGroupModeStore } from '../../stores/groupModeStore';

export const LADDER_RELOAD_DELAY_MS = 1500;

export function useLadderSync(projectId: string | undefined): void {
  const loadLadder = useAdvisorStore((s) => s.loadLadder);
  const elementCount = useArchitectureStore((s) => s.elements.length);
  const connectionCount = useArchitectureStore((s) => s.connections.length);
  const loadedFor = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!projectId) return;
    loadedFor.current = projectId;
    // The group mode belongs to one project: end it and its feedback when another project opens.
    const groupMode = useGroupModeStore.getState();
    if (groupMode.projectId !== null && groupMode.projectId !== projectId) {
      groupMode.cancel();
      groupMode.dismiss();
    }
    void loadLadder(projectId);
  }, [projectId, loadLadder]);

  useEffect(() => {
    if (!projectId || loadedFor.current !== projectId) return;
    const timer = setTimeout(() => void loadLadder(projectId), LADDER_RELOAD_DELAY_MS);
    return () => clearTimeout(timer);
    // the first run per project is covered by the effect above; this one reacts to changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementCount, connectionCount]);
}
