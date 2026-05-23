import { create } from 'zustand';
import { compliancePipelineAPI, complianceMappingAPI, governanceAPI, architectureAPI } from '../services/api';
import { useArchitectureStore } from './architectureStore';
import type { PolicyDraft, PolicyViolationDTO, ComplianceMappingDTO } from '@thearchitect/shared';

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

  // Policy Violations state
  violations: PolicyViolationDTO[];
  violationsByElement: Map<string, number>;
  violationsByPolicy: Map<string, number>;
  isLoadingViolations: boolean;

  // UC-ICM-003 — Compliance Mappings (Regulation ↔ Element) state
  mappingsByElement: Map<string, ComplianceMappingDTO[]>;
  isLoadingMappingsForElement: Set<string>;
  // UC-ICM-003.1 — 3D Heat-Map state
  showComplianceGlow: boolean;
  isLoadingAllMappings: boolean;

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
  // Violation actions
  loadViolations: (projectId: string) => Promise<void>;
  loadViolationsByElement: (projectId: string, elementId: string) => Promise<PolicyViolationDTO[]>;

  // UC-ICM-003 — Compliance Mapping actions
  loadMappingsForElement: (projectId: string, elementId: string) => Promise<ComplianceMappingDTO[]>;
  invalidateMappingsForElement: (elementId: string) => void;
  // UC-ICM-003.1 — Heat-Map: bulk-load all mappings + populate mappingsByElement
  loadAllMappings: (projectId: string) => Promise<void>;
  toggleComplianceGlow: () => void;

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
  violations: [],
  violationsByElement: new Map(),
  violationsByPolicy: new Map(),
  isLoadingViolations: false,
  mappingsByElement: new Map(),
  isLoadingMappingsForElement: new Set(),
  showComplianceGlow: false,
  isLoadingAllMappings: false,

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
      // Reload pipeline status so PhaseBar updates (stage may advance)
      const res = await compliancePipelineAPI.getPipelineStatus(projectId);
      set({ pipelineStates: res.data });
    } catch (err: unknown) {
      if (import.meta.env.DEV) console.error('[ComplianceStore] Failed to refresh stats:', err);
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
      // Clear drafts after approval, refresh pipeline stats (may advance to policies_generated)
      set({ policyDrafts: [] });
      await get().refreshStats(projectId, standardId);
      await get().loadPortfolio(projectId);
      // Server now also projects each approved policy as an ArchiMate
      // requirement element on the motivation plateau (with an influence
      // edge from the regulatory driver). Pull the new elements + edges
      // into the architecture store so the sidebar / 3D / X-Ray reflect
      // them without a full reload.
      try {
        const [elementsRes, connectionsRes] = await Promise.all([
          architectureAPI.getElements(projectId),
          architectureAPI.getConnections(projectId),
        ]);
        const archStore = useArchitectureStore.getState();
        if (elementsRes?.data?.data) archStore.setElements(elementsRes.data.data);
        if (connectionsRes?.data?.data) archStore.setConnections(connectionsRes.data.data);
      } catch {
        // architecture refresh is best-effort — the policies were saved
      }
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

  loadViolations: async (projectId) => {
    // Prevent concurrent/rapid-fire calls (WebSocket events can cascade)
    const state = get();
    if (state.isLoadingViolations) return;

    set({ isLoadingViolations: true });
    try {
      const res = await governanceAPI.getViolations(projectId, { status: 'open', limit: 500 });
      const violations: PolicyViolationDTO[] = res.data.data || [];

      // Build lookup maps
      const byElement = new Map<string, number>();
      const byPolicy = new Map<string, number>();
      for (const v of violations) {
        byElement.set(v.elementId, (byElement.get(v.elementId) || 0) + 1);
        byPolicy.set(v.policyId, (byPolicy.get(v.policyId) || 0) + 1);
      }

      set({
        violations,
        violationsByElement: byElement,
        violationsByPolicy: byPolicy,
        isLoadingViolations: false,
      });
    } catch {
      set({ isLoadingViolations: false });
    }
  },

  loadViolationsByElement: async (projectId, elementId) => {
    try {
      const res = await governanceAPI.getViolationsByElement(projectId, elementId);
      return (res.data.data || []) as PolicyViolationDTO[];
    } catch {
      return [];
    }
  },

  // UC-ICM-003 — Compliance Mappings
  loadMappingsForElement: async (projectId, elementId) => {
    // Cache hit?
    const cached = get().mappingsByElement.get(elementId);
    if (cached) return cached;

    // Already loading?
    if (get().isLoadingMappingsForElement.has(elementId)) {
      return [];
    }

    set((state) => {
      const loading = new Set(state.isLoadingMappingsForElement);
      loading.add(elementId);
      return { isLoadingMappingsForElement: loading };
    });

    try {
      const res = await complianceMappingAPI.getByElement(projectId, elementId);
      const mappings = (res.data?.data || []) as ComplianceMappingDTO[];
      set((state) => {
        const next = new Map(state.mappingsByElement);
        next.set(elementId, mappings);
        const loading = new Set(state.isLoadingMappingsForElement);
        loading.delete(elementId);
        return { mappingsByElement: next, isLoadingMappingsForElement: loading };
      });
      return mappings;
    } catch (err) {
      console.error('[complianceStore] loadMappingsForElement failed:', err);
      set((state) => {
        const loading = new Set(state.isLoadingMappingsForElement);
        loading.delete(elementId);
        return { isLoadingMappingsForElement: loading };
      });
      return [];
    }
  },

  invalidateMappingsForElement: (elementId) => {
    set((state) => {
      const next = new Map(state.mappingsByElement);
      next.delete(elementId);
      return { mappingsByElement: next };
    });
  },

  loadAllMappings: async (projectId) => {
    if (get().isLoadingAllMappings) return;
    set({ isLoadingAllMappings: true });
    try {
      const res = await complianceMappingAPI.getAll(projectId);
      const all = (res.data?.data || []) as ComplianceMappingDTO[];
      // Group by elementId
      const byElement = new Map<string, ComplianceMappingDTO[]>();
      for (const m of all) {
        const arr = byElement.get(m.elementId) ?? [];
        arr.push(m);
        byElement.set(m.elementId, arr);
      }
      // Sort each group by confidence DESC (server-side does this already, but defensive)
      for (const [, arr] of byElement) {
        arr.sort((a, b) => b.confidence - a.confidence);
      }
      set({ mappingsByElement: byElement, isLoadingAllMappings: false });
    } catch (err) {
      console.error('[complianceStore] loadAllMappings failed:', err);
      set({ isLoadingAllMappings: false });
    }
  },

  toggleComplianceGlow: () => {
    set((state) => ({ showComplianceGlow: !state.showComplianceGlow }));
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
    violations: [],
    violationsByElement: new Map(),
    violationsByPolicy: new Map(),
    mappingsByElement: new Map(),
    isLoadingMappingsForElement: new Set(),
    isLoadingViolations: false,
  }),
}));
