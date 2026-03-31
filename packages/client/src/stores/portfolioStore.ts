import { create } from 'zustand';
import { portfolioAPI } from '../services/api';

// Request deduplication — collapse identical in-flight requests into one promise
const inflight = new Map<string, Promise<void>>();
function dedup(key: string, fn: () => Promise<void>): Promise<void> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = fn().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

export interface PortfolioElement {
  id: string;
  name: string;
  type: string;
  layer: string;
  status: string;
  riskLevel: string;
  maturityLevel: number;
  description: string;
  lifecyclePhase: string | null;
  goLiveDate: string | null;
  endOfLifeDate: string | null;
  replacedBy: string | null;
  timeClassification: string | null;
  businessOwner: string | null;
  technicalOwner: string | null;
  businessCriticality: string | null;
  annualCost: number | null;
  userCount: number | null;
  inDegree: number;
  outDegree: number;
  updatedAt: string;
  createdAt: string;
}

export interface PortfolioSummary {
  totalApplications: number;
  totalServices: number;
  totalTechnology: number;
  lifecycleDistribution: Record<string, number>;
  statusDistribution: Record<string, number>;
  riskDistribution: Record<string, number>;
  criticalityDistribution: Record<string, number>;
  avgMaturity: number;
  totalAnnualCost: number;
  appsNearingEOL: number;
  appsWithoutOwner: number;
}

export interface LifecycleEvent {
  elementId: string;
  elementName: string;
  elementType: string;
  phase: string;
  goLiveDate: string | null;
  endOfLifeDate: string | null;
  status: string;
}

type SortField = 'name' | 'type' | 'layer' | 'status' | 'riskLevel' | 'maturityLevel' | 'lifecyclePhase' | 'annualCost' | 'userCount';
type SortDirection = 'asc' | 'desc';

interface PortfolioState {
  // Data
  items: PortfolioElement[];
  summary: PortfolioSummary | null;
  timeline: LifecycleEvent[];
  loading: boolean;
  error: string | null;

  // Filters
  searchQuery: string;
  filterTypes: string[];
  filterLayers: string[];
  filterStatus: string[];
  filterRisk: string[];
  filterLifecycle: string[];

  // Sort
  sortField: SortField;
  sortDirection: SortDirection;

  // View mode
  view: 'dashboard' | 'table' | 'timeline';

  // Actions
  fetchInventory: (projectId: string) => Promise<void>;
  fetchSummary: (projectId: string) => Promise<void>;
  fetchTimeline: (projectId: string) => Promise<void>;
  setSearchQuery: (q: string) => void;
  setFilterTypes: (types: string[]) => void;
  setFilterLayers: (layers: string[]) => void;
  setFilterStatus: (status: string[]) => void;
  setFilterRisk: (risk: string[]) => void;
  setFilterLifecycle: (phases: string[]) => void;
  setSort: (field: SortField) => void;
  setView: (view: 'dashboard' | 'table' | 'timeline') => void;
  updateElementLifecycle: (projectId: string, elementId: string, fields: Record<string, unknown>) => Promise<void>;
}

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  items: [],
  summary: null,
  timeline: [],
  loading: false,
  error: null,

  searchQuery: '',
  filterTypes: [],
  filterLayers: [],
  filterStatus: [],
  filterRisk: [],
  filterLifecycle: [],

  sortField: 'name',
  sortDirection: 'asc',

  view: 'dashboard',

  fetchInventory: async (projectId: string) => {
    const s = get();
    const filterSig = JSON.stringify([s.filterTypes, s.filterLayers, s.filterStatus, s.filterRisk, s.filterLifecycle, s.searchQuery]);
    return dedup(`inventory:${projectId}:${filterSig}`, async () => {
      set({ loading: true, error: null });
      try {
        const params: Record<string, string> = {};
        const st = get();
        if (st.filterTypes.length) params.types = st.filterTypes.join(',');
        if (st.filterLayers.length) params.layers = st.filterLayers.join(',');
        if (st.filterStatus.length) params.status = st.filterStatus.join(',');
        if (st.filterRisk.length) params.riskLevel = st.filterRisk.join(',');
        if (st.filterLifecycle.length) params.lifecyclePhase = st.filterLifecycle.join(',');
        if (st.searchQuery) params.search = st.searchQuery;

        const { data } = await portfolioAPI.getInventory(projectId, params);
        set({ items: data.data, loading: false });
      } catch (err: any) {
        set({ error: err.message || 'Failed to load inventory', loading: false });
      }
    });
  },

  fetchSummary: async (projectId: string) => {
    return dedup(`summary:${projectId}`, async () => {
      try {
        const { data } = await portfolioAPI.getSummary(projectId);
        set({ summary: data.data });
      } catch (err: any) {
        console.error('[Portfolio] Summary fetch error:', err);
      }
    });
  },

  fetchTimeline: async (projectId: string) => {
    return dedup(`timeline:${projectId}`, async () => {
      try {
        const { data } = await portfolioAPI.getTimeline(projectId);
        set({ timeline: data.data });
      } catch (err: any) {
        console.error('[Portfolio] Timeline fetch error:', err);
      }
    });
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setFilterTypes: (types) => set({ filterTypes: types }),
  setFilterLayers: (layers) => set({ filterLayers: layers }),
  setFilterStatus: (status) => set({ filterStatus: status }),
  setFilterRisk: (risk) => set({ filterRisk: risk }),
  setFilterLifecycle: (phases) => set({ filterLifecycle: phases }),

  setSort: (field) => {
    const { sortField, sortDirection } = get();
    if (sortField === field) {
      set({ sortDirection: sortDirection === 'asc' ? 'desc' : 'asc' });
    } else {
      set({ sortField: field, sortDirection: 'asc' });
    }
  },

  setView: (view) => set({ view }),

  updateElementLifecycle: async (projectId, elementId, fields) => {
    await portfolioAPI.updateLifecycle(projectId, elementId, fields);
    // Refresh inventory
    get().fetchInventory(projectId);
  },
}));
