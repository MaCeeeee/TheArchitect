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
