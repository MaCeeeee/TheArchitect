/**
 * UC-METH-002 — the group mode selects elements in the scene by their element boxes. The plateau
 * view, the v2 track re-form and the activity view draw other objects in place of those boxes, and
 * a select there does not reach the group mode. So the mode is offered only while the boxes are
 * shown. The conditions are the same as the renderer switch in Scene.tsx (~line 99).
 */
import { useUIStore } from '../../stores/uiStore';
import { useRoadmapStore } from '../../stores/roadmapStore';
import { useActivityViewStore } from '../../stores/activityViewStore';

interface SceneFlags {
  isPlateauActive: boolean;
  trackReform: boolean;
  isActivityActive: boolean;
}

const showsElementBoxes = (f: SceneFlags): boolean => !(f.isActivityActive || f.isPlateauActive || f.trackReform);

const flagsNow = (): SceneFlags => {
  const ui = useUIStore.getState();
  const roadmap = useRoadmapStore.getState();
  return {
    isPlateauActive: roadmap.isPlateauViewActive,
    trackReform: ui.journeyStation === 'track' && roadmap.plateauSnapshots.length > 0,
    isActivityActive: useActivityViewStore.getState().isActive,
  };
};

/** True while the scene shows the element boxes, so a select can reach the group mode. */
export function groupModeAvailableInScene(): boolean {
  return showsElementBoxes(flagsNow());
}

/** The same, as a hook that re-renders when one of the flags changes. */
export function useGroupModeAvailableInScene(): boolean {
  const isPlateauActive = useRoadmapStore((s) => s.isPlateauViewActive);
  const trackStation = useUIStore((s) => s.journeyStation === 'track');
  const hasPlateaus = useRoadmapStore((s) => s.plateauSnapshots.length > 0);
  const isActivityActive = useActivityViewStore((s) => s.isActive);
  return showsElementBoxes({ isPlateauActive, trackReform: trackStation && hasPlateaus, isActivityActive });
}
