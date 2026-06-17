import { normalizeGraphDocumentMetadata } from "./graph";
import { runIntervenedEmpiricalSimulation, runSimulation } from "./simulation";
import type {
  GraphDocument,
  GraphNode,
  LongitudinalTimePoint,
  LongitudinalVariableMetadata,
  SimulationResult,
  SurvivalOutputSpec,
  TreatmentStrategy
} from "./types";

export interface ExtractedLongitudinalNode {
  node: GraphNode;
  metadata: LongitudinalVariableMetadata;
  timePoint: LongitudinalTimePoint | null;
}

export interface ExtractedLongitudinalGraph {
  timePoints: LongitudinalTimePoint[];
  nodes: ExtractedLongitudinalNode[];
  treatmentStrategies: TreatmentStrategy[];
  diagnostics: string[];
}

export interface LongitudinalCohort {
  result: SimulationResult;
  rows: Array<Record<string, number>>;
  weights: number[];
  sampleSize: number;
}

export interface StrategyEvaluation {
  strategy: TreatmentStrategy;
  outcome: string;
  mean: number | null;
  result: SimulationResult;
  diagnostics: string[];
}

export interface PersonTimeRow {
  subject: number;
  interval: number;
  time: number;
  event: 0 | 1;
  censored: 0 | 1;
  weight: number;
  eventVariable: string;
  censoringVariable: string | null;
}

export interface SurvivalCurvePoint {
  interval: number;
  label: string;
  atRisk: number;
  events: number;
  censored: number;
  hazard: number | null;
  survival: number;
  risk: number;
}

export interface GMethodsComparisonConfig {
  treatmentVariables: string[];
  timeVaryingCovariates: string[];
  outcome: string;
  strategyIds?: [string, string];
  strategies?: [TreatmentStrategy, TreatmentStrategy];
  stabilizedWeights?: boolean;
  censoringVariables?: string[];
  outcomeScale?: "risk" | "mean";
}

export interface GMethodArmSummary {
  strategyId: string;
  label: string;
  mean: number | null;
  sampleSize: number;
  effectiveSampleSize: number | null;
}

export interface GMethodEstimate {
  id: "naive" | "stratified" | "g_formula" | "ipw" | "g_estimation";
  label: string;
  estimate: number | null;
  arms: [GMethodArmSummary, GMethodArmSummary];
  diagnostics: string[];
}

export interface StrategySupportSummary {
  strategyId: string;
  label: string;
  treatment: string;
  assignedShare: number;
  observedMatchShare: number;
  ruleConditionShare: number | null;
  uncensoredShare: number;
  sampleSize: number;
  uncensoredSampleSize: number;
}

export interface GMethodsComparison {
  treatmentVariables: string[];
  timeVaryingCovariates: string[];
  outcome: string;
  outcomeScale: "risk" | "mean";
  strategies: [TreatmentStrategy, TreatmentStrategy];
  strategyEvaluations: [StrategyEvaluation, StrategyEvaluation];
  estimates: GMethodEstimate[];
  support: StrategySupportSummary[];
  cohort: {
    sampleSize: number;
    effectiveSampleSize: number;
  };
  diagnostics: string[];
}

interface BinaryProbabilityTable {
  treatment: string;
  value: 0 | 1;
  history: string[];
  binners: Map<string, CovariateBinner>;
  probabilities: Map<string, number>;
  fallback: number;
}

