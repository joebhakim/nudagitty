// Canonical clamping / probability-bound / binary-coercion helpers.
//
// These consolidate the several copies that had accumulated across the engine
// (clamp01 in interpreter/graph, clampProbability in simulation math, coerceBinary
// in interpreter). Behaviour is byte-identical to those originals.

/** Constrain `value` to the closed interval [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Like `clamp`, but a non-finite `value` collapses to 0 before clamping. This is
 *  the guarded variant the web charting layer relies on (NaN/±Infinity → 0 rather
 *  than propagating through Math.min/max). */
export function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

/** Constrain `value` to [0, 1]. Equivalent to `clamp(value, 0, 1)`. */
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Nudge a probability off the {0, 1} boundary (symmetric 1e-15 epsilon) to keep
 *  downstream log / quantile math finite. */
export function clampProbability(probability: number): number {
  return Math.min(1 - 1e-15, Math.max(1e-15, probability));
}

/** Threshold a soft value to a hard 0/1 indicator at 0.5. */
export function coerceBinary(value: number): number {
  return value >= 0.5 ? 1 : 0;
}
