// ─── AI Architecture Advisor Types ───

export type InsightSeverity = 'critical' | 'high' | 'warning' | 'info';

export type InsightCategory =
  | 'single_point_of_failure'
  | 'orphan_elements'
  | 'circular_dependency'
  | 'compliance_violation'
  | 'stale_transition'
  | 'risk_concentration'
  | 'cost_hotspot'
  | 'missing_connection'
  | 'maturity_gap'
  | 'mirofish_conflict'
  | 'cascade_risk'
  | 'architecture_drift'
  | 'missing_compliance_element'
  | 'portfolio';

export type RemediationActionType =
  | 'retire_element'
  | 'add_connection'
  | 'update_status'
  | 'edit_field'
  | 'batch_edit';

export interface AffectedElement {
  elementId: string;
  name: string;
  type: string;
  layer: string;
}

export interface RemediationAction {
  type: RemediationActionType;
  label: string;
  elementId?: string;
  payload?: Record<string, unknown>;
}

export interface AdvisorInsight {
  id: string;
  category: InsightCategory;
  severity: InsightSeverity;
  title: string;
  description: string;
  affectedElements: AffectedElement[];
  suggestedAction?: RemediationAction;
  recommendation?: string;
  effort?: 'low' | 'medium' | 'high';
  impact?: 'low' | 'medium' | 'high';
  steps?: string[];
}

export interface HealthScoreFactor {
  factor: string;
  weight: number;
  score: number;       // 0-100
  description: string;
}

export interface HealthScore {
  total: number;       // 0-100
  trend: 'up' | 'down' | 'stable';
  trendDelta: number;
  factors: HealthScoreFactor[];
  timestamp: string;
}

export interface AdvisorScanResult {
  projectId: string;
  healthScore: HealthScore;
  insights: AdvisorInsight[];
  totalElements: number;
  scanDurationMs: number;
  timestamp: string;
}
