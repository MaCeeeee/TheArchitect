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
