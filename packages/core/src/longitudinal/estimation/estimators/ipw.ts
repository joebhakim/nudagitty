import type { TreatmentStrategy } from "../../../types";
import type { ArmPoint, GMethodArmSummary, GMethodEstimate, GMethodsComparisonConfig, LongitudinalCohort } from "../../types";
import { asBinary, assignedTreatmentValue, binaryProbabilityTable, effectiveSampleSize, isUncensored, matchesStrategy, probabilityFromTable, treatmentHistory } from "../../internal";
import { armSummary, difference } from "../shared";

export function ipwEstimate(cohort: LongitudinalCohort, config: GMethodsComparisonConfig, left: TreatmentStrategy, right: TreatmentStrategy): GMethodEstimate {
  const leftArm = weightedIpwArm(cohort, config, left);
  const rightArm = weightedIpwArm(cohort, config, right);
  return {
    id: "ipw",
    label: config.censoringVariables?.length ? "Stabilized IPW/IPCW" : config.stabilizedWeights === false ? "IPW" : "Stabilized IPW",
    estimate: difference(leftArm.mean, rightArm.mean),
    arms: [leftArm, rightArm],
    diagnostics: [config.censoringVariables?.length ? "Weights observed treatment histories and remaining uncensored by estimated probabilities." : "Weights observed histories by estimated treatment probabilities at each treatment time."]
  };
}

function weightedIpwArm(cohort: LongitudinalCohort, config: GMethodsComparisonConfig, strategy: TreatmentStrategy): GMethodArmSummary {
  const probabilityTables = config.treatmentVariables.map((treatment, index) => ({
    treatment,
    priorTreatments: config.treatmentVariables.slice(0, index),
    denominatorHistory: treatmentHistory(treatment, config.treatmentVariables.slice(0, index), config.timeVaryingCovariates)
  })).map((spec) => ({
    ...spec,
    denominatorByValue: {
      0: binaryProbabilityTable(cohort, spec.treatment, 0, spec.denominatorHistory),
      1: binaryProbabilityTable(cohort, spec.treatment, 1, spec.denominatorHistory)
    },
    numeratorByValue: {
      0: binaryProbabilityTable(cohort, spec.treatment, 0, spec.priorTreatments),
      1: binaryProbabilityTable(cohort, spec.treatment, 1, spec.priorTreatments)
    }
  }));
  const censoringTables = (config.censoringVariables ?? []).map((censoring, index) => ({
    censoring,
    denominator: binaryProbabilityTable(cohort, censoring, 0, [...config.treatmentVariables.slice(0, Math.min(index + 1, config.treatmentVariables.length)), ...config.timeVaryingCovariates])
  }));
  const useStabilized = config.stabilizedWeights !== false;
  let numerator = 0;
  let denominator = 0;
  const weights: number[] = [];
  const points: ArmPoint[] = [];
  for (let index = 0; index < cohort.rows.length; index += 1) {
    const row = cohort.rows[index]!;
    if (!matchesStrategy(row, strategy, config.treatmentVariables) || !isUncensored(row, config.censoringVariables)) continue;
    let denominatorProbability = 1;
    let numeratorProbability = 1;
    for (const tableSpec of probabilityTables) {
      const value = asBinary(assignedTreatmentValue(row, strategy, tableSpec.treatment));
      denominatorProbability *= probabilityFromTable(tableSpec.denominatorByValue[value], row);
      if (useStabilized) {
        numeratorProbability *= probabilityFromTable(tableSpec.numeratorByValue[value], row);
      }
    }
    for (const tableSpec of censoringTables) {
      denominatorProbability *= probabilityFromTable(tableSpec.denominator, row);
    }
    const weight = Math.min(50, Math.max(0, numeratorProbability / Math.max(1e-6, denominatorProbability))) * (cohort.weights[index] ?? 1);
    const outcome = row[config.outcome];
    if (outcome === undefined || !Number.isFinite(outcome)) continue;
    numerator += outcome * weight;
    denominator += weight;
    weights.push(weight);
    if (weight > 0) points.push({ y: outcome, weight });
  }
  return armSummary(strategy, denominator > 0 ? numerator / denominator : null, weights.length, effectiveSampleSize(weights) ?? 0, points);
}
