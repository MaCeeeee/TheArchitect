import { useEffect, useState, useCallback, useRef } from 'react';
import { projectAPI, advisorAPI, analyticsAPI, compliancePipelineAPI } from '../services/api';
import { useArchitectureStore } from '../stores/architectureStore';
import { useWorkspaceStore } from '../stores/workspaceStore';

// ─── Types ───

export interface Project {
  _id: string;
  name: string;
  description?: string;
  tags?: string[];
  updatedAt?: string;
}

export interface ProjectStats {
  elementCount: number;
  connectionCount: number;
  currentPhase: number;
  healthScore: number;
}

export interface HealthData {
  healthScore: {
    total: number;
    trend: 'up' | 'down' | 'stable';
    trendDelta: number;
    factors: Array<{ factor: string; weight: number; score: number; description: string }>;
  };
}

export interface RiskSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  averageScore: number;
}

export interface RiskData {
  summary: RiskSummary;
}

export interface CostData {
  totalCost: number;
  optimizationTotal: number;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
}

export interface CompliancePortfolioItem {
  standardId: string;
  standardName: string;
  standardType: string;
  stage: string;
  coverage: number;
  maturityLevel: number;
  mappingStats: { total: number; compliant: number; partial: number; gap: number; unmapped: number };
  policyStats: { generated: number; approved: number; rejected: number };
}

export interface ComplianceData {
  totalStandards: number;
  trackedStandards: number;
  portfolio: CompliancePortfolioItem[];
}

export interface PortfolioData {
  projects: Project[];
  stats: Record<string, ProjectStats | null>;
  health: Record<string, HealthData | null>;
  risk: Record<string, RiskData | null>;
  cost: Record<string, CostData | null>;
  compliance: Record<string, ComplianceData | null>;
  loading: boolean;
  enriching: boolean;
  error: string | null;
  refresh: () => void;
}

// ─── Hook ───

export function usePortfolioData(): PortfolioData {
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Record<string, ProjectStats | null>>({});
  const [health, setHealth] = useState<Record<string, HealthData | null>>({});
  const [risk, setRisk] = useState<Record<string, RiskData | null>>({});
  const [cost, setCost] = useState<Record<string, CostData | null>>({});
  const [compliance, setCompliance] = useState<Record<string, ComplianceData | null>>({});
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    // Prevent concurrent loads (spam-clicking Refresh)
    if (loadingRef.current) return;
    loadingRef.current = true;

    setLoading(true);
    setError(null);

    // Clear stale project data
    useArchitectureStore.getState().clearProject();
    useWorkspaceStore.getState().setWorkspaces([]);

    try {
      const { data } = await projectAPI.list();
      const list: Project[] = Array.isArray(data) ? data : data.data || [];
      setProjects(list);
      setLoading(false);

      if (list.length === 0) {
        setEnriching(false);
        return;
      }

      // Phase 2: enrich each project in parallel
      setEnriching(true);

      const enrichResults = await Promise.allSettled(
        list.map(async (p) => {
          const [statsRes, healthRes, riskRes, costRes, complianceRes] = await Promise.allSettled([
            projectAPI.getStats(p._id),
            advisorAPI.health(p._id),
            analyticsAPI.getRisk(p._id),
            analyticsAPI.getCost(p._id),
            compliancePipelineAPI.getPortfolio(p._id),
          ]);

          // Unwrap axios { data } and optional server { data } wrapper
          const unwrap = (res: PromiseSettledResult<any>) => {
            if (res.status !== 'fulfilled') return null;
            const body = res.value.data;
            return body?.data ?? body;
          };

          // Health endpoint returns healthScore directly (not wrapped in { healthScore }),
          // so we normalize it to match HealthData shape
          const rawHealth = unwrap(healthRes);
          const healthData = rawHealth?.total !== undefined
            ? { healthScore: rawHealth }   // /advisor/health returns score object directly
            : rawHealth;                    // /advisor/scan returns { healthScore: ... }

          return {
            id: p._id,
            stats: unwrap(statsRes),
            health: healthData,
            risk: unwrap(riskRes),
            cost: unwrap(costRes),
            compliance: unwrap(complianceRes),
          };
        })
      );

      const newStats: Record<string, ProjectStats | null> = {};
      const newHealth: Record<string, HealthData | null> = {};
      const newRisk: Record<string, RiskData | null> = {};
      const newCost: Record<string, CostData | null> = {};
      const newCompliance: Record<string, ComplianceData | null> = {};

      for (const result of enrichResults) {
        if (result.status === 'fulfilled') {
          const { id, stats: s, health: h, risk: r, cost: c, compliance: comp } = result.value;
          newStats[id] = s;
          newHealth[id] = h;
          newRisk[id] = r;
          newCost[id] = c;
          newCompliance[id] = comp;
        }
      }

      setStats(newStats);
      setHealth(newHealth);
      setRisk(newRisk);
      setCost(newCost);
      setCompliance(newCompliance);
    } catch {
      setError('Failed to load projects');
    } finally {
      setLoading(false);
      setEnriching(false);
      // Cooldown: block re-fetch for 2s to avoid 429
      setTimeout(() => { loadingRef.current = false; }, 2000);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { projects, stats, health, risk, cost, compliance, loading, enriching, error, refresh: load };
}
