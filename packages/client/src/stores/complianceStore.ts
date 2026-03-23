import { create } from 'zustand';
import { compliancePipelineAPI } from '../services/api';
import type { PolicyDraft } from '@thearchitect/shared';

interface PipelineState {
  standardId: string;
  stage: 'uploaded' | 'mapped' | 'policies_generated' | 'roadmap_ready' | 'tracking';
  mappingStats: {
    total: number;
    compliant: number;
    partial: number;
    gap: number;
    unmapped: number;
  };
  policyStats: {
    generated: number;
    approved: number;
    rejected: number;
  };
  updatedAt: string;
}

interface PortfolioItem {
  standardId: string;
  standardName: string;
  standardType: string;
  standardVersion: string;
  stage: string;
  mappingStats: PipelineState['mappingStats'];
  policyStats: PipelineState['policyStats'];
  coverage: number;
  maturityLevel: number;
  updatedAt: string;
}

interface PortfolioOverview {
  totalStandards: number;
  trackedStandards: number;
  portfolio: PortfolioItem[];
}

interface ComplianceStore {
  // State
  pipelineStates: PipelineState[];
  portfolioOverview: PortfolioOverview | null;
  selectedStandardId: string | null;
  isLoading: boolean;
  error: string | null;

  // Policy draft state
  policyDrafts: PolicyDraft[];
  isGeneratingPolicies: boolean;
  policyGenerationProgress: string;

  // Actions
  loadPipelineStatus: (projectId: string) => Promise<void>;
  loadPortfolio: (projectId: string) => Promise<void>;
  refreshStats: (projectId: string, standardId: string) => Promise<void>;
  selectStandard: (standardId: string | null) => void;
  setPolicyDrafts: (drafts: PolicyDraft[]) => void;
  setGeneratingPolicies: (generating: boolean) => void;
  setPolicyGenerationProgress: (progress: string) => void;
  approvePolicies: (projectId: string, standardId: string, approved: PolicyDraft[]) => Promise<number>;
  clear: () => void;
}

export const useComplianceStore = create<ComplianceStore>((set, get) => ({
  pipelineStates: [],
  portfolioOverview: null,
  selectedStandardId: null,
  isLoading: false,
  error: null,
  policyDrafts: [],
  isGeneratingPolicies: false,
  policyGenerationProgress: '',

  loadPipelineStatus: async (projectId) => {
    set({ isLoading: true, error: null });
    try {
      const res = await compliancePipelineAPI.getPipelineStatus(projectId);
      set({ pipelineStates: res.data, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load pipeline status';
      set({ error: message, isLoading: false });
    }
  },

  loadPortfolio: async (projectId) => {
    set({ isLoading: true, error: null });
    try {
      const res = await compliancePipelineAPI.getPortfolio(projectId);
      set({ portfolioOverview: res.data, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load portfolio';
      set({ error: message, isLoading: false });
    }
  },

  refreshStats: async (projectId, standardId) => {
    try {
      await compliancePipelineAPI.refreshStats(projectId, standardId);
    } catch (err: unknown) {
      console.error('[ComplianceStore] Failed to refresh stats:', err);
    }
  },

  selectStandard: (standardId) => set({ selectedStandardId: standardId }),

  setPolicyDrafts: (drafts) => set({ policyDrafts: drafts }),

  setGeneratingPolicies: (generating) => set({ isGeneratingPolicies: generating }),

  setPolicyGenerationProgress: (progress) => set({ policyGenerationProgress: progress }),

  approvePolicies: async (projectId, standardId, approved) => {
    try {
      const res = await compliancePipelineAPI.approvePolicies(projectId, standardId, approved);
      const created = res.data.created as number;
      // Clear drafts after approval and reload portfolio
      set({ policyDrafts: [] });
      await get().loadPortfolio(projectId);
      return created;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to approve policies';
      set({ error: message });
      return 0;
    }
  },

  clear: () => set({
    pipelineStates: [],
    portfolioOverview: null,
    selectedStandardId: null,
    error: null,
    policyDrafts: [],
    isGeneratingPolicies: false,
    policyGenerationProgress: '',
  }),
}));
