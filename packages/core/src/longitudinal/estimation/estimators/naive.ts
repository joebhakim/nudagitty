import type { TreatmentStrategy } from "../../../types";
import type { GMethodArmSummary, GMethodEstimate, GMethodsComparisonConfig, LongitudinalCohort } from "../../types";
import { matchesStrategy } from "../../internal";
import { armSummary, difference, weightedOutcomeMean } from "../shared";

export function naiveEstimate(cohort: LongitudinalCohort, config: GMethodsComparisonConfig, left: TreatmentStrategy, right: TreatmentStrategy): GMethodEstimate {
  const leftArm = observedArm(cohort, left, config);
  const rightArm = observedArm(cohort, right, config);
  return {
    id: "naive",
    label: "Observed regimen contrast",
    estimate: difference(leftArm.mean, rightArm.mean),
    arms: [leftArm, rightArm],
    diagnostics: ["Restricts to people whose observed treatment history matches each strategy."]
  };
}

function observedArm(cohort: LongitudinalCohort, strategy: TreatmentStrategy, config: GMethodsComparisonConfig): GMethodArmSummary {
  // The naive baseline is the raw crude contrast — it ignores BOTH confounding and
  // censoring, so it matches the observed-relation scatter exactly. (The advanced rows
  // are what bring censoring back in via IPCW.)
  const mean = weightedOutcomeMean(cohort, config.outcome, (row) => matchesStrategy(row, strategy, config.treatmentVariables));
  return armSummary(strategy, mean.mean, mean.sampleSize, mean.effectiveSampleSize);
}
