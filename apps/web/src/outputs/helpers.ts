import type { SimulatedNodeState } from "@nudagitty/core";
import { coerceBinary } from "../shared/formatting";

export function weightedConditionalMean(conditionState: SimulatedNodeState, outcomeState: SimulatedNodeState, conditionValue: 0 | 1): number | null {
  const conditions = conditionState.empirical.samples;
  const outcomes = outcomeState.empirical.samples;
  const length = Math.min(conditions.length, outcomes.length);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < length; index += 1) {
    const condition = conditions[index];
    const outcome = outcomes[index];
    if (condition === undefined || outcome === undefined || !Number.isFinite(condition) || !Number.isFinite(outcome)) continue;
    if (coerceBinary(condition) !== conditionValue) continue;
    const weight = empiricalSampleWeight(index, conditionState, outcomeState);
    numerator += outcome * weight;
    denominator += weight;
  }
  return denominator > 0 ? numerator / denominator : null;
}

export function empiricalSampleWeight(index: number, ...states: SimulatedNodeState[]): number {
  for (const state of states) {
    const weight = state.empirical.weights[index];
    if (weight !== undefined && Number.isFinite(weight)) return Math.max(0, weight);
  }
  return 1;
}

export function formatAdjustmentSet(set: string[]): string {
  return set.length === 0 ? "{}" : `{${set.join(", ")}}`;
}