export function extractLongitudinalGraph(document: GraphDocument): ExtractedLongitudinalGraph {
  const metadata = normalizeGraphDocumentMetadata(document.metadata);
  const timeById = new Map(metadata.longitudinal.timePoints.map((point) => [point.id, point]));
  const nodes = document.graph.nodes.flatMap((node): ExtractedLongitudinalNode[] => {
    const nodeMetadata = metadata.longitudinal.variables[node.id];
    if (!nodeMetadata) return [];
    return [{
      node,
      metadata: nodeMetadata,
      timePoint: nodeMetadata.time ? timeById.get(nodeMetadata.time) ?? null : null
    }];
  });
  const nodeIds = new Set(document.graph.nodes.map((node) => node.id));
  const diagnostics = validateLongitudinalMetadata(document);
  for (const [nodeId] of Object.entries(metadata.longitudinal.variables)) {
    if (!nodeIds.has(nodeId)) diagnostics.push(`Longitudinal metadata references missing node ${nodeId}.`);
  }
  return {
    timePoints: metadata.longitudinal.timePoints,
    nodes,
    treatmentStrategies: metadata.longitudinal.treatmentStrategies,
    diagnostics
  };
}

export function validateLongitudinalMetadata(document: GraphDocument): string[] {
  const metadata = normalizeGraphDocumentMetadata(document.metadata).longitudinal;
  const diagnostics: string[] = [];
  const nodeIds = new Set(document.graph.nodes.map((node) => node.id));
  const timeIds = new Set(metadata.timePoints.map((point) => point.id));
  for (const [nodeId, variable] of Object.entries(metadata.variables)) {
    if (!nodeIds.has(nodeId)) diagnostics.push(`Missing graph node for longitudinal variable ${nodeId}.`);
    if (variable.time && !timeIds.has(variable.time)) diagnostics.push(`${nodeId} references missing time point ${variable.time}.`);
  }
  for (const strategy of metadata.treatmentStrategies) {
    for (const assignment of strategy.assignments) {
      if (!nodeIds.has(assignment.variable)) diagnostics.push(`${strategy.label} assigns missing treatment ${assignment.variable}.`);
    }
    for (const rule of strategy.rules) {
      if (!nodeIds.has(rule.variable)) diagnostics.push(`${strategy.label} rules target missing treatment ${rule.variable}.`);
      if (!nodeIds.has(rule.conditionVariable)) diagnostics.push(`${strategy.label} conditions on missing variable ${rule.conditionVariable}.`);
    }
  }
  for (const estimand of metadata.estimands) {
    if (!nodeIds.has(estimand.outcome)) diagnostics.push(`${estimand.label} uses missing outcome ${estimand.outcome}.`);
    for (const strategyId of estimand.strategies) {
      if (!metadata.treatmentStrategies.some((strategy) => strategy.id === strategyId)) diagnostics.push(`${estimand.label} references missing strategy ${strategyId}.`);
    }
  }
  return diagnostics;
}

export function simulateLongitudinalCohort(document: GraphDocument): LongitudinalCohort {
  const result = runSimulation(document.graph, document.simulation);
  return cohortFromSimulationResult(result);
}

export function cohortFromSimulationResult(result: SimulationResult): LongitudinalCohort {
  const states = Object.entries(result.nodeStates);
  const sampleSize = states.reduce((size, [, state]) => Math.min(size, state.empirical.samples.length), Number.POSITIVE_INFINITY);
  const finiteSampleSize = Number.isFinite(sampleSize) ? sampleSize : 0;
  const rows: Array<Record<string, number>> = [];
  const weights: number[] = [];
  for (let index = 0; index < finiteSampleSize; index += 1) {
    const row: Record<string, number> = {};
    let weight = 1;
    for (const [id, state] of states) {
      const value = state.empirical.samples[index];
      if (value !== undefined && Number.isFinite(value)) row[id] = value;
      const candidateWeight = state.empirical.weights[index];
      if (candidateWeight !== undefined && Number.isFinite(candidateWeight)) weight = Math.max(0, candidateWeight);
    }
    rows.push(row);
    weights.push(weight);
  }
  return {
    result,
    rows,
    weights,
    sampleSize: rows.length
  };
}

