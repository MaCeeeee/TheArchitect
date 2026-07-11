/**
 * THE-445 AC-3/AC-4 — deterministic scoring + routing (pure, no DB).
 * Run: cd packages/server && npx jest src/__tests__/register-scoring.test.ts
 */
import {
  computePScore,
  routeByScore,
  scoreAndRoute,
  DEFAULT_SCORE_WEIGHTS,
  DEFAULT_ROUTING_THRESHOLDS,
  SCORING_CONFIG_VERSION,
} from '@thearchitect/shared';

describe('Register scoring (THE-445 AC-3/AC-4)', () => {
  it('computes P = w_s·S + w_u·U + w_c·C − M with default weights', () => {
    // 2·5 + 1·5 + 1.5·5 − 0 = 22.5
    expect(computePScore({ severity: 5, urgency: 5, criticality: 5, mitigation: 0 })).toBe(22.5);
    // 2·3 + 1·2 + 1.5·4 − 1 = 6 + 2 + 6 − 1 = 13
    expect(computePScore({ severity: 3, urgency: 2, criticality: 4, mitigation: 1 })).toBe(13);
  });

  it('is deterministic — identical input yields identical score across 1000 runs', () => {
    const input = { severity: 4, urgency: 3, criticality: 5, mitigation: 2 };
    const first = computePScore(input);
    for (let i = 0; i < 1000; i++) {
      expect(computePScore(input)).toBe(first);
    }
  });

  it('honours custom weights', () => {
    expect(
      computePScore(
        { severity: 1, urgency: 1, criticality: 1, mitigation: 0 },
        { severity: 1, urgency: 1, criticality: 1 },
      ),
    ).toBe(3);
  });

  it('routes by threshold: critical ≥ 16, noise ≤ 5, else normal', () => {
    expect(routeByScore(22.5)).toBe('critical');
    expect(routeByScore(16)).toBe('critical');
    expect(routeByScore(15.99)).toBe('normal');
    expect(routeByScore(6)).toBe('normal');
    expect(routeByScore(5)).toBe('noise');
    expect(routeByScore(-5)).toBe('noise');
  });

  it('scoreAndRoute stamps the config version', () => {
    expect(scoreAndRoute({ severity: 5, urgency: 5, criticality: 5, mitigation: 0 })).toEqual({
      pScore: 22.5,
      routingPath: 'critical',
      weightsVersion: SCORING_CONFIG_VERSION,
    });
  });

  it('exposes the calibrated v1 defaults', () => {
    expect(DEFAULT_SCORE_WEIGHTS).toEqual({ severity: 2.0, urgency: 1.0, criticality: 1.5 });
    expect(DEFAULT_ROUTING_THRESHOLDS).toEqual({ critical: 16, noise: 5 });
  });
});
