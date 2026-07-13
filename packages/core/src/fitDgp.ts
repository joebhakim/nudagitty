import type { EdgeMechanism, GraphDocument, ImposedEffect, NodeCombinerKind, NodeGate } from "./types";
import { addEdge, addNode, cloneDocument, defaultEdgeMechanism, normalizeEdgeMechanism, normalizeNodeMechanism, normalizeVariableModel, reconcileSimulationSpec, withGraph } from "./graph";
import { setLinearCoefficient, setNode, ZERO_NOISE } from "./examples/builders";
import { datasetRows, lookupDataset, registerRuntimeDataset } from "./datasets";
import { findPointMassColumn, pointMassColumnName, pointMassShare, withPointMassIndicator } from "./data/pointMass";
import { edgeBaseline, edgeBasis, edgeContribution } from "./simulation/interpreter";

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

// The two-part GATE fit has its own, narrower dependency set: it regresses 1(Y>0) on the PINNED parents with
// a zero offset, so it does NOT depend on any AUTHORED coefficient. Without a separate signature, authoring a
// treatment effect (which lives on the intensive margin) invalidates the whole node and needlessly re-runs the
// expensive logistic IRLS. That made the two-part example's solve→reconcile fixed-point loop ~5x slower than
// it needs to be, and slowed opening the example in the app.
const gateSigCache = new Map<string, string>();

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

// ---------- fittable edge mechanisms: the user authors the FORM, the fit learns the SCALE ----------
//
// A mechanism is FITTABLE iff its contribution is `coefficient · f(x) + const` for some FIXED f. Then the
// design column is f(x), the fitted number is `coefficient`, and everything else on the mechanism (offset,
// scale, exponent, baseline) is AUTHORED SHAPE the fit must not touch. That one rule is what turns "specify
// the functional form, then fit what ought to be fitted" into a single code path:
//
//   linear      f(x) = x
//   log_linear  f(x) = log(x + offset)             ← the MINCER transform: log your dollar regressors
//   power_law   f(x) = ((x + offset)/scale)^exp
//
// This is not a nicety. Fitting earnings with a LOG LINK on DOLLAR-VALUED regressors makes E[Y|L] exponential
// in dollars, which manufactured a $2.9M tail (real max: $121k) and skew 33 (real: 1.3) — and made an
// analyst's OLS report +$14,599 where the real rows give +$752. The benchmark was punishing estimators for a
// world we invented. log_linear on the earnings-history edges is the fix.
//
// Anything else (splines, thresholds, hill) is not linear in one parameter, so it is treated as AUTHORED: its
// contribution enters the fit as a fixed per-row offset, computed by the SIMULATOR'S OWN edgeContribution so
// the fit and the generator cannot disagree.
// (edgeBasis / edgeBaseline live in the interpreter, next to edgeContribution, so the fit and the generator
// can never drift apart on what a given functional form MEANS.)
function readCoefficient(mech: EdgeMechanism): number {
  return mech.kind === "linear" || mech.kind === "log_linear" || mech.kind === "power_law" ? mech.coefficient : 0;
}
/**
 * Write a fitted coefficient back WITHOUT clobbering the authored shape. `setLinearCoefficient` replaces the
 * whole mechanism with a DEFAULT LINEAR one, so using it here would silently undo the user's chosen
 * functional form on every reconcile — the fit would quietly delete the very thing they specified.
 */
function writeFittedCoefficient(document: GraphDocument, edgeId: string, coefficient: number): void {
  const em = normalizeEdgeMechanism(document.simulation.edges[edgeId]);
  if (em.kind === "linear" || em.kind === "log_linear" || em.kind === "power_law") {
    document.simulation.edges[edgeId] = { ...em, coefficient };
  }
}

// ---------- graph provenance helpers ----------
// A node's data column, from its table_lookup edge (enabled OR disabled — a fitted node keeps a DISABLED
// lookup so we can still re-fit against its column and re-enabling restores replay).
export function nodeColumn(document: GraphDocument, nodeId: string): { dataset: string; dataColumn: number; lookupEdgeId: string; enabled: boolean } | null {
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

// ================= imposed effect: derive the coefficients from the authored ESTIMAND =================
//
// You author an ATE. The coefficient that encodes it is DERIVED — never stored as the source of truth,
// because a stored coefficient becomes a lie the moment the fit changes.
//
// For an ADDITIVE outcome the coefficient IS the ATE (do(1)−do(0) = β for every unit), so this is trivial.
// For a TWO-PART outcome it is not. Treatment acts on two margins:
//     P(Y>0) = σ(ηg + γ·T)          γ in LOG-ODDS
//     E[Y|Y>0] = exp(ηa + δ·T + h)  δ in LOG-DOLLARS,  h = σ²/2
// Neither is in dollars, and the per-unit dollar effect is heterogeneous, so NO coefficient equals the ATE.
// "ATE = A" is ONE equation in TWO unknowns ⇒ a ONE-PARAMETER FAMILY of causal stories. `extensiveShare`
// picks the member: how much of the effect comes from MORE PEOPLE WORKING vs HIGHER PAY AMONG WORKERS.
//
// δ factors out of the intensive term (exp(ηa+δ+h) = e^δ·exp(ηa+h)), which collapses the whole thing:
//     ATE(γ,δ) = e^δ·S(γ) − C₀      S(γ) = mean[σ(ηg+γ)·exp(ηa+h)],  C₀ = S(0)
//   ⇒ δ(γ) = ln((C₀ + A) / S(γ))                      ← the entire iso-ATE contour, in closed form
//   ⇒ extensive(γ) = S(γ) − C₀                        ← so solving for a share is a 1-D bisection on S
//
// FEASIBILITY IS REAL, not decorative. S(γ) ≤ S(∞) = Amax = mean[exp(ηa+h)] (everyone works), so:
//     max extensive-only effect = Amax − C₀      and      δ ≥ ln((C₀+A)/Amax)
// On lalonde-obs with A=$1,794: C₀=$20,614, Amax=$22,087 ⇒ the extensive margin can deliver AT MOST $1,473.
// The target is UNREACHABLE by employment alone: pay must rise ≥1.5%, and the extensive share can never
// exceed ~82%. We clamp to that and say so.
export interface ImposedEffectContext {
  family: "additive" | "log" | "two_part";
  exposure: string;
  outcome: string;
  edgeId: string;
  target: number;
  /** Two-part / log only. C₀ = mean outcome under do(T=0); Amax = S(∞), everyone participates. */
  c0: number;
  amax: number;
  /** S(γ) = mean[σ(ηg+γ)·exp(ηa+h)] — the participation-weighted mean amount. Monotone increasing. */
  s: (gamma: number) => number;
  /** The largest extensive share the DATA can actually deliver: (Amax − C₀)/target, clamped to [0,1]. */
  maxExtensiveShare: number;
  /** δ can never go below this — pay must rise at least this much, whatever γ does. */
  deltaFloor: number;
  /** The iso-ATE contour: given γ, the δ that holds the ATE at exactly `target`. */
  deltaFor: (gamma: number) => number;
  /** The dollar decomposition at a point on the contour (extensive + intensive === target). */
  decompose: (gamma: number, delta: number) => { extensive: number; intensive: number; ate: number };
  /** Solve the contour for a requested extensive share (clamped to what's feasible). */
  solve: (share: number) => ImposedEffectSolution;
}

export interface ImposedEffectSolution {
  gamma: number;             // gate shift (0 for non-two-part)
  delta: number;             // the edge coefficient, on the outcome's link scale
  extensiveShare: number;    // the share ACTUALLY used, after the feasibility clamp
  clamped: boolean;          // true if the request was infeasible
  extensive: number;         // dollars delivered by the extensive margin
  intensive: number;         // dollars delivered by the intensive margin
}

const sigmoid01 = (x: number) => 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, x))));

