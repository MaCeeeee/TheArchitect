import { create } from 'zustand';
import type { ArchitectureLayer } from '@thearchitect/shared';
import type { ElementType } from '@thearchitect/shared/src/types/architecture.types';

export type ViewMode = '3d' | '2d-topdown' | 'layer';
type SidebarPanel = 'explorer' | 'architect' | 'analyze' | 'comply' | 'copilot' | 'none';

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
  showPolicyBoard: boolean;
  // Connection drawing mode
  isConnectionMode: boolean;
  connectionSourceId: string | null;
  // Connection type picker
  connectionTargetId: string | null;
  showConnectionPicker: boolean;
  connectionPickerPosition: { x: number; y: number } | null;
  // Element palette
  isPaletteOpen: boolean;
  paletteSearch: string;
  recentTypes: ElementType[];
  favoriteTypes: ElementType[];
  // Viewpoint filtering
  activeViewpoint: string | null;

  setViewMode: (mode: ViewMode) => void;
  setFocusedLayer: (layer: ArchitectureLayer) => void;
  setSidebarPanel: (panel: SidebarPanel) => void;
  toggleSidebar: () => void;
  togglePropertyPanel: () => void;
  setShowWalkthrough: (show: boolean) => void;
  toggleChat: () => void;
  toggleMinimap: () => void;
  toggleMissionControl: () => void;
  togglePolicyBoard: () => void;
  openComplianceOverlay: (section?: string) => void;
  closeComplianceOverlay: () => void;
  enterConnectionMode: () => void;
  exitConnectionMode: () => void;
  setConnectionSource: (id: string | null) => void;
  // Connection type picker
  openConnectionPicker: (targetId: string, screenPos: { x: number; y: number }) => void;
  closeConnectionPicker: () => void;
  // Element palette
  togglePalette: () => void;
  setPaletteSearch: (q: string) => void;
  addRecentType: (type: ElementType) => void;
  toggleFavoriteType: (type: ElementType) => void;
  // Viewpoint filtering
  setActiveViewpoint: (id: string | null) => void;
}

// Load favorites from localStorage
function loadFavorites(): ElementType[] {
  try {
    const raw = localStorage.getItem('ta_favorite_types');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
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
  showPolicyBoard: true,

  setViewMode: (mode) => set({ viewMode: mode }),
  setFocusedLayer: (layer) => set({ focusedLayer: layer }),
  setSidebarPanel: (panel) => set({ sidebarPanel: panel }),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  togglePropertyPanel: () => set((s) => ({ isPropertyPanelOpen: !s.isPropertyPanelOpen })),
  setShowWalkthrough: (show) => set({ showWalkthrough: show }),
  toggleChat: () => set((s) => ({ showChat: !s.showChat })),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
  toggleMissionControl: () => set((s) => ({ showMissionControl: !s.showMissionControl })),
  togglePolicyBoard: () => set((s) => ({ showPolicyBoard: !s.showPolicyBoard })),
  openComplianceOverlay: (section) => set({ showComplianceOverlay: true, complianceOverlaySection: section || 'pipeline' }),
  closeComplianceOverlay: () => set({ showComplianceOverlay: false }),
  // Connection mode
  isConnectionMode: false,
  connectionSourceId: null,
  enterConnectionMode: () => set({ isConnectionMode: true, connectionSourceId: null, connectionTargetId: null, showConnectionPicker: false }),
  exitConnectionMode: () => set({ isConnectionMode: false, connectionSourceId: null, connectionTargetId: null, showConnectionPicker: false, connectionPickerPosition: null }),
  setConnectionSource: (id) => set({ connectionSourceId: id }),
  // Connection type picker
  connectionTargetId: null,
  showConnectionPicker: false,
  connectionPickerPosition: null,
  openConnectionPicker: (targetId, screenPos) => set({ connectionTargetId: targetId, showConnectionPicker: true, connectionPickerPosition: screenPos }),
  closeConnectionPicker: () => set({ connectionTargetId: null, showConnectionPicker: false, connectionPickerPosition: null }),
  // Element palette
  isPaletteOpen: false,
  paletteSearch: '',
  recentTypes: [],
  favoriteTypes: loadFavorites(),
  togglePalette: () => set((s) => ({ isPaletteOpen: !s.isPaletteOpen })),
  setPaletteSearch: (q) => set({ paletteSearch: q }),
  addRecentType: (type) => set((s) => {
    const recent = [type, ...s.recentTypes.filter(t => t !== type)].slice(0, 5);
    return { recentTypes: recent };
  }),
  toggleFavoriteType: (type) => set((s) => {
    const favs = s.favoriteTypes.includes(type)
      ? s.favoriteTypes.filter(t => t !== type)
      : [...s.favoriteTypes, type];
    localStorage.setItem('ta_favorite_types', JSON.stringify(favs));
    return { favoriteTypes: favs };
  }),
  // Viewpoint filtering
  activeViewpoint: null,
  setActiveViewpoint: (id) => set({ activeViewpoint: id }),
}));
