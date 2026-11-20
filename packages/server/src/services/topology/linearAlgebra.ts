/**
 * Exact rank of an integer matrix over ℚ (fraction-free Bareiss elimination on BigInt).
 * No floating point: a rank is a yes/no fact about linear dependence and must not
 * depend on a tolerance.
 */
export function rankOverQ(matrix: number[][]): number {
  const rows = matrix.length;
  if (rows === 0) return 0;
  const cols = matrix[0].length;
  const a = matrix.map((r) =>
    r.map((v) => {
      if (!Number.isInteger(v)) throw new Error(`rankOverQ needs integer entries, got ${v}`);
      return BigInt(v);
    }),
  );
  let rank = 0;
  let previousPivot = 1n;
  for (let col = 0; col < cols && rank < rows; col++) {
    let pivotRow = -1;
    for (let r = rank; r < rows; r++) {
      if (a[r][col] !== 0n) {
        pivotRow = r;
        break;
      }
    }
    if (pivotRow === -1) continue;
    [a[rank], a[pivotRow]] = [a[pivotRow], a[rank]];
    const pivot = a[rank][col];
    for (let r = rank + 1; r < rows; r++) {
      for (let c = col + 1; c < cols; c++) {
        a[r][c] = (a[r][c] * pivot - a[r][col] * a[rank][c]) / previousPivot;
      }
      a[r][col] = 0n;
    }
    previousPivot = pivot;
    rank++;
  }
  return rank;
}
