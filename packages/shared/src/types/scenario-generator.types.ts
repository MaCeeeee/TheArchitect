// ─── AI Scenario Generator: Oracle → Scenario Bridge ───

import type { OracleChangeType, AgentVerdictPosition } from './oracle.types';

// ─── Requirement Diff: What changed vs. the original proposal ───

export type ScopeChangeType = 'removed' | 'phased' | 'retained' | 'added' | 'modified';

export interface ScopeChange {
  type: ScopeChangeType;
  description: string;
  elementId?: string;
  elementName?: string;
  reason: string; // which resistance factor or stakeholder concern triggered this
}

export interface NumericDelta {
  original: number;
  alternative: number;
  delta: number;
  deltaPercent: number;
}

export interface AddressedBlocker {
  stakeholder: string;
  originalScore: number;
  originalPosition: AgentVerdictPosition;
  resistanceFactor: string;
  mitigation: string; // how this alternative addresses the blocker
}

export interface RequirementDiff {
  scopeChanges: ScopeChange[];
  costDelta: NumericDelta;
  durationDelta: NumericDelta;
  changeTypeDelta: { original: OracleChangeType; alternative: OracleChangeType; changed: boolean };
  addressedBlockers: AddressedBlocker[];
  tradeOffs: string[];
}

// ─── LLM Output: Alternative Spec (parsed from LLM response) ───

export interface AlternativeElementChange {
  elementId: string;
  action: 'remove' | 'phase_out' | 'retain' | 'modify' | 'add';
  field?: string;       // e.g. 'status', 'transformationStrategy'
  newValue?: string;    // e.g. 'transitional', 'retain'
  reason: string;
}

export interface AlternativeSpec {
  name: string;
  strategy: string;     // 1-2 sentence strategic summary
  changeType: OracleChangeType;
  addressedResistance: string[];   // which resistance factors this addresses
  elementChanges: AlternativeElementChange[];
  adjustedCost: number;
  adjustedDuration: number; // months
  rationale: string;    // why this alternative is better for the blockers
  tradeOffs: string[];  // what is lost or weakened
}

// ─── Generator Result: Returned to client ───

export interface GeneratedAlternative {
  scenarioId: string;
  name: string;
  strategy: string;
  addressedResistance: string[];
  adjustedCost: number;
  adjustedDuration: number;
  rationale: string;
  requirementDiff: RequirementDiff;
  oracleAssessment?: {  // only when autoAssess: true
    assessmentId: string;
    acceptanceRiskScore: number;
    riskLevel: string;
    overallPosition: string;
    deltaFromOriginal: number; // score improvement vs. original
  };
}

export interface GenerationTrace {
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  durationMs: number;
}

export interface GeneratorResult {
  sourceAssessmentId: string;
  alternatives: GeneratedAlternative[];
  generationTrace: GenerationTrace;
}

// ─── Generator Options: Request body ───

export interface GeneratorOptions {
  maxAlternatives?: number;       // default: 3, max: 5
  focusStakeholders?: string[];   // only address specific blocker personas
  preserveChangeType?: boolean;   // if true, alternatives keep same changeType
  autoAssess?: boolean;           // if true, auto-run Oracle on each alternative
}
