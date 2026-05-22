# UC-EXEC-001 — C-Level Executive Dashboard (CEO / CIO / CFO) Implementation Plan v2

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Analyze Dashboard with a Persona-Tab-System (CEO / CIO / CFO) backed by a single aggregated `executive-summary` endpoint, so a C-Level user sees one cohesive narrative per persona — headline + 4–5 KPI cards — without manually wiring stores together.

**Architecture:**
- **Step 0 (refactor):** Extract criticality compute logic from `architecture.routes.ts` into a reusable `criticalityRunner.service.ts` (no behavior change). Keeps the dashboard endpoint DRY.
- **Backend** exposes `GET /api/projects/:projectId/executive-summary` that fans-out internally to:
  - `criticalityRunner.runForProject()` → top scores + dominant-factor counts
  - `computeRelativeRankings()` (cost-engine) → total/p10/p90/optimization + tier dist
  - `Regulation.countDocuments({})` → 16 paragraphs from UC-ICM-001
  - `StandardMapping.countDocuments({ projectId })` → mapping ratio
  - `TransformationRoadmap.findOne()` → wave status
  - `Scenario.find({ projectId }).countDocuments()` → initiatives count
- Returns `ExecutiveSummary` with `ceo`, `cio`, `cfo` sub-payloads + a `headline` per persona.
- **Frontend** extends `AnalyzeDashboard.tsx` with a tab strip (default = CIO), a single `useExecutiveSummary(projectId)` hook fetching once, and 3 persona views rendering persona-specific cards. The OLD 6 cards are **folded INTO** the persona tabs (no banner) — Total TCO/Optimization/Roadmap live in CFO, Risk/Progress live in CIO, Scenarios live in CEO.
- No new score engines — pure aggregation + presentation.

**Tech Stack:** Express + Mongoose + Neo4j (via existing helpers), React 18 + Zustand + Tailwind, no new deps.

**Linear:** THE-286 (parent) · THE-287–THE-291 (5 REQs)

**Constants (single source of truth, both backend + frontend):**

```typescript
// packages/shared/src/constants/executive-summary.constants.ts
export const HEADLINE_THRESHOLDS = {
  cio: { critical_hotspots: 5, critical_spofs: 3, warning_hotspots: 1 },
  ceo: { critical_drivers: 3, mapping_low_pct: 30 },
  cfo: { critical_tier: 3, warning_tier: 2 },
} as const;
```

---

## Chunk 1: Refactor — extract criticality compute

### Task 1: criticalityRunner.service.ts (no behavior change)

**Files:**
- Create: `packages/server/src/services/criticalityRunner.service.ts`
- Modify: `packages/server/src/routes/architecture.routes.ts` (replace inline block lines ~1480–1620 with `runCriticalityForProject(projectId, { topN, forceRefresh, weights })` call)
- Test: `packages/server/src/__tests__/criticalityRunner.service.test.ts`

- [ ] **Step 1: Write characterization test**

Capture current behavior of the existing route before refactor:
1. Returns empty `scores: []` when project has 0 elements.
2. Returns top-N sorted by totalScore desc.
3. Honours `forceRefresh` (skip cache).
4. Cache hit returns same scores + `fromCache: true`.
5. Persists full set to cache (not just topN).

- [ ] **Step 2: Implement runner**

```typescript
// packages/server/src/services/criticalityRunner.service.ts
import { computeCriticality, type CriticalityComputeInput, type CriticalityElement, type CriticalityConnection, type StandardMappingInput, type RoadmapWaveInput } from './criticality.service';
import { computeInputHash, getCachedScores, saveCachedScores } from './criticalityCache.service';
import { StandardMapping } from '../models/StandardMapping';
import { TransformationRoadmap } from '../models/TransformationRoadmap';
import { Project } from '../models/Project';
import { runCypher } from '../config/neo4j';
import { serializeNeo4jProperties } from '../utils/neo4jSerialize';
import { DEFAULT_FACTOR_WEIGHTS, type FactorWeights, type CriticalityScoreEntry } from '@thearchitect/shared';

export interface RunCriticalityOptions {
  topN?: number;
  forceRefresh?: boolean;
  weightsOverride?: FactorWeights;
}

export interface RunCriticalityResult {
  scores: CriticalityScoreEntry[];        // full set, NOT sliced
  computedAt: Date;
  weights: FactorWeights;
  fromCache: boolean;
}

export async function runCriticalityForProject(
  projectId: string,
  opts: RunCriticalityOptions = {},
): Promise<RunCriticalityResult> {
  // Move the EXACT inline logic from architecture.routes.ts here.
  // Returns full sorted scores; caller slices to topN.
}
```

