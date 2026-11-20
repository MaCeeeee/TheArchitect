/**
 * REQ-METH-001.2 — exact rank, Betti numbers, baseline equality, independent loops.
 * Run: cd packages/server && npx jest src/__tests__/topologyHomology.test.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildComplex, chainBoundary, Edge } from '../services/topology/cellComplex';
import { rankOverQ } from '../services/topology/linearAlgebra';
import { bettiNumbers, graphBetti, fundamentalLoops, spanningForest, componentIndex } from '../services/topology/homology';

const landkarte = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../docs/landkarte/landkarte.model.json'), 'utf-8'),
) as {
  fixtures: {
    homology: { vertices: number; edges: number; beta0: number; beta1: number; edgeList: [string, string][] };
    loopCheck: { independentLoopsFullMesh: { n: number; loops: number } };
  };
};

/** Deterministic pseudo-random numbers so a failing case can be reproduced. */
function lcg(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function randomGraph(seed: number) {
  const random = lcg(seed);
  const n = 1 + Math.floor(random() * 12);
  const vertices = Array.from({ length: n }, (_, i) => `v${i}`);
  const m = Math.floor(random() * 20);
  const edges: Edge[] = Array.from({ length: m }, (_, i) => ({
    id: `e${i}`,
    source: vertices[Math.floor(random() * n)],
    target: vertices[Math.floor(random() * n)],
  }));
  return buildComplex(vertices, edges);
}

describe('rankOverQ', () => {
  test('known ranks', () => {
    expect(rankOverQ([])).toBe(0);
    expect(rankOverQ([[0, 0], [0, 0]])).toBe(0);
    expect(rankOverQ([[1, 0], [0, 1]])).toBe(2);
    expect(rankOverQ([[1, 2, 3], [2, 4, 6], [1, 0, 1]])).toBe(2);
    expect(rankOverQ([[0, 0, 1], [0, 0, 2], [0, 3, 0]])).toBe(2);
    expect(rankOverQ([[2, 4], [1, 2], [3, 6]])).toBe(1);
  });

  test('refuses non-integers', () => {
    expect(() => rankOverQ([[0.5]])).toThrow('integer');
  });
});

describe('Betti numbers', () => {
  test('Landkarte fixture 7.6: 6 vertices, 7 edges → b0 = 1, b1 = 2', () => {
    const fixture = landkarte.fixtures.homology;
    const vertices = [...new Set(fixture.edgeList.flat())];
    const edges = fixture.edgeList.map(([source, target], i) => ({ id: `e${i}`, source, target }));
    const complex = buildComplex(vertices, edges);
    expect(vertices).toHaveLength(fixture.vertices);
    expect(bettiNumbers(complex)).toEqual({ b0: fixture.beta0, b1: fixture.beta1, b2: 0 });
  });

  test('Landkarte 7.7: n fully connected contexts need (n − 1)(n − 2)/2 loop checks — 10 for 6', () => {
    const { n, loops } = landkarte.fixtures.loopCheck.independentLoopsFullMesh;
    const vertices = Array.from({ length: n }, (_, i) => `c${i}`);
    const edges = vertices.flatMap((a, i) => vertices.slice(i + 1).map((b) => ({ id: `${a}-${b}`, source: a, target: b })));
    const complex = buildComplex(vertices, edges);
    expect(graphBetti(complex).b1).toBe(loops);
    expect(bettiNumbers(complex).b1).toBe(((n - 1) * (n - 2)) / 2);
  });

  test('componentIndex numbers the connected groups in order of first appearance', () => {
    const complex = buildComplex(['a', 'b', 'x', 'c', 'y'], [
      { id: 'ab', source: 'a', target: 'b' },
      { id: 'cb', source: 'c', target: 'b' },
      { id: 'xy', source: 'x', target: 'y' },
    ]);
    const index = componentIndex(spanningForest(complex));
    expect(Object.fromEntries(index)).toEqual({ a: 0, b: 0, c: 0, x: 1, y: 1 });
  });

  test('hollow triangle has one loop; filling it with a face removes the loop', () => {
    const edges = [
      { id: 'ab', source: 'a', target: 'b' },
      { id: 'bc', source: 'b', target: 'c' },
      { id: 'ca', source: 'c', target: 'a' },
    ];
    expect(bettiNumbers(buildComplex(['a', 'b', 'c'], edges))).toEqual({ b0: 1, b1: 1, b2: 0 });
    const face = { id: 'abc', boundary: edges.map((e) => ({ edgeId: e.id, sign: 1 as const })) };
    expect(bettiNumbers(buildComplex(['a', 'b', 'c'], edges, [face]))).toEqual({ b0: 1, b1: 0, b2: 0 });
  });

  test('two faces on the same triangle enclose a cavity (b2 = 1)', () => {
    const edges = [
      { id: 'ab', source: 'a', target: 'b' },
      { id: 'bc', source: 'b', target: 'c' },
      { id: 'ca', source: 'c', target: 'a' },
    ];
    const boundary = edges.map((e) => ({ edgeId: e.id, sign: 1 as const }));
    const complex = buildComplex(['a', 'b', 'c'], edges, [{ id: 'f1', boundary }, { id: 'f2', boundary }]);
    expect(bettiNumbers(complex)).toEqual({ b0: 1, b1: 0, b2: 1 });
  });

  test('baseline control: on 200 random graphs the exact computation equals the plain graph query', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const complex = randomGraph(seed);
      const exact = bettiNumbers(complex);
      expect({ seed, b0: exact.b0, b1: exact.b1 }).toEqual({ seed, ...graphBetti(complex) });
    }
  });
});

describe('fundamental loops', () => {
  test('there are exactly b1 of them and each one is closed', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const complex = randomGraph(seed);
      const edgesById = new Map(complex.edges.map((e) => [e.id, e]));
      const loops = fundamentalLoops(complex);
      expect(loops).toHaveLength(graphBetti(complex).b1);
      loops.forEach((loop) => expect(chainBoundary(loop, edgesById).size).toBe(0));
    }
  });

  test('the loop of a parallel edge has length 2, the loop of a self-loop length 1', () => {
    const parallel = buildComplex(['a', 'b'], [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'a', target: 'b' }]);
    expect(fundamentalLoops(parallel)).toEqual([[{ edgeId: 'e2', sign: 1 }, { edgeId: 'e1', sign: -1 }]]);
    const self = buildComplex(['a'], [{ id: 'aa', source: 'a', target: 'a' }]);
    expect(fundamentalLoops(self)).toEqual([[{ edgeId: 'aa', sign: 1 }]]);
  });
});
