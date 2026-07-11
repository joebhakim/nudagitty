import type { GraphDocument, NodeCombinerKind, NodeGate } from "./types";
import { cloneDocument, normalizeEdgeMechanism, normalizeNodeMechanism, normalizeVariableModel, reconcileSimulationSpec } from "./graph";
import { setLinearCoefficient, setNode, ZERO_NOISE } from "./examples/builders";
import { datasetRows, registerRuntimeDataset } from "./datasets";

// ---------- provenance keys ----------
const edgeKey = (id: string) => `e:${id}`;
const interceptKey = (id: string) => `ni:${id}`;
const noiseKey = (id: string) => `nn:${id}`;

// ---------- family-aware fit: fit on the LINK scale the node's family implies ----------
// Generation does Y = g⁻¹(η + ε) (additive→identity, gamma_log/poisson_log→exp, bounded_logistic→sigmoid),
// so fitting a continuous node = fit OLS on g(Y) ~ X with normal noise on the link scale. That gives a
// realistic (e.g. lognormal) marginal that stays testable — no marginal-forcing copula. `Y = f(X)+ε` stays.
export type FitLink = "identity" | "log" | "logit";
export function linkForValueType(valueType: string): { link: FitLink; combiner: NodeCombinerKind } {
  if (valueType === "positive") return { link: "log", combiner: "gamma_log" };
  // Two-part: the intensive margin (amount | Y>0) is fit on the log scale, exactly like `positive`.
  // The extensive margin (the gate, P(Y>0)) is fit separately below and stored on `mechanism.gate`.
  if (valueType === "semicontinuous") return { link: "log", combiner: "gamma_log" };
  if (valueType === "proportion") return { link: "logit", combiner: "bounded_logistic" };
  return { link: "identity", combiner: "additive" };
}
export function applyLink(y: number, link: FitLink): number {
  if (link === "log") return y > 0 ? Math.log(y) : NaN;          // exp(·) is the inverse in generation
  if (link === "logit") return y > 0 && y < 1 ? Math.log(y / (1 - y)) : NaN; // sigmoid(·) is the inverse
  return y;
}

// Fit cache: a node's last-fit input signature (`${docId}:${nodeId}` → sig). reconcile re-fits only when
// the signature changes — an unrelated edit (or the second reconcile of the same commit) skips the costly
// re-fit and keeps the carried values, which are already that fit's output.
const fitSigCache = new Map<string, string>();

// ---------- linear algebra ----------
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

const sig = (x: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));

// Fit y on the PINNED predictors X (raw scale, z-scored internally for conditioning), with a fixed
// per-row `offset` (the authored terms) and an optional estimated intercept. OLS for continuous y,
// logistic-IRLS for binary. Returns raw-scale coefficients (+ intercept if requested, + residual sd).
function fitLinearModel(y: number[], X: number[][], offset: number[], fitIntercept: boolean, isBinary: boolean):
  { intercept: number; coefs: number[]; residualSd: number } | null {
  const n = y.length; const p = X[0]?.length ?? 0;
  if (n < p + 2) return null;
  // z-score predictors
  const mean = new Array(p).fill(0); const sd = new Array(p).fill(1);
  for (let j = 0; j < p; j += 1) {
    let s = 0; for (let i = 0; i < n; i += 1) s += X[i]![j]!;
    mean[j] = s / n;
    let v = 0; for (let i = 0; i < n; i += 1) { const d = X[i]![j]! - mean[j]; v += d * d; }
    sd[j] = Math.sqrt(v / Math.max(1, n)) || 1;
  }
  const z = X.map((row) => row.map((x, j) => (x - mean[j]!) / sd[j]!));
  const cols = (fitIntercept ? 1 : 0) + p;
  const design = z.map((row) => (fitIntercept ? [1, ...row] : [...row]));

  let beta: number[];
  if (!isBinary) {
    const xtx = Array.from({ length: cols }, () => new Array(cols).fill(0));
    const xty = new Array(cols).fill(0);
    for (let i = 0; i < n; i += 1) {
      const row = design[i]!; const yi = y[i]! - offset[i]!;
      for (let a = 0; a < cols; a += 1) { xty[a]! += row[a]! * yi; for (let b = 0; b < cols; b += 1) xtx[a]![b]! += row[a]! * row[b]!; }
    }
    const sol = solveLinear(xtx, xty);
    if (!sol) return null;
    beta = sol;
  } else {
    beta = new Array(cols).fill(0);
    for (let iter = 0; iter < 30; iter += 1) {
      const xtwx = Array.from({ length: cols }, () => new Array(cols).fill(0));
      const xtwz = new Array(cols).fill(0);
      for (let i = 0; i < n; i += 1) {
        const row = design[i]!;
        let eta = offset[i]!; for (let a = 0; a < cols; a += 1) eta += row[a]! * beta[a]!;
        const mu = sig(eta); const w = Math.max(1e-6, mu * (1 - mu));
        const working = eta - offset[i]! + (y[i]! - mu) / w;
        for (let a = 0; a < cols; a += 1) { xtwz[a]! += row[a]! * w * working; for (let b = 0; b < cols; b += 1) xtwx[a]![b]! += row[a]! * w * row[b]!; }
      }
      for (let a = 0; a < cols; a += 1) xtwx[a]![a]! += 1e-6;
      const next = solveLinear(xtwx, xtwz);
      if (!next) return null;
      let delta = 0; for (let a = 0; a < cols; a += 1) delta += Math.abs(next[a]! - beta[a]!);
      beta = next;
      if (delta < 1e-8) break;
    }
  }
  // un-standardise
  const interceptZ = fitIntercept ? beta[0]! : 0;
  const coefZ = fitIntercept ? beta.slice(1) : beta;
  const coefs = coefZ.map((b, j) => b / sd[j]!);
  let intercept = interceptZ;
  for (let j = 0; j < p; j += 1) intercept -= coefZ[j]! * mean[j]! / sd[j]!;
  // residual sd (continuous): on y − (offset + intercept + Σ coef·x_raw)
  let ss = 0;
  for (let i = 0; i < n; i += 1) {
    let pred = offset[i]! + (fitIntercept ? intercept : 0);
    for (let j = 0; j < p; j += 1) pred += coefs[j]! * X[i]![j]!;
    const r = y[i]! - pred; ss += r * r;
  }
  const residualSd = Math.sqrt(ss / Math.max(1, n - cols));
  return { intercept, coefs, residualSd };
}

