import { normalizeVariableModel } from "./graph";
import { runSimulation } from "./simulation";
import type { GraphModel, SimulationResult, SimulationSpec } from "./types";

// ---------------------------------------------------------------------------
// Continuous dose-response curves for the scatter overlay.
//
// When the exposure on the x-axis is a continuous node we intervene on, the
// causal estimand is not a two-arm contrast but the whole DOSE-RESPONSE
// FUNCTION E[Y | do(X = x)] over the dose axis. This module produces three
// curves sharing that axis:
//
//   observed  (gray)  — the crude E[Y | X = x] you naively read off the data
//   oracle    (ochre) — E[Y | do(X = x)], by re-simulating the DGP forcing X=x
//   adjusted  (blue)  — a from-data g-computation that adjusts for confounders
//
// The gap between observed and oracle is the confounding bias; a valid
// adjustment set pulls the blue curve onto the ochre one. The adjusted curve
// carries an analytic confidence band that *widens where the dose is sparsely
// observed* — i.e. it doubles as the positivity / overlap cue.
// ---------------------------------------------------------------------------

export interface DoseResponseCurves {
  xId: string;
  yId: string;
  grid: number[];
  /** Crude linear fit E[Y|X=x] evaluated on the grid (gray). */
  observed: number[];
  /** Re-simulated truth E[Y|do(X=x)] (ochre). */
  oracle: number[];
  /** From-data regression-adjusted dose-response (blue), or null if no adjustment set. */
  adjusted: number[] | null;
  /** Lower / upper 95% band for the adjusted curve (sparse-dose regions widen). */
  adjustedLower: number[] | null;
  adjustedUpper: number[] | null;
  /** Adjustment set actually used (node ids). */
  covariates: string[];
  /** Polynomial degree of the dose term in the adjusted model (1 = straight, 2 = curved). */
  doseDegree: number;
}

export interface DoseResponseOptions {
  gridSize?: number;
  /** Polynomial degree for the dose term of the adjusted curve. */
  doseDegree?: number;
}

function isContinuous(graph: GraphModel, id: string): boolean {
  const node = graph.nodes.find((candidate) => candidate.id === id);
  return node !== undefined && normalizeVariableModel(node.variable).valueType !== "binary";
}

function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

// Observed (non-latent) nodes to adjust for: the user-marked adjustment set when
// present, otherwise the direct causes of the exposure (the backdoor parents in a
// canonical confounding triangle). Never the exposure, the outcome, or a latent.
function adjustmentCovariates(graph: GraphModel, xId: string, yId: string): string[] {
  const eligible = (id: string): boolean => {
    if (id === xId || id === yId) return false;
    const node = graph.nodes.find((candidate) => candidate.id === id);
    return node !== undefined && !node.roles.latent;
  };
  const marked = graph.nodes
    .filter((node) => node.roles.adjusted && eligible(node.id))
    .map((node) => node.id);
  if (marked.length > 0) return marked;
  const parents = graph.edges
    .filter((edge) => edge.kind === "directed" && edge.target === xId)
    .map((edge) => edge.source);
  return [...new Set(parents)].filter(eligible);
}

interface ColumnStats { mean: number; sd: number }

function columnStats(values: number[]): ColumnStats {
  const finite = values.filter((value) => Number.isFinite(value));
  const mean = finite.reduce((sum, value) => sum + value, 0) / Math.max(1, finite.length);
  const variance = finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, finite.length - 1);
  return { mean, sd: Math.sqrt(Math.max(1e-9, variance)) };
}

// Gauss-Jordan inverse of a small symmetric matrix; null if singular.
function invertMatrix(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  const m = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const diag = m[col]![col]!;
    if (Math.abs(diag) < 1e-12) return null;
    for (let j = 0; j < 2 * n; j += 1) m[col]![j]! /= diag;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = m[r]![col]!;
      for (let j = 0; j < 2 * n; j += 1) m[r]![j]! -= factor * m[col]![j]!;
    }
  }
  return m.map((row) => row.slice(n));
}

