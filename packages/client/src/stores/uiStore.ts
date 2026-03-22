import { create } from 'zustand';
import type { ArchitectureLayer } from '@thearchitect/shared';

export type ViewMode = '3d' | '2d-topdown' | 'layer';
type SidebarPanel = 'explorer' | 'properties' | 'togaf' | 'analytics' | 'governance' | 'marketplace' | 'copilot' | 'settings' | 'none';

interface UIState {
  viewMode: ViewMode;
  focusedLayer: ArchitectureLayer;
  sidebarPanel: SidebarPanel;
  isSidebarOpen: boolean;
  isPropertyPanelOpen: boolean;
  showWalkthrough: boolean;
  showChat: boolean;
  showMinimap: boolean;

  setViewMode: (mode: ViewMode) => void;
  setFocusedLayer: (layer: ArchitectureLayer) => void;
  setSidebarPanel: (panel: SidebarPanel) => void;
  toggleSidebar: () => void;
  togglePropertyPanel: () => void;
  setShowWalkthrough: (show: boolean) => void;
  toggleChat: () => void;
  toggleMinimap: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  viewMode: '3d',
  focusedLayer: 'business',
  sidebarPanel: 'explorer',
  isSidebarOpen: true,
  isPropertyPanelOpen: true,
  showWalkthrough: false,
  showChat: false,
  showMinimap: true,

  setViewMode: (mode) => set({ viewMode: mode }),
  setFocusedLayer: (layer) => set({ focusedLayer: layer }),
  setSidebarPanel: (panel) => set({ sidebarPanel: panel }),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  togglePropertyPanel: () => set((s) => ({ isPropertyPanelOpen: !s.isPropertyPanelOpen })),
  setShowWalkthrough: (show) => set({ showWalkthrough: show }),
  toggleChat: () => set((s) => ({ showChat: !s.showChat })),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
}));
