/**
 * Stochastic Cost Extensions — Unit Tests
 *
 * Tests Phase 4 additions to stochastic.service.ts:
 *   1. runPERTMonteCarlo — portfolio-level PERT Monte Carlo
 *   2. computeRNPV — risk-adjusted NPV
 *   3. computeWSJF — Weighted Shortest Job First
 *   4. computeEVM — Earned Value Management
 *
 * All tests are pure unit tests — no server, no database required.
 *
 * Run: cd packages/server && npx jest src/__tests__/cost-stochastic.test.ts --verbose
 */

import {
  runPERTMonteCarlo,
  computeRNPV,
  computeWSJF,
  computeEVM,
  type PertMCInput,
  type WSJFInput,
  type EVMInput,
} from '../services/stochastic.service';

// ══════════════════════════════════════════════════════════════════
// SECTION 1: PERT Monte Carlo Simulation
// ══════════════════════════════════════════════════════════════════

describe('1. PERT Monte Carlo Simulation', () => {
  const testElements: PertMCInput[] = [
    { elementId: 'a1', elementName: 'App A', optimistic: 50000, mostLikely: 80000, pessimistic: 150000 },
    { elementId: 'a2', elementName: 'App B', optimistic: 20000, mostLikely: 30000, pessimistic: 60000 },
    { elementId: 'a3', elementName: 'App C', optimistic: 100000, mostLikely: 120000, pessimistic: 200000 },
  ];

  test('1.1 Returns valid result structure', () => {
    const result = runPERTMonteCarlo(testElements, 1000);
    expect(result.pertMean).toBeGreaterThan(0);
    expect(result.pertStdDev).toBeGreaterThan(0);
    expect(result.p10).toBeGreaterThan(0);
    expect(result.p50).toBeGreaterThan(0);
    expect(result.p90).toBeGreaterThan(0);
    expect(result.var95).toBeGreaterThan(0);
    expect(result.histogram.length).toBeGreaterThan(0);
    expect(result.elementContributions.length).toBe(3);
  });

  test('1.2 P10 < P50 < P90 ordering', () => {
    const result = runPERTMonteCarlo(testElements, 5000);
    expect(result.p10).toBeLessThan(result.p50);
    expect(result.p50).toBeLessThan(result.p90);
  });

  test('1.3 VaR95 >= P90', () => {
    const result = runPERTMonteCarlo(testElements, 5000);
    expect(result.var95).toBeGreaterThanOrEqual(result.p90);
  });

  test('1.4 Mean between optimistic sum and pessimistic sum', () => {
    const result = runPERTMonteCarlo(testElements, 5000);
    const optSum = testElements.reduce((s, e) => s + e.optimistic, 0);
    const pessSum = testElements.reduce((s, e) => s + e.pessimistic, 0);
    expect(result.pertMean).toBeGreaterThan(optSum);
    expect(result.pertMean).toBeLessThan(pessSum);
  });

  test('1.5 Mean close to PERT expected value E=(O+4M+P)/6', () => {
    const result = runPERTMonteCarlo(testElements, 10000);
    const pertExpected = testElements.reduce(
      (s, e) => s + (e.optimistic + 4 * e.mostLikely + e.pessimistic) / 6, 0
    );
    // Within 5% of PERT expected value
    expect(Math.abs(result.pertMean - pertExpected) / pertExpected).toBeLessThan(0.05);
  });

  test('1.6 Histogram has 20 buckets', () => {
    const result = runPERTMonteCarlo(testElements, 1000);
    expect(result.histogram.length).toBe(20);
  });

  test('1.7 Histogram counts sum to iterations', () => {
    const iterations = 5000;
    const result = runPERTMonteCarlo(testElements, iterations);
    const totalCounts = result.histogram.reduce((s, h) => s + h.count, 0);
    expect(totalCounts).toBe(iterations);
  });

  test('1.8 Element contributions sorted descending by variance', () => {
    const result = runPERTMonteCarlo(testElements, 5000);
    for (let i = 1; i < result.elementContributions.length; i++) {
      expect(result.elementContributions[i - 1].varianceContribution)
        .toBeGreaterThanOrEqual(result.elementContributions[i].varianceContribution);
    }
  });

  test('1.9 Widest O/M/P range dominates variance contributions', () => {
    // Use custom elements where a3 has clearly widest range
    const wideRangeElements: PertMCInput[] = [
      { elementId: 'a1', elementName: 'App A', optimistic: 50000, mostLikely: 60000, pessimistic: 70000 },
      { elementId: 'a2', elementName: 'App B', optimistic: 20000, mostLikely: 25000, pessimistic: 30000 },
      { elementId: 'a3', elementName: 'App C', optimistic: 50000, mostLikely: 150000, pessimistic: 400000 },
    ];
    const result = runPERTMonteCarlo(wideRangeElements, 10000);
    // App C has widest range (50K-400K = 350K), should contribute most
    const topContributor = result.elementContributions[0];
    expect(topContributor.elementId).toBe('a3');
  });

  test('1.10 successProbability < 1 increases mean cost', () => {
    const normal = runPERTMonteCarlo(testElements, 5000);
    const risky = runPERTMonteCarlo(
      testElements.map((e) => ({ ...e, successProbability: 0.5 })),
      5000,
    );
    expect(risky.pertMean).toBeGreaterThan(normal.pertMean);
  });

  test('1.11 Single element portfolio', () => {
    const single: PertMCInput[] = [
      { elementId: 's1', elementName: 'Solo', optimistic: 10000, mostLikely: 15000, pessimistic: 25000 },
    ];
    const result = runPERTMonteCarlo(single, 5000);
    expect(result.p10).toBeGreaterThanOrEqual(10000);
    expect(result.p90).toBeLessThanOrEqual(25000);
    expect(result.elementContributions.length).toBe(1);
  });

  test('1.12 Empty elements returns zeros', () => {
    const result = runPERTMonteCarlo([], 1000);
    expect(result.pertMean).toBe(0);
    expect(result.histogram.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 2: Risk-Adjusted NPV (rNPV)
// ══════════════════════════════════════════════════════════════════

describe('2. Risk-Adjusted NPV (rNPV)', () => {
  test('2.1 Positive cashflows with high probability → positive rNPV', () => {
    // Cumulative prob: t0=1.0, t1=0.95, t2=0.95*0.95=0.9025, t3=0.9025*0.95=0.857
    const result = computeRNPV(
      [-100000, 80000, 80000, 80000],
      [1.0, 0.95, 0.95, 0.95],
      0.05,
    );
    expect(result).toBeGreaterThan(0);
  });

  test('2.2 High discount rate reduces rNPV', () => {
    const lowRate = computeRNPV([-100000, 60000, 60000, 60000], [1, 1, 1, 1], 0.05);
    const highRate = computeRNPV([-100000, 60000, 60000, 60000], [1, 1, 1, 1], 0.20);
    expect(lowRate).toBeGreaterThan(highRate);
  });

  test('2.3 Lower success probabilities reduce rNPV', () => {
    const certain = computeRNPV([-100000, 50000, 50000, 50000], [1, 1, 1, 1], 0.08);
    const risky = computeRNPV([-100000, 50000, 50000, 50000], [1, 0.5, 0.3, 0.2], 0.08);
    expect(certain).toBeGreaterThan(risky);
  });

  test('2.4 Zero cashflows → rNPV = 0', () => {
    const result = computeRNPV([0, 0, 0], [1, 1, 1], 0.08);
    expect(result).toBe(0);
  });

  test('2.5 Cumulative probability applied correctly', () => {
    // Each period's probability should be cumulative product
    const result = computeRNPV([-100000, 200000], [1.0, 0.5], 0.0);
    // Period 0: -100000 * 1.0 = -100000
    // Period 1: 200000 * 0.5 = 100000
    // No discounting → rNPV = 0
    expect(Math.abs(result)).toBeLessThan(1);
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 3: WSJF Prioritization
// ══════════════════════════════════════════════════════════════════

describe('3. WSJF Prioritization', () => {
  const testElements: WSJFInput[] = [
    { elementId: 'w1', elementName: 'Critical Fix', costOfDelay: 100000, jobSize: 10000 },
    { elementId: 'w2', elementName: 'Nice Feature', costOfDelay: 5000, jobSize: 50000 },
    { elementId: 'w3', elementName: 'Medium Task', costOfDelay: 40000, jobSize: 20000 },
    { elementId: 'w4', elementName: 'Quick Win', costOfDelay: 30000, jobSize: 5000 },
    { elementId: 'w5', elementName: 'Large Project', costOfDelay: 80000, jobSize: 100000 },
  ];

  test('3.1 Returns sorted by WSJF score descending', () => {
    const result = computeWSJF(testElements);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].wsjfScore).toBeGreaterThanOrEqual(result[i].wsjfScore);
    }
  });

  test('3.2 Rank starts at 1 and increments', () => {
    const result = computeWSJF(testElements);
    result.forEach((r, i) => {
      expect(r.rank).toBe(i + 1);
    });
  });

  test('3.3 WSJF = CoD / jobSize', () => {
    const result = computeWSJF(testElements);
    for (const r of result) {
      const input = testElements.find((e) => e.elementId === r.elementId)!;
      const expectedWSJF = input.costOfDelay / input.jobSize;
      expect(r.wsjfScore).toBeCloseTo(expectedWSJF, 4);
    }
  });

  test('3.4 Highest CoD/jobSize ratio ranks first', () => {
    const result = computeWSJF(testElements);
    // Critical Fix: 100000/10000 = 10
    // Quick Win: 30000/5000 = 6
    // The highest WSJF should be first
    expect(result[0].elementId).toBe('w1'); // 10
    expect(result[1].elementId).toBe('w4'); // 6
  });

  test('3.5 CD3 score calculated', () => {
    const result = computeWSJF(testElements);
    for (const r of result) {
      expect(r.cd3Score).toBeGreaterThan(0);
    }
  });

  test('3.6 Empty input returns empty result', () => {
    const result = computeWSJF([]);
    expect(result).toEqual([]);
  });

  test('3.7 Single element gets rank 1', () => {
    const result = computeWSJF([testElements[0]]);
    expect(result.length).toBe(1);
    expect(result[0].rank).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════
// SECTION 4: Earned Value Management (EVM)
// ══════════════════════════════════════════════════════════════════

describe('4. Earned Value Management (EVM)', () => {
  test('4.1 On-budget on-schedule: CPI=1, SPI=1', () => {
    const result = computeEVM({
      budgetAtCompletion: 1000000,
      plannedPercent: 0.50,
      earnedPercent: 0.50,
      actualCost: 500000,
    });
    expect(result.cpi).toBeCloseTo(1.0, 2);
    expect(result.spi).toBeCloseTo(1.0, 2);
    expect(result.eac).toBeCloseTo(1000000, -2);
  });

  test('4.2 Over budget: CPI < 1', () => {
    const result = computeEVM({
      budgetAtCompletion: 1000000,
      plannedPercent: 0.50,
      earnedPercent: 0.50,
      actualCost: 700000, // spent 700K to earn 500K worth
    });
    expect(result.cpi).toBeLessThan(1);
    expect(result.eac).toBeGreaterThan(1000000);
    expect(result.cv).toBeLessThan(0); // over budget
  });

  test('4.3 Behind schedule: SPI < 1', () => {
    const result = computeEVM({
      budgetAtCompletion: 1000000,
      plannedPercent: 0.60,
      earnedPercent: 0.40,
      actualCost: 400000,
    });
    expect(result.spi).toBeLessThan(1);
    expect(result.sv).toBeLessThan(0);
  });

  test('4.4 Ahead of schedule + under budget', () => {
    const result = computeEVM({
      budgetAtCompletion: 1000000,
      plannedPercent: 0.40,
      earnedPercent: 0.60,
      actualCost: 300000,
    });
    expect(result.cpi).toBeGreaterThan(1);
    expect(result.spi).toBeGreaterThan(1);
    expect(result.eac).toBeLessThan(1000000);
    expect(result.cv).toBeGreaterThan(0);
    expect(result.sv).toBeGreaterThan(0);
  });

  test('4.5 EAC = BAC / CPI', () => {
    const input: EVMInput = {
      budgetAtCompletion: 1000000,
      plannedPercent: 0.50,
      earnedPercent: 0.40,
      actualCost: 500000,
    };
    const result = computeEVM(input);
    const expectedEAC = 1000000 / result.cpi;
    expect(result.eac).toBeCloseTo(expectedEAC, 0);
  });

  test('4.6 ETC = EAC - AC', () => {
    const input: EVMInput = {
      budgetAtCompletion: 1000000,
      plannedPercent: 0.50,
      earnedPercent: 0.50,
      actualCost: 600000,
    };
    const result = computeEVM(input);
    expect(result.etc).toBeCloseTo(result.eac - 600000, 0);
  });

  test('4.7 VAC = BAC - EAC', () => {
    const input: EVMInput = {
      budgetAtCompletion: 1000000,
      plannedPercent: 0.50,
      earnedPercent: 0.50,
      actualCost: 600000,
    };
    const result = computeEVM(input);
    expect(result.vac).toBeCloseTo(1000000 - result.eac, 0);
  });

  test('4.8 All output fields present', () => {
    const result = computeEVM({
      budgetAtCompletion: 500000,
      plannedPercent: 0.30,
      earnedPercent: 0.25,
      actualCost: 200000,
    });
    expect(result).toHaveProperty('plannedValue');
    expect(result).toHaveProperty('earnedValue');
    expect(result).toHaveProperty('actualCost');
    expect(result).toHaveProperty('cpi');
    expect(result).toHaveProperty('spi');
    expect(result).toHaveProperty('eac');
    expect(result).toHaveProperty('etc');
    expect(result).toHaveProperty('vac');
    expect(result).toHaveProperty('cv');
    expect(result).toHaveProperty('sv');
  });
});
