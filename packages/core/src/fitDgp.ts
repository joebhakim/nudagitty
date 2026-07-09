import type { GraphDocument } from "./types";
import { cloneDocument, normalizeEdgeMechanism, normalizeNodeMechanism, normalizeVariableModel, reconcileSimulationSpec } from "./graph";
import { setLinearCoefficient, setNode, ZERO_NOISE } from "./examples/builders";
import { datasetRows, registerRuntimeDataset } from "./datasets";

// ---------- provenance keys ----------
const edgeKey = (id: string) => `e:${id}`;
const interceptKey = (id: string) => `ni:${id}`;
const noiseKey = (id: string) => `nn:${id}`;

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
  const document = cloneDocument(input);
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
    const isBinary = normalizeVariableModel(node.variable).valueType === "binary";
    const fitIntercept = pinSet.has(interceptKey(nodeId));
    const fitNoise = !isBinary && pinSet.has(noiseKey(nodeId));
    const mech = normalizeNodeMechanism(document.simulation.nodes[nodeId]);

    const y = rows.map((r) => r[col.dataColumn] ?? 0);
    const offset = rows.map((r) => {
      let o = fitIntercept ? 0 : mech.intercept;
      for (const edge of authoredEdges) {
        const em = normalizeEdgeMechanism(document.simulation.edges[edge.id]);
        const coef = em.kind === "linear" ? em.coefficient : 0;
        o += coef * (r[nodeColumn(document, edge.source)!.dataColumn] ?? 0);
      }
      return o;
    });
    const X = rows.map((r) => pinnedEdges.map((edge) => r[nodeColumn(document, edge.source)!.dataColumn] ?? 0));
    const fit = fitLinearModel(y, X, offset, fitIntercept, isBinary);
    if (!fit) continue;

    for (let j = 0; j < pinnedEdges.length; j += 1) {
      const edge = pinnedEdges[j]!;
      const before = (() => { const em = normalizeEdgeMechanism(document.simulation.edges[edge.id]); return em.kind === "linear" ? em.coefficient : 0; })();
      setLinearCoefficient(document, edge.source, nodeId, fit.coefs[j] ?? 0);
      bump(edgeKey(edge.id), before, fit.coefs[j] ?? 0);
    }
    const newIntercept = fitIntercept ? fit.intercept : mech.intercept;
    const currentSd = mech.noise.kind === "normal" ? mech.noise.sd : 1;
    const newNoise = isBinary ? ZERO_NOISE : { kind: "normal" as const, mean: 0, sd: fitNoise ? fit.residualSd : currentSd };
    setNode(document, nodeId, { ...mech, intercept: newIntercept, combiner: isBinary ? "bernoulli_logit" : "additive", noise: newNoise });
    if (fitIntercept) bump(interceptKey(nodeId), mech.intercept, newIntercept);
    if (fitNoise) bump(noiseKey(nodeId), currentSd, fit.residualSd);
  }

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
