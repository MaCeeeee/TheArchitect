/**
 * UC-METH-001, rungs 1–2 — the complex. 0-cells (vertices), oriented 1-cells (edges,
 * ∂e = target − source) and oriented 2-cells (faces, bounded by a closed loop of edges).
 * buildComplex refuses any face whose boundary does not close, so ∂₁∘∂₂ = 0 holds by
 * construction and is not an assumption.
 */
export interface Edge {
  id: string;
  source: string;
  target: string;
}

export interface OrientedStep {
  edgeId: string;
  /** +1 = along the edge (source → target), −1 = against it. */
  sign: 1 | -1;
}

export interface Face {
  id: string;
  boundary: OrientedStep[];
}

export interface CellComplex {
  vertices: string[];
  edges: Edge[];
  faces: Face[];
}

function assertUnique(ids: string[], what: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Duplicate ${what} id: ${id}`);
    seen.add(id);
  }
}

/** Net boundary of an oriented chain of edges: vertex → integer coefficient (zero entries removed). */
export function chainBoundary(steps: OrientedStep[], edgesById: Map<string, Edge>): Map<string, number> {
  const net = new Map<string, number>();
  for (const step of steps) {
    const edge = edgesById.get(step.edgeId);
    if (!edge) throw new Error(`Unknown edge: ${step.edgeId}`);
    net.set(edge.target, (net.get(edge.target) ?? 0) + step.sign);
    net.set(edge.source, (net.get(edge.source) ?? 0) - step.sign);
  }
  for (const [vertex, coefficient] of net) {
    if (coefficient === 0) net.delete(vertex);
  }
  return net;
}

export function buildComplex(vertices: string[], edges: Edge[], faces: Face[] = []): CellComplex {
  assertUnique(vertices, 'vertex');
  assertUnique(edges.map((e) => e.id), 'edge');
  assertUnique(faces.map((f) => f.id), 'face');
  const vertexSet = new Set(vertices);
  for (const edge of edges) {
    if (!vertexSet.has(edge.source) || !vertexSet.has(edge.target)) {
      throw new Error(`Edge ${edge.id} references an unknown vertex`);
    }
  }
  const edgesById = new Map(edges.map((e) => [e.id, e]));
  for (const face of faces) {
    if (face.boundary.length === 0) throw new Error(`Face ${face.id} has an empty boundary`);
    if (chainBoundary(face.boundary, edgesById).size > 0) {
      throw new Error(`Face ${face.id} is not closed (∂∂ ≠ 0)`);
    }
  }
  return { vertices: [...vertices], edges: [...edges], faces: [...faces] };
}

/** ∂₁ as integer matrix: rows = vertices, columns = edges. */
export function boundary1(complex: CellComplex): number[][] {
  const row = new Map(complex.vertices.map((v, i) => [v, i]));
  const matrix = complex.vertices.map(() => complex.edges.map(() => 0));
  complex.edges.forEach((edge, col) => {
    matrix[row.get(edge.target)!][col] += 1;
    matrix[row.get(edge.source)!][col] -= 1;
  });
  return matrix;
}

/** ∂₂ as integer matrix: rows = edges, columns = faces. */
export function boundary2(complex: CellComplex): number[][] {
  const row = new Map(complex.edges.map((e, i) => [e.id, i]));
  const matrix = complex.edges.map(() => complex.faces.map(() => 0));
  complex.faces.forEach((face, col) => {
    for (const step of face.boundary) matrix[row.get(step.edgeId)!][col] += step.sign;
  });
  return matrix;
}

/** Checks ∂₁ · ∂₂ = 0 on the matrices themselves (used by tests as an independent control). */
export function boundarySquaredIsZero(complex: CellComplex): boolean {
  const d1 = boundary1(complex);
  const d2 = boundary2(complex);
  for (let v = 0; v < complex.vertices.length; v++) {
    for (let f = 0; f < complex.faces.length; f++) {
      let sum = 0;
      for (let e = 0; e < complex.edges.length; e++) sum += d1[v][e] * d2[e][f];
      if (sum !== 0) return false;
    }
  }
  return true;
}
