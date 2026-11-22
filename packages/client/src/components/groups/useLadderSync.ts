/**
 * UC-METH-002 (REQ .4) — keeps the ladder report of the open project current without the advisor
 * panel: loads it once when the project data is in, and again when the number of elements or
 * relationships changes (debounced; the ladder endpoint allows 30 requests per minute per user).
 * A load for the same counts as the last one (e.g. the one the group mode made after its submit)
 * is skipped. Mount it once per view: ProjectView (classic) and JourneyShell (v2).
 */
import { useEffect, useRef } from 'react';
import { useAdvisorStore } from '../../stores/advisorStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useGroupModeStore } from '../../stores/groupModeStore';
import { isLadderLoadedForNow, noteLadderLoaded } from './ladderLoadKey';

export const LADDER_RELOAD_DELAY_MS = 1500;

/**
 * @param projectId the open project
 * @param ready false while the project data is still loading: nothing is loaded before the model is in
 */
export function useLadderSync(projectId: string | undefined, ready = true): void {
  const loadLadder = useAdvisorStore((s) => s.loadLadder);
  const elementCount = useArchitectureStore((s) => s.elements.length);
  const connectionCount = useArchitectureStore((s) => s.connections.length);
  /** The project this hook made its first load for. */
  const firstLoadFor = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!projectId) return;
    // The group mode belongs to one project: end it and its feedback when another project opens.
    const groupMode = useGroupModeStore.getState();
    if (groupMode.projectId !== null && groupMode.projectId !== projectId) groupMode.reset();
  }, [projectId]);

  // An element that left the model cannot stay in the group selection (not debounced).
  useEffect(() => {
    useGroupModeStore.getState().pruneSelection(new Set(useArchitectureStore.getState().elements.map((e) => e.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementCount]);

  useEffect(() => {
    if (!projectId || !ready) return;
    const load = () => {
      noteLadderLoaded(projectId);
      void loadLadder(projectId);
    };
    // The first load of a project: at once, when its data is in.
    if (firstLoadFor.current !== projectId) {
      firstLoadFor.current = projectId;
      load();
      return;
    }
    if (isLadderLoadedForNow(projectId)) return;
    // Read the counts again when the timer fires: a load made in the meantime (submit) counts.
    const timer = setTimeout(() => { if (!isLadderLoadedForNow(projectId)) load(); }, LADDER_RELOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [projectId, ready, elementCount, connectionCount, loadLadder]);
}
