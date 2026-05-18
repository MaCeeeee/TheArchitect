export type CriticalityFactor =
  | 'spof'
  | 'riskConnectivity'
  | 'maturityFloor'
  | 'complianceGap'
  | 'costBurden'
  | 'stakeholderBottleneck'
  | 'cycleTangle';

export interface FactorContribution {
  raw: number;
  normalized: number;
  weighted: number;
}

export interface CriticalityBreakdown {
  totalScore: number;
  factors: Record<CriticalityFactor, FactorContribution>;
  dominantFactor: CriticalityFactor | null;
}

export type FactorWeights = Record<CriticalityFactor, number>;

export const DEFAULT_FACTOR_WEIGHTS: FactorWeights = {
  spof: 1.0,
  riskConnectivity: 1.0,
  maturityFloor: 1.0,
  complianceGap: 1.5,
  costBurden: 1.0,
  stakeholderBottleneck: 0.5,
  cycleTangle: 1.5,
};

export interface CriticalityScoreEntry {
  elementId: string;
  name: string;
  type: string;
  layer: string;
  totalScore: number;
  factors: CriticalityBreakdown['factors'];
  dominantFactor: CriticalityFactor | null;
}

export interface CriticalityResponse {
  scores: CriticalityScoreEntry[];
  computedAt: string;
  weights: FactorWeights;
  fromCache: boolean;
  topN: number;
}

export const FACTOR_LABELS: Record<CriticalityFactor, string> = {
  spof: 'Single-Point-of-Failure',
  riskConnectivity: 'Risk × Connectivity',
  maturityFloor: 'Maturity-Floor',
  complianceGap: 'Compliance-Gap',
  costBurden: 'Cost-Burden',
  stakeholderBottleneck: 'Stakeholder-Bottleneck',
  cycleTangle: 'Cycle / Tangle',
};
