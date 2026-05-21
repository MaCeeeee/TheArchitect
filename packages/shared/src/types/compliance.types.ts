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