Move Neo4j load + cache hash + computeCriticality + sort into this function. Return **full** sorted list.

- [ ] **Step 3: Replace inline block in route**

```typescript
// architecture.routes.ts (was lines 1480-1620)
const result = await runCriticalityForProject(projectId, { weightsOverride: settingsWeights, forceRefresh });
const response: CriticalityResponse = {
  scores: result.scores.slice(0, topN),
  computedAt: result.computedAt.toISOString(),
  weights: result.weights,
  fromCache: result.fromCache,
  topN,
};
res.json(response);
```

- [ ] **Step 4: Run all criticality tests**

Run: `cd packages/server && npm test -- criticality`
Expected: existing tests PASS + 5 new characterization tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/criticalityRunner.service.ts \
        packages/server/src/routes/architecture.routes.ts \
        packages/server/src/__tests__/criticalityRunner.service.test.ts
git commit -m "refactor(uc-exec-001): extract runCriticalityForProject service (THE-287)"
```

---

## Chunk 2: Shared types + constants

### Task 2: ExecutiveSummary shared type + constants

**Files:**
- Create: `packages/shared/src/types/executive-summary.types.ts`
- Create: `packages/shared/src/constants/executive-summary.constants.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write types**

```typescript
// executive-summary.types.ts
export type HeadlineTone = 'positive' | 'warning' | 'critical' | 'neutral';

export interface ExecutiveHeadline {
  title: string;       // "5 architectural hotspots require attention"
  subtitle: string;    // "Top: Payment Gateway (score 87)"
  tone: HeadlineTone;
}

export interface CeoView {
  headline: ExecutiveHeadline;
  complianceCoverage: {
    regulationsCrawled: number;       // Regulation.count (global)
    standardMappings: number;         // StandardMapping.count for this project
    mappingCoveragePct: number;       // mappings / elements
  };
  transformationProgress: {
    percent: number;                  // atTarget / total
    atTarget: number;
    total: number;
  };
  strategicRisks: {
    criticalDriverCount: number;      // motivation-layer scores ≥ 60
    topRiskName: string | null;
  };
  activeInitiatives: {
    scenarioCount: number;
    roadmapStatus: string | null;     // "active" | "draft" | null
  };
}

export interface CioView {
  headline: ExecutiveHeadline;
  criticalHotspots: {
    count: number;                    // scores ≥ 60 excluding motivation
    topName: string | null;
    topScore: number;
  };
  techDebtIndex: {
    score: number;                    // 0–100, mean (1 - maturity/5) × 100
    immatureElements: number;         // maturityLevel ≤ 2
  };
  spofs: {
    count: number;                    // dominantFactor === 'spof'
    topElement: string | null;
  };
  complianceStatus: {
    regulationsCrawled: number;
    mappedElementCount: number;
    coveragePct: number;
  };
  roadmapHealth: {
    waves: number;
    status: string | null;            // 'active' | 'draft' | null
  };
}

export interface CfoView {
  headline: ExecutiveHeadline;
  totalTco: {
    value: number;
    p10: number;
    p90: number;
  };
  costHotspots: {
    dominantTier: 0 | 1 | 2 | 3;
    topElement: string | null;
    topElementCost: number;
  };
  probabilisticCost: {                // NOTE: P10/P90 (no stdev — we don't compute it)
    p10: number;
    p50: number;
    p90: number;
  };
  optimizationPotential: {
    value: number;
    percentOfTco: number;
  };
  investmentHeatmap: {
    tierCounts: [number, number, number, number];  // counts per tier 0..3
  };
}

export interface ExecutiveSummary {
  projectId: string;
  generatedAt: string;
  fromCache: boolean;
  ceo: CeoView;
  cio: CioView;
  cfo: CfoView;
}
```

