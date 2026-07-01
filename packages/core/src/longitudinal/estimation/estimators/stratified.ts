import type { TreatmentStrategy } from "../../../types";
import type { GMethodEstimate, GMethodsComparisonConfig, LongitudinalCohort } from "../../types";
import { buildBinners, isUncensored, keyFromBinners, matchesStrategy } from "../../internal";
import { armSummary, difference, emptyArms, weightedAverage, weightedOutcomeMean, weightedShare } from "../shared";

export function stratifiedEstimate(cohort: LongitudinalCohort, config: GMethodsComparisonConfig, left: TreatmentStrategy, right: TreatmentStrategy): GMethodEstimate {
  const covariates = config.timeVaryingCovariates;
  if (covariates.length === 0) {
    return {
      id: "stratified",
      label: "Standardized within L",
      estimate: null,
      arms: emptyArms(left, right),
      diagnostics: ["No adjustment covariate was supplied."]
    };
  }
  // Standardize over the JOINT distribution of all covariates, discretizing
  // continuous ones into quantile bins (a single composite stratum key per row).
  const binners = buildBinners(cohort, covariates);
  const stratumOf = (row: Record<string, number>) => keyFromBinners(row, covariates, binners);
  const strata = [...new Set(cohort.rows.map(stratumOf))];
  const leftMeans: Array<{ mean: number; weight: number }> = [];
  const rightMeans: Array<{ mean: number; weight: number }> = [];
  let unsupported = 0;
  for (const stratum of strata) {
    const inStratum = (row: Record<string, number>) => stratumOf(row) === stratum;
    const stratumWeight = weightedShare(cohort, inStratum);
    const leftMean = weightedOutcomeMean(cohort, config.outcome, (row) => matchesStrategy(row, left, config.treatmentVariables) && inStratum(row) && isUncensored(row, config.censoringVariables));
    const rightMean = weightedOutcomeMean(cohort, config.outcome, (row) => matchesStrategy(row, right, config.treatmentVariables) && inStratum(row) && isUncensored(row, config.censoringVariables));
    if (leftMean.mean === null || rightMean.mean === null) {
      unsupported += 1;
      continue;
    }
    leftMeans.push({ mean: leftMean.mean, weight: stratumWeight });
    rightMeans.push({ mean: rightMean.mean, weight: stratumWeight });
  }
  const leftMean = weightedAverage(leftMeans);
  const rightMean = weightedAverage(rightMeans);
  const diagnostics = [`Standardizes the outcome over the joint empirical distribution of ${covariates.join(", ")} (continuous covariates quantile-binned).`];
  if (unsupported > 0) diagnostics.push(`${unsupported} of ${strata.length} strata dropped for lack of both-arm support.`);
  return {
    id: "stratified",
    label: covariates.length === 1 ? `Standardized by ${covariates[0]}` : "Standardized within L",
    estimate: difference(leftMean, rightMean),
    arms: [
      armSummary(left, leftMean, cohort.sampleSize, null),
      armSummary(right, rightMean, cohort.sampleSize, null)
    ],
    diagnostics
  };
}
