import { describe, test, expect } from 'vitest';
import { computeRequirementCoverage, bandFor } from './coverageScore';
import type { ArchitectureElement, Connection } from '../stores/architectureStore';

function el(overrides: Partial<ArchitectureElement> & { id: string }): ArchitectureElement {
  return {
    type: 'business_capability',
    name: `Element ${overrides.id}`,
    description: '',
    layer: 'strategy',
    togafDomain: 'business',
    maturityLevel: 3,
    riskLevel: 'medium',
    status: 'current',
    position3D: { x: 0, y: 0, z: 0 },
    metadata: {},
    ...overrides,
  };
}

function conn(sourceId: string, targetId: string, type: string): Connection {
  return { id: `${sourceId}-${targetId}`, sourceId, targetId, type };
}

describe('computeRequirementCoverage', () => {
  test('returns 0 when no element realizes the requirement', () => {
    const req = el({ id: 'r1', type: 'requirement', layer: 'motivation' });
    const r = computeRequirementCoverage('r1', [req], []);
    expect(r.coverage).toBe(0);
    expect(r.band).toBe('red');
    expect(r.fulfillingCount).toBe(0);
    expect(r.reason).toMatch(/No element realizes/);
  });

  test('current + max maturity → coverage = 1.0', () => {
    const req = el({ id: 'r1', type: 'requirement', layer: 'motivation' });
    const cap = el({ id: 'c1', status: 'current', maturityLevel: 5 });
    const r = computeRequirementCoverage('r1', [req, cap], [conn('c1', 'r1', 'realization')]);
    expect(r.coverage).toBe(1);
    expect(r.band).toBe('green');
    expect(r.fulfillingCount).toBe(1);
  });

  test('target status → coverage = 0 (only intended, not built)', () => {
    const req = el({ id: 'r1', type: 'requirement', layer: 'motivation' });
    const cap = el({ id: 'c1', status: 'target', maturityLevel: 5 });
    const r = computeRequirementCoverage('r1', [req, cap], [conn('c1', 'r1', 'realization')]);
    expect(r.coverage).toBe(0);
    expect(r.band).toBe('red');
    expect(r.fulfillingCount).toBe(1); // it IS a fulfilling element, just contributes 0
    expect(r.reason).toMatch(/target\/retired/);
  });

  test('transitional with mid maturity → partial coverage (yellow band)', () => {
    const req = el({ id: 'r1', type: 'requirement', layer: 'motivation' });
    const cap = el({ id: 'c1', status: 'transitional', maturityLevel: 4 });
    const r = computeRequirementCoverage('r1', [req, cap], [conn('c1', 'r1', 'realization')]);
    // 0.5 * (4/5) = 0.4
    expect(r.coverage).toBeCloseTo(0.4, 5);
    expect(r.band).toBe('yellow');
  });

  test('takes MAX over multiple realizing elements (one strong wins)', () => {
    const req = el({ id: 'r1', type: 'requirement', layer: 'motivation' });
    const weak = el({ id: 'c1', status: 'transitional', maturityLevel: 1 });
    const strong = el({ id: 'c2', status: 'current', maturityLevel: 5 });
    const r = computeRequirementCoverage(
      'r1',
      [req, weak, strong],
      [conn('c1', 'r1', 'realization'), conn('c2', 'r1', 'realization')],
    );
    expect(r.coverage).toBe(1);
    expect(r.band).toBe('green');
    expect(r.fulfillingCount).toBe(2);
    // strongest contributor sorted first
    expect(r.contributions[0].elementId).toBe('c2');
  });

  test('ignores non-fulfillment relationship types (e.g. composition, flow)', () => {
    const req = el({ id: 'r1', type: 'requirement', layer: 'motivation' });
    const cap = el({ id: 'c1', status: 'current', maturityLevel: 5 });
    const r = computeRequirementCoverage('r1', [req, cap], [conn('c1', 'r1', 'composition')]);
    expect(r.coverage).toBe(0);
    expect(r.fulfillingCount).toBe(0);
  });

  test('ignores outgoing edges (requirement → cap is not "realized by")', () => {
    const req = el({ id: 'r1', type: 'requirement', layer: 'motivation' });
    const cap = el({ id: 'c1', status: 'current', maturityLevel: 5 });
    // edge runs r1 → c1, but coverage looks at incoming TO r1
    const r = computeRequirementCoverage('r1', [req, cap], [conn('r1', 'c1', 'realization')]);
    expect(r.coverage).toBe(0);
  });

  test('accepts both "realization" and "realisation" spellings', () => {
    const req = el({ id: 'r1', type: 'requirement', layer: 'motivation' });
    const cap = el({ id: 'c1', status: 'current', maturityLevel: 5 });
    const r = computeRequirementCoverage('r1', [req, cap], [conn('c1', 'r1', 'realisation')]);
    expect(r.coverage).toBe(1);
  });
});

describe('bandFor', () => {
  test('red below 0.3', () => {
    expect(bandFor(0)).toBe('red');
    expect(bandFor(0.29)).toBe('red');
  });
  test('yellow 0.3..0.7', () => {
    expect(bandFor(0.3)).toBe('yellow');
    expect(bandFor(0.69)).toBe('yellow');
  });
  test('green at 0.7+', () => {
    expect(bandFor(0.7)).toBe('green');
    expect(bandFor(1)).toBe('green');
  });
});