export function evaluateTreatmentStrategy(document: GraphDocument, strategy: TreatmentStrategy, outcome: string): StrategyEvaluation {
  const treatmentVariables = strategyTreatmentVariables(strategy);
  const treatmentSet = new Set(treatmentVariables);
  const result = runIntervenedEmpiricalSimulation(document.graph, {
    ...document.simulation,
    selections: {}
  }, ({ nodeId, values }) => treatmentSet.has(nodeId) ? assignedTreatmentValue(values, strategy, nodeId) : undefined);
  const diagnostics = strategy.kind === "static" && strategy.rules.length === 0
    ? ["Simulates the complete static strategy by intervening on configured treatment nodes."]
    : ["Simulates the dynamic strategy sequentially, applying each treatment rule to the generated history before downstream nodes are drawn."];
  return {
    strategy,
    outcome,
    mean: result.nodeStates[outcome]?.empirical.mean ?? null,
    result,
    diagnostics
  };
}

export function summarizeStrategySupport(cohort: LongitudinalCohort, config: Pick<GMethodsComparisonConfig, "treatmentVariables" | "censoringVariables">, strategy: TreatmentStrategy): StrategySupportSummary[] {
  return config.treatmentVariables.map((treatment, index) => {
    const rule = strategy.rules.find((candidate) => candidate.variable === treatment) ?? null;
    const historyTreatments = config.treatmentVariables.slice(0, index + 1);
    let weightTotal = 0;
    let assignedWeight = 0;
    let observedMatchWeight = 0;
    let ruleConditionWeight = 0;
    let uncensoredWeight = 0;
    let uncensoredSampleSize = 0;
    for (let rowIndex = 0; rowIndex < cohort.rows.length; rowIndex += 1) {
      const row = cohort.rows[rowIndex]!;
      const weight = cohort.weights[rowIndex] ?? 1;
      weightTotal += weight;
      assignedWeight += asBinary(assignedTreatmentValue(row, strategy, treatment)) * weight;
      if (matchesStrategy(row, strategy, historyTreatments)) observedMatchWeight += weight;
      if (rule && compareRule(row[rule.conditionVariable], rule.operator, rule.conditionValue)) ruleConditionWeight += weight;
      if (isUncensored(row, config.censoringVariables)) {
        uncensoredWeight += weight;
        uncensoredSampleSize += 1;
      }
    }
    return {
      strategyId: strategy.id,
      label: strategy.label,
      treatment,
      assignedShare: weightTotal > 0 ? assignedWeight / weightTotal : 0,
      observedMatchShare: weightTotal > 0 ? observedMatchWeight / weightTotal : 0,
      ruleConditionShare: rule && weightTotal > 0 ? ruleConditionWeight / weightTotal : null,
      uncensoredShare: weightTotal > 0 ? uncensoredWeight / weightTotal : 0,
      sampleSize: cohort.sampleSize,
      uncensoredSampleSize
    };
  });
}

export function buildPersonTimeRows(cohort: LongitudinalCohort, spec: SurvivalOutputSpec): PersonTimeRow[] {
  const eventVariables = survivalEventVariables(spec);
  const censoringVariables = survivalCensoringVariables(spec);
  const rows: PersonTimeRow[] = [];
  for (let subject = 0; subject < cohort.rows.length; subject += 1) {
    const row = cohort.rows[subject]!;
    let stopped = false;
    for (let interval = 0; interval < eventVariables.length; interval += 1) {
      if (stopped) break;
      const eventVariable = eventVariables[interval]!;
      const censoringVariable = censoringVariables[interval] ?? null;
      const event = asBinary(row[eventVariable]);
      // An event takes precedence over same-interval censoring: a subject who dies
      // in the interval is an event, not censored (otherwise they'd be double-counted
      // in both the events and censored tallies).
      const censored = event === 1 ? 0 : censoringVariable ? asBinary(row[censoringVariable]) : 0;
      const time = spec.timeVariable ? row[spec.timeVariable] ?? interval + 1 : interval + 1;
      rows.push({
        subject,
        interval,
        time,
        event,
        censored,
        weight: cohort.weights[subject] ?? 1,
        eventVariable,
        censoringVariable
      });
      stopped = event === 1 || censored === 1;
    }
  }
  return rows;
}

