export type ArchitectureLayer =
  | 'motivation'
  | 'strategy'
  | 'business'
  | 'information'
  | 'application'
  | 'technology'
  | 'physical'
  | 'implementation_migration';

export type TOGAFDomain = 'business' | 'data' | 'application' | 'technology' | 'motivation' | 'implementation';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ElementStatus = 'current' | 'target' | 'transitional' | 'retired';

export type ElementType =
  // Strategy
  | 'business_capability'
  | 'value_stream'
  | 'resource'
  | 'course_of_action'
  // Business
  | 'process'
  | 'business_service'
  | 'business_actor'
  | 'business_role'
  | 'business_collaboration'
  | 'business_interface'
  | 'business_function'
  | 'business_interaction'
  | 'business_event'
  | 'business_object'
  | 'contract'
  | 'representation'
  | 'product'
  // Application
  | 'application'
  | 'application_component'
  | 'application_service'
  | 'service'
  | 'application_collaboration'
  | 'application_interface'
  | 'application_function'
  | 'application_interaction'
  | 'application_process'
  | 'application_event'
  | 'data_object'
  // Information / Data
  | 'data_entity'
  | 'data_model'
  // Technology
  | 'technology_component'
  | 'infrastructure'
  | 'platform_service'
  | 'node'
  | 'device'
  | 'system_software'
  | 'technology_collaboration'
  | 'technology_interface'
  | 'technology_function'
  | 'technology_process'
  | 'technology_interaction'
  | 'technology_event'
  | 'artifact'
  | 'communication_network'
  | 'path'
  // Motivation
  | 'stakeholder'
  | 'driver'
  | 'assessment'
  | 'goal'
  | 'outcome'
  | 'principle'
  | 'requirement'
  | 'constraint'
  | 'meaning'
  | 'am_value'
  // Implementation & Migration
  | 'work_package'
  | 'deliverable'
  | 'implementation_event'
  | 'plateau'
  | 'gap'
  // Physical
  | 'equipment'
  | 'facility'
  | 'distribution_network'
  | 'material'
  // Composite
  | 'grouping'
  | 'location';

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

export type ConnectionType =
  // ArchiMate 3.2 Structural
  | 'composition'
  | 'aggregation'
  | 'assignment'
  | 'realization'
  // ArchiMate 3.2 Dependency
  | 'serving'
  | 'access'
  | 'influence'
  // ArchiMate 3.2 Dynamic
  | 'triggering'
  | 'flow'
  | 'specialization'
  // ArchiMate 3.2 Other
  | 'association'
  // Legacy (backward-compat for existing Neo4j data)
  | 'depends_on'
  | 'connects_to'
  | 'belongs_to'
  | 'implements'
  | 'data_flow'
  | 'triggers'
  | 'cross_architecture';

export type WorkspaceSource = 'bpmn' | 'n8n' | 'manual' | 'archimate' | 'csv';

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
