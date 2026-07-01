// Canonical chart-domain / interval helpers. These currently live only in the web
// UI; they are provided here so those call sites can migrate onto the shared lib.

import { clamp } from "./util";

/** "Nice" tick values across [min, max] near `target` count (1/2/5 × 10^n steps).
 *  Returns the round values that land inside the domain. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (!(max > min)) return [min];
  const rawStep = (max - min) / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let value = start; value <= max + step * 1e-6; value += step) {
    ticks.push(Math.abs(value) < step * 1e-6 ? 0 : Number(value.toFixed(10)));
  }
  return ticks;
}

export interface PaddedDomainOptions {
  /** Fraction of the range added on each side (default 0.08). */
  pad?: number;
  clampMin?: number;
  clampMax?: number;
}

/** Pad a data range by a fraction for headroom, optionally clamping the result. */
export function paddedDomain(min: number, max: number, options: PaddedDomainOptions = {}): [number, number] {
  const pad = options.pad ?? 0.08;
  if (!(max > min)) {
    const center = Number.isFinite(min) ? min : 0;
    return [center - 0.5, center + 0.5];
  }
  const amount = (max - min) * pad;
  let lo = min - amount;
  let hi = max + amount;
  if (options.clampMin !== undefined) lo = Math.max(lo, options.clampMin);
  if (options.clampMax !== undefined) hi = Math.min(hi, options.clampMax);
  return [lo, hi];
}

export interface WilsonIntervalOptions {
  /** Critical value for the confidence level (default 1.96, i.e. 95%). */
  z?: number;
}

/** Wilson score interval for a weighted binary proportion `mean` with effective
 *  sample size `nEff`. Clamped to [0, 1]. */
export function wilsonInterval(mean: number, nEff: number, options: WilsonIntervalOptions = {}): { lower: number; upper: number } {
  const z = options.z ?? 1.96;
  const denominator = 1 + (z * z) / nEff;
  const center = (mean + (z * z) / (2 * nEff)) / denominator;
  const halfWidth = (z * Math.sqrt((mean * (1 - mean) + (z * z) / (4 * nEff)) / nEff)) / denominator;
  return { lower: clamp(center - halfWidth, 0, 1), upper: clamp(center + halfWidth, 0, 1) };
}
