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

interface ComplianceSnapshot {
  _id: string;
  projectId: string;
  standardId?: string;
  type: 'actual' | 'projected';
  waveNumber?: number;
  policyComplianceScore: number;
  standardCoverageScore: number;
  totalSections: number;
  compliantSections: number;
  partialSections: number;
  gapSections: number;
  totalViolations: number;
  maturityLevel: number;
  createdAt: string;
}

interface AuditChecklistItem {
  id: string;
  sectionNumber: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'evidence_collected' | 'verified';
  evidence: Array<{ type: string; referenceId: string; description: string }>;
  assignedTo?: string;
  dueDate?: string;
  notes: string;
}

interface AuditChecklist {
  _id: string;
  projectId: string;
  standardId: string;
  name: string;
  targetDate: string;
  responsibleUserId?: { _id: string; name: string; email: string };
  items: AuditChecklistItem[];
  overallReadiness: number;
  createdAt: string;
  updatedAt: string;
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

  // Snapshot state
  snapshots: ComplianceSnapshot[];
  isLoadingSnapshots: boolean;

  // Audit checklist state
  auditChecklists: AuditChecklist[];
  selectedChecklist: AuditChecklist | null;
  isLoadingChecklists: boolean;

  // Actions
  loadPipelineStatus: (projectId: string) => Promise<void>;
  loadPortfolio: (projectId: string) => Promise<void>;
  refreshStats: (projectId: string, standardId: string) => Promise<void>;
  selectStandard: (standardId: string | null) => void;
  setPolicyDrafts: (drafts: PolicyDraft[]) => void;
  setGeneratingPolicies: (generating: boolean) => void;
  setPolicyGenerationProgress: (progress: string) => void;
  approvePolicies: (projectId: string, standardId: string, approved: PolicyDraft[]) => Promise<number>;
  // Snapshot actions
  loadSnapshots: (projectId: string, standardId?: string) => Promise<void>;
  captureSnapshot: (projectId: string, standardId?: string) => Promise<void>;
  // Audit checklist actions
  loadAuditChecklists: (projectId: string) => Promise<void>;
  loadAuditChecklist: (projectId: string, id: string) => Promise<void>;
  createAuditChecklist: (projectId: string, data: { standardId: string; name: string; targetDate: string }) => Promise<string | null>;
  updateChecklistItem: (projectId: string, checklistId: string, itemId: string, data: Record<string, unknown>) => Promise<void>;
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
  snapshots: [],
  isLoadingSnapshots: false,
  auditChecklists: [],
  selectedChecklist: null,
  isLoadingChecklists: false,

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

  loadSnapshots: async (projectId, standardId) => {
    set({ isLoadingSnapshots: true });
    try {
      const res = await compliancePipelineAPI.getSnapshots(projectId, standardId);
      set({ snapshots: res.data, isLoadingSnapshots: false });
    } catch {
      set({ isLoadingSnapshots: false });
    }
  },

  captureSnapshot: async (projectId, standardId) => {
    try {
      await compliancePipelineAPI.captureSnapshot(projectId, standardId);
      await get().loadSnapshots(projectId, standardId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to capture snapshot';
      set({ error: message });
    }
  },

  loadAuditChecklists: async (projectId) => {
    set({ isLoadingChecklists: true });
    try {
      const res = await compliancePipelineAPI.getAuditChecklists(projectId);
      set({ auditChecklists: res.data, isLoadingChecklists: false });
    } catch {
      set({ isLoadingChecklists: false });
    }
  },

  loadAuditChecklist: async (projectId, id) => {
    try {
      const res = await compliancePipelineAPI.getAuditChecklist(projectId, id);
      set({ selectedChecklist: res.data });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load checklist';
      set({ error: message });
    }
  },

  createAuditChecklist: async (projectId, data) => {
    try {
      const res = await compliancePipelineAPI.createAuditChecklist(projectId, data);
      await get().loadAuditChecklists(projectId);
      return res.data._id as string;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create checklist';
      set({ error: message });
      return null;
    }
  },

  updateChecklistItem: async (projectId, checklistId, itemId, data) => {
    try {
      const res = await compliancePipelineAPI.updateChecklistItem(projectId, checklistId, itemId, data);
      set({ selectedChecklist: res.data });
      // Also refresh the list to update readiness scores
      await get().loadAuditChecklists(projectId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update item';
      set({ error: message });
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
    snapshots: [],
    isLoadingSnapshots: false,
    auditChecklists: [],
    selectedChecklist: null,
    isLoadingChecklists: false,
  }),
}));
