import type { GraphDocument } from "./types";
import { cloneDocument, normalizeEdgeMechanism, normalizeVariableModel, reconcileSimulationSpec } from "./graph";
import { setLinearCoefficient, setNode, ZERO_NOISE } from "./examples/builders";
import { datasetRows, registerRuntimeDataset } from "./datasets";

// Solve A x = b (Gaussian elimination with partial pivoting). Returns null if singular.
function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = m[r]![col]! / m[col]![col]!;
      for (let c = col; c <= n; c += 1) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

// z-score each predictor column so the fit is well-conditioned regardless of raw scale (earnings in
// the thousands vs 0/1 flags). Returns the standardized matrix + per-column mean/sd.
function standardize(X: number[][]): { z: number[][]; mean: number[]; sd: number[] } {
  const n = X.length; const p = X[0]?.length ?? 0;
  const mean = new Array(p).fill(0); const sd = new Array(p).fill(1);
  for (let j = 0; j < p; j += 1) {
    let s = 0; for (let i = 0; i < n; i += 1) s += X[i]![j]!;
    mean[j] = s / n;
    let v = 0; for (let i = 0; i < n; i += 1) { const d = X[i]![j]! - mean[j]; v += d * d; }
    sd[j] = Math.sqrt(v / Math.max(1, n)) || 1;
  }
  const z = X.map((row) => row.map((x, j) => (x - mean[j]!) / sd[j]!));
  return { z, mean, sd };
}

// Map standardized-space coefficients back to the RAW predictor scale.
function unstandardize(interceptZ: number, coefZ: number[], mean: number[], sd: number[]): { intercept: number; coefs: number[] } {
  const coefs = coefZ.map((b, j) => b / sd[j]!);
  let intercept = interceptZ;
  for (let j = 0; j < coefZ.length; j += 1) intercept -= coefZ[j]! * mean[j]! / sd[j]!;
  return { intercept, coefs };
}

// OLS of y on X (with intercept), fitted on standardized X, returned on the raw scale + residual sd.
function fitOls(X: number[][], y: number[]): { intercept: number; coefs: number[]; residualSd: number } | null {
  const n = y.length; const p = X[0]?.length ?? 0;
  if (n < p + 2) return null;
  const { z, mean, sd } = standardize(X);
  const design = z.map((row) => [1, ...row]); // intercept column
  const k = p + 1;
  const xtx = Array.from({ length: k }, () => new Array(k).fill(0));
  const xty = new Array(k).fill(0);
  for (let i = 0; i < n; i += 1) {
    const row = design[i]!;
    for (let a = 0; a < k; a += 1) { xty[a]! += row[a]! * y[i]!; for (let b = 0; b < k; b += 1) xtx[a]![b]! += row[a]! * row[b]!; }
  }
  const beta = solveLinear(xtx, xty);
  if (!beta) return null;
  let ss = 0;
  for (let i = 0; i < n; i += 1) { let yhat = beta[0]!; for (let j = 0; j < p; j += 1) yhat += beta[j + 1]! * z[i]![j]!; const r = y[i]! - yhat; ss += r * r; }
  const residualSd = Math.sqrt(ss / Math.max(1, n - k));
  const raw = unstandardize(beta[0]!, beta.slice(1), mean, sd);
  return { ...raw, residualSd };
}

const sig = (x: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));

// Logistic regression of y∈{0,1} on X (with intercept) via IRLS, fitted on standardized X, raw scale.
function fitLogistic(X: number[][], y: number[]): { intercept: number; coefs: number[] } | null {
  const n = y.length; const p = X[0]?.length ?? 0;
  if (n < p + 2) return null;
  const { z, mean, sd } = standardize(X);
  const design = z.map((row) => [1, ...row]);
  const k = p + 1;
  let beta = new Array(k).fill(0);
  for (let iter = 0; iter < 30; iter += 1) {
    const xtwx = Array.from({ length: k }, () => new Array(k).fill(0));
    const xtwz = new Array(k).fill(0);
    for (let i = 0; i < n; i += 1) {
      const row = design[i]!;
      let eta = 0; for (let a = 0; a < k; a += 1) eta += row[a]! * beta[a]!;
      const mu = sig(eta); const w = Math.max(1e-6, mu * (1 - mu));
      const resid = y[i]! - mu;
      for (let a = 0; a < k; a += 1) { xtwz[a]! += row[a]! * (w * eta + resid); for (let b = 0; b < k; b += 1) xtwx[a]![b]! += row[a]! * w * row[b]!; }
    }
    for (let a = 0; a < k; a += 1) xtwx[a]![a]! += 1e-6; // ridge — guards against separation / singularity
    const next = solveLinear(xtwx, xtwz);
    if (!next) return null;
    let delta = 0; for (let a = 0; a < k; a += 1) delta += Math.abs(next[a]! - beta[a]!);
    beta = next;
    if (delta < 1e-8) break;
  }
  return unstandardize(beta[0]!, beta.slice(1), mean, sd);
}