/** Bisection for a monotone-increasing f: find x with f(x) = target, expanding the bracket as needed. */
function bisectMonotone(f: (x: number) => number, target: number, lo: number, hi: number): number {
  let a = lo, b = hi;
  for (let k = 0; k < 80 && f(b) < target; k += 1) b *= 2;
  for (let k = 0; k < 100; k += 1) { const m = (a + b) / 2; if (f(m) < target) a = m; else b = m; }
  return (a + b) / 2;
}

/**
 * Build the solve context from the CURRENT fitted state. Pure — no mutation — so the editor's manifold pad
 * can call it to draw the ATE field, the iso-ATE contour and the infeasible band from exactly the same math
 * the engine uses. Returns null if there's no imposed effect (or nothing to solve against).
 */
export function imposedEffectContext(document: GraphDocument, override?: ImposedEffect): ImposedEffectContext | null {
  const imposed = override ?? document.metadata.imposedEffect;
  if (!imposed || !Number.isFinite(imposed.target)) return null;

  // Fall back to the graph's exposure/outcome roles, so a legacy doc (bare `imposedEffect: 1794`) still works.
  const exposure = imposed.exposure ?? document.graph.nodes.find((n) => n.roles?.exposure)?.id;
  const outcome = imposed.outcome ?? document.graph.nodes.find((n) => n.roles?.outcome)?.id;
  if (!exposure || !outcome) return null;

  const edge = document.graph.edges.find((e) => e.source === exposure && e.target === outcome && e.kind === "directed");
  if (!edge) return null;
  const outcomeNode = document.graph.nodes.find((n) => n.id === outcome);
  if (!outcomeNode) return null;

  const valueType = normalizeVariableModel(outcomeNode.variable).valueType;
  const family: ImposedEffectContext["family"] =
    valueType === "semicontinuous" ? "two_part" : valueType === "positive" ? "log" : "additive";
  const target = imposed.target;

  // ADDITIVE: the coefficient IS the ATE. No data needed — this is why the additive example is
  // hand-reproducible (you literally type the number).
  if (family === "additive") {
    const solve = (): ImposedEffectSolution => ({ gamma: 0, delta: target, extensiveShare: 0, clamped: false, extensive: 0, intensive: target });
    return {
      family, exposure, outcome, edgeId: edge.id, target,
      c0: 0, amax: 0, s: () => 0, maxExtensiveShare: 0, deltaFloor: -Infinity,
      deltaFor: () => target,
      decompose: () => ({ extensive: 0, intensive: target, ate: target }),
      solve
    };
  }

  // Nonlinear families need the covariate distribution, which we read from the outcome's data rows.
  const col = nodeColumn(document, outcome);
  if (!col) return null;
  const rows = datasetRows(col.dataset);
  if (rows.length < 4) return null;

  const mech = normalizeNodeMechanism(document.simulation.nodes[outcome]);
  const sd = mech.noise.kind === "normal" ? mech.noise.sd : 0;
  const h = (sd * sd) / 2;
  const gate = mech.gate;

  // η's over the CONFOUNDERS ONLY — the exposure's own contribution is exactly what γ/δ add, so it must be
  // excluded here or we'd double-count it.
  const confounders = drawnDataParents(document, outcome)
    .filter((e) => e.source !== exposure)
    .map((e) => {
      const pc = nodeColumn(document, e.source);
      const em = normalizeEdgeMechanism(document.simulation.edges[e.id]);
      // The confounder's contribution is whatever its MECHANISM says it is (a log_linear edge contributes
      // coef·log(1+x), not coef·x) — read it from the simulator so the solve matches what will be generated.
      return { source: e.source, col: pc, mech: em, basis: edgeBasis(em) };
    })
    .filter((c): c is typeof c & { col: NonNullable<typeof c.col> } => Boolean(c.col));

  const etaG: number[] = [], amount: number[] = [];
  for (const r of rows) {
    let g = gate?.intercept ?? 0, a = mech.intercept;
    for (const c of confounders) {
      const v = r[c.col.dataColumn] ?? 0;
      a += edgeContribution(v, c.mech);
      // The gate's coefficients were FIT on the basis columns, so they must be applied to basis(v) here too.
      g += (gate?.coefficients[c.source] ?? 0) * (c.basis ? c.basis(v) : v);
    }
    etaG.push(g);
    amount.push(Math.exp(a + h)); // exp(ηa + h) — the baseline expected amount for this row
  }
  const n = rows.length;

  // LOG (single-part, no gate): everyone "participates", so ATE = (e^δ − 1)·Ā ⇒ δ = ln(1 + A/Ā).
  const abar = amount.reduce((s, v) => s + v, 0) / n;
  if (family === "log") {
    const delta = Math.log(1 + target / Math.max(1e-9, abar));
    const solve = (): ImposedEffectSolution => ({ gamma: 0, delta, extensiveShare: 0, clamped: false, extensive: 0, intensive: target });
    return {
      family, exposure, outcome, edgeId: edge.id, target,
      c0: abar, amax: abar, s: () => abar, maxExtensiveShare: 0, deltaFloor: -Infinity,
      deltaFor: () => delta,
      decompose: () => ({ extensive: 0, intensive: target, ate: target }),
      solve
    };
  }

  // TWO-PART.
  const s = (gamma: number) => {
    let acc = 0;
    for (let i = 0; i < n; i += 1) acc += sigmoid01(etaG[i]! + gamma) * amount[i]!;
    return acc / n;
  };
  const c0 = s(0);
  const amax = abar;                                     // S(+∞): everyone participates
  const maxExtensive = Math.max(0, amax - c0);           // the most employment alone can ever deliver
  const maxExtensiveShare = target > 0 ? Math.min(1, maxExtensive / target) : 0;
  const deltaFloor = Math.log((c0 + target) / Math.max(1e-9, amax));
  const deltaFor = (gamma: number) => Math.log((c0 + target) / Math.max(1e-9, s(gamma)));

  const decompose = (gamma: number, delta: number) => {
    let extensive = 0, intensive = 0, ate = 0;
    for (let i = 0; i < n; i += 1) {
      const p0 = sigmoid01(etaG[i]!), p1 = sigmoid01(etaG[i]! + gamma);
      const a0 = amount[i]!, a1 = a0 * Math.exp(delta);
      extensive += (p1 - p0) * a0;   // change WHO works, amount at baseline
      intensive += p1 * (a1 - a0);   // change HOW MUCH, among (new) workers
      ate += p1 * a1 - p0 * a0;      // the actual two-part do()-contrast (== extensive + intensive)
    }
    return { extensive: extensive / n, intensive: intensive / n, ate: ate / n };
  };

  const solve = (requestedShare: number): ImposedEffectSolution => {
    const want = Math.max(0, Math.min(1, requestedShare));
    const share = Math.min(want, maxExtensiveShare);
    const clamped = share < want - 1e-9;
    // extensive(γ) = S(γ) − C₀, so target the level S(γ) = C₀ + share·A. Monotone ⇒ bisection is safe.
    const gamma = share <= 0 ? 0 : bisectMonotone(s, c0 + share * target, 0, 8);
    const delta = deltaFor(gamma);
    const d = decompose(gamma, delta);
    return { gamma, delta, extensiveShare: share, clamped, extensive: d.extensive, intensive: d.intensive };
  };

  return { family, exposure, outcome, edgeId: edge.id, target, c0, amax, s, maxExtensiveShare, deltaFloor, deltaFor, decompose, solve };
}

