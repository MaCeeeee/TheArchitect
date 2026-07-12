import type { ScoreWeights, RoutingThresholds, RoutingPath } from '../types/register.types';

/**
 * Versioned scoring config (THE-445 AC-3). Bump this whenever weights/thresholds change so a
 * register row's `weightsVersion` stamp stays auditable — mirrors the `ontologyVersion` precedent.
 */
export const SCORING_CONFIG_VERSION = 'v1';

/**
 * P = w_s·Severity + w_u·Urgency + w_c·Criticality − Mitigation.
 * Severity dominates; the criticality of the affected component weighs more than raw urgency.
 * Start values — to be empirically calibrated (THE-445 §Offene Entscheidungen).
 */
export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  severity: 2.0,
  urgency: 1.0,
  criticality: 1.5,
};

/**
 * With the default weights the p_score spans [−5, 22.5]:
 *   max = 2·5 + 1·5 + 1.5·5 − 0 = 22.5,   min = 0 − 5 = −5.
 * critical ≥ 16, noise ≤ 5, everything between = normal.
 */
export const DEFAULT_ROUTING_THRESHOLDS: RoutingThresholds = {
  critical: 16,
  noise: 5,
};

/**
 * SLA windows per routing path in milliseconds (THE-447). A critical defect must be fixed
 * fast; noise has no SLA. Start values — calibrate against real MTTR data.
 */
export const SLA_WINDOWS_MS: Record<RoutingPath, number | null> = {
  critical: 24 * 60 * 60 * 1000, //  1 day
  normal: 14 * 24 * 60 * 60 * 1000, // 14 days
  noise: null,
};
