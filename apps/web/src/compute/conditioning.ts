import { coerceBinary } from "../shared/formatting";
import type { SimulatedNodeState } from "@nudagitty/core";
import type { PositivityRow } from "../app/types";

export function conditioningSliderBounds(state: SimulatedNodeState | undefined, value: number): [number, number] {
  const candidates = [value].filter(Number.isFinite);
  if (state?.empirical.min !== null && state?.empirical.min !== undefined) candidates.push(state.empirical.min);
  if (state?.empirical.max !== null && state?.empirical.max !== undefined) candidates.push(state.empirical.max);
  if (state?.analytic?.mean !== null && state?.analytic?.mean !== undefined && state.analytic.variance !== null && Number.isFinite(state.analytic.variance)) {
    const sd = Math.sqrt(Math.max(0, state.analytic.variance));
    candidates.push(state.analytic.mean - 4 * sd, state.analytic.mean + 4 * sd);
  }
  if (candidates.length === 0) return [-10, 10];
  let min = Math.min(...candidates);
  let max = Math.max(...candidates);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [-10, 10];
  if (Math.abs(max - min) < 1e-6) {
    min -= 10;
    max += 10;
  }
  const pad = (max - min) * 0.05;
  return [min - pad, max + pad];
}

export function conditioningSliderStep(min: number, max: number): number {
  const span = Math.abs(max - min);
  if (span <= 2) return 0.01;
  if (span <= 20) return 0.1;
  return 1;
}

export function adjustmentCutStep(domain: [number, number]): number {
  const span = Math.abs(domain[1] - domain[0]);
  if (span <= 2) return 0.01;
  if (span <= 20) return 0.1;
  return 1;
}

export function sanitizeCutpoints(cutpoints: number[], domain: [number, number]): number[] {
  const [min, max] = domain;
  const epsilon = Math.max((max - min) * 0.005, Number.EPSILON);
  return [...new Set(cutpoints
    .filter((value) => Number.isFinite(value) && value > min + epsilon && value < max - epsilon)
    .map((value) => roundToStep(value, adjustmentCutStep(domain))))]
    .sort((a, b) => a - b);
}

export function defaultQuantileCuts(samples: number[], domain: [number, number], bins: number): number[] {
  const sorted = samples.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length < bins) {
    const [min, max] = domain;
    return Array.from({ length: bins - 1 }, (_, index) => min + ((index + 1) / bins) * (max - min));
  }
  return Array.from({ length: bins - 1 }, (_, index) => {
    const sampleIndex = Math.min(sorted.length - 1, Math.max(0, Math.round(((index + 1) / bins) * (sorted.length - 1))));
    return sorted[sampleIndex] ?? domain[0];
  });
}

export function positivityRows(confounderState: SimulatedNodeState | undefined, exposureState: SimulatedNodeState, cutpoints: number[], domain: [number, number]): PositivityRow[] {
  const confounderSamples = confounderState?.empirical.samples ?? [];
  const exposureSamples = exposureState.empirical.samples;
  const weights = confounderState?.empirical.weights.length ? confounderState.empirical.weights : exposureState.empirical.weights;
  const boundaries = [domain[0], ...cutpoints, domain[1]];
  return boundaries.slice(0, -1).map((lower, index) => {
    const upper = boundaries[index + 1] ?? domain[1];
    let exposed = 0;
    let unexposed = 0;
    for (let sampleIndex = 0; sampleIndex < Math.min(confounderSamples.length, exposureSamples.length); sampleIndex += 1) {
      const confounder = confounderSamples[sampleIndex];
      const exposure = exposureSamples[sampleIndex];
      if (confounder === undefined || exposure === undefined || !Number.isFinite(confounder) || !Number.isFinite(exposure)) continue;
      const inBin = index === boundaries.length - 2 ? confounder >= lower && confounder <= upper : confounder >= lower && confounder < upper;
      if (!inBin) continue;
      const weight = Math.max(0, weights[sampleIndex] ?? 1);
      if (coerceBinary(exposure) === 1) exposed += weight;
      else unexposed += weight;
    }
    const total = exposed + unexposed;
    const minArm = Math.min(exposed, unexposed);
    const warning = total <= 0
      ? "empty bin"
      : minArm <= 0
        ? "no support"
        : minArm < 8 || minArm / total < 0.08
          ? "weak support"
          : null;
    return { lower, upper, exposed, unexposed, total, warning };
  });
}

export function roundToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
  const decimals = step >= 1 ? 0 : Math.min(6, Math.ceil(Math.abs(Math.log10(step))));
  return Number(value.toFixed(decimals));
}
