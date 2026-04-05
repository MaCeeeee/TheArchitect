// ─── Transformation Cost Calculation Types ───
// Implements 40+ mathematical models across 7 cost dimensions
// with a tiered progressive disclosure system (Tier 0-3)

// ─── Smart Cost Confidence ───
export type CostConfidence = 'benchmark' | 'ai' | 'type_default' | 'zero';

// ─── Cost Tier System ───
export type CostTier = 0 | 1 | 2 | 3;

export interface TierMetadata {
  tier: CostTier;
  fieldsProvided: string[];
  confidenceBand: 'relative-only' | '±30-50%' | '±15-30%' | 'P10/P50/P90';
}

// ─── 7 Cost Dimensions ───
export interface CostDimension {
  process: number;                    // ABC, COPQ, DES, Process Mining
  dataMigration: number;              // 1-10-100, ETL, entity-attribute
  trainingChange: number;             // ADKAR/Prosci, Wright, J-curve, saturation
  applicationTransformation: number;  // COCOMO II, SQALE, TIME, 7 R's
  infrastructure: number;             // TCO, queuing theory, FinOps
  opportunityCost: number;            // Real Options, Cost of Delay, WSJF
  riskAdjustedFinancial: number;      // rNPV, PERT+MC, VaR, Bayesian, EVM
}

export const COST_DIMENSION_LABELS: Record<keyof CostDimension, string> = {
  process: 'Process Costs',
  dataMigration: 'Data Migration',
  trainingChange: 'Training & Change',
  applicationTransformation: 'Application Transformation',
  infrastructure: 'Infrastructure',
  opportunityCost: 'Opportunity Cost',
  riskAdjustedFinancial: 'Risk-Adjusted Financial',
};

// ─── Graph Centrality Metrics (Tier 0) ───
export interface GraphCentralityMetrics {
  pageRank: number;                   // Link structure importance (0-1 normalized)
  betweennessCentrality: number;      // Bottleneck potential (0-1 normalized)
  communityId: number;                // Louvain community cluster ID
  dependencyDepth: number;            // Max path length to any leaf
  metcalfeValue: number;              // n*(n-1)/2 for connected subgraph
  inDegree: number;
  outDegree: number;
}

// ─── Element Cost Profile ───
export interface ElementCostProfile {
  elementId: string;
  elementName: string;
  elementType: string;
  tier: CostTier;
  tierMetadata: TierMetadata;

  // Tier 0: relative rankings (no EUR)
  graphMetrics?: GraphCentralityMetrics;
  relativeImportance?: number;        // 0-1 normalized composite from PageRank + Betweenness
  relativeCostRisk?: number;          // 0-1 composite risk/cost indicator

  // Tier 1+: absolute EUR estimates
  dimensions?: Partial<CostDimension>;
  totalEstimated?: number;
  confidenceLow?: number;             // P10 or lower bound
  confidenceHigh?: number;            // P90 or upper bound

  // Smart cost estimation metadata
  costConfidence?: CostConfidence;
  costSource?: string;                // e.g. "AWS RDS PostgreSQL Pricing 2025"
  matchedBenchmark?: string;          // e.g. "postgresql"
}

// ─── 7 R's Transformation Strategy ───
export type SevenRsStrategy =
  | 'retain'
  | 'retire'
  | 'rehost'
  | 'relocate'
  | 'replatform'
  | 'repurchase'
  | 'refactor';

// ─── Tier 2: Detailed Model Results ───
export interface ProcessCostResult {
  abcAllocation: number;
  copqEstimate: number;
  processMiningSavings: number;
}

export interface DataMigrationCostResult {
  cleansingCost: number;
  etlComplexity: number;
  entityAttributeCost: number;
}

export interface TrainingChangeCostResult {
  prosciADKAR: number;
  wrightLearningCurve: number;
  jCurveProductivityLoss: number;
  changeSaturation: number;
}

export interface AppTransformationCostResult {
  cocomoII: number;
  sqaleTDR: number;
  sevenRsMultiplier: number;
  legacyMaintenanceCurve: number;
}

export interface InfrastructureCostResult {
  tcoAggregation: number;
  finOpsOptimization: number;
  downtimeCost: number;
}

// ─── Tier 3: Probabilistic Results ───
export interface ProbabilisticCostResult {
  pertMean: number;
  pertStdDev: number;
  p10: number;
  p50: number;
  p90: number;
  rNPV: number;
  var95: number;
  histogram: { bucket: number; count: number }[];
}

export interface WSJFResult {
  elementId: string;
  elementName: string;
  costOfDelay: number;
  jobSize: number;
  wsjfScore: number;
  cd3Score: number;
}

export interface EVMMetrics {
  plannedValue: number;
  earnedValue: number;
  actualCost: number;
  cpi: number;                        // Cost Performance Index = EV/AC
  spi: number;                        // Schedule Performance Index = EV/PV
  eac: number;                        // Estimate at Completion = BAC/CPI
  etc: number;                        // Estimate to Complete = EAC - AC
  vac: number;                        // Variance at Completion = BAC - EAC
}

// ─── Portfolio Cost Summary ───
export interface PortfolioCostSummary {
  totalCost: number;
  dimensions: Partial<CostDimension>;
  byDomain: Record<string, number>;
  byStatus: Record<string, number>;
  byStrategy: Partial<Record<SevenRsStrategy, number>>;
  elementCount: number;
  tier: CostTier;
  confidenceBand: string;
  p10?: number;
  p50?: number;
  p90?: number;
}

// ─── Industry Defaults ───
export interface IndustryDefaults {
  hourlyRateDACH: number;             // 85 EUR/h
  cmBudgetPercent: number;            // 0.10 (10% of project budget)
  wrightLearningRate: number;         // 0.80 (80% learning curve)
  defaultDataErrorRate: number;       // 0.20 (20% error rate)
  migrationCostPerRecord: number;     // 1.50 EUR
  maintenanceGrowthRate: number;      // 0.10 (10%/year)
  productivityDipPercent: number;     // 0.20 (J-curve: -20% over 4 months)
  productivityDipMonths: number;      // 4
  defaultTDR: number;                 // 0.15 (15% technical debt ratio)
  discountRate: number;               // 0.08 (8% WACC)
  successProbPhase1: number;          // 0.70
  successProbPhase2: number;          // 0.80
  successProbPhase3: number;          // 0.90
  copqAsRevenuePercent: number;       // 0.20 (4-sigma organization)
  trainingDaysLow: number;            // 3
  trainingDaysMedium: number;         // 5
  trainingDaysHigh: number;           // 10
  cloudWastePercent: number;          // 0.30 (25-35%)
  downtimeCostPerHourSME: number;     // 14000 EUR (8K-20K)
  conditionalRiskDirect: number;      // 0.85
  fluktuationCostMultiplier: number;  // 1.75 (1.5-2.0x annual salary)
  onPremUtilization: number;          // 0.60 (60%)
  changeSaturationThreshold: number;  // 3 concurrent changes
  changeSaturationK: number;          // 0.225 (k ≈ 0.15-0.30)
}