function matVec(matrix: number[][], vec: number[]): number[] {
  return matrix.map((row) => row.reduce((sum, value, j) => sum + value * (vec[j] ?? 0), 0));
}

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, value, i) => sum + value * (b[i] ?? 0), 0);
}

interface AdjustedFit {
  predict: (dose: number) => number;
  se: (dose: number) => number;
}

// Weighted OLS of Y on a polynomial dose term + linear (standardized) covariates.
// Because covariates are mean-centered, g-computation (averaging predictions over
// the empirical covariate distribution) collapses to "predict at the mean
// covariate", i.e. the intercept + dose terms — so the adjusted curve and its
// variance use a design vector with zeros in the covariate slots.
function fitAdjusted(
  rows: Array<Record<string, number>>,
  weights: number[],
  xId: string,
  yId: string,
  covariates: string[],
  doseDegree: number
): AdjustedFit | null {
  const xStats = columnStats(rows.map((row) => row[xId] ?? NaN));
  const covStats = covariates.map((id) => columnStats(rows.map((row) => row[id] ?? NaN)));
  const zDose = (value: number): number => (value - xStats.mean) / xStats.sd;
  const designForRow = (xValue: number, row: Record<string, number> | null): number[] => {
    const terms = [1];
    let power = 1;
    const z = zDose(xValue);
    for (let d = 1; d <= doseDegree; d += 1) { power *= z; terms.push(power); }
    covariates.forEach((id, index) => {
      const stats = covStats[index]!;
      const raw = row ? row[id] : undefined;
      const value = raw !== undefined && Number.isFinite(raw) ? raw : stats.mean;
      terms.push((value - stats.mean) / stats.sd);
    });
    return terms;
  };

  const used = rows
    .map((row, i) => ({ row, weight: weights[i] ?? 1, i }))
    .filter(({ row }) => Number.isFinite(row[xId]) && Number.isFinite(row[yId]));
  const p = 1 + doseDegree + covariates.length;
  if (used.length < p + 2) return null;

  const xtwx = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const xtwy = new Array<number>(p).fill(0);
  let sumW = 0;
  for (const { row, weight } of used) {
    const design = designForRow(row[xId]!, row);
    const y = row[yId]!;
    sumW += weight;
    for (let a = 0; a < p; a += 1) {
      xtwy[a]! += weight * design[a]! * y;
      for (let b = 0; b < p; b += 1) xtwx[a]![b]! += weight * design[a]! * design[b]!;
    }
  }
  for (let a = 0; a < p; a += 1) xtwx[a]![a]! += 1e-6;
  const inverse = invertMatrix(xtwx);
  if (!inverse) return null;
  const beta = matVec(inverse, xtwy);
  if (!beta.every((value) => Number.isFinite(value))) return null;

  let rss = 0;
  for (const { row, weight } of used) {
    const design = designForRow(row[xId]!, row);
    const residual = row[yId]! - dot(design, beta);
    rss += weight * residual * residual;
  }
  const sigma2 = rss / Math.max(1, sumW - p);
  // Design vector for the covariate-averaged prediction: covariate slots are 0
  // (standardized covariates are mean-centered).
  const meanDesign = (dose: number): number[] => {
    const terms = [1];
    let power = 1;
    const z = zDose(dose);
    for (let d = 1; d <= doseDegree; d += 1) { power *= z; terms.push(power); }
    for (let c = 0; c < covariates.length; c += 1) terms.push(0);
    return terms;
  };
  return {
    predict: (dose) => dot(meanDesign(dose), beta),
    se: (dose) => {
      const a = meanDesign(dose);
      return Math.sqrt(Math.max(0, sigma2 * dot(a, matVec(inverse, a))));
    }
  };
}

/**
 * Compute the three dose-response curves for a continuous-exposure scatter.
 * Returns null when the pairing is not a continuous exposure -> continuous
 * outcome (the caller then shows the ordinary crude scatter).
 *
 * `baseResult` is the already-computed simulation for the displayed pair (reused
 * for the cohort and the crude line); only the oracle curve re-runs the engine.
 */
