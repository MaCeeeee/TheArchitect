import { create } from 'zustand';
import { scenarioAPI } from '../services/api';
import type {
  TransformationScenario,
  ScenarioComparisonResult,
  McdaResult,
  ScenarioDelta,
} from '@thearchitect/shared';

interface ComplianceResult {
  framework: string;
  score: number;
  gapCount: number;
  estimatedPenalty: number;
  estimatedRemediationCost: number;
  details: { area: string; status: string; penalty: number }[];
}

interface RealOptionsResult {
  scenarioId: string;
  scenarioName: string;
  callValue: number;
  deferValue: number;
  recommendation: 'proceed' | 'defer' | 'abandon';
  parameters: { S: number; K: number; T: number; r: number; sigma: number };
}

interface ScenarioState {
  scenarios: TransformationScenario[];
  activeScenarioId: string | null;
  comparisonResult: ScenarioComparisonResult | null;
  mcdaResult: McdaResult | null;
  topsisResult: McdaResult | null;
  complianceResult: ComplianceResult | null;
  realOptionsResult: RealOptionsResult | null;
  loading: boolean;
  generatingVariants: boolean;
  error: string | null;

  fetchScenarios: (projectId: string) => Promise<void>;
  createScenario: (projectId: string, name: string, description?: string, deltas?: ScenarioDelta[]) => Promise<void>;
  deleteScenario: (projectId: string, scenarioId: string) => Promise<void>;
  updateDeltas: (projectId: string, scenarioId: string, deltas: ScenarioDelta[]) => Promise<void>;
  compare: (projectId: string, scenarioAId: string, scenarioBId: string) => Promise<void>;
  rank: (projectId: string, scenarioIds: string[], weights?: Record<string, number>) => Promise<void>;
  rankTopsis: (projectId: string, scenarioIds: string[], weights?: Record<string, number>) => Promise<void>;
  fetchCompliance: (projectId: string, scenarioId: string, framework: string) => Promise<void>;
  generateAIVariants: (projectId: string, scenarioId: string, count?: number) => Promise<void>;
  analyzeRealOptions: (projectId: string, scenarioId: string) => Promise<void>;
  setActiveScenario: (id: string | null) => void;
  clearComparison: () => void;
}

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  scenarios: [],
  activeScenarioId: null,
  comparisonResult: null,
  mcdaResult: null,
  topsisResult: null,
  complianceResult: null,
  realOptionsResult: null,
  loading: false,
  generatingVariants: false,
  error: null,

  fetchScenarios: async (projectId: string) => {
    set({ loading: true, error: null });
    try {
      const res = await scenarioAPI.list(projectId);
      set({ scenarios: res.data?.data || [], loading: false });
    } catch {
      set({ loading: false, error: 'Failed to load scenarios' });
    }
  },

  createScenario: async (projectId: string, name: string, description?: string, deltas?: ScenarioDelta[]) => {
    set({ loading: true, error: null });
    try {
      const res = await scenarioAPI.create(projectId, { name, description, deltas });
      const newScenario = res.data?.data;
      if (newScenario) {
        set((s) => ({ scenarios: [newScenario, ...s.scenarios], loading: false }));
      }
    } catch {
      set({ loading: false, error: 'Failed to create scenario' });
    }
  },

  deleteScenario: async (projectId: string, scenarioId: string) => {
    try {
      await scenarioAPI.delete(projectId, scenarioId);
      set((s) => ({
        scenarios: s.scenarios.filter((sc) => sc.id !== scenarioId && (sc as any)._id !== scenarioId),
        activeScenarioId: s.activeScenarioId === scenarioId ? null : s.activeScenarioId,
      }));
    } catch {
      set({ error: 'Failed to delete scenario' });
    }
  },

  updateDeltas: async (projectId: string, scenarioId: string, deltas: ScenarioDelta[]) => {
    set({ loading: true });
    try {
      const res = await scenarioAPI.updateDeltas(projectId, scenarioId, deltas);
      const updated = res.data?.data;
      if (updated) {
        set((s) => ({
          scenarios: s.scenarios.map((sc) => ((sc.id || (sc as any)._id) === scenarioId ? updated : sc)),
          loading: false,
        }));
      }
    } catch {
      set({ loading: false, error: 'Failed to update deltas' });
    }
  },

  compare: async (projectId: string, scenarioAId: string, scenarioBId: string) => {
    set({ loading: true, error: null });
    try {
      const res = await scenarioAPI.compare(projectId, scenarioAId, scenarioBId);
      set({ comparisonResult: res.data?.data || null, loading: false });
    } catch {
      set({ loading: false, error: 'Failed to compare scenarios' });
    }
  },

  rank: async (projectId: string, scenarioIds: string[], weights?: Record<string, number>) => {
    set({ loading: true, error: null });
    try {
      const res = await scenarioAPI.rank(projectId, scenarioIds, weights);
      set({ mcdaResult: res.data?.data || null, loading: false });
    } catch {
      set({ loading: false, error: 'Failed to rank scenarios' });
    }
  },

  rankTopsis: async (projectId: string, scenarioIds: string[], weights?: Record<string, number>) => {
    set({ loading: true, error: null });
    try {
      const res = await scenarioAPI.rankTopsis(projectId, scenarioIds, weights);
      set({ topsisResult: res.data?.data || null, loading: false });
    } catch {
      set({ loading: false, error: 'Failed to rank scenarios (TOPSIS)' });
    }
  },

  fetchCompliance: async (projectId: string, scenarioId: string, framework: string) => {
    set({ loading: true, error: null });
    try {
      const res = await scenarioAPI.getCompliance(projectId, scenarioId, framework);
      set({ complianceResult: res.data?.data || null, loading: false });
    } catch {
      set({ loading: false, error: 'Failed to fetch compliance score' });
    }
  },

  generateAIVariants: async (projectId: string, scenarioId: string, count?: number) => {
    set({ generatingVariants: true, error: null });
    try {
      const res = await scenarioAPI.generateAIVariants(projectId, scenarioId, count);
      const variants = res.data?.data || [];
      set((s) => ({
        scenarios: [...variants, ...s.scenarios],
        generatingVariants: false,
      }));
    } catch {
      set({ generatingVariants: false, error: 'Failed to generate AI variants' });
    }
  },

  analyzeRealOptions: async (projectId: string, scenarioId: string) => {
    set({ loading: true, error: null });
    try {
      const res = await scenarioAPI.realOptions(projectId, scenarioId);
      set({ realOptionsResult: res.data?.data || null, loading: false });
    } catch {
      set({ loading: false, error: 'Failed to analyze real options' });
    }
  },

  setActiveScenario: (id: string | null) => set({ activeScenarioId: id }),

  clearComparison: () => set({ comparisonResult: null, mcdaResult: null, topsisResult: null }),
}));
