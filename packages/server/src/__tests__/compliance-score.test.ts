// THE-442: Score-Regressionsstabilität — migrierte severity-Werte ergeben
// exakt den Score der Alt-Formel (error·3 + warning·1 + info·0).
import { computeComplianceScore } from '../services/compliance.service';

describe('computeComplianceScore (THE-442)', () => {
  it('reproduces legacy scores for migrated data', () => {
    // Alt: 10 Elemente × 2 Policies = max 20; 2 errors + 3 warnings
    // → (20 − 2·3 − 3·1) / 20 = 55%
    const score = computeComplianceScore(
      { critical: 0, high: 2, medium: 3, low: 0 },
      20,
    );
    expect(score).toBe(55);
  });

  it('weights critical at 4', () => {
    // (20 − 1·4) / 20 = 80%
    expect(computeComplianceScore({ critical: 1, high: 0, medium: 0, low: 0 }, 20)).toBe(80);
  });

  it('clamps to [0, 100]', () => {
    expect(computeComplianceScore({ critical: 10, high: 10, medium: 0, low: 0 }, 5)).toBe(0);
    expect(computeComplianceScore({ critical: 0, high: 0, medium: 0, low: 0 }, 0)).toBe(100);
  });
});