- [ ] **Step 2: Constants file (as above in plan header)**

- [ ] **Step 3: Re-export both in `packages/shared/src/index.ts`**

- [ ] **Step 4: Build shared**

Run: `npx turbo run build --filter=@thearchitect/shared`

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types/executive-summary.types.ts \
        packages/shared/src/constants/executive-summary.constants.ts \
        packages/shared/src/index.ts
git commit -m "feat(uc-exec-001): shared ExecutiveSummary types + thresholds (THE-287)"
```

---

## Chunk 3: Backend aggregator service

### Task 3: executiveSummary.service.ts

**Files:**
- Create: `packages/server/src/services/executiveSummary.service.ts`
- Test: `packages/server/src/__tests__/executiveSummary.service.test.ts`

**Headline derivation table (use HEADLINE_THRESHOLDS):**

| Persona | Tone | Condition | Title example | Subtitle example |
|---|---|---|---|---|
| CEO | critical | `regulationsCrawled > 0 && coveragePct < 30` | "Compliance gap critical" | "Only 12% of standards mapped" |
| CEO | warning | `criticalDriverCount ≥ 3` | "Strategic drivers at risk" | "3 critical drivers need attention" |
| CEO | positive | otherwise | "Transformation on track" | "65% progress · 16 regulations covered" |
| CEO | neutral | no elements + no regulations | "Set up your architecture" | "Start by importing or modeling elements" |
| CIO | critical | `criticalHotspots.count ≥ 5 \|\| spofs.count ≥ 3` | "X architectural hotspots require attention" | "Top: <name> (score Y)" |
| CIO | warning | `criticalHotspots.count ≥ 1` | "X hotspots detected" | "Review CritiCalita dashboard" |
| CIO | positive | otherwise | "Architecture healthy" | "No critical hotspots" |
| CFO | critical | `dominantTier === 3` | "Tier-3 cost exposure" | "Top: <name> ($X.YM)" |
| CFO | warning | `dominantTier === 2` | "Tier-2 cost concentration" | "$X.YM concentrated in N elements" |
| CFO | neutral | otherwise | "Cost profile stable" | "Total TCO $X.YM · P10–P90 $A.B–$C.D" |

- [ ] **Step 1: Write failing tests**

Test cases:
1. Empty project (0 elements) → all counts 0, headlines all `neutral`, no exceptions.
2. Project with 5 SPOFs → `cio.headline.tone === 'critical'`, `cio.spofs.count === 5`.
3. Regulations exist but no mappings → `ceo.complianceCoverage.mappingCoveragePct === 0`, `ceo.headline.tone === 'critical'`.
4. Project with Tier 3 cost profile → `cfo.headline.tone === 'critical'`, `cfo.costHotspots.dominantTier === 3`.
5. p95 latency < 2s on 200-element fixture (use `tests/fixtures/exec-summary-fixture.ts` — create as part of task).
6. Idempotent: 2 successive calls return same `generatedAt` within cache TTL (proves caching).

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/server && npm test -- executiveSummary.service`

- [ ] **Step 3: Implement service**

