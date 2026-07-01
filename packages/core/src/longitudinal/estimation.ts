import { normalizeGraphDocumentMetadata } from "../graph";
import type { GraphDocument, TreatmentStrategy } from "../types";
import type {
  ArmPoint,
  GMethodArmSummary,
  GMethodEstimate,
  GMethodsComparison,
  GMethodsComparisonConfig,
  LongitudinalCohort,
  StrategyEvaluation
} from "./types";
import { simulateLongitudinalCohort, validateLongitudinalMetadata } from "./extract";
import { evaluateTreatmentStrategy, summarizeStrategySupport } from "./survival";
import { fitLinearModel, fitOutcomeModel, predictLinear, strategyAssignmentMap } from "./estimation/fit";
import { armSummary, difference, emptyArms, emptyEstimate, outcomeSamplePoints, roundForDiagnostic, weightedAverage, weightedOutcomeMean, weightedShare } from "./estimation/shared";
import { naiveEstimate } from "./estimation/estimators/naive";
import { stratifiedEstimate } from "./estimation/estimators/stratified";
import { gFormulaEstimate } from "./estimation/estimators/gFormula";
import {
  asBinary,
  assignedTreatmentValue,
  binaryProbabilityTable,
  buildBinners,
  effectiveSampleSize,
  isUncensored,
  keyFromBinners,
  matchesStrategy,
  probabilityFromTable,
  treatmentHistory
} from "./internal";

export function compareLongitudinalGMethods(document: GraphDocument, config: GMethodsComparisonConfig): GMethodsComparison | null {
  const metadata = normalizeGraphDocumentMetadata(document.metadata).longitudinal;
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
      effectiveSampleSize: effectiveSampleSize(cohort.weights)
    },
    diagnostics: validateLongitudinalMetadata(document)
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

function ipwEstimate(cohort: LongitudinalCohort, config: GMethodsComparisonConfig, left: TreatmentStrategy, right: TreatmentStrategy): GMethodEstimate {
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

function gEstimationEstimate(cohort: LongitudinalCohort, config: GMethodsComparisonConfig, left: TreatmentStrategy, right: TreatmentStrategy): GMethodEstimate {
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

// --- Additional choosable estimators -----------------------------------------
// Parametric outcome regression, propensity matching, and doubly-robust AIPW.
// These complement the (nonparametric) standardization / IPW / g-estimation rows;
// being parametric, outcome regression and AIPW expose functional-form assumptions
// the binned estimators avoid — a deliberate contrast.

function outcomeRegressionEstimate(cohort: LongitudinalCohort, config: GMethodsComparisonConfig, left: TreatmentStrategy, right: TreatmentStrategy): GMethodEstimate {
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

function aipwEstimate(cohort: LongitudinalCohort, config: GMethodsComparisonConfig, left: TreatmentStrategy, right: TreatmentStrategy): GMethodEstimate {
  const binary = (config.outcomeScale ?? "risk") === "risk";
  const model = fitOutcomeModel(cohort, config.outcome, config.treatmentVariables, config.timeVaryingCovariates, binary, config.covariateBasis ?? "linear");
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

function matchingEstimate(cohort: LongitudinalCohort, config: GMethodsComparisonConfig, left: TreatmentStrategy, right: TreatmentStrategy): GMethodEstimate {
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
  return armSummary(strategy, denominator > 0 ? numerator / denominator : null, weights.length, effectiveSampleSize(weights), points);
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

function inferredTimeVaryingCovariates(document: GraphDocument, treatmentVariables: string[], outcome: string): string[] {
  const treatmentSet = new Set(treatmentVariables);
  return Object.entries(normalizeGraphDocumentMetadata(document.metadata).longitudinal.variables)
    .filter(([id, variable]) => id !== outcome && !treatmentSet.has(id) && (variable.role === "baseline" || variable.role === "time_varying_confounder"))
    .map(([id]) => id);
}

