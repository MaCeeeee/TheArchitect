// ─── Cost Data Enrichment Types ───
// Used by the enrichment pipeline: external tools → AI matching → cost field updates

import type { SevenRsStrategy } from './cost.types';

// ─── Cost Fields (subset of ArchitectureElement) ───

export interface CostFields {
  annualCost: number;
  transformationStrategy: SevenRsStrategy;
  userCount: number;
  recordCount: number;
  ksloc: number;
  technicalFitness: number;       // 1-5
  functionalFitness: number;      // 1-5
  errorRatePercent: number;       // 0-100
  hourlyRate: number;
  monthlyInfraCost: number;
  technicalDebtRatio: number;     // 0-1
  costEstimateOptimistic: number;
  costEstimateMostLikely: number;
  costEstimatePessimistic: number;
  successProbability: number;     // 0-1
  costOfDelayPerWeek: number;
}

export const COST_FIELD_KEYS: (keyof CostFields)[] = [
  'annualCost', 'transformationStrategy', 'userCount', 'recordCount',
  'ksloc', 'technicalFitness', 'functionalFitness', 'errorRatePercent',
  'hourlyRate', 'monthlyInfraCost', 'technicalDebtRatio',
  'costEstimateOptimistic', 'costEstimateMostLikely', 'costEstimatePessimistic',
  'successProbability', 'costOfDelayPerWeek',
];

export const COST_FIELD_LABELS: Record<keyof CostFields, string> = {
  annualCost: 'Annual Cost (EUR)',
  transformationStrategy: 'Strategy (7Rs)',
  userCount: 'Affected Users',
  recordCount: 'Data Records',
  ksloc: 'KSLOC',
  technicalFitness: 'Tech Fitness (1-5)',
  functionalFitness: 'Business Fit (1-5)',
  errorRatePercent: 'Defect Rate (%)',
  hourlyRate: 'Hourly Rate (EUR)',
  monthlyInfraCost: 'Infra/Month (EUR)',
  technicalDebtRatio: 'Tech Debt Ratio (0-1)',
  costEstimateOptimistic: 'Best Case (EUR)',
  costEstimateMostLikely: 'Most Likely (EUR)',
  costEstimatePessimistic: 'Worst Case (EUR)',
  successProbability: 'Success Prob. (0-1)',
  costOfDelayPerWeek: 'Cost of Delay (EUR/wk)',
};

// ─── Enrichment Result from Connector ───

export interface CostEnrichmentResult {
  sourceKey: string;              // external tool identifier (e.g. SonarQube project key)
  sourceName: string;             // human-readable name
  fields: Partial<CostFields>;   // only fields this source can provide
  confidence: number;             // 0-1 data quality confidence
  metadata: Record<string, unknown>;
}

// ─── AI Matching ───

export type MatchMethod = 'exact' | 'fuzzy' | 'ai';

export interface EnrichmentMatch {
  enrichment: CostEnrichmentResult;
  elementId: string;
  elementName: string;
  elementType: string;
  confidence: number;             // 0-1 match confidence
  matchMethod: MatchMethod;
}

export interface EnrichmentPreview {
  matches: EnrichmentMatch[];
  unmatched: CostEnrichmentResult[];
  elementCount: number;           // total elements in project
  source: string;                 // 'csv' | 'sonarqube' | connector type
}

// ─── Conflict Resolution ───

export type ConflictStrategy = 'overwrite' | 'skip' | 'higher_wins';

export interface EnrichmentApplyRequest {
  matches: Array<{
    elementId: string;
    fields: Partial<CostFields>;
    conflictStrategy: ConflictStrategy;
  }>;
}

export interface EnrichmentApplyResult {
  updated: number;
  skipped: number;
  errors: string[];
}

// ─── CSV Enrichment ───

export interface CSVEnrichmentRow {
  matchColumn: string;            // element name or ID
  fields: Partial<CostFields>;
  rawRow: Record<string, string>; // original CSV columns
}
