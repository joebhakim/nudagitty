import type { SimulatedNodeState } from "@nudagitty/core";
import { weightedBinaryProportion, weightedMean } from "@nudagitty/core";
import { coerceBinary } from "../shared/formatting";

export function weightedConditionalMean(conditionState: SimulatedNodeState, outcomeState: SimulatedNodeState, conditionValue: 0 | 1): number | null {
  const conditions = conditionState.empirical.samples;
  const outcomes = outcomeState.empirical.samples;
  const length = Math.min(conditions.length, outcomes.length);
  const values: number[] = [];
  const weights: number[] = [];
  for (let index = 0; index < length; index += 1) {
    const condition = conditions[index];
    const outcome = outcomes[index];
    if (condition === undefined || outcome === undefined || !Number.isFinite(condition) || !Number.isFinite(outcome)) continue;
    if (coerceBinary(condition) !== conditionValue) continue;
    values.push(outcome);
    weights.push(empiricalSampleWeight(index, conditionState, outcomeState));
  }
  return weightedMean(values, weights);
}

export function weightedJointConditionalMean(
  firstConditionState: SimulatedNodeState,
  firstConditionValue: 0 | 1,
  secondConditionState: SimulatedNodeState,
  secondConditionValue: 0 | 1,
  outcomeState: SimulatedNodeState
): number | null {
  const firstConditions = firstConditionState.empirical.samples;
  const secondConditions = secondConditionState.empirical.samples;
  const outcomes = outcomeState.empirical.samples;
  const length = Math.min(firstConditions.length, secondConditions.length, outcomes.length);
  const values: number[] = [];
  const weights: number[] = [];
  for (let index = 0; index < length; index += 1) {
    const firstCondition = firstConditions[index];
    const secondCondition = secondConditions[index];
    const outcome = outcomes[index];
    if (
      firstCondition === undefined ||
      secondCondition === undefined ||
      outcome === undefined ||
      !Number.isFinite(firstCondition) ||
      !Number.isFinite(secondCondition) ||
      !Number.isFinite(outcome)
    ) continue;
    if (coerceBinary(firstCondition) !== firstConditionValue || coerceBinary(secondCondition) !== secondConditionValue) continue;
    values.push(outcome);
    weights.push(empiricalSampleWeight(index, firstConditionState, secondConditionState, outcomeState));
  }
  return weightedMean(values, weights);
}

export function weightedBinaryShare(conditionState: SimulatedNodeState, conditionValue: 0 | 1): number | null {
  // Turn "matches conditionValue" into a 0/1 indicator so the canonical weighted
  // binary proportion (threshold 0.5) reproduces the old share for BOTH values —
  // the raw-condition form would only match conditionValue === 1. Byte-identical:
  // same included indices, same weights, same Σ(match·w) / Σw.
  const conditions = conditionState.empirical.samples;
  const indicators: number[] = [];
  const weights: number[] = [];
  for (let index = 0; index < conditions.length; index += 1) {
    const condition = conditions[index];
    if (condition === undefined || !Number.isFinite(condition)) continue;
    indicators.push(coerceBinary(condition) === conditionValue ? 1 : 0);
    weights.push(empiricalSampleWeight(index, conditionState));
  }
  return weightedBinaryProportion(indicators, weights, 0.5);
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
