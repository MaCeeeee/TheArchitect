import { create } from 'zustand';
import { architectureAPI } from '../services/api';
import { ARCHITECTURE_LAYERS } from '@thearchitect/shared/src/constants/togaf.constants';
import type { ArchitectureLayer, TOGAFDomain } from '@thearchitect/shared/src/types/architecture.types';

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface ArchitectureElement {
  id: string;
  type: string;
  name: string;
  description: string;
  layer: ArchitectureLayer;
  togafDomain: TOGAFDomain;
  maturityLevel: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  status: 'current' | 'target' | 'transitional' | 'retired';
  position3D: Position3D;
  metadata: Record<string, unknown>;
  workspaceId?: string;
  // AI Agent fields (populated when type === 'ai_agent')
  agentProvider?: 'openai' | 'anthropic' | 'google' | 'azure' | 'custom';
  agentModel?: string;
  agentPurpose?: string;
  autonomyLevel?: 'copilot' | 'semi_autonomous' | 'autonomous';
  costPerMonth?: number;
  lastActiveDate?: string;
  dataSources?: string[];
  outputTargets?: string[];
}

export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

interface HistoryEntry {
  elements: ArchitectureElement[];
  connections: Connection[];
}

interface ArchitectureState {
  projectId: string | null;
  projectName: string | null;
  elements: ArchitectureElement[];
  connections: Connection[];
  selectedElementId: string | null;
  selectedConnectionId: string | null;
  selectedElementIds: Set<string>;
  visibleLayers: Set<string>;
  isScenarioMode: boolean;
  contextMenu: { x: number; y: number; elementId: string } | null;
  isDragging: boolean;

