import { create } from 'zustand';
import { roadmapAPI } from '../services/api';
import type {
  TransformationRoadmap, RoadmapListItem, RoadmapConfig,
  MigrationCandidate, ElementStatus, CandidatesPreview,
} from '@thearchitect/shared';

interface RoadmapState {
  roadmaps: RoadmapListItem[];
  activeRoadmap: TransformationRoadmap | null;
  isGenerating: boolean;
  isLoading: boolean;
  error: string | null;
  selectedWave: number | null;

  // Candidates (TOGAF Gap Analysis)
  candidates: MigrationCandidate[];
  selectedCandidates: Map<string, ElementStatus>;
  isCandidatesLoading: boolean;
  candidatesLoaded: boolean;
  dataConfidence: CandidatesPreview['dataConfidence'] | null;

  generate: (projectId: string, config: Partial<RoadmapConfig>) => Promise<void>;
  loadList: (projectId: string) => Promise<void>;
  loadRoadmap: (projectId: string, roadmapId: string) => Promise<void>;
  deleteRoadmap: (projectId: string, roadmapId: string) => Promise<void>;
  selectWave: (waveNumber: number | null) => void;
  clear: () => void;

  // Candidate actions
  loadCandidates: (projectId: string) => Promise<void>;
  toggleCandidate: (elementId: string, targetStatus: ElementStatus) => void;
  setCandidateTarget: (elementId: string, targetStatus: ElementStatus) => void;
  selectAllCandidates: () => void;
  clearCandidates: () => void;
  selectByRisk: (minRisk: 'high' | 'critical') => void;
  resetToAutoDetect: () => void;
}

export const useRoadmapStore = create<RoadmapState>((set, get) => ({
  roadmaps: [],
  activeRoadmap: null,
  isGenerating: false,
  isLoading: false,
  error: null,
  selectedWave: null,
  candidates: [],
  selectedCandidates: new Map(),
  isCandidatesLoading: false,
  candidatesLoaded: false,
  dataConfidence: null,

  generate: async (projectId, config) => {
    const { selectedCandidates } = get();
    const targetStates: Record<string, string> = {};
    selectedCandidates.forEach((status, id) => { targetStates[id] = status; });

    set({ isGenerating: true, error: null });
    try {
      const { data } = await roadmapAPI.generate(projectId, {
        ...config,
        targetStates,
      } as Record<string, unknown>);
      const roadmap = data.data || data;
      set({ activeRoadmap: roadmap, isGenerating: false, selectedWave: null });
      get().loadList(projectId);
    } catch (err: any) {
      set({ isGenerating: false, error: err?.response?.data?.error || err.message || 'Generation failed' });
    }
  },

  loadList: async (projectId) => {
    try {
      const { data } = await roadmapAPI.list(projectId);
      set({ roadmaps: data.data || data || [] });
    } catch {
      // Silent fail for list
    }
  },

  loadRoadmap: async (projectId, roadmapId) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await roadmapAPI.get(projectId, roadmapId);
      set({ activeRoadmap: data.data || data, isLoading: false, selectedWave: null });
    } catch (err: any) {
      set({ isLoading: false, error: err?.response?.data?.error || 'Failed to load roadmap' });
    }
  },

  deleteRoadmap: async (projectId, roadmapId) => {
    try {
      await roadmapAPI.delete(projectId, roadmapId);
      set((s) => ({
        roadmaps: s.roadmaps.filter((r) => r.id !== roadmapId),
        activeRoadmap: s.activeRoadmap?.id === roadmapId ? null : s.activeRoadmap,
      }));
    } catch (err: any) {
      set({ error: err?.response?.data?.error || 'Failed to delete roadmap' });
    }
  },

  selectWave: (waveNumber) => set({ selectedWave: waveNumber }),

  clear: () => set({
    roadmaps: [],
    activeRoadmap: null,
    isGenerating: false,
    isLoading: false,
    error: null,
    selectedWave: null,
    candidates: [],
    selectedCandidates: new Map(),
    isCandidatesLoading: false,
    candidatesLoaded: false,
    dataConfidence: null,
  }),

  // ─── Candidate Actions ───

  loadCandidates: async (projectId) => {
    set({ isCandidatesLoading: true });
    try {
      const { data } = await roadmapAPI.getCandidates(projectId);
      const preview = data.data || data;
      const candidates: MigrationCandidate[] = preview.candidates || [];

      // Auto-select based on backend classification
      const selected = new Map<string, ElementStatus>();
      for (const c of candidates) {
        if (c.autoSelected) {
          selected.set(c.elementId, c.suggestedTarget);
        }
      }

      set({
        candidates,
        selectedCandidates: selected,
        isCandidatesLoading: false,
        candidatesLoaded: true,
        dataConfidence: preview.dataConfidence || null,
      });
    } catch {
      set({ isCandidatesLoading: false, candidatesLoaded: true });
    }
  },

  toggleCandidate: (elementId, targetStatus) => {
    set((s) => {
      const next = new Map(s.selectedCandidates);
      if (next.has(elementId)) {
        next.delete(elementId);
      } else {
        next.set(elementId, targetStatus);
      }
      return { selectedCandidates: next };
    });
  },

  setCandidateTarget: (elementId, targetStatus) => {
    set((s) => {
      const next = new Map(s.selectedCandidates);
      if (next.has(elementId)) {
        next.set(elementId, targetStatus);
      }
      return { selectedCandidates: next };
    });
  },

  selectAllCandidates: () => {
    set((s) => {
      const next = new Map<string, ElementStatus>();
      for (const c of s.candidates) {
        next.set(c.elementId, c.suggestedTarget);
      }
      return { selectedCandidates: next };
    });
  },

  clearCandidates: () => {
    set({ selectedCandidates: new Map() });
  },

  selectByRisk: (minRisk) => {
    const riskOrder = ['low', 'medium', 'high', 'critical'];
    const minIdx = riskOrder.indexOf(minRisk);
    set((s) => {
      const next = new Map<string, ElementStatus>();
      for (const c of s.candidates) {
        if (riskOrder.indexOf(c.riskLevel) >= minIdx) {
          next.set(c.elementId, c.suggestedTarget);
        }
      }
      return { selectedCandidates: next };
    });
  },

  resetToAutoDetect: () => {
    set((s) => {
      const next = new Map<string, ElementStatus>();
      for (const c of s.candidates) {
        if (c.autoSelected) {
          next.set(c.elementId, c.suggestedTarget);
        }
      }
      return { selectedCandidates: next };
    });
  },
}));
