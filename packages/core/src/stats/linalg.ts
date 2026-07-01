// Canonical dense linear-algebra helpers: dot product, Gaussian elimination with
// partial pivoting, the weighted normal-equations solver built on it, Cholesky
// decomposition, and a small linear predictor.

/** Dot product Σ aᵢ·bᵢ (missing entries treated as 0). */
export function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

export interface GaussianSolveOptions {
  /** Rows with a pivot magnitude below this are treated as singular (return null).
   *  Default 1e-12. */
  pivotTolerance?: number;
  /** Ridge added to the diagonal before elimination. Default 0 (no-op). */
  ridge?: number;
}

/** Solve `matrix · x = rhs` via Gaussian elimination with partial pivoting.
 *  Returns null if the system is singular within `pivotTolerance`. */
export function gaussianSolve(matrix: number[][], rhs: number[], options: GaussianSolveOptions = {}): number[] | null {
  const pivotTolerance = options.pivotTolerance ?? 1e-12;
  const ridge = options.ridge ?? 0;
  const n = matrix.length;
  const m = matrix.map((row, i) => [...row, rhs[i] ?? 0]);
  if (ridge) for (let i = 0; i < n; i += 1) m[i]![i]! += ridge;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const diag = m[col]![col]!;
    if (Math.abs(diag) < pivotTolerance) return null;
    for (let j = col; j <= n; j += 1) m[col]![j]! /= diag;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = m[r]![col]!;
      for (let j = col; j <= n; j += 1) m[r]![j]! -= factor * m[col]![j]!;
    }
  }
  return m.map((row) => row[n]!);
}

export interface NormalEquationsOptions {
  /** Ridge added to the X'WX diagonal before solving. Default 1e-6. */
  ridge?: number;
}

/** Weighted least squares via the normal equations: solve
 *  (X'WX + ridge·I) · β = X'Wy. Returns null if the system is singular. */
export function solveNormalEquations(design: number[][], response: number[], weights: number[], options: NormalEquationsOptions = {}): number[] | null {
  const ridge = options.ridge ?? 1e-6;
  const p = design[0]?.length ?? 0;
  if (p === 0) return null;
  const xtwx = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const xtwy = new Array<number>(p).fill(0);
  for (let i = 0; i < design.length; i += 1) {
    const xi = design[i]!;
    const wi = weights[i] ?? 1;
    for (let a = 0; a < p; a += 1) {
      xtwy[a]! += wi * xi[a]! * (response[i] ?? 0);
      for (let b = 0; b < p; b += 1) xtwx[a]![b]! += wi * xi[a]! * xi[b]!;
    }
  }
  for (let a = 0; a < p; a += 1) xtwx[a]![a]! += ridge;
  return gaussianSolve(xtwx, xtwy);
}

/** Cholesky factor L (lower triangular, A = LLᵀ). Returns null when a diagonal
 *  entry falls meaningfully below zero (matrix not positive semi-definite). */
export function choleskyDecomposition(matrix: number[][]): number[][] | null {
  const size = matrix.length;
  const lower = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      let sum = matrix[row]?.[column] ?? 0;
      for (let previous = 0; previous < column; previous += 1) {
        sum -= (lower[row]?.[previous] ?? 0) * (lower[column]?.[previous] ?? 0);
      }
      if (row === column) {
        if (sum < -1e-8) return null;
        lower[row]![column] = Math.sqrt(Math.max(0, sum));
      } else {
        const diagonal = lower[column]?.[column] ?? 0;
        lower[row]![column] = Math.abs(diagonal) <= 1e-10 ? 0 : sum / diagonal;
      }
    }
  }
  return lower;
}

/** Evaluate an intercept-plus-features linear predictor:
 *  beta[0] + Σ beta[i+1]·row[features[i]]. */
export function predictLinear(beta: number[], features: string[], row: Record<string, number>): number {
  return (beta[0] ?? 0) + features.reduce((sum, feature, index) => sum + (beta[index + 1] ?? 0) * (row[feature] ?? 0), 0);
}
