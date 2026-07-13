import type { GraphDocument, TreatmentStrategy } from "../../../types";
import type { GMethodEstimate, StrategyEvaluation } from "../../types";
import { REPLAY_ORACLE_REFUSAL, replayState } from "../../../replay";
import { armSummary, difference, outcomeSamplePoints } from "../shared";

/**
 * The ORACLE, not an estimator. Every other method sees only the data; this one owns the structural
 * equations and re-runs them under each do(). So it is the one method that cannot work when there ARE no
 * structural equations — which is precisely the state a user is in right after importing a CSV.
 *
 * With the outcome replaying its data column, `difference(left.mean, right.mean)` is EXACTLY 0: intervening
 * on the treatment cannot change a column read from a file. That zero used to be rendered as the
 * "re-simulated oracle", in the same type as the real ones, beside estimators that disagreed with it. It was
 * the most persuasive number on the screen and it was guaranteed wrong.
 *
 * So it REFUSES — `estimate: null` plus the reason — exactly as the gamma-log learner refuses an outcome with
 * a zero spike. A model declining to describe your world is an informative answer; a confident 0 is not.
 */
export function gFormulaEstimate(left: TreatmentStrategy, right: TreatmentStrategy, evaluations: [StrategyEvaluation, StrategyEvaluation], document?: GraphDocument): GMethodEstimate {
  const [leftEvaluation, rightEvaluation] = evaluations;
  const hasDynamicStrategy = [left, right].some((strategy) => strategy.kind !== "static" || strategy.rules.length > 0);
  const inert = document ? replayState(document).outcomeReplays : false;
  return {
    id: "g_formula",
    label: hasDynamicStrategy ? "Sequential strategy g-formula" : "Parametric g-formula",
    estimate: inert ? null : difference(leftEvaluation.mean, rightEvaluation.mean),
    arms: [
      armSummary(left, leftEvaluation.mean, leftEvaluation.result.conditioning.acceptedSamples, leftEvaluation.result.conditioning.effectiveSampleSize, outcomeSamplePoints(leftEvaluation.result, leftEvaluation.outcome)),
      armSummary(right, rightEvaluation.mean, rightEvaluation.result.conditioning.acceptedSamples, rightEvaluation.result.conditioning.effectiveSampleSize, outcomeSamplePoints(rightEvaluation.result, rightEvaluation.outcome))
    ],
    diagnostics: inert
      ? [REPLAY_ORACLE_REFUSAL]
      : ["Simulates each complete strategy by intervening on the configured treatment nodes.", ...leftEvaluation.diagnostics, ...rightEvaluation.diagnostics]
  };
}
