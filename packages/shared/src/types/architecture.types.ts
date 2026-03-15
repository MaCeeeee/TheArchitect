export type ArchitectureLayer = 'strategy' | 'business' | 'information' | 'application' | 'technology';
export type TOGAFDomain = 'business' | 'data' | 'application' | 'technology';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ElementStatus = 'current' | 'target' | 'transitional' | 'retired';

export type ElementType =
  | 'business_capability'
  | 'process'
  | 'value_stream'
  | 'business_service'
  | 'application'
  | 'application_component'
  | 'application_service'
  | 'data_entity'
  | 'data_model'
  | 'technology_component'
  | 'infrastructure'
  | 'platform_service'
  | 'service';

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface ArchitectureElement {
  id: string;
  type: ElementType;
  name: string;
  description: string;
  layer: ArchitectureLayer;
  togafDomain: TOGAFDomain;
  maturityLevel: number;
  riskLevel: RiskLevel;
  status: ElementStatus;
  position3D: Position3D;
  metadata: Record<string, unknown>;
  projectId: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
  type: ConnectionType;
  label?: string;
  weight?: number;
  metadata?: Record<string, unknown>;
}

export type ConnectionType = 'connects_to' | 'data_flow' | 'cross_architecture';

export type WorkspaceSource = 'bpmn' | 'n8n' | 'manual' | 'archimate';

export interface Workspace {
  id: string;
  name: string;
  projectId: string;
  source: WorkspaceSource;
  color: string;
  offsetX: number;
  createdAt: string;
}

export type ADMPhase =
  | 'preliminary'
  | 'A'  // Architecture Vision
  | 'B'  // Business Architecture
  | 'C'  // Information Systems Architecture
  | 'D'  // Technology Architecture
  | 'E'  // Opportunities & Solutions
  | 'F'  // Migration Planning
  | 'G'  // Implementation Governance
  | 'H'; // Architecture Change Management

export interface ADMPhaseStatus {
  phase: ADMPhase;
  name: string;
  status: 'not_started' | 'in_progress' | 'completed';
  completionPercentage: number;
}

// X-Ray Mode Types
export type XRaySubView = 'risk' | 'cost' | 'timeline';

export interface XRayMetrics {
  totalRiskExposure: number;
  transformationProgress: number;
  timeToTarget: number;
  decisionConfidence: number;
}

export interface XRayElementData {
  elementId: string;
  riskScore: number;
  estimatedCost: number;
  optimizationPotential: number;
  dependencyDepth: number;
  isCriticalPath: boolean;
}

// Re-export simulation types
export type * from './simulation.types';
