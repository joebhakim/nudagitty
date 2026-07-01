import type { TreatmentStrategy } from "../../../types";
import type { GMethodEstimate, GMethodsComparisonConfig, LongitudinalCohort } from "../../types";
import { asBinary, assignedTreatmentValue, binaryProbabilityTable, isUncensored, matchesStrategy, probabilityFromTable } from "../../internal";
import { armSummary, emptyEstimate } from "../shared";

export function matchingEstimate(cohort: LongitudinalCohort, config: GMethodsComparisonConfig, left: TreatmentStrategy, right: TreatmentStrategy): GMethodEstimate {
  const covariates = config.timeVaryingCovariates;
  if (covariates.length === 0 || config.treatmentVariables.length === 0) {
    return emptyEstimate("matching", "Propensity-score matching", left, right, "Needs a treatment and at least one covariate.");
  }
  const tables = config.treatmentVariables.map((treatment) => binaryProbabilityTable(cohort, treatment, 1, covariates));
  const score = (row: Record<string, number>): number => {
    let probability = 1;
    for (let i = 0; i < config.treatmentVariables.length; i += 1) {
      const assigned = asBinary(assignedTreatmentValue(row, left, config.treatmentVariables[i]!));
      const p1 = probabilityFromTable(tables[i]!, row);
      probability *= assigned === 1 ? p1 : 1 - p1;
    }
    return probability;
  };
  const treated: Array<{ score: number; y: number }> = [];
  const control: Array<{ score: number; y: number }> = [];
  for (const row of cohort.rows) {
    if (!isUncensored(row, config.censoringVariables)) continue;
    const outcome = row[config.outcome];
    if (outcome === undefined || !Number.isFinite(outcome)) continue;
    if (matchesStrategy(row, left, config.treatmentVariables)) treated.push({ score: score(row), y: outcome });
    else if (matchesStrategy(row, right, config.treatmentVariables)) control.push({ score: score(row), y: outcome });
  }
  if (treated.length < 5 || control.length < 5) {
    return emptyEstimate("matching", "Propensity-score matching", left, right, "Too few units in one arm to match.");
  }
  const controlSorted = [...control].sort((a, b) => a.score - b.score);
  const treatedSorted = [...treated].sort((a, b) => a.score - b.score);
  const nearest = (sorted: Array<{ score: number; y: number }>, target: number): number => {
    let lo = 0;
    let hi = sorted.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid]!.score < target) lo = mid + 1; else hi = mid;
    }
    let best = sorted[lo]!;
    if (lo > 0 && Math.abs(sorted[lo - 1]!.score - target) < Math.abs(best.score - target)) best = sorted[lo - 1]!;
    return best.y;
  };
  const att = treated.reduce((acc, unit) => acc + (unit.y - nearest(controlSorted, unit.score)), 0) / treated.length;
  const atc = control.reduce((acc, unit) => acc + (nearest(treatedSorted, unit.score) - unit.y), 0) / control.length;
  const estimate = 0.5 * (att + atc);
  const leftMean = treated.reduce((acc, unit) => acc + unit.y, 0) / treated.length;
  const rightMean = leftMean - estimate;
  const diagnostics = ["1:1 nearest-neighbour matching on the (binned) propensity score, averaging ATT and ATC."];
  if (config.treatmentVariables.length > 1) diagnostics.push("Matches on a composite baseline propensity for the whole regimen — a simplification for multi-step treatments.");
  return {
    id: "matching",
    label: "Propensity-score matching",
    estimate,
    arms: [armSummary(left, leftMean, treated.length, null), armSummary(right, rightMean, control.length, null)],
    diagnostics
  };
}
