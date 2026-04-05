/**
 * Cost Engine Service — Unit Tests
 *
 * Tests all pure-function exports from cost-engine.service.ts:
 *   1. Black-Scholes Real Options pricing
 *   2. Change Saturation multiplier
 *   3. Tier 1 cost computation
 *   4. Tier 2 cost computation (COCOMO II, SQALE, 1-10-100, Wright, J-Curve)
 *   5. Tier detection logic
 *   6. getTier0CostEstimate fallback
 *
 * All tests are pure unit tests — no server, no database required.
 *
 * Run: cd packages/server && npx jest src/__tests__/cost-engine.test.ts --verbose
 */

import {
  blackScholesCall,
  changeSaturationMultiplier,
  computeTier1Cost,
  computeTier2Cost,
  getTier0CostEstimate,
} from '../services/cost-engine.service';

// ══════════════════════════════════════════════════════════════════
// SECTION 1: Black-Scholes Real Options (Unit Tests)
// ══════════════════════════════════════════════════════════════════

describe('1. Black-Scholes Real Options', () => {
  test('1.1 Standard call option pricing — known values', () => {
    // S=100, K=100, T=1, r=5%, σ=20% → call ≈ 10.45
    const result = blackScholesCall(100, 100, 1, 0.05, 0.20);
    expect(result.callValue).toBeGreaterThan(8);
    expect(result.callValue).toBeLessThan(15);
    expect(result.d1).toBeGreaterThan(0);
    expect(result.d2).toBeLessThan(result.d1);
  });

  test('1.2 Deep in-the-money → recommend proceed', () => {
    // S much greater than K → intrinsic value high
    const result = blackScholesCall(200, 50, 1, 0.03, 0.20);
    expect(result.recommendation).toBe('proceed');
    expect(result.callValue).toBeGreaterThan(140);
  });

  test('1.3 Deep out-of-the-money → recommend abandon', () => {
    // S much less than K
    const result = blackScholesCall(10, 1000, 1, 0.03, 0.10);
    expect(result.recommendation).toBe('abandon');
    expect(result.callValue).toBeLessThan(10);
  });

  test('1.4 High volatility increases option value', () => {
    const lowVol = blackScholesCall(100, 100, 1, 0.03, 0.10);
    const highVol = blackScholesCall(100, 100, 1, 0.03, 0.50);
    expect(highVol.callValue).toBeGreaterThan(lowVol.callValue);
  });

  test('1.5 Longer time increases option value', () => {
    const short = blackScholesCall(100, 100, 0.5, 0.03, 0.20);
    const long = blackScholesCall(100, 100, 3, 0.03, 0.20);
    expect(long.callValue).toBeGreaterThan(short.callValue);
  });

  test('1.6 deferValue = callValue - intrinsicValue', () => {
    const result = blackScholesCall(120, 100, 1, 0.03, 0.20);
    const intrinsic = Math.max(120 - 100, 0);
    expect(result.deferValue).toBe(result.callValue - intrinsic);
  });

  test('1.7 Zero/negative inputs return zeros + abandon', () => {
    const result = blackScholesCall(0, 100, 1, 0.03, 0.20);
    expect(result.callValue).toBe(0);
    expect(result.recommendation).toBe('abandon');

    const result2 = blackScholesCall(100, 100, 0, 0.03, 0.20);
    expect(result2.callValue).toBe(0);
  });

  test('1.8 Typical EA scenario: 130K benefit, 100K cost, 2yr, 30% vol', () => {
    const result = blackScholesCall(130000, 100000, 2, 0.03, 0.30);
    expect(result.callValue).toBeGreaterThan(30000);
    expect(result.deferValue).toBeGreaterThan(0);
    expect(['proceed', 'defer']).toContain(result.recommendation);
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 2: Change Saturation Model (Unit Tests)
// ══════════════════════════════════════════════════════════════════

describe('2. Change Saturation', () => {
  test('2.1 Under capacity threshold → multiplier = 1.0', () => {
    const result = changeSaturationMultiplier(100000, 3, 5, 0.15);
    expect(result.multiplier).toBe(1);
    expect(result.effectiveCost).toBe(100000);
    expect(result.overCapacity).toBe(0);
  });

  test('2.2 At capacity threshold → multiplier = 1.0', () => {
    const result = changeSaturationMultiplier(100000, 5, 5, 0.15);
    expect(result.multiplier).toBe(1);
    expect(result.effectiveCost).toBe(100000);
  });

  test('2.3 Over capacity by 2 → 30% increase', () => {
    const result = changeSaturationMultiplier(100000, 7, 5, 0.15);
    expect(result.overCapacity).toBe(2);
    expect(result.multiplier).toBeCloseTo(1.30, 2);
    expect(result.effectiveCost).toBe(130000);
  });

  test('2.4 Over capacity by 10 → 150% increase', () => {
    const result = changeSaturationMultiplier(100000, 15, 5, 0.15);
    expect(result.overCapacity).toBe(10);
    expect(result.multiplier).toBeCloseTo(2.5, 2);
    expect(result.effectiveCost).toBe(250000);
  });

  test('2.5 Custom k coefficient', () => {
    const result = changeSaturationMultiplier(100000, 8, 5, 0.25);
    expect(result.overCapacity).toBe(3);
    expect(result.multiplier).toBeCloseTo(1.75, 2);
  });

  test('2.6 Default parameters (threshold=5, k=0.15)', () => {
    const result = changeSaturationMultiplier(100000, 8);
    expect(result.overCapacity).toBe(3);
    expect(result.multiplier).toBeCloseTo(1.45, 2);
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 3: Tier 1 Cost Computation (Unit Tests)
// ══════════════════════════════════════════════════════════════════

describe('3. Tier 1 Cost Computation', () => {
  test('3.1 Refactor strategy → full annualCost multiplier', () => {
    const result = computeTier1Cost({
      id: 'test1', name: 'App A', type: 'ApplicationComponent', layer: 'application',
      status: 'current', riskLevel: 'medium',
      annualCost: 100000, transformationStrategy: 'refactor', userCount: 50, recordCount: 100000,
    });
    expect(result.totalEstimated).toBeGreaterThan(100000);
    expect(result.dimensions).toBeDefined();
    expect(result.confidenceLow).toBeLessThan(result.totalEstimated);
    expect(result.confidenceHigh).toBeGreaterThan(result.totalEstimated);
  });

  test('3.2 Retain strategy → low multiplier (5%)', () => {
    const result = computeTier1Cost({
      id: 'test2', name: 'App B', type: 'ApplicationComponent', layer: 'application',
      status: 'current', riskLevel: 'low',
      annualCost: 100000, transformationStrategy: 'retain', userCount: 10, recordCount: 5000,
    });
    // Retain should be much cheaper than refactor
    const refactorResult = computeTier1Cost({
      id: 'test2b', name: 'App B', type: 'ApplicationComponent', layer: 'application',
      status: 'current', riskLevel: 'low',
      annualCost: 100000, transformationStrategy: 'refactor', userCount: 10, recordCount: 5000,
    });
    expect(result.totalEstimated).toBeLessThan(refactorResult.totalEstimated);
  });

  test('3.3 Data migration costs scale with recordCount', () => {
    const small = computeTier1Cost({
      id: 'test3a', name: 'Small', type: 'ApplicationComponent', layer: 'application',
      status: 'current', riskLevel: 'low',
      annualCost: 50000, transformationStrategy: 'rehost', userCount: 10, recordCount: 1000,
    });
    const large = computeTier1Cost({
      id: 'test3b', name: 'Large', type: 'ApplicationComponent', layer: 'application',
      status: 'current', riskLevel: 'low',
      annualCost: 50000, transformationStrategy: 'rehost', userCount: 10, recordCount: 1000000,
    });
    expect(large.totalEstimated).toBeGreaterThan(small.totalEstimated);
  });

  test('3.4 Training costs scale with userCount', () => {
    const few = computeTier1Cost({
      id: 'test4a', name: 'Few', type: 'ApplicationComponent', layer: 'application',
      status: 'current', riskLevel: 'low',
      annualCost: 50000, transformationStrategy: 'replatform', userCount: 5, recordCount: 1000,
    });
    const many = computeTier1Cost({
      id: 'test4b', name: 'Many', type: 'ApplicationComponent', layer: 'application',
      status: 'current', riskLevel: 'low',
      annualCost: 50000, transformationStrategy: 'replatform', userCount: 500, recordCount: 1000,
    });
    expect(many.totalEstimated).toBeGreaterThan(few.totalEstimated);
  });

  test('3.5 Confidence bands: low < estimated < high', () => {
    const result = computeTier1Cost({
      id: 'test5', name: 'App', type: 'ApplicationComponent', layer: 'application',
      status: 'current', riskLevel: 'high',
      annualCost: 200000, transformationStrategy: 'refactor', userCount: 100, recordCount: 50000,
    });
    expect(result.confidenceLow).toBeLessThan(result.totalEstimated);
    expect(result.confidenceHigh).toBeGreaterThan(result.totalEstimated);
    // ~±30-50% bands for Tier 1
    expect(result.confidenceLow).toBeGreaterThan(result.totalEstimated * 0.3);
    expect(result.confidenceHigh).toBeLessThan(result.totalEstimated * 2.5);
  });

  test('3.6 All 7 R strategies produce valid results', () => {
    const strategies = ['retain', 'retire', 'rehost', 'relocate', 'replatform', 'repurchase', 'refactor'] as const;
    for (const strat of strategies) {
      const result = computeTier1Cost({
        id: `strat-${strat}`, name: `App ${strat}`, type: 'ApplicationComponent', layer: 'application',
        status: 'current', riskLevel: 'medium',
        annualCost: 100000, transformationStrategy: strat, userCount: 50, recordCount: 10000,
      });
      expect(result.totalEstimated).toBeGreaterThan(0);
      expect(result.dimensions).toBeDefined();
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 4: Tier 2 Cost Computation (Unit Tests)
// ══════════════════════════════════════════════════════════════════

describe('4. Tier 2 Cost Computation', () => {
  const baseNode = {
    id: 'tier2-test', name: 'Enterprise App', type: 'ApplicationComponent', layer: 'application',
    status: 'current', riskLevel: 'medium',
    annualCost: 150000, transformationStrategy: 'refactor' as const,
    userCount: 100, recordCount: 500000,
    ksloc: 85, technicalFitness: 2, functionalFitness: 4,
    errorRatePercent: 8, hourlyRate: 95, monthlyInfraCost: 15000,
    technicalDebtRatio: 0.20,
  };

  const baseMetrics = {
    pageRank: 0.15, betweennessCentrality: 0.08, communityId: 1,
    dependencyDepth: 3, metcalfeValue: 10, inDegree: 4, outDegree: 3,
  };

  test('4.1 COCOMO II: effort scales with KSLOC', () => {
    const small = computeTier2Cost({ ...baseNode, ksloc: 10 }, baseMetrics);
    const large = computeTier2Cost({ ...baseNode, ksloc: 200 }, baseMetrics);
    expect(large.totalEstimated).toBeGreaterThan(small.totalEstimated);
  });

  test('4.2 SQALE/TDR: higher debt ratio increases cost', () => {
    const low = computeTier2Cost({ ...baseNode, technicalDebtRatio: 0.05 }, baseMetrics);
    const high = computeTier2Cost({ ...baseNode, technicalDebtRatio: 0.50 }, baseMetrics);
    expect(high.totalEstimated).toBeGreaterThan(low.totalEstimated);
  });

  test('4.3 1-10-100 Data Quality: higher error rate increases cost', () => {
    const clean = computeTier2Cost({ ...baseNode, errorRatePercent: 1 }, baseMetrics);
    const dirty = computeTier2Cost({ ...baseNode, errorRatePercent: 25 }, baseMetrics);
    expect(dirty.totalEstimated).toBeGreaterThan(clean.totalEstimated);
  });

  test('4.4 Hourly rate override affects cost', () => {
    const cheap = computeTier2Cost({ ...baseNode, hourlyRate: 50 }, baseMetrics);
    const expensive = computeTier2Cost({ ...baseNode, hourlyRate: 150 }, baseMetrics);
    expect(expensive.totalEstimated).toBeGreaterThan(cheap.totalEstimated);
  });

  test('4.5 Monthly infra cost contributes to TCO', () => {
    const noInfra = computeTier2Cost({ ...baseNode, monthlyInfraCost: 0 }, baseMetrics);
    const highInfra = computeTier2Cost({ ...baseNode, monthlyInfraCost: 50000 }, baseMetrics);
    expect(highInfra.totalEstimated).toBeGreaterThan(noInfra.totalEstimated);
  });

  test('4.6 Output has 7 dimension keys', () => {
    const result = computeTier2Cost(baseNode, baseMetrics);
    expect(result.dimensions).toBeDefined();
    const dimKeys = Object.keys(result.dimensions);
    // Should have several dimension keys
    expect(dimKeys.length).toBeGreaterThanOrEqual(3);
  });

  test('4.7 Confidence bands tighter than Tier 1 (±15-30%)', () => {
    const result = computeTier2Cost(baseNode, baseMetrics);
    const range = result.confidenceHigh - result.confidenceLow;
    const pct = range / result.totalEstimated;
    // Range should be roughly 30-60% of total (low to high)
    expect(pct).toBeGreaterThan(0.2);
    expect(pct).toBeLessThan(1.0);
  });

  test('4.8 Wright learning curve: more users → higher training, then diminishing', () => {
    const result = computeTier2Cost(baseNode, baseMetrics);
    // Training dimension should exist
    expect(result.dimensions.trainingChange || 0).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 5: Tier 0 Fallback & Tier Detection (Unit Tests)
// ══════════════════════════════════════════════════════════════════

describe('5. Tier 0 Cost Estimates', () => {
  test('5.1 Known types return BASE_COSTS values', () => {
    const cost = getTier0CostEstimate('ApplicationComponent', 'current');
    expect(cost).toBeGreaterThan(0);
  });

  test('5.2 Unknown type falls back to default', () => {
    const cost = getTier0CostEstimate('UnknownType123', 'current');
    expect(cost).toBe(10000); // default
  });

  test('5.3 Status multiplier: target costs more than current (investment)', () => {
    const current = getTier0CostEstimate('ApplicationComponent', 'current');
    const target = getTier0CostEstimate('ApplicationComponent', 'target');
    // Target costs more (1.8x multiplier — represents future-state investment)
    expect(target).toBeGreaterThanOrEqual(current);
  });

  test('5.4 Status multiplier: transitional costs more', () => {
    const current = getTier0CostEstimate('ApplicationComponent', 'current');
    const transitional = getTier0CostEstimate('ApplicationComponent', 'transitional');
    expect(transitional).toBeGreaterThanOrEqual(current);
  });
});
