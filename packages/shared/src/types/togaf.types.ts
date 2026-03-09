import type { ADMPhase, TOGAFDomain } from './architecture.types';

// === ADM Phase Details ===

export interface ADMPhaseDetail {
  phase: ADMPhase;
  name: string;
  description: string;
  objectives: string[];
  inputs: string[];
  outputs: string[];
  steps: string[];
}

export interface ADMPhaseProgress {
  phase: ADMPhase;
  status: 'not_started' | 'in_progress' | 'completed';
  completionPercentage: number;
  startDate?: string;
  targetDate?: string;
  artifacts: string[];
  notes: string;
}

// === Viewpoints ===

export type ViewpointType =
  | 'stakeholder'
  | 'business_process'
  | 'application_portfolio'
  | 'data_landscape'
  | 'technology_standards'
  | 'migration_planning'
  | 'custom';

export interface Viewpoint {
  id: string;
  name: string;
  type: ViewpointType;
  description: string;
  stakeholders: string[];
  concerns: string[];
  domainFilter: TOGAFDomain[];
  layerFilter: string[];
  elementTypeFilter: string[];
}

// === Business Architecture ===

export interface BusinessCapability {
  id: string;
  name: string;
  level: number; // 1=L1, 2=L2, 3=L3
  parentId?: string;
  maturityLevel: number;
  strategicImportance: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export interface ValueStream {
  id: string;
  name: string;
  description: string;
  stages: ValueStreamStage[];
  stakeholder: string;
}

export interface ValueStreamStage {
  id: string;
  name: string;
  description: string;
  participatingCapabilities: string[];
  enablingApplications: string[];
  kpis: KPI[];
}

export interface KPI {
  name: string;
  value: number;
  target: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
}

// === Data Architecture ===

export type DataModelLevel = 'conceptual' | 'logical' | 'physical';

export interface DataEntity {
  id: string;
  name: string;
  description: string;
  classification: 'public' | 'internal' | 'confidential' | 'restricted';
  owner: string;
  qualityScore: number; // 0-100
  modelLevel: DataModelLevel;
}

export interface DataGovernancePolicy {
  id: string;
  name: string;
  description: string;
  scope: string;
  rules: string[];
  complianceStatus: 'compliant' | 'non_compliant' | 'partial';
}

// === Application Architecture ===

export interface ApplicationPortfolioEntry {
  id: string;
  name: string;
  businessValue: number; // 1-5
  technicalFit: number;  // 1-5
  lifecycle: 'invest' | 'tolerate' | 'migrate' | 'eliminate';
  annualCost: number;
  userCount: number;
  vendor?: string;
  technology: string[];
}

// === Technology Architecture ===

export interface TechnologyStandard {
  id: string;
  name: string;
  category: 'approved' | 'emerging' | 'contained' | 'retired';
  domain: string;
  description: string;
  version?: string;
  expiryDate?: string;
}

export interface InfrastructureComponent {
  id: string;
  name: string;
  type: 'server' | 'network' | 'storage' | 'cloud_service' | 'container' | 'database';
  environment: 'production' | 'staging' | 'development' | 'disaster_recovery';
  provider: string;
  monthlyCost: number;
  utilization: number; // 0-100
}

// === Architecture Content Framework ===

export interface ArchitectureCatalog {
  id: string;
  name: string;
  domain: TOGAFDomain;
  entries: CatalogEntry[];
}

export interface CatalogEntry {
  id: string;
  name: string;
  type: string;
  description: string;
  status: string;
  owner?: string;
}

export interface ArchitectureMatrix {
  id: string;
  name: string;
  rowDomain: TOGAFDomain;
  colDomain: TOGAFDomain;
  description: string;
}

// === Enterprise Continuum ===

export interface ArchitecturePattern {
  id: string;
  name: string;
  category: 'foundation' | 'common_systems' | 'industry' | 'organization';
  domain: TOGAFDomain;
  description: string;
  applicability: string;
  consequences: string;
  elements: string[];
  connections: string[];
}
