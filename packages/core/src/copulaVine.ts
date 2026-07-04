import { inverseStandardNormalCdf as Ninv, standardNormalCdf as Phi } from "./simulation/math";

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

export type CopulaFamily = "independence" | "gaussian" | "frank" | "clayton" | "gumbel";
export type CopulaRotation = 0 | 90 | 180 | 270;

export interface PairCopula {
  family: CopulaFamily;
  /** Kendall's τ. Signed for gaussian/frank; magnitude for clayton/gumbel (sign via rotation). */
  tau: number;
  rotation?: CopulaRotation;
}

export const COPULA_FAMILIES: CopulaFamily[] = ["independence", "gaussian", "frank", "clayton", "gumbel"];
export const ARCHIMEDEAN_FAMILIES: CopulaFamily[] = ["clayton", "gumbel"]; // one-tailed; rotate for negative τ

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
export function sampleDVine(trees: PairCopula[][], w: number[], pseudo?: Record<string, [number, number]>): number[] {
  const n = w.length;
  const IND: PairCopula = { family: "independence", tau: 0 };
  const theta = (j: number, i: number): PairCopula => trees[j - 1]?.[i - 1] ?? IND; // tree j, edge i (1-based)
  const v: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(2 * n + 2).fill(0));
  const x: number[] = new Array<number>(n + 1).fill(0);
  x[1] = v[1]![1] = w[0]!;
  for (let i = 2; i <= n; i += 1) {
    v[i]![1] = w[i - 1]!;
    for (let k = i - 1; k >= 1; k -= 1) {
      v[i]![1] = pairHinv(theta(k, i - k), v[i]![1]!, v[i - 1]![2 * k - 1]!);
      // After the inversion, v[i][1] = F(x_i | between) and v[i-1][2k-1] = F(x_{i-k} | between):
      // the copula's own arguments for the edge (tree k, positions i-k … i).
      if (pseudo) pseudo[`${k - 1}:${i - k - 1}`] = [v[i - 1]![2 * k - 1]!, v[i]![1]!];
    }
    x[i] = v[i]![1]!;
    if (i === n) break;
    // Odd slots v[i][2m+1] = F(x_{i-m} | x_{i-m+1..i}); even slots v[i][2m] = F(x_i | x_{i-m..i-1}).
    // The inner loop of later rows conditions on the odd slots v[i-1][2k-1].
    v[i]![2] = pairH(theta(1, i - 1), v[i]![1]!, v[i - 1]![1]!);       // F(x_i | x_{i-1})
    v[i]![3] = pairH(theta(1, i - 1), v[i - 1]![1]!, v[i]![1]!);       // F(x_{i-1} | x_i)
    if (i > 2) {
      for (let j = 2; j <= i - 1; j += 1) {
        v[i]![2 * j] = pairH(theta(j, i - j), v[i]![2 * j - 2]!, v[i - 1]![2 * j - 1]!);       // F(x_i | left set)
        v[i]![2 * j + 1] = pairH(theta(j, i - j), v[i - 1]![2 * j - 1]!, v[i]![2 * j - 2]!);   // F(x_{i-j} | set)
      }
    }
  }
  return x.slice(1);
}
