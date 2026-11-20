/**
 * UC-METH-001 — Betti numbers and independent loops.
 * bettiNumbers is the general, exact computation from the boundary matrices.
 * graphBetti is the plain graph query (union-find, E − V + b0). Both must agree on
 * every complex without faces — that equality is tested and is the baseline of ADR-0007 E8:
 * on a bare graph, homology says nothing a simple query does not say.
 */
import { boundary1, boundary2, CellComplex, Edge, OrientedStep } from './cellComplex';
import { rankOverQ } from './linearAlgebra';

export interface BettiNumbers {
  b0: number;
  b1: number;
  b2: number;
}

export function bettiNumbers(complex: CellComplex): BettiNumbers {
  const rank1 = rankOverQ(boundary1(complex));
  const rank2 = rankOverQ(boundary2(complex));
  return {
    b0: complex.vertices.length - rank1,
    b1: complex.edges.length - rank1 - rank2,
    b2: complex.faces.length - rank2,
  };
}

export interface SpanningForest {
  /** Vertices in breadth-first order, roots first within their component. */
  order: string[];
  /** For every non-root vertex: its parent and the tree edge joining them. */
  parent: Map<string, { vertex: string; edge: Edge }>;
  treeEdgeIds: Set<string>;
  roots: string[];
}

export function spanningForest(complex: CellComplex): SpanningForest {
  const adjacency = new Map<string, Array<{ neighbour: string; edge: Edge }>>();
  complex.vertices.forEach((v) => adjacency.set(v, []));
  for (const edge of complex.edges) {
    adjacency.get(edge.source)!.push({ neighbour: edge.target, edge });
    adjacency.get(edge.target)!.push({ neighbour: edge.source, edge });
  }
  const visited = new Set<string>();
  const order: string[] = [];
  const parent = new Map<string, { vertex: string; edge: Edge }>();
  const treeEdgeIds = new Set<string>();
  const roots: string[] = [];
  for (const start of complex.vertices) {
    if (visited.has(start)) continue;
    roots.push(start);
    visited.add(start);
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);
      for (const { neighbour, edge } of adjacency.get(current)!) {
        if (visited.has(neighbour)) continue;
        visited.add(neighbour);
        parent.set(neighbour, { vertex: current, edge });
        treeEdgeIds.add(edge.id);
        queue.push(neighbour);
      }
    }
  }
  return { order, parent, treeEdgeIds, roots };
}

/** vertex → index of its connected component (in the order of forest.roots). */
export function componentIndex(forest: SpanningForest): Map<string, number> {
  const index = new Map<string, number>();
  forest.roots.forEach((root, i) => index.set(root, i));
  for (const vertex of forest.order) {
    const link = forest.parent.get(vertex);
    if (link) index.set(vertex, index.get(link.vertex)!);
  }
  return index;
}

/** The plain graph query: components by spanning forest, loops by counting. Ignores faces. */
export function graphBetti(complex: CellComplex): { b0: number; b1: number } {
  const b0 = spanningForest(complex).roots.length;
  return { b0, b1: complex.edges.length - complex.vertices.length + b0 };
}

function stepsToRoot(vertex: string, forest: SpanningForest): OrientedStep[] {
  const steps: OrientedStep[] = [];
  let current = vertex;
  let link = forest.parent.get(current);
  while (link) {
    steps.push({ edgeId: link.edge.id, sign: link.edge.source === current ? 1 : -1 });
    current = link.vertex;
    link = forest.parent.get(current);
  }
  return steps;
}

/**
 * One loop per non-tree edge: the edge itself, then back through the tree from its target
 * to its source. These loops form a basis of the cycle space of the 1-skeleton.
 */
export function fundamentalLoops(complex: CellComplex, forest = spanningForest(complex)): OrientedStep[][] {
  const loops: OrientedStep[][] = [];
  for (const edge of complex.edges) {
    if (forest.treeEdgeIds.has(edge.id)) continue;
    const up = stepsToRoot(edge.target, forest);
    const down = stepsToRoot(edge.source, forest);
    while (up.length > 0 && down.length > 0 && up[up.length - 1].edgeId === down[down.length - 1].edgeId) {
      up.pop();
      down.pop();
    }
    const back = down.reverse().map((s): OrientedStep => ({ edgeId: s.edgeId, sign: s.sign === 1 ? -1 : 1 }));
    loops.push([{ edgeId: edge.id, sign: 1 }, ...up, ...back]);
  }
  return loops;
}
