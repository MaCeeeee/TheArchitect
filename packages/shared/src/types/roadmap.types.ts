import type { ElementStatus } from './architecture.types';

// ─── Strategy ───
export type RoadmapStrategy = 'conservative' | 'balanced' | 'aggressive';

// ─── Config ───
export interface RoadmapConfig {
  strategy: RoadmapStrategy;
  maxWaves: number; // 2-8, default 4
  targetStates: Record<string, ElementStatus>; // elementId → desired status
  includeAIRecommendations: boolean;
  customConstraints?: string;
}

// ─── Wave Element ───
export interface WaveElement {
  elementId: string;
  name: string;
  type: string;
  layer: string;
  currentStatus: ElementStatus;
  targetStatus: ElementStatus;
  riskScore: number;
  estimatedCost: number;
  stakeholderFatigue: number; // 0-1
  dependsOnElementIds: string[];
  costModel?: 'n8n' | 'enterprise';
  estimatedHours?: number;
  topologyComplexity?: number; // 1.0 - 10.0
}

// ─── Wave Metrics ───
export interface WaveMetrics {
  totalCost: number;
  riskDelta: number; // negative = risk reduction
  complianceImpact: number; // violations resolved
  avgFatigue: number;
  elementCount: number;
  totalEstimatedHours?: number;
}

// ─── Roadmap Wave ───
export interface RoadmapWave {
  waveNumber: number;
  name: string;
  description: string;
  elements: WaveElement[];
  metrics: WaveMetrics;
  recommendation?: string;
  riskMitigations?: string[];
  stakeholderNotes?: string;
  dependsOnWaves: number[];
  estimatedDurationMonths: number;
}

// ─── Summary ───
export interface RoadmapSummary {
  totalCost: number;
  totalDurationMonths: number;
  totalElements: number;
  riskReduction: number; // % reduction
  complianceImprovement: number; // violations resolved
  waveCount: number;
  costConfidence: { p10: number; p50: number; p90: number };
}

// ─── Full Roadmap ───
export interface TransformationRoadmap {
  id: string;
  projectId: string;
  createdBy: string;
  name: string;
  config: RoadmapConfig;
  waves: RoadmapWave[];
  summary: RoadmapSummary;
  advisorInsightsAddressed: string[];
  status: 'generating' | 'completed' | 'failed';
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ─── List Item ───
export interface RoadmapListItem {
  id: string;
  name: string;
  status: string;
  waveCount: number;
  totalCost: number;
  totalDurationMonths: number;
  strategy: RoadmapStrategy;
  version: number;
  createdAt: string;
}

// ─── TOGAF Gap Analysis ───
export type GapCategory = 'upgrade' | 'modernize' | 'retire' | 'retain';

export type ConfidenceLevel = 'measured' | 'estimated' | 'heuristic';

export interface MigrationCandidate {
  elementId: string;
  name: string;
  type: string;
  togafDomain: string;
  currentStatus: ElementStatus;
  suggestedTarget: ElementStatus;
  riskLevel: string;
  connectionCount: number;
  gapCategory: GapCategory;
  autoSelected: boolean;
  confidenceScore: number;       // 0-1: how much real data backs this estimate
  confidenceLevel: ConfidenceLevel;
  confidenceFactors: string[];   // what data sources feed this estimate
}

export interface CandidatesPreview {
  candidates: MigrationCandidate[];
  totalElements: number;
  autoSelectedCount: number;
  dataConfidence: {
    overall: number;             // 0-1 average across all candidates
    measuredCount: number;       // elements backed by real data
    estimatedCount: number;      // elements with partial data
    heuristicCount: number;      // elements with no data, pure heuristic
  };
}
