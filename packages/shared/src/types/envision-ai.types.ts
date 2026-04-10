// ─── Phase A: AI-Assisted Architecture Vision Types ───

export interface AIVisionSuggestion {
  scope: string;
  visionStatement: string;
  principles: string[];
  drivers: string[];
  goals: string[];
}

export interface AIStakeholderSuggestion {
  name: string;
  role: string;
  stakeholderType: 'c_level' | 'business_unit' | 'it_ops' | 'data_team' | 'external';
  interests: string[];
  influence: 'high' | 'medium' | 'low';
  attitude: 'champion' | 'supporter' | 'neutral' | 'critic';
  rationale: string;
}

export interface AIPrincipleSuggestion {
  name: string;
  description: string;
}

export interface AIConflictInsight {
  stakeholderNames: string[];
  conflictType: 'interest_conflict' | 'missing_type' | 'influence_imbalance' | 'coverage_gap';
  severity: 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
}

export interface AIReadinessAssessment {
  overallScore: number;
  categories: Array<{
    name: string;
    score: number;
    feedback: string;
    suggestions: string[];
  }>;
  topImprovements: string[];
}

export interface AIDocumentExtraction {
  vision: AIVisionSuggestion;
  stakeholders: AIStakeholderSuggestion[];
}
