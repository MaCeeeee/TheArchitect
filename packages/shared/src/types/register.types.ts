/**
 * Operational Governance Engine — shared register types (UC-PROBMGMT-001 / UC-RISK-001).
 *
 * One WORM register, two lenses: `kind` discriminates the reactive lens
 * (incident/defect/problem, THE-443) from the proactive one (risk, THE-444).
 * Slice 1 (THE-445) uses these for deterministic scoring + routing.
 */

export type RegisterKind = 'incident' | 'defect' | 'problem' | 'risk';

export type RegisterSource =
  | 'manual'
  | 'sentry'
  | 'github'
  | 'sonarqube'
  | 'dependabot'
  | 'support';

/**
 * Append-only status chain. A transition never mutates a row — it writes a new row that
 * supersedes the previous one (WORM). 'noise' is a terminal, human-confirmed reject.
 */
export type RegisterStatus =
  | 'open'
  | 'assessed'
  | 'triaging'
  | 'mitigating'
  | 'mitigated'
  | 'accepted'
  | 'resolved'
  | 'superseded'
  | 'noise';

export interface ScoreInput {
  /** 1–5 */
  severity: number;
  /** 1–5 (in later slices derived from the occurrence counter) */
  urgency: number;
  /** 1–5 criticality of the affected system component */
  criticality: number;
  /** 0 = no workaround, 5 = fully mitigated. Subtracted from the weighted sum. */
  mitigation: number;
}

export type ScoreWeights = {
  severity: number;
  urgency: number;
  criticality: number;
};

/** Routing decision derived from p_score. Every consequent action is *proposed*, human-gated. */
export type RoutingPath = 'critical' | 'normal' | 'noise';

export interface RoutingThresholds {
  /** p_score >= critical → critical path */
  critical: number;
  /** p_score <= noise → noise path */
  noise: number;
}

export interface ScoreResult {
  pScore: number;
  routingPath: RoutingPath;
  /** provenance stamp — which weights/thresholds version produced this score */
  weightsVersion: string;
}
