// Canonical Pearson correlation. Uses the sum-of-products form
// Σ dx·dy / sqrt(Σdx² · Σdy²), so the variance divisor (n vs n-1) cancels; a tiny
// EPSILON floor on the denominator keeps a zero-variance input finite.

/** Pearson correlation of `x` and `y` (paired up to the shorter length). */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const length = Math.min(x.length, y.length);
  if (length === 0) return 0;
  const xs = x.slice(0, length);
  const ys = y.slice(0, length);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / length;
  let numerator = 0;
  let xVariance = 0;
  let yVariance = 0;
  for (let index = 0; index < length; index += 1) {
    const dx = (xs[index] ?? 0) - meanX;
    const dy = (ys[index] ?? 0) - meanY;
    numerator += dx * dy;
    xVariance += dx * dx;
    yVariance += dy * dy;
  }
  return numerator / Math.sqrt(Math.max(Number.EPSILON, xVariance * yVariance));
}
