import type { SimulatedNodeState } from "@nudagitty/core";
import { empiricalSampleWeight } from "../helpers";
import { formatSignedValue } from "../../shared/formatting";

export function filteredConditionalMean(
  conditionState: SimulatedNodeState,
  outcomeState: SimulatedNodeState,
  conditionValue: 0 | 1,
  filterState: SimulatedNodeState,
  predicate: (value: number) => boolean
): number | null {
  const conditions = conditionState.empirical.samples;
  const outcomes = outcomeState.empirical.samples;
  const filters = filterState.empirical.samples;
  const length = Math.min(conditions.length, outcomes.length, filters.length);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < length; index += 1) {
    const condition = conditions[index];
    const outcome = outcomes[index];
    const filter = filters[index];
    if (
      condition === undefined ||
      outcome === undefined ||
      filter === undefined ||
      !Number.isFinite(condition) ||
      !Number.isFinite(outcome) ||
      !Number.isFinite(filter)
    ) continue;
    if ((condition >= 0.5 ? 1 : 0) !== conditionValue || !predicate(filter)) continue;
    numerator += outcome;
    denominator += 1;
  }
  return denominator > 0 ? numerator / denominator : null;
}

type MeanDifferenceInterval = {
  diff: number;
  lower: number;
  upper: number;
  n0: number;
  n1: number;
};

export function filteredMeanDifferenceInterval(
  conditionState: SimulatedNodeState,
  outcomeState: SimulatedNodeState,
  predicate: ((index: number) => boolean) | null
): MeanDifferenceInterval | null {
  const group0 = weightedGroupMoments(conditionState, outcomeState, 0, predicate);
  const group1 = weightedGroupMoments(conditionState, outcomeState, 1, predicate);
  if (!group0 || !group1 || group0.nEff <= 1 || group1.nEff <= 1) return null;
  const diff = group1.mean - group0.mean;
  const se = Math.sqrt(group1.variance / group1.nEff + group0.variance / group0.nEff);
  return {
    diff,
    lower: diff - 1.96 * se,
    upper: diff + 1.96 * se,
    n0: Math.round(group0.nEff),
    n1: Math.round(group1.nEff)
  };
}

export function weightedGroupMoments(
  conditionState: SimulatedNodeState,
  outcomeState: SimulatedNodeState,
  conditionValue: 0 | 1,
  predicate: ((index: number) => boolean) | null
): { mean: number; variance: number; nEff: number } | null {
  const conditions = conditionState.empirical.samples;
  const outcomes = outcomeState.empirical.samples;
  const length = Math.min(conditions.length, outcomes.length);
  let sumWeight = 0;
  let sumWeightSquared = 0;
  let sum = 0;
  const retained: Array<{ value: number; weight: number }> = [];
  for (let index = 0; index < length; index += 1) {
    if (predicate && !predicate(index)) continue;
    const condition = conditions[index];
    const outcome = outcomes[index];
    if (condition === undefined || outcome === undefined || !Number.isFinite(condition) || !Number.isFinite(outcome)) continue;
    if ((condition >= 0.5 ? 1 : 0) !== conditionValue) continue;
    const weight = empiricalSampleWeight(index, conditionState, outcomeState);
    if (weight <= 0) continue;
    retained.push({ value: outcome, weight });
    sumWeight += weight;
    sumWeightSquared += weight * weight;
    sum += outcome * weight;
  }
  if (sumWeight <= 0 || sumWeightSquared <= 0) return null;
  const mean = sum / sumWeight;
  const variance = retained.reduce((acc, item) => acc + item.weight * (item.value - mean) ** 2, 0) / sumWeight;
  return {
    mean,
    variance,
    nEff: sumWeight * sumWeight / sumWeightSquared
  };
}

export function intervalDetail(interval: MeanDifferenceInterval): string {
  return `95% CI ${formatSignedValue(interval.lower)} to ${formatSignedValue(interval.upper)}`;
}

export function weightedConditionalMeanOfDifference(
  conditionState: SimulatedNodeState,
  leftState: SimulatedNodeState,
  rightState: SimulatedNodeState,
  conditionValue: 0 | 1
): number | null {
  const conditions = conditionState.empirical.samples;
  const left = leftState.empirical.samples;
  const right = rightState.empirical.samples;
  const length = Math.min(conditions.length, left.length, right.length);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < length; index += 1) {
    const condition = conditions[index];
    const leftValue = left[index];
    const rightValue = right[index];
    if (
      condition === undefined ||
      leftValue === undefined ||
      rightValue === undefined ||
      !Number.isFinite(condition) ||
      !Number.isFinite(leftValue) ||
      !Number.isFinite(rightValue)
    ) continue;
    if ((condition >= 0.5 ? 1 : 0) !== conditionValue) continue;
    numerator += (leftValue - rightValue);
    denominator += 1;
  }
  return denominator > 0 ? numerator / denominator : null;
}

export function quantile(values: number[], p: number): number | null {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const index = Math.min(finite.length - 1, Math.max(0, Math.floor((finite.length - 1) * p)));
  return finite[index] ?? null;
}

export function correlation(x: number[], y: number[]): number {
  const paired = x.map((value, index) => [value, y[index]] as const)
    .filter((pair): pair is readonly [number, number] => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
  if (paired.length < 2) return 0;
  const meanX = paired.reduce((sum, pair) => sum + pair[0], 0) / paired.length;
  const meanY = paired.reduce((sum, pair) => sum + pair[1], 0) / paired.length;
  let numerator = 0;
  let xVariance = 0;
  let yVariance = 0;
  for (const [xValue, yValue] of paired) {
    const dx = xValue - meanX;
    const dy = yValue - meanY;
    numerator += dx * dy;
    xVariance += dx * dx;
    yVariance += dy * dy;
  }
  return numerator / Math.sqrt(Math.max(Number.EPSILON, xVariance * yVariance));
}
