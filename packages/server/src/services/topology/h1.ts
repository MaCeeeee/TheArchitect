/**
 * UC-METH-001, rung 5 — the class of a 1-cochain in H¹.
 *
 *   exact               g = δ⁰h for a potential h: every loop closes; a global model exists.
 *   local_defect        δ¹g ≠ 0 on a face: the cocycle condition already fails on a triple overlap.
 *   global_obstruction  δ¹g = 0 on every face (vacuously so if the complex has no faces), but g is
 *                       no coboundary: the non-zero class in H¹.
 *
 * The computation is the loop rule of Landkarte 7.7 — a potential along a spanning forest and
 * one check per remaining edge. Cohomology is the name of what it decides; what the framing
 * adds are the split into local and global and the potential h as a constructive answer.
 */
import type { AbelianGroup } from './abelianGroup';
import type { CellComplex, OrientedStep } from './cellComplex';
import { coboundary1, Cochain, valueOf } from './cochain';
import { fundamentalLoops, spanningForest } from './homology';

export type OneCochainVerdict = 'exact' | 'local_defect' | 'global_obstruction';

export interface LoopDefect<T> {
  loop: OrientedStep[];
  value: T;
}

export interface FaceDefect<T> {
  faceId: string;
  value: T;
}

export interface OneCochainClass<T> {
  verdict: OneCochainVerdict;
  isCocycle: boolean;
  isCoboundary: boolean;
  faceDefects: FaceDefect<T>[];
  loopDefects: LoopDefect<T>[];
  /** h with (δ⁰h)(e) = g(e) on every tree edge; if the verdict is 'exact', on every edge. */
  potential: Map<string, T>;
}

export function integrate<T>(group: AbelianGroup<T>, g: Cochain<T>, loop: OrientedStep[]): T {
  let sum = group.zero;
  for (const step of loop) {
    const value = valueOf(g, group, step.edgeId);
    sum = group.add(sum, step.sign === 1 ? value : group.neg(value));
  }
  return sum;
}

export function classifyOneCochain<T>(complex: CellComplex, group: AbelianGroup<T>, g: Cochain<T>): OneCochainClass<T> {
  const forest = spanningForest(complex);

  const potential = new Map<string, T>();
  for (const vertex of forest.order) {
    const link = forest.parent.get(vertex);
    if (!link) {
      potential.set(vertex, group.zero);
      continue;
    }
    const along = valueOf(g, group, link.edge.id);
    const fromParent = link.edge.source === link.vertex ? along : group.neg(along);
    potential.set(vertex, group.add(potential.get(link.vertex)!, fromParent));
  }

  const loopDefects: LoopDefect<T>[] = [];
  for (const loop of fundamentalLoops(complex, forest)) {
    const value = integrate(group, g, loop);
    if (!group.isZero(value)) loopDefects.push({ loop, value });
  }

  const faceDefects: FaceDefect<T>[] = [];
  for (const [faceId, value] of coboundary1(complex, group, g)) {
    if (!group.isZero(value)) faceDefects.push({ faceId, value });
  }

  const isCoboundary = loopDefects.length === 0;
  const isCocycle = faceDefects.length === 0;
  // A face defect always wins: with a tolerance, "no loop defect" does not strictly imply "no face defect".
  const verdict: OneCochainVerdict = !isCocycle ? 'local_defect' : isCoboundary ? 'exact' : 'global_obstruction';
  return { verdict, isCocycle, isCoboundary, faceDefects, loopDefects, potential };
}

/**
 * Baseline (ADR-0007 E8): the simple check a graph query would do — compare every triangle
 * of three edges. Finds loops of length 3 only.
 */
export function triangleBaseline<T>(complex: CellComplex, group: AbelianGroup<T>, g: Cochain<T>): OrientedStep[][] {
  const between = (a: string, b: string) =>
    complex.edges
      .filter((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a))
      .map((e): OrientedStep => ({ edgeId: e.id, sign: e.source === a ? 1 : -1 }));
  const found: OrientedStep[][] = [];
  const v = complex.vertices;
  for (let i = 0; i < v.length; i++) {
    for (let j = i + 1; j < v.length; j++) {
      for (let k = j + 1; k < v.length; k++) {
        for (const ab of between(v[i], v[j])) {
          for (const bc of between(v[j], v[k])) {
            for (const ca of between(v[k], v[i])) {
              const loop = [ab, bc, ca];
              if (!group.isZero(integrate(group, g, loop))) found.push(loop);
            }
          }
        }
      }
    }
  }
  return found;
}
