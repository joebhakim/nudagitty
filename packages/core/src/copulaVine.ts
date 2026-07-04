import { inverseStandardNormalCdf as Ninv, standardNormalCdf as Phi } from "./simulation/math";
import { edgeContribution } from "./simulation/interpreter";
import { buildDistributionQuantile } from "./distributions";
import type { CopulaBlock, CopulaComponent, CopulaFamily, CopulaRotation, MixtureEdge, Moderation, NodeDistribution, PairCopula } from "./types";
export type { CopulaBlock, CopulaComponent, CopulaFamily, CopulaRotation, MixtureEdge, Moderation, PairCopula } from "./types";

// ---------------------------------------------------------------------------
// Copula families + regular-vine (D-vine) sampling — the reusable dependence
// layer. Each family is parametrized by Kendall's τ (family-invariant). The
// bivariate cell is the atom; d variables are a D-vine, a cascade of pair-copulas
// along a line, truncatable to any tree depth. All h-functions match the copula
// editor and are validated against empirical Kendall's τ (see copulaVine.test.ts).
//
//   h(u | v) = ∂C(u,v)/∂v  is the conditional CDF; h⁻¹ its inverse in the first
//   argument. Sampling and conditioning are built entirely from h / h⁻¹.
// ---------------------------------------------------------------------------

export const COPULA_FAMILIES: CopulaFamily[] = ["independence", "gaussian", "frank", "clayton", "gumbel"];
export const ARCHIMEDEAN_FAMILIES: CopulaFamily[] = ["clayton", "gumbel"]; // one-tailed; rotate for negative τ

// The edge model (Moderation / CopulaComponent / MixtureEdge) is defined in types.ts and re-exported
// above. A Moderation is constant (by === null → simplified) or a curve of a conditioning variable's
// value via the engine's EdgeMechanism library + a link.
/** Today's { family, tau, rotation } as a 1-component constant edge — the simplified case. */
export function simpleEdge(family: CopulaFamily, tau: number, rotation: CopulaRotation = 0): MixtureEdge {
  return { components: [{ family, rotation, tau: { by: null, constant: tau } }], weights: [{ by: null, constant: 1 }] };
}
const INDEPENDENCE_EDGE: MixtureEdge = simpleEdge("independence", 0);

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));
function tauLink(family: CopulaFamily, z: number): number {
  if (family === "clayton" || family === "gumbel") return 0.02 + 0.96 * sigmoid(z); // (0.02, 0.98) base magnitude
  return 0.95 * Math.tanh(z);                                                        // gaussian/frank: (−0.95, 0.95)
}
function evalTau(m: Moderation, family: CopulaFamily, resolve: (by: number) => number): number {
  if (m.by === null || !m.mechanism) return m.constant;
  return tauLink(family, edgeContribution(resolve(m.by), m.mechanism));
}
function evalWeight(m: Moderation, resolve: (by: number) => number): number {
  if (m.by === null || !m.mechanism) return m.constant;
  return edgeContribution(resolve(m.by), m.mechanism);
}
function computeMixtureEdge(edge: MixtureEdge, resolve: (by: number) => number): { comps: PairCopula[]; weights: number[] } {
  const comps: PairCopula[] = edge.components.map((c) => ({ family: c.family, rotation: c.rotation, tau: evalTau(c.tau, c.family, resolve) }));
  if (comps.length === 1) return { comps, weights: [1] };
  const raw = edge.weights.map((w) => evalWeight(w, resolve));
  const mx = Math.max(...raw);
  const exps = raw.map((r) => Math.exp(r - mx));
  const s = exps.reduce((a, b) => a + b, 0) || 1;
  return { comps, weights: exps.map((e) => e / s) };
}
function isModerated(edge: MixtureEdge): boolean {
  return edge.components.some((c) => c.tau.by !== null) || (edge.components.length > 1 && edge.weights.some((w) => w.by !== null));
}
const staticEdgeCache = new WeakMap<MixtureEdge, { comps: PairCopula[]; weights: number[] }>();
/** Evaluate a mixture edge at one sample's conditioning values. Constant (non-moderated) edges give
 * the same copula every sample, so they are cached once per edge — the hot path for a plain vine. */