/** Which edge an imposed effect lives on. Cheap — no dataset reads (unlike imposedEffectContext). */
export function imposedEffectEdge(document: GraphDocument): { exposure: string; outcome: string; edgeId: string } | null {
  const imposed = document.metadata.imposedEffect;
  if (!imposed || !Number.isFinite(imposed.target)) return null;
  const exposure = imposed.exposure ?? document.graph.nodes.find((n) => n.roles?.exposure)?.id;
  const outcome = imposed.outcome ?? document.graph.nodes.find((n) => n.roles?.outcome)?.id;
  if (!exposure || !outcome) return null;
  const edge = document.graph.edges.find((e) => e.source === exposure && e.target === outcome && e.kind === "directed");
  return edge ? { exposure, outcome, edgeId: edge.id } : null;
}

/**
 * Who owns a two-part node's GATE coefficient for a given parent.
 *
 * The gate is a SECOND coefficient vector on the node (`mechanism.gate.coefficients`), NOT on the edges — so
 * unlike an edge coefficient it has no provenance key of its own. That left the editor unable to tell whether
 * typing into a gate cell would stick, and in two of the three cases it silently would NOT:
 *
 *   DERIVED  — an imposed effect covers this parent. reconcilePins re-solves γ from the ESTIMAND on every
 *              commit, so a typed value is overwritten immediately. (You move γ by moving the STORY — the
 *              extensive/intensive split — not by typing a log-odds.)
 *   FITTED   — the parent's edge is pinned, so the gate logistic learns γ. A typed value is overwritten when
 *              the gate's signature changes (the data or the parent set) — i.e. it appears to stick, then
 *              reverts LATER. The silent-revert is the nastier of the two lies.
 *   AUTHORED — the parent's edge is authored and no imposed effect covers it. You genuinely own γ.
 *   NOT-LEARNED — no gate coefficient for this parent.
 *
 * A parent's provenance governs BOTH of its margins (gate and intensive); an imposed effect overrides the
 * exposure's parent to `derived`. Per-margin provenance (fit the gate but author the intensive, for the SAME
 * parent) would need real keys — logged, not built.
 */
