import type { TreatmentStrategy } from "../../../types";
import type { GMethodEstimate, GMethodsComparisonConfig, LongitudinalCohort } from "../../types";
import { asBinary, assignedTreatmentValue, binaryProbabilityTable, probabilityFromTable, treatmentHistory } from "../../internal";
import { armSummary, emptyArms, roundForDiagnostic, weightedOutcomeMean } from "../shared";

export function gEstimationEstimate(cohort: LongitudinalCohort, config: GMethodsComparisonConfig, left: TreatmentStrategy, right: TreatmentStrategy): GMethodEstimate {
  if (config.treatmentVariables.length === 0) {
    const arms = emptyArms(left, right);
    return {
      id: "g_estimation",
      label: "G-estimation",
      estimate: null,
      arms,
      diagnostics: ["This teaching estimator needs at least one treatment variable."]
    };
  }
  let blippedOutcome = config.outcome;
  let currentCohort = cohort;
  const psis = new Map<string, number>();
  for (let index = config.treatmentVariables.length - 1; index >= 0; index -= 1) {
    const treatment = config.treatmentVariables[index]!;
    const history = treatmentHistory(treatment, config.treatmentVariables.slice(0, index), config.timeVaryingCovariates);
    const psi = residualizedTreatmentCoefficient(currentCohort, blippedOutcome, treatment, history);
    psis.set(treatment, psi);
    const nextOutcome = `__blipped_${treatment}`;
    currentCohort = {
      ...currentCohort,
      rows: currentCohort.rows.map((row) => ({
        ...row,
        [nextOutcome]: (row[blippedOutcome] ?? 0) - psi * asBinary(row[treatment])
      }))
    };
    blippedOutcome = nextOutcome;
  }
  const estimate = weightedStrategyAssignmentDifference(cohort, config.treatmentVariables, left, right, psis);
  const observedMean = weightedOutcomeMean(cohort, config.outcome, () => true).mean;
  const leftMean = observedMean === null ? null : observedMean + estimate / 2;
  const rightMean = observedMean === null ? null : observedMean - estimate / 2;
  const psiDiagnostic = config.treatmentVariables.map((treatment) => `${treatment}=${roundForDiagnostic(psis.get(treatment) ?? 0)}`).join(", ");
  return {
    id: "g_estimation",
    label: "Additive g-estimation",
    estimate,
    arms: [
      armSummary(left, leftMean, cohort.sampleSize, null),
      armSummary(right, rightMean, cohort.sampleSize, null)
    ],
    diagnostics: [`Sequential residualized additive blip coefficients: ${psiDiagnostic}.`]
  };
}

function residualizedTreatmentCoefficient(cohort: LongitudinalCohort, outcome: string, treatment: string, history: string[]): number {
  const residuals: number[] = [];
  const outcomes: number[] = [];
  const treatments: number[] = [];
  const probabilities = binaryProbabilityTable(cohort, treatment, 1, history);
  for (const row of cohort.rows) {
    const treatmentValue = asBinary(row[treatment]);
    const predicted = probabilityFromTable(probabilities, row);
    const y = row[outcome];
    if (y === undefined || !Number.isFinite(y)) continue;
    residuals.push(treatmentValue - predicted);
    outcomes.push(y);
    treatments.push(treatmentValue);
  }
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < residuals.length; index += 1) {
    const residual = residuals[index] ?? 0;
    numerator += residual * (outcomes[index] ?? 0);
    denominator += residual * (treatments[index] ?? 0);
  }
  return Math.abs(denominator) > 1e-9 ? numerator / denominator : 0;
}

function weightedStrategyAssignmentDifference(cohort: LongitudinalCohort, treatmentVariables: string[], left: TreatmentStrategy, right: TreatmentStrategy, psis: Map<string, number>): number {
  let total = 0;
  let weightTotal = 0;
  for (let index = 0; index < cohort.rows.length; index += 1) {
    const row = cohort.rows[index]!;
    const contrast = treatmentVariables.reduce((sum, treatment) => {
      const psi = psis.get(treatment) ?? 0;
      return sum + (assignedTreatmentValue(row, left, treatment) - assignedTreatmentValue(row, right, treatment)) * psi;
    }, 0);
    const weight = cohort.weights[index] ?? 1;
    total += contrast * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? total / weightTotal : 0;
}
