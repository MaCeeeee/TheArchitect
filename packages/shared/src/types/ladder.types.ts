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
  /** What this rung provides mathematically. */
  provides: string;
  status: LadderRungStatus;
  facts: LadderFact[];
  warnings: string[];
  /** What to model to reach this rung; null when reached. */
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
  /** Product of the factors around the loop; 1 would mean the loop closes. */
  product: number;
}

export interface CanonicalScale {
  contextId: string;
  contextName: string;
  /** Scale of this context; within each connected group the smallest scale is 1. */
  factor: number;
  /** 1-based number of the connected group of contexts this scale belongs to. */
  component: number;
}

export interface CohomologyResult {
  quantity: string;
  verdict: CohomologyVerdict;
  contextCount: number;
  translationCount: number;
  independentLoops: number;
  faces: number;
  /** dim H¹ of the complex: independent loops that no triple overlap fills. Only there can a global contradiction live. */
  h1Dimension: number;
  /** Loops whose product is not 1 (class of the cochain in H¹ is not zero). */
  loopDefects: TranslationLoopDefect[];
  /** Triple overlaps on which the cocycle condition fails (δg ≠ 0). */
  faceDefects: TranslationLoopDefect[];
  /** Only when verdict is 'exact': one consistent scale per context for this quantity. */
  canonicalScale: CanonicalScale[] | null;
}

export interface LadderReport {
  projectId: string;
  /** Highest rung reached with all rungs below it reached; null if rung 0 is open. */
  highestRung: LadderRungIndex | null;
  rungs: LadderRung[];
  cohomology: CohomologyResult[];
  /** Relative tolerance used when a product around a loop is compared with 1. */
  tolerance: number;
  cohomologyMethod: MethodRef;
  methods: MethodApplicability[];
  timestamp: string;
}