export type GateNumberState = "derived" | "fitted" | "authored" | "not-learned";
export function gateCoefficientState(document: GraphDocument, nodeId: string, parentId: string): GateNumberState {
  const node = document.graph.nodes.find((n) => n.id === nodeId);
  if (!node || normalizeVariableModel(node.variable).valueType !== "semicontinuous") return "not-learned";
  const edge = document.graph.edges.find((e) => e.source === parentId && e.target === nodeId && e.kind === "directed");
  if (!edge) return "not-learned";

  // PRECEDENCE MUST MIRROR THE ENGINE. applyImposed() stands down when the effect edge is PINNED (you are
  // FITTING the effect, not imposing it — see the fit-vs-author trap), and the gate logistic then learns γ
  // like any other pinned parent. So `fitted` outranks `derived`; get this backwards and the helper simply
  // tells a different lie.
  if (document.metadata.pins?.includes(edgeKey(edge.id))) return "fitted";

  const imposed = imposedEffectEdge(document);
  if (imposed && imposed.edgeId === edge.id) return "derived";

  const gate = normalizeNodeMechanism(document.simulation.nodes[nodeId]).gate;
  return gate && Object.hasOwn(gate.coefficients, parentId) ? "authored" : "not-learned";
}

/**
 * Re-author the imposed effect's STORY (how much of it runs through the extensive margin) or its TARGET.
 * You never set γ/δ — reconcilePins derives them. The share is clamped to what the data can deliver.
 */
export function setImposedEffect(input: GraphDocument, patch: Partial<ImposedEffect>): GraphDocument {
  const current = input.metadata.imposedEffect;
  if (!current) return input;
  const next = { ...current, ...patch };
  if (next.target === current.target && next.extensiveShare === current.extensiveShare) return input;
  const document = cloneDocument(input);
  document.metadata.imposedEffect = next;
  return document;
}

// ---------- creating an imposed effect ----------
//
// WHY you impose rather than fit. Fitting the exposure→outcome edge is a multiple regression on all the
// pinned parents, so its coefficient is the ADJUSTED association — which, under exchangeability given those
// parents, IS the outcome-regression estimate of the causal effect. That sounds like the right thing to do,
// and it is exactly the wrong thing to do HERE, because it makes the benchmark CIRCULAR: the DGP's "truth"
// becomes the estimator's answer, so outcome regression scores 100% by construction and you conclude
// "adjustment works" having merely assumed it. For a benchmark that can FAIL, the truth has to come from
// OUTSIDE the estimation — e.g. LaLonde's actual randomised experiment (+$1,794). That is what imposing is.
//
// (On lalonde-obs the adjusted coefficient is −0.413 on the log scale — a 34% DROP — when the experimental
// truth is +3%. That is not a bug in the fit: it is the LaLonde finding. Adjustment cannot rescue PSID
// controls, and an example that fitted this edge would quietly hide precisely that.)

/** What the DATA says about the effect — the outcome-regression estimate, on BOTH margins. Never a truth. */
export interface DataImpliedEffect {
  gamma: number;              // adjusted gate coefficient on the exposure (log-odds of participating)
  delta: number;              // adjusted intensive coefficient on the exposure (log-dollars, among Y>0)
  extensive: number;          // dollars the gate move delivers
  intensive: number;          // dollars the amount move delivers
  ate: number;                // extensive + intensive — the ADJUSTED estimate, not the truth
  /**
   * extensive / ate, when that is a usable split. NULL when it is not — which happens whenever the two
   * margins fight (one positive, one negative) or the adjusted effect is ≤ 0. Then the data cannot even
   * suggest a SHAPE, and the UI must say so rather than invent one.
   */
  extensiveShare: number | null;
}

/**
 * Fit both margins of a two-part outcome on [confounders…, exposure] and decompose the implied dollar effect.
 *
 * This is the honest answer to "can't the data just tell me?". It can tell you something — but only about
 * the SHAPE (how the effect splits across margins), and even that only when the two margins agree. The
 * MAGNITUDE it reports is the confounded-adjusted estimate, which is the very number the example exists to
 * refute. So: take the shape from the data, take the magnitude from the experiment.
 */
export function dataImpliedEffect(document: GraphDocument, exposureId: string, outcomeId: string): DataImpliedEffect | null {
  const outcomeNode = document.graph.nodes.find((n) => n.id === outcomeId);
  if (!outcomeNode || normalizeVariableModel(outcomeNode.variable).valueType !== "semicontinuous") return null;

  const col = nodeColumn(document, outcomeId);
  const expCol = nodeColumn(document, exposureId);
  if (!col || !expCol) return null;
  const rows = datasetRows(col.dataset);
  if (rows.length < 8) return null;

  // Predictors: the outcome's other data parents, then the exposure LAST (so its coefficient is coefs[p-1]).
  const confounders = drawnDataParents(document, outcomeId)
    .filter((e) => e.source !== exposureId)
    .map((e) => ({ source: e.source, col: nodeColumn(document, e.source) }))
    .filter((c): c is { source: string; col: NonNullable<ReturnType<typeof nodeColumn>> } => Boolean(c.col));
  const predictors = [...confounders.map((c) => c.col.dataColumn), expCol.dataColumn];
  const p = predictors.length;

  const y = rows.map((r) => r[col.dataColumn] ?? 0);
  const X = rows.map((r) => predictors.map((j) => r[j] ?? 0));
  const positive: number[] = y.map((v) => (v > 0 ? 1 : 0));
  const nPos = positive.reduce((s, v) => s + v, 0);
  if (nPos < p + 2 || nPos === rows.length) return null;   // no zeros ⇒ no gate ⇒ no split to speak of

  const gateFit = fitLinearModel(positive, X, new Array(rows.length).fill(0), true, true);
  if (!gateFit) return null;
  const posIdx = y.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
  const amtFit = fitLinearModel(
    posIdx.map((i) => Math.log(y[i]!)),
    posIdx.map((i) => X[i]!),
    new Array(posIdx.length).fill(0), true, false
  );
  if (!amtFit) return null;

  const gamma = gateFit.coefs[p - 1]!;
  const delta = amtFit.coefs[p - 1]!;
  const h = (amtFit.residualSd * amtFit.residualSd) / 2;

  // Decompose over the CONFOUNDER-only linear predictors — same construction as imposedEffectContext, so
  // this share is directly comparable to the one the pad solves for.
  let extensive = 0, intensive = 0, ate = 0;
  for (const row of rows) {
    let g = gateFit.intercept, a = amtFit.intercept;
    for (let j = 0; j < confounders.length; j += 1) {
      const v = row[predictors[j]!] ?? 0;
      g += gateFit.coefs[j]! * v;
      a += amtFit.coefs[j]! * v;
    }
    const p0 = sigmoid01(g), p1 = sigmoid01(g + gamma);
    const a0 = Math.exp(a + h), a1 = a0 * Math.exp(delta);
    extensive += (p1 - p0) * a0;
    intensive += p1 * (a1 - a0);
    ate += p1 * a1 - p0 * a0;
  }
  const n = rows.length;
  extensive /= n; intensive /= n; ate /= n;

  // A share is only meaningful when both margins push the SAME way and the total is positive. Otherwise the
  // ratio is a number without a story (e.g. share = 3.1 because the intensive margin is −$8k).
  const usable = ate > 0 && extensive >= 0 && intensive >= 0;
  return { gamma, delta, extensive, intensive, ate, extensiveShare: usable ? extensive / ate : null };
}

