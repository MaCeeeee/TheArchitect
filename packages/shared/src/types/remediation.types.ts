import type {
  ArchitectureLayer,
  TOGAFDomain,
  ElementType,
  ElementStatus,
  RiskLevel,
  ConnectionType,
} from './architecture.types';

// ─── Remediation Proposal Types ───

export type ProposalStatus =
  | 'draft'
  | 'validated'
  | 'partially_applied'
  | 'applied'
  | 'rejected'
  | 'expired';

export type RemediationSource = 'compliance' | 'advisor' | 'manual';

// ─── Proposal Elements & Connections ───

export interface ProposalElement {
  tempId: string;
  name: string;
  type: ElementType;
  layer: ArchitectureLayer;
  togafDomain: TOGAFDomain;
  description: string;
  status: ElementStatus;
  riskLevel: RiskLevel;
  maturityLevel: number;
  confidence: number;
  sectionReference?: string;
  reasoning: string;
}

export interface ProposalConnection {
  tempId: string;
  sourceTempId: string;
  targetTempId: string;
  type: ConnectionType;
  label?: string;
  confidence: number;
  reasoning: string;
}

// ─── Validation ───

export interface ProposalElementValidation {
  tempId: string;
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export interface ProposalConnectionValidation {
  tempId: string;
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export interface ProposalValidationResult {
  elementResults: ProposalElementValidation[];
  connectionResults: ProposalConnectionValidation[];
  overallValid: boolean;
  validatedAt: string;
}

// ─── Proposal Document ───

export interface RemediationSourceRef {
  /**
   * Kanonische Norm-Referenz (`corpus:<source>` | `upload:<standardId>`) —
   * der Schlüssel, unter dem der Rückschluss die auslösende Anforderung
   * wiederfindet. Gilt für BEIDE Welten (THE-643).
   */
  normId?: string;
  /**
   * Nur die Upload-Welt: die echte `Standard`-ObjectId. Ein Korpus-Schlüssel
   * passt hier nicht hinein — das war der Cast-Fehler aus THE-642. Bleibt für
   * Bestandsdaten, bis THE-390 P4 den Index umlegt (ADR-0004 E4).
   */
  standardId?: string;
  sectionIds?: string[];
  insightIds?: string[];
}

export interface RemediationProposal {
  id: string;
  projectId: string;
  source: RemediationSource;
  sourceRef?: RemediationSourceRef;
  title: string;
  description: string;
  elements: ProposalElement[];
  connections: ProposalConnection[];
  validation?: ProposalValidationResult;
  status: ProposalStatus;
  confidence: number;
  createdBy: string;
  appliedElementIds?: string[];
  appliedConnectionIds?: string[];
  appliedAt?: string;
  appliedBy?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── SSE Stream Events ───

export type RemediationStreamEvent =
  | { type: 'generation_start'; proposalId: string }
  | { type: 'progress'; message: string; percent: number }
  | { type: 'validation_start' }
  | { type: 'validation_result'; result: ProposalValidationResult }
  | { type: 'complete'; proposal: RemediationProposal }
  | { type: 'error'; message: string };

// ─── Generation Context (polymorphic by source) ───

export interface ComplianceRemediationContext {
  source: 'compliance';
  standardId: string;
  gapSectionIds: string[];
}

export interface AdvisorRemediationContext {
  source: 'advisor';
  insightIds: string[];
}

export interface ManualRemediationContext {
  source: 'manual';
  prompt: string;
}

export type RemediationContext =
  | ComplianceRemediationContext
  | AdvisorRemediationContext
  | ManualRemediationContext;
