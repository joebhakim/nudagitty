import type { GraphNode, SimulationResult } from "@nudagitty/core";
import { effectiveSampleSize, weightedMean } from "@nudagitty/core";
import { clamp, coerceBinary } from "../shared/formatting";
import type { ScatterPoint } from "../charts/CategoryOutcomePlot";
import type {
  SimulationDerivedCache,
  StabilizedIpwBalance,
  StabilizedIpwOutput,
  StabilizedIpwRow
} from "../app/types";
import { binaryCells, binaryOutcomeContrastFromCells, empiricalWeightAt, padDomain } from "./scatterStats";


export function computeStabilizedIpw(
  exposure: GraphNode,
  outcome: GraphNode | null,
  adjustedNodes: GraphNode[],
  simulation: SimulationResult,
  derived?: SimulationDerivedCache
): StabilizedIpwOutput | null {
  const exposureState = simulation.nodeStates[exposure.id];
  const outcomeState = outcome ? simulation.nodeStates[outcome.id] : undefined;
  const adjustedStates = adjustedNodes.map((node) => simulation.nodeStates[node.id]);
  if (!exposureState || adjustedStates.some((state) => !state)) return null;
  if (outcome && !outcomeState) return null;

  const exposureSamples = exposureState.empirical.samples;
  const outcomeSamples = outcomeState?.empirical.samples ?? [];
  const covariateSamples = adjustedStates.map((state) => state?.empirical.samples ?? []);
  const length = Math.min(
    exposureSamples.length,
    outcome ? outcomeSamples.length : exposureSamples.length,
    ...covariateSamples.map((samples) => samples.length)
  );
  const rows: Array<{ treatment: 0 | 1; outcome: number | null; covariates: number[]; baseWeight: number }> = [];
  for (let index = 0; index < length; index += 1) {
    const exposureValue = exposureSamples[index];
    const outcomeValue = outcome ? outcomeSamples[index] : null;
    if (exposureValue === undefined || !Number.isFinite(exposureValue)) continue;
    if (outcome && (outcomeValue === null || outcomeValue === undefined || !Number.isFinite(outcomeValue))) continue;
    const covariates: number[] = [];
    let valid = true;
    for (const samples of covariateSamples) {
      const value = samples[index];
      if (value === undefined || !Number.isFinite(value)) {
        valid = false;
        break;
      }
      covariates.push(value);
    }
    if (!valid) continue;
    rows.push({
      treatment: coerceBinary(exposureValue) as 0 | 1,
      outcome: typeof outcomeValue === "number" ? outcomeValue : null,
      covariates,
      baseWeight: empiricalWeightAt(index, exposureState, outcomeState, ...adjustedStates)
    });
  }
  if (rows.length < Math.max(20, adjustedNodes.length + 3)) return null;

  const weightSum = rows.reduce((sum, row) => sum + row.baseWeight, 0);
  if (weightSum <= 0) return null;
  const treatedShare = rows.reduce((sum, row) => sum + (row.treatment === 1 ? row.baseWeight : 0), 0) / weightSum;
  if (treatedShare <= 0 || treatedShare >= 1) return null;
  const standardized = standardizeCovariates(rows);
  const propensities = fitLogisticPropensity(standardized, rows.map((row) => row.treatment), rows.map((row) => row.baseWeight));
  if (!propensities) return null;

  const clipMin = 0.03;
  const clipMax = 0.97;
  let clippedCount = 0;
  let maxWeight = 0;
  const weightedRows = rows.map((row, index) => {
    const rawPropensity = propensities[index] ?? treatedShare;
    const propensity = clamp(rawPropensity, clipMin, clipMax);
    if (Math.abs(propensity - rawPropensity) > 1e-9) clippedCount += 1;
    const stabilized = row.treatment === 1
      ? treatedShare / propensity
      : (1 - treatedShare) / (1 - propensity);
    const weight = row.baseWeight * stabilized;
    maxWeight = Math.max(maxWeight, weight);
    return { ...row, weight };
  });
  const weightedTreated = outcome ? weightedOutcomeMean(weightedRows, 1, true) : null;
  const weightedUntreated = outcome ? weightedOutcomeMean(weightedRows, 0, true) : null;
  const rawTreated = outcome ? weightedOutcomeMean(weightedRows, 1, false) : null;
  const rawUntreated = outcome ? weightedOutcomeMean(weightedRows, 0, false) : null;
  const weightedPoints: ScatterPoint[] = outcome
    ? weightedRows
      .filter((row) => row.outcome !== null)
      .map((row, index) => ({
        x: row.treatment,
        y: row.outcome ?? 0,
        weight: row.weight,
        index
      }))
    : [];
  const weightedCells = binaryCells(weightedPoints);
  const weights = weightedRows.map((row) => row.weight);
  return {
    exposure,
    outcome,
    adjustedNodes,
    treatedShare,
    rawTreated,
    rawUntreated,
    rawDiff: rawTreated === null || rawUntreated === null ? null : rawTreated - rawUntreated,
    weightedTreated,
    weightedUntreated,
    weightedDiff: weightedTreated === null || weightedUntreated === null ? null : weightedTreated - weightedUntreated,
    effectiveSampleSize: effectiveSampleSize(weights),
    maxWeight: Number.isFinite(maxWeight) ? maxWeight : null,
    clippedCount,
    sampleCount: rows.length,
    weightedPoints,
    weightedCells,
    weightedContrast: binaryOutcomeContrastFromCells(weightedCells),
    balances: computeIpwBalances(weightedRows, adjustedNodes)
  };
}

