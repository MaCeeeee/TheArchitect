/**
 * UC-METH-002 — what the last ladder load of the action field was made for: project, number of
 * elements, number of relationships. useLadderSync skips a reload for the same key; the group mode
 * marks the key when its submit loads the ladder for the new model, so the model change of the
 * new group does not load it a second time.
 */
import { useArchitectureStore } from '../../stores/architectureStore';

let lastLoadedKey: string | null = null;

/** The key of the model as it is now. */
export function ladderKeyNow(projectId: string): string {
  const { elements, connections } = useArchitectureStore.getState();
  return `${projectId}:${elements.length}:${connections.length}`;
}

/** Records that the ladder of this project is loaded for the model as it is now. */
export function noteLadderLoaded(projectId: string): void {
  lastLoadedKey = ladderKeyNow(projectId);
}

export function isLadderLoadedForNow(projectId: string): boolean {
  return lastLoadedKey === ladderKeyNow(projectId);
}
