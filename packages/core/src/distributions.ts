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
  }
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