function evaluateMixtureEdge(edge: MixtureEdge, resolve: (by: number) => number): { comps: PairCopula[]; weights: number[] } {
  if (!isModerated(edge)) {
    const hit = staticEdgeCache.get(edge);
    if (hit) return hit;
    const result = computeMixtureEdge(edge, resolve);
    staticEdgeCache.set(edge, result);
    return result;
  }
  return computeMixtureEdge(edge, resolve);
}
// Mixture h = weighted sum of component h's (h is linear in the copula); h⁻¹ by bisection (monotone).
function mixtureH(comps: PairCopula[], weights: number[], x: number, v: number): number {
  let s = 0; for (let k = 0; k < comps.length; k += 1) s += weights[k]! * pairH(comps[k]!, x, v); return s;
}
function mixtureHinv(comps: PairCopula[], weights: number[], target: number, v: number): number {
  let lo = 1e-7, hi = 1 - 1e-7;
  for (let i = 0; i < 44; i += 1) { const m = (lo + hi) / 2; (mixtureH(comps, weights, m, v) < target) ? (lo = m) : (hi = m); }
  return (lo + hi) / 2;
}

// --- Frank: Debye function + τ↔θ ---
function debye1(theta: number): number {
  if (Math.abs(theta) < 1e-8) return 1;
  const n = 120, h = theta / n;
  let s = 0;
  for (let i = 0; i <= n; i += 1) {
    const t = i * h;
    const f = Math.abs(t) < 1e-9 ? 1 : t / (Math.exp(t) - 1);
    s += (i === 0 || i === n ? 1 : (i % 2 ? 4 : 2)) * f;
  }
  return (h / 3) * s / theta;
}
const tauOfFrankTheta = (theta: number): number => (Math.abs(theta) < 1e-6 ? 0 : 1 + 4 * (debye1(theta) - 1) / theta);
function frankTheta(tau: number): number {
  if (Math.abs(tau) < 1e-4) return tau >= 0 ? 1e-4 : -1e-4;
  let lo = tau > 0 ? 1e-4 : -40, hi = tau > 0 ? 40 : -1e-4;
  for (let i = 0; i < 70; i += 1) { const m = (lo + hi) / 2; (tauOfFrankTheta(m) < tau) ? (lo = m) : (hi = m); }
  return (lo + hi) / 2;
}

/** Family parameter: ρ for gaussian, θ for the Archimedeans. */
export function copulaParam(pc: PairCopula): number {
  const t = pc.tau;
  switch (pc.family) {
    case "independence": return 0;
    case "gaussian": return Math.sin(Math.PI * t / 2);
    case "frank": return frankTheta(t);
    case "clayton": return Math.max(1e-4, 2 * Math.abs(t) / (1 - Math.abs(t)));
    case "gumbel": return Math.max(1.0001, 1 / (1 - Math.abs(t)));
  }
}

// --- un-rotated h-functions and their inverses (condition on the SECOND argument) ---
function gumbelH(x: number, v: number, th: number): number {
  const lu = -Math.log(x), lv = -Math.log(v), A = Math.pow(lu, th) + Math.pow(lv, th);
  return Math.exp(-Math.pow(A, 1 / th)) * Math.pow(A, 1 / th - 1) * Math.pow(lv, th - 1) / v;
}
function gumbelHinv(w: number, v: number, th: number): number {
  let lo = 1e-6, hi = 1 - 1e-6;
  for (let i = 0; i < 40; i += 1) { const m = (lo + hi) / 2; (gumbelH(m, v, th) < w) ? (lo = m) : (hi = m); }
  return (lo + hi) / 2;
}
function frankH(x: number, v: number, th: number): number {
  const ex = Math.exp(-th * x), ev = Math.exp(-th * v), e1 = Math.exp(-th) - 1;
  return ev * (ex - 1) / ((ex - 1) * (ev - 1) + e1);
}
function frankHinv(w: number, v: number, th: number): number {
  let lo = 1e-7, hi = 1 - 1e-7;
  for (let i = 0; i < 42; i += 1) { const m = (lo + hi) / 2; (frankH(m, v, th) < w) ? (lo = m) : (hi = m); }
  return (lo + hi) / 2;
}
function baseH(fam: CopulaFamily, par: number, x: number, v: number): number {
  switch (fam) {
    case "independence": return x;
    case "gaussian": return Phi((Ninv(x) - par * Ninv(v)) / Math.sqrt(1 - par * par));
    case "clayton": return Math.pow(v, -par - 1) * Math.pow(Math.pow(x, -par) + Math.pow(v, -par) - 1, -1 - 1 / par);
    case "gumbel": return gumbelH(x, v, par);
    case "frank": return frankH(x, v, par);
  }
}
function baseHinv(fam: CopulaFamily, par: number, w: number, v: number): number {
  switch (fam) {
    case "independence": return w;
    case "gaussian": return Phi(par * Ninv(v) + Math.sqrt(1 - par * par) * Ninv(w));
    case "clayton": return Math.pow(Math.pow(w * Math.pow(v, par + 1), -par / (par + 1)) - Math.pow(v, -par) + 1, -1 / par);
    case "gumbel": return gumbelHinv(w, v, par);
    case "frank": return frankHinv(w, v, par);
  }
}