export function computeIpwBalances(rows: StabilizedIpwRow[], adjustedNodes: GraphNode[]): StabilizedIpwBalance[] {
  return adjustedNodes.map((node, covariateIndex) => {
    const rawTreated = weightedCovariateMoment(rows, covariateIndex, 1, false);
    const rawUntreated = weightedCovariateMoment(rows, covariateIndex, 0, false);
    const weightedTreated = weightedCovariateMoment(rows, covariateIndex, 1, true);
    const weightedUntreated = weightedCovariateMoment(rows, covariateIndex, 0, true);
    const values = rows.map((row) => row.covariates[covariateIndex]).filter((value): value is number => value !== undefined && Number.isFinite(value));
    const meanValues = [
      rawTreated.mean,
      rawUntreated.mean,
      weightedTreated.mean,
      weightedUntreated.mean
    ].filter((value): value is number => value !== null && Number.isFinite(value));
    const min = Math.min(...values, ...meanValues);
    const max = Math.max(...values, ...meanValues);
    const padded = padDomain([min, max]);
    return {
      node,
      domain: padded,
      rawTreatedMean: rawTreated.mean,
      rawUntreatedMean: rawUntreated.mean,
      weightedTreatedMean: weightedTreated.mean,
      weightedUntreatedMean: weightedUntreated.mean,
      rawSmd: standardizedMeanDifference(rawTreated, rawUntreated),
      weightedSmd: standardizedMeanDifference(weightedTreated, weightedUntreated)
    };
  });
}

export function fitLogisticPropensity(x: number[][], treatment: Array<0 | 1>, weights: number[]): number[] | null {
  const width = x[0]?.length ?? 0;
  if (x.length === 0 || width === 0) return null;
  const treatedShare = treatment.reduce<number>((sum, value, index) => sum + value * (weights[index] ?? 1), 0) /
    Math.max(weights.reduce((sum, value) => sum + value, 0), Number.EPSILON);
  let beta = Array.from({ length: width }, (_, index) => index === 0 ? logit(clamp(treatedShare, 1e-4, 1 - 1e-4)) : 0);
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const gradient = Array.from({ length: width }, () => 0);
    const hessian = Array.from({ length: width }, () => Array.from({ length: width }, () => 0));
    for (let rowIndex = 0; rowIndex < x.length; rowIndex += 1) {
      const row = x[rowIndex];
      if (!row) continue;
      const p = logisticSigmoid(row.reduce((sum, value, column) => sum + value * (beta[column] ?? 0), 0));
      const weight = weights[rowIndex] ?? 1;
      const residual = (treatment[rowIndex] ?? 0) - p;
      const curvature = weight * p * (1 - p);
      for (let column = 0; column < width; column += 1) {
        const xColumn = row[column] ?? 0;
        gradient[column] = (gradient[column] ?? 0) + weight * xColumn * residual;
        for (let other = 0; other < width; other += 1) {
          hessian[column]![other] = (hessian[column]![other] ?? 0) + curvature * xColumn * (row[other] ?? 0);
        }
      }
    }
    for (let index = 1; index < width; index += 1) {
      hessian[index]![index] = (hessian[index]![index] ?? 0) + 1e-4;
    }
    const step = solveLinearSystem(hessian, gradient);
    if (!step) return null;
    beta = beta.map((value, index) => value + clamp(step[index] ?? 0, -2, 2));
    if (step.reduce((max, value) => Math.max(max, Math.abs(value)), 0) < 1e-6) break;
  }
  return x.map((row) => logisticSigmoid(row.reduce((sum, value, column) => sum + value * (beta[column] ?? 0), 0)));
}

