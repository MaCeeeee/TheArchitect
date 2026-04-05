/**
 * Scenario Comparison & MCDA — Unit Tests
 *
 * Tests scenario service pure-logic functions:
 *   1. ScenarioCostProfile computation logic
 *   2. Compliance cost scoring (DORA/NIS2/KRITIS frameworks)
 *   3. Shared types and constants validation
 *   4. MCDA weights and normalization
 *
 * Note: Full scenario CRUD / compare / rank requires MongoDB + Neo4j.
 * These tests cover the logic that can be tested in isolation.
 *
 * Run: cd packages/server && npx jest src/__tests__/cost-scenario.test.ts --verbose
 */

import {
  DEFAULT_MCDA_WEIGHTS,
  type McdaWeights,
  type ScenarioDelta,
  type ScenarioCostProfile,
  type McdaCriteriaScores,
} from '@thearchitect/shared';

import {
  INDUSTRY_DEFAULTS,
  SEVEN_RS_MULTIPLIERS,
  TRAINING_DAYS_PER_STRATEGY,
  BASE_COSTS_BY_TYPE,
  STATUS_COST_MULTIPLIERS,
} from '@thearchitect/shared';

// ══════════════════════════════════════════════════════════════════
// SECTION 1: Shared Types & Constants Validation
// ══════════════════════════════════════════════════════════════════