// ---------- graph provenance helpers ----------
// A node's data column, from its table_lookup edge (enabled OR disabled — a fitted node keeps a DISABLED
// lookup so we can still re-fit against its column and re-enabling restores replay).
function nodeColumn(document: GraphDocument, nodeId: string): { dataset: string; dataColumn: number; lookupEdgeId: string; enabled: boolean } | null {
  for (const edge of document.graph.edges) {
    if (edge.target !== nodeId) continue;
    const mech = normalizeEdgeMechanism(document.simulation.edges[edge.id]);
    if (mech.kind === "table_lookup" && mech.dataset) return { dataset: mech.dataset, dataColumn: mech.dataColumn ?? 0, lookupEdgeId: edge.id, enabled: mech.enabled };
  }
  return null;
}

// The drawn causal parents of a node that are themselves data columns (the fittable predictors).
function drawnDataParents(document: GraphDocument, nodeId: string) {
  return document.graph.edges.filter((edge) =>
    edge.kind === "directed" && edge.target === nodeId && nodeColumn(document, edge.source) &&
    normalizeEdgeMechanism(document.simulation.edges[edge.id]).kind !== "table_lookup");
}

// Is there a node still READING from data with drawn data-parents (something left to fit)?
export function fittableDgp(document: GraphDocument): boolean {
  return document.graph.nodes.some((node) => {
    const col = nodeColumn(document, node.id);
    return Boolean(col?.enabled) && drawnDataParents(document, node.id).length > 0;
  });
}

// Mark a node's whole equation (its drawn-parent coefficients + intercept + noise) as PINNED, and switch
// it from reading data to GENERATING by disabling its table_lookup edge. Values are filled by reconcilePins.
export function pinNodeEquation(input: GraphDocument, nodeId: string): GraphDocument {
  const document = cloneDocument(input);
  const col = nodeColumn(document, nodeId);
  if (!col) return input;
  const drawn = drawnDataParents(document, nodeId);
  if (drawn.length === 0) return input;
  document.simulation.edges[col.lookupEdgeId] = { ...normalizeEdgeMechanism(document.simulation.edges[col.lookupEdgeId]), enabled: false };
  const pins = new Set(document.metadata.pins);
  for (const edge of drawn) pins.add(edgeKey(edge.id));
  pins.add(interceptKey(nodeId));
  if (normalizeVariableModel(document.graph.nodes.find((n) => n.id === nodeId)!.variable).valueType !== "binary") pins.add(noiseKey(nodeId));
  document.metadata.pins = [...pins];
  document.metadata.authored = document.metadata.authored.filter((k) => !pins.has(k)); // fitted wins over authored
  return document;
}

// Remove one number's pin — it keeps its last-fit value but is now AUTHORED (your override).
export function unpinNumber(input: GraphDocument, key: string): GraphDocument {
  if (!input.metadata.pins.includes(key)) return input;
  return authorNumber(input, key);
}

