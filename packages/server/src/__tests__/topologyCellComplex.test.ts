/**
 * REQ-METH-001.2 — cell complex: orientation, boundary matrices, ∂∂ = 0 by construction.
 * Run: cd packages/server && npx jest src/__tests__/topologyCellComplex.test.ts
 */
import { buildComplex, boundary1, boundary2, boundarySquaredIsZero } from '../services/topology/cellComplex';

const triangleEdges = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'bc', source: 'b', target: 'c' },
  { id: 'ac', source: 'a', target: 'c' },
];

describe('cell complex', () => {
  test('∂₁ of an edge is target − source', () => {
    const c = buildComplex(['a', 'b'], [{ id: 'ab', source: 'a', target: 'b' }]);
    expect(boundary1(c)).toEqual([[-1], [1]]);
  });

  test('a self-loop has zero boundary', () => {
    const c = buildComplex(['a'], [{ id: 'aa', source: 'a', target: 'a' }]);
    expect(boundary1(c)).toEqual([[0]]);
  });

  test('a face must be a closed loop; orientation is respected', () => {
    const face = { id: 'abc', boundary: [{ edgeId: 'ab', sign: 1 as const }, { edgeId: 'bc', sign: 1 as const }, { edgeId: 'ac', sign: -1 as const }] };
    const c = buildComplex(['a', 'b', 'c'], triangleEdges, [face]);
    expect(boundary2(c)).toEqual([[1], [1], [-1]]);
    expect(boundarySquaredIsZero(c)).toBe(true);
  });

  test('an open or wrongly oriented face is refused', () => {
    const wrong = { id: 'abc', boundary: [{ edgeId: 'ab', sign: 1 as const }, { edgeId: 'bc', sign: 1 as const }, { edgeId: 'ac', sign: 1 as const }] };
    expect(() => buildComplex(['a', 'b', 'c'], triangleEdges, [wrong])).toThrow('not closed');
    const open = { id: 'ab-bc', boundary: [{ edgeId: 'ab', sign: 1 as const }, { edgeId: 'bc', sign: 1 as const }] };
    expect(() => buildComplex(['a', 'b', 'c'], triangleEdges, [open])).toThrow('not closed');
  });

  test('unknown vertices and duplicate ids are refused', () => {
    expect(() => buildComplex(['a'], [{ id: 'ab', source: 'a', target: 'b' }])).toThrow('unknown vertex');
    expect(() => buildComplex(['a', 'a'], [])).toThrow('Duplicate vertex');
    expect(() => buildComplex(['a', 'b'], [{ id: 'e', source: 'a', target: 'b' }, { id: 'e', source: 'b', target: 'a' }])).toThrow('Duplicate edge');
  });
});
