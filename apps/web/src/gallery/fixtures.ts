// Seeded, deterministic fixture generators for the chart gallery. They produce
// the boundary / representative datasets that bugs cluster around (values at
// 0%/100%, tiny n, ties, extreme splits, flat curves) so the gallery and the
// invariant tests can stress the charts without the real app.
import { normalizeVariableModel } from "@nudagitty/core";
import type { DoseResponseCurves, OverlapDiagnostic, SimulatedNodeState, SurvivalCurvePoint, VariableModel } from "@nudagitty/core";
import type { ScatterPoint } from "../charts/CategoryOutcomePlot";
import type { ScatterRegression } from "../charts/ScatterChart";
import type { HuhShift, WhatIfStrategySurvivalSummary, WhatIfSurvivalSummary } from "../outputs/modules/types";
import type { BasicComparisonLedgerRow } from "../app/types";

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

function ppLabel(value: number): string {
  const pp = value * 100;
  return `${pp >= 0 ? "+" : "−"}${Math.abs(pp).toFixed(1)}pp`;
}

// A HuhShiftPlot dataset: the observed (crude) contrast vs the causal (adjusted) contrast, each a
// point + 95% interval on a signed axis. `spread` half-widens the intervals to exercise wide CIs.
export function huhShift(observedNumeric: number, causalNumeric: number, opts: { spread?: number; title?: string } = {}): HuhShift {
  const { spread = 0.03, title = "Observed vs causal contrast" } = opts;
  return {
    title,
    axisLabel: "risk difference (pp)",
    caption: "Observed [[Mortality]] gap by [[Obesity]], and the causal contrast after adjustment.",
    observed: { label: "observed", sublabel: "crude", value: ppLabel(observedNumeric), numeric: observedNumeric, lower: observedNumeric - spread, upper: observedNumeric + spread },
    causal: { label: "causal", sublabel: "adjusted", value: ppLabel(causalNumeric), numeric: causalNumeric, lower: causalNumeric - spread, upper: causalNumeric + spread }
  };
}

// A BasicComparisonLedgerPlot dataset: several same-contrast estimates (raw / adjusted / dgp …)
// plotted as dots on one signed axis. Each tuple is [label, numericValue (proportion), status].
export function ledgerRows(rows: Array<[string, number, BasicComparisonLedgerRow["status"]]>): BasicComparisonLedgerRow[] {
  return rows.map(([label, numericValue, status], index) => ({
    id: `row-${index}`,
    label,
    sample: "n=1,000",
    adjustment: status === "raw" ? "none" : "Obesity",
    method: status === "dgp" ? "do()" : "IPW",
    status,
    metric: { label, value: ppLabel(numericValue), detail: "", numericValue }
  }));
}

function summarizeSamples(samples: number[]): { mean: number; variance: number; min: number; max: number } {
  const n = samples.length;
  const mean = samples.reduce((sum, value) => sum + value, 0) / Math.max(1, n);
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, n - 1);
  return { mean, variance, min: Math.min(...samples), max: Math.max(...samples) };
}

// A minimal-but-valid continuous SimulatedNodeState (empirical samples + an analytic overlay) for the
// node distribution mini-plot. `shape` picks the boundary: a clean normal, a right-skewed lognormal,
// or a near-degenerate (tiny-spread) column.
export function continuousNodeState(shape: "normal" | "skewed" | "degenerate", seed = 7): SimulatedNodeState {
  const rng = mulberry32(seed);
  let samples: number[];
  let analytic: SimulatedNodeState["analytic"];
  if (shape === "skewed") {
    samples = Array.from({ length: 180 }, () => Math.exp(gaussian(rng, 3, 0.5)));
    analytic = { distribution: { kind: "lognormal", meanLog: 3, sdLog: 0.5 }, mean: Math.exp(3.125), variance: null, note: "root lognormal" };
  } else if (shape === "degenerate") {
    samples = Array.from({ length: 180 }, () => gaussian(rng, 50, 0.15));
    analytic = { distribution: { kind: "normal", mean: 50, sd: 0.15 }, mean: 50, variance: 0.0225, note: "near-constant" };
  } else {
    samples = Array.from({ length: 180 }, () => gaussian(rng, 50, 10));
    analytic = { distribution: { kind: "normal", mean: 50, sd: 10 }, mean: 50, variance: 100, note: "root normal" };
  }
  const summary = summarizeSamples(samples);
  return {
    kind: "distribution",
    value: summary.mean,
    observed: null,
    analytic,
    empirical: { samples, weights: [], mean: summary.mean, variance: summary.variance, min: summary.min, max: summary.max, effectiveSampleSize: samples.length }
  };
}

