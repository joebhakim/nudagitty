import { normalizeVariableModel } from "./graph";
import { runSimulation } from "./simulation";
import type { GraphModel, SimulationResult, SimulationSpec } from "./types";

// ---------------------------------------------------------------------------
// Multi-arm causal-effect comparison for a CATEGORICAL (unordered) exposure.
//
// A categorical treatment has no dose axis, so the estimand is not a slope but a
// PER-LEVEL set E[Y | do(X = k)] for k = 0 … K−1, summarized as contrasts against a
// reference level. Three estimators, mirroring the binary/continuous panels:
//
//   crude          observed mean of Y within each level (biased by confounding)
//   g-computation  OLS of Y on one-hot(level) + covariates, covariate-standardized
//   oracle         re-simulate forcing X = k (the truth)
//
// (Multinomial-propensity IPW / AIPW are a follow-up — a categorical exposure at
// least now gets an adjusted per-level output instead of only the grouped scatter.)
// ---------------------------------------------------------------------------

export interface CategoricalLevelEstimate {
  level: number;
  label: string;
  n: number;
  /** Observed mean of Y at X = level. */
  crude: number;
  /** g-computation E[Y | do(X = level)]. */
  adjusted: number;
  /** Re-simulated truth E[Y | do(X = level)]. */
  oracle: number;
}

export interface CategoricalEffectComparison {
  xId: string;
  yId: string;
  reference: number;
  levels: CategoricalLevelEstimate[];
  covariates: string[];
  yUnit: string;
}

function orderedNumericOutcome(graph: GraphModel, id: string): boolean {
  const node = graph.nodes.find((candidate) => candidate.id === id);
  if (!node) return false;
  const kind = normalizeVariableModel(node.variable).valueType;
  return kind === "continuous" || kind === "count" || kind === "ordinal" || kind === "positive" || kind === "proportion" || kind === "binary";
}

function adjustmentCovariates(graph: GraphModel, xId: string, yId: string): string[] {
  const eligible = (id: string): boolean => {
    if (id === xId || id === yId) return false;
    const node = graph.nodes.find((candidate) => candidate.id === id);
    return node !== undefined && !node.roles.latent;
  };
  const marked = graph.nodes.filter((node) => node.roles.adjusted && eligible(node.id)).map((node) => node.id);
  if (marked.length > 0) return marked;
  const parents = graph.edges
    .filter((edge) => edge.kind === "directed" && edge.target === xId)
    .map((edge) => edge.source);
  return [...new Set(parents)].filter(eligible);
}

// --- small local linear-algebra helpers (kept in step with continuousEffect.ts) ---
function solveLinearSystem(matrix: number[][], rhs: number[]): number[] | null {
  const n = matrix.length;
  const m = matrix.map((row, i) => [...row, rhs[i]!]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const diag = m[col]![col]!;
    if (Math.abs(diag) < 1e-12) return null;
    for (let j = col; j <= n; j += 1) m[col]![j]! /= diag;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = m[r]![col]!;
      for (let j = col; j <= n; j += 1) m[r]![j]! -= factor * m[col]![j]!;
    }
  }
  return m.map((row) => row[n]!);
}

function weightedLeastSquares(design: number[][], y: number[], weights: number[]): number[] | null {
  const p = design[0]?.length ?? 0;
  if (p === 0) return null;
  const xtwx = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const xtwy = new Array<number>(p).fill(0);
  for (let i = 0; i < design.length; i += 1) {
    const row = design[i]!;
    const w = weights[i] ?? 1;
    const yi = y[i]!;
    for (let a = 0; a < p; a += 1) {
      xtwy[a]! += w * row[a]! * yi;
      for (let b = 0; b < p; b += 1) xtwx[a]![b]! += w * row[a]! * row[b]!;
    }
  }
  for (let a = 0; a < p; a += 1) xtwx[a]![a]! += 1e-8;
  return solveLinearSystem(xtwx, xtwy);
}

function weightedMean(values: number[], weights: number[]): number {
  let sw = 0;
  let acc = 0;
  for (let i = 0; i < values.length; i += 1) {
    const w = weights[i] ?? 1;
    sw += w;
    acc += w * values[i]!;
  }
  return acc / Math.max(1e-9, sw);
}

