// Seeded, deterministic fixture generators for the chart gallery. They produce
// the boundary / representative datasets that bugs cluster around (values at
// 0%/100%, tiny n, ties, extreme splits, flat curves) so the gallery and the
// invariant tests can stress the charts without the real app.
import type { ScatterPoint } from "../charts/CategoryOutcomePlot";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number, mean: number, sd: number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Binary exposure (x∈{0,1}) × binary outcome (y∈{0,1}). */
export function binaryPoints(pX1: number, pY1GivenX0: number, pY1GivenX1: number, n = 220, seed = 7): ScatterPoint[] {
  const rng = mulberry32(seed);
  const out: ScatterPoint[] = [];
  for (let index = 0; index < n; index += 1) {
    const x = rng() < pX1 ? 1 : 0;
    const pY1 = x === 1 ? pY1GivenX1 : pY1GivenX0;
    out.push({ x, y: rng() < pY1 ? 1 : 0, weight: 1, index });
  }
  return out;
}

/** Binary exposure (x∈{0,1}) × continuous outcome (y). */
export function continuousPoints(meanX0: number, meanX1: number, sd: number, n = 220, seed = 7): ScatterPoint[] {
  const rng = mulberry32(seed);
  const out: ScatterPoint[] = [];
  for (let index = 0; index < n; index += 1) {
    const x = rng() < 0.5 ? 1 : 0;
    out.push({ x, y: gaussian(rng, x === 1 ? meanX1 : meanX0, sd), weight: 1, index });
  }
  return out;
}

/** Continuous exposure (x) × binary outcome, risk a function of x. */
export function riskPoints(xMin: number, xMax: number, risk: (x: number) => number, n = 600, seed = 7): ScatterPoint[] {
  const rng = mulberry32(seed);
  const out: ScatterPoint[] = [];
  for (let index = 0; index < n; index += 1) {
    const x = xMin + (xMax - xMin) * rng();
    const p = Math.min(1, Math.max(0, risk(x)));
    out.push({ x, y: rng() < p ? 1 : 0, weight: 1, index });
  }
  return out;
}
