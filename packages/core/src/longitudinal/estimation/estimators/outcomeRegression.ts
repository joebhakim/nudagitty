import type { TreatmentStrategy } from "../../../types";
import type { ArmPoint, GMethodEstimate, GMethodsComparisonConfig, LongitudinalCohort } from "../../types";
import { fitOutcomeModel, strategyAssignmentMap } from "../fit";
import { armSummary, difference, emptyEstimate } from "../shared";

export function outcomeRegressionEstimate(cohort: LongitudinalCohort, config: GMethodsComparisonConfig, left: TreatmentStrategy, right: TreatmentStrategy): GMethodEstimate {
  const binary = (config.outcomeScale ?? "risk") === "risk";
  const model = fitOutcomeModel(cohort, config.outcome, config.treatmentVariables, config.timeVaryingCovariates, binary, config.covariateBasis ?? "linear");
  if (!model) return emptyEstimate("outcome_regression", "Outcome regression", left, right, "Not enough data to fit the parametric outcome model.");
  const predictArm = (strategy: TreatmentStrategy): { mean: number | null; points: ArmPoint[] } => {
    let sum = 0;
    let weight = 0;
    const points: ArmPoint[] = [];
    for (let i = 0; i < cohort.rows.length; i += 1) {
      const row = cohort.rows[i]!;
      const baseWeight = cohort.weights[i] ?? 1;
      const predicted = model(row, strategyAssignmentMap(row, strategy, config.treatmentVariables));
      if (Number.isFinite(predicted)) points.push({ y: predicted, weight: baseWeight });
      sum += predicted * baseWeight;
      weight += baseWeight;
    }
    return { mean: weight > 0 ? sum / weight : null, points };
  };
  const leftArm = predictArm(left);
  const rightArm = predictArm(right);
  const leftMean = leftArm.mean;
  const rightMean = rightArm.mean;
  const multiStep = config.treatmentVariables.length > 1;
  const diagnostics = [`Fits a ${binary ? "logistic" : "linear"} model of ${config.outcome} on treatment(s) + covariates, then predicts every unit under each strategy. Parametric: a misspecified functional form (e.g. real non-linearity) biases this even where standardization is unbiased.`];
  if (multiStep) diagnostics.push("Pooled across treatment times — a simplification of the full sequential parametric g-formula.");
  return {
    id: "outcome_regression",
    label: "Outcome regression (parametric g-formula)",
    estimate: difference(leftMean, rightMean),
    arms: [armSummary(left, leftMean, cohort.sampleSize, null, leftArm.points), armSummary(right, rightMean, cohort.sampleSize, null, rightArm.points)],
    diagnostics
  };
}
