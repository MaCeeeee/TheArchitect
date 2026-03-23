import type { ElementStatus, Position3D } from './architecture.types';
import type { PlateauStabilityResult } from './stochastic.types';

// ─── Strategy ───
export type RoadmapStrategy = 'conservative' | 'balanced' | 'aggressive';

// ─── Config ───
export interface RoadmapConfig {
  strategy: RoadmapStrategy;
  maxWaves: number; // 2-8, default 4
  targetStates: Record<string, ElementStatus>; // elementId → desired status
  includeAIRecommendations: boolean;
  customConstraints?: string;
  autoInsertTransitionalStates?: boolean;
  // Compliance-Driven Roadmap (CDTP F3)
  standardId?: string;
  includeComplianceCandidates?: boolean;
  compliancePriorityWeight?: number; // 0-1, default 0.5
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
  plateauStability?: PlateauStabilityResult[];
  complianceProjection?: Array<{
    waveNumber: number;
    projectedPolicyScore: number;
    projectedCoverageScore: number;
  }>;
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

// ─── Transformation Plateau Comparison View (TPCV) ───

export interface PlateauElementState {
  elementId: string;
  name: string;
  type: string;
  layer: string;
  status: ElementStatus;            // cumulative status at this plateau
  previousStatus: ElementStatus;    // status at previous plateau
  isChanged: boolean;               // changed in THIS plateau's wave
  changeWaveNumber: number | null;  // which wave last changed this element (null = never)
  riskScore: number;
  estimatedCost: number;            // cost of the change in the wave (0 if unchanged)
  position3D: Position3D;           // original element position for spatial layout
}

export interface PlateauSnapshot {
  plateauIndex: number;             // 0 = As-Is, 1..N = after wave N
  label: string;                    // "As-Is" or "Wave N: {name}"
  waveNumber: number | null;        // null for As-Is
  elements: Record<string, PlateauElementState>; // elementId → state
  changedElementIds: string[];      // elementIds changed in THIS wave
  cumulativeCost: number;           // sum of costs through this plateau
  cumulativeRiskDelta: number;      // sum of risk deltas through this plateau
  metrics: WaveMetrics | null;      // wave metrics (null for As-Is)
}

export interface CrossPlateauDependency {
  sourceElementId: string;          // element completed in earlier wave
  sourcePlateauIndex: number;       // plateau where source was completed
  targetElementId: string;          // element depending on source
  targetPlateauIndex: number;       // plateau where target is being changed
}
