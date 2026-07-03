import { normalizeVariableModel } from "./graph";
import { runSimulation } from "./simulation";
import { quantileSorted } from "./stats";
import type { GraphModel, SimulationResult, SimulationSpec } from "./types";

// ---------------------------------------------------------------------------
// Family-general causal-effect comparison for a CONTINUOUS (ordered numeric)
// exposure — the dose-response analog of the binary g-methods panel.
//
// For a binary treatment the estimand is a two-arm contrast E[Y|do 1]−E[Y|do 0];
// for a continuous dose it is the whole function E[Y | do(X = x)]. Each estimator
// produces that function (a CURVE over a shared dose grid); the headline numbers
// are read off the curve at the p10 / p90 doses:
//
//   slope        = (Ŷ(p90) − Ŷ(p10)) / (p90 − p10)   — average causal effect per unit X
//   standardized = Ŷ(p90) − Ŷ(p10)                    — the effect over a realistic dose swing
//
// Five methods, mirroring the binary panel:
//   crude          OLS of Y on X (biased by confounding)
//   g-computation  OLS of Y on X + covariates, covariate-standardized  (outcome model)
//   gps-ipw        stabilized generalized-propensity weights, weighted Y~X  (treatment model)
//   aipw           doubly-robust: g-comp slope + IP-weighted residual augmentation
//   oracle         re-simulate the DGP forcing X = x  (the truth)
//
// For a linear-Gaussian confounding triangle g-computation / gps-ipw / aipw all
// recover the oracle slope while crude is biased — the "every valid method agrees
// on the truth" payoff, now for continuous exposures.
// ---------------------------------------------------------------------------

export type EffectMethodId = "crude" | "g-computation" | "gps-ipw" | "aipw" | "oracle";

export interface EffectMethodEstimate {
  id: EffectMethodId;
  label: string;
  /** ΔŶ per unit of X, read at [p10, p90]. */
  slope: number;
  /** Ŷ(p90) − Ŷ(p10): the effect of a p10→p90 dose swing on the outcome scale. */
  standardized: number;
  /** The estimated E[Y|do(X=x)] over the shared grid, for the overlay. */
  curve: number[];
  /** Stabilized-weight effective sample size fraction (IPW/AIPW only), else null. */
  ess: number | null;
  /** Whether the estimator uses the covariates (crude = false). */
  adjusted: boolean;
}

// Generalized-propensity overlap: continuous-treatment positivity. The stabilized
// weights f(X)/f(X|C) blow up where a dose is implausible given the covariates, so
// weight concentration (low ESS, a big max weight) is the positivity strain signal.
export interface GpsOverlap {
  model: string;
  essFraction: number;
  maxWeight: number;
  /** Share of units whose stabilized weight stays within 20× the median (heavy-tail cue). */
  commonSupportShare: number;
  weights: number[];
}

export interface ContinuousEffectComparison {
  xId: string;
  yId: string;
  grid: number[];
  /** p10 / p90 doses the standardized contrast is read at. */
  loHiDose: [number, number];
  covariates: string[];
  methods: EffectMethodEstimate[];
  overlap: GpsOverlap | null;
  xUnit: string;
  yUnit: string;
}

export interface ContinuousEffectOptions {
  gridSize?: number;
}

function isContinuousExposureFamily(graph: GraphModel, id: string): boolean {
  const node = graph.nodes.find((candidate) => candidate.id === id);
  if (!node) return false;
  const kind = normalizeVariableModel(node.variable).valueType;
  // Ordered numeric families ride the dose-response path; binary/categorical do not.
  return kind === "continuous" || kind === "count" || kind === "ordinal" || kind === "positive" || kind === "proportion";
}

// Observed (non-latent) backdoor covariates: the marked adjustment set, else the
// direct parents of the exposure. Never the exposure, outcome, or a latent.
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

// Weighted OLS via ridge-regularized normal equations. `design` rows include the
// leading 1 for the intercept. Returns the coefficient vector, or null if singular.
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

// Gauss-Jordan solve of A x = b for small dense A; null if singular.
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

