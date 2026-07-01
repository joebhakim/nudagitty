// Canonical weighted first/second-moment helpers and the effective sample size.
//
// `effectiveSampleSize` is the defensive variant: it returns null on degenerate
// weights (Σw ≤ 0 or Σw² ≤ 0). Call sites that need the historical 0-on-degenerate
// number can use `effectiveSampleSize(w) ?? 0` — identical for non-negative weights.

/** Kish effective sample size (Σw)² / Σw². Null when the weights are degenerate. */
export function effectiveSampleSize(weights: number[]): number | null {
  const sum = weights.reduce((total, weight) => total + weight, 0);
  const sumSquares = weights.reduce((total, weight) => total + weight * weight, 0);
  if (sum <= 0 || sumSquares <= 0) return null;
  return (sum * sum) / sumSquares;
}

/** Weighted mean Σ(vᵢ·wᵢ) / Σwᵢ. Null when Σw ≤ 0. */
export function weightedMean(values: number[], weights: number[]): number | null {
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < values.length; i += 1) {
    const w = weights[i] ?? 0;
    numerator += (values[i] ?? 0) * w;
    denominator += w;
  }
  return denominator > 0 ? numerator / denominator : null;
}

/** Pool point estimates by weight: Σ(valueᵢ·weightᵢ) / Σweightᵢ. Null when Σw ≤ 0. */
export function weightedAverageOfEstimates(estimates: Array<{ value: number; weight: number }>): number | null {
  const denominator = estimates.reduce((sum, estimate) => sum + estimate.weight, 0);
  if (denominator <= 0) return null;
  return estimates.reduce((sum, estimate) => sum + estimate.value * estimate.weight, 0) / denominator;
}

/** Weighted proportion of values at or above `threshold`. Null when Σw ≤ 0. */
export function weightedBinaryProportion(values: number[], weights: number[], threshold = 0.5): number | null {
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < values.length; i += 1) {
    const w = weights[i] ?? 0;
    denominator += w;
    if ((values[i] ?? 0) >= threshold) numerator += w;
  }
  return denominator > 0 ? numerator / denominator : null;
}

export interface WeightedMomentOptions {
  /** Divide the weighted sum of squares by Σw ('n', biased) or Σw − 1 ('n-1'). */
  varianceDivisor?: "n" | "n-1";
}

/** Weighted variance about `mean` (computed if omitted). Default divisor 'n-1'. */
export function weightedVariance(values: number[], weights: number[], mean?: number, options: WeightedMomentOptions = {}): number | null {
  let sumWeight = 0;
  for (let i = 0; i < weights.length; i += 1) sumWeight += weights[i] ?? 0;
  if (sumWeight <= 0) return null;
  const center = mean ?? weightedMean(values, weights);
  if (center === null) return null;
  let sumWeighted = 0;
  for (let i = 0; i < values.length; i += 1) sumWeighted += (weights[i] ?? 0) * ((values[i] ?? 0) - center) ** 2;
  const divisor = (options.varianceDivisor ?? "n-1") === "n" ? sumWeight : sumWeight - 1;
  return divisor > 0 ? sumWeighted / divisor : null;
}

/** Weighted mean, variance (default 'n' divisor, matching the plotting helper) and
 *  effective sample size in one pass. */
export function weightedMoments(values: number[], weights: number[], options: WeightedMomentOptions = {}): { mean: number | null; variance: number | null; nEff: number | null } {
  let sumWeight = 0;
  let sumWeightSquared = 0;
  let sumWeightedValue = 0;
  for (let i = 0; i < values.length; i += 1) {
    const w = weights[i] ?? 0;
    sumWeight += w;
    sumWeightSquared += w * w;
    sumWeightedValue += w * (values[i] ?? 0);
  }
  if (sumWeight <= 0) return { mean: null, variance: null, nEff: null };
  const mean = sumWeightedValue / sumWeight;
  let sumWeightedSquares = 0;
  for (let i = 0; i < values.length; i += 1) sumWeightedSquares += (weights[i] ?? 0) * ((values[i] ?? 0) - mean) ** 2;
  const divisor = (options.varianceDivisor ?? "n") === "n" ? sumWeight : sumWeight - 1;
  return {
    mean,
    variance: divisor > 0 ? sumWeightedSquares / divisor : null,
    nEff: sumWeightSquared > 0 ? (sumWeight * sumWeight) / sumWeightSquared : null
  };
}