// A node is FITTABLE if it's a data column (has an incoming table_lookup) with ≥1 DRAWN data-column parent.
export function fittableDgp(document: GraphDocument): boolean {
  const cols = new Set<string>();
  for (const edge of document.graph.edges) if (normalizeEdgeMechanism(document.simulation.edges[edge.id]).kind === "table_lookup") cols.add(edge.target);
  if (cols.size === 0) return false;
  return document.graph.edges.some((edge) =>
    edge.kind === "directed" && cols.has(edge.target) && cols.has(edge.source) &&
    normalizeEdgeMechanism(document.simulation.edges[edge.id]).kind !== "table_lookup");
}

// Learn a model-based plasmode DGP from the imported data: covariates keep their real (resampled) values,
// but every ENDOGENOUS node (a data column you've drawn causal parents into) is FIT from the data —
// logistic for a binary node, OLS for a continuous one — and switched from reading its column to
// GENERATING from the fit. The drawn edges become the learned coefficients; the fitted β is the DGP's
// known true effect, which adjustment on the simulated data recovers.
export function fitDgpFromData(input: GraphDocument): GraphDocument {
  if (input.simulation.datasets) for (const [name, ds] of Object.entries(input.simulation.datasets)) registerRuntimeDataset(name, ds);
  const document = cloneDocument(input);
  // node id → its data column (from the incoming table_lookup edge that reads it).
  const columnOf = new Map<string, { dataset: string; dataColumn: number; lookupEdgeId: string }>();
  for (const edge of document.graph.edges) {
    const mech = normalizeEdgeMechanism(document.simulation.edges[edge.id]);
    if (mech.kind === "table_lookup" && mech.dataset) columnOf.set(edge.target, { dataset: mech.dataset, dataColumn: mech.dataColumn ?? 0, lookupEdgeId: edge.id });
  }
  if (columnOf.size === 0) return input;

  const removeEdgeIds = new Set<string>();
  for (const node of document.graph.nodes) {
    const col = columnOf.get(node.id);
    if (!col) continue;
    const drawn = document.graph.edges.filter((edge) =>
      edge.kind === "directed" && edge.target === node.id && columnOf.has(edge.source) &&
      normalizeEdgeMechanism(document.simulation.edges[edge.id]).kind !== "table_lookup");
    if (drawn.length === 0) continue; // exogenous covariate — leave it as real (plasmode) data
    const rows = datasetRows(col.dataset);
    if (rows.length < drawn.length + 2) continue;
    const y = rows.map((row) => row[col.dataColumn] ?? 0);
    const X = rows.map((row) => drawn.map((edge) => row[columnOf.get(edge.source)!.dataColumn] ?? 0));
    const isBinary = normalizeVariableModel(node.variable).valueType === "binary";
    const fit = isBinary ? fitLogistic(X, y) : fitOls(X, y);
    if (!fit) continue;
    for (let j = 0; j < drawn.length; j += 1) setLinearCoefficient(document, drawn[j]!.source, node.id, fit.coefs[j] ?? 0);
    if (isBinary) setNode(document, node.id, { intercept: fit.intercept, combiner: "bernoulli_logit", noise: ZERO_NOISE });
    else setNode(document, node.id, { intercept: fit.intercept, combiner: "additive", noise: { kind: "normal", mean: 0, sd: (fit as { residualSd?: number }).residualSd ?? 1 } });
    removeEdgeIds.add(col.lookupEdgeId); // drop the data read — the node now GENERATES from the fitted model
  }
  if (removeEdgeIds.size === 0) return input;

  document.graph.edges = document.graph.edges.filter((edge) => !removeEdgeIds.has(edge.id));
  for (const id of removeEdgeIds) delete document.simulation.edges[id];
  document.simulation = reconcileSimulationSpec(document.graph, document.simulation);
  if (input.simulation.datasets) document.simulation.datasets = input.simulation.datasets;
  return document;
}