// A binary SimulatedNodeState with P(1)=p, for the binary node distribution mini-plot.
export function binaryNodeState(p: number, seed = 7): SimulatedNodeState {
  const rng = mulberry32(seed);
  const samples: number[] = Array.from({ length: 180 }, () => (rng() < p ? 1 : 0));
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return {
    kind: "distribution",
    value: mean,
    observed: null,
    analytic: { distribution: { kind: "bernoulli", p }, mean: p, variance: p * (1 - p), note: "root bernoulli" },
    empirical: { samples, weights: [], mean, variance: mean * (1 - mean), min: 0, max: 1, effectiveSampleSize: samples.length }
  };
}

export const CONTINUOUS_VARIABLE: VariableModel = normalizeVariableModel({ valueType: "continuous" });

// A fabricated overlap / positivity diagnostic: per-arm propensity scores plus the derived control
// ESS, min propensity, max IP weight and common-support share. "good" = broad, overlapping arms;
// "violation" = a control pile near 0 the treated never reach (positivity breaks).
export function overlapDiagnostic(kind: "good" | "violation", seed = 7): OverlapDiagnostic {
  const rng = mulberry32(seed);
  const clampP = (p: number) => Math.min(1 - 1e-3, Math.max(1e-3, p));
  const draw = (n: number, mean: number, sd: number) => Array.from({ length: n }, () => clampP(gaussian(rng, mean, sd)));
  const controlPropensities = kind === "good" ? draw(260, 0.42, 0.18) : draw(320, 0.08, 0.06);
  const treatedPropensities = kind === "good" ? draw(240, 0.6, 0.18) : draw(180, 0.9, 0.08);
  const controlWeights = controlPropensities.map((p) => p / (1 - p));
  const sumW = controlWeights.reduce((sum, w) => sum + w, 0);
  const sumW2 = controlWeights.reduce((sum, w) => sum + w * w, 0);
  const controlEffectiveSampleSize = sumW2 > 0 ? (sumW * sumW) / sumW2 : 0;
  const all = [...controlPropensities, ...treatedPropensities];
  const inBand = all.filter((p) => p >= 0.1 && p <= 0.9).length;
  return {
    treatment: "Treatment",
    treatedPropensities,
    controlPropensities,
    controlSampleSize: controlPropensities.length,
    controlEffectiveSampleSize,
    minPropensity: Math.min(...all),
    maxControlWeight: Math.max(...controlWeights),
    commonSupportShare: inBand / all.length,
    propensityModel: "bin-based propensity model"
  };
}

// One Kaplan-Meier-style strategy arm: survival declines by a per-interval hazard, with a Greenwood
// 95% band that widens as the at-risk set shrinks.
function survivalStrategy(strategyId: string, label: string, hazard: number, opts: { n?: number; intervals?: number } = {}): WhatIfStrategySurvivalSummary {
  const { n = 1000, intervals = 6 } = opts;
  let atRisk = n;
  let survival = 1;
  let greenwood = 0;
  let totalEvents = 0;
  let totalCensored = 0;
  const points: SurvivalCurvePoint[] = [];
  for (let interval = 0; interval < intervals; interval += 1) {
    const events = Math.round(atRisk * hazard);
    const censored = Math.round(atRisk * 0.02);
    const h = atRisk > 0 ? events / atRisk : 0;
    survival *= 1 - h;
    if (atRisk > events && events > 0) greenwood += events / (atRisk * (atRisk - events));
    const se = survival * Math.sqrt(greenwood);
    points.push({
      interval,
      label: `t${interval + 1}`,
      atRisk,
      events,
      censored,
      hazard: h,
      survival,
      risk: 1 - survival,
      survivalLo: Math.max(0, survival - 1.96 * se),
      survivalHi: Math.min(1, survival + 1.96 * se)
    });
    totalEvents += events;
    totalCensored += censored;
    atRisk = Math.max(0, atRisk - events - censored);
  }
  const last = points[points.length - 1]!;
  return { strategyId, label, points, finalRisk: last.risk, finalSurvival: last.survival, totalEvents, totalCensored, sampleSize: n, effectiveSampleSize: n };
}

// A fabricated survival what-if summary with two strategy arms (treat/no-treat). `separation` sets how
// different the arms' hazards are: "strong" = clearly separated curves, "null" = overlapping curves.
export function whatIfSurvival(separation: "strong" | "null"): WhatIfSurvivalSummary {
  const treatedHazard = separation === "strong" ? 0.06 : 0.11;
  const controlHazard = separation === "strong" ? 0.16 : 0.12;
  const treated = survivalStrategy("treat", "always treat", treatedHazard);
  const control = survivalStrategy("control", "never treat", controlHazard);
  return {
    label: "Survival by strategy",
    strategies: [treated, control],
    natural: survivalStrategy("natural", "natural course", (treatedHazard + controlHazard) / 2),
    riskDifference: treated.finalRisk !== null && control.finalRisk !== null ? treated.finalRisk - control.finalRisk : null,
    survivalDifference: treated.finalSurvival !== null && control.finalSurvival !== null ? treated.finalSurvival - control.finalSurvival : null,
    curvesByMethod: {}
  };
}
