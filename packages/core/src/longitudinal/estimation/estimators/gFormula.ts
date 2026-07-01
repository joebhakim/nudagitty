import type { TreatmentStrategy } from "../../../types";
import type { GMethodEstimate, StrategyEvaluation } from "../../types";
import { armSummary, difference, outcomeSamplePoints } from "../shared";

export function gFormulaEstimate(left: TreatmentStrategy, right: TreatmentStrategy, evaluations: [StrategyEvaluation, StrategyEvaluation]): GMethodEstimate {
  const [leftEvaluation, rightEvaluation] = evaluations;
  const hasDynamicStrategy = [left, right].some((strategy) => strategy.kind !== "static" || strategy.rules.length > 0);
  return {
    id: "g_formula",
    label: hasDynamicStrategy ? "Sequential strategy g-formula" : "Parametric g-formula",
    estimate: difference(leftEvaluation.mean, rightEvaluation.mean),
    arms: [
      armSummary(left, leftEvaluation.mean, leftEvaluation.result.conditioning.acceptedSamples, leftEvaluation.result.conditioning.effectiveSampleSize, outcomeSamplePoints(leftEvaluation.result, leftEvaluation.outcome)),
      armSummary(right, rightEvaluation.mean, rightEvaluation.result.conditioning.acceptedSamples, rightEvaluation.result.conditioning.effectiveSampleSize, outcomeSamplePoints(rightEvaluation.result, rightEvaluation.outcome))
    ],
    diagnostics: ["Simulates each complete strategy by intervening on the configured treatment nodes.", ...leftEvaluation.diagnostics, ...rightEvaluation.diagnostics]
  };
}
