import { normalizeVariableModel } from "../graph";
import type { GraphModel } from "../types";
import { EMPIRICAL_SAMPLE_MAX, EMPIRICAL_SAMPLE_MIN, VARIANCE_EPSILON } from "./constants";
import { standardNormalCdf, standardNormalPdf } from "../stats/normal";
import { probit } from "../stats/links";
import { clampProbability } from "../stats/util";

// Re-export the canonical implementations so `./math` (and the simulation barrel)
// keep resolving these names for existing importers.
export { standardNormalPdf, standardNormalCdf, probit, clampProbability };

// The historical `inverseStandardNormalCdf` is the canonical probit with the wider
// 1e-15 boundary clamp (vs. `probit`'s 1e-12).
export function inverseStandardNormalCdf(probability: number): number {
  return probit(probability, { clampEpsilon: 1e-15 });
}

const GAUSS_LEGENDRE_16_NODES: number[] = [
  -0.9894009349916499, -0.9445750230732326, -0.8656312023878317, -0.7554044083550030,
  -0.6178762444026438, -0.4580167776572274, -0.2816035507792589, -0.0950125098376374,
   0.0950125098376374,  0.2816035507792589,  0.4580167776572274,  0.6178762444026438,
   0.7554044083550030,  0.8656312023878317,  0.9445750230732326,  0.9894009349916499
];

const GAUSS_LEGENDRE_16_WEIGHTS: number[] = [
  0.0271524594117541, 0.0622535239386479, 0.0951585116824928, 0.1246289712555339,
  0.1495959888165767, 0.1691565193950025, 0.1826034150449236, 0.1894506104550685,
  0.1894506104550685, 0.1826034150449236, 0.1691565193950025, 0.1495959888165767,
  0.1246289712555339, 0.0951585116824928, 0.0622535239386479, 0.0271524594117541
];

function gaussLegendre16(integrand: (x: number) => number, lower: number, upper: number): number {
  if (lower === upper) return 0;
  const half = (upper - lower) / 2;
  const mid = (upper + lower) / 2;
  let sum = 0;
  for (let i = 0; i < 16; i += 1) {
    const x = mid + half * (GAUSS_LEGENDRE_16_NODES[i] ?? 0);
    sum += (GAUSS_LEGENDRE_16_WEIGHTS[i] ?? 0) * integrand(x);
  }
  return half * sum;
}

function bivariateNormalCdf(h: number, k: number, rho: number): number {
  if (rho === 0) return standardNormalCdf(h) * standardNormalCdf(k);
  const r = Math.max(-0.9999, Math.min(0.9999, rho));
  const hSq = h * h;
  const kSq = k * k;
  const integrand = (rValue: number): number => {
    const denom = 1 - rValue * rValue;
    if (denom <= 1e-12) return 0;
    const exponent = -(hSq - 2 * rValue * h * k + kSq) / (2 * denom);
    if (exponent < -700) return 0;
    return Math.exp(exponent) / (2 * Math.PI * Math.sqrt(denom));
  };
  return standardNormalCdf(h) * standardNormalCdf(k) + gaussLegendre16(integrand, 0, r);
}

export interface BivariateMoments {
  L: number;
  mean1: number;
  mean2: number;
  var1: number;
  var2: number;
  cov: number;
}

export function bivariateRectangleMoments(a1: number, b1: number, a2: number, b2: number, rho: number): BivariateMoments | null {
  if (a1 >= b1 || a2 >= b2) return null;
  const r = Math.max(-0.9999, Math.min(0.9999, rho));
  const oneMinusRsq = Math.max(1 - r * r, 1e-12);
  const root = Math.sqrt(oneMinusRsq);

  const Phi2 = (h: number, k: number): number => {
    if (h === Number.NEGATIVE_INFINITY || k === Number.NEGATIVE_INFINITY) return 0;
    if (h === Number.POSITIVE_INFINITY) return k === Number.POSITIVE_INFINITY ? 1 : standardNormalCdf(k);
    if (k === Number.POSITIVE_INFINITY) return standardNormalCdf(h);
    return bivariateNormalCdf(h, k, r);
  };

  const phi2 = (h: number, k: number): number => {
    if (!Number.isFinite(h) || !Number.isFinite(k)) return 0;
    return Math.exp(-(h * h - 2 * r * h * k + k * k) / (2 * oneMinusRsq)) / (2 * Math.PI * root);
  };

  const m = (t: number, aOther: number, bOther: number): number => {
    if (!Number.isFinite(t)) return 0;
    const upper = bOther === Number.POSITIVE_INFINITY ? 1 : standardNormalCdf((bOther - r * t) / root);
    const lower = aOther === Number.NEGATIVE_INFINITY ? 0 : standardNormalCdf((aOther - r * t) / root);
    return standardNormalPdf(t) * (upper - lower);
  };

  const L = Phi2(b1, b2) - Phi2(a1, b2) - Phi2(b1, a2) + Phi2(a1, a2);
  if (L <= VARIANCE_EPSILON) return null;

  const m1a = m(a1, a2, b2);
  const m1b = m(b1, a2, b2);
  const m2a = m(a2, a1, b1);
  const m2b = m(b2, a1, b1);

  const F1 = m1a - m1b;
  const F2 = m2a - m2b;

  const safeProduct = (t: number, value: number): number => (Number.isFinite(t) ? t * value : 0);
  const G1 = safeProduct(a1, m1a) - safeProduct(b1, m1b);
  const G2 = safeProduct(a2, m2a) - safeProduct(b2, m2b);

  const Corner = phi2(a1, a2) - phi2(a1, b2) - phi2(b1, a2) + phi2(b1, b2);

  const mean1 = (F1 + r * F2) / L;
  const mean2 = (r * F1 + F2) / L;

  const ew1sq = 1 + (G1 + r * r * G2) / L + r * (1 - r * r) * Corner / L;
  const ew2sq = 1 + (G2 + r * r * G1) / L + r * (1 - r * r) * Corner / L;
  const ew1w2 = r + r * (G1 + G2) / L + (1 - r * r) * Corner / L;

  return {
    L,
    mean1,
    mean2,
    var1: Math.max(0, ew1sq - mean1 * mean1),
    var2: Math.max(0, ew2sq - mean2 * mean2),
    cov: ew1w2 - mean1 * mean2
  };
}

export function empiricalSampleSize(graph: GraphModel): number {
  const requested = graph.nodes.reduce((max, node) => {
    const variable = normalizeVariableModel(node.variable);
    return Math.max(max, variable.simulation.sampleSize);
  }, EMPIRICAL_SAMPLE_MIN);
  return Math.min(EMPIRICAL_SAMPLE_MAX, Math.max(EMPIRICAL_SAMPLE_MIN, Math.round(requested)));
}
