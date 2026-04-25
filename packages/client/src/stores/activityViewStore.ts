import { create } from 'zustand';
import toast from 'react-hot-toast';
import { architectureAPI } from '../services/api';
import { useArchitectureStore, type ArchitectureElement, type Connection } from './architectureStore';

export interface DrillFrame {
  processId: string;
  processName: string;
  activities: ArchitectureElement[];
  flows: Connection[];
}

interface ActivityViewState {
  isActive: boolean;
  stack: DrillFrame[];
  isLoading: boolean;
  error: string | null;

  current: () => DrillFrame | null;
  enter: (processId: string) => Promise<void>;
  drillInto: (activityId: string) => Promise<void>;
  back: () => void;
  exit: () => void;
}

async function fetchFrame(projectId: string, elementId: string): Promise<DrillFrame> {
  const element = useArchitectureStore.getState().elements.find((e) => e.id === elementId);
  const processName = element?.name ?? 'Process';

  const res = await architectureAPI.getChildren(projectId, elementId);
  const data = (res.data?.data ?? res.data) as { children?: ArchitectureElement[]; flows?: Connection[] };

  const rawChildren = data.children ?? [];
  // Sort by metadata.sequenceIndex so BPMN flow renders L→R in seed order.
  // Neo4j MATCH returns are not order-stable; without this the row direction is arbitrary.
  const activities = [...rawChildren].sort((a, b) => {
    const ai = (a.metadata as { sequenceIndex?: number } | undefined)?.sequenceIndex ?? 999;
    const bi = (b.metadata as { sequenceIndex?: number } | undefined)?.sequenceIndex ?? 999;
    return ai - bi;
  });

  return {
    processId: elementId,
    processName,
    activities,
    flows: data.flows ?? [],
  };
}

export const useActivityViewStore = create<ActivityViewState>((set, get) => ({
  isActive: false,
  stack: [],
  isLoading: false,
  error: null,

  current: () => {
    const { stack } = get();
    return stack.length > 0 ? stack[stack.length - 1] : null;
  },

  enter: async (processId: string) => {
    const projectId = useArchitectureStore.getState().projectId;
    if (!projectId) {
      toast.error('No project loaded');
      return;
    }

    import('./roadmapStore').then(({ useRoadmapStore }) => {
      if (useRoadmapStore.getState().isPlateauViewActive) {
        useRoadmapStore.getState().deactivatePlateauView();
      }
    });
    import('./xrayStore').then(({ useXRayStore }) => {
      if (useXRayStore.getState().isActive) {
        useXRayStore.getState().toggleXRay();
      }
    });

    set({ isActive: true, isLoading: true, error: null, stack: [] });

    try {
      const frame = await fetchFrame(projectId, processId);
      set({ stack: [frame], isLoading: false });

      import('../components/3d/ViewModeCamera').then((m) => {
        if (typeof m.flyToProcessPyramid === 'function') {
          // ActivityScene renders the apex at scene-space origin (0, Y_APEX, 0).
          // Camera must aim at scene-space coords, NOT the process's world position.
          m.flyToProcessPyramid({ x: 0, y: 12, z: 0 }, frame.activities.length);
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load activities';
      set({ isLoading: false, error: message });
      toast.error(`Activity-View: ${message}`);
    }
  },

  drillInto: async (activityId: string) => {
    const projectId = useArchitectureStore.getState().projectId;
    if (!projectId) return;

    set({ isLoading: true, error: null });

    try {
      const frame = await fetchFrame(projectId, activityId);
      set((state) => ({ stack: [...state.stack, frame], isLoading: false }));

      import('../components/3d/ViewModeCamera').then((m) => {
        if (typeof m.flyDeeperIntoPyramid === 'function') {
          m.flyDeeperIntoPyramid(activityId, frame.activities.length);
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to drill into activity';
      set({ isLoading: false, error: message });
      toast.error(`Drill-down: ${message}`);
    }
  },

  back: () => {
    const { stack } = get();
    if (stack.length <= 1) {
      get().exit();
      return;
    }
    set({ stack: stack.slice(0, -1) });
  },

  exit: () => {
    set({ isActive: false, stack: [], error: null, isLoading: false });

    import('../components/3d/ViewModeCamera').then((m) => {
      if (typeof m.flyBackToWorkspace === 'function') {
        m.flyBackToWorkspace();
      }
    });
  },
}));
