/**
 * UC-METH-001 — cochains and the coboundary operator δ.
 * A k-cochain assigns a group value to every k-cell. δ⁰ turns values on vertices into
 * differences on edges; δ¹ sums an edge cochain around every face. δ¹∘δ⁰ = 0 follows
 * from ∂₁∘∂₂ = 0 and is tested as a property, not assumed.
 */
import type { AbelianGroup } from './abelianGroup';
import type { CellComplex } from './cellComplex';

/** cell id → value; a missing entry is the group's zero. */
export type Cochain<T> = Map<string, T>;

export function valueOf<T>(cochain: Cochain<T>, group: AbelianGroup<T>, cellId: string): T {
  const value = cochain.get(cellId);
  return value === undefined ? group.zero : value;
}

/** (δ⁰f)(e) = f(target) − f(source) */
export function coboundary0<T>(complex: CellComplex, group: AbelianGroup<T>, f: Cochain<T>): Cochain<T> {
  const result: Cochain<T> = new Map();
  for (const edge of complex.edges) {
    result.set(edge.id, group.add(valueOf(f, group, edge.target), group.neg(valueOf(f, group, edge.source))));
  }
  return result;
}

/** (δ¹g)(face) = Σ sign · g(edge) around the boundary of the face */
export function coboundary1<T>(complex: CellComplex, group: AbelianGroup<T>, g: Cochain<T>): Cochain<T> {
  const result: Cochain<T> = new Map();
  for (const face of complex.faces) {
    let sum = group.zero;
    for (const step of face.boundary) {
      const value = valueOf(g, group, step.edgeId);
      sum = group.add(sum, step.sign === 1 ? value : group.neg(value));
    }
    result.set(face.id, sum);
  }
  return result;
}
