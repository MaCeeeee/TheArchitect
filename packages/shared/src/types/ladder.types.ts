// ─── Ladder to cohomology (UC-METH-001) ───
// Rungs: 0 identity · 1 directed graph · 2 cover · 3 coefficients · 4 gluing testable · 5 cohomology

import type { LadderRungIndex, MethodApplicability, MethodRef } from './method.types';

export type LadderRungStatus = 'reached' | 'open' | 'locked';

export interface LadderFact {
  label: string;
  value: number;
}

export interface LadderRung {
  index: LadderRungIndex;
  title: string;
  /** What this step is, in plain words (ASD-STE100). */
  provides: string;
  /** What this step provides mathematically; shown only on request. */
  math: string;
  status: LadderRungStatus;
  facts: LadderFact[];
  warnings: string[];
  /** What to do in the model to reach this step, in plain words (ASD-STE100); null when reached. */
  next: string | null;
}

export type CohomologyVerdict = 'exact' | 'local_defect' | 'global_obstruction';

export interface TranslationStep {
  relationshipId: string;
  fromContext: string;
  toContext: string;
  /** Declared factor of the relationship: 1 unit in its source = factor units in its target. */
  factor: number;
  /** forward = the loop follows the relationship as declared (multiply), reverse = against it (divide). */
  direction: 'forward' | 'reverse';
}

export interface TranslationLoopDefect {
  steps: TranslationStep[];
  /** Product of the factors around the loop; 1 would mean the loop closes. null: the product is outside the range a number can hold. */
  product: number | null;
}

export interface CanonicalScale {
  contextId: string;
  contextName: string;
  /** Scale of this context; within each connected group the smallest scale is 1. null: the scale is outside the range a number can hold. */
  factor: number | null;
  /** 1-based number of the connected group of contexts this scale belongs to; groups are numbered by their smallest context name. */
  component: number;
}

export interface CohomologyResult {
  quantity: string;
  verdict: CohomologyVerdict;
  contextCount: number;
  translationCount: number;
  independentLoops: number;
  faces: number;
  /**
   * dim H¹ of the complex: independent loops that no triple overlap fills. A global contradiction
   * lives there in exact arithmetic; within the tolerance it can also appear where dim H¹ = 0, when
   * several triple overlaps that each pass add up to a loop that does not.
   */
  h1Dimension: number;
  /**
   * Loops whose product is not 1 (class of the cochain in H¹ is not zero). The list is one basis of
   * the loops with a defect, picked by a spanning tree: one wrong factor can show up in several
   * loops, so its length is not a count of errors. Only the first loops of that basis are listed;
   * loopDefectCount is the size of the whole basis.
   */
  loopDefects: TranslationLoopDefect[];
  /** Number of loops with a defect in that basis, listed in loopDefects or not. */
  loopDefectCount: number;
  /** Triple overlaps on which the cocycle condition fails (δg ≠ 0). Only the first are listed; faceDefectCount counts all. */
  faceDefects: TranslationLoopDefect[];
  /** Number of triple overlaps with a defect, listed in faceDefects or not. */
  faceDefectCount: number;
  /** Only when verdict is 'exact': one consistent scale per context for this quantity. */
  canonicalScale: CanonicalScale[] | null;
}

export interface LadderReport {
  projectId: string;
  /** Highest rung reached with all rungs below it reached; null if rung 0 is open. */
  highestRung: LadderRungIndex | null;
  rungs: LadderRung[];
  cohomology: CohomologyResult[];
  /** Tolerance on the logarithm of a product around a loop: a product from exp(-tolerance) to exp(tolerance) counts as 1. */
  tolerance: number;
  cohomologyMethod: MethodRef;
  methods: MethodApplicability[];
  timestamp: string;
}