/** Where a default extensive/intensive split comes from, so the UI can be honest about it. */
export interface ShareSuggestion {
  share: number;
  basis:
    | "both-margins"  // the data's γ̂ AND δ̂ agree in sign — the full split is usable as-is
    | "gate-only"     // δ̂ is unusable, so we adopt γ̂ and SOLVE the amount for the target
    | "none";         // the data has nothing to say (or the family has no split)
  implied: DataImpliedEffect | null;
  clamped: boolean;   // the data's shape exceeded what the target can feasibly deliver
}

/**
 * Ask the data for the SHAPE, given a target you brought from outside.
 *
 * On lalonde-obs the two margins FIGHT: γ̂ = +0.25 (employment up — right sign) but δ̂ = −0.45 (pay down 36%
 * — badly confounded), so the full split is meaningless (extensive +$304 against intensive −$8,733). We fall
 * back to `gate-only`: adopt γ̂, then solve δ from the iso-ATE contour so the ATE is still exactly the target.
 * That is defensible — the gate is a logistic on WHETHER SOMEONE WORKS, which the PSID contamination distorts
 * far less than it distorts dollar amounts — but it is a suggestion, not a truth, and the UI says so.
 */
export function suggestImposedShare(
  document: GraphDocument, exposure: string, outcome: string, target: number,
  /** Pass a memoized `dataImpliedEffect` — it runs two IRLS fits over every row, so the editor must not
   *  redo it on each keystroke. It does not depend on `target`, only the doc. */
  cached?: DataImpliedEffect | null
): ShareSuggestion {
  const implied = cached !== undefined ? cached : dataImpliedEffect(document, exposure, outcome);
  const ctx = imposedEffectContext(document, { target, exposure, outcome });
  if (!ctx || ctx.family !== "two_part" || !implied) return { share: 0, basis: "none", implied, clamped: false };

  const clamp = (raw: number) => ({
    share: Math.max(0, Math.min(ctx.maxExtensiveShare, raw)),
    clamped: raw > ctx.maxExtensiveShare + 1e-9 || raw < -1e-9
  });
  if (implied.extensiveShare !== null) {
    const { share, clamped } = clamp(implied.extensiveShare);
    return { share, basis: "both-margins", implied, clamped };
  }
  if (implied.gamma > 0 && target > 0) {
    const { share, clamped } = clamp((ctx.s(implied.gamma) - ctx.c0) / target);
    return { share, basis: "gate-only", implied, clamped };
  }
  return { share: 0, basis: "none", implied, clamped: false };
}

/** Can this edge carry an imposed effect? (Both ends must be data columns; the target must be fittable.) */
export function imposableEffect(document: GraphDocument, edgeId: string): { exposure: string; outcome: string; family: ImposedEffectContext["family"] } | null {
  const edge = document.graph.edges.find((e) => e.id === edgeId);
  if (!edge || edge.kind !== "directed") return null;
  if (document.metadata.imposedEffect) return null;                       // one at a time — already imposed
  if (!nodeColumn(document, edge.source) || !nodeColumn(document, edge.target)) return null;
  if (drawnDataParents(document, edge.target).length === 0) return null;  // nothing fitted to impose ON TOP OF
  const node = document.graph.nodes.find((n) => n.id === edge.target);
  if (!node) return null;
  const vt = normalizeVariableModel(node.variable).valueType;
  if (vt === "binary" || vt === "categorical" || vt === "count") return null;  // no solver for these yet
  return {
    exposure: edge.source,
    outcome: edge.target,
    family: vt === "semicontinuous" ? "two_part" : vt === "positive" ? "log" : "additive"
  };
}

/**
 * Declare the causal effect this DGP carries. You give the ESTIMAND (a number in the outcome's own units);
 * reconcilePins derives whatever coefficients encode it. Two side-effects are load-bearing:
 *
 *  1. the outcome is switched from READING its data column to GENERATING (a node replaying data ignores its
 *     equation entirely, so an "imposed" effect on it would be invisible); and
 *  2. the effect edge is marked AUTHORED — a PINNED edge means "learn the effect from data", which is the
 *     circularity above, and applyImposed deliberately stands down when it sees one.
 */
export function imposeEffect(input: GraphDocument, spec: { exposure: string; outcome: string; target: number; extensiveShare?: number }): GraphDocument {
  const edge = input.graph.edges.find((e) => e.source === spec.exposure && e.target === spec.outcome && e.kind === "directed");
  if (!edge || !Number.isFinite(spec.target)) return input;

  let document = input;
  const col = nodeColumn(document, spec.outcome);
  if (col?.enabled && drawnDataParents(document, spec.outcome).length > 0) document = pinNodeEquation(document, spec.outcome);
  document = authorNumber(document, edgeKey(edge.id));

  const doc = cloneDocument(document);
  doc.metadata.imposedEffect = { target: spec.target, exposure: spec.exposure, outcome: spec.outcome };
  if (spec.extensiveShare !== undefined) {
    doc.metadata.imposedEffect.extensiveShare = spec.extensiveShare;
    return doc;
  }

  // No split given ⇒ ask the data for one. This needs the FITTED state (the confounder η's), which only
  // exists after a reconcile — hence the extra pass. Idempotent, so the caller reconciling again is free.
  const fitted = reconcilePins(doc).document;
  const suggestion = suggestImposedShare(fitted, spec.exposure, spec.outcome, spec.target);
  if (suggestion.basis === "none") return doc;               // additive/log — there is no split to pick
  const out = cloneDocument(fitted);
  out.metadata.imposedEffect = { ...out.metadata.imposedEffect!, extensiveShare: suggestion.share };
  return out;
}