  // Undo/Redo
  history: HistoryEntry[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;

  setProjectId: (projectId: string | null) => void;
  setProjectName: (name: string | null) => void;
  setElements: (elements: ArchitectureElement[]) => void;
  addElement: (element: ArchitectureElement) => void;
  updateElement: (id: string, changes: Partial<ArchitectureElement>) => void;
  removeElement: (id: string) => void;
  selectElement: (id: string | null) => void;
  toggleSelectElement: (id: string) => void;
  clearSelection: () => void;

  setConnections: (connections: Connection[]) => void;
  addConnection: (connection: Connection) => void;
  removeConnection: (id: string) => void;
  selectConnection: (id: string | null) => void;

  toggleLayer: (layer: string) => void;
  setScenarioMode: (enabled: boolean) => void;

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  openContextMenu: (x: number, y: number, elementId: string) => void;
  closeContextMenu: () => void;
  setDragging: (dragging: boolean) => void;

  importElements: (elements: ArchitectureElement[], connections: Connection[], workspaceId: string) => void;
  getElementsByWorkspace: (workspaceId: string) => ArchitectureElement[];
  removeWorkspaceElements: (workspaceId: string) => void;
  clearProject: () => void;
}

const ALL_LAYERS = new Set(ARCHITECTURE_LAYERS.map(l => l.id));
const MAX_HISTORY = 50;

export const useArchitectureStore = create<ArchitectureState>((set, get) => ({
  projectId: null,
  projectName: null,
  elements: [],
  connections: [],
  selectedElementId: null,
  selectedConnectionId: null,
  selectedElementIds: new Set<string>(),
  visibleLayers: new Set(ALL_LAYERS),
  isScenarioMode: false,
  contextMenu: null,
  isDragging: false,
  history: [],
  historyIndex: -1,
  canUndo: false,
  canRedo: false,

  pushHistory: () => {
    const { elements, connections, history, historyIndex } = get();
    const entry: HistoryEntry = {
      elements: JSON.parse(JSON.stringify(elements)),
      connections: JSON.parse(JSON.stringify(connections)),
    };
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(entry);
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
      canUndo: true,
      canRedo: false,
    });
  },

  undo: () => {
    const { historyIndex, history } = get();
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    set({
      elements: JSON.parse(JSON.stringify(prev.elements)),
      connections: JSON.parse(JSON.stringify(prev.connections)),
      historyIndex: historyIndex - 1,
      canUndo: historyIndex - 1 > 0,
      canRedo: true,
    });
  },

  redo: () => {
    const { historyIndex, history } = get();
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    set({
      elements: JSON.parse(JSON.stringify(next.elements)),
      connections: JSON.parse(JSON.stringify(next.connections)),
      historyIndex: historyIndex + 1,
      canUndo: true,
      canRedo: historyIndex + 1 < history.length - 1,
    });
  },

  setProjectId: (projectId) => set({ projectId }),
  setProjectName: (name) => set({ projectName: name }),
  setElements: (elements) => set({ elements }),
  addElement: (element) => {
    get().pushHistory();
    set((state) => ({ elements: [...state.elements, element] }));
    const projectId = get().projectId;
    if (projectId) {
      architectureAPI.createElement(projectId, { ...element } as Record<string, unknown>).catch((err) =>
        console.error('Failed to sync addElement:', err)
      );
    }
  },
  updateElement: (id, changes) => {
    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === id ? { ...el, ...changes } : el
      ),
    }));
    const projectId = get().projectId;
    if (projectId) {
      architectureAPI.updateElement(projectId, id, changes as Record<string, unknown>).catch((err) =>
        console.error('Failed to sync updateElement:', err)
      );
    }
  },
  removeElement: (id) => {
    get().pushHistory();
    set((state) => ({
      elements: state.elements.filter((el) => el.id !== id),
      connections: state.connections.filter(
        (c) => c.sourceId !== id && c.targetId !== id
      ),
      selectedElementId: state.selectedElementId === id ? null : state.selectedElementId,
      selectedElementIds: (() => {
        const next = new Set(state.selectedElementIds);
        next.delete(id);
        return next;
      })(),
    }));
    const projectId = get().projectId;
    if (projectId) {
      architectureAPI.deleteElement(projectId, id).catch((err) =>
        console.error('Failed to sync removeElement:', err)
      );
    }
  },
  selectElement: (id) =>
    set({ selectedElementId: id, selectedConnectionId: null, selectedElementIds: id ? new Set([id]) : new Set() }),
  toggleSelectElement: (id) =>
    set((state) => {
      const next = new Set(state.selectedElementIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return {
        selectedElementIds: next,
        selectedElementId: next.size === 1 ? Array.from(next)[0] : next.size === 0 ? null : state.selectedElementId,
        selectedConnectionId: null,
      };
    }),
  clearSelection: () =>
    set({ selectedElementId: null, selectedConnectionId: null, selectedElementIds: new Set() }),

  setConnections: (connections) => set({ connections }),
  addConnection: (connection) => {
    get().pushHistory();
    set((state) => ({ connections: [...state.connections, connection] }));
    const projectId = get().projectId;
    if (projectId) {
      architectureAPI.createConnection(projectId, { ...connection } as Record<string, unknown>).catch((err) =>
        console.error('Failed to sync addConnection:', err)
      );
    }
  },
  removeConnection: (id) => {
    get().pushHistory();
    set((state) => ({
      connections: state.connections.filter((c) => c.id !== id),
      selectedConnectionId: state.selectedConnectionId === id ? null : state.selectedConnectionId,
    }));
    const projectId = get().projectId;
    if (projectId) {
      architectureAPI.deleteConnection(projectId, id).catch((err) =>
        console.error('Failed to sync removeConnection:', err)
      );
    }
  },
  selectConnection: (id) => set({ selectedConnectionId: id, selectedElementId: null }),

  toggleLayer: (layer) =>
    set((state) => {
      const next = new Set(state.visibleLayers);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return { visibleLayers: next };
    }),
  setScenarioMode: (enabled) => set({ isScenarioMode: enabled }),

  openContextMenu: (x, y, elementId) => set({ contextMenu: { x, y, elementId } }),
  closeContextMenu: () => set({ contextMenu: null }),
  setDragging: (dragging) => set({ isDragging: dragging }),

  importElements: (newElements, newConnections, workspaceId) => {
    get().pushHistory();
    const tagged = newElements.map((el) => ({ ...el, workspaceId }));
    set((state) => ({
      elements: [...state.elements, ...tagged],
      connections: [...state.connections, ...newConnections],
    }));
  },

  getElementsByWorkspace: (workspaceId) => {
    return get().elements.filter((el) => el.workspaceId === workspaceId);
  },

  removeWorkspaceElements: (workspaceId) => {
    get().pushHistory();
    set((state) => {
      const removedIds = new Set(
        state.elements.filter((el) => el.workspaceId === workspaceId).map((el) => el.id)
      );
      return {
        elements: state.elements.filter((el) => el.workspaceId !== workspaceId),
        connections: state.connections.filter(
          (c) => !removedIds.has(c.sourceId) && !removedIds.has(c.targetId)
        ),
      };
    });
  },

  clearProject: () => {
    set({
      projectId: null,
      projectName: null,
      elements: [],
      connections: [],
      selectedElementId: null,
      selectedConnectionId: null,
      selectedElementIds: new Set<string>(),
      history: [],
      historyIndex: -1,
      canUndo: false,
      canRedo: false,
    });
  },
}));
