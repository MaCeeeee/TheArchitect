/**
 * REQ-METH-001.2 — class of a 1-cochain in H¹: exact, local defect, global obstruction.
 * Fixture: Landkarte 7.7 (TE → Produktion ×1, Produktion → Logistik ×10, TE → Logistik ×12).
 * Run: cd packages/server && npx jest src/__tests__/topologyH1.test.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { reals, Z2, Integers, factorToAdditive, additiveToFactor } from '../services/topology/abelianGroup';
import { buildComplex, Edge, Face } from '../services/topology/cellComplex';
import { coboundary0, Cochain } from '../services/topology/cochain';
import { classifyOneCochain, triangleBaseline } from '../services/topology/h1';

const landkarte = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../docs/landkarte/landkarte.model.json'), 'utf-8'),
) as { fixtures: { loopCheck: { contexts: string[]; translations: { from: string; to: string; factor: number }[] } } };

const fixture = landkarte.fixtures.loopCheck;
const edges: Edge[] = fixture.translations.map((t) => ({ id: `${t.from}>${t.to}`, source: t.from, target: t.to }));
const logFactors = (override: Record<string, number> = {}): Cochain<number> =>
  new Map(fixture.translations.map((t) => [`${t.from}>${t.to}`, factorToAdditive(override[`${t.from}>${t.to}`] ?? t.factor)]));
const triangleFace: Face = {
  id: 'TE-Produktion-Logistik',
  boundary: [
    { edgeId: 'TE>Produktion', sign: 1 },
    { edgeId: 'Produktion>Logistik', sign: 1 },
    { edgeId: 'TE>Logistik', sign: -1 },
  ],
};
const R = reals(1e-9);

describe('classifyOneCochain — Landkarte 7.7', () => {
  test('without a shared member the loop is not filled: global obstruction, product 10/12', () => {
    const complex = buildComplex(fixture.contexts, edges);
    const result = classifyOneCochain(complex, R, logFactors());
    expect(result.verdict).toBe('global_obstruction');
    expect(result.isCocycle).toBe(true);
    expect(result.isCoboundary).toBe(false);
    expect(result.loopDefects).toHaveLength(1);
    expect(result.loopDefects[0].loop.map((s) => s.edgeId).sort()).toEqual(['Produktion>Logistik', 'TE>Logistik', 'TE>Produktion']);
    const product = additiveToFactor(Math.abs(result.loopDefects[0].value));
    expect(product).toBeCloseTo(1.2, 9); // 12 / 10
  });

  test('with a triple overlap the same data is a local defect on the face', () => {
    const complex = buildComplex(fixture.contexts, edges, [triangleFace]);
    const result = classifyOneCochain(complex, R, logFactors());
    expect(result.verdict).toBe('local_defect');
    expect(result.faceDefects).toHaveLength(1);
    expect(additiveToFactor(result.faceDefects[0].value)).toBeCloseTo(10 / 12, 9);
  });

  test('corrected to ×10 the cochain is exact and yields a canonical scale per context', () => {
    const complex = buildComplex(fixture.contexts, edges, [triangleFace]);
    const result = classifyOneCochain(complex, R, logFactors({ 'TE>Logistik': 10 }));
    expect(result.verdict).toBe('exact');
    expect(result.loopDefects).toHaveLength(0);
    expect(result.faceDefects).toHaveLength(0);
    expect(additiveToFactor(result.potential.get('TE')!)).toBeCloseTo(1, 9);
    expect(additiveToFactor(result.potential.get('Produktion')!)).toBeCloseTo(1, 9);
    expect(additiveToFactor(result.potential.get('Logistik')!)).toBeCloseTo(10, 9);
  });

  test('a rounding difference inside the tolerance is not a defect', () => {
    const complex = buildComplex(fixture.contexts, edges);
    const result = classifyOneCochain(complex, R, logFactors({ 'TE>Logistik': 10 * (1 + 1e-12) }));
    expect(result.verdict).toBe('exact');
  });
});

describe('classifyOneCochain — general', () => {
  test('every coboundary is exact (and therefore a cocycle)', () => {
    const complex = buildComplex(['a', 'b', 'c', 'd'], [
      { id: 'ab', source: 'a', target: 'b' },
      { id: 'cb', source: 'c', target: 'b' },
      { id: 'cd', source: 'c', target: 'd' },
      { id: 'da', source: 'd', target: 'a' },
      { id: 'ac', source: 'a', target: 'c' },
    ]);
    const h: Cochain<number> = new Map([['a', 3], ['b', -2], ['c', 7], ['d', 0]]);
    const result = classifyOneCochain(complex, Integers, coboundary0(complex, Integers, h));
    expect(result.verdict).toBe('exact');
    expect(result.isCocycle).toBe(true);
  });

  test('baseline control: a loop of four contexts is invisible to the triangle check but found in H¹', () => {
    const square = buildComplex(['a', 'b', 'c', 'd'], [
      { id: 'ab', source: 'a', target: 'b' },
      { id: 'bc', source: 'b', target: 'c' },
      { id: 'cd', source: 'c', target: 'd' },
      { id: 'da', source: 'd', target: 'a' },
    ]);
    const g: Cochain<number> = new Map([['ab', factorToAdditive(2)], ['bc', factorToAdditive(3)], ['cd', factorToAdditive(5)], ['da', factorToAdditive(1 / 29)]]);
    expect(triangleBaseline(square, R, g)).toHaveLength(0);
    const result = classifyOneCochain(square, R, g);
    expect(result.verdict).toBe('global_obstruction');
    expect(result.loopDefects).toHaveLength(1);
    expect(result.loopDefects[0].loop).toHaveLength(4);
  });

  test('baseline control: on a triangle both find the defect', () => {
    const complex = buildComplex(fixture.contexts, edges);
    expect(triangleBaseline(complex, R, logFactors())).toHaveLength(1);
  });

  test('two contradicting declarations between the same contexts form a loop of length 2', () => {
    const complex = buildComplex(['a', 'b'], [{ id: 'ab', source: 'a', target: 'b' }, { id: 'ba', source: 'b', target: 'a' }]);
    const g: Cochain<number> = new Map([['ab', factorToAdditive(10)], ['ba', factorToAdditive(1 / 12)]]);
    const result = classifyOneCochain(complex, R, g);
    expect(result.verdict).toBe('global_obstruction');
    expect(result.loopDefects[0].loop).toHaveLength(2);
  });

  test('works over Z/2: an odd number of flips around a loop is an obstruction', () => {
    const complex = buildComplex(['a', 'b', 'c'], [
      { id: 'ab', source: 'a', target: 'b' },
      { id: 'bc', source: 'b', target: 'c' },
      { id: 'ca', source: 'c', target: 'a' },
    ]);
    expect(classifyOneCochain(complex, Z2, new Map([['ab', 1], ['bc', 1], ['ca', 1]])).verdict).toBe('global_obstruction');
    expect(classifyOneCochain(complex, Z2, new Map([['ab', 1], ['bc', 1], ['ca', 0]])).verdict).toBe('exact');
  });

  test('where every loop is filled (dim H¹ = 0) a global obstruction cannot occur', () => {
    const filled = buildComplex(fixture.contexts, edges, [triangleFace]);
    let state = 7;
    const random = () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296 - 0.5;
    };
    for (let i = 0; i < 50; i++) {
      const g: Cochain<number> = new Map(edges.map((e) => [e.id, random()]));
      expect(classifyOneCochain(filled, R, g).verdict).not.toBe('global_obstruction');
    }
  });

  test('a forest has no loops: every cochain on it is exact', () => {
    const complex = buildComplex(['a', 'b', 'c', 'x'], [{ id: 'ab', source: 'a', target: 'b' }, { id: 'bc', source: 'b', target: 'c' }]);
    expect(classifyOneCochain(complex, R, new Map([['ab', 0.3], ['bc', -4]])).verdict).toBe('exact');
  });
});