// Live reconcile: re-fit every pinned number from the current data + DAG (offset-regression, so pinned
// coefficients are estimated holding the authored ones fixed). Returns the changed keys for the flash.
export function reconcilePins(input: GraphDocument): { document: GraphDocument; changed: string[] } {
  const pinSet = new Set(input.metadata.pins ?? []);
  const authoredSet = new Set(input.metadata.authored ?? []);
  if (pinSet.size === 0) return { document: input, changed: [] };
  if (input.simulation.datasets) for (const [name, ds] of Object.entries(input.simulation.datasets)) registerRuntimeDataset(name, ds);
  // Clone LAZILY: if every fit is cache-skipped (e.g. a node was just moved), return `input` untouched so
  // its identity — crucially metadata — is preserved and downstream memos (computationDocument → the whole
  // IPW/output pipeline) don't needlessly recompute.
  let document = input;
  const ensureClone = () => { if (document === input) document = cloneDocument(input); };
  const changed: string[] = [];
  const bump = (key: string, before: number, after: number) => { if (Math.abs(before - after) > 1e-9) changed.push(key); };

  const nodesToFit = new Set<string>();
  for (const key of pinSet) {
    if (key.startsWith("e:")) { const edge = document.graph.edges.find((e) => e.id === key.slice(2)); if (edge) nodesToFit.add(edge.target); }
    else nodesToFit.add(key.slice(3));
  }

  for (const nodeId of nodesToFit) {
    const node = document.graph.nodes.find((n) => n.id === nodeId);
    const col = nodeColumn(document, nodeId);
    if (!node || !col) continue;
    const rows = datasetRows(col.dataset);
    if (rows.length < 4) continue;
    const drawn = drawnDataParents(document, nodeId);
    const pinnedEdges = drawn.filter((e) => pinSet.has(edgeKey(e.id)));
    // Only AUTHORED parents contribute a fixed offset; NOT-LEARNED parents (in neither set) are excluded.
    const authoredEdges = drawn.filter((e) => authoredSet.has(edgeKey(e.id)));
    if (pinnedEdges.length === 0 && !pinSet.has(interceptKey(nodeId)) && !pinSet.has(noiseKey(nodeId))) continue;
    const valueType = normalizeVariableModel(node.variable).valueType;
    const isBinary = valueType === "binary";
    const { link, combiner: linkCombiner } = linkForValueType(valueType);
    const fitIntercept = pinSet.has(interceptKey(nodeId));
    const fitNoise = !isBinary && pinSet.has(noiseKey(nodeId));
    const mech = normalizeNodeMechanism(document.simulation.nodes[nodeId]);

    // Skip the re-fit when nothing that determines this node's fit has changed since it was last fitted.
    const sig = [
      col.dataset, rows.length,
      rows.length ? (rows[0]![col.dataColumn] ?? 0) : 0,
      rows.length ? (rows[rows.length >> 1]![col.dataColumn] ?? 0) : 0,
      col.dataColumn, isBinary ? "b" : link,
      fitIntercept ? "Pi" : `Ai${mech.intercept}`, fitNoise ? "Pn" : "-",
      ...pinnedEdges.map((e) => `P${nodeColumn(document, e.source)?.dataColumn}`).sort(),
      ...authoredEdges.map((e) => { const em = normalizeEdgeMechanism(document.simulation.edges[e.id]); return `A${nodeColumn(document, e.source)?.dataColumn}:${em.kind === "linear" ? em.coefficient : 0}`; }).sort()
    ].join("|");
    const cacheKey = `${input.id}:${nodeId}`;
    if (fitSigCache.get(cacheKey) === sig) continue; // inputs unchanged → carried values are already this fit

    // Target on the fit's LINK scale (identity for continuous — unchanged; log for positive, etc.). The
    // authored offset + coefficients live on that same scale (η), so this stays exact.
    const yRaw = rows.map((r) => (isBinary ? (r[col.dataColumn] ?? 0) : applyLink(r[col.dataColumn] ?? 0, link)));
    const offsetRaw = rows.map((r) => {
      let o = fitIntercept ? 0 : mech.intercept;
      for (const edge of authoredEdges) {
        const em = normalizeEdgeMechanism(document.simulation.edges[edge.id]);
        const coef = em.kind === "linear" ? em.coefficient : 0;
        o += coef * (r[nodeColumn(document, edge.source)!.dataColumn] ?? 0);
      }
      return o;
    });
    const XRaw = rows.map((r) => pinnedEdges.map((edge) => r[nodeColumn(document, edge.source)!.dataColumn] ?? 0));
    // Drop rows outside the link's domain (e.g. Y≤0 under a log link) so the fit only sees valid targets.
    const keep: number[] = [];
    for (let i = 0; i < yRaw.length; i += 1) if (Number.isFinite(yRaw[i]) && Number.isFinite(offsetRaw[i]) && XRaw[i]!.every(Number.isFinite)) keep.push(i);
    const y = keep.map((i) => yRaw[i]!);
    const offset = keep.map((i) => offsetRaw[i]!);
    const X = keep.map((i) => XRaw[i]!);
    const fit = fitLinearModel(y, X, offset, fitIntercept, isBinary);
    if (!fit) continue;
    ensureClone(); // a real re-fit is happening → now we need our own copy to write into

    for (let j = 0; j < pinnedEdges.length; j += 1) {
      const edge = pinnedEdges[j]!;
      const before = (() => { const em = normalizeEdgeMechanism(document.simulation.edges[edge.id]); return em.kind === "linear" ? em.coefficient : 0; })();
      setLinearCoefficient(document, edge.source, nodeId, fit.coefs[j] ?? 0);
      bump(edgeKey(edge.id), before, fit.coefs[j] ?? 0);
    }
    let newIntercept = fitIntercept ? fit.intercept : mech.intercept;
    const currentSd = mech.noise.kind === "normal" ? mech.noise.sd : 1;
    const newNoise = isBinary ? ZERO_NOISE : { kind: "normal" as const, mean: 0, sd: fitNoise ? fit.residualSd : currentSd };
    // Retransformation-bias correction for the log link: generation draws Y = exp(η+ε), whose mean is
    // exp(η+σ²/2), not exp(η). Shift the intercept so the generated MEAN matches the data mean (over the
    // fitted rows) — keeps the "mean matches data" promise; the residual check still tests the log-scale shape.
    if (link === "log" && fitIntercept) {
      const sd = newNoise.kind === "normal" ? newNoise.sd : 0;
      const half = (sd * sd) / 2;
      let genSum = 0, targetSum = 0;
      for (let i = 0; i < X.length; i += 1) {
        let eta = fit.intercept + offset[i]!;
        for (let j = 0; j < pinnedEdges.length; j += 1) eta += (fit.coefs[j] ?? 0) * X[i]![j]!;
        genSum += Math.exp(eta + half);
        targetSum += Math.exp(y[i]!); // y is log(Y_raw) → exp recovers the raw value
      }
      if (genSum > 1e-9 && targetSum > 1e-9) newIntercept = fit.intercept + Math.log(targetSum / genSum);
    }
    // Two-part gate (extensive margin): logistic fit of 1(Y>0) on the parents over ALL rows
    // (participation is observed for everyone, unlike the intensive amount which is Y>0-only). The
    // logistic MLE with a free intercept makes mean P(Y>0) match the empirical participation rate,
    // so P(Y>0)·E[Y|Y>0] reproduces the overall mean including the zero spike.
    let gate: NodeGate | null = null;
    if (valueType === "semicontinuous") {
      const gk: number[] = [];
      for (let i = 0; i < XRaw.length; i += 1) if (XRaw[i]!.every(Number.isFinite)) gk.push(i);
      const gateFit = fitLinearModel(
        gk.map((i) => ((rows[i]![col.dataColumn] ?? 0) > 0 ? 1 : 0)),
        gk.map((i) => XRaw[i]!),
        gk.map(() => 0), true, true
      );
      if (gateFit) {
        // Preserve any non-pinned gate coefficient (e.g. an authored/imposed treatment effect on the
        // extensive margin) — only the pinned (fitted) confounder parents are overwritten here.
        const coefficients: Record<string, number> = { ...(mech.gate?.coefficients ?? {}) };
        for (let j = 0; j < pinnedEdges.length; j += 1) coefficients[pinnedEdges[j]!.source] = gateFit.coefs[j] ?? 0;
        gate = { intercept: gateFit.intercept, coefficients };
      }
    }
    setNode(document, nodeId, { ...mech, intercept: newIntercept, combiner: isBinary ? "bernoulli_logit" : linkCombiner, noise: newNoise, ...(gate ? { gate } : {}) });
    if (fitIntercept) bump(interceptKey(nodeId), mech.intercept, newIntercept);
    if (fitNoise) bump(noiseKey(nodeId), currentSd, fit.residualSd);
    if (fitSigCache.size > 400) fitSigCache.clear();
    fitSigCache.set(cacheKey, sig);
  }

  if (document === input) return { document: input, changed: [] }; // nothing re-fit → no churn
  document.simulation = reconcileSimulationSpec(document.graph, document.simulation);
  if (input.simulation.datasets) document.simulation.datasets = input.simulation.datasets;
  return { document, changed };
}

