import type { ArchitectureLayer, TOGAFDomain, ElementType, ElementStatus, RiskLevel, Position3D, ConnectionType } from './architecture.types';

// ─── Questionnaire (user-facing, beginner-friendly) ───

export interface BlueprintQuestionnaire {
  // Card 1: Your Business → Motivation layer
  businessDescription: string;
  targetUsers: string;
  problemSolved: string;
  urgencyDriver?: string;
  // Card 2: Your Goals → Motivation layer
  goals: [string, string, string];
  successVision?: string;
  principles?: string;
  // Card 3: Capabilities → Strategy layer
  capabilities: string;
  customerJourney?: string;
  // Card 4: Processes & People → Business layer
  teamDescription?: string;
  mainProcesses?: string;
  // Card 5: Technology → Application + Technology layers
  existingTools?: string[];
  productType?: BlueprintProductType;
  techDecisions?: string;
  // Card 6: Constraints → Motivation layer
  constraints?: string;
  teamSize?: '1-2' | '3-5' | '6-15' | '16-50' | '50+';
  monthlyBudget?: '<500' | '500-2K' | '2K-10K' | '10K-50K' | '50K+';
  regulations?: string[];
}

export type BlueprintProductType =
  | 'web_app'
  | 'mobile_app'
  | 'api_platform'
  | 'marketplace'
  | 'saas'
  | 'hardware_software'
  | 'other';

export type BlueprintComplexity = 'minimal' | 'standard' | 'comprehensive';

// ─── Serialized Input (sent to backend) ───

export interface BlueprintInput {
  motivation: string;
  strategy: string;
  requirements: string;
  industryHint?: string;
  complexityHint?: BlueprintComplexity;
  rawQuestionnaire: BlueprintQuestionnaire;
  /**
   * If true (default), generated connections are persisted to Neo4j as part
   * of generateBlueprint. If false, only the stream events are emitted and the
   * caller is responsible for persisting.
   */
  applyConnections?: boolean;
  /** Required when applyConnections is true (default). */
  projectId?: string;
}

// ─── Generated Output ───

export interface BlueprintGeneratedElement {
  id: string;
  name: string;
  type: ElementType;
  layer: ArchitectureLayer;
  togafDomain: TOGAFDomain;
  description: string;
  status: ElementStatus;
  riskLevel: RiskLevel;
  maturityLevel: number;
  position3D: Position3D;
}

export interface BlueprintGeneratedConnection {
  id: string;
  sourceId: string;
  targetId: string;
  sourceName: string;
  targetName: string;
  type: ConnectionType;
  label: string;
}

export interface BlueprintValidationResult {
  isValid: boolean;
  elementCount: number;
  connectionCount: number;
  layerCoverage: Partial<Record<ArchitectureLayer, number>>;
  warnings: string[];
  errors: string[];
  typeFixups: number;
  orphanedElements: string[];
}

export interface BlueprintResult {
  elements: BlueprintGeneratedElement[];
  connections: BlueprintGeneratedConnection[];
  validation: BlueprintValidationResult;
  input: BlueprintInput;
  generatedAt: string;
}

// ─── SSE Stream Events ───

export type BlueprintStreamEvent =
  | { type: 'progress'; phase: 'elements' | 'connections' | 'validation'; message: string; percent: number }
  | { type: 'elements_ready'; count: number }
  | { type: 'connections_ready'; count: number }
  | { type: 'connections_persisted'; count: number }
  | { type: 'complete'; result: BlueprintResult }
  | { type: 'error'; message: string };