```typescript
// packages/server/src/services/executiveSummary.service.ts
import type { ExecutiveSummary, FactorWeights } from '@thearchitect/shared';
import { HEADLINE_THRESHOLDS } from '@thearchitect/shared';
import { runCriticalityForProject } from './criticalityRunner.service';
import { computeRelativeRankings } from './cost-engine.service';
import { Regulation } from '../models/Regulation';
import { StandardMapping } from '../models/StandardMapping';
import { TransformationRoadmap } from '../models/TransformationRoadmap';
import { Scenario } from '../models/Scenario';
import { Project } from '../models/Project';
import { runCypher } from '../config/neo4j';

const CACHE_TTL_MS = 60 * 1000; // 1 min in-memory
const memCache = new Map<string, { data: ExecutiveSummary; expiresAt: number }>();

export async function buildExecutiveSummary(
  projectId: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<ExecutiveSummary> {
  const cached = memCache.get(projectId);
  if (!opts.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return { ...cached.data, fromCache: true };
  }

  const project = await Project.findById(projectId).lean();
  const weights = project?.settings?.criticality?.weights as FactorWeights | undefined;

  // Parallel fan-out
  const [crit, costRankings, regulationsCrawled, mappingsCount, roadmap, scenarioCount, elementStats] =
    await Promise.all([
      runCriticalityForProject(projectId, { weightsOverride: weights }),
      computeRelativeRankings(projectId).catch(() => ({ profiles: [], byTier: [0, 0, 0, 0] })),
      Regulation.countDocuments({}),
      StandardMapping.countDocuments({ projectId }),
      TransformationRoadmap.findOne({ projectId, status: { $in: ['active', 'draft'] } }).lean(),
      Scenario.countDocuments({ projectId }),
      loadElementStats(projectId),                     // helper: count, atTarget, maturityAvg
    ]);

  // Derive CIO Hotspots (exclude motivation)
  const archScores = crit.scores.filter((s) => s.layer !== 'motivation');
  const criticalHotspots = archScores.filter((s) => s.totalScore >= 60);
  const spofs = crit.scores.filter((s) => s.dominantFactor === 'spof');

  // Derive CEO strategic risks (only motivation)
  const motivationScores = crit.scores.filter((s) => s.layer === 'motivation');
  const criticalDrivers = motivationScores.filter((s) => s.totalScore >= 60);

  // Derive CFO tiers
  const tierCounts: [number, number, number, number] = [0, 0, 0, 0];
  for (const p of costRankings.profiles) tierCounts[p.tier ?? 0]++;
  let dominantTier: 0 | 1 | 2 | 3 = 0;
  for (let t = 3; t >= 0; t--) if (tierCounts[t] > 0) { dominantTier = t as 0|1|2|3; break; }

  const totalTco = costRankings.profiles.reduce((s, p) => s + (p.totalEstimated ?? 0), 0);
  const p10 = costRankings.profiles.reduce((s, p) => s + (p.confidenceLow ?? (p.totalEstimated ?? 0) * 0.7), 0);
  const p90 = costRankings.profiles.reduce((s, p) => s + (p.confidenceHigh ?? (p.totalEstimated ?? 0) * 1.45), 0);
  const optimization = costRankings.profiles.reduce((s, p) => s + (p.optimizationPotential ?? 0), 0);
  const topCost = [...costRankings.profiles].sort((a, b) => (b.totalEstimated ?? 0) - (a.totalEstimated ?? 0))[0];

  // Tech-debt index
  const techDebtScore = elementStats.maturityAvg > 0
    ? Math.round((1 - elementStats.maturityAvg / 5) * 100)
    : 0;
  const immatureCount = elementStats.immatureCount;

  const transformationPercent = elementStats.total > 0
    ? Math.round((elementStats.atTarget / elementStats.total) * 100)
    : 0;

  const mappingCoveragePct = elementStats.total > 0
    ? Math.round((mappingsCount / elementStats.total) * 100)
    : 0;

  // Build views + headlines
  const ceo: ExecutiveSummary['ceo'] = {
    headline: deriveCeoHeadline({ regulationsCrawled, mappingCoveragePct, criticalDriverCount: criticalDrivers.length, transformationPercent, total: elementStats.total }),
    complianceCoverage: { regulationsCrawled, standardMappings: mappingsCount, mappingCoveragePct },
    transformationProgress: { percent: transformationPercent, atTarget: elementStats.atTarget, total: elementStats.total },
    strategicRisks: { criticalDriverCount: criticalDrivers.length, topRiskName: criticalDrivers[0]?.name ?? null },
    activeInitiatives: { scenarioCount, roadmapStatus: roadmap?.status ?? null },
  };

  const cio: ExecutiveSummary['cio'] = {
    headline: deriveCioHeadline({ hotspotCount: criticalHotspots.length, spofCount: spofs.length, topName: criticalHotspots[0]?.name, topScore: criticalHotspots[0]?.totalScore }),
    criticalHotspots: { count: criticalHotspots.length, topName: criticalHotspots[0]?.name ?? null, topScore: criticalHotspots[0]?.totalScore ?? 0 },
    techDebtIndex: { score: techDebtScore, immatureElements: immatureCount },
    spofs: { count: spofs.length, topElement: spofs[0]?.name ?? null },
    complianceStatus: { regulationsCrawled, mappedElementCount: mappingsCount, coveragePct: mappingCoveragePct },
    roadmapHealth: { waves: Array.isArray(roadmap?.waves) ? roadmap!.waves!.length : 0, status: roadmap?.status ?? null },
  };

  const cfo: ExecutiveSummary['cfo'] = {
    headline: deriveCfoHeadline({ dominantTier, totalTco, topCost }),
    totalTco: { value: Math.round(totalTco), p10: Math.round(p10), p90: Math.round(p90) },
    costHotspots: { dominantTier, topElement: topCost?.name ?? null, topElementCost: Math.round(topCost?.totalEstimated ?? 0) },
    probabilisticCost: { p10: Math.round(p10), p50: Math.round(totalTco), p90: Math.round(p90) },
    optimizationPotential: { value: Math.round(optimization), percentOfTco: totalTco > 0 ? Math.round((optimization / totalTco) * 100) : 0 },
    investmentHeatmap: { tierCounts },
  };

  const result: ExecutiveSummary = {
    projectId,
    generatedAt: new Date().toISOString(),
    fromCache: false,
    ceo, cio, cfo,
  };

  memCache.set(projectId, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

async function loadElementStats(projectId: string) {
  const res = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     RETURN count(e) as total,
            sum(CASE WHEN e.status = 'target' THEN 1 ELSE 0 END) as atTarget,
            avg(coalesce(e.maturityLevel, 0)) as maturityAvg,
            sum(CASE WHEN coalesce(e.maturityLevel, 0) <= 2 THEN 1 ELSE 0 END) as immatureCount`,
    { projectId }
  );
  const row = res[0];
  return {
    total: Number(row?.get('total') ?? 0),
    atTarget: Number(row?.get('atTarget') ?? 0),
    maturityAvg: Number(row?.get('maturityAvg') ?? 0),
    immatureCount: Number(row?.get('immatureCount') ?? 0),
  };
}

