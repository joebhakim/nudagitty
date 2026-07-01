// Seeded, deterministic fixture generators for the chart gallery. They produce
// the boundary / representative datasets that bugs cluster around (values at
// 0%/100%, tiny n, ties, extreme splits, flat curves) so the gallery and the
// invariant tests can stress the charts without the real app.
import type { DoseResponseCurves } from "@nudagitty/core";
import type { ScatterPoint } from "../charts/CategoryOutcomePlot";
import type { ScatterRegression } from "../charts/ScatterChart";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number, mean: number, sd: number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Binary exposure (x∈{0,1}) × binary outcome (y∈{0,1}). */
export function binaryPoints(pX1: number, pY1GivenX0: number, pY1GivenX1: number, n = 220, seed = 7): ScatterPoint[] {
  const rng = mulberry32(seed);
  const out: ScatterPoint[] = [];
  for (let index = 0; index < n; index += 1) {
    const x = rng() < pX1 ? 1 : 0;
    const pY1 = x === 1 ? pY1GivenX1 : pY1GivenX0;
    out.push({ x, y: rng() < pY1 ? 1 : 0, weight: 1, index });
  }
  return out;
}

/** Binary exposure (x∈{0,1}) × continuous outcome (y). */
export function continuousPoints(meanX0: number, meanX1: number, sd: number, n = 220, seed = 7): ScatterPoint[] {
  const rng = mulberry32(seed);
  const out: ScatterPoint[] = [];
  for (let index = 0; index < n; index += 1) {
    const x = rng() < 0.5 ? 1 : 0;
    out.push({ x, y: gaussian(rng, x === 1 ? meanX1 : meanX0, sd), weight: 1, index });
  }
  return out;
}

/** Continuous exposure (x) × binary outcome, risk a function of x. */
export function riskPoints(xMin: number, xMax: number, risk: (x: number) => number, n = 600, seed = 7): ScatterPoint[] {
  const rng = mulberry32(seed);
  const out: ScatterPoint[] = [];
  for (let index = 0; index < n; index += 1) {
    const x = xMin + (xMax - xMin) * rng();
    const p = Math.min(1, Math.max(0, risk(x)));
    out.push({ x, y: rng() < p ? 1 : 0, weight: 1, index });
  }
  return out;
}

/** Continuous exposure (x) × continuous outcome (y): y = intercept + slope·x + Normal(0, sd). */
export function scatter2d(slope: number, sd: number, opts: { n?: number; intercept?: number; xMin?: number; xMax?: number; seed?: number } = {}): ScatterPoint[] {
  const { n = 200, intercept = 20, xMin = 0, xMax = 20, seed = 7 } = opts;
  const rng = mulberry32(seed);
  const out: ScatterPoint[] = [];
  for (let index = 0; index < n; index += 1) {
    const x = xMin + (xMax - xMin) * rng();
    out.push({ x, y: gaussian(rng, intercept + slope * x, sd), weight: 1, index });
  }
  return out;
}

// Sample domain (6% pad, degenerate-spread guard) + OLS regression endpoints — the same shape
// scatterStats.scatterDomain / scatterPairStats produce, so the gallery scatter matches the real
// panel's framing without any app state.
export function scatterFit(points: ScatterPoint[]): { xDomain: [number, number]; yDomain: [number, number]; regression: ScatterRegression | null } {
  const domain = (values: number[]): [number, number] => {
    const finite = values.filter(Number.isFinite);
    if (finite.length === 0) return [-1, 1];
    let min = Math.min(...finite);
    let max = Math.max(...finite);
    if (Math.abs(max - min) < 1e-6) { min -= 1; max += 1; }
    const pad = (max - min) * 0.06;
    return [min - pad, max + pad];
  };
  const xDomain = domain(points.map((point) => point.x));
  const yDomain = domain(points.map((point) => point.y));
  const n = points.length;
  if (n < 2) return { xDomain, yDomain, regression: null };
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / n;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / n;
  let covariance = 0;
  let varianceX = 0;
  for (const point of points) {
    covariance += (point.x - meanX) * (point.y - meanY);
    varianceX += (point.x - meanX) ** 2;
  }
  const slope = varianceX <= Number.EPSILON ? 0 : covariance / varianceX;
  const intercept = meanY - slope * meanX;
  return {
    xDomain,
    yDomain,
    regression: { x1: xDomain[0], y1: intercept + slope * xDomain[0], x2: xDomain[1], y2: intercept + slope * xDomain[1] }
  };
}

// A fabricated dose-response overlay (observed crude fit vs an attenuated re-simulated oracle vs a
// from-data adjusted curve with a band that widens at the sparsely-sampled edges) so the gallery can
// exercise ScatterChart's overlay path without the engine.
export function doseCurvesFixture(slope: number, opts: { intercept?: number; xMin?: number; xMax?: number; grid?: number } = {}): DoseResponseCurves {
  const { intercept = 20, xMin = 0, xMax = 20, grid: gridSize = 12 } = opts;
  const grid = Array.from({ length: gridSize }, (_, i) => xMin + (xMax - xMin) * (i / (gridSize - 1)));
  const observed = grid.map((x) => intercept + slope * x);
  const oracle = grid.map((x) => intercept + slope * 0.7 * x);
  const adjusted = grid.map((x) => intercept + slope * 0.78 * x);
  const spread = grid.map((_, i) => 1.5 + 3 * Math.abs(i - (gridSize - 1) / 2) / ((gridSize - 1) / 2));
  return {
    xId: "fall_height",
    yId: "Posttest",
    grid,
    observed,
    oracle,
    adjusted,
    adjustedLower: adjusted.map((v, i) => v - spread[i]!),
    adjustedUpper: adjusted.map((v, i) => v + spread[i]!),
    covariates: ["Obesity"],
    doseDegree: 1
  };
}