function normalPdf(x: number, mean: number, sd: number): number {
  const z = (x - mean) / sd;
  return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
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

function effectiveSampleSizeFraction(weights: number[]): number {
  let s1 = 0;
  let s2 = 0;
  for (const w of weights) { s1 += w; s2 += w * w; }
  if (s2 <= 0) return 0;
  return (s1 * s1) / s2 / Math.max(1, weights.length);
}

/**
 * Compute the continuous-exposure effect comparison for an exposure→outcome pair,
 * or null when the pairing is not a supported ordered-numeric exposure with an
 * ordered-numeric outcome. `baseResult` is the already-computed simulation for the
 * displayed cohort; only the oracle re-runs the engine.
 */
export function analyzeContinuousEffect(
  graph: GraphModel,
  spec: SimulationSpec,
  baseResult: SimulationResult,
  pair: { x: string; y: string },
  options: ContinuousEffectOptions = {}
): ContinuousEffectComparison | null {
  const xNode = graph.nodes.find((node) => node.id === pair.x);
  const yNode = graph.nodes.find((node) => node.id === pair.y);
  if (!xNode || !yNode || !xNode.roles.exposure) return null;
  if (!isContinuousExposureFamily(graph, pair.x) || !isContinuousExposureFamily(graph, pair.y)) return null;

  const xSamples = (baseResult.nodeStates[pair.x]?.empirical.samples ?? []);
  const ySamples = (baseResult.nodeStates[pair.y]?.empirical.samples ?? []);
  const baseWeights = baseResult.nodeStates[pair.x]?.empirical.weights ?? [];
  const covariates = adjustmentCovariates(graph, pair.x, pair.y);

  // Assemble the complete-case rows over the displayed cohort.
  const xs: number[] = [];
  const ys: number[] = [];
  const cs: number[][] = [];
  const ws: number[] = [];
  const n0 = Math.min(xSamples.length, ySamples.length);
  for (let i = 0; i < n0; i += 1) {
    const x = xSamples[i]!;
    const y = ySamples[i]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const cov = covariates.map((id) => baseResult.nodeStates[id]?.empirical.samples[i] ?? NaN);
    if (cov.some((v) => !Number.isFinite(v))) continue;
    xs.push(x); ys.push(y); cs.push(cov); ws.push(baseWeights[i] ?? 1);
  }
  if (xs.length < 24) return null;

  const sortedX = [...xs].sort((a, b) => a - b);
  const lo = quantileSorted(sortedX, 0.01);
  const hi = quantileSorted(sortedX, 0.99);
  const p10 = quantileSorted(sortedX, 0.1);
  const p90 = quantileSorted(sortedX, 0.9);
  if (!(hi > lo) || !(p90 > p10)) return null;
  const gridSize = Math.max(5, options.gridSize ?? 13);
  const grid = Array.from({ length: gridSize }, (_, i) => lo + ((hi - lo) * i) / (gridSize - 1));

  const meanX = weightedMean(xs, ws);
  const meanY = weightedMean(ys, ws);
  const covMeans = covariates.map((_, j) => weightedMean(cs.map((row) => row[j]!), ws));

  // A line from slope + a pinned anchor point (x0, y0): y = y0 + slope·(x − x0).
  const lineCurve = (slope: number, x0: number, y0: number): number[] => grid.map((x) => y0 + slope * (x - x0));
  const readContrast = (slope: number): { slope: number; standardized: number } => ({ slope, standardized: slope * (p90 - p10) });

  const methods: EffectMethodEstimate[] = [];

  // --- crude: weighted OLS of Y on X ---
  const crude = weightedLeastSquares(xs.map((x) => [1, x]), ys, ws);
  const crudeSlope = crude ? crude[1]! : 0;
  methods.push({ id: "crude", label: "crude (unadjusted)", ...readContrast(crudeSlope), curve: lineCurve(crudeSlope, meanX, meanY), ess: null, adjusted: false });

  // --- g-computation: OLS Y ~ X + covariates, then standardize over the covariate distribution ---
  // Linear model ⇒ standardizing = evaluating at the mean covariate, so E[Y|do x] = β0 + βx·x + Σ βc·C̄.
  let gcompSlope = crudeSlope;
  let gcompAnchorY = meanY;
  if (covariates.length > 0) {
    const design = xs.map((x, i) => [1, x, ...cs[i]!]);
    const beta = weightedLeastSquares(design, ys, ws);
    if (beta) {
      gcompSlope = beta[1]!;
      const intercept = beta[0]!;
      const covPart = covMeans.reduce((sum, cm, j) => sum + beta[2 + j]! * cm, 0);
      gcompAnchorY = intercept + gcompSlope * meanX + covPart; // = E[Y|do meanX]
    }
  }
  methods.push({ id: "g-computation", label: "g-computation (outcome model)", ...readContrast(gcompSlope), curve: lineCurve(gcompSlope, meanX, gcompAnchorY), ess: null, adjusted: true });

  // --- GPS-IPW: stabilized generalized-propensity weights, weighted Y~X ---
  let overlap: GpsOverlap | null = null;
  let ipwSlope = crudeSlope;
  let ipwEss: number | null = null;
  if (covariates.length > 0) {
    const treatDesign = xs.map((_, i) => [1, ...cs[i]!]);
    const treatBeta = weightedLeastSquares(treatDesign, xs, ws);
    if (treatBeta) {
      const predicted = treatDesign.map((row) => row.reduce((s, v, j) => s + v * treatBeta[j]!, 0));
      let rss = 0;
      let sw = 0;
      for (let i = 0; i < xs.length; i += 1) { const r = xs[i]! - predicted[i]!; rss += ws[i]! * r * r; sw += ws[i]!; }
      const sigma = Math.sqrt(Math.max(1e-6, rss / Math.max(1, sw - (covariates.length + 1))));
      const sdX = Math.sqrt(Math.max(1e-6, weightedMean(xs.map((x) => (x - meanX) ** 2), ws)));
      // Stabilized weight w = f(X) / f(X | C). Under strong confounding the conditional
      // density is much narrower than the marginal (σ < S/√2), so these weights have no
      // finite variance — a real generalized-propensity pathology. Truncate at the 99th
      // percentile (standard practice) so the point estimate stays usable; the RAW-weight
      // ESS is what the overlap panel reports, so the positivity strain is still visible.
      const stabRaw = xs.map((x, i) => normalPdf(x, meanX, sdX) / Math.max(1e-12, normalPdf(x, predicted[i]!, sigma)));
      const cap = quantileSorted([...stabRaw].sort((a, b) => a - b), 0.99) || Infinity;
      const stab = stabRaw.map((w) => Math.min(w, cap));
      const combined = stab.map((w, i) => w * ws[i]!);
      const ipwFit = weightedLeastSquares(xs.map((x) => [1, x]), ys, combined);
      if (ipwFit) ipwSlope = ipwFit[1]!;
      ipwEss = effectiveSampleSizeFraction(combined);
      const medianW = quantileSorted([...stabRaw].sort((a, b) => a - b), 0.5) || 1;
      const meanRaw = stabRaw.reduce((s, w) => s + w, 0) / Math.max(1, stabRaw.length);
      overlap = {
        model: `linear generalized propensity on ${covariates.length} covariate${covariates.length === 1 ? "" : "s"} (stabilized density weights, truncated at p99)`,
        essFraction: effectiveSampleSizeFraction(stabRaw.map((w, i) => w * ws[i]!)),
        maxWeight: Math.max(...stabRaw) / Math.max(1e-9, meanRaw),
        commonSupportShare: stabRaw.filter((w) => w <= 20 * medianW).length / stabRaw.length,
        weights: stab
      };
    }
  }
  methods.push({ id: "gps-ipw", label: "GPS-IPW (treatment model)", ...readContrast(ipwSlope), curve: lineCurve(ipwSlope, meanX, meanY), ess: ipwEss, adjusted: true });

  // --- AIPW: doubly robust. g-comp slope + IP-weighted residual augmentation. ---
  // If the outcome model is right the residuals vanish (→ g-comp); if the weights
  // are right the weighted residual regression corrects outcome-model bias.
  let aipwSlope = gcompSlope;
  if (covariates.length > 0 && overlap) {
    const design = xs.map((x, i) => [1, x, ...cs[i]!]);
    const beta = weightedLeastSquares(design, ys, ws);
    if (beta) {
      const residual = ys.map((y, i) => y - design[i]!.reduce((s, v, j) => s + v * beta[j]!, 0));
      const stab = overlap.weights;
      const combined = stab.map((w, i) => w * ws[i]!);
      // Weighted regression of the residual on X gives the augmentation slope.
      const augFit = weightedLeastSquares(xs.map((x) => [1, x]), residual, combined);
      if (augFit) aipwSlope = gcompSlope + augFit[1]!;
    }
  }
  methods.push({ id: "aipw", label: "AIPW (doubly robust)", ...readContrast(aipwSlope), curve: lineCurve(aipwSlope, meanX, gcompAnchorY), ess: ipwEss, adjusted: true });

  // --- oracle: re-simulate forcing X = dose (pure interventional) ---
  const oracleCurve = grid.map((dose) => {
    const result = runSimulation(graph, { ...spec, overrides: { ...spec.overrides, [pair.x]: dose }, selections: {} });
    return result.nodeStates[pair.y]?.empirical.mean ?? NaN;
  });
  const oracleAt = (x: number): number => {
    if (x <= grid[0]!) return oracleCurve[0]!;
    if (x >= grid[grid.length - 1]!) return oracleCurve[grid.length - 1]!;
    let k = 0;
    while (k < grid.length - 1 && grid[k + 1]! < x) k += 1;
    const t = (x - grid[k]!) / Math.max(1e-9, grid[k + 1]! - grid[k]!);
    return oracleCurve[k]! + t * (oracleCurve[k + 1]! - oracleCurve[k]!);
  };
  const oracleStd = oracleAt(p90) - oracleAt(p10);
  methods.push({ id: "oracle", label: "oracle E[Y | do(X)]", slope: oracleStd / (p90 - p10), standardized: oracleStd, curve: oracleCurve, ess: null, adjusted: true });

  return {
    xId: pair.x,
    yId: pair.y,
    grid,
    loHiDose: [p10, p90],
    covariates,
    methods,
    overlap,
    xUnit: normalizeVariableModel(xNode.variable).unit,
    yUnit: normalizeVariableModel(yNode.variable).unit
  };
}