// 3 headline derivation helpers — see table above
function deriveCeoHeadline(input: {...}): ExecutiveHeadline { /* per table */ }
function deriveCioHeadline(input: {...}): ExecutiveHeadline { /* per table */ }
function deriveCfoHeadline(input: {...}): ExecutiveHeadline { /* per table */ }

export function invalidateExecutiveSummary(projectId: string): void {
  memCache.delete(projectId);
}
```

**Cache strategy:** in-memory Map with 60s TTL. Cleared on:
- Criticality recompute (`runCriticalityForProject` calls `invalidateExecutiveSummary` on cache write)
- Manual `?fresh=true` query param
- Server restart (process memory only)

- [ ] **Step 4: Wire invalidation in criticalityRunner**

When `saveCachedScores()` is called in Task 1, also call `invalidateExecutiveSummary(projectId)`.

- [ ] **Step 5: Run tests until pass**

Run: `cd packages/server && npm test -- executiveSummary.service`
Expected: 6/6 PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/services/executiveSummary.service.ts \
        packages/server/src/__tests__/executiveSummary.service.test.ts \
        packages/server/src/__tests__/fixtures/exec-summary-fixture.ts \
        packages/server/src/services/criticalityRunner.service.ts
git commit -m "feat(uc-exec-001): executiveSummary aggregator + 1-min cache (THE-287)"
```

---

## Chunk 4: Backend route + integration tests

### Task 4: GET /api/projects/:projectId/executive-summary

**Files:**
- Modify: `packages/server/src/routes/architecture.routes.ts` (add route near criticality route)
- Test: `packages/server/src/__tests__/executiveSummary.routes.test.ts`

- [ ] **Step 1: Write failing supertest (5 cases)**

1. 401 if no token.
2. 403 if user has no project access.
3. 200 with valid shape (assert against `ExecutiveSummary` type via inline schema or `zod`).
4. `?fresh=true` bypasses cache (assert `fromCache === false` twice in a row).
5. p95 < 2s over 10 calls on 200-element fixture.

- [ ] **Step 2: Implement route**