/** Stop imposing. The coefficients keep their last derived values, but they are now yours (authored). */
export function clearImposedEffect(input: GraphDocument): GraphDocument {
  if (!input.metadata.imposedEffect) return input;
  const document = cloneDocument(input);
  delete document.metadata.imposedEffect;
  return document;
}

// Live reconcile: re-fit every pinned number from the current data + DAG (offset-regression, so pinned
// coefficients are estimated holding the authored ones fixed). Returns the changed keys for the flash.
export function reconcilePins(input: GraphDocument, depth = 0): { document: GraphDocument; changed: string[] } {
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
      // The mechanism's FORM is part of the fit's identity now — switching an edge to log_linear must
      // invalidate the cache, not just changing its coefficient.
      ...pinnedEdges.map((e) => `P${nodeColumn(document, e.source)?.dataColumn}:${normalizeEdgeMechanism(document.simulation.edges[e.id]).kind}`).sort(),
      ...authoredEdges.map((e) => `A${nodeColumn(document, e.source)?.dataColumn}:${JSON.stringify(normalizeEdgeMechanism(document.simulation.edges[e.id]))}`).sort()
    ].join("|");
    const cacheKey = `${input.id}:${nodeId}`;
    if (fitSigCache.get(cacheKey) === sig) continue; // inputs unchanged → carried values are already this fit

    // Target on the fit's LINK scale (identity for continuous — unchanged; log for positive, etc.). The
    // authored offset + coefficients live on that same scale (η), so this stays exact.
    // Hoist the per-edge column lookup + mechanism normalization OUT of the row loops. These used to run for
    // every ROW (nodeColumn scans the graph's edges), so a 2,675-row fit did ~16k graph scans and allocated a
    // normalized mechanism per row — which dominated the cost of every fit.
    // AUTHORED edges enter as a fixed per-row offset — computed by the SIMULATOR'S OWN edgeContribution, so
    // an authored non-linear edge (a log_linear confounder, say) can no longer contribute its full effect at
    // generation while silently contributing ZERO to the fit. Those two used to disagree.
    const authoredCols = authoredEdges.map((edge) => ({
      mech: normalizeEdgeMechanism(document.simulation.edges[edge.id]),
      dataColumn: nodeColumn(document, edge.source)!.dataColumn
    }));
    // A PINNED edge is only learnable if its contribution is coefficient · f(x) + const. If it is not (a
    // spline, say), we cannot solve for one number — so it too becomes a fixed offset rather than a lie.
    const fitEdges: Array<{ edge: typeof pinnedEdges[number]; dataColumn: number; basis: (x: number) => number; baseline: number }> = [];
    const offsetPinned: Array<{ mech: EdgeMechanism; dataColumn: number }> = [];
    for (const edge of pinnedEdges) {
      const em = normalizeEdgeMechanism(document.simulation.edges[edge.id]);
      const basis = edgeBasis(em);
      const dataColumn = nodeColumn(document, edge.source)!.dataColumn;
      if (basis) fitEdges.push({ edge, dataColumn, basis, baseline: edgeBaseline(em) });
      else offsetPinned.push({ mech: em, dataColumn });
    }
    const baseOffset = fitIntercept ? 0 : mech.intercept;

    const yRaw = rows.map((r) => (isBinary ? (r[col.dataColumn] ?? 0) : applyLink(r[col.dataColumn] ?? 0, link)));
    const offsetRaw = rows.map((r) => {
      let o = baseOffset;
      for (const a of authoredCols) o += edgeContribution(r[a.dataColumn] ?? 0, a.mech);
      for (const a of offsetPinned) o += edgeContribution(r[a.dataColumn] ?? 0, a.mech);
      for (const f of fitEdges) o += f.baseline;   // the mechanism's constant term is not part of the design
      return o;
    });
    const XRaw = rows.map((r) => fitEdges.map((f) => f.basis(r[f.dataColumn] ?? 0)));
    // Drop rows outside the link's domain (e.g. Y≤0 under a log link) so the fit only sees valid targets.
    const keep: number[] = [];
    for (let i = 0; i < yRaw.length; i += 1) if (Number.isFinite(yRaw[i]) && Number.isFinite(offsetRaw[i]) && XRaw[i]!.every(Number.isFinite)) keep.push(i);
    const y = keep.map((i) => yRaw[i]!);
    const offset = keep.map((i) => offsetRaw[i]!);
    const X = keep.map((i) => XRaw[i]!);
    const fit = fitLinearModel(y, X, offset, fitIntercept, isBinary);
    if (!fit) continue;
    ensureClone(); // a real re-fit is happening → now we need our own copy to write into

    for (let j = 0; j < fitEdges.length; j += 1) {
      const edge = fitEdges[j]!.edge;
      const before = readCoefficient(normalizeEdgeMechanism(document.simulation.edges[edge.id]));
      writeFittedCoefficient(document, edge.id, fit.coefs[j] ?? 0);   // preserves the authored FORM
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
        for (let j = 0; j < fitEdges.length; j += 1) eta += (fit.coefs[j] ?? 0) * X[i]![j]!;
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
      // The gate depends only on the outcome column + the PINNED parents (zero offset, authored edges
      // excluded) — NOT on any authored coefficient. Cache it under that narrower signature so authoring an
      // intensive-margin effect doesn't needlessly redo the logistic IRLS.
      const gateSig = [col.dataset, rows.length, col.dataColumn, ...pinnedEdges.map((e) => `${nodeColumn(document, e.source)?.dataColumn}:${normalizeEdgeMechanism(document.simulation.edges[e.id]).kind}`).sort()].join("|");
      const gateKey = `${input.id}:${nodeId}:gate`;
      if (gateSigCache.get(gateKey) === gateSig && mech.gate) {
        gate = mech.gate; // inputs unchanged → carry the existing gate (incl. any authored coefficient)
      } else {
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
          for (let j = 0; j < fitEdges.length; j += 1) coefficients[fitEdges[j]!.edge.source] = gateFit.coefs[j] ?? 0;
          gate = { intercept: gateFit.intercept, coefficients };
          if (gateSigCache.size > 400) gateSigCache.clear();
          gateSigCache.set(gateKey, gateSig);
        }
      }
    }
    setNode(document, nodeId, { ...mech, intercept: newIntercept, combiner: isBinary ? "bernoulli_logit" : linkCombiner, noise: newNoise, ...(gate ? { gate } : {}) });
    if (fitIntercept) bump(interceptKey(nodeId), mech.intercept, newIntercept);
    if (fitNoise) bump(noiseKey(nodeId), currentSd, fit.residualSd);
    if (fitSigCache.size > 400) fitSigCache.clear();
    fitSigCache.set(cacheKey, sig);
  }

  // ---- derive the coefficients that realize the authored ATE ----
  // The effect edge is AUTHORED, so the outcome's fit holds it as a per-row OFFSET — which means solving
  // for it CHANGES the fit, which changes the η's the solve was computed against. That is a genuine
  // fixed-point equation, so we re-reconcile until the fit reproduces what the solve assumed (below).
  // Doing this INSIDE reconcile is what makes reconcile idempotent: reconcile(reconcile(d)) == reconcile(d).
  // A document that is not a fixed point silently mutates the moment the app opens it (the commit pipeline
  // reconciles on load) — and, because it no longer byte-matches exampleDocument(id), it also falls off the
  // short `#example=` share link and serializes the whole ~10KB document instead.
  const applyImposed = (): boolean => {
    const ctx = imposedEffectContext(document);
    if (!ctx) return false;
    // If the effect edge is PINNED, the user is FITTING the effect, not imposing it — the two are mutually
    // exclusive (fitting it learns the confounded association and destroys the imposed truth). Leave it be.
    if (pinSet.has(edgeKey(ctx.edgeId))) return false;
    const sol = ctx.solve(document.metadata.imposedEffect?.extensiveShare ?? 0);
    let moved = false;

    const em = normalizeEdgeMechanism(document.simulation.edges[ctx.edgeId]);
    const beforeDelta = em.kind === "linear" ? em.coefficient : 0;
    if (Math.abs(beforeDelta - sol.delta) > 1e-9) {
      ensureClone();
      setLinearCoefficient(document, ctx.exposure, ctx.outcome, sol.delta);
      bump(edgeKey(ctx.edgeId), beforeDelta, sol.delta);
      moved = true;
    }
    // γ is NOT an edge — it lives on the outcome node's gate model, which is why no UI can reach it today.
    if (ctx.family === "two_part") {
      const gm = normalizeNodeMechanism(document.simulation.nodes[ctx.outcome]);
      const beforeGamma = gm.gate?.coefficients[ctx.exposure] ?? 0;
      if (Math.abs(beforeGamma - sol.gamma) > 1e-9) {
        ensureClone();
        const m = normalizeNodeMechanism(document.simulation.nodes[ctx.outcome]); // re-read: ensureClone may have swapped the doc
        setNode(document, ctx.outcome, { ...m, gate: { intercept: m.gate?.intercept ?? 0, coefficients: { ...(m.gate?.coefficients ?? {}), [ctx.exposure]: sol.gamma } } });
        moved = true;
      }
    }
    return moved;
  };
  const imposedMoved = applyImposed();

  if (document === input) return { document: input, changed: [] }; // nothing re-fit → no churn
  document.simulation = reconcileSimulationSpec(document.graph, document.simulation);
  if (input.simulation.datasets) document.simulation.datasets = input.simulation.datasets;
  // Re-fit against the coefficients we just derived, and re-solve. Converges fast (the fit's dependence on
  // the offset is weak); the depth guard is a backstop, not the expected exit.
  if (imposedMoved && depth < 8) {
    const next = reconcilePins(document, depth + 1);
    return { document: next.document, changed: [...new Set([...changed, ...next.changed])] };
  }
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
      // Carry the MECHANISM, not just a coefficient. The fitted value must be reconstructed by the
      // simulator's own edgeContribution, or a log_linear edge silently contributes ZERO to it — and the
      // "residual" we then test is missing that whole term, so the diagnostic reports a huge spurious
      // dependence on exactly the predictor the user just transformed. (It did: re75 dCor 0.53 on a
      // correctly-specified log fit.) The gate has the same requirement: its coefficients are FIT on the
      // basis columns, so they must be applied to basis(x) here too.
      return { edge, col: pc, mech: em, basis: edgeBasis(em), kind: em.kind, label: document.graph.nodes.find((n) => n.id === edge.source)?.label ?? edge.source };
    })
    .filter((p): p is typeof p & { col: NonNullable<typeof p.col> } => Boolean(p.col));
  if (parentCols.length === 0) return empty;

  const sig = `${col.dataset}|${rows.length}|${col.dataColumn}|${mech.intercept}|${normalizeVariableModel(node.variable).valueType}|cap${cap}|p${perms}|s${seed}|` +
    parentCols.map((p) => `${p.col.dataColumn}:${JSON.stringify(p.mech)}`).join(",") +
    (mech.gate ? `|g${mech.gate.intercept}:${parentCols.map((p) => mech.gate!.coefficients[p.edge.source] ?? 0).join(",")}` : "");
  const cached = residCache.get(sig);
  if (cached) return cached;

  // Residuals live on the node's LINK scale (log(Y)−η̂ for a log-linked node), so ε⊥X and the normality
  // check test the assumption the model actually makes. Rows outside the link domain (Y≤0 under log) drop out.
  const scale = linkForValueType(normalizeVariableModel(node.variable).valueType).link;
  const gy = rows.map((r) => applyLink(r[col.dataColumn] ?? 0, scale));
  const fitted = rows.map((r) => mech.intercept + parentCols.reduce((s, p) => s + edgeContribution(r[p.col.dataColumn] ?? 0, p.mech), 0));
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
      const pPred = gidx.map((i) => sgm(gm.intercept + parentCols.reduce((s, p) => {
        const x = rows[i]![p.col.dataColumn] ?? 0;
        return s + (gm.coefficients[p.edge.source] ?? 0) * (p.basis ? p.basis(x) : x);
      }, 0)));
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

