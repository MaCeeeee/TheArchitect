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

// ─── Concurrency-limited map ───
// The portfolio enrichment fires 5 reads per project (one of them, /advisor/health,
// runs a full advisor scan server-side). Firing list.map() unbounded means 5×N
// simultaneous requests, which spikes the global rate limiter on larger portfolios
// and triggers the client 429-retry storm. Cap in-flight projects to a small pool so
// the burst stays flat (~POOL×5 concurrent) regardless of portfolio size. Results keep
// their original index; nothing is dropped — the dashboard just fills progressively.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        results[idx] = { status: 'fulfilled', value: await fn(items[idx]) };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const ENRICH_POOL_SIZE = 3;

// ─── Module-level snapshot cache (survives component remounts) ───
// THE-512: the guard used to be a per-mount `useRef(false)`, so it only blocked
// *concurrent* loads within one mount. A remount — e.g. DashboardPage being torn
// down and rebuilt when the 3D canvas fires `webglcontextlost` — reset the ref and
// re-fired the whole all-projects enrichment (5 reads/project, one a full advisor
// scan). Enough remounts stacked bursts past the per-IP rate limiter → 429 storm.
// Hoisting the result + in-flight promise to module scope makes the enrichment fire
// at most once per TTL no matter how often the hook (re)mounts, and dedupes any
// concurrent callers onto a single request.
const PORTFOLIO_TTL_MS = 30_000;

interface PortfolioSnapshot {
  projects: Project[];
  stats: Record<string, ProjectStats | null>;
  health: Record<string, HealthData | null>;
  risk: Record<string, RiskData | null>;
  cost: Record<string, CostData | null>;
  compliance: Record<string, ComplianceData | null>;
  fetchedAt: number;
}

let cachedSnapshot: PortfolioSnapshot | null = null;
let inFlight: Promise<PortfolioSnapshot> | null = null;

/** Test-only: clear the module cache between cases. */
export function __resetPortfolioCacheForTests(): void {
  cachedSnapshot = null;
  inFlight = null;
}

async function fetchPortfolioSnapshot(): Promise<PortfolioSnapshot> {
  // Clear stale single-project data when (re)loading the portfolio.
  useArchitectureStore.getState().clearProject();
  useWorkspaceStore.getState().setWorkspaces([]);

  const { data } = await projectAPI.list();
  const list: Project[] = Array.isArray(data) ? data : data.data || [];

  const stats: Record<string, ProjectStats | null> = {};
  const health: Record<string, HealthData | null> = {};
  const risk: Record<string, RiskData | null> = {};
  const cost: Record<string, CostData | null> = {};
  const compliance: Record<string, ComplianceData | null> = {};

  if (list.length > 0) {
    // Enrich each project in parallel, capped by the concurrency pool.
    const enrichResults = await mapWithConcurrency(list, ENRICH_POOL_SIZE, async (p) => {
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
    });

    for (const result of enrichResults) {
      if (result.status === 'fulfilled') {
        const { id, stats: s, health: h, risk: r, cost: c, compliance: comp } = result.value;
        stats[id] = s;
        health[id] = h;
        risk[id] = r;
        cost[id] = c;
        compliance[id] = comp;
      }
    }
  }

  return { projects: list, stats, health, risk, cost, compliance, fetchedAt: Date.now() };
}

/**
 * Return portfolio data, reusing a fresh cached snapshot and deduping concurrent
 * callers. `force` bypasses the TTL freshness check but still joins an in-flight
 * request rather than starting a second one (so spam-refresh can't storm either).
 */
function loadPortfolio(force: boolean): Promise<PortfolioSnapshot> {
  const fresh = cachedSnapshot !== null && Date.now() - cachedSnapshot.fetchedAt < PORTFOLIO_TTL_MS;
  if (!force && fresh) return Promise.resolve(cachedSnapshot!);
  if (inFlight) return inFlight;
  inFlight = fetchPortfolioSnapshot()
    .then((snap) => { cachedSnapshot = snap; return snap; })
    .finally(() => { inFlight = null; });
  return inFlight;
}

// ─── Hook ───

export function usePortfolioData(): PortfolioData {
  const [projects, setProjects] = useState<Project[]>(cachedSnapshot?.projects ?? []);
  const [stats, setStats] = useState<Record<string, ProjectStats | null>>(cachedSnapshot?.stats ?? {});
  const [health, setHealth] = useState<Record<string, HealthData | null>>(cachedSnapshot?.health ?? {});
  const [risk, setRisk] = useState<Record<string, RiskData | null>>(cachedSnapshot?.risk ?? {});
  const [cost, setCost] = useState<Record<string, CostData | null>>(cachedSnapshot?.cost ?? {});
  const [compliance, setCompliance] = useState<Record<string, ComplianceData | null>>(cachedSnapshot?.compliance ?? {});
  const [loading, setLoading] = useState(cachedSnapshot === null);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (force = false) => {
    setError(null);
    const willFetch = force || cachedSnapshot === null
      || Date.now() - cachedSnapshot.fetchedAt >= PORTFOLIO_TTL_MS;
    // Only show the spinner when we don't already have data to render.
    if (cachedSnapshot === null) setLoading(true);
    if (willFetch) setEnriching(true);

    try {
      const snap = await loadPortfolio(force);
      if (!mountedRef.current) return;
      setProjects(snap.projects);
      setStats(snap.stats);
      setHealth(snap.health);
      setRisk(snap.risk);
      setCost(snap.cost);
      setCompliance(snap.compliance);
    } catch {
      if (mountedRef.current) setError('Failed to load projects');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setEnriching(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  return { projects, stats, health, risk, cost, compliance, loading, enriching, error, refresh: () => load(true) };
}
