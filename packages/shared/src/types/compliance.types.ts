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