// ---------- provenance queries ----------
export type Provenance = "data" | "not-learned" | "fitted" | "authored";

/** A node's MARGINAL provenance — a data column's marginal is always empirical; a from-scratch node's is authored. */
export function nodeProvenance(document: GraphDocument, nodeId: string): Provenance {
  return nodeColumn(document, nodeId) ? "data" : "authored";
}

/** An edge's DEPENDENCE provenance: fitted (in pins), authored (explicitly set), data (a lookup read),
 *  or "not-learned" — drawn into a data node but neither fitted nor authored (structural only, no number). */
export function edgeProvenance(document: GraphDocument, edgeId: string): Provenance {
  if (document.metadata.pins.includes(edgeKey(edgeId))) return "fitted";
  if (document.metadata.authored.includes(edgeKey(edgeId))) return "authored";
  if (normalizeEdgeMechanism(document.simulation.edges[edgeId]).kind === "table_lookup") return "data";
  const edge = document.graph.edges.find((e) => e.id === edgeId);
  if (edge && nodeColumn(document, edge.target)) return "not-learned";
  return "authored";
}

/** True once a data node has ANY fitted/authored equation number (⇒ it GENERATES rather than reads its column). */
export function nodeGenerates(document: GraphDocument, nodeId: string): boolean {
  if (!nodeColumn(document, nodeId)) return true; // a from-scratch node always generates
  const learned = [...document.metadata.pins, ...document.metadata.authored];
  return learned.some((key) => {
    const el = pinKeyElement(key);
    if (!el) return false;
    if (el.kind === "node") return el.id === nodeId;
    return document.graph.edges.find((e) => e.id === el.id)?.target === nodeId;
  });
}

/** Keep each data node's table_lookup ENABLED (reads) while all its numbers are not-learned, DISABLED (generates)
 *  once any is fitted/authored. Runs on every commit so the read/generate state can't drift from the provenance. */
export function syncGenerativeState(input: GraphDocument): GraphDocument {
  const document = cloneDocument(input);
  let changed = false;
  for (const node of document.graph.nodes) {
    const col = nodeColumn(document, node.id);
    if (!col) continue;
    const shouldRead = !nodeGenerates(document, node.id);
    if (col.enabled !== shouldRead) {
      document.simulation.edges[col.lookupEdgeId] = { ...normalizeEdgeMechanism(document.simulation.edges[col.lookupEdgeId]), enabled: shouldRead };
      changed = true;
    }
  }
  return changed ? document : input;
}

