import { normalizeGraphDocumentMetadata } from "../../graph";
import type { GraphDocument, TreatmentStrategy } from "../../types";
import type {
  GMethodEstimate,
  GMethodsComparison,
  GMethodsComparisonConfig,
  LongitudinalCohort,
  StrategyEvaluation
} from "../types";
import { simulateLongitudinalCohort, validateLongitudinalMetadata } from "../extract";
import { evaluateTreatmentStrategy, summarizeStrategySupport } from "../survival";
import { fitLinearModel } from "./fit";
import { predictLinear } from "../../stats/linalg";
import { weightedOutcomeMean } from "./shared";
import { naiveEstimate } from "./estimators/naive";
import { stratifiedEstimate } from "./estimators/stratified";
import { gFormulaEstimate } from "./estimators/gFormula";
import { ipwEstimate } from "./estimators/ipw";
import { gEstimationEstimate } from "./estimators/gEstimation";
import { outcomeRegressionEstimate } from "./estimators/outcomeRegression";
import { matchingEstimate } from "./estimators/matching";
import { aipwEstimate } from "./estimators/aipw";
import { assignedTreatmentValue, effectiveSampleSize, isUncensored } from "../internal";

export function compareLongitudinalGMethods(document: GraphDocument, config: GMethodsComparisonConfig): GMethodsComparison | null {
  const fullMetadata = normalizeGraphDocumentMetadata(document.metadata);
  const metadata = fullMetadata.longitudinal;
  const strategies = config.strategies ?? resolveStrategies(metadata.treatmentStrategies, config.strategyIds);
  if (!strategies) return null;
  const cohort = simulateLongitudinalCohort(document);
  const [leftStrategy, rightStrategy] = strategies;
  const strategyEvaluations: [StrategyEvaluation, StrategyEvaluation] = [
    evaluateTreatmentStrategy(document, leftStrategy, config.outcome),
    evaluateTreatmentStrategy(document, rightStrategy, config.outcome)
  ];
  const estimates: GMethodEstimate[] = [
    naiveEstimate(cohort, config, leftStrategy, rightStrategy),
    stratifiedEstimate(cohort, config, leftStrategy, rightStrategy),
    gFormulaEstimate(leftStrategy, rightStrategy, strategyEvaluations),
    ipwEstimate(cohort, config, leftStrategy, rightStrategy),
    gEstimationEstimate(cohort, config, leftStrategy, rightStrategy),
    outcomeRegressionEstimate(cohort, config, leftStrategy, rightStrategy),
    matchingEstimate(cohort, config, leftStrategy, rightStrategy),
    aipwEstimate(cohort, config, leftStrategy, rightStrategy)
  ];
  return {
    treatmentVariables: config.treatmentVariables,
    timeVaryingCovariates: config.timeVaryingCovariates,
    outcome: config.outcome,
    outcomeScale: config.outcomeScale ?? "risk",
    strategies,
    strategyEvaluations,
    estimates,
    support: strategies.flatMap((strategy) => summarizeStrategySupport(cohort, config, strategy)),
    cohort: {
      sampleSize: cohort.sampleSize,
      effectiveSampleSize: effectiveSampleSize(cohort.weights) ?? 0
    },
    diagnostics: validateLongitudinalMetadata(document),
    // The comparison surfaces the imposed TARGET (a number, for display next to the MC-noisy do()-oracle);
    // the full ImposedEffect spec (share, exposure, outcome) stays on the document metadata.
    ...(typeof fullMetadata.imposedEffect?.target === "number" ? { imposedEffect: fullMetadata.imposedEffect.target } : {})
  };
}

function resolveStrategies(strategies: TreatmentStrategy[], ids: [string, string] | undefined): [TreatmentStrategy, TreatmentStrategy] | null {
  if (ids) {
    const left = strategies.find((strategy) => strategy.id === ids[0]);
    const right = strategies.find((strategy) => strategy.id === ids[1]);
    return left && right ? [left, right] : null;
  }
  return strategies.length >= 2 && strategies[0] && strategies[1] ? [strategies[0], strategies[1]] : null;
}

function standardizedOutcomeModelMean(cohort: LongitudinalCohort, config: Pick<GMethodsComparisonConfig, "treatmentVariables" | "timeVaryingCovariates" | "outcome" | "censoringVariables">, strategy: TreatmentStrategy): number | null {
  const features = [...new Set([...config.treatmentVariables, ...config.timeVaryingCovariates])];
  const usableRows = cohort.rows.filter((row) => isUncensored(row, config.censoringVariables) && Number.isFinite(row[config.outcome] ?? Number.NaN));
  if (usableRows.length === 0) return null;
  const beta = fitLinearModel(usableRows, config.outcome, features);
  if (!beta) return weightedOutcomeMean(cohort, config.outcome, (row) => isUncensored(row, config.censoringVariables)).mean;
  let total = 0;
  let weightTotal = 0;
  for (let index = 0; index < cohort.rows.length; index += 1) {
    const row = cohort.rows[index]!;
    if (!isUncensored(row, config.censoringVariables)) continue;
    const predictionRow = { ...row };
    for (const treatment of config.treatmentVariables) predictionRow[treatment] = assignedTreatmentValue(row, strategy, treatment);
    const prediction = predictLinear(beta, features, predictionRow);
    const weight = cohort.weights[index] ?? 1;
    total += prediction * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? total / weightTotal : null;
}

function inferredTimeVaryingCovariates(document: GraphDocument, treatmentVariables: string[], outcome: string): string[] {
  const treatmentSet = new Set(treatmentVariables);
  return Object.entries(normalizeGraphDocumentMetadata(document.metadata).longitudinal.variables)
    .filter(([id, variable]) => id !== outcome && !treatmentSet.has(id) && (variable.role === "baseline" || variable.role === "time_varying_confounder"))
    .map(([id]) => id);
}