// ================= the point-mass indicator: the one derived column we build =================
//
// `docs/scope-boundary.md` carries the rule that admits this and rejects everything else:
//
//     Add a derived-column primitive only when the existing modelling vocabulary is STRUCTURALLY INCAPABLE
//     of expressing the thing — not when it is merely convenient.
//
// A point mass is a DISCONTINUITY, and no smooth basis function can represent one. So no edge mechanism we
// have (linear / log_linear / power_law / quadratic / spline) or could add will ever do this job — unlike
// log, sqrt, x², standardize, bin, winsorize, lag or ratio, all of which are re-expressions of the SAME
// variable and belong on an edge or in the user's spreadsheet.
//
// It becomes a NODE rather than a bend in an existing arrow because it is a different causal CONSTRUCT:
// "was this person employed in 1974?" can have different parents and different children from "how much did
// they earn in 1974?". On LaLonde it carries essentially all of the selection signal (logit coefficient
// 1.94–3.26) while the dollar amount carries none (−0.00007). See docs/lalonde-specification.md.

/** Is this node's column a point-mass candidate — i.e. does its data pile up at a single value? */
export function pointMassCandidate(document: GraphDocument, nodeId: string, at = 0): { column: string; share: number } | null {
  const col = nodeColumn(document, nodeId);
  if (!col) return null;
  const ds = lookupDataset(col.dataset);
  const column = ds?.columns[col.dataColumn];
  if (!ds || !column) return null;
  const distinct = new Set(ds.rows.map((r) => r[col.dataColumn])).size;
  if (distinct <= 2) return null;                                          // already binary — nothing to indicate
  // Match an existing indicator by VALUE, not by name — lalonde's is called `u74`, not `re74_is_zero`. And
  // it is only "already handled" once a NODE actually reads it; an unused column helps nobody.
  const existing = findPointMassColumn(ds, column, at);
  const existingIndex = existing ? ds.columns.indexOf(existing) : -1;
  if (existingIndex >= 0) {
    const wired = document.graph.nodes.some((n) => {
      const c = nodeColumn(document, n.id);
      return c && c.dataset === col.dataset && c.dataColumn === existingIndex;
    });
    if (wired) return null;
  }
  const share = pointMassShare(ds, column, at);
  return share > 0 ? { column, share } : null;
}