/**
 * Per-level causal-effect comparison for a categorical exposure, or null when the
 * pairing is not a categorical exposure with an ordered-numeric outcome.
 */
export function analyzeCategoricalEffect(
  graph: GraphModel,
  spec: SimulationSpec,
  baseResult: SimulationResult,
  pair: { x: string; y: string }
): CategoricalEffectComparison | null {
  const xNode = graph.nodes.find((node) => node.id === pair.x);
  const yNode = graph.nodes.find((node) => node.id === pair.y);
  if (!xNode || !yNode || !xNode.roles.exposure) return null;
  const xVar = normalizeVariableModel(xNode.variable);
  if (xVar.valueType !== "categorical") return null;
  if (!orderedNumericOutcome(graph, pair.y)) return null;

  const xSamples = baseResult.nodeStates[pair.x]?.empirical.samples ?? [];
  const ySamples = baseResult.nodeStates[pair.y]?.empirical.samples ?? [];
  const baseWeights = baseResult.nodeStates[pair.x]?.empirical.weights ?? [];
  const covariates = adjustmentCovariates(graph, pair.x, pair.y);

  const n0 = Math.min(xSamples.length, ySamples.length);
  const levelsSeen = new Set<number>();
  const xs: number[] = [];
  const ys: number[] = [];
  const cs: number[][] = [];
  const ws: number[] = [];
  for (let i = 0; i < n0; i += 1) {
    const x = xSamples[i]!;
    const y = ySamples[i]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const cov = covariates.map((id) => baseResult.nodeStates[id]?.empirical.samples[i] ?? NaN);
    if (cov.some((v) => !Number.isFinite(v))) continue;
    const level = Math.round(x);
    levelsSeen.add(level);
    xs.push(level); ys.push(y); cs.push(cov); ws.push(baseWeights[i] ?? 1);
  }
  const K = Math.max(2, Math.floor(xVar.responseFamily.levels) || xVar.categories.length || (Math.max(...levelsSeen) + 1));
  if (xs.length < 24 || levelsSeen.size < 2) return null;

  const covMeans = covariates.map((_, j) => weightedMean(cs.map((row) => row[j]!), ws));

  // g-computation model: Y ~ 1 + dummy_1..dummy_{K-1} + covariates (reference = level 0).
  const design = xs.map((level, i) => {
    const dummies = Array.from({ length: K - 1 }, (_, k) => (level === k + 1 ? 1 : 0));
    return [1, ...dummies, ...cs[i]!];
  });
  const beta = weightedLeastSquares(design, ys, ws);
  const covPart = beta ? covMeans.reduce((sum, cm, j) => sum + beta[K + j]! * cm, 0) : 0;

  const levels: CategoricalLevelEstimate[] = [];
  for (let k = 0; k < K; k += 1) {
    const rowsAtK = xs.map((level, i) => ({ level, y: ys[i]!, w: ws[i]! })).filter((row) => row.level === k);
    const wsum = rowsAtK.reduce((sum, row) => sum + row.w, 0);
    const crude = wsum > 0 ? rowsAtK.reduce((sum, row) => sum + row.w * row.y, 0) / wsum : NaN;
    // Linear g-comp ⇒ standardize = intercept + level dummy + covariate-mean part.
    const adjusted = beta ? beta[0]! + (k === 0 ? 0 : beta[k]!) + covPart : crude;
    const oracleResult = runSimulation(graph, { ...spec, overrides: { ...spec.overrides, [pair.x]: k }, selections: {} });
    const oracle = oracleResult.nodeStates[pair.y]?.empirical.mean ?? NaN;
    levels.push({
      level: k,
      label: xVar.categories[k] ?? `level ${k}`,
      n: rowsAtK.length,
      crude,
      adjusted,
      oracle
    });
  }

  return {
    xId: pair.x,
    yId: pair.y,
    reference: 0,
    levels,
    covariates,
    yUnit: normalizeVariableModel(yNode.variable).unit
  };
}