/** Mark ONE number as AUTHORED (you set it) — removes any fit pin; the node then generates from it. */
export function authorNumber(input: GraphDocument, key: string): GraphDocument {
  const document = cloneDocument(input);
  document.metadata.pins = document.metadata.pins.filter((k) => k !== key);
  if (!document.metadata.authored.includes(key)) document.metadata.authored = [...document.metadata.authored, key];
  return document;
}

/** Return ONE number to NOT-LEARNED (structural only) — removes it from both pins and authored. */
export function unlearnNumber(input: GraphDocument, key: string): GraphDocument {
  if (!input.metadata.pins.includes(key) && !input.metadata.authored.includes(key)) return input;
  const document = cloneDocument(input);
  document.metadata.pins = document.metadata.pins.filter((k) => k !== key);
  document.metadata.authored = document.metadata.authored.filter((k) => k !== key);
  return document;
}

/** Resolve a pin key to the canvas element it marks (for the change-flash). */
export function pinKeyElement(key: string): { kind: "edge" | "node"; id: string } | null {
  if (key.startsWith("e:")) return { kind: "edge", id: key.slice(2) };
  if (key.startsWith("ni:") || key.startsWith("nn:")) return { kind: "node", id: key.slice(3) };
  return null;
}

export type NodeDataMode = "read" | "fit" | "author";

/** A data node's mode: reads its column (replay), fitted (pinned), or authored (generates, you set it).
 *  null if the node isn't a data column at all. */
export function nodeDataMode(document: GraphDocument, nodeId: string): NodeDataMode | null {
  const col = nodeColumn(document, nodeId);
  if (!col) return null;
  if (col.enabled) return "read";
  const pinnedHere = document.metadata.pins.some((key) => {
    const el = pinKeyElement(key);
    if (el?.kind === "node") return el.id === nodeId;
    if (el?.kind === "edge") return document.graph.edges.find((e) => e.id === el.id)?.target === nodeId;
    return false;
  });
  return pinnedHere ? "fit" : "author";
}

/** Drop every pin belonging to a node (its intercept/noise + its incoming edge coefficients). */
function withoutNodePins(document: GraphDocument, nodeId: string): void {
  document.metadata.pins = document.metadata.pins.filter((key) => {
    const el = pinKeyElement(key);
    if (!el) return true;
    if (el.kind === "node") return el.id !== nodeId;
    const edge = document.graph.edges.find((e) => e.id === el.id);
    return !edge || edge.target !== nodeId;
  });
}

/** Switch a data node between reading its column, generating from a fitted model, or generating from an
 *  authored equation you control. "author"/"fit" disable its table_lookup so the equation drives it. */
export function setNodeDataMode(input: GraphDocument, nodeId: string, mode: NodeDataMode): GraphDocument {
  const col = nodeColumn(input, nodeId);
  if (!col) return input;
  if (mode === "fit") return reconcilePins(pinNodeEquation(input, nodeId)).document;
  const document = cloneDocument(input);
  withoutNodePins(document, nodeId);
  document.simulation.edges[col.lookupEdgeId] = { ...normalizeEdgeMechanism(document.simulation.edges[col.lookupEdgeId]), enabled: mode === "read" };
  return document;
}

/** Pin ONE number to a data fit (the node switches to generate if it was reading). Reconciles. */
export function pinNumber(input: GraphDocument, key: string): GraphDocument {
  const el = pinKeyElement(key);
  if (!el) return input;
  const nodeId = el.kind === "node" ? el.id : input.graph.edges.find((e) => e.id === el.id)?.target;
  if (!nodeId) return input;
  const document = cloneDocument(input);
  const col = nodeColumn(document, nodeId);
  if (col?.enabled) document.simulation.edges[col.lookupEdgeId] = { ...normalizeEdgeMechanism(document.simulation.edges[col.lookupEdgeId]), enabled: false };
  document.metadata.authored = document.metadata.authored.filter((k) => k !== key);
  if (!document.metadata.pins.includes(key)) document.metadata.pins = [...document.metadata.pins, key];
  return reconcilePins(document).document;
}

/** Unpin ONE number (→ authored; keeps its last value). */
export function unpinKey(input: GraphDocument, key: string): GraphDocument {
  if (!input.metadata.pins.includes(key)) return input;
  return authorNumber(input, key);
}

/** Pin-key builders so the UI doesn't hardcode the format. */
export const pinKeys = {
  edge: (edgeId: string) => `e:${edgeId}`,
  intercept: (nodeId: string) => `ni:${nodeId}`,
  noise: (nodeId: string) => `nn:${nodeId}`
};

/** Editing a pinned number detaches it (→ authored, your override). Used by the editors' change handlers. */
export function unpinForNode(input: GraphDocument, nodeId: string): GraphDocument {
  const toAuthor = input.metadata.pins.filter((key) => { const el = pinKeyElement(key); return el?.kind === "node" && el.id === nodeId; });
  if (toAuthor.length === 0) return input;
  let document = input;
  for (const key of toAuthor) document = authorNumber(document, key);
  return document;
}

// "Learn the whole DGP" — pin every endogenous node (a data column with drawn data-parents), then reconcile.
export function fitDgpFromData(input: GraphDocument): GraphDocument {
  let document = input;
  for (const node of input.graph.nodes) {
    const col = nodeColumn(document, node.id);
    if (col?.enabled && drawnDataParents(document, node.id).length > 0) document = pinNodeEquation(document, node.id);
  }
  return reconcilePins(document).document;
}

