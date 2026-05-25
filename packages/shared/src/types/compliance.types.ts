// ─── Policy Status & Source ───

export type PolicyStatus = 'active' | 'draft' | 'deprecated' | 'archived';
export type PolicySource = 'custom' | 'dora' | 'nis2' | 'togaf' | 'archimate' | 'iso27001';

// ─── Policy Violation ───

export type PolicyViolationStatus = 'open' | 'resolved' | 'suppressed';

export interface PolicyViolationDTO {
  _id: string;
  projectId: string;
  policyId: string;
  policyName?: string;
  elementId: string;
  elementName?: string;
  violationType: 'violation' | 'partial';
  severity: 'error' | 'warning' | 'info';
  message: string;
  field: string;
  currentValue: unknown;
  expectedValue: unknown;
  status: PolicyViolationStatus;
  detectedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  details: string;
}

// ─── Policy Draft (AI-generated, before human approval) ───

export interface PolicyDraftRule {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists' | 'regex';
  value: unknown;
  message: string;
}

export interface PolicyDraftScope {
  domains: string[];
  elementTypes: string[];
  layers: string[];
}

export interface PolicyDraft {
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  scope: PolicyDraftScope;
  rules: PolicyDraftRule[];
  sourceSection: string;
  sourceSectionTitle: string;
  confidence: number;
}

// ─── Regulation (UC-ICM-001) ───
//
// Strukturierte Gesetzes-Paragraphen mit Volltext, Quelle, Stand-Datum und Embedding.
// Foundation für UC-ICM-002 (LLM-Mapping) und UC-ICM-003 (Reverse-Lookup, Heat-Map, Live-Mapping).
// Linear: THE-275

export type RegulationSource =
  | 'nis2'      // EU Directive 2022/2555 (Network and Information Security 2)
  | 'lksg'      // Lieferkettensorgfaltspflichtengesetz (DE)
  | 'dsgvo'     // Datenschutz-Grundverordnung (EU GDPR + DE BDSG)
  | 'dora'      // EU Regulation 2022/2554 (Digital Operational Resilience Act)
  | 'iso27001'  // ISO/IEC 27001 Information Security
  | 'custom';   // User-curated regulations

export type RegulationJurisdiction = 'EU' | 'DE' | 'AT' | 'CH';

export type RegulationLanguage = 'de' | 'en';

export interface RegulationDTO {
  _id: string;
  projectId: string;
  source: RegulationSource;
  jurisdiction: RegulationJurisdiction;
  paragraphNumber: string;     // "Art. 21" or "§ 6 Abs. 1"
  title: string;
  fullText: string;            // max 20 000 chars
  summary?: string;            // max 500 chars (LLM-Kurzfassung)
  sourceUrl: string;
  effectiveFrom: string;       // ISO 8601 date
  effectiveUntil?: string;     // ISO 8601 date
  language: RegulationLanguage;
  embedding?: number[];        // 768-dim, all-mpnet-base-v2
  crawledAt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ─── ComplianceMapping (UC-ICM-002) ───
//
// Maps a Regulation paragraph (UC-ICM-001) to an ArchiMate element with
// LLM-derived confidence + reasoning. Foundation for UC-ICM-003
// Reverse-Lookup (element → regulations) and Heat-Map (regulation → elements).
//
// Default lifecycle: createdBy='llm' + status='auto'. Human can later
// 'confirmed' or 'rejected' via the Live-Mapping UI (UC-ICM-003.3).
//
// Linear: THE-278

export type ComplianceMappingElementType =
  | 'capability'
  | 'application'
  | 'data_object'
  | 'business_process'
  | 'business_actor'
  | 'business_service'
  | 'application_service'
  | 'business_function'
  | 'business_object'
  | 'business_role'
  | 'technology_service'
  | 'node'
  | 'custom';

export type ComplianceMappingStatus = 'auto' | 'confirmed' | 'rejected';

export type ComplianceMappingProvenance = 'llm' | 'human' | 'live-mapping';

export interface ComplianceMappingDTO {
  _id: string;
  projectId: string;
  regulationId: string;
  elementId: string;
  elementType: ComplianceMappingElementType;
  confidence: number;          // ∈ [0, 1] — LLM re-ranking score
  reasoning: string;           // max 500 chars — shown in Reverse-Lookup UI
  status: ComplianceMappingStatus;
  createdBy: ComplianceMappingProvenance;
  createdAt: string;
  updatedAt: string;
}

// ─── ComplianceRequirement (UC-REQGEN-001) ───
//
// LLM-derived, actionable Anforderung extracted from a Regulation paragraph.
// While ComplianceMapping says "this element is affected", ComplianceRequirement
// says "this element MUST/SHOULD/MAY do X". Auditor-grade, tracking-fähig.
//
// Inspired by CORA's "Anforderungen generieren" Workflow (2026-05-24 analysis).
//
// Linear: THE-302 (REQ-REQGEN-001.1)

export type ComplianceRequirementPriority = 'must' | 'should' | 'may';

export type ComplianceRequirementStatus =
  | 'open'
  | 'in_progress'
  | 'done'
  | 'waived';

export type ComplianceRequirementProvenance = 'llm' | 'human';

export interface ComplianceRequirementDTO {
  _id: string;
  projectId: string;
  regulationId: string;          // source regulation paragraph
  sourceParagraph: string;       // original text excerpt (audit trail)
  title: string;                 // 5-200 chars, imperative ("Risikoanalyse durchführen")
  description: string;           // 5-2000 chars, what concretely MUST be done
  priority: ComplianceRequirementPriority;
  linkedElementIds: string[];    // ArchiMate elements that must implement this
  status: ComplianceRequirementStatus;
  assigneeId?: string;
  dueDate?: string;              // ISO date
  createdBy: ComplianceRequirementProvenance;
  confidence?: number;           // ∈ [0,1] — LLM confidence, only when createdBy='llm'
  createdAt: string;
  updatedAt: string;
}
