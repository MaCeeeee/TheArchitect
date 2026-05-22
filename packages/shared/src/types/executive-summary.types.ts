/**
 * UC-EXEC-001 — C-Level Executive Dashboard types.
 *
 * Aggregates UC-CRIT (criticality), UC-COST (cost-engine), UC-ICM-001 (regulations),
 * StandardMappings, TransformationRoadmap, and Scenarios into three persona views
 * (CEO / CIO / CFO) — each with a tone-driven headline + 4–5 KPI cards.
 *
 * Linear: THE-287
 */

export type HeadlineTone = 'positive' | 'warning' | 'critical' | 'neutral';

export interface ExecutiveHeadline {
  title: string;
  subtitle: string;
  tone: HeadlineTone;
}

export interface CeoView {
  headline: ExecutiveHeadline;
  complianceCoverage: {
    regulationsCrawled: number;
    standardMappings: number;
    mappingCoveragePct: number;
  };
  transformationProgress: {
    percent: number;
    atTarget: number;
    total: number;
  };
  strategicRisks: {
    criticalDriverCount: number;
    topRiskName: string | null;
  };
  activeInitiatives: {
    scenarioCount: number;
    roadmapStatus: string | null;
  };
}

export interface CioView {
  headline: ExecutiveHeadline;
  criticalHotspots: {
    count: number;
    topName: string | null;
    topScore: number;
  };
  techDebtIndex: {
    score: number;
    immatureElements: number;
  };
  spofs: {
    count: number;
    topElement: string | null;
  };
  complianceStatus: {
    regulationsCrawled: number;
    mappedElementCount: number;
    coveragePct: number;
  };
  roadmapHealth: {
    waves: number;
    status: string | null;
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
  probabilisticCost: {
    p10: number;
    p50: number;
    p90: number;
  };
  optimizationPotential: {
    value: number;
    percentOfTco: number;
  };
  investmentHeatmap: {
    tierCounts: [number, number, number, number];
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