// ---------- residual-independence (exogeneity) diagnostics ----------
// This is RESIT (Peters et al. 2014, JMLR 15): after an additive-noise fit y = intercept + Σβx + ε, the
// ANM identifiability assumption is ε ⊥ X. OLS forces ε LINEARLY orthogonal to X (corr(ε,xⱼ)≈0 always),
// so a linear test is powerless — we use DISTANCE CORRELATION (Székely), which equals HSIC with a distance
// kernel (Sejdinovic et al. 2013) and is 0 iff independent. Significance is a PERMUTATION test (the exact
// null). We report: (1) JOINT ε⊥X (the RESIT test) + per-parent breakdown; (2) heteroskedasticity via
// dCor(ε², X); (3) residual non-Gaussianity (Jarque–Bera). CAVEAT: a LINEAR fit with GAUSSIAN residuals is
// the non-identifiable case (both directions fit) — the test is powerless there; nonlinearity or
// non-Gaussianity (LiNGAM) is what gives it teeth.
export interface ResidualParentCheck { nodeId: string; label: string; distanceCorr: number; }
export interface DcorTest { dcor: number; pValue: number; }
export interface NormalityCheck { skewness: number; excessKurtosis: number; jarqueBera: number; pValue: number; }
// Two-part extensive margin: is the participation gate calibrated (predictedRate≈rate, ~exact by MLE),
// and is its residual 1(Y>0)−P̂ independent of X (a form check on the gate, over ALL rows)?
export interface GateCheck { rate: number; predictedRate: number; independence: DcorTest; }
export interface ResidualDiagnostic {
  available: boolean;
  n: number;
  perms: number;
  parents: ResidualParentCheck[];
  points: { fitted: number; residual: number }[];
  independence: DcorTest;        // joint dCor(ε, X) — the RESIT exogeneity test
  heteroskedasticity: DcorTest;  // joint dCor(ε², X) — variance-dependence (catches the hourglass)
  normality: NormalityCheck;     // Jarque–Bera on ε
  linear: boolean;               // every parent edge is linear
  identifiabilityWarning: boolean; // linear fit + Gaussian residuals ⇒ direction not identifiable
  worst: ResidualParentCheck | null;
  verdict: "ok" | "weak" | "violated";       // from the exogeneity p-value (the panel's headline)
  severity: "ok" | "weak" | "violated";      // WORST across all checks (drives the ε light + ledger)
  scale: FitLink;                            // the working scale residuals are computed on (log ⇒ "log-scale residuals")
  gate?: GateCheck | null;                   // two-part only: the extensive-margin (participation) check
}

// Cache full diagnostics by fit-output signature (coefficients + data) — the seeded permutation makes them
// deterministic, so identical inputs reuse the result. Lets the ε lights compute for every node cheaply.
const residCache = new Map<string, ResidualDiagnostic>();

// Deterministic RNG (seeded) so the permutation p-value is stable across renders (no flicker).
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// Double-centred Euclidean-distance matrix (Székely) of a UNIVARIATE series — flat Float64Array (row-major).
function centeredDist(v: number[]): Float64Array {
  const n = v.length;
  const d = new Float64Array(n * n);
  const rowMean = new Float64Array(n);
  let grand = 0;
  for (let i = 0; i < n; i += 1) { const vi = v[i]!, base = i * n; let rm = 0; for (let j = 0; j < n; j += 1) { const val = Math.abs(vi - v[j]!); d[base + j] = val; rm += val; } rowMean[i] = rm / n; grand += rm; }
  grand /= n * n;
  for (let i = 0; i < n; i += 1) { const rmi = rowMean[i]!, base = i * n; for (let j = 0; j < n; j += 1) d[base + j] = d[base + j]! - rmi - rowMean[j]! + grand; }
  return d;
}

// Same, for a MULTIVARIATE X (each column z-scored so no column dominates the Euclidean distance).
function centeredDistMulti(cols: number[][], n: number): Float64Array {
  const z = cols.map((c) => {
    let m = 0; for (let i = 0; i < n; i += 1) m += c[i]!; m /= n;
    let v = 0; for (let i = 0; i < n; i += 1) { const dd = c[i]! - m; v += dd * dd; }
    const sd = Math.sqrt(v / n) || 1;
    const out = new Float64Array(n); for (let i = 0; i < n; i += 1) out[i] = (c[i]! - m) / sd; return out;
  });
  const p = z.length;
  const d = new Float64Array(n * n);
  const rowMean = new Float64Array(n);
  let grand = 0;
  for (let i = 0; i < n; i += 1) {
    const base = i * n; let rm = 0;
    for (let j = 0; j < n; j += 1) { let s = 0; for (let k = 0; k < p; k += 1) { const dd = z[k]![i]! - z[k]![j]!; s += dd * dd; } const val = Math.sqrt(s); d[base + j] = val; rm += val; }
    rowMean[i] = rm / n; grand += rm;
  }
  grand /= n * n;
  for (let i = 0; i < n; i += 1) { const rmi = rowMean[i]!, base = i * n; for (let j = 0; j < n; j += 1) d[base + j] = d[base + j]! - rmi - rowMean[j]! + grand; }
  return d;
}