/** Rotation-aware h(x | v). */
export function pairH(pc: PairCopula, x: number, v: number): number {
  const par = copulaParam(pc), rot = pc.rotation ?? 0;
  if (rot === 0) return baseH(pc.family, par, x, v);
  if (rot === 180) return 1 - baseH(pc.family, par, 1 - x, 1 - v);
  if (rot === 90) return 1 - baseH(pc.family, par, 1 - x, v);
  return baseH(pc.family, par, x, 1 - v); // 270
}
/** Rotation-aware inverse of h in its first argument. */
export function pairHinv(pc: PairCopula, w: number, v: number): number {
  const par = copulaParam(pc), rot = pc.rotation ?? 0;
  if (rot === 0) return baseHinv(pc.family, par, w, v);
  if (rot === 180) return 1 - baseHinv(pc.family, par, 1 - w, 1 - v);
  if (rot === 90) return 1 - baseHinv(pc.family, par, 1 - w, v);
  return baseHinv(pc.family, par, w, 1 - v); // 270
}

/** Draw one point (u,v) from the pair-copula given two base uniforms. */
export function samplePair(pc: PairCopula, w1: number, w2: number): [number, number] {
  const par = copulaParam(pc);
  const u = w1, v = baseHinv(pc.family, par, w2, w1);
  const rot = pc.rotation ?? 0;
  if (rot === 90) return [1 - u, v];
  if (rot === 180) return [1 - u, 1 - v];
  if (rot === 270) return [u, 1 - v];
  return [u, v];
}

/** [λ_L, λ_U] tail-dependence coefficients. */
export function tailDependence(pc: PairCopula): [number, number] {
  let lL = 0, lU = 0;
  const t = Math.abs(pc.tau);
  if (pc.family === "clayton") { const th = 2 * t / (1 - t); lL = Math.pow(2, -1 / th); }
  if (pc.family === "gumbel") lU = 2 - Math.pow(2, 1 - t); // 2 − 2^{1/θ}, θ = 1/(1−t) ⇒ 1/θ = 1−t
  const rot = pc.rotation ?? 0;
  if (rot === 180) { const s = lL; lL = lU; lU = s; }
  if (rot === 90 || rot === 270) { lL = 0; lU = 0; }
  return [lL, lU];
}

/**
 * Sample a D-vine from base uniforms. `trees[k]` is tree k+1 (k = 0…d−2); `trees[k][e]`
 * is the pair-copula between line positions e and e+k+1 (conditional on those between).
 * Missing / independence entries truncate that tree. Returns one draw in LINE-POSITION
 * order (the caller maps positions → variable ids via the chosen order). Aas et al. (2009),
 * Algorithm 2.
 *
 * If `pseudo` is supplied it is filled with each edge's conditional-rank pseudo-observations
 * `[F(a|D), F(b|D)]`, keyed `"<tree0>:<edge0>"` (0-based, positions edge0 and edge0+tree0+1).
 * Those are the arguments the edge's copula actually acts on — the correct thing to plot for a
 * conditional cell (valid without fixing conditioning values, under the simplified-vine
 * assumption this sampler embodies).
 */
type EdgeH = (tree0: number, edge0: number, x: number, v: number, drawn: number[]) => number;

// The Aas Algorithm 2 recursion, parametrized by per-edge h / h⁻¹ accessors so the same code drives
// both the constant vine and the moderated mixture vine. `drawn` (the 1-based x array being built)
// is passed so moderated edges can read their conditioning variable's value.
function dvineCore(n: number, w: number[], H: EdgeH, Hinv: EdgeH, pseudo?: Record<string, [number, number]>): number[] {
  const v: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(2 * n + 2).fill(0));
  const x: number[] = new Array<number>(n + 1).fill(0);
  x[1] = v[1]![1] = w[0]!;
  for (let i = 2; i <= n; i += 1) {
    v[i]![1] = w[i - 1]!;
    for (let k = i - 1; k >= 1; k -= 1) {
      v[i]![1] = Hinv(k - 1, i - k - 1, v[i]![1]!, v[i - 1]![2 * k - 1]!, x);
      if (pseudo) pseudo[`${k - 1}:${i - k - 1}`] = [v[i - 1]![2 * k - 1]!, v[i]![1]!];
    }
    x[i] = v[i]![1]!;
    if (i === n) break;
    // Odd slots v[i][2m+1] = F(x_{i-m} | x_{i-m+1..i}); even slots v[i][2m] = F(x_i | x_{i-m..i-1}).
    v[i]![2] = H(0, i - 2, v[i]![1]!, v[i - 1]![1]!, x);       // F(x_i | x_{i-1})
    v[i]![3] = H(0, i - 2, v[i - 1]![1]!, v[i]![1]!, x);       // F(x_{i-1} | x_i)
    if (i > 2) {
      for (let j = 2; j <= i - 1; j += 1) {
        v[i]![2 * j] = H(j - 1, i - j - 1, v[i]![2 * j - 2]!, v[i - 1]![2 * j - 1]!, x);       // F(x_i | left set)
        v[i]![2 * j + 1] = H(j - 1, i - j - 1, v[i - 1]![2 * j - 1]!, v[i]![2 * j - 2]!, x);   // F(x_{i-j} | set)
      }
    }
  }
  return x.slice(1);
}

