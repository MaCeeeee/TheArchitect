/**
 * Scenario Comparison System Types
 * Delta/overlay model for comparing transformation scenarios with financial dashboards.
 */

import type { CostDimension, CostTier } from './cost.types';

// ─── Scenario Delta ───
export interface ScenarioDelta {
  elementId: string;
  field: string;
  baselineValue: unknown;
  scenarioValue: unknown;
}

// ─── Scenario Cost Profile ───
export interface ScenarioCostProfile {
  totalCost: number;
  dimensions: Partial<CostDimension>;
  p10: number;
  p50: number;
  p90: number;
  deltaFromBaseline: number;       // absolute EUR difference
  deltaPercent: number;            // % change from baseline
  roi?: number;                    // return on investment
  paybackMonths?: number;          // months until break-even
}

// ─── Transformation Scenario ───
export interface TransformationScenario {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  baselineSnapshotId?: string;     // optional reference to ArchitectureSnapshot
  deltas: ScenarioDelta[];
  costProfile?: ScenarioCostProfile;
  mcdaScore?: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Scenario Comparison Result ───
export interface ScenarioComparisonResult {
  scenarioA: { id: string; name: string; totalCost: number };
  scenarioB: { id: string; name: string; totalCost: number };
  costDelta: number;
  costDeltaPercent: number;
  dimensionDeltas: Partial<Record<keyof CostDimension, number>>;
  elementChanges: {
    added: number;
    removed: number;
    modified: number;
  };
  riskDelta: number;               // difference in avg risk score
}

// ─── MCDA (Multi-Criteria Decision Analysis) ───
export type McdaMethod = 'wsm' | 'topsis';

export interface McdaWeights {
  cost: number;       // default 0.25
  risk: number;       // default 0.25
  agility: number;    // default 0.20
  compliance: number; // default 0.15
  time: number;       // default 0.15
}

export const DEFAULT_MCDA_WEIGHTS: McdaWeights = {
  cost: 0.25,
  risk: 0.25,
  agility: 0.20,
  compliance: 0.15,
  time: 0.15,
};

export interface McdaCriteriaScores {
  scenarioId: string;
  scenarioName: string;
  cost: number;       // 0-1 normalized (lower is better → inverted)
  risk: number;       // 0-1 normalized (lower is better → inverted)
  agility: number;    // 0-1 normalized
  compliance: number; // 0-1 normalized
  time: number;       // 0-1 normalized (lower is better → inverted)
  weightedScore: number;
  rank: number;
}

export interface McdaResult {
  method: McdaMethod;
  weights: McdaWeights;
  scores: McdaCriteriaScores[];
  ranking: string[];  // scenario IDs in ranked order
}

// ─── API payloads ───
export interface CreateScenarioPayload {
  name: string;
  description?: string;
  deltas?: ScenarioDelta[];
}

export interface UpdateDeltasPayload {
  deltas: ScenarioDelta[];
}

export interface ComparePayload {
  scenarioAId: string;
  scenarioBId: string;
}

export interface RankPayload {
  scenarioIds: string[];
  weights?: Partial<McdaWeights>;
}
