import type { SimulationResult, TreatmentStrategy } from "../../types";
import type { ArmPoint, GMethodArmSummary, GMethodEstimate, LongitudinalCohort } from "../types";
import { effectiveSampleSize } from "../internal";
import { weightedAverageOfEstimates, weightedMean } from "../../stats/moments";

export function emptyEstimate(id: GMethodEstimate["id"], label: string, left: TreatmentStrategy, right: TreatmentStrategy, message: string): GMethodEstimate {
  return { id, label, estimate: null, arms: emptyArms(left, right), diagnostics: [message] };
}

export function weightedOutcomeMean(cohort: LongitudinalCohort, outcome: string, predicate: (row: Record<string, number>) => boolean): { mean: number | null; sampleSize: number; effectiveSampleSize: number | null } {
  const values: number[] = [];
  const weights: number[] = [];
  for (let index = 0; index < cohort.rows.length; index += 1) {
    const row = cohort.rows[index]!;
    if (!predicate(row)) continue;
    const value = row[outcome];
    if (value === undefined || !Number.isFinite(value)) continue;
    values.push(value);
    weights.push(cohort.weights[index] ?? 1);
  }
  return {
    mean: weightedMean(values, weights),
    sampleSize: weights.length,
    effectiveSampleSize: weights.length > 0 ? effectiveSampleSize(weights) ?? 0 : null
  };
}

export function weightedShare(cohort: LongitudinalCohort, predicate: (row: Record<string, number>) => boolean): number {
  const weights = cohort.rows.map((_, index) => cohort.weights[index] ?? 1);
  const indicators = cohort.rows.map((row) => (predicate(row) ? 1 : 0));
  return weightedMean(indicators, weights) ?? 0;
}

export function weightedAverage(values: Array<{ mean: number; weight: number }>): number | null {
  return weightedAverageOfEstimates(values.map((entry) => ({ value: entry.mean, weight: entry.weight })));
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
