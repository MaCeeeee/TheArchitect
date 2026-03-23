import { create } from 'zustand';
import type { ArchitectureLayer } from '@thearchitect/shared';

export type ViewMode = '3d' | '2d-topdown' | 'layer';
type SidebarPanel = 'explorer' | 'architect' | 'analyze' | 'copilot' | 'none';

interface UIState {
  viewMode: ViewMode;
  focusedLayer: ArchitectureLayer;
  sidebarPanel: SidebarPanel;
  isSidebarOpen: boolean;
  isPropertyPanelOpen: boolean;
  showWalkthrough: boolean;
  showChat: boolean;
  showMinimap: boolean;
  showMissionControl: boolean;
  showComplianceOverlay: boolean;
  complianceOverlaySection: string;

  setViewMode: (mode: ViewMode) => void;
  setFocusedLayer: (layer: ArchitectureLayer) => void;
  setSidebarPanel: (panel: SidebarPanel) => void;
  toggleSidebar: () => void;
  togglePropertyPanel: () => void;
  setShowWalkthrough: (show: boolean) => void;
  toggleChat: () => void;
  toggleMinimap: () => void;
  toggleMissionControl: () => void;
  openComplianceOverlay: (section?: string) => void;
  closeComplianceOverlay: () => void;
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
  showMissionControl: false,
  showComplianceOverlay: false,
  complianceOverlaySection: 'pipeline',

  setViewMode: (mode) => set({ viewMode: mode }),
  setFocusedLayer: (layer) => set({ focusedLayer: layer }),
  setSidebarPanel: (panel) => set({ sidebarPanel: panel }),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  togglePropertyPanel: () => set((s) => ({ isPropertyPanelOpen: !s.isPropertyPanelOpen })),
  setShowWalkthrough: (show) => set({ showWalkthrough: show }),
  toggleChat: () => set((s) => ({ showChat: !s.showChat })),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
  toggleMissionControl: () => set((s) => ({ showMissionControl: !s.showMissionControl })),
  openComplianceOverlay: (section) => set({ showComplianceOverlay: true, complianceOverlaySection: section || 'pipeline' }),
  closeComplianceOverlay: () => set({ showComplianceOverlay: false }),
}));
