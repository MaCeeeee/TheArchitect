/**
 * UC-EXEC-001 — Executive Summary aggregator.
 *
 * Fans-out internally to UC-CRIT (criticality), UC-COST (cost-engine graph centrality),
 * UC-ICM-001 (Regulation count), StandardMapping, TransformationRoadmap, and Scenarios,
 * then derives three persona views (CEO / CIO / CFO) with a tone-driven headline each.
 *
 * In-memory 60s cache keyed by projectId. Invalidated by criticality recompute.
 *
 * Linear: THE-287
 */

import {
  HEADLINE_THRESHOLDS,
  type ExecutiveSummary,
  type ExecutiveHeadline,
  type CeoView,
  type CioView,
  type CfoView,
  type FactorWeights,
  type CriticalityScoreEntry,
  type ElementCostProfile,
} from '@thearchitect/shared';
import { runCriticalityForProject } from './criticalityRunner.service';
import { computeGraphCentrality } from './cost-engine.service';
import { estimateSmartCost } from './smart-cost.service';
import { deriveTopDecisions, computeStrategicRoi } from './topDecisions.service';
import { STATUS_COST_MULTIPLIERS } from '@thearchitect/shared';
import { Regulation } from '../models/Regulation';
import { StandardMapping } from '../models/StandardMapping';
import { TransformationRoadmap } from '../models/TransformationRoadmap';
import { Scenario } from '../models/Scenario';
import { runCypher } from '../config/neo4j';
import { log } from '../config/logger';

const CACHE_TTL_MS = 60 * 1000;
const memCache = new Map<string, { data: ExecutiveSummary; expiresAt: number }>();

export interface BuildExecutiveSummaryOptions {
  forceRefresh?: boolean;
  weights?: FactorWeights;
}

