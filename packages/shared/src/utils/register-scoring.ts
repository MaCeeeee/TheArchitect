import type {
  ScoreInput,
  ScoreWeights,
  RoutingThresholds,
  RoutingPath,
  ScoreResult,
} from '../types/register.types';
import {
  DEFAULT_SCORE_WEIGHTS,
  DEFAULT_ROUTING_THRESHOLDS,
  SCORING_CONFIG_VERSION,
} from '../constants/register-scoring.constants';

/** Round to 2 decimals so the score is bit-stable across runs (no float drift in equality tests). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Deterministic priority score (THE-445 AC-3). Pure function: same input → same output,
 * no clock, no randomness, no I/O. The LLM never produces this number — it may only annotate.
 */
export function computePScore(
  input: ScoreInput,
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
): number {
  const raw =
    weights.severity * input.severity +
    weights.urgency * input.urgency +
    weights.criticality * input.criticality -
    input.mitigation;
  return round2(raw);
}

/** Map a p_score onto a routing path via thresholds (THE-445 AC-4). */
export function routeByScore(
  pScore: number,
  thresholds: RoutingThresholds = DEFAULT_ROUTING_THRESHOLDS,
): RoutingPath {
  if (pScore >= thresholds.critical) return 'critical';
  if (pScore <= thresholds.noise) return 'noise';
  return 'normal';
}

/** Convenience: score + route + version stamp in one deterministic call. */
export function scoreAndRoute(
  input: ScoreInput,
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
  thresholds: RoutingThresholds = DEFAULT_ROUTING_THRESHOLDS,
): ScoreResult {
  const pScore = computePScore(input, weights);
  return {
    pScore,
    routingPath: routeByScore(pScore, thresholds),
    weightsVersion: SCORING_CONFIG_VERSION,
  };
}