/**
 * Give a predictor's point mass its own regressor: a new binary NODE, read from a derived data column,
 * fed by the same row-source as the variable it indicates. It arrives UNWIRED — the user decides what it
 * causes, which is the whole reason it is a node and not a hidden basis term.
 */
export function addPointMassIndicator(input: GraphDocument, nodeId: string, at = 0): GraphDocument {
  const col = nodeColumn(input, nodeId);
  const node = input.graph.nodes.find((n) => n.id === nodeId);
  if (!col || !node) return input;
  const base = lookupDataset(col.dataset);
  const sourceColumn = base?.columns[col.dataColumn];
  if (!base || !sourceColumn) return input;

  // Reuse an existing indicator column if the dataset already has one (LaLonde ships `u74`/`u75`); only
  // derive a new one when it genuinely does not. Matched by value, since the name is a convention.
  const existing = findPointMassColumn(base, sourceColumn, at);
  const columnName = existing ?? pointMassColumnName(sourceColumn, at);
  let dataset = base;
  if (!existing) {
    // A derived column lives on the DATASET: extend the document's own copy AND the runtime registry, which
    // is what `table_lookup` resolves through.
    dataset = withPointMassIndicator(base, sourceColumn, { at, name: columnName });
    registerRuntimeDataset(col.dataset, dataset);
  }
  const dataColumn = dataset.columns.indexOf(columnName);
  if (dataColumn < 0) return input;

  // The row-source is whatever feeds the original column — the indicator must be read from the SAME row.
  const lookupEdge = input.graph.edges.find((e) => e.id === col.lookupEdgeId);
  if (!lookupEdge) return input;

  const indicatorId = `${nodeId}_is_zero`;
  if (input.graph.nodes.some((n) => n.id === indicatorId)) return input;

  const document = cloneDocument(input);
  if (document.simulation.datasets?.[col.dataset]) document.simulation.datasets[col.dataset] = dataset;

  let graph = addNode(document.graph, {
    id: indicatorId,
    label: `no ${node.label.toLowerCase()}`,
    position: { x: node.position.x, y: node.position.y + 90 },
    roles: { ...node.roles, exposure: false, outcome: false },
    variable: normalizeVariableModel({ ...node.variable, valueType: "binary", unit: "" })
  });
  graph = addEdge(graph, lookupEdge.source, indicatorId, "directed");
  const out = withGraph(document, graph);
  const created = out.graph.edges.find((e) => e.source === lookupEdge.source && e.target === indicatorId)!;
  out.simulation.edges[created.id] = { ...defaultEdgeMechanism("table_lookup"), dataset: col.dataset, dataColumn };
  out.simulation.nodes[indicatorId] = { ...normalizeNodeMechanism(undefined), combiner: "additive", intercept: 0, noise: ZERO_NOISE };
  return out;
}
