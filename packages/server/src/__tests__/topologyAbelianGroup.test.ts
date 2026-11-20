/**
 * REQ-METH-001.2 — coefficients are abelian groups (axioms checked on samples).
 * Run: cd packages/server && npx jest src/__tests__/topologyAbelianGroup.test.ts
 */
import { AbelianGroup, Integers, Z2, reals, factorToAdditive, additiveToFactor } from '../services/topology/abelianGroup';

function expectGroupAxioms(group: AbelianGroup<number>, samples: number[]) {
  for (const a of samples) {
    expect(group.isZero(group.add(a, group.neg(a)))).toBe(true); // inverse
    expect(group.isZero(group.add(group.add(a, group.zero), group.neg(a)))).toBe(true); // identity
    for (const b of samples) {
      expect(group.isZero(group.add(group.add(a, b), group.neg(group.add(b, a))))).toBe(true); // commutative
      for (const c of samples) {
        const left = group.add(group.add(a, b), c);
        const right = group.add(a, group.add(b, c));
        expect(group.isZero(group.add(left, group.neg(right)))).toBe(true); // associative
      }
    }
  }
}

describe('abelian groups', () => {
  test('Z satisfies the group axioms', () => expectGroupAxioms(Integers, [-7, -1, 0, 2, 13]));
  test('Z/2 satisfies the group axioms and 1 + 1 = 0', () => {
    expectGroupAxioms(Z2, [0, 1]);
    expect(Z2.add(1, 1)).toBe(0);
  });
  test('R satisfies the group axioms within tolerance', () => expectGroupAxioms(reals(), [-2.5, 0, 0.1, 0.2, 3]));

  test('factors map to the additive group: products become sums, 1 becomes 0', () => {
    expect(factorToAdditive(1)).toBe(0);
    expect(factorToAdditive(2) + factorToAdditive(5)).toBeCloseTo(factorToAdditive(10), 12);
    expect(factorToAdditive(1 / 4)).toBeCloseTo(-factorToAdditive(4), 12);
    expect(additiveToFactor(factorToAdditive(12))).toBeCloseTo(12, 12);
  });

  test('zero, negative and non-finite factors are refused (not invertible)', () => {
    expect(() => factorToAdditive(0)).toThrow('positive finite');
    expect(() => factorToAdditive(-3)).toThrow('positive finite');
    expect(() => factorToAdditive(Number.NaN)).toThrow('positive finite');
  });
});