function frob(a: Float64Array, b: Float64Array): number { let s = 0; for (let k = 0; k < a.length; k += 1) s += a[k]! * b[k]!; return s; }

/** Distance correlation ∈ [0,1] of two UNIVARIATE series: 0 iff independent (Székely). */
export function distanceCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 4) return 0;
  const a = centeredDist(x), b = centeredDist(y);
  const denom = Math.sqrt(frob(a, a) * frob(b, b));
  return denom < 1e-12 ? 0 : Math.sqrt(Math.max(0, frob(a, b)) / denom);
}

/** dCor + PERMUTATION p-value: shuffle the pairing R times (breaks dependence) → exact null. Both matrices
 *  are pre-centred; permuting only re-pairs, so dVarX/dVarY stay fixed and only the cross term recomputes. */
function dcorPermTest(a: Float64Array, b: Float64Array, n: number, perms: number, seed: number): DcorTest {
  const dvx = frob(a, a), dvy = frob(b, b);
  const denom = Math.sqrt(dvx * dvy);
  if (denom < 1e-12) return { dcor: 0, pValue: 1 };
  const stat = Math.sqrt(Math.max(0, frob(a, b)) / denom);
  const rng = lcg(seed);
  const perm = new Int32Array(n); for (let i = 0; i < n; i += 1) perm[i] = i;
  let ge = 1; // +1 for the observed statistic itself (Monte-Carlo p-value)
  for (let r = 0; r < perms; r += 1) {
    for (let i = n - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); const t = perm[i]!; perm[i] = perm[j]!; perm[j] = t; }
    let num = 0;
    for (let i = 0; i < n; i += 1) { const base = i * n, pib = perm[i]! * n; for (let j = 0; j < n; j += 1) num += a[base + j]! * b[pib + perm[j]!]!; }
    if (Math.sqrt(Math.max(0, num) / denom) >= stat - 1e-12) ge += 1;
  }
  return { dcor: stat, pValue: ge / (perms + 1) };
}

/** Jarque–Bera non-Gaussianity of the residuals: JB = n/6·(S² + (K−3)²/4) ~ χ²₂ ⇒ p = e^(−JB/2). */
function jarqueBera(v: number[]): NormalityCheck {
  const n = v.length;
  let m = 0; for (const x of v) m += x; m /= n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const x of v) { const d = x - m, d2 = d * d; m2 += d2; m3 += d2 * d; m4 += d2 * d2; }
  m2 /= n; m3 /= n; m4 /= n;
  const sd = Math.sqrt(m2) || 1;
  const skewness = m3 / (sd * sd * sd);
  const excessKurtosis = m2 > 0 ? m4 / (m2 * m2) - 3 : 0;
  const jarqueBeraStat = (n / 6) * (skewness * skewness + (excessKurtosis * excessKurtosis) / 4);
  return { skewness, excessKurtosis, jarqueBera: jarqueBeraStat, pValue: Math.exp(-jarqueBeraStat / 2) };
}