/**
 * Sample a D-vine of constant pair-copulas from base uniforms. `trees[k]` is tree k+1; `trees[k][e]`
 * the pair between line positions e and e+k+1. Missing entries truncate. Returns one draw in
 * LINE-POSITION order. `pseudo`, if given, collects each edge's conditional-rank pseudo-observations
 * `[F(a|D), F(b|D)]` keyed `"tree0:edge0"`. Aas et al. (2009), Algorithm 2.
 */
export function sampleDVine(trees: PairCopula[][], w: number[], pseudo?: Record<string, [number, number]>): number[] {
  const IND: PairCopula = { family: "independence", tau: 0 };
  return dvineCore(w.length, w,
    (t, e, x, v) => pairH(trees[t]?.[e] ?? IND, x, v),
    (t, e, tg, v) => pairHinv(trees[t]?.[e] ?? IND, tg, v),
    pseudo);
}

/**
 * Sample a D-vine of MODERATED MIXTURE edges — the complete (non-simplified) model. Each edge's
 * copula is a mixture over families whose parameters/weights are moderation curves of a conditioning
 * variable; evaluated per sample at that variable's DATA value (via `quantiles`). Returns the draw in
 * rank space (`u`) and data space (`data`, marginals applied) — the latter is the NORTA coupled draw
 * the engine consumes. `quantiles[p]` is position p's marginal inverse-CDF.
 */
export function sampleDVineModerated(
  edges: MixtureEdge[][],
  w: number[],
  quantiles: Array<(u: number) => number>,
  pseudo?: Record<string, [number, number]>
): { u: number[]; data: number[] } {
  const evalAt = (t: number, e: number, drawn: number[]) =>
    evaluateMixtureEdge(edges[t]?.[e] ?? INDEPENDENCE_EDGE, (by) => quantiles[by]!(drawn[by + 1]!));
  const u = dvineCore(w.length, w,
    (t, e, x, v, drawn) => { const { comps, weights } = evalAt(t, e, drawn); return comps.length === 1 ? pairH(comps[0]!, x, v) : mixtureH(comps, weights, x, v); },
    (t, e, tg, v, drawn) => { const { comps, weights } = evalAt(t, e, drawn); return comps.length === 1 ? pairHinv(comps[0]!, tg, v) : mixtureHinv(comps, weights, tg, v); },
    pseudo);
  return { u, data: u.map((ui, p) => quantiles[p]!(ui)) };
}

// --- Engine glue: draw a copula block's coupled root values -----------------
export interface PreparedCopulaBlock {
  block: CopulaBlock;
  quantiles: Array<(u: number) => number>; // position order
  nodeIdByPosition: string[];              // position → node id
}
/** Build a block's marginal quantiles once (position order) from each node's distribution. */
export function prepareCopulaBlock(block: CopulaBlock, marginalOf: (nodeId: string) => NodeDistribution): PreparedCopulaBlock {
  const nodeIdByPosition = block.order.map((varIdx) => block.nodes[varIdx]!);
  return { block, quantiles: nodeIdByPosition.map((id) => buildDistributionQuantile(marginalOf(id))), nodeIdByPosition };
}
/** Draw one coupled sample for the block → { nodeId: value } (marginals applied). Consumes d uniforms. */
export function drawCopulaBlockSample(prepared: PreparedCopulaBlock, rng: () => number): Record<string, number> {
  const d = prepared.block.nodes.length;
  const w = Array.from({ length: d }, () => rng());
  const { data } = sampleDVineModerated(prepared.block.edges, w, prepared.quantiles);
  const out: Record<string, number> = {};
  prepared.nodeIdByPosition.forEach((id, p) => { out[id] = data[p]!; });
  return out;
}