export function estimateSurvivalCurve(cohort: LongitudinalCohort, spec: SurvivalOutputSpec): SurvivalCurvePoint[] {
  const rows = buildPersonTimeRows(cohort, spec);
  const intervals = [...new Set(rows.map((row) => row.interval))].sort((a, b) => a - b);
  let survival = 1;
  const points: SurvivalCurvePoint[] = [];
  for (const interval of intervals) {
    const intervalRows = rows.filter((row) => row.interval === interval);
    const atRisk = intervalRows.reduce((sum, row) => sum + row.weight, 0);
    const events = intervalRows.reduce((sum, row) => sum + (row.event ? row.weight : 0), 0);
    const censored = intervalRows.reduce((sum, row) => sum + (row.censored ? row.weight : 0), 0);
    const hazard = atRisk > 0 ? events / atRisk : null;
    if (hazard !== null) survival *= Math.max(0, 1 - hazard);
    points.push({
      interval,
      label: spec.timeScale ? `${spec.timeScale} ${interval + 1}` : `interval ${interval + 1}`,
      atRisk,
      events,
      censored,
      hazard,
      survival,
      risk: 1 - survival
    });
  }
  return points;
}

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
    gEstimationEstimate(cohort, config, leftStrategy, rightStrategy)
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

function naiveEstimate(cohort: LongitudinalCohort, config: GMethodsComparisonConfig, left: TreatmentStrategy, right: TreatmentStrategy): GMethodEstimate {
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

function stratifiedEstimate(cohort: LongitudinalCohort, config: GMethodsComparisonConfig, left: TreatmentStrategy, right: TreatmentStrategy): GMethodEstimate {
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

function gFormulaEstimate(left: TreatmentStrategy, right: TreatmentStrategy, evaluations: [StrategyEvaluation, StrategyEvaluation]): GMethodEstimate {
  const [leftEvaluation, rightEvaluation] = evaluations;
  const hasDynamicStrategy = [left, right].some((strategy) => strategy.kind !== "static" || strategy.rules.length > 0);
  return {
    id: "g_formula",
    label: hasDynamicStrategy ? "Sequential strategy g-formula" : "Parametric g-formula",
    estimate: difference(leftEvaluation.mean, rightEvaluation.mean),
    arms: [
      armSummary(left, leftEvaluation.mean, leftEvaluation.result.conditioning.acceptedSamples, leftEvaluation.result.conditioning.effectiveSampleSize),
      armSummary(right, rightEvaluation.mean, rightEvaluation.result.conditioning.acceptedSamples, rightEvaluation.result.conditioning.effectiveSampleSize)
    ],
    diagnostics: ["Simulates each complete strategy by intervening on the configured treatment nodes.", ...leftEvaluation.diagnostics, ...rightEvaluation.diagnostics]
  };
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

function observedArm(cohort: LongitudinalCohort, strategy: TreatmentStrategy, config: GMethodsComparisonConfig): GMethodArmSummary {
  const mean = weightedOutcomeMean(cohort, config.outcome, (row) => matchesStrategy(row, strategy, config.treatmentVariables) && isUncensored(row, config.censoringVariables));
  return armSummary(strategy, mean.mean, mean.sampleSize, mean.effectiveSampleSize);
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
  }
  return armSummary(strategy, denominator > 0 ? numerator / denominator : null, weights.length, effectiveSampleSize(weights));
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

function binaryProbabilityTable(cohort: LongitudinalCohort, treatment: string, value: number, history: string[]): BinaryProbabilityTable {
  const binners = buildBinners(cohort, history);
  const counts = new Map<string, { numerator: number; denominator: number }>();
  let fallbackNumerator = 0.5;
  let fallbackDenominator = 1;
  const target = asBinary(value);
  for (const row of cohort.rows) {
    const key = keyFromBinners(row, history, binners);
    const count = counts.get(key) ?? { numerator: 0.5, denominator: 1 };
    count.denominator += 1;
    fallbackDenominator += 1;
    if (asBinary(row[treatment]) === target) {
      count.numerator += 1;
      fallbackNumerator += 1;
    }
    counts.set(key, count);
  }
  return {
    treatment,
    value: target,
    history,
    binners,
    probabilities: new Map([...counts.entries()].map(([key, count]) => [key, count.numerator / count.denominator])),
    fallback: fallbackNumerator / fallbackDenominator
  };
}

function probabilityFromTable(table: BinaryProbabilityTable, row: Record<string, number>): number {
  return table.probabilities.get(keyFromBinners(row, table.history, table.binners)) ?? table.fallback;
}

// --- Covariate discretization ------------------------------------------------
//
// Adjustment sets contain CONTINUOUS confounders (Age, baseline risk, …). Keying a
// history/stratum on raw values gives one stratum per subject (useless), and the
// old `asBinary(v) = v >= 0.5` collapsed e.g. Age~N(50,10) to a constant (always 1)
// — so stratification degenerated to the naive estimate and IP weights barely
// adjusted. Instead: discrete columns (binary / few-valued) key on their value;
// continuous columns key on quantile bins, so standardization and propensity models
// actually condition on the confounder.
type CovariateBinner = (row: Record<string, number>) => string;
// Quantile-bin resolution is adaptive (see continuousBinCount): more bins shrink
// within-bin residual confounding, but each joint cell needs enough rows to keep
// both treatment arms supported, so resolution scales with sample size and shrinks
// with the number of continuous covariates.
const MIN_QUANTILE_BINS = 2;
const MAX_QUANTILE_BINS = 10;
const MIN_PER_STRATUM = 40;

function buildBinners(cohort: LongitudinalCohort, ids: string[]): Map<string, CovariateBinner> {
  const binners = new Map<string, CovariateBinner>();
  const valuesById = new Map<string, number[]>();
  for (const id of ids) {
    if (valuesById.has(id)) continue;
    valuesById.set(id, cohort.rows
      .map((row) => row[id])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value)));
  }
  // How many covariates are actually continuous (the ones we quantile-bin). The joint
  // strata count is bins^(that many), so pick a per-covariate bin count that keeps each
  // joint cell populated (~MIN_PER_STRATUM rows) — finer resolution shrinks within-bin
  // confounding, but too-fine cells lose both-arm support and add noise.
  const continuousCount = [...valuesById.values()].filter((values) => {
    const levels = new Set(values.map((value) => Math.round(value * 1e6) / 1e6));
    return levels.size > MAX_QUANTILE_BINS;
  }).length;
  const bins = continuousBinCount(cohort.rows.length, Math.max(1, continuousCount));
  for (const id of ids) {
    if (binners.has(id)) continue;
    const values = valuesById.get(id) ?? [];
    const levels = new Set(values.map((value) => Math.round(value * 1e6) / 1e6));
    if (levels.size <= bins) {
      // Discrete / few-valued (incl. binary treatments): key on the raw value.
      binners.set(id, (row) => `${id}=${row[id] ?? 0}`);
    } else {
      const edges = quantileEdges(values, bins);
      binners.set(id, (row) => `${id}~${binIndex(edges, row[id] ?? 0)}`);
    }
  }
  return binners;
}

function continuousBinCount(sampleSize: number, continuousCovariates: number): number {
  const targetStrata = Math.max(1, sampleSize / MIN_PER_STRATUM);
  const perCovariate = Math.floor(targetStrata ** (1 / continuousCovariates));
  return Math.max(MIN_QUANTILE_BINS, Math.min(MAX_QUANTILE_BINS, perCovariate));
}

function keyFromBinners(row: Record<string, number>, ids: string[], binners: Map<string, CovariateBinner>): string {
  if (ids.length === 0) return "__all__";
  return ids.map((id) => (binners.get(id) ?? ((r: Record<string, number>) => `${id}=${r[id] ?? 0}`))(row)).join("|");
}

function quantileEdges(values: number[], bins: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const edges: number[] = [];
  for (let i = 1; i < bins; i += 1) {
    const index = Math.min(sorted.length - 1, Math.floor((i / bins) * sorted.length));
    edges.push(sorted[index] ?? 0);
  }
  return edges;
}

function binIndex(edges: number[], value: number): number {
  let index = 0;
  while (index < edges.length && value >= edges[index]!) index += 1;
  return index;
}

function strategyTreatmentVariables(strategy: TreatmentStrategy): string[] {
  return [...new Set([...strategy.assignments.map((assignment) => assignment.variable), ...strategy.rules.map((rule) => rule.variable)])];
}

function assignedTreatmentValue(row: Record<string, number>, strategy: TreatmentStrategy, treatment: string): number {
  const assignment = strategy.assignments.find((candidate) => candidate.variable === treatment);
  if (assignment) return assignment.value;
  const rule = strategy.rules.find((candidate) => candidate.variable === treatment);
  if (!rule) return row[treatment] ?? 0;
  return compareRule(row[rule.conditionVariable], rule.operator, rule.conditionValue) ? rule.value : rule.otherwise;
}

function matchesStrategy(row: Record<string, number>, strategy: TreatmentStrategy, treatmentVariables: readonly string[]): boolean {
  return treatmentVariables.every((treatment) => asBinary(row[treatment]) === asBinary(assignedTreatmentValue(row, strategy, treatment)));
}

function compareRule(value: number | undefined, operator: TreatmentStrategy["rules"][number]["operator"], target: number): boolean {
  const left = value ?? 0;
  if (operator === "neq") return left !== target;
  if (operator === "lt") return left < target;
  if (operator === "lte") return left <= target;
  if (operator === "gt") return left > target;
  if (operator === "gte") return left >= target;
  return left === target;
}

function isUncensored(row: Record<string, number>, censoringVariables: string[] | undefined): boolean {
  return !censoringVariables?.some((variable) => asBinary(row[variable]) === 1);
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

function fitLinearModel(rows: Array<Record<string, number>>, outcome: string, features: string[]): number[] | null {
  const size = features.length + 1;
  const xtx = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
  const xty = Array.from({ length: size }, () => 0);
  for (const row of rows) {
    const y = row[outcome];
    if (y === undefined || !Number.isFinite(y)) continue;
    const x = [1, ...features.map((feature) => row[feature] ?? 0)];
    for (let i = 0; i < size; i += 1) {
      xty[i] = (xty[i] ?? 0) + (x[i] ?? 0) * y;
      for (let j = 0; j < size; j += 1) xtx[i]![j] = (xtx[i]![j] ?? 0) + (x[i] ?? 0) * (x[j] ?? 0);
    }
  }
  for (let i = 1; i < size; i += 1) xtx[i]![i] = (xtx[i]![i] ?? 0) + 1e-6;
  return solveLinearSystem(xtx, xty);
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index] ?? 0]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(augmented[row]![col] ?? 0) > Math.abs(augmented[pivot]![col] ?? 0)) pivot = row;
    }
    if (Math.abs(augmented[pivot]![col] ?? 0) < 1e-9) return null;
    [augmented[col], augmented[pivot]] = [augmented[pivot]!, augmented[col]!];
    const divisor = augmented[col]![col]!;
    for (let j = col; j <= n; j += 1) augmented[col]![j]! /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = augmented[row]![col] ?? 0;
      for (let j = col; j <= n; j += 1) augmented[row]![j]! -= factor * (augmented[col]![j] ?? 0);
    }
  }
  return augmented.map((row) => row[n] ?? 0);
}

