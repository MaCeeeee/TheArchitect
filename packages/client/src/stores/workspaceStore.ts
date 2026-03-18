import { create } from 'zustand';

export interface Workspace {
  id: string;
  name: string;
  projectId: string;
  source: 'bpmn' | 'n8n' | 'manual' | 'archimate';
  color: string;
  offsetX: number;
  createdAt: string;
}

const WORKSPACE_GAP = 40; // 30-unit plane + 10-unit gap

const WORKSPACE_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f97316', // orange
  '#00ff41', // purple
  '#ef4444', // red
  '#06b6d4', // cyan
  '#eab308', // yellow
  '#ec4899', // pink
];

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;

  addWorkspace: (ws: Workspace) => void;
  removeWorkspace: (id: string) => void;
  updateWorkspace: (id: string, changes: Partial<Workspace>) => void;
  setActiveWorkspace: (id: string | null) => void;
  getNextOffsetX: () => number;
  getNextColor: () => string;
  getWorkspaceById: (id: string) => Workspace | undefined;
  setWorkspaces: (workspaces: Workspace[]) => void;
  createDefaultWorkspace: (projectId: string) => Workspace;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,

  addWorkspace: (ws) =>
    set((state) => ({
      workspaces: [...state.workspaces, ws],
      activeWorkspaceId: ws.id,
    })),

  removeWorkspace: (id) =>
    set((state) => {
      const filtered = state.workspaces.filter((ws) => ws.id !== id);
      return {
        workspaces: filtered,
        activeWorkspaceId:
          state.activeWorkspaceId === id
            ? filtered[0]?.id ?? null
            : state.activeWorkspaceId,
      };
    }),

  updateWorkspace: (id, changes) =>
    set((state) => ({
      workspaces: state.workspaces.map((ws) =>
        ws.id === id ? { ...ws, ...changes } : ws
      ),
    })),

  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

  getNextOffsetX: () => {
    const { workspaces } = get();
    if (workspaces.length === 0) return 0;
    const maxOffset = Math.max(...workspaces.map((ws) => ws.offsetX));
    return maxOffset + WORKSPACE_GAP;
  },

  getNextColor: () => {
    const { workspaces } = get();
    return WORKSPACE_COLORS[workspaces.length % WORKSPACE_COLORS.length];
  },

  getWorkspaceById: (id) => {
    return get().workspaces.find((ws) => ws.id === id);
  },

  setWorkspaces: (workspaces) => set({ workspaces }),

  createDefaultWorkspace: (projectId) => {
    const ws: Workspace = {
      id: `ws-default-${projectId}`,
      name: 'Main Architecture',
      projectId,
      source: 'manual',
      color: WORKSPACE_COLORS[0],
      offsetX: 0,
      createdAt: new Date().toISOString(),
    };
    return ws;
  },
}));

export { WORKSPACE_GAP };
