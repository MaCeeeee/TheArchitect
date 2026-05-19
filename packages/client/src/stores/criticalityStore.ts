import { create } from 'zustand';
import type { CriticalityScoreEntry } from '@thearchitect/shared';

interface CriticalityStore {
  scores: CriticalityScoreEntry[];
  computedAt: string | null;
  loading: boolean;
  error: string | null;
  showGlow: boolean;
  selectedHotspotId: string | null;
  breakdownPopoverId: string | null;
  setScores: (scores: CriticalityScoreEntry[], computedAt: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  toggleGlow: () => void;
  setShowGlow: (v: boolean) => void;
  setSelectedHotspot: (id: string | null) => void;
  openBreakdownPopover: (id: string | null) => void;
  reset: () => void;
}

export const useCriticalityStore = create<CriticalityStore>((set) => ({
  scores: [],
  computedAt: null,
  loading: false,
  error: null,
  showGlow: true,
  selectedHotspotId: null,
  breakdownPopoverId: null,
  setScores: (scores, computedAt) => set({ scores, computedAt, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  toggleGlow: () => set((s) => ({ showGlow: !s.showGlow })),
  setShowGlow: (showGlow) => set({ showGlow }),
  setSelectedHotspot: (selectedHotspotId) => set({ selectedHotspotId }),
  openBreakdownPopover: (breakdownPopoverId) => set({ breakdownPopoverId }),
  reset: () =>
    set({
      scores: [],
      computedAt: null,
      loading: false,
      error: null,
      selectedHotspotId: null,
      breakdownPopoverId: null,
    }),
}));
