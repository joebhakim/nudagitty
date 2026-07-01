import type { SimulationResult, TreatmentStrategy } from "../../types";
import type { ArmPoint, GMethodArmSummary, GMethodEstimate, LongitudinalCohort } from "../types";
import { effectiveSampleSize } from "../internal";

export function emptyEstimate(id: GMethodEstimate["id"], label: string, left: TreatmentStrategy, right: TreatmentStrategy, message: string): GMethodEstimate {
  return { id, label, estimate: null, arms: emptyArms(left, right), diagnostics: [message] };
}

export function weightedOutcomeMean(cohort: LongitudinalCohort, outcome: string, predicate: (row: Record<string, number>) => boolean): { mean: number | null; sampleSize: number; effectiveSampleSize: number | null } {
  let numerator = 0;
  let denominator = 0;
  const weights: number[] = [];
  for (let index = 0; index < cohort.rows.length; index += 1) {
    const row = cohort.rows[index]!;
    if (!predicate(row)) continue;
    const value = row[outcome];
    if (value === undefined || !Number.isFinite(value)) continue;
    const weight = cohort.weights[index] ?? 1;
    numerator += value * weight;
    denominator += weight;
    weights.push(weight);
  }
  return {
    mean: denominator > 0 ? numerator / denominator : null,
    sampleSize: weights.length,
    effectiveSampleSize: weights.length > 0 ? effectiveSampleSize(weights) : null
  };
}

export function weightedShare(cohort: LongitudinalCohort, predicate: (row: Record<string, number>) => boolean): number {
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < cohort.rows.length; index += 1) {
    const weight = cohort.weights[index] ?? 1;
    denominator += weight;
    if (predicate(cohort.rows[index]!)) numerator += weight;
  }
  return denominator > 0 ? numerator / denominator : 0;
}

export function weightedAverage(values: Array<{ mean: number; weight: number }>): number | null {
  const denominator = values.reduce((sum, value) => sum + value.weight, 0);
  if (denominator <= 0) return null;
  return values.reduce((sum, value) => sum + value.mean * value.weight, 0) / denominator;
}

export function armSummary(strategy: TreatmentStrategy, mean: number | null, sampleSize: number, effectiveSampleSize: number | null, points?: ArmPoint[] | null): GMethodArmSummary {
  return {
    strategyId: strategy.id,
    label: strategy.label,
    mean,
    sampleSize,
    effectiveSampleSize,
    points: points && points.length > 0 ? points : null
  };
}

// Pull a strategy's re-simulated outcome cloud out of its forward-pass result. These ARE
// the g-formula's individual counterfactual outcomes — their weighted mean is the arm mean.
export function outcomeSamplePoints(result: SimulationResult, outcome: string): ArmPoint[] | null {
  const empirical = result.nodeStates[outcome]?.empirical;
  if (!empirical) return null;
  const points: ArmPoint[] = [];
  for (let index = 0; index < empirical.samples.length; index += 1) {
    const y = empirical.samples[index];
    if (y === undefined || !Number.isFinite(y)) continue;
    const weight = empirical.weights[index];
    points.push({ y, weight: weight !== undefined && Number.isFinite(weight) && weight > 0 ? weight : 1 });
  }
  return points.length > 0 ? points : null;
}

export function emptyArms(left: TreatmentStrategy, right: TreatmentStrategy): [GMethodArmSummary, GMethodArmSummary] {
  return [
    armSummary(left, null, 0, null),
    armSummary(right, null, 0, null)
  ];
}

export function difference(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left - right;
}

export function roundForDiagnostic(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") : "NA";
}
