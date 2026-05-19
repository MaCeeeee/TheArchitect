/**
 * UC-CRIT-001 — Composite Criticality Score Engine
 *
 * Pure function. Computes a 0-100 criticality score per element based on
 * a weighted sum of 7 factors:
 *   F1 spof                  — single point of failure (dependents + redundancy)
 *   F2 riskConnectivity      — explicit riskLevel × graph degree
 *   F3 maturityFloor         — low maturity × dependents
 *   F4 complianceGap         — missing realizer for a required standard
 *   F5 costBurden            — share of a roadmap-wave cost
 *   F6 stakeholderBottleneck — frequency in stakeholder conflicts
 *   F7 cycleTangle           — membership in a circular dependency
 *
 * Each factor is normalized to 0..1 by project-wide statistics (relative
 * mode is the default — relative to the project's own max) so a single
 * outlier doesn't drown out the rest of the report. Factors are then
 * multiplied by user weights and summed; final score is clipped at 100.
 */

import type {
  CriticalityBreakdown,
  CriticalityFactor,
  FactorContribution,
  FactorWeights,
} from '@thearchitect/shared';
import { DEFAULT_FACTOR_WEIGHTS } from '@thearchitect/shared';

export interface CriticalityElement {
  id: string;
  name: string;
  type: string;
  layer: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical' | null;
  maturityLevel?: number | null;
}

/**
 * Layer-specific multipliers applied on top of the base weights.
 *
 * Motivation-layer elements (drivers, goals, requirements, stakeholders,
 * constraints) cannot be SPOFs in the technical sense and "cycles" with
 * regulations are modeling artifacts, not refactor signals. We dampen
 * those factors (×0.3) and boost the factors that genuinely matter for
 * drivers — compliance-gap (×2.0) and stakeholder-bottleneck (×1.5).
 *
 * Strategy / business layers get small adjustments; technology layer
 * uses base weights unchanged.
 */
const LAYER_FACTOR_MULTIPLIERS: Record<string, Partial<Record<keyof FactorWeights, number>>> = {
  motivation: {
    spof: 0.3,
    cycleTangle: 0.3,
    complianceGap: 2.0,
    stakeholderBottleneck: 1.5,
  },
  strategy: {
    spof: 0.6,
    cycleTangle: 0.7,
    complianceGap: 1.3,
  },
  business: {
    cycleTangle: 0.8,
  },
};

function applyLayerMultipliers(
  baseWeights: FactorWeights,
  layer: string,
): FactorWeights {
  const overrides = LAYER_FACTOR_MULTIPLIERS[layer] ?? {};
  return {
    spof: baseWeights.spof * (overrides.spof ?? 1),
    riskConnectivity: baseWeights.riskConnectivity * (overrides.riskConnectivity ?? 1),
    maturityFloor: baseWeights.maturityFloor * (overrides.maturityFloor ?? 1),
    complianceGap: baseWeights.complianceGap * (overrides.complianceGap ?? 1),
    costBurden: baseWeights.costBurden * (overrides.costBurden ?? 1),
    stakeholderBottleneck:
      baseWeights.stakeholderBottleneck * (overrides.stakeholderBottleneck ?? 1),
    cycleTangle: baseWeights.cycleTangle * (overrides.cycleTangle ?? 1),
  };
}

export { applyLayerMultipliers };

export interface CriticalityConnection {
  sourceId: string;
  targetId: string;
}

export interface StandardMappingInput {
  elementId: string;
  hasRealizer: boolean;
}

export interface RoadmapWaveInput {
  totalCost: number;
  elementCosts: Array<{ elementId: string; cost: number }>;
}

export interface StakeholderConflictInput {
  elementId: string;
  conflictCount: number;
}

export interface CriticalityComputeInput {
  elements: CriticalityElement[];
  connections: CriticalityConnection[];
  standardMappings?: StandardMappingInput[];
  roadmapWaves?: RoadmapWaveInput[];
  stakeholderConflicts?: StakeholderConflictInput[];
  cycleMembers?: Set<string>;
  weights?: FactorWeights;
}

const RISK_NUMERIC: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const MAX_MATURITY = 5;
const COST_BURDEN_THRESHOLD = 0.2;
const SCORE_CAP = 100;

function emptyFactor(): FactorContribution {
  return { raw: 0, normalized: 0, weighted: 0 };
}