```typescript
router.get(
  '/:projectId/executive-summary',
  authenticate,
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req, res) => {
    try {
      const fresh = req.query.fresh === 'true';
      const summary = await buildExecutiveSummary(req.params.projectId, { forceRefresh: fresh });
      res.json(summary);
    } catch (e) {
      log.error({ err: e }, '[executive-summary] failed');
      res.status(500).json({ error: 'executive_summary_failed', detail: (e as Error).message });
    }
  }
);
```

- [ ] **Step 3: Run tests**

Run: `cd packages/server && npm test -- executiveSummary.routes`
Expected: 5/5 PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/architecture.routes.ts \
        packages/server/src/__tests__/executiveSummary.routes.test.ts
git commit -m "feat(uc-exec-001): GET /executive-summary route + supertests (THE-287)"
```

---

## Chunk 5: Frontend hook + Tab shell

### Task 5: API client + hook with stale-invalidation

**Files:**
- Create: `packages/client/src/services/executiveSummary.api.ts`
- Create: `packages/client/src/hooks/useExecutiveSummary.ts`

- [ ] **Step 1: API client**

```typescript
import api from './api';
import type { ExecutiveSummary } from '@thearchitect/shared';

export async function fetchExecutiveSummary(projectId: string, fresh = false): Promise<ExecutiveSummary> {
  const { data } = await api.get(`/projects/${projectId}/executive-summary${fresh ? '?fresh=true' : ''}`);
  return data;
}
```

- [ ] **Step 2: Hook with store subscriptions**

```typescript
import { useEffect, useState, useCallback } from 'react';
import { fetchExecutiveSummary } from '../services/executiveSummary.api';
import { useCriticalityStore } from '../stores/criticalityStore';
import { useScenarioStore } from '../stores/scenarioStore';
import type { ExecutiveSummary } from '@thearchitect/shared';

