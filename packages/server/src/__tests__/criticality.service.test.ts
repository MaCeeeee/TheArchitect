/**
 * REQ-CRIT-001 — Composite Criticality Score Engine unit tests
 *
 * Run: cd packages/server && npx jest src/__tests__/criticality.service.test.ts
 */

import {
  computeCriticality,
  computeSpofRaw,
  computeRiskConnectivityRaw,
  computeMaturityFloorRaw,
  computeComplianceGapRaw,
  computeCostBurdenRaw,
  computeStakeholderBottleneckRaw,
  computeCycleTangleRaw,
  applyLayerMultipliers,
  type CriticalityElement,
  type CriticalityConnection,
} from '../services/criticality.service';

const elem = (
  id: string,
  overrides: Partial<CriticalityElement> = {}
): CriticalityElement => ({
  id,
  name: `Element ${id}`,
  type: 'application_component',
  layer: 'application',
  riskLevel: 'low',
  maturityLevel: 3,
  ...overrides,
});

const conn = (sourceId: string, targetId: string): CriticalityConnection => ({
  sourceId,
  targetId,
});

describe('computeCriticality — Composition + Composite Score', () => {
  test('1. empty elements returns empty map', () => {
    const result = computeCriticality({ elements: [], connections: [] });
    expect(result.size).toBe(0);
  });

  test('2. single element with no signals scores 0', () => {
    const result = computeCriticality({
      elements: [elem('e1')],
      connections: [],
    });
    expect(result.get('e1')?.totalScore).toBe(0);
  });

  test('3. dominantFactor is the highest weighted factor', () => {
    // e1 has critical risk + only outgoing edges → no SPOF, but riskConnectivity high
    const result = computeCriticality({
      elements: [
        elem('e1', { riskLevel: 'critical' }),
        elem('e2', { type: 'application_service' }),
        elem('e3', { type: 'node' }),
      ],
      connections: [conn('e1', 'e2'), conn('e1', 'e3'), conn('e2', 'e3'), conn('e3', 'e2')],
    });
    expect(result.get('e1')?.dominantFactor).toBe('riskConnectivity');
  });

  test('4. score is capped at 100', () => {
    // create one extreme element with all factors maxed
    const result = computeCriticality({
      elements: [
        elem('hot', { riskLevel: 'critical', maturityLevel: 0 }),
        elem('a'),
        elem('b'),
        elem('c'),
      ],
      connections: [conn('a', 'hot'), conn('b', 'hot'), conn('c', 'hot')],
      cycleMembers: new Set(['hot']),
    });
    const score = result.get('hot')?.totalScore ?? 0;
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('5. user weights override defaults', () => {
    // Set only spof weight, everything else 0 → only spof contributes
    const result = computeCriticality({
      elements: [elem('h'), elem('a'), elem('b')],
      connections: [conn('a', 'h'), conn('b', 'h')],
      weights: {
        spof: 1.0,
        riskConnectivity: 0,
        maturityFloor: 0,
        complianceGap: 0,
        costBurden: 0,
        stakeholderBottleneck: 0,
        cycleTangle: 0,
      },
    });
    expect(result.get('h')?.dominantFactor).toBe('spof');
    expect(result.get('a')?.totalScore).toBe(0);
  });

  test('6. all elements present in result map', () => {
    const result = computeCriticality({
      elements: [elem('e1'), elem('e2'), elem('e3')],
      connections: [],
    });
    expect(result.size).toBe(3);
    ['e1', 'e2', 'e3'].forEach((id) => expect(result.has(id)).toBe(true));
  });
});

describe('F1 SPOF — Single Point of Failure', () => {
  test('7. high incoming dependents raise SPOF raw', () => {
    const elements = [
      elem('hub'),
      elem('a', { type: 'application_service' }),
      elem('b', { type: 'application_service' }),
      elem('c', { type: 'application_service' }),
    ];
    const degrees = new Map([
      ['hub', { in: 3, out: 0, total: 3 }],
      ['a', { in: 0, out: 1, total: 1 }],
      ['b', { in: 0, out: 1, total: 1 }],
      ['c', { in: 0, out: 1, total: 1 }],
    ]);
    const noRedundancy = new Map([
      ['hub', false],
      ['a', true],
      ['b', true],
      ['c', true],
    ]);
    const raw = computeSpofRaw(elements, degrees, noRedundancy);
    expect(raw.get('hub')).toBe(3);
    expect(raw.get('a')).toBe(0);
  });

  test('8. redundancy halves SPOF raw', () => {
    const elements = [elem('redundant')];
    const degrees = new Map([['redundant', { in: 4, out: 0, total: 4 }]]);
    const withRedundancy = new Map([['redundant', true]]);
    const raw = computeSpofRaw(elements, degrees, withRedundancy);
    expect(raw.get('redundant')).toBe(2);
  });
});

describe('F2 Risk × Connectivity', () => {
  test('9. critical risk × 10 connections = 40', () => {
    const elements = [elem('e', { riskLevel: 'critical' })];
    const degrees = new Map([['e', { in: 5, out: 5, total: 10 }]]);
    const raw = computeRiskConnectivityRaw(elements, degrees);
    expect(raw.get('e')).toBe(40);
  });

  test('10. low risk fallback when undefined', () => {
    const elements = [elem('e', { riskLevel: null })];
    const degrees = new Map([['e', { in: 1, out: 1, total: 2 }]]);
    const raw = computeRiskConnectivityRaw(elements, degrees);
    expect(raw.get('e')).toBe(2); // low=1 × 2
  });
});

describe('F3 Maturity-Floor', () => {
  test('11. low maturity + many dependents = high raw', () => {
    const elements = [elem('immature', { maturityLevel: 1 })];
    const degrees = new Map([['immature', { in: 6, out: 0, total: 6 }]]);
    const raw = computeMaturityFloorRaw(elements, degrees);
    expect(raw.get('immature')).toBe(24); // (5-1) × 6
  });

  test('12. fully mature element scores 0', () => {
    const elements = [elem('mature', { maturityLevel: 5 })];
    const degrees = new Map([['mature', { in: 10, out: 0, total: 10 }]]);
    const raw = computeMaturityFloorRaw(elements, degrees);
    expect(raw.get('mature')).toBe(0);
  });
});

describe('F4 Compliance-Gap', () => {
  test('13. unrealized standard mapping increments gap', () => {
    const elements = [elem('e1'), elem('e2')];
    const mappings = [
      { elementId: 'e1', hasRealizer: false },
      { elementId: 'e1', hasRealizer: false },
      { elementId: 'e2', hasRealizer: true },
    ];
    const raw = computeComplianceGapRaw(elements, mappings);
    expect(raw.get('e1')).toBe(2);
    expect(raw.get('e2')).toBe(0);
  });
});

describe('F5 Cost-Burden', () => {
  test('14. cost share above 20% threshold counted, below ignored', () => {
    const elements = [elem('big'), elem('small')];
    const waves = [
      {
        totalCost: 1_000_000,
        elementCosts: [
          { elementId: 'big', cost: 400_000 }, // 40% → counts (0.4)
          { elementId: 'small', cost: 100_000 }, // 10% → below threshold
        ],
      },
    ];
    const raw = computeCostBurdenRaw(elements, waves);
    expect(raw.get('big')).toBeGreaterThan(0);
    expect(raw.get('small')).toBe(0);
  });
});

describe('F6 Stakeholder-Bottleneck', () => {
  test('15. conflict count maps directly to raw', () => {
    const elements = [elem('contested'), elem('clean')];
    const conflicts = [{ elementId: 'contested', conflictCount: 7 }];
    const raw = computeStakeholderBottleneckRaw(elements, conflicts);
    expect(raw.get('contested')).toBe(7);
    expect(raw.get('clean')).toBe(0);
  });
});

describe('F7 Cycle / Tangle', () => {
  test('16. members in cycleMembers Set get raw=1', () => {
    const elements = [elem('inCycle'), elem('clean')];
    const raw = computeCycleTangleRaw(elements, new Set(['inCycle']));
    expect(raw.get('inCycle')).toBe(1);
    expect(raw.get('clean')).toBe(0);
  });
});

describe('Layer-Weighting (Option B)', () => {
  test('17. motivation-layer element with cycle scores LOWER than tech-layer element with same raw signals', () => {
    const motivationEl: CriticalityElement = {
      id: 'driver',
      name: 'EU CSRD',
      type: 'driver',
      layer: 'motivation',
      riskLevel: 'critical',
      maturityLevel: 1,
    };
    const techEl: CriticalityElement = {
      id: 'app',
      name: 'SAP S/4HANA',
      type: 'application_component',
      layer: 'application',
      riskLevel: 'critical',
      maturityLevel: 1,
    };
    // Add filler elements with same type-buckets to suppress redundancy halving
    const fillers: CriticalityElement[] = [
      { id: 'f1', name: 'F1', type: 'unique-a', layer: 'business', riskLevel: 'low', maturityLevel: 3 },
      { id: 'f2', name: 'F2', type: 'unique-b', layer: 'business', riskLevel: 'low', maturityLevel: 3 },
    ];
    const connections: CriticalityConnection[] = [
      { sourceId: 'f1', targetId: 'driver' },
      { sourceId: 'f2', targetId: 'driver' },
      { sourceId: 'f1', targetId: 'app' },
      { sourceId: 'f2', targetId: 'app' },
    ];
    const cycleMembers = new Set(['driver', 'app']);

    const result = computeCriticality({
      elements: [motivationEl, techEl, ...fillers],
      connections,
      cycleMembers,
    });

    const motivationScore = result.get('driver')?.totalScore ?? 0;
    const techScore = result.get('app')?.totalScore ?? 0;
    expect(motivationScore).toBeLessThan(techScore);
  });

  test('18. motivation-layer dominantFactor for cycleTangle-heavy element is NOT cycleTangle (dampened)', () => {
    const motivationEl: CriticalityElement = {
      id: 'driver',
      name: 'Goal',
      type: 'goal',
      layer: 'motivation',
      riskLevel: 'medium',
      maturityLevel: 3,
    };
    const filler1: CriticalityElement = {
      id: 'cap1',
      name: 'C1',
      type: 'capability',
      layer: 'strategy',
      riskLevel: 'low',
      maturityLevel: 3,
    };
    // Driver participates in cycle; with motivation layer it should NOT dominate
    const result = computeCriticality({
      elements: [motivationEl, filler1],
      connections: [{ sourceId: 'cap1', targetId: 'driver' }],
      cycleMembers: new Set(['driver']),
      // boost compliance signal to make sure SOMETHING else can dominate
      standardMappings: [{ elementId: 'driver', hasRealizer: false }],
    });
    const dominant = result.get('driver')?.dominantFactor;
    // cycleTangle is dampened to 0.3 weight for motivation, complianceGap doubled to 3.0
    expect(dominant).toBe('complianceGap');
  });

  test('19. applyLayerMultipliers keeps tech-layer weights unchanged', () => {
    const base = {
      spof: 1.0,
      riskConnectivity: 1.0,
      maturityFloor: 1.0,
      complianceGap: 1.5,
      costBurden: 1.0,
      stakeholderBottleneck: 0.5,
      cycleTangle: 1.5,
    };
    const result = applyLayerMultipliers(base, 'technology');
    expect(result).toEqual(base);
  });

  test('20b. Max-Blend: single dominant factor scores significantly higher than pure-mean would give', () => {
    // 4 elements: one is an extreme SPOF, others have nothing.
    const hubElement: CriticalityElement = {
      id: 'hub',
      name: 'Hub',
      type: 'application_component',
      layer: 'application',
      riskLevel: 'low',
      maturityLevel: 5,
    };
    const leaves: CriticalityElement[] = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
      id,
      name: id,
      type: 'application_service',
      layer: 'application',
      riskLevel: 'low',
      maturityLevel: 5,
    }));
    const result = computeCriticality({
      elements: [hubElement, ...leaves],
      connections: leaves.map((l) => ({ sourceId: l.id, targetId: 'hub' })),
    });
    const hubScore = result.get('hub')?.totalScore ?? 0;
    // With pure-mean formula this would be: 1 active factor (SPOF) × 1.0 weighted = 1.0,
    // totalWeight = 7.5 → score 13.3.
    // With max-blend: maxComponent = 1.0 × 0.6 + meanComponent ≈ 0.13 × 0.4 → ~65
    expect(hubScore).toBeGreaterThan(50);
    expect(result.get('hub')?.dominantFactor).toBe('spof');
  });

  test('20. applyLayerMultipliers aggressively dampens motivation fix-signals', () => {
    const base = {
      spof: 1.0,
      riskConnectivity: 1.0,
      maturityFloor: 1.0,
      complianceGap: 1.5,
      costBurden: 1.0,
      stakeholderBottleneck: 0.5,
      cycleTangle: 1.5,
    };
    const result = applyLayerMultipliers(base, 'motivation');
    expect(result.spof).toBeCloseTo(0.1, 5); // ×0.1
    expect(result.cycleTangle).toBeCloseTo(0.15, 5); // 1.5 × 0.1
    expect(result.riskConnectivity).toBeCloseTo(0.5, 5); // 1.0 × 0.5
    expect(result.maturityFloor).toBeCloseTo(0.5, 5); // 1.0 × 0.5
    expect(result.complianceGap).toBeCloseTo(3.0, 5); // 1.5 × 2.0
    expect(result.stakeholderBottleneck).toBeCloseTo(0.75, 5); // 0.5 × 1.5
    expect(result.costBurden).toBe(1.0); // unchanged
  });
});