function emptyBreakdown(): CriticalityBreakdown {
  return {
    totalScore: 0,
    dominantFactor: null,
    factors: {
      spof: emptyFactor(),
      riskConnectivity: emptyFactor(),
      maturityFloor: emptyFactor(),
      complianceGap: emptyFactor(),
      costBurden: emptyFactor(),
      stakeholderBottleneck: emptyFactor(),
      cycleTangle: emptyFactor(),
    },
  };
}

function normalize(rawByElement: Map<string, number>): Map<string, number> {
  const max = Math.max(0, ...rawByElement.values());
  if (max === 0) {
    return new Map(Array.from(rawByElement.keys()).map((k) => [k, 0]));
  }
  const out = new Map<string, number>();
  rawByElement.forEach((v, k) => out.set(k, v / max));
  return out;
}

interface Degree {
  in: number;
  out: number;
  total: number;
}

function computeDegrees(
  elements: CriticalityElement[],
  connections: CriticalityConnection[]
): Map<string, Degree> {
  const map = new Map<string, Degree>();
  elements.forEach((e) => map.set(e.id, { in: 0, out: 0, total: 0 }));
  connections.forEach((c) => {
    const src = map.get(c.sourceId);
    if (src) {
      src.out += 1;
      src.total += 1;
    }
    const tgt = map.get(c.targetId);
    if (tgt) {
      tgt.in += 1;
      tgt.total += 1;
    }
  });
  return map;
}

function detectSimpleRedundancy(
  elements: CriticalityElement[]
): Map<string, boolean> {
  const byType = new Map<string, CriticalityElement[]>();
  elements.forEach((e) => {
    const key = `${e.layer}:${e.type}`;
    const bucket = byType.get(key) ?? [];
    bucket.push(e);
    byType.set(key, bucket);
  });
  const hasRedundancy = new Map<string, boolean>();
  elements.forEach((e) => {
    const bucket = byType.get(`${e.layer}:${e.type}`) ?? [];
    hasRedundancy.set(e.id, bucket.length > 1);
  });
  return hasRedundancy;
}

export function computeSpofRaw(
  elements: CriticalityElement[],
  degrees: Map<string, Degree>,
  redundancyMap: Map<string, boolean>
): Map<string, number> {
  const raw = new Map<string, number>();
  elements.forEach((e) => {
    const inDeg = degrees.get(e.id)?.in ?? 0;
    const redundant = redundancyMap.get(e.id) ?? false;
    raw.set(e.id, redundant ? inDeg / 2 : inDeg);
  });
  return raw;
}

export function computeRiskConnectivityRaw(
  elements: CriticalityElement[],
  degrees: Map<string, Degree>
): Map<string, number> {
  const raw = new Map<string, number>();
  elements.forEach((e) => {
    const risk = RISK_NUMERIC[e.riskLevel ?? 'low'] ?? 1;
    const deg = degrees.get(e.id)?.total ?? 0;
    raw.set(e.id, risk * deg);
  });
  return raw;
}

export function computeMaturityFloorRaw(
  elements: CriticalityElement[],
  degrees: Map<string, Degree>
): Map<string, number> {
  const raw = new Map<string, number>();
  elements.forEach((e) => {
    const maturity = Math.max(0, Math.min(MAX_MATURITY, e.maturityLevel ?? MAX_MATURITY));
    const gap = MAX_MATURITY - maturity;
    const dependents = degrees.get(e.id)?.in ?? 0;
    raw.set(e.id, gap * dependents);
  });
  return raw;
}

export function computeComplianceGapRaw(
  elements: CriticalityElement[],
  mappings: StandardMappingInput[]
): Map<string, number> {
  const raw = new Map<string, number>();
  elements.forEach((e) => raw.set(e.id, 0));
  if (mappings.length === 0) return raw;
  const gapByElement = new Map<string, number>();
  mappings.forEach((m) => {
    if (!m.hasRealizer) {
      gapByElement.set(m.elementId, (gapByElement.get(m.elementId) ?? 0) + 1);
    }
  });
  gapByElement.forEach((v, k) => raw.set(k, v));
  return raw;
}

