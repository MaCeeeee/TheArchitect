export type PatternLifecycleStatus =
  | 'approved'
  | 'conditional'
  | 'investigate'
  | 'retiring'
  | 'unapproved';

export type PatternRiskLevel = 'low' | 'medium' | 'high';

export type CostRange = '€' | '€€' | '€€€';

export type PatternCategory =
  | 'integration'
  | 'data'
  | 'security'
  | 'observability'
  | 'compute'
  | 'messaging';

export interface DecisionPatternComplianceScore {
  togaf?: number;
  dora?: number;
  nis2?: number;
}

export interface DecisionPattern {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: PatternCategory;
  decisionContext: string;
  complianceScore: DecisionPatternComplianceScore;
  costRange: CostRange;
  riskLevel: PatternRiskLevel;
  lifecycleStatus: PatternLifecycleStatus;
  whyThis: string;
  detectorRefs: string[];
  tags: string[];
  version: string;
  deprecatedAt: string | null;
  successorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatternAdoptionEvent {
  id: string;
  patternId: string;
  projectId: string;
  userId: string;
  version: string;
  timestamp: string;
}

export interface PatternAdoptionStats {
  totalUses: number;
  last30Days: number;
  uniqueProjects: number;
}