export function solveLinearSystem(matrix: number[][], rhs: number[]): number[] | null {
  const size = rhs.length;
  const augmented = matrix.map((row, index) => [...row.map((value) => value), rhs[index] ?? 0]);
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row]?.[pivot] ?? 0) > Math.abs(augmented[best]?.[pivot] ?? 0)) best = row;
    }
    if (Math.abs(augmented[best]?.[pivot] ?? 0) < 1e-10) return null;
    const pivotRow = augmented[pivot];
    const bestRow = augmented[best];
    if (!pivotRow || !bestRow) return null;
    augmented[pivot] = bestRow;
    augmented[best] = pivotRow;
    const divisor = augmented[pivot]?.[pivot] ?? 1;
    for (let column = pivot; column <= size; column += 1) {
      augmented[pivot]![column] = (augmented[pivot]![column] ?? 0) / divisor;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row]?.[pivot] ?? 0;
      for (let column = pivot; column <= size; column += 1) {
        augmented[row]![column] = (augmented[row]![column] ?? 0) - factor * (augmented[pivot]?.[column] ?? 0);
      }
    }
  }
  return augmented.map((row) => row[size] ?? 0);
}

export function weightedCovariateMoment(
  rows: StabilizedIpwRow[],
  covariateIndex: number,
  treatment: 0 | 1,
  stabilized: boolean
): { mean: number | null; variance: number | null } {
  let denominator = 0;
  let numerator = 0;
  for (const row of rows) {
    const value = row.covariates[covariateIndex];
    if (row.treatment !== treatment || value === undefined || !Number.isFinite(value)) continue;
    const weight = stabilized ? row.weight : row.baseWeight;
    numerator += value * weight;
    denominator += weight;
  }
  if (denominator <= 0) return { mean: null, variance: null };
  const mean = numerator / denominator;
  const variance = rows.reduce((sum, row) => {
    const value = row.covariates[covariateIndex];
    if (row.treatment !== treatment || value === undefined || !Number.isFinite(value)) return sum;
    const weight = stabilized ? row.weight : row.baseWeight;
    return sum + weight * (value - mean) * (value - mean);
  }, 0) / denominator;
  return { mean, variance };
}

export function standardizedMeanDifference(
  treated: { mean: number | null; variance: number | null },
  untreated: { mean: number | null; variance: number | null }
): number | null {
  if (treated.mean === null || untreated.mean === null || treated.variance === null || untreated.variance === null) return null;
  const pooled = Math.sqrt(Math.max((treated.variance + untreated.variance) / 2, 1e-12));
  return (treated.mean - untreated.mean) / pooled;
}

export function standardizeCovariates(rows: Array<{ covariates: number[]; baseWeight: number }>): number[][] {
  const width = rows[0]?.covariates.length ?? 0;
  const weightSum = rows.reduce((sum, row) => sum + row.baseWeight, 0);
  const means = Array.from({ length: width }, (_, column) => (
    rows.reduce((sum, row) => sum + (row.covariates[column] ?? 0) * row.baseWeight, 0) / Math.max(weightSum, Number.EPSILON)
  ));
  const sds = means.map((mean, column) => {
    const variance = rows.reduce((sum, row) => {
      const delta = (row.covariates[column] ?? 0) - mean;
      return sum + row.baseWeight * delta * delta;
    }, 0) / Math.max(weightSum, Number.EPSILON);
    return Math.sqrt(Math.max(variance, 1e-12));
  });
  return rows.map((row) => [
    1,
    ...row.covariates.map((value, column) => (value - (means[column] ?? 0)) / Math.max(sds[column] ?? 1, 1e-6))
  ]);
}

export function logit(probability: number): number {
  return Math.log(probability / (1 - probability));
}

export function logisticSigmoid(value: number): number {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

export function weightedOutcomeMean(
  rows: Array<{ treatment: 0 | 1; outcome: number | null; baseWeight: number; weight: number }>,
  treatment: 0 | 1,
  stabilized: boolean
): number | null {
  // Collect this arm's non-null outcomes with the requested weight column, then
  // defer to the canonical weighted mean — byte-identical to the old inline
  // Σ(outcome·w) / Σw accumulation (same iteration order, same `Σw > 0 ? … : null`).
  const values: number[] = [];
  const weights: number[] = [];
  for (const row of rows) {
    if (row.treatment !== treatment || row.outcome === null) continue;
    values.push(row.outcome);
    weights.push(stabilized ? row.weight : row.baseWeight);
  }
  return weightedMean(values, weights);
}