function predictLinear(beta: number[], features: string[], row: Record<string, number>): number {
  return (beta[0] ?? 0) + features.reduce((sum, feature, index) => sum + (beta[index + 1] ?? 0) * (row[feature] ?? 0), 0);
}

function treatmentHistory(treatment: string, priorTreatments: string[], covariates: string[]): string[] {
  const treatmentTime = numericSuffix(treatment);
  const priorCovariates = treatmentTime === null
    ? covariates
    : covariates.filter((covariate) => {
      const covariateTime = numericSuffix(covariate);
      return covariateTime === null || covariateTime <= treatmentTime;
    });
  return [...new Set([...priorTreatments, ...priorCovariates])];
}

function numericSuffix(value: string): number | null {
  const match = value.match(/(\d+)$/);
  return match ? Number(match[1]) : null;
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

function survivalEventVariables(spec: SurvivalOutputSpec): string[] {
  return spec.eventVariables?.length ? spec.eventVariables : [spec.eventVariable];
}

function survivalCensoringVariables(spec: SurvivalOutputSpec): string[] {
  if (spec.censoringVariables?.length) return spec.censoringVariables;
  return spec.censoringVariable ? [spec.censoringVariable] : [];
}

function weightedOutcomeMean(cohort: LongitudinalCohort, outcome: string, predicate: (row: Record<string, number>) => boolean): { mean: number | null; sampleSize: number; effectiveSampleSize: number | null } {
  let numerator = 0;
  let denominator = 0;
  const weights: number[] = [];
  for (let index = 0; index < cohort.rows.length; index += 1) {
    const row = cohort.rows[index]!;
    if (!predicate(row)) continue;
    const value = row[outcome];
    if (value === undefined || !Number.isFinite(value)) continue;
    const weight = cohort.weights[index] ?? 1;
    numerator += value * weight;
    denominator += weight;
    weights.push(weight);
  }
  return {
    mean: denominator > 0 ? numerator / denominator : null,
    sampleSize: weights.length,
    effectiveSampleSize: weights.length > 0 ? effectiveSampleSize(weights) : null
  };
}

function weightedShare(cohort: LongitudinalCohort, predicate: (row: Record<string, number>) => boolean): number {
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < cohort.rows.length; index += 1) {
    const weight = cohort.weights[index] ?? 1;
    denominator += weight;
    if (predicate(cohort.rows[index]!)) numerator += weight;
  }
  return denominator > 0 ? numerator / denominator : 0;
}