export function computeCostBurdenRaw(
  elements: CriticalityElement[],
  waves: RoadmapWaveInput[]
): Map<string, number> {
  const raw = new Map<string, number>();
  elements.forEach((e) => raw.set(e.id, 0));
  waves.forEach((w) => {
    if (w.totalCost <= 0) return;
    w.elementCosts.forEach(({ elementId, cost }) => {
      const share = cost / w.totalCost;
      if (share > COST_BURDEN_THRESHOLD) {
        const prev = raw.get(elementId) ?? 0;
        raw.set(elementId, prev + share);
      }
    });
  });
  return raw;
}

export function computeStakeholderBottleneckRaw(
  elements: CriticalityElement[],
  conflicts: StakeholderConflictInput[]
): Map<string, number> {
  const raw = new Map<string, number>();
  elements.forEach((e) => raw.set(e.id, 0));
  conflicts.forEach((c) => {
    raw.set(c.elementId, c.conflictCount);
  });
  return raw;
}

export function computeCycleTangleRaw(
  elements: CriticalityElement[],
  cycleMembers: Set<string>
): Map<string, number> {
  const raw = new Map<string, number>();
  elements.forEach((e) => raw.set(e.id, cycleMembers.has(e.id) ? 1 : 0));
  return raw;
}

const ALL_FACTORS: CriticalityFactor[] = [
  'spof',
  'riskConnectivity',
  'maturityFloor',
  'complianceGap',
  'costBurden',
  'stakeholderBottleneck',
  'cycleTangle',
];

export function computeCriticality(
  input: CriticalityComputeInput
): Map<string, CriticalityBreakdown> {
  const out = new Map<string, CriticalityBreakdown>();
  const { elements, connections } = input;
  if (elements.length === 0) return out;

  elements.forEach((e) => out.set(e.id, emptyBreakdown()));

  const baseWeights: FactorWeights = { ...DEFAULT_FACTOR_WEIGHTS, ...(input.weights ?? {}) };

  const degrees = computeDegrees(elements, connections);
  const redundancyMap = detectSimpleRedundancy(elements);

  const rawByFactor: Record<CriticalityFactor, Map<string, number>> = {
    spof: computeSpofRaw(elements, degrees, redundancyMap),
    riskConnectivity: computeRiskConnectivityRaw(elements, degrees),
    maturityFloor: computeMaturityFloorRaw(elements, degrees),
    complianceGap: computeComplianceGapRaw(elements, input.standardMappings ?? []),
    costBurden: computeCostBurdenRaw(elements, input.roadmapWaves ?? []),
    stakeholderBottleneck: computeStakeholderBottleneckRaw(
      elements,
      input.stakeholderConflicts ?? []
    ),
    cycleTangle: computeCycleTangleRaw(elements, input.cycleMembers ?? new Set()),
  };

  const normalizedByFactor: Record<CriticalityFactor, Map<string, number>> = {
    spof: normalize(rawByFactor.spof),
    riskConnectivity: normalize(rawByFactor.riskConnectivity),
    maturityFloor: normalize(rawByFactor.maturityFloor),
    complianceGap: normalize(rawByFactor.complianceGap),
    costBurden: normalize(rawByFactor.costBurden),
    stakeholderBottleneck: normalize(rawByFactor.stakeholderBottleneck),
    cycleTangle: normalize(rawByFactor.cycleTangle),
  };

  elements.forEach((e) => {
    const breakdown = out.get(e.id)!;
    const effectiveWeights = applyLayerMultipliers(baseWeights, e.layer);
    const totalWeight =
      ALL_FACTORS.reduce((s, f) => s + Math.max(0, effectiveWeights[f]), 0) || 1;

    let dominantFactor: CriticalityFactor | null = null;
    let dominantWeighted = -Infinity;

    ALL_FACTORS.forEach((f) => {
      const raw = rawByFactor[f].get(e.id) ?? 0;
      const normalized = normalizedByFactor[f].get(e.id) ?? 0;
      const weight = Math.max(0, effectiveWeights[f]);
      const weighted = normalized * weight;
      breakdown.factors[f] = { raw, normalized, weighted };
      if (weighted > dominantWeighted && weighted > 0) {
        dominantWeighted = weighted;
        dominantFactor = f;
      }
    });

    const summedWeighted = ALL_FACTORS.reduce(
      (sum, f) => sum + breakdown.factors[f].weighted,
      0
    );
    const normalizedScore = (summedWeighted / totalWeight) * SCORE_CAP;
    breakdown.totalScore = Math.min(SCORE_CAP, Math.round(normalizedScore * 10) / 10);
    breakdown.dominantFactor = dominantFactor;
  });

  return out;
}
