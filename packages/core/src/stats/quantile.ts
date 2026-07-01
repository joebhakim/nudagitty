// Canonical quantile helpers.
//
// Two order-statistic conventions live here:
//   - 'nearest-rank' (default): index = floor((n-1)·p)   — the general `quantile`.
//   - 'lower'                 : index = floor(p·n)        — used by `quantileEdges`
//     when cutting equal-frequency bins.

export interface QuantileOptions {
  /** Order-statistic convention. Default 'nearest-rank'. */
  interpolation?: "lower" | "nearest-rank";
  /** Skip the Number.isFinite filter when the caller already sorted/cleaned the
   *  input. Default false. */
  prefiltered?: boolean;
}

/** p-quantile (p in [0, 1]) of `values`, by nearest-rank order statistics. */
export function quantile(values: number[], p: number, options: QuantileOptions = {}): number {
  const sorted = (options.prefiltered ? [...values] : values.filter(Number.isFinite)).sort((a, b) => a - b);
  const n = sorted.length;
  if ((options.interpolation ?? "nearest-rank") === "lower") {
    return sorted[Math.min(n - 1, Math.floor(p * n))] ?? 0;
  }
  return sorted[Math.min(n - 1, Math.max(0, Math.floor((n - 1) * p)))] ?? 0;
}

/** Interior bin edges that split `values` into `bins` equal-frequency groups.
 *  Uses the 'lower' order statistic (index = floor((i/bins)·length)). */
export function quantileEdges(values: number[], bins: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const edges: number[] = [];
  for (let i = 1; i < bins; i += 1) {
    const index = Math.min(sorted.length - 1, Math.floor((i / bins) * sorted.length));
    edges.push(sorted[index] ?? 0);
  }
  return edges;
}
