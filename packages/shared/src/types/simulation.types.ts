import type { ArchitectureLayer, TOGAFDomain, RiskLevel } from './architecture.types';

// ─── Agent Personas ───

export type StakeholderType = 'c_level' | 'business_unit' | 'it_ops' | 'data_team' | 'external';

export interface AgentPersona {
  id: string;
  name: string;
  stakeholderType: StakeholderType;
  visibleLayers: ArchitectureLayer[];
  visibleDomains: TOGAFDomain[];
  maxGraphDepth: number;
  budgetConstraint?: number;
  riskThreshold?: RiskLevel;
  expectedCapacity: number;         // Max parallel changes agent can handle (default: 5)
  roundToMonthFactor?: number;      // Simulation round → real months (default: 2)
  priorities: string[];
  systemPromptSuffix: string;
}

// ─── Custom Personas ───

export type PersonaScope = 'project' | 'user';

export interface CustomPersona extends AgentPersona {
  _id?: string;
  scope: PersonaScope;
  basedOnPresetId: string;
  projectId?: string;
  userId: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomPersonaInput {
  basedOnPresetId: string;
  scope: PersonaScope;
  name: string;
  stakeholderType: StakeholderType;
  visibleLayers: string[];
  visibleDomains: string[];
  maxGraphDepth?: number;
  budgetConstraint?: number;
  riskThreshold?: string;
  expectedCapacity: number;
  priorities: string[];
  systemPromptSuffix: string;
  description?: string;
}

// ─── Proposed Actions (Structured LLM Output) ───

export type ActionType =
  | 'modify_status'
  | 'modify_risk'
  | 'recommend_retire'
  | 'recommend_invest'
  | 'flag_dependency'
  | 'request_budget'
  | 'block_change'
  | 'approve_change';

export type AgentPosition = 'approve' | 'reject' | 'modify' | 'abstain';

export interface ProposedAction {
  type: ActionType;
  targetElementId: string;
  targetElementName: string;
  changes?: Record<string, string>;
  reasoning: string;
  estimatedCostImpact?: number;
  estimatedRiskImpact?: number;       // -10 to +10
}

export interface ValidationResult {
  valid: boolean;
  action: ProposedAction;
  rejectionReason?: string;
}

// ─── Agent Turn (per agent per round) ───

export interface AgentTurn {
  agentPersonaId: string;
  agentName: string;
  reasoning: string;
  position: AgentPosition;
  proposedActions: ProposedAction[];
  validatedActions: ProposedAction[];
  rejectedActions: ValidationResult[];
  llmTokensUsed: number;
  durationMs: number;
}

// ─── Emergence Events ───

export type EmergenceEventType =
  | 'consensus'
  | 'deadlock'
  | 'fatigue'
  | 'escalation'
  | 'compromise'
  | 'coalition';

export interface EmergenceEvent {
  type: EmergenceEventType;
  description: string;
  involvedAgents: string[];
  severity: number;                    // 0.0 - 1.0
  round: number;
}

// ─── Simulation Round ───

export interface SimulationRound {
  roundNumber: number;
  agentTurns: AgentTurn[];
  emergenceEvents: EmergenceEvent[];
  fatigueSnapshot: {
    globalIndex: number;
    rating: FatigueRating;
    perAgent: Record<string, number>;  // agentId → fatigueIndex
  };
}

// ─── Fatigue Model (3-Factor "Organisations-Physik") ───

export type FatigueRating = 'green' | 'yellow' | 'orange' | 'red';

export interface AgentFatigueDetail {
  agentId: string;
  agentName: string;
  fatigueIndex: number;                // 0.0 - 1.0 composite
  concurrencyLoad: number;             // Factor 1: parallel load vs capacity
  negotiationDrag: number;             // Factor 2: rounds to consensus
  constraintPressure: number;          // Factor 3: budget/risk utilization
  bottleneckElements: string[];        // Element IDs overloading this agent
  projectedDelayMonths: number;
}

export interface ElementFatigueDetail {
  elementId: string;
  elementName: string;
  negotiationDrag: number;
  involvedAgents: string[];
  conflictRounds: number;
  projectedDelayMonths: number;
}

export interface FatigueReport {
  globalIndex: number;                  // 0.0 - 1.0
  rating: FatigueRating;
  perAgent: AgentFatigueDetail[];
  perElement: ElementFatigueDetail[];
  totalProjectedDelayMonths: number;
  budgetAtRisk: number;
  recommendation: string;              // LLM-generated executive summary
}

// ─── Emergence Metrics ───

export interface EmergenceMetrics {
  totalInteractions: number;
  deadlockCount: number;
  consensusScore: number;              // 0-1
  fatigueIndex: number;                // 0-1 (3-factor composite)
  fatigueRating: FatigueRating;
  avgRoundsToConsensus: number;
  blockedHallucinations: number;
  totalProjectedDelayMonths: number;
  budgetAtRisk: number;
}

// ─── Simulation Result ───

export interface SimulationResult {
  outcome: 'consensus' | 'deadlock' | 'partial_consensus' | 'timeout';
  summary: string;
  riskDelta: Record<string, number>;   // elementId → risk change
  costDelta: Record<string, number>;   // elementId → cost change
  recommendedActions: ProposedAction[];
  fatigue: FatigueReport;
  emergenceMetrics: EmergenceMetrics;
}

// ─── Simulation Config ───

export type ScenarioType =
  | 'cloud_migration'
  | 'mna_integration'
  | 'technology_refresh'
  | 'cost_optimization'
  | 'org_restructure'
  | 'custom';

export interface SimulationConfig {
  agents: AgentPersona[];
  maxRounds: number;
  targetElementIds: string[];
  scenarioDescription: string;
  scenarioType: ScenarioType;
  name?: string;
}

// ─── Simulation Run (persisted in MongoDB) ───

export type SimulationStatus = 'configuring' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface SimulationRun {
  id: string;
  projectId: string;
  createdBy: string;
  name: string;
  status: SimulationStatus;
  scenarioType: ScenarioType;
  config: SimulationConfig;
  rounds: SimulationRound[];
  result?: SimulationResult;
  totalTokensUsed: number;
  totalDurationMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface SimulationRunSummary {
  id: string;
  name: string;
  status: SimulationStatus;
  scenarioType: ScenarioType;
  outcome?: string;
  fatigueRating?: FatigueRating;
  totalRounds: number;
  createdAt: string;
}

// ─── SSE Stream Events ───

export type SimulationStreamEvent =
  | { type: 'round_start'; round: number }
  | { type: 'agent_start'; agentId: string; agentName: string }
  | { type: 'reasoning_chunk'; text: string }
  | { type: 'actions'; validated: ProposedAction[]; rejected: ValidationResult[] }
  | { type: 'agent_turn_complete'; agentId: string; agentName: string; round: number; reasoning: string; position: AgentPosition; validatedActions: ProposedAction[]; rejectedCount: number }
  | { type: 'fatigue_update'; globalIndex: number; rating: FatigueRating; perAgent: Array<{ agentId: string; fatigueIndex: number; concurrencyLoad: number; negotiationDrag: number; constraintPressure: number }> }
  | { type: 'emergence'; events: EmergenceEvent[] }
  | { type: 'round_end'; round: number; globalFatigue: number; fatigueRating: FatigueRating }
  | { type: 'complete'; result: SimulationResult }
  | { type: 'error'; message: string };