export function computeDoseResponseCurves(
  graph: GraphModel,
  spec: SimulationSpec,
  baseResult: SimulationResult,
  pair: { x: string; y: string },
  options: DoseResponseOptions = {}
): DoseResponseCurves | null {
  const xNode = graph.nodes.find((node) => node.id === pair.x);
  const yNode = graph.nodes.find((node) => node.id === pair.y);
  if (!xNode || !yNode) return null;
  if (!xNode.roles.exposure) return null;
  if (!isContinuous(graph, pair.x) || !isContinuous(graph, pair.y)) return null;

  const xSamples = (baseResult.nodeStates[pair.x]?.empirical.samples ?? []).filter(Number.isFinite);
  if (xSamples.length < 16) return null;
  const sorted = [...xSamples].sort((a, b) => a - b);
  const lo = quantileSorted(sorted, 0.01);
  const hi = quantileSorted(sorted, 0.99);
  if (!(hi > lo)) return null;

  const gridSize = Math.max(5, options.gridSize ?? 13);
  const doseDegree = Math.max(1, Math.min(3, options.doseDegree ?? 1));
  const grid = Array.from({ length: gridSize }, (_, i) => lo + ((hi - lo) * i) / (gridSize - 1));

  // Crude observed line: weighted least-squares slope of Y on X over the cohort.
  const xWeights = baseResult.nodeStates[pair.x]?.empirical.weights ?? [];
  const ySamples = baseResult.nodeStates[pair.y]?.empirical.samples ?? [];
  let sumW = 0;
  let meanX = 0;
  let meanY = 0;
  const n = Math.min(xSamples.length, ySamples.length);
  for (let i = 0; i < n; i += 1) {
    const x = xSamples[i]!;
    const y = ySamples[i]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const w = xWeights[i] ?? 1;
    sumW += w;
    meanX += w * x;
    meanY += w * y;
  }
  meanX /= Math.max(1e-9, sumW);
  meanY /= Math.max(1e-9, sumW);
  let cov = 0;
  let varX = 0;
  for (let i = 0; i < n; i += 1) {
    const x = xSamples[i]!;
    const y = ySamples[i]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const w = xWeights[i] ?? 1;
    cov += w * (x - meanX) * (y - meanY);
    varX += w * (x - meanX) * (x - meanX);
  }
  const slope = varX <= Number.EPSILON ? 0 : cov / varX;
  const intercept = meanY - slope * meanX;
  const observed = grid.map((x) => intercept + slope * x);

  // Oracle: re-simulate forcing X to each grid dose (pure interventional — drop
  // any conditioning), read the outcome mean.
  const oracle = grid.map((dose) => {
    const result = runSimulation(graph, {
      ...spec,
      overrides: { ...spec.overrides, [pair.x]: dose },
      selections: {}
    });
    return result.nodeStates[pair.y]?.empirical.mean ?? NaN;
  });

  // Adjusted: from-data g-computation over the displayed cohort.
  const covariates = adjustmentCovariates(graph, pair.x, pair.y);
  let adjusted: number[] | null = null;
  let adjustedLower: number[] | null = null;
  let adjustedUpper: number[] | null = null;
  if (covariates.length > 0) {
    const rows: Array<Record<string, number>> = [];
    const weights: number[] = [];
    const ids = [pair.x, pair.y, ...covariates];
    for (let i = 0; i < n; i += 1) {
      const row: Record<string, number> = {};
      for (const id of ids) {
        const value = baseResult.nodeStates[id]?.empirical.samples[i];
        if (value !== undefined && Number.isFinite(value)) row[id] = value;
      }
      rows.push(row);
      weights.push(xWeights[i] ?? 1);
    }
    const fit = fitAdjusted(rows, weights, pair.x, pair.y, covariates, doseDegree);
    if (fit) {
      adjusted = grid.map((dose) => fit.predict(dose));
      adjustedLower = grid.map((dose) => fit.predict(dose) - 1.96 * fit.se(dose));
      adjustedUpper = grid.map((dose) => fit.predict(dose) + 1.96 * fit.se(dose));
    }
  }

  return {
    xId: pair.x,
    yId: pair.y,
    grid,
    observed,
    oracle,
    adjusted,
    adjustedLower,
    adjustedUpper,
    covariates,
    doseDegree
  };
}
