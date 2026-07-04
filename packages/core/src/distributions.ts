import {
  randomBernoulli,
  randomBeta,
  randomExponential,
  randomGamma,
  randomLogNormal,
  randomNormal,
  randomPoisson,
  randomUniform
} from "d3-random";
import type { NodeDistribution } from "./types";
import { quantileSorted } from "./stats";

export type RandomSource = () => number;
export type DistributionSampler = () => number;

export function createSeededRandomSource(seed: number): RandomSource {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleDistribution(distribution: NodeDistribution, source: RandomSource): number {
  return createDistributionSampler(distribution, source)();
}

/**
 * Empirical inverse-CDF (quantile function) for any distribution kind — the marginal
 * side of a NORTA transform. Built by sorting forward draws, so it reuses the exact
 * samplers the engine uses and covers discrete families and the numerically awkward
 * continuous ones (gamma/beta/t) for free. Maps u ∈ [0,1] → x. In the app the same
 * role is played by a node's actual simulated samples.
 */
const quantileCache = new Map<string, (u: number) => number>();
export function buildDistributionQuantile(distribution: NodeDistribution, sampleCount = 4000, seed = 0x51ab): (u: number) => number {
  // Deterministic (fixed seed) ⇒ memoize by distribution so repeated sims / oracle re-sims don't
  // rebuild the 4000-sample sort each time (the copula-block hot path).
  const key = `${sampleCount}:${seed}:${JSON.stringify(distribution)}`;
  const hit = quantileCache.get(key);
  if (hit) return hit;
  if (quantileCache.size > 400) quantileCache.clear();
  const sampler = createDistributionSampler(distribution, createSeededRandomSource(seed));
  const sorted = Array.from({ length: sampleCount }, () => sampler()).sort((a, b) => a - b);
  const fn = (u: number) => quantileSorted(sorted, Math.min(1, Math.max(0, u)));
  quantileCache.set(key, fn);
  return fn;
}

export function createDistributionSampler(distribution: NodeDistribution, source: RandomSource): DistributionSampler {
  switch (distribution.kind) {
    case "constant":
      return () => distribution.value;
    case "uniform":
      return randomUniform.source(source)(distribution.min, distribution.max);
    case "bernoulli":
      return randomBernoulli.source(source)(distribution.p);
    case "normal":
      return randomNormal.source(source)(distribution.mean, distribution.sd);
    case "lognormal":
      return randomLogNormal.source(source)(distribution.meanLog, distribution.sdLog);
    case "poisson":
      return randomPoisson.source(source)(distribution.lambda);
    case "beta":
      return randomBeta.source(source)(distribution.alpha, distribution.beta);
    case "gamma":
      return randomGamma.source(source)(distribution.shape, distribution.scale);
    case "exponential":
      return randomExponential.source(source)(distribution.rate);
    case "laplace":
      return laplaceSampler(distribution.mean, distribution.scale, source);
    case "student_t":
      return studentTSampler(distribution.mean, distribution.scale, distribution.df, source);
    case "categorical":
      return categoricalSampler(distribution.weights, source);
  }
}

// Draws a level index 0..k-1 with probability ∝ weights (non-negative; renormalized).
function categoricalSampler(weights: number[], source: RandomSource): DistributionSampler {
  const clean = (weights.length > 0 ? weights : [1]).map((w) => Math.max(0, Number.isFinite(w) ? w : 0));
  const total = clean.reduce((sum, w) => sum + w, 0) || 1;
  const cumulative: number[] = [];
  let acc = 0;
  for (const w of clean) { acc += w / total; cumulative.push(acc); }
  const uniform = randomUniform.source(source)(0, 1);
  return () => {
    const u = uniform();
    for (let i = 0; i < cumulative.length; i += 1) if (u <= cumulative[i]!) return i;
    return cumulative.length - 1;
  };
}

function laplaceSampler(mean: number, scale: number, source: RandomSource): DistributionSampler {
  const uniform = randomUniform.source(source)(-0.5, 0.5);
  return () => {
    const shifted = uniform();
    if (shifted === 0) return mean;
    return mean - scale * Math.sign(shifted) * Math.log1p(-2 * Math.abs(shifted));
  };
}

function studentTSampler(mean: number, scale: number, df: number, source: RandomSource): DistributionSampler {
  const normal = randomNormal.source(source)(0, 1);
  const chiSquare = randomGamma.source(source)(df / 2, 2);
  return () => mean + scale * normal() / Math.sqrt(chiSquare() / df);
}