/** RESIT-style residual diagnostics on a fitted CONTINUOUS data node. */
// cap/perms are generous because the result is CACHED by fit signature — it only recomputes when a fit
// actually changes, so power matters more than per-call speed here.
export function residualDiagnostics(document: GraphDocument, nodeId: string, cap = 240, perms = 199, seed = 0): ResidualDiagnostic {
  const empty: ResidualDiagnostic = { available: false, n: 0, perms, parents: [], points: [], independence: { dcor: 0, pValue: 1 }, heteroskedasticity: { dcor: 0, pValue: 1 }, normality: { skewness: 0, excessKurtosis: 0, jarqueBera: 0, pValue: 1 }, linear: true, identifiabilityWarning: false, worst: null, verdict: "ok", severity: "ok", scale: "identity", gate: null };
  const node = document.graph.nodes.find((n) => n.id === nodeId);
  const col = nodeColumn(document, nodeId);
  if (!node || !col) return empty;
  if (normalizeVariableModel(node.variable).valueType === "binary") return empty;
  if (!nodeGenerates(document, nodeId)) return empty; // only meaningful once a model is fit/authored
  const drawn = drawnDataParents(document, nodeId);
  if (drawn.length === 0) return empty;
  const rows = datasetRows(col.dataset);
  if (rows.length < 20) return empty;
  const mech = normalizeNodeMechanism(document.simulation.nodes[nodeId]);
  const parentCols = drawn
    .map((edge) => {
      const pc = nodeColumn(document, edge.source);
      const em = normalizeEdgeMechanism(document.simulation.edges[edge.id]);
      return { edge, col: pc, coef: em.kind === "linear" ? em.coefficient : 0, kind: em.kind, label: document.graph.nodes.find((n) => n.id === edge.source)?.label ?? edge.source };
    })
    .filter((p): p is typeof p & { col: NonNullable<typeof p.col> } => Boolean(p.col));
  if (parentCols.length === 0) return empty;

  const sig = `${col.dataset}|${rows.length}|${col.dataColumn}|${mech.intercept}|${normalizeVariableModel(node.variable).valueType}|cap${cap}|p${perms}|s${seed}|` +
    parentCols.map((p) => `${p.col.dataColumn}:${p.coef}`).join(",") +
    (mech.gate ? `|g${mech.gate.intercept}:${parentCols.map((p) => mech.gate!.coefficients[p.edge.source] ?? 0).join(",")}` : "");
  const cached = residCache.get(sig);
  if (cached) return cached;

  // Residuals live on the node's LINK scale (log(Y)−η̂ for a log-linked node), so ε⊥X and the normality
  // check test the assumption the model actually makes. Rows outside the link domain (Y≤0 under log) drop out.
  const scale = linkForValueType(normalizeVariableModel(node.variable).valueType).link;
  const gy = rows.map((r) => applyLink(r[col.dataColumn] ?? 0, scale));
  const fitted = rows.map((r) => mech.intercept + parentCols.reduce((s, p) => s + p.coef * (r[p.col.dataColumn] ?? 0), 0));
  const resid = gy.map((v, i) => v - fitted[i]!);
  const valid: number[] = [];
  for (let i = 0; i < rows.length; i += 1) if (Number.isFinite(resid[i])) valid.push(i);
  if (valid.length < 20) return empty;
  const stride = Math.max(1, Math.floor(valid.length / cap));
  const idx: number[] = [];
  for (let k = 0; k < valid.length; k += stride) idx.push(valid[k]!);
  const n = idx.length;
  const rs = idx.map((i) => resid[i]!);
  const parentSeries = parentCols.map((p) => idx.map((i) => rows[i]![p.col.dataColumn] ?? 0));

  const parents: ResidualParentCheck[] = parentCols.map((p, k) => ({ nodeId: p.edge.source, label: p.label, distanceCorr: distanceCorrelation(rs, parentSeries[k]!) }));
  const worst = parents.reduce<ResidualParentCheck | null>((w, p) => (!w || p.distanceCorr > w.distanceCorr ? p : w), null);

  const aX = centeredDistMulti(parentSeries, n);
  const independence = dcorPermTest(aX, centeredDist(rs), n, perms, (0x1a2b3c ^ seed) >>> 0);
  const heteroskedasticity = dcorPermTest(aX, centeredDist(rs.map((r) => r * r)), n, perms, (0x4d5e6f ^ seed) >>> 0);
  const normality = jarqueBera(rs);
  const linear = parentCols.every((p) => p.kind === "linear");
  const identifiabilityWarning = linear && normality.pValue > 0.1; // linear + Gaussian residuals ⇒ unidentifiable
  const verdict = independence.pValue >= 0.1 ? "ok" : independence.pValue >= 0.01 ? "weak" : "violated";

  // Two-part extensive margin (gate): over ALL rows (participation is observed for everyone, unlike the
  // Y>0-only intensive residuals above), check the gate is calibrated and its residual 1(Y>0)−P̂ is ⊥ X.
  let gate: GateCheck | null = null;
  const gm = mech.gate;
  if (normalizeVariableModel(node.variable).valueType === "semicontinuous" && gm) {
    const gValid: number[] = [];
    for (let i = 0; i < rows.length; i += 1) if (parentCols.every((p) => Number.isFinite(rows[i]![p.col.dataColumn]))) gValid.push(i);
    if (gValid.length >= 20) {
      const gstride = Math.max(1, Math.floor(gValid.length / cap));
      const gidx: number[] = [];
      for (let k = 0; k < gValid.length; k += gstride) gidx.push(gValid[k]!);
      const gn = gidx.length;
      const sgm = (x: number) => 1 / (1 + Math.exp(-x));
      const part: number[] = gidx.map((i) => ((rows[i]![col.dataColumn] ?? 0) > 0 ? 1 : 0));
      const pPred = gidx.map((i) => sgm(gm.intercept + parentCols.reduce((s, p) => s + (gm.coefficients[p.edge.source] ?? 0) * (rows[i]![p.col.dataColumn] ?? 0), 0)));
      const gResid = part.map((y, k) => y - pPred[k]!);
      const gSeries = parentCols.map((p) => gidx.map((i) => rows[i]![p.col.dataColumn] ?? 0));
      const gInd = dcorPermTest(centeredDistMulti(gSeries, gn), centeredDist(gResid), gn, perms, (0x7a8b9c ^ seed) >>> 0);
      gate = { rate: part.reduce((a, b) => a + b, 0) / gn, predictedRate: pPred.reduce((a, b) => a + b, 0) / gn, independence: gInd };
    }
  }

  // The ε light reflects the WORST check: a clear exogeneity violation (intensive OR gate) is red; a
  // borderline exogeneity, failing homoskedasticity, strong non-Gaussianity, or a weak gate is yellow.
  const gateBad = gate ? gate.independence.pValue < 0.01 : false;
  const gateWeak = gate ? gate.independence.pValue < 0.05 : false;
  const severity: "ok" | "weak" | "violated" = (independence.pValue < 0.01 || gateBad)
    ? "violated"
    : (independence.pValue < 0.1 || heteroskedasticity.pValue < 0.05 || normality.pValue < 0.01 || gateWeak) ? "weak" : "ok";
  const points = idx.map((i) => ({ fitted: fitted[i]!, residual: resid[i]! }));
  const result: ResidualDiagnostic = { available: true, n, perms, parents, points, independence, heteroskedasticity, normality, linear, identifiabilityWarning, worst, verdict, severity, scale, gate };
  if (residCache.size > 400) residCache.clear();
  residCache.set(sig, result);
  return result;
}
