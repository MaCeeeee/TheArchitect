// ─── Oracle: Acceptance Risk Assessment ───

export type OracleChangeType = 'retire' | 'migrate' | 'consolidate' | 'introduce' | 'modify';
export type OracleRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type OraclePosition = 'likely_accepted' | 'contested' | 'likely_rejected';
export type AgentVerdictPosition = 'approve' | 'reject' | 'modify' | 'abstain';
export type ResistanceSeverity = 'low' | 'medium' | 'high';

export type OracleStakeholderWeight = 'voting' | 'advisory';

export interface OracleCustomStakeholder {
  name: string;                    // e.g. "Head of HR", "Legal Counsel", "Plant Manager Zurich"
  role: string;                    // free-text role description
  stakeholderType: string;         // custom category, e.g. "hr", "legal", "plant_ops"
  weight: OracleStakeholderWeight; // 'voting' = 0.15, 'advisory' = 0.05
  riskThreshold: 'low' | 'medium' | 'high';
  priorities: string[];            // e.g. ['employee_retention', 'change_fatigue', 'training_budget']
  visibleLayers: string[];         // which architecture layers they understand
  context?: string;                // optional free-text context about their perspective
}

export interface OracleProposal {
  title: string;
  description: string;
  affectedElementIds: string[];
  changeType: OracleChangeType;
  estimatedCost?: number;
  estimatedDuration?: number; // months
  targetScenarioId?: string;
  customStakeholders?: OracleCustomStakeholder[];
}

export interface AgentVerdict {
  personaId: string;
  personaName: string;
  stakeholderType: string;
  position: AgentVerdictPosition;
  reasoning: string;
  concerns: string[];
  acceptanceScore: number; // 0-100
}

export interface ResistanceFactor {
  factor: string;
  severity: ResistanceSeverity;
  source: string;
  description: string;
}

export interface OracleFatigueForecast {
  projectedDelayMonths: number;
  budgetAtRisk: number;
  overloadedStakeholders: string[];
}

export interface OracleModelParams {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  fallbackUsed: boolean;
  actualProvider?: string; // differs from provider if fallback was triggered
}

export interface OracleAuditAgentReport {
  personaId: string;
  personaName: string;
  stakeholderType: string;
  riskThreshold: string;
  budgetConstraint: number;
  expectedCapacity: number;
  priorities: string[];
  visibleLayers: string[];
  position: AgentVerdictPosition;
  acceptanceScore: number;
  reasoning: string;
  concerns: string[];
  weight: number;
  weightedRiskContribution: number;
  // ─── EU AI Act Art. 13-14: Full Decision Trace ───
  systemPrompt: string;           // complete prompt sent to LLM
  rawResponse: string;            // verbatim LLM output before parsing
  architectureContext: string;    // filtered context this agent could see
  modelParams: OracleModelParams; // exact model config for reproducibility
}

export type OracleHumanOversightStatus = 'pending_review' | 'reviewed' | 'approved' | 'rejected';

export interface OracleContextSnapshot {
  id: string;                // SHA-256 hash of combined context data
  timestamp: string;         // when context was captured
  elementCount: number;      // total elements in project at time of assessment
  connectionCount: number;   // total connections in project
  affectedElementCount: number;
}

export interface OracleSystemRiskClassification {
  euAiActLevel: 'minimal' | 'limited' | 'high-risk';
  justification: string;
  humanOversightRequired: boolean;
  articleReference: string;
}

export interface OracleHumanOversight {
  status: OracleHumanOversightStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  notes?: string;
}

export interface OracleAuditReport {
  assessmentId: string;
  timestamp: string;
  provider: string;
  model: string;
  // ─── EU AI Act Art. 6-7: System Risk Classification ───
  systemRiskClassification: OracleSystemRiskClassification;
  // ─── EU AI Act Art. 14: Human Oversight ───
  humanOversight: OracleHumanOversight;
  // ─── Jasper Principle: Context Version at Timestamp T ───
  contextSnapshot: OracleContextSnapshot;
  proposal: OracleProposal & {
    affectedElements: Array<{
      id: string;
      name: string;
      type: string;
      layer: string;
      annualCost: number;
      maturityLevel: number;
      riskLevel: string;
      errorRatePercent: number;
      technicalDebtRatio: number;
      userCount: number;
      dependencyCount: number;
      dependentCount: number;
    }>;
  };
  agentReports: OracleAuditAgentReport[];
  scoring: {
    method: string;
    weights: Record<string, number>;
    rawScore: number;
    roundedScore: number;
    riskLevel: OracleRiskLevel;
    overallPosition: OraclePosition;
  };
}

export interface OracleVerdict {
  acceptanceRiskScore: number; // 0-100
  riskLevel: OracleRiskLevel;
  overallPosition: OraclePosition;
  agentVerdicts: AgentVerdict[];
  resistanceFactors: ResistanceFactor[];
  mitigationSuggestions: string[];
  fatigueForecast: OracleFatigueForecast;
  auditReport?: OracleAuditReport;
  timestamp: string;
  durationMs: number;
}