function weightedAverage(values: Array<{ mean: number; weight: number }>): number | null {
  const denominator = values.reduce((sum, value) => sum + value.weight, 0);
  if (denominator <= 0) return null;
  return values.reduce((sum, value) => sum + value.mean * value.weight, 0) / denominator;
}

function armSummary(strategy: TreatmentStrategy, mean: number | null, sampleSize: number, effectiveSampleSize: number | null): GMethodArmSummary {
  return {
    strategyId: strategy.id,
    label: strategy.label,
    mean,
    sampleSize,
    effectiveSampleSize
  };
}

function emptyArms(left: TreatmentStrategy, right: TreatmentStrategy): [GMethodArmSummary, GMethodArmSummary] {
  return [
    armSummary(left, null, 0, null),
    armSummary(right, null, 0, null)
  ];
}

function effectiveSampleSize(weights: number[]): number {
  const sum = weights.reduce((total, weight) => total + weight, 0);
  const sumSquares = weights.reduce((total, weight) => total + weight * weight, 0);
  return sumSquares > 0 ? (sum * sum) / sumSquares : 0;
}

function difference(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left - right;
}

function asBinary(value: number | undefined): 0 | 1 {
  return (value ?? 0) >= 0.5 ? 1 : 0;
}

function roundForDiagnostic(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") : "NA";
}
