/**
 * UC-METH-001, rung 3 — coefficients. Cochains take their values in an abelian group:
 * associative, commutative, with a zero and an inverse for every value. Only then can
 * the coboundary operator δ be written down and kernels and images be computed.
 */
export interface AbelianGroup<T> {
  readonly name: string;
  readonly zero: T;
  add(a: T, b: T): T;
  neg(a: T): T;
  /** Equality with zero; for real numbers within the group's tolerance. */
  isZero(a: T): boolean;
}

/** ℤ — counts, version offsets. */
export const Integers: AbelianGroup<number> = {
  name: 'Z',
  zero: 0,
  add: (a, b) => a + b,
  neg: (a) => (a === 0 ? 0 : -a),
  isZero: (a) => a === 0,
};

/** ℤ/2 — flags: present or absent, flips or does not flip. */
export const Z2: AbelianGroup<number> = {
  name: 'Z/2',
  zero: 0,
  add: (a, b) => (a + b) % 2,
  neg: (a) => a,
  isZero: (a) => a === 0,
};

/** (ℝ, +) with a tolerance for the comparison with zero. */
export function reals(tolerance = 1e-9): AbelianGroup<number> {
  return {
    name: 'R',
    zero: 0,
    add: (a, b) => a + b,
    neg: (a) => (a === 0 ? 0 : -a),
    isZero: (a) => Math.abs(a) <= tolerance,
  };
}

/**
 * Positive factors (units, scales) form the abelian group (ℝ>0, ·). The logarithm is an
 * isomorphism onto (ℝ, +): products become sums, 1 becomes 0, 1/f becomes −log f.
 */
export function factorToAdditive(factor: number): number {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error(`A translation factor must be a positive finite number, got ${factor}`);
  }
  return Math.log(factor);
}

export function additiveToFactor(value: number): number {
  return Math.exp(value);
}