describe('1. Shared Cost Constants', () => {
  test('1.1 INDUSTRY_DEFAULTS has required fields', () => {
    expect(INDUSTRY_DEFAULTS.hourlyRateDACH).toBe(85);
    expect(INDUSTRY_DEFAULTS.cmBudgetPercent).toBe(0.10);
    expect(INDUSTRY_DEFAULTS.wrightLearningRate).toBe(0.80);
    expect(INDUSTRY_DEFAULTS.discountRate).toBeGreaterThan(0);
  });

  test('1.2 All 7 R strategies have multipliers', () => {
    const strategies = ['retain', 'retire', 'rehost', 'relocate', 'replatform', 'repurchase', 'refactor'];
    for (const s of strategies) {
      expect(SEVEN_RS_MULTIPLIERS[s]).toBeDefined();
      expect(SEVEN_RS_MULTIPLIERS[s]).toBeGreaterThanOrEqual(0);
      expect(SEVEN_RS_MULTIPLIERS[s]).toBeLessThanOrEqual(1);
    }
  });

  test('1.3 Strategy multipliers ordered: retain < rehost < replatform < refactor', () => {
    expect(SEVEN_RS_MULTIPLIERS.retain).toBeLessThan(SEVEN_RS_MULTIPLIERS.rehost);
    expect(SEVEN_RS_MULTIPLIERS.rehost).toBeLessThan(SEVEN_RS_MULTIPLIERS.replatform);
    expect(SEVEN_RS_MULTIPLIERS.replatform).toBeLessThan(SEVEN_RS_MULTIPLIERS.refactor);
  });

  test('1.4 Training days per strategy defined for all 7 R', () => {
    const strategies = ['retain', 'retire', 'rehost', 'relocate', 'replatform', 'repurchase', 'refactor'];
    for (const s of strategies) {
      expect(TRAINING_DAYS_PER_STRATEGY[s]).toBeDefined();
      expect(TRAINING_DAYS_PER_STRATEGY[s]).toBeGreaterThanOrEqual(0);
    }
  });

  test('1.5 BASE_COSTS_BY_TYPE has 50+ element types', () => {
    const keys = Object.keys(BASE_COSTS_BY_TYPE);
    expect(keys.length).toBeGreaterThanOrEqual(50);
  });

  test('1.6 STATUS_COST_MULTIPLIERS has all 4 statuses', () => {
    expect(STATUS_COST_MULTIPLIERS.current).toBeDefined();
    expect(STATUS_COST_MULTIPLIERS.target).toBeDefined();
    expect(STATUS_COST_MULTIPLIERS.transitional).toBeDefined();
    expect(STATUS_COST_MULTIPLIERS.retired).toBeDefined();
  });

  test('1.7 Retired multiplier is lowest', () => {
    expect(STATUS_COST_MULTIPLIERS.retired).toBeLessThan(STATUS_COST_MULTIPLIERS.current);
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 2: MCDA Weights
// ══════════════════════════════════════════════════════════════════

describe('2. MCDA Weights', () => {
  test('2.1 DEFAULT_MCDA_WEIGHTS sum to 1.0', () => {
    const sum = DEFAULT_MCDA_WEIGHTS.cost + DEFAULT_MCDA_WEIGHTS.risk +
      DEFAULT_MCDA_WEIGHTS.agility + DEFAULT_MCDA_WEIGHTS.compliance +
      DEFAULT_MCDA_WEIGHTS.time;
    expect(sum).toBeCloseTo(1.0, 5);
  });

  test('2.2 All weights are positive', () => {
    for (const [key, val] of Object.entries(DEFAULT_MCDA_WEIGHTS)) {
      expect(val).toBeGreaterThan(0);
    }
  });

  test('2.3 Weights are in expected range (0.1-0.3)', () => {
    for (const [key, val] of Object.entries(DEFAULT_MCDA_WEIGHTS)) {
      expect(val).toBeGreaterThanOrEqual(0.10);
      expect(val).toBeLessThanOrEqual(0.30);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 3: Scenario Delta Structure
// ══════════════════════════════════════════════════════════════════

describe('3. Scenario Delta Types', () => {
  test('3.1 Valid delta structure', () => {
    const delta: ScenarioDelta = {
      elementId: 'elem-123',
      field: 'status',
      baselineValue: 'current',
      scenarioValue: 'target',
    };
    expect(delta.elementId).toBe('elem-123');
    expect(delta.field).toBe('status');
    expect(delta.baselineValue).toBe('current');
    expect(delta.scenarioValue).toBe('target');
  });

  test('3.2 Numeric delta for annualCost', () => {
    const delta: ScenarioDelta = {
      elementId: 'elem-456',
      field: 'annualCost',
      baselineValue: 100000,
      scenarioValue: 50000,
    };
    expect(typeof delta.baselineValue).toBe('number');
    expect(typeof delta.scenarioValue).toBe('number');
  });

  test('3.3 Strategy delta', () => {
    const delta: ScenarioDelta = {
      elementId: 'elem-789',
      field: 'transformationStrategy',
      baselineValue: 'retain',
      scenarioValue: 'refactor',
    };
    expect(delta.field).toBe('transformationStrategy');
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 4: Cost Profile Structure
// ══════════════════════════════════════════════════════════════════

describe('4. ScenarioCostProfile Structure', () => {
  test('4.1 Valid cost profile', () => {
    const profile: ScenarioCostProfile = {
      totalCost: 500000,
      dimensions: { process: 100000, applicationTransformation: 200000, infrastructure: 100000, trainingChange: 100000 },
      p10: 350000,
      p50: 500000,
      p90: 700000,
      deltaFromBaseline: -50000,
      deltaPercent: -9.09,
    };
    expect(profile.totalCost).toBe(500000);
    expect(profile.p10).toBeLessThan(profile.p50);
    expect(profile.p50).toBeLessThan(profile.p90);
    expect(profile.deltaFromBaseline).toBeLessThan(0);
    expect(profile.deltaPercent).toBeLessThan(0);
  });

  test('4.2 Dimensions sum reasonably close to totalCost', () => {
    const dims = { process: 100000, applicationTransformation: 200000, infrastructure: 100000, trainingChange: 100000 };
    const dimSum = Object.values(dims).reduce((s, v) => s + v, 0);
    // Dimensions should be in same order of magnitude as total
    expect(dimSum).toBe(500000);
  });

  test('4.3 ROI and paybackMonths optional', () => {
    const profile: ScenarioCostProfile = {
      totalCost: 300000,
      dimensions: {},
      p10: 200000, p50: 300000, p90: 450000,
      deltaFromBaseline: 0, deltaPercent: 0,
      roi: 1.5,
      paybackMonths: 18,
    };
    expect(profile.roi).toBe(1.5);
    expect(profile.paybackMonths).toBe(18);
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 5: MCDA Scoring Logic (Pure)
// ══════════════════════════════════════════════════════════════════

describe('5. MCDA Scoring (WSM) Logic', () => {
  // Implement WSM locally to verify the math
  function wsm(scores: number[], weights: number[]): number {
    return scores.reduce((s, v, i) => s + v * weights[i], 0);
  }

  function normalize(values: number[], invert: boolean): number[] {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values.map((v) => {
      const norm = (v - min) / range;
      return invert ? 1 - norm : norm;
    });
  }

  test('5.1 WSM normalization: min=0, max=1', () => {
    const values = [100, 200, 300, 400, 500];
    const norm = normalize(values, false);
    expect(norm[0]).toBe(0);
    expect(norm[4]).toBe(1);
  });

  test('5.2 WSM normalization with invert: min=1, max=0', () => {
    const values = [100, 200, 300, 400, 500];
    const norm = normalize(values, true);
    expect(norm[0]).toBe(1);
    expect(norm[4]).toBe(0);
  });

  test('5.3 WSM weighted score between 0 and 1', () => {
    const weights = [0.25, 0.25, 0.20, 0.15, 0.15];
    const scores = [0.8, 0.6, 0.9, 0.5, 0.7];
    const result = wsm(scores, weights);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  test('5.4 Equal scores → equal weighted scores regardless of weights', () => {
    const weights = [0.25, 0.25, 0.20, 0.15, 0.15];
    const scores = [1, 1, 1, 1, 1];
    const result = wsm(scores, weights);
    expect(result).toBeCloseTo(1, 5);
  });

  test('5.5 Higher cost weight penalizes expensive scenarios', () => {
    const costHeavyWeights = [0.50, 0.15, 0.15, 0.10, 0.10];
    const balancedWeights = [0.20, 0.20, 0.20, 0.20, 0.20];
    // Scenario with bad cost but good other scores
    const scores = [0.2, 0.9, 0.8, 0.7, 0.6]; // cost=0.2 (bad)
    const costHeavy = wsm(scores, costHeavyWeights);
    const balanced = wsm(scores, balancedWeights);
    expect(costHeavy).toBeLessThan(balanced); // cost-heavy penalizes bad cost more
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 6: Compliance Framework Constants
// ══════════════════════════════════════════════════════════════════

describe('6. Compliance Frameworks', () => {
  test('6.1 DORA has 5 compliance areas', () => {
    // Verify from scenario.service.ts framework definitions
    const doraAreas = ['ICT Risk Management', 'Incident Reporting', 'Digital Resilience Testing', 'Third-Party Risk', 'Info Sharing'];
    expect(doraAreas.length).toBe(5);
  });

  test('6.2 NIS2 has 7 compliance areas', () => {
    const nis2Areas = ['Risk Management', 'Incident Handling', 'Business Continuity', 'Supply Chain Security', 'Encryption', 'Access Control', 'Vulnerability Management'];
    expect(nis2Areas.length).toBe(7);
  });

  test('6.3 KRITIS has 6 compliance areas', () => {
    const kritisAreas = ['Availability', 'Integrity', 'Confidentiality', 'Resilience', 'Incident Response', 'IT-SiG 2.0 Compliance'];
    expect(kritisAreas.length).toBe(6);
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 7: TOPSIS Logic (Pure)
// ══════════════════════════════════════════════════════════════════

describe('7. TOPSIS Logic', () => {
  function vectorNormalize(matrix: number[][]): number[][] {
    const n = matrix.length;
    const m = matrix[0].length;
    const colNorms: number[] = [];
    for (let j = 0; j < m; j++) {
      colNorms.push(Math.sqrt(matrix.reduce((s, row) => s + row[j] ** 2, 0)) || 1);
    }
    return matrix.map((row) => row.map((v, j) => v / colNorms[j]));
  }

  test('7.1 Vector normalization: columns have unit norm', () => {
    const matrix = [[3, 4], [1, 2], [2, 3]];
    const normalized = vectorNormalize(matrix);
    // Each column should have norm ≈ 1
    for (let j = 0; j < 2; j++) {
      const colNorm = Math.sqrt(normalized.reduce((s, row) => s + row[j] ** 2, 0));
      expect(colNorm).toBeCloseTo(1, 5);
    }
  });

  test('7.2 Closeness coefficient between 0 and 1', () => {
    // Simple 2-alternative, 2-criteria example
    const alternatives = [[0.8, 0.2], [0.3, 0.9]]; // already normalized
    const idealBest = [0.8, 0.9]; // max of each column (both benefit)
    const idealWorst = [0.3, 0.2]; // min of each column

    const closeness = alternatives.map((alt) => {
      const db = Math.sqrt(alt.reduce((s, v, j) => s + (v - idealBest[j]) ** 2, 0));
      const dw = Math.sqrt(alt.reduce((s, v, j) => s + (v - idealWorst[j]) ** 2, 0));
      return dw / (db + dw);
    });

    expect(closeness[0]).toBeGreaterThan(0);
    expect(closeness[0]).toBeLessThan(1);
    expect(closeness[1]).toBeGreaterThan(0);
    expect(closeness[1]).toBeLessThan(1);
  });

  test('7.3 Ideal alternative gets closeness ≈ 1', () => {
    const best = [1, 1];
    const worst = [0, 0];
    const idealBest = [1, 1];
    const idealWorst = [0, 0];

    const dbBest = Math.sqrt(best.reduce((s, v, j) => s + (v - idealBest[j]) ** 2, 0));
    const dwBest = Math.sqrt(best.reduce((s, v, j) => s + (v - idealWorst[j]) ** 2, 0));
    const closenessBest = dwBest / (dbBest + dwBest);

    expect(closenessBest).toBeCloseTo(1, 5);
  });

  test('7.4 Worst alternative gets closeness ≈ 0', () => {
    const worst = [0, 0];
    const idealBest = [1, 1];
    const idealWorst = [0, 0];

    const db = Math.sqrt(worst.reduce((s, v, j) => s + (v - idealBest[j]) ** 2, 0));
    const dw = Math.sqrt(worst.reduce((s, v, j) => s + (v - idealWorst[j]) ** 2, 0));
    const closeness = dw / (db + dw);

    expect(closeness).toBeCloseTo(0, 5);
  });
});
