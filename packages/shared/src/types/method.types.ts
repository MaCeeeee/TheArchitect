// ─── Method catalog (UC-METH-001) ───
// A method is a formula from the four Formelbücher, addressable by a stable ID.

export type MethodBook = 'process' | 'data_application' | 'organisation' | 'governance';

/** Rung of the ladder to cohomology (0–5) on which a method becomes computable in principle. */
export type LadderRungIndex = 0 | 1 | 2 | 3 | 4 | 5;

export type MethodInput =
  | { kind: 'elements'; types: string[]; min: number; label: string }
  | { kind: 'relationships'; types?: string[]; min: number; label: string }
  | { kind: 'field'; field: string; min: number; label: string }
  | { kind: 'translations'; min: number; label: string };

export interface MethodDefinition {
  /** Stable, never renamed. Book prefix (PA/DA/OE/GC) + HTML anchor of the Formelbuch. */
  id: string;
  book: MethodBook;
  /** Number of the formula inside its Formelbuch. */
  bookNumber: number;
  name: string;
  question: string;
  formula: string;
  inputs: MethodInput[];
  limits: string;
  rung: LadderRungIndex;
  /** Where the product computes it today. */
  computedBy: 'ladder' | 'cost_engine' | 'none';
}

export interface MethodRef {
  id: string;
  name: string;
  question: string;
  formula: string;
  limits: string;
}

export interface MethodInputCheck {
  label: string;
  required: number;
  available: number;
  satisfied: boolean;
}

export type MethodApplicabilityStatus = 'computable' | 'missing_input';

export interface MethodApplicability {
  methodId: string;
  name: string;
  rung: LadderRungIndex;
  status: MethodApplicabilityStatus;
  computedBy: MethodDefinition['computedBy'];
  checks: MethodInputCheck[];
  /** Label of the single missing input, if exactly one is missing; otherwise null. */
  oneInputAway: string | null;
}

/** Counts read from the model; input to the pure applicability check. */
export interface ModelFacts {
  elementTypeCounts: Record<string, number>;
  relationshipTypeCounts: Record<string, number>;
  fieldCounts: Record<string, number>;
  translationCount: number;
}