export async function buildExecutiveSummary(
  projectId: string,
  opts: BuildExecutiveSummaryOptions = {},
): Promise<ExecutiveSummary> {
  const cached = memCache.get(projectId);
  if (!opts.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return { ...cached.data, fromCache: true };
  }

  const [crit, costProfiles, regulationsCrawled, mappedElementIds, gapElementIds, roadmap, scenarioCount, elementStats, costElements] =
    await Promise.all([
      runCriticalityForProject(projectId, { weights: opts.weights }),
      computeGraphCentrality(projectId).catch((err: Error) => {
        log.warn({ err: err.message, projectId }, '[executive-summary] cost-centrality failed');
        return [] as ElementCostProfile[];
      }),
      Regulation.countDocuments({}),
      StandardMapping.distinct('elementId', { projectId }) as Promise<string[]>,
      StandardMapping.distinct('elementId', { projectId, status: 'gap' }) as Promise<string[]>,
      TransformationRoadmap.findOne({ projectId }).sort({ createdAt: -1 }).lean(),
      Scenario.countDocuments({ projectId }),
      loadElementStats(projectId),
      loadElementsForCost(projectId),
    ]);
  const mappedElementCount = mappedElementIds.length;
  const unmappedStandardElements = new Set(gapElementIds);

  const archScores = crit.scores.filter((s) => s.layer !== 'motivation');
  const criticalHotspots = archScores.filter((s) => s.totalScore >= HEADLINE_THRESHOLDS.hotspot_score);
  const spofs = crit.scores.filter((s) => s.dominantFactor === 'spof');

  const motivationScores = crit.scores.filter((s) => s.layer === 'motivation');
  const criticalDrivers = motivationScores.filter(
    (s) => s.totalScore >= HEADLINE_THRESHOLDS.hotspot_score,
  );

  const costAgg = aggregateCosts(costProfiles, costElements);

  const techDebtScore =
    elementStats.maturityAvg > 0
      ? Math.round((1 - elementStats.maturityAvg / 5) * 100)
      : 0;

  const transformationPercent =
    elementStats.total > 0
      ? Math.round((elementStats.atTarget / elementStats.total) * 100)
      : 0;

  const mappingCoveragePct =
    elementStats.total > 0
      ? Math.min(100, Math.round((mappedElementCount / elementStats.total) * 100))
      : 0;

  const ceo: CeoView = {
    headline: deriveCeoHeadline({
      regulationsCrawled,
      mappingCoveragePct,
      criticalDriverCount: criticalDrivers.length,
      transformationPercent,
      total: elementStats.total,
    }),
    complianceCoverage: {
      regulationsCrawled,
      standardMappings: mappedElementCount,
      mappingCoveragePct,
    },
    transformationProgress: {
      percent: transformationPercent,
      atTarget: elementStats.atTarget,
      total: elementStats.total,
    },
    strategicRisks: {
      criticalDriverCount: criticalDrivers.length,
      topRiskName: criticalDrivers[0]?.name ?? null,
    },
    activeInitiatives: {
      scenarioCount,
      roadmapStatus: roadmap?.status ?? null,
    },
    topDecisions: deriveTopDecisions({ scores: crit.scores, unmappedStandardElements }),
    strategicRoi: computeStrategicRoi(costElements),
  };

  const cio: CioView = {
    headline: deriveCioHeadline({
      hotspotCount: criticalHotspots.length,
      spofCount: spofs.length,
      topName: criticalHotspots[0]?.name,
      topScore: criticalHotspots[0]?.totalScore,
    }),
    criticalHotspots: {
      count: criticalHotspots.length,
      topName: criticalHotspots[0]?.name ?? null,
      topScore: criticalHotspots[0]?.totalScore ?? 0,
    },
    techDebtIndex: {
      score: techDebtScore,
      immatureElements: elementStats.immatureCount,
    },
    spofs: {
      count: spofs.length,
      topElement: spofs[0]?.name ?? null,
    },
    complianceStatus: {
      regulationsCrawled,
      mappedElementCount,
      coveragePct: mappingCoveragePct,
    },
    roadmapHealth: {
      waves: Array.isArray(roadmap?.waves) ? roadmap!.waves!.length : 0,
      status: roadmap?.status ?? null,
    },
  };

  const cfo: CfoView = {
    headline: deriveCfoHeadline({
      dominantTier: costAgg.dominantTier,
      totalTco: costAgg.totalTco,
      topElementName: costAgg.topElementName,
    }),
    totalTco: {
      value: Math.round(costAgg.totalTco),
      p10: Math.round(costAgg.p10),
      p90: Math.round(costAgg.p90),
    },
    costHotspots: {
      dominantTier: costAgg.dominantTier,
      topElement: costAgg.topElementName,
      topElementCost: Math.round(costAgg.topElementCost),
    },
    probabilisticCost: {
      p10: Math.round(costAgg.p10),
      p50: Math.round(costAgg.totalTco),
      p90: Math.round(costAgg.p90),
    },
    optimizationPotential: {
      value: Math.round(costAgg.optimization),
      percentOfTco: costAgg.totalTco > 0
        ? Math.round((costAgg.optimization / costAgg.totalTco) * 100)
        : 0,
    },
    investmentHeatmap: {
      tierCounts: costAgg.tierCounts,
    },
  };

  const result: ExecutiveSummary = {
    projectId,
    generatedAt: new Date().toISOString(),
    fromCache: false,
    ceo,
    cio,
    cfo,
  };

  memCache.set(projectId, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

export function invalidateExecutiveSummary(projectId: string): void {
  memCache.delete(projectId);
}

interface CostElement {
  id: string;
  name: string;
  type: string;
  layer: string;
  status: string;
  annualCost: number;
  maturityLevel: number | null;
}

async function loadElementsForCost(projectId: string): Promise<CostElement[]> {
  try {
    const rows = await runCypher(
      `MATCH (e:ArchitectureElement {projectId: $projectId})
       RETURN e.id AS id,
              coalesce(e.name, '') AS name,
              coalesce(e.type, '') AS type,
              coalesce(e.layer, '') AS layer,
              coalesce(e.status, 'current') AS status,
              coalesce(e.annualCost, 0) AS annualCost,
              e.maturityLevel AS maturityLevel`,
      { projectId },
    );
    return rows.map((r) => ({
      id: String(r.get('id') ?? ''),
      name: String(r.get('name') ?? ''),
      type: String(r.get('type') ?? ''),
      layer: String(r.get('layer') ?? ''),
      status: String(r.get('status') ?? 'current'),
      annualCost: Number(r.get('annualCost') ?? 0),
      maturityLevel: r.get('maturityLevel') == null ? null : Number(r.get('maturityLevel')),
    }));
  } catch (err) {
    log.warn(
      { err: (err as Error).message, projectId },
      '[executive-summary] cost-elements query failed',
    );
    return [];
  }
}

async function loadElementStats(projectId: string): Promise<{
  total: number;
  atTarget: number;
  maturityAvg: number;
  immatureCount: number;
}> {
  try {
    const rows = await runCypher(
      `MATCH (e:ArchitectureElement {projectId: $projectId})
       RETURN count(e) AS total,
              sum(CASE WHEN e.status = 'target' THEN 1 ELSE 0 END) AS atTarget,
              avg(coalesce(e.maturityLevel, 0)) AS maturityAvg,
              sum(CASE WHEN coalesce(e.maturityLevel, 0) > 0 AND coalesce(e.maturityLevel, 0) <= $immatureMax THEN 1 ELSE 0 END) AS immatureCount`,
      { projectId, immatureMax: HEADLINE_THRESHOLDS.immature_maturity_max },
    );
    const row = rows[0];
    return {
      total: Number(row?.get('total') ?? 0),
      atTarget: Number(row?.get('atTarget') ?? 0),
      maturityAvg: Number(row?.get('maturityAvg') ?? 0),
      immatureCount: Number(row?.get('immatureCount') ?? 0),
    };
  } catch (err) {
    log.warn(
      { err: (err as Error).message, projectId },
      '[executive-summary] element stats query failed',
    );
    return { total: 0, atTarget: 0, maturityAvg: 0, immatureCount: 0 };
  }
}

interface CostAggregate {
  totalTco: number;
  p10: number;
  p90: number;
  optimization: number;
  tierCounts: [number, number, number, number];
  dominantTier: 0 | 1 | 2 | 3;
  topElementName: string | null;
  topElementCost: number;
}

function aggregateCosts(
  profiles: ElementCostProfile[],
  costElements: CostElement[],
): CostAggregate {
  const tierCounts: [number, number, number, number] = [0, 0, 0, 0];
  let totalTco = 0;
  let optimization = 0;
  let topElementName: string | null = null;
  let topElementCost = 0;

  const profileById = new Map(profiles.map((p) => [p.elementId, p]));

  // Iterate over the canonical element set (so we apply status multipliers + the
  // same 3-step priority the Cost-View uses client-side: annualCost → profile.totalEstimated → smart-cost).
  for (const el of costElements) {
    const profile = profileById.get(el.id);
    const tier = (profile?.tier ?? 0) as 0 | 1 | 2 | 3;
    tierCounts[tier]++;

    const statusMul = STATUS_COST_MULTIPLIERS[el.status] ?? 1.0;
    let estimated: number;
    if (el.annualCost > 0) {
      estimated = Math.round(el.annualCost * statusMul);
    } else if (profile?.totalEstimated != null) {
      estimated = profile.totalEstimated;
    } else {
      const smart = estimateSmartCost(el.name, el.type, el.layer);
      estimated = Math.round(smart.annualCost * statusMul);
    }

    totalTco += estimated;

    const maturity = el.maturityLevel ?? 3;
    const elOpt =
      el.status === 'retired'
        ? estimated * 0.9
        : maturity <= 2
          ? estimated * 0.3
          : el.status === 'transitional'
            ? estimated * 0.4
            : 0;
    optimization += elOpt;

    if (estimated > topElementCost) {
      topElementCost = estimated;
      topElementName = el.name;
    }
  }

  // Profiles without a matching element (defensive — shouldn't happen, but
  // still count the tier so the heatmap stays consistent).
  for (const p of profiles) {
    if (!costElements.some((e) => e.id === p.elementId)) {
      const tier = (p.tier ?? 0) as 0 | 1 | 2 | 3;
      tierCounts[tier]++;
    }
  }

  // Confidence interval — use cost-engine bands where available, otherwise ±30/45%.
  let p10 = 0;
  let p90 = 0;
  for (const el of costElements) {
    const profile = profileById.get(el.id);
    const statusMul = STATUS_COST_MULTIPLIERS[el.status] ?? 1.0;
    const estimated =
      el.annualCost > 0
        ? el.annualCost * statusMul
        : profile?.totalEstimated ??
          estimateSmartCost(el.name, el.type, el.layer).annualCost * statusMul;
    p10 += profile?.confidenceLow ?? estimated * 0.7;
    p90 += profile?.confidenceHigh ?? estimated * 1.45;
  }

  let dominantTier: 0 | 1 | 2 | 3 = 0;
  for (let t = 3; t >= 0; t--) {
    if (tierCounts[t] > 0) {
      dominantTier = t as 0 | 1 | 2 | 3;
      break;
    }
  }

  return {
    totalTco,
    p10,
    p90,
    optimization,
    tierCounts,
    dominantTier,
    topElementName,
    topElementCost,
  };
}

function deriveCeoHeadline(input: {
  regulationsCrawled: number;
  mappingCoveragePct: number;
  criticalDriverCount: number;
  transformationPercent: number;
  total: number;
}): ExecutiveHeadline {
  if (input.total === 0 && input.regulationsCrawled === 0) {
    return {
      title: 'Set up your architecture',
      subtitle: 'Start by importing or modeling elements',
      tone: 'neutral',
    };
  }
  if (
    input.regulationsCrawled > 0 &&
    input.mappingCoveragePct < HEADLINE_THRESHOLDS.ceo.mapping_low_pct
  ) {
    return {
      title: 'Compliance gap critical',
      subtitle: `Only ${input.mappingCoveragePct}% of standards mapped`,
      tone: 'critical',
    };
  }
  if (input.criticalDriverCount >= HEADLINE_THRESHOLDS.ceo.critical_drivers) {
    return {
      title: 'Strategic drivers at risk',
      subtitle: `${input.criticalDriverCount} critical drivers need attention`,
      tone: 'warning',
    };
  }
  const complianceFragment =
    input.regulationsCrawled > 0
      ? ` · ${input.regulationsCrawled} regulations on file`
      : '';
  return {
    title: 'Transformation on track',
    subtitle: `${input.transformationPercent}% progress${complianceFragment}`,
    tone: 'positive',
  };
}

function deriveCioHeadline(input: {
  hotspotCount: number;
  spofCount: number;
  topName?: string;
  topScore?: number;
}): ExecutiveHeadline {
  const isCritical =
    input.hotspotCount >= HEADLINE_THRESHOLDS.cio.critical_hotspots ||
    input.spofCount >= HEADLINE_THRESHOLDS.cio.critical_spofs;
  if (isCritical) {
    return {
      title: `${input.hotspotCount} architectural hotspots require attention`,
      subtitle: input.topName
        ? `Top: ${input.topName} (score ${input.topScore ?? '?'})`
        : `${input.spofCount} single-point-of-failure elements`,
      tone: 'critical',
    };
  }
  if (input.hotspotCount >= HEADLINE_THRESHOLDS.cio.warning_hotspots) {
    return {
      title: `${input.hotspotCount} hotspot${input.hotspotCount > 1 ? 's' : ''} detected`,
      subtitle: input.topName ? `Top: ${input.topName}` : 'Review the Criticality dashboard',
      tone: 'warning',
    };
  }
  return {
    title: 'Architecture healthy',
    subtitle: 'No critical hotspots detected',
    tone: 'positive',
  };
}

function deriveCfoHeadline(input: {
  dominantTier: 0 | 1 | 2 | 3;
  totalTco: number;
  topElementName: string | null;
}): ExecutiveHeadline {
  if (input.dominantTier === HEADLINE_THRESHOLDS.cfo.critical_tier) {
    return {
      title: 'Tier-3 cost exposure',
      subtitle: input.topElementName
        ? `Top: ${input.topElementName} (${formatCost(input.totalTco)})`
        : `Total TCO ${formatCost(input.totalTco)}`,
      tone: 'critical',
    };
  }
  if (input.dominantTier === HEADLINE_THRESHOLDS.cfo.warning_tier) {
    return {
      title: 'Tier-2 cost concentration',
      subtitle: `Total TCO ${formatCost(input.totalTco)}`,
      tone: 'warning',
    };
  }
  if (input.totalTco === 0) {
    return {
      title: 'Activate cost analysis',
      subtitle: 'No cost data yet — enable X-Ray to populate',
      tone: 'neutral',
    };
  }
  return {
    title: 'Cost profile stable',
    subtitle: `Total TCO ${formatCost(input.totalTco)}`,
    tone: 'neutral',
  };
}

function formatCost(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}
