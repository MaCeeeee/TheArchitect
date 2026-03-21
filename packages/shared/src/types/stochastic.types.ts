import type { RoadmapStrategy } from './roadmap.types';

// ─── Kolmogorov Stochastic Engine Types ───

// ─── Edge Probability (Neo4j Kanten-Gewichte) ───
export type ConfidenceSource = 'measured' | 'estimated' | 'heuristic';

export interface EdgeProbability {
  failureProbability: number;     // P(Ausfall) 0-1
  cascadeWeight: number;          // Gewichtung der Kaskadenwirkung (default 1.0)
  confidenceLevel: number;        // 0-1 wie sicher die Schätzung ist
  confidenceSource: ConfidenceSource;
}

// ─── Stochastic Element Profile ───
export interface StochasticElementProfile {
  elementId: string;
  baseFailureProbability: number;        // Intrinsisch P(A)
  conditionalFailureProbability: number; // P(A | Upstream-Fehler)
  riskDistribution: {
    mean: number;
    variance: number;
    confidence: number;
  };
}

// ─── Cascade Risk Result ───
export interface CascadeAffectedElement {
  elementId: string;
  name: string;
  conditionalProbability: number; // P(Fail | Source Fails)
  distance: number;              // Hops from source
  cascadePath: string[];         // Element IDs along the path
}

export interface CascadeRiskResult {
  sourceElementId: string;
  affectedElements: CascadeAffectedElement[];
  totalBlastRadius: number;
  maxCascadeProbability: number;
}

// ─── Plateau Stability ───
export interface PlateauStabilityResult {
  isStable: boolean;
  aggregateFailureProbability: number;
  threshold: number;
  unstableElements: string[];
  requiredTransitionalStates: string[];
  organizationalFriction: number; // MiroFish Fatigue Multiplikator
}

// ─── Kolmogorov-Smirnov Test ───
export interface KSTestResult {
  statistic: number;    // D_n (max distance between eCDFs)
  pValue: number;
  significant: boolean; // p < alpha
  sampleSize1: number;
  sampleSize2: number;
}

// ─── Strategy-abhängige Schwellenwerte ───
export interface StochasticThresholds {
  plateauFailureThreshold: number;    // Max P(Fail) für stabile Plateaus
  cascadeCriticalThreshold: number;   // Ab wann cascade = critical
  cascadeHighThreshold: number;       // Ab wann cascade = high
  driftCriticalPValue: number;        // K-S p-value für critical drift
  driftHighPValue: number;            // K-S p-value für high drift
}

export const STRATEGY_THRESHOLDS: Record<RoadmapStrategy, StochasticThresholds> = {
  conservative: {
    plateauFailureThreshold: 0.03,
    cascadeCriticalThreshold: 0.10,
    cascadeHighThreshold: 0.05,
    driftCriticalPValue: 0.01,
    driftHighPValue: 0.05,
  },
  balanced: {
    plateauFailureThreshold: 0.05,
    cascadeCriticalThreshold: 0.15,
    cascadeHighThreshold: 0.08,
    driftCriticalPValue: 0.01,
    driftHighPValue: 0.05,
  },
  aggressive: {
    plateauFailureThreshold: 0.08,
    cascadeCriticalThreshold: 0.25,
    cascadeHighThreshold: 0.12,
    driftCriticalPValue: 0.01,
    driftHighPValue: 0.05,
  },
};

// ─── Architecture Snapshot (für K-S Drift Detection) ───
export interface ArchitectureSnapshotData {
  projectId: string;
  timestamp: string;
  type: 'baseline' | 'wave';
  waveNumber?: number;
  degreeDistribution: number[];
  riskScoreDistribution: number[];
  elementCount: number;
  connectionCount: number;
}

// ─── Plateau State (Input für calculatePlateauStability) ───
export interface PlateauState {
  elementId: string;
  name: string;
  failureProbability: number;
  dependsOnElementIds: string[];
  cascadeWeight: number;
}
