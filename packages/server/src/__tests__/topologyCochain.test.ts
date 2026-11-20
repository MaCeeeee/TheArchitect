/**
 * REQ-METH-001.2 — coboundary operator; δ∘δ = 0 as a tested property.
 * Run: cd packages/server && npx jest src/__tests__/topologyCochain.test.ts
 */
import { Integers, Z2, reals, AbelianGroup } from '../services/topology/abelianGroup';
import { buildComplex } from '../services/topology/cellComplex';
import { coboundary0, coboundary1, Cochain } from '../services/topology/cochain';

const edges = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'bc', source: 'b', target: 'c' },
  { id: 'ac', source: 'a', target: 'c' },
  { id: 'cd', source: 'c', target: 'd' },
  { id: 'da', source: 'd', target: 'a' },
];
const faces = [
  { id: 'abc', boundary: [{ edgeId: 'ab', sign: 1 as const }, { edgeId: 'bc', sign: 1 as const }, { edgeId: 'ac', sign: -1 as const }] },
  { id: 'acd', boundary: [{ edgeId: 'ac', sign: 1 as const }, { edgeId: 'cd', sign: 1 as const }, { edgeId: 'da', sign: 1 as const }] },
];
const complex = buildComplex(['a', 'b', 'c', 'd'], edges, faces);

describe('coboundary', () => {
  test('δ⁰ gives the difference target − source on every edge', () => {
    const f: Cochain<number> = new Map([['a', 1], ['b', 4], ['c', 10]]);
    const df = coboundary0(complex, Integers, f);
    expect(df.get('ab')).toBe(3);
    expect(df.get('bc')).toBe(6);
    expect(df.get('ac')).toBe(9);
    expect(df.get('cd')).toBe(-10); // d is missing → zero
  });

  test('δ¹ sums around the face with orientation', () => {
    const g: Cochain<number> = new Map([['ab', 1], ['bc', 10], ['ac', 12]]);
    expect(coboundary1(complex, Integers, g).get('abc')).toBe(-1); // 1 + 10 − 12
  });

  test.each<[string, AbelianGroup<number>, number[]]>([
    ['Z', Integers, [-3, 0, 5, 8]],
    ['Z/2', Z2, [0, 1, 1, 0]],
    ['R', reals(), [0.25, -1.5, 3.75, 2]],
  ])('δ¹∘δ⁰ = 0 over %s', (_name, group, values) => {
    const f: Cochain<number> = new Map(complex.vertices.map((v, i) => [v, values[i]]));
    const ddf = coboundary1(complex, group, coboundary0(complex, group, f));
    for (const value of ddf.values()) expect(group.isZero(value)).toBe(true);
  });
});