export function useExecutiveSummary(projectId: string | null) {
  const [data, setData] = useState<ExecutiveSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (fresh = false) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try { setData(await fetchExecutiveSummary(projectId, fresh)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Load failed'); }
    finally { setLoading(false); }
  }, [projectId]);

  // Initial load
  useEffect(() => { reload(); }, [reload]);

  // Stale invalidation: when criticality or scenarios change, refetch (fresh)
  const critScoresLength = useCriticalityStore((s) => s.scores.length);
  const scenarioCount = useScenarioStore((s) => s.scenarios.length);
  useEffect(() => {
    if (data) reload(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [critScoresLength, scenarioCount]);

  return { data, loading, error, reload: () => reload(true) };
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/services/executiveSummary.api.ts \
        packages/client/src/hooks/useExecutiveSummary.ts
git commit -m "feat(uc-exec-001): executiveSummary api + hook w/ stale invalidation (THE-288)"
```

---

### Task 6: Persona tab strip + default CIO + a11y

**Files:**
- Modify: `packages/client/src/components/analyze/AnalyzeDashboard.tsx`
- Create: `packages/client/src/components/analyze/exec/ExecTabStrip.tsx`
- Create: `packages/client/src/components/analyze/exec/CeoView.tsx` (stub)
- Create: `packages/client/src/components/analyze/exec/CioView.tsx` (stub)
- Create: `packages/client/src/components/analyze/exec/CfoView.tsx` (stub)
- Create: `packages/client/src/components/analyze/exec/HeadlineCard.tsx`

- [ ] **Step 1: ExecTabStrip with keyboard navigation**

```tsx
type Persona = 'ceo' | 'cio' | 'cfo';
const TABS: Array<{ id: Persona; label: string }> = [
  { id: 'ceo', label: 'CEO View' },
  { id: 'cio', label: 'CIO View' },
  { id: 'cfo', label: 'CFO View' },
];

// role="tablist" + ArrowLeft/Right/Home/End keyboard support + aria-selected
```

- [ ] **Step 2: HeadlineCard (reusable)**

Props: `{ headline: ExecutiveHeadline }`. Tone-based bg + border:
- positive → emerald
- warning → amber
- critical → red
- neutral → slate

Layout: full-width card above persona cards. Large title (text-2xl), subtitle (text-sm), icon (CheckCircle/AlertTriangle/AlertOctagon/Info).

- [ ] **Step 3: Refactor AnalyzeDashboard**

```tsx
const [tab, setTab] = useState<Persona>('cio'); // default CIO
const { data, loading, error, reload } = useExecutiveSummary(projectId ?? null);

if (elements.length === 0) return <EmptyState />; // existing block stays

return (
  <div>
    <h2 className="text-lg font-semibold text-white mb-1">Executive Dashboard</h2>
    <ExecTabStrip active={tab} onChange={setTab} onReload={reload} />
    {loading && !data && <LoadingSkeleton />}
    {error && <ErrorState error={error} onReload={reload} />}
    {data && tab === 'ceo' && <CeoView data={data.ceo} projectId={projectId!} />}
    {data && tab === 'cio' && <CioView data={data.cio} projectId={projectId!} />}
    {data && tab === 'cfo' && <CfoView data={data.cfo} projectId={projectId!} />}
  </div>
);
```

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/analyze/AnalyzeDashboard.tsx \
        packages/client/src/components/analyze/exec/
git commit -m "feat(uc-exec-001): persona tab shell + HeadlineCard + a11y (THE-288)"
```

---

## Chunk 6: Persona Views (cards)

**Click-through map (consistent across views):**

| Card | Target | Notes |
|---|---|---|
| CIO Critical Hotspots | `/project/<id>/analyze/risk` | already exists |
| CIO Tech-Debt Index | `/project/<id>/analyze/risk` | filter immature |
| CIO SPOFs | `/project/<id>/analyze/risk` | filter spof factor |
| CIO Compliance Status | `/project/<id>/analyze/compliance` | NEW route — skip click-through v1, show static |
| CIO Roadmap Health | `/project/<id>/analyze/roadmap` | exists |
| CEO Compliance Coverage | static v1 | UC-ICM-003 will add deep link |
| CEO Transformation Progress | `/project/<id>/analyze/impact` | exists |
| CEO Strategic Risks | `/project/<id>/analyze/risk` | filter motivation |
| CEO Active Initiatives | `/project/<id>/analyze/scenarios` | exists |
| CFO Total TCO | `/project/<id>/analyze/cost` | exists |
| CFO Cost Hotspots | `/project/<id>/analyze/cost` | exists |
| CFO Probabilistic Cost | `/project/<id>/analyze/cost` | exists |
| CFO Optimization | `/project/<id>/analyze/cost` | exists |
| CFO Investment Heatmap | `/project/<id>/analyze/cost` | exists |

### Task 7: CIO View

**File:** `packages/client/src/components/analyze/exec/CioView.tsx`

- [ ] **Step 1: Layout**

```tsx
export default function CioView({ data, projectId }: Props) {
  return (
    <div className="space-y-4">
      <HeadlineCard headline={data.headline} />
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Critical Hotspots" value={data.criticalHotspots.count} sub={data.criticalHotspots.topName ?? '—'} target="risk" />
        <KpiCard label="Tech-Debt Index" value={`${data.techDebtIndex.score}/100`} sub={`${data.techDebtIndex.immatureElements} immature`} target="risk" />
        <KpiCard label="SPOFs" value={data.spofs.count} sub={data.spofs.topElement ?? '—'} target="risk" />
        <KpiCard label="Compliance" value={`${data.complianceStatus.coveragePct}%`} sub={`${data.complianceStatus.regulationsCrawled} regulations`} target={null} />
        <KpiCard label="Roadmap" value={data.roadmapHealth.status ?? '—'} sub={`${data.roadmapHealth.waves} waves`} target="roadmap" />
      </div>
    </div>
  );
}
```

**Mobile:** `grid-cols-1 md:grid-cols-3`.

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/components/analyze/exec/CioView.tsx \
        packages/client/src/components/analyze/exec/KpiCard.tsx
git commit -m "feat(uc-exec-001): CIO view with 5 KPI cards (THE-289)"
```

---

### Task 8: CEO View

**File:** `packages/client/src/components/analyze/exec/CeoView.tsx`

- [ ] **Step 1: Layout** — same KpiCard pattern, 4 cards:
  - Compliance Coverage: `<mappingCoveragePct>%`, sub `<standardMappings> of <regulationsCrawled>`
  - Transformation Progress: `<percent>%`, sub `<atTarget> of <total> at target`
  - Strategic Risks: `<criticalDriverCount>`, sub `<topRiskName ?? '—'>`
  - Active Initiatives: `<scenarioCount>`, sub roadmap status

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(uc-exec-001): CEO view with 4 KPI cards (THE-290)"
```

---

### Task 9: CFO View

**File:** `packages/client/src/components/analyze/exec/CfoView.tsx`

- [ ] **Step 1: Layout** — 5 cards (+ Heatmap full width):
  - Total TCO: `formatCost(value)`, sub `P10 X – P90 Y`
  - Cost Hotspots: tier badge + `topElement`, sub `formatCost(topElementCost)`
  - Probabilistic: `P50 X`, sub `P10 Y – P90 Z`
  - Optimization: `formatCost(value)`, sub `<percentOfTco>% of TCO`
  - Investment Heatmap (full row): 4 bars Tier0/1/2/3 with counts

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(uc-exec-001): CFO view with 5 KPI cards + heatmap (THE-291)"
```

---

## Chunk 7: Verification + deploy

### Task 10: E2E + production deploy

- [ ] **Step 1: Build + dev**

```bash
npm run build && npm run dev
```

- [ ] **Step 2: Browser manual-checklist**

Open `http://localhost:3000/project/<demo-id>/analyze`:
- [ ] Default tab = CIO
- [ ] Tab switching (Mouse) — CEO/CIO/CFO render without console errors
- [ ] Tab switching (ArrowLeft/Right/Home/End) — keyboard works
- [ ] HeadlineCard shows correct tone color
- [ ] Click "Critical Hotspots" card → navigates to `/analyze/risk`
- [ ] Reload button (in tab strip) re-fetches with `?fresh=true`
- [ ] Compliance card shows `16` regulations (matches Mongo count from UC-ICM-001)
- [ ] Empty project (`new`) shows existing empty state, NOT broken tabs
- [ ] Mobile width (≤768px) → grid collapses to single column

- [ ] **Step 3: Deploy**

```bash
rsync -avz --exclude '.env*' --exclude 'node_modules' --exclude 'dist' --exclude '.git' \
  ./ root@76.13.150.49:/docker/thearchitect/
ssh root@76.13.150.49 'cd /docker/thearchitect && docker compose -f docker-compose.prod.yml up -d --build --force-recreate app'
```

- [ ] **Step 4: Production verify**

```bash
curl -sH "Authorization: Bearer $TOKEN" https://thearchitect.site/api/projects/<id>/executive-summary | jq '.cio.headline'
```

Browser: open `https://thearchitect.site/project/<id>/analyze` → run full manual-checklist.

- [ ] **Step 5: Update daily + close Linear**

- Add UC-EXEC-001 LIVE section to `docs/daily-2026-05-22.md`
- Close THE-287..291 in Linear, then THE-286

---

## Subagent Model Recommendations

| Task | Recommended model |
|---|---|
| T1 (refactor + characterization) | standard — touches existing logic, needs care |
| T2 (shared types) | fast — mechanical |
| T3 (aggregator service) | standard — multi-source, judgment needed |
| T4 (route) | fast — thin wrapper |
| T5 (hook) | fast — mechanical |
| T6 (tab shell + a11y) | standard — a11y nuance |
| T7-T9 (persona views) | fast — repetitive card layout |
| T10 (deploy/verify) | controller (no subagent) |

---

## Remember
- DRY: criticality logic extracted ONCE in Task 1, reused by both `/criticality` and `/executive-summary`.
- YAGNI: 60s in-memory cache only; no Redis layer for v1.
- TDD: tests before code in every backend task.
- Frequent commits: one per Task (10 commits total).
- All 10 tasks ≤ 1.5 working days end-to-end.

## RVTM Skip Notice
RVTM generation is skipped for this UC (BSH-demo time pressure). Acceptance is tracked via the manual checklist in Task 10 + the 6/5/5 test counts in Tasks 3/4. Add RVTM retroactively if time permits before BSH-Demo 2026-06-14.
