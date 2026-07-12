import type { TreatmentStrategy } from "../../../types";
import type { ArmPoint, GMethodEstimate, GMethodsComparisonConfig, LongitudinalCohort } from "../../types";
import { asBinary, assignedTreatmentValue, binaryProbabilityTable, isUncensored, matchesStrategy, probabilityFromTable, treatmentHistory } from "../../internal";
import { strategyAssignmentMap } from "../fit";
import { outcomeLearner } from "../learners";
import { armSummary, difference, emptyEstimate } from "../shared";

export function aipwEstimate(cohort: LongitudinalCohort, config: GMethodsComparisonConfig, left: TreatmentStrategy, right: TreatmentStrategy): GMethodEstimate {
  const binary = (config.outcomeScale ?? "risk") === "risk";
  // AIPW is doubly robust: consistent if EITHER this outcome model or the propensity model is right. On
  // lalonde-fit-recover-2part BOTH are broken (the linear model imputes negative earnings; the propensity
  // has a median of 0.0007), so it has no leg to stand on and simply inherits the outcome-model bias.
  const model = outcomeLearner(config.outcomeModel).fit!(cohort, config.outcome, config.treatmentVariables, config.timeVaryingCovariates, binary, config.covariateBasis ?? "linear");
  if (!model) return emptyEstimate("aipw", "Doubly-robust (AIPW)", left, right, "Could not fit the outcome model for the augmentation term.");
  const propensityTables = config.treatmentVariables.map((treatment, index) => ({
    treatment,
    table: binaryProbabilityTable(cohort, treatment, 1, treatmentHistory(treatment, config.treatmentVariables.slice(0, index), config.timeVaryingCovariates))
  }));
  const armEvaluation = (strategy: TreatmentStrategy): { mean: number | null; points: ArmPoint[] } => {
    let sum = 0;
    let weight = 0;
    const points: ArmPoint[] = [];
    for (let i = 0; i < cohort.rows.length; i += 1) {
      const row = cohort.rows[i]!;
      const baseWeight = cohort.weights[i] ?? 1;
      const predicted = model(row, strategyAssignmentMap(row, strategy, config.treatmentVariables));
      let value = predicted;
      if (matchesStrategy(row, strategy, config.treatmentVariables) && isUncensored(row, config.censoringVariables)) {
        const outcome = row[config.outcome];
        if (outcome !== undefined && Number.isFinite(outcome)) {
          let propensity = 1;
          for (const spec of propensityTables) {
            const assigned = asBinary(assignedTreatmentValue(row, strategy, spec.treatment));
            const probability = probabilityFromTable(spec.table, row);
            propensity *= assigned === 1 ? probability : 1 - probability;
          }
          value += (outcome - predicted) / Math.max(0.02, propensity);
        }
      }
      if (Number.isFinite(value)) points.push({ y: value, weight: baseWeight });
      sum += value * baseWeight;
      weight += baseWeight;
    }
    return { mean: weight > 0 ? sum / weight : null, points };
  };
  const leftArm = armEvaluation(left);
  const rightArm = armEvaluation(right);
  return {
    id: "aipw",
    label: "Doubly-robust (AIPW)",
    estimate: difference(leftArm.mean, rightArm.mean),
    arms: [armSummary(left, leftArm.mean, cohort.sampleSize, null, leftArm.points), armSummary(right, rightArm.mean, cohort.sampleSize, null, rightArm.points)],
    diagnostics: ["Augmented IPW: outcome-model prediction plus an inverse-propensity correction. Consistent if EITHER the outcome model or the propensity model is right (doubly robust)."]
  };
}
