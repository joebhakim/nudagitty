import { normalizeGraphDocumentMetadata, normalizeVariableModel } from "./graph";
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
  // Pointwise 95% survival band (Greenwood's formula), clamped to [0, 1].
  survivalLo: number;
  survivalHi: number;
}

// How a continuous covariate enters the PARAMETRIC estimators (outcome regression,
// AIPW). Higher degree = a more flexible basis expansion of the confounder, able to
// absorb non-linear confounding the linear form leaves behind.
export type CovariateBasis = "linear" | "quadratic" | "cubic";

export interface GMethodsComparisonConfig {
  treatmentVariables: string[];
  timeVaryingCovariates: string[];
  outcome: string;
  strategyIds?: [string, string];
  strategies?: [TreatmentStrategy, TreatmentStrategy];
  stabilizedWeights?: boolean;
  censoringVariables?: string[];
  outcomeScale?: "risk" | "mean";
  covariateBasis?: CovariateBasis;
}

// A single unit's contribution to an arm mean: its outcome value (observed, predicted,
// or re-simulated, depending on the method) and the weight with which it enters the mean.
export interface ArmPoint {
  y: number;
  weight: number;
}

export interface GMethodArmSummary {
  strategyId: string;
  label: string;
  mean: number | null;
  sampleSize: number;
  effectiveSampleSize: number | null;
  // The per-unit cloud whose weighted average IS `mean`, for methods that have a natural
  // per-unit representation (re-simulated counterfactuals, parametric predictions, reweighted
  // observations). null for methods that only yield a summary (e.g. g-estimation's blip).
  points?: ArmPoint[] | null;
}

export interface GMethodEstimate {
  id: "naive" | "stratified" | "g_formula" | "ipw" | "g_estimation" | "outcome_regression" | "matching" | "aipw";
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

export interface MethodSurvivalCurve {
  strategyId: string;
  points: SurvivalCurvePoint[];
}

// Per-row IPW weight for following `strategy` (stabilized treatment × censoring), 0 for
// rows whose observed history does not follow it. Mirrors weightedIpwArm's weighting so
// the IPW survival curve adjusts the same way as the IPW point estimate.
function strategyIpwRowWeights(cohort: LongitudinalCohort, config: GMethodsComparisonConfig, strategy: TreatmentStrategy): number[] {
  const treatmentTables = config.treatmentVariables.map((treatment, index) => ({
    denominatorByValue: {
      0: binaryProbabilityTable(cohort, treatment, 0, treatmentHistory(treatment, config.treatmentVariables.slice(0, index), config.timeVaryingCovariates)),
      1: binaryProbabilityTable(cohort, treatment, 1, treatmentHistory(treatment, config.treatmentVariables.slice(0, index), config.timeVaryingCovariates))
    },
    numeratorByValue: {
      0: binaryProbabilityTable(cohort, treatment, 0, config.treatmentVariables.slice(0, index)),
      1: binaryProbabilityTable(cohort, treatment, 1, config.treatmentVariables.slice(0, index))
    },
    treatment
  }));
  const censoringTables = (config.censoringVariables ?? []).map((censoring, index) => binaryProbabilityTable(cohort, censoring, 0, [...config.treatmentVariables.slice(0, Math.min(index + 1, config.treatmentVariables.length)), ...config.timeVaryingCovariates]));
  const weights = new Array<number>(cohort.rows.length).fill(0);
  for (let i = 0; i < cohort.rows.length; i += 1) {
    const row = cohort.rows[i]!;
    if (!matchesStrategy(row, strategy, config.treatmentVariables)) continue;
    let denominator = 1;
    let numerator = 1;
    for (const table of treatmentTables) {
      const value = asBinary(assignedTreatmentValue(row, strategy, table.treatment));
      denominator *= probabilityFromTable(table.denominatorByValue[value], row);
      numerator *= probabilityFromTable(table.numeratorByValue[value], row);
    }
    // Censoring weight applies to the uncensored person-time; censored rows still
    // contribute their pre-censoring intervals (the person-time builder drops them).
    if (isUncensored(row, config.censoringVariables)) {
      for (const table of censoringTables) denominator *= probabilityFromTable(table, row);
    }
    weights[i] = Math.min(50, Math.max(0, numerator / Math.max(1e-6, denominator))) * (cohort.weights[i] ?? 1);
  }
  return weights;
}

// Survival curves estimated directly from the OBSERVED cohort under different methods:
// the crude (naive) KM among each strategy's followers, and the IPW/IPCW-weighted KM.
// The g-formula curve (re-simulation) is produced separately from the strategy results.
export function observedMethodSurvivalCurves(cohort: LongitudinalCohort, spec: SurvivalOutputSpec, config: GMethodsComparisonConfig, strategies: TreatmentStrategy[]): { naive: MethodSurvivalCurve[]; ipw: MethodSurvivalCurve[] } {
  const curveWith = (weights: number[]) => estimateSurvivalCurve({ ...cohort, weights }, spec);
  return {
    naive: strategies.map((strategy) => ({
      strategyId: strategy.id,
      points: curveWith(cohort.rows.map((row, i) => matchesStrategy(row, strategy, config.treatmentVariables) ? (cohort.weights[i] ?? 1) : 0))
    })),
    ipw: strategies.map((strategy) => ({
      strategyId: strategy.id,
      points: curveWith(strategyIpwRowWeights(cohort, config, strategy))
    }))
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
  const eventVariables = survivalEventVariables(spec);
  const intervals = [...new Set(rows.map((row) => row.interval))].sort((a, b) => a - b);
  let survival = 1;
  let greenwood = 0; // running Σ d_i / (n_i (n_i - d_i)) for the Greenwood variance
  const points: SurvivalCurvePoint[] = [];
  for (const interval of intervals) {
    const intervalRows = rows.filter((row) => row.interval === interval);
    const atRisk = intervalRows.reduce((sum, row) => sum + row.weight, 0);
    const events = intervalRows.reduce((sum, row) => sum + (row.event ? row.weight : 0), 0);
    const censored = intervalRows.reduce((sum, row) => sum + (row.censored ? row.weight : 0), 0);
    const hazard = atRisk > 0 ? events / atRisk : null;
    if (hazard !== null) survival *= Math.max(0, 1 - hazard);
    if (atRisk > events && events > 0) greenwood += events / (atRisk * (atRisk - events));
    const standardError = survival * Math.sqrt(greenwood);
    // Prefer a human time label parsed from the event variable (Death_2y -> "2y").
    const yearMatch = /(\d+)\s*y/i.exec(eventVariables[interval] ?? "");
    points.push({
      interval,
      label: yearMatch ? `${yearMatch[1]}y` : spec.timeScale ? `${spec.timeScale} ${interval + 1}` : `interval ${interval + 1}`,
      atRisk,
      events,
      censored,
      hazard,
      survival,
      risk: 1 - survival,
      survivalLo: Math.max(0, survival - 1.96 * standardError),
      survivalHi: Math.min(1, survival + 1.96 * standardError)
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
      armSummary(left, leftEvaluation.mean, leftEvaluation.result.conditioning.acceptedSamples, leftEvaluation.result.conditioning.effectiveSampleSize, outcomeSamplePoints(leftEvaluation.result, leftEvaluation.outcome)),
      armSummary(right, rightEvaluation.mean, rightEvaluation.result.conditioning.acceptedSamples, rightEvaluation.result.conditioning.effectiveSampleSize, outcomeSamplePoints(rightEvaluation.result, rightEvaluation.outcome))
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

// --- Additional choosable estimators -----------------------------------------
// Parametric outcome regression, propensity matching, and doubly-robust AIPW.
// These complement the (nonparametric) standardization / IPW / g-estimation rows;
// being parametric, outcome regression and AIPW expose functional-form assumptions
// the binned estimators avoid — a deliberate contrast.

function emptyEstimate(id: GMethodEstimate["id"], label: string, left: TreatmentStrategy, right: TreatmentStrategy, message: string): GMethodEstimate {
  return { id, label, estimate: null, arms: emptyArms(left, right), diagnostics: [message] };
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

function sigmoidLocal(x: number): number {
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
}

function gaussianSolve(matrix: number[][], rhs: number[]): number[] | null {
  const n = matrix.length;
  const m = matrix.map((row, i) => [...row, rhs[i] ?? 0]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const diag = m[col]![col]!;
    if (Math.abs(diag) < 1e-12) return null;
    for (let j = col; j <= n; j += 1) m[col]![j]! /= diag;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = m[r]![col]!;
      for (let j = col; j <= n; j += 1) m[r]![j]! -= factor * m[col]![j]!;
    }
  }
  return m.map((row) => row[n]!);
}

function solveNormalEquations(design: number[][], response: number[], weights: number[], ridge: number): number[] | null {
  const p = design[0]?.length ?? 0;
  if (p === 0) return null;
  const xtwx = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const xtwy = new Array<number>(p).fill(0);
  for (let i = 0; i < design.length; i += 1) {
    const xi = design[i]!;
    const wi = weights[i] ?? 1;
    for (let a = 0; a < p; a += 1) {
      xtwy[a]! += wi * xi[a]! * (response[i] ?? 0);
      for (let b = 0; b < p; b += 1) xtwx[a]![b]! += wi * xi[a]! * xi[b]!;
    }
  }
  for (let a = 0; a < p; a += 1) xtwx[a]![a]! += ridge;
  return gaussianSolve(xtwx, xtwy);
}

interface CovariateTerm { id: string; continuous: boolean; mean: number; sd: number; degree: number }

// A continuous covariate is standardized and expanded to `degree` polynomial terms
// (z, z², z³); binary/discrete covariates stay as a single linear term (a square of a
// 0/1 indicator is itself, so expanding it just adds collinear columns).
function buildCovariatePlan(cohort: LongitudinalCohort, covariates: string[], basis: CovariateBasis): CovariateTerm[] {
  const degree = basis === "cubic" ? 3 : basis === "quadratic" ? 2 : 1;
  return covariates.map((id) => {
    const values = cohort.rows.map((row) => row[id]).filter((value): value is number => value !== undefined && Number.isFinite(value));
    const distinct = new Set(values.map((value) => Math.round(value * 1e6))).size;
    const continuous = distinct > 2;
    const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
    const sd = Math.sqrt(Math.max(1e-9, variance));
    return { id, continuous, mean, sd, degree: continuous ? degree : 1 };
  });
}

function designRow(row: Record<string, number>, treatments: string[], plan: CovariateTerm[], assignment: Map<string, number> | null): number[] {
  const xs = [1];
  for (const treatment of treatments) xs.push(assignment ? assignment.get(treatment) ?? 0 : asBinary(row[treatment]));
  for (const term of plan) {
    const raw = row[term.id];
    const value = raw !== undefined && Number.isFinite(raw) ? raw : term.mean;
    if (term.continuous) {
      const z = (value - term.mean) / term.sd;
      let power = 1;
      for (let d = 1; d <= term.degree; d += 1) { power *= z; xs.push(power); }
    } else {
      xs.push(value);
    }
  }
  return xs;
}

function strategyAssignmentMap(row: Record<string, number>, strategy: TreatmentStrategy, treatments: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const treatment of treatments) map.set(treatment, asBinary(assignedTreatmentValue(row, strategy, treatment)));
  return map;
}

// Fit E[Y | treatments, covariates] parametrically (OLS for continuous, IRLS
// logistic for binary). Returns a predictor (row, treatment-assignment) -> Ŷ.
function fitOutcomeModel(cohort: LongitudinalCohort, outcome: string, treatments: string[], covariates: string[], binary: boolean, basis: CovariateBasis = "linear"): ((row: Record<string, number>, assignment: Map<string, number> | null) => number) | null {
  const plan = buildCovariatePlan(cohort, covariates, basis);
  const indices = cohort.rows.map((_, i) => i).filter((i) => { const y = cohort.rows[i]![outcome]; return y !== undefined && Number.isFinite(y); });
  const params = 1 + treatments.length + plan.reduce((sum, term) => sum + term.degree, 0);
  if (indices.length < params + 2) return null;
  const design = indices.map((i) => designRow(cohort.rows[i]!, treatments, plan, null));
  const response = indices.map((i) => cohort.rows[i]![outcome]!);
  const baseWeights = indices.map((i) => cohort.weights[i] ?? 1);
  let beta: number[] | null;
  if (!binary) {
    beta = solveNormalEquations(design, response, baseWeights, 1e-6);
  } else {
    beta = new Array<number>(params).fill(0);
    for (let iter = 0; iter < 20; iter += 1) {
      const working: number[] = [];
      const irlsWeights: number[] = [];
      for (let r = 0; r < design.length; r += 1) {
        const eta = dot(design[r]!, beta);
        const mu = sigmoidLocal(eta);
        const variance = Math.max(1e-3, mu * (1 - mu));
        irlsWeights.push(variance * (baseWeights[r] ?? 1));
        working.push(eta + ((response[r] ?? 0) - mu) / variance);
      }
      const next = solveNormalEquations(design, working, irlsWeights, 1e-6);
      if (!next || !next.every((value) => Number.isFinite(value))) break;
      beta = next;
    }
  }
  if (!beta || !beta.every((value) => Number.isFinite(value))) return null;
  const coefficients = beta;
  return (row, assignment) => {
    const linear = dot(designRow(row, treatments, plan, assignment), coefficients);
    return binary ? sigmoidLocal(linear) : linear;
  };
}

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

function observedArm(cohort: LongitudinalCohort, strategy: TreatmentStrategy, config: GMethodsComparisonConfig): GMethodArmSummary {
  // The naive baseline is the raw crude contrast — it ignores BOTH confounding and
  // censoring, so it matches the observed-relation scatter exactly. (The advanced rows
  // are what bring censoring back in via IPCW.)
  const mean = weightedOutcomeMean(cohort, config.outcome, (row) => matchesStrategy(row, strategy, config.treatmentVariables));
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

function armSummary(strategy: TreatmentStrategy, mean: number | null, sampleSize: number, effectiveSampleSize: number | null, points?: ArmPoint[] | null): GMethodArmSummary {
  return {
    strategyId: strategy.id,
    label: strategy.label,
    mean,
    sampleSize,
    effectiveSampleSize,
    points: points && points.length > 0 ? points : null
  };
}

// Pull a strategy's re-simulated outcome cloud out of its forward-pass result. These ARE
// the g-formula's individual counterfactual outcomes — their weighted mean is the arm mean.
function outcomeSamplePoints(result: SimulationResult, outcome: string): ArmPoint[] | null {
  const empirical = result.nodeStates[outcome]?.empirical;
  if (!empirical) return null;
  const points: ArmPoint[] = [];
  for (let index = 0; index < empirical.samples.length; index += 1) {
    const y = empirical.samples[index];
    if (y === undefined || !Number.isFinite(y)) continue;
    const weight = empirical.weights[index];
    points.push({ y, weight: weight !== undefined && Number.isFinite(weight) && weight > 0 ? weight : 1 });
  }
  return points.length > 0 ? points : null;
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

// --- Unified adjustment analysis ---------------------------------------------
//
// Every adjustment-flavoured operation (adjust / condition) on a DAG should map to
// ONE predictable analysis, regardless of whether the example is "classic" (single
// binary exposure) or longitudinal. deriveAdjustmentSpec reads the analysis spec
// from the graph's roles + longitudinal metadata (NOT from hard-coded per-example
// config), and analyzeAdjustment runs the same g-methods engine for all of them.
export interface AdjustmentSpec {
  treatments: string[];
  covariates: string[];
  outcome: string;
  standardize: boolean;
  censoring: string[];
  outcomeScale: "risk" | "mean";
  strategies: [TreatmentStrategy, TreatmentStrategy];
  covariateBasis?: CovariateBasis;
}

function synthesizeBinaryStrategies(treatments: string[]): [TreatmentStrategy, TreatmentStrategy] {
  const make = (id: string, label: string, value: number): TreatmentStrategy => ({
    id,
    label,
    description: `Set ${treatments.join(", ")} = ${value}.`,
    kind: "static",
    assignments: treatments.map((variable) => ({ variable, value })),
    rules: []
  });
  return [make("all-treated", "Treated", 1), make("none-treated", "Untreated", 0)];
}

export function deriveAdjustmentSpec(
  document: GraphDocument,
  override?: { exposure?: string; outcome?: string }
): AdjustmentSpec | null {
  const meta = normalizeGraphDocumentMetadata(document.metadata).longitudinal;
  const variables = meta.variables;
  const hasMeta = Object.keys(variables).length > 0;
  const order = new Map(meta.timePoints.map((point, index) => [point.id, point.order ?? index]));
  const byTime = (id: string) => {
    const time = variables[id]?.time;
    return time && order.has(time) ? order.get(time)! : Number.MAX_SAFE_INTEGER;
  };
  const nodeIds = new Set(document.graph.nodes.map((node) => node.id));

  // The adjustment set is exactly the nodes the operation marks as adjusted — uniform
  // for classic and longitudinal graphs (their covariates are all [adjusted]).
  let covariates = document.graph.nodes
    .filter((node) => node.roles.adjusted)
    .map((node) => node.id)
    .sort((a, b) => byTime(a) - byTime(b));

  const ofRole = (role: string) => Object.entries(variables)
    .filter(([id, variable]) => variable.role === role && nodeIds.has(id))
    .map(([id]) => id)
    .sort((a, b) => byTime(a) - byTime(b));

  // Treatments: the metadata treatment role captures multi-step regimens (A0,A1,A2);
  // a classic single-exposure graph falls back to the [exposure] role.
  let treatments = override?.exposure
    ? [override.exposure]
    : hasMeta ? ofRole("treatment") : document.graph.nodes.filter((node) => node.roles.exposure).map((node) => node.id);
  const censoring = ofRole("censoring");
  // The estimand declares the outcome explicitly (e.g. SNAFT observes a death
  // indicator, not the latent failure time); fall back to the role heuristics.
  let outcome: string | undefined = override?.outcome
    ?? (meta.estimands[0]?.outcome && nodeIds.has(meta.estimands[0].outcome) ? meta.estimands[0].outcome : undefined)
    ?? (hasMeta ? ofRole("outcome").sort((a, b) => byTime(b) - byTime(a))[0] : undefined)
    ?? document.graph.nodes.find((node) => node.roles.outcome)?.id;

  if (treatments.length === 0 || !outcome) return null;
  const outcomeId = outcome;
  covariates = covariates.filter((id) => id !== outcomeId && !treatments.includes(id) && !censoring.includes(id));

  const adjustedNodes = document.graph.nodes.filter((node) => node.roles.adjusted);
  const standardize = adjustedNodes.length === 0
    ? true
    : adjustedNodes.every((node) => normalizeVariableModel(node.variable).adjustment.standardize !== false);

  const outcomeNode = document.graph.nodes.find((node) => node.id === outcomeId);
  const outcomeScale: "risk" | "mean" = outcomeNode && normalizeVariableModel(outcomeNode.variable).valueType === "binary" ? "risk" : "mean";

  const strategies: [TreatmentStrategy, TreatmentStrategy] = meta.treatmentStrategies.length >= 2 && meta.treatmentStrategies[0] && meta.treatmentStrategies[1]
    ? [meta.treatmentStrategies[0], meta.treatmentStrategies[1]]
    : synthesizeBinaryStrategies(treatments);

  return { treatments, covariates, outcome: outcomeId, standardize, censoring, outcomeScale, strategies };
}

export function analyzeAdjustment(document: GraphDocument, spec: AdjustmentSpec): GMethodsComparison | null {
  return compareLongitudinalGMethods(document, {
    treatmentVariables: spec.treatments,
    timeVaryingCovariates: spec.covariates,
    outcome: spec.outcome,
    strategies: spec.strategies,
    censoringVariables: spec.censoring.length > 0 ? spec.censoring : undefined,
    outcomeScale: spec.outcomeScale,
    covariateBasis: spec.covariateBasis ?? "linear"
  });
}

// Overlap / positivity diagnostic for a point-treatment adjustment: the per-arm distribution of
// the SAME bin-based propensity score the matching/ipw/aipw estimators use, plus the inverse-
// probability weight summary. Positivity is the one identification assumption checkable from data;
// this surfaces it (a control pile near 0 with a tiny effective sample size = the violation that
// makes propensity-based adjustment fail). Reuses the estimators' own propensity so the diagnostic
// explains their behaviour rather than a separately-fit model.
export interface OverlapDiagnostic {
  treatment: string;
  treatedPropensities: number[];
  controlPropensities: number[];
  controlSampleSize: number;
  controlEffectiveSampleSize: number;
  minPropensity: number;
  maxControlWeight: number;
  commonSupportShare: number;
  // Provenance of the numbers: which propensity model the scores/weights/ESS came from. Travels
  // with the data so the displayed "how" can never drift from the computation. ESS is the Kish
  // (Σw)²/Σw² over control IP weights w = p/(1−p); the bin-based model regularizes the tails, so
  // this ESS is a conservative (higher) floor — a sharper model would show worse overlap.
  propensityModel: string;
}

export function computeOverlapDiagnostic(document: GraphDocument, config: GMethodsComparisonConfig): OverlapDiagnostic | null {
  const treatment = config.treatmentVariables[0];
  if (!treatment || config.timeVaryingCovariates.length === 0 || !config.strategies) return null;
  const cohort = simulateLongitudinalCohort(document);
  const [left, right] = config.strategies;
  const table = binaryProbabilityTable(cohort, treatment, 1, config.timeVaryingCovariates);
  const treated: number[] = [];
  const control: number[] = [];
  for (const row of cohort.rows) {
    const p = probabilityFromTable(table, row);
    if (matchesStrategy(row, left, config.treatmentVariables)) treated.push(p);
    else if (matchesStrategy(row, right, config.treatmentVariables)) control.push(p);
  }
  if (treated.length === 0 || control.length === 0) return null;
  const controlWeights = control.map((p) => p / Math.max(1e-6, 1 - p));
  const all = [...treated, ...control];
  const lo = Math.max(Math.min(...treated), Math.min(...control));
  const hi = Math.min(Math.max(...treated), Math.max(...control));
  const inSupport = all.filter((p) => p >= lo && p <= hi).length;
  return {
    treatment,
    treatedPropensities: treated,
    controlPropensities: control,
    controlSampleSize: control.length,
    controlEffectiveSampleSize: effectiveSampleSize(controlWeights),
    minPropensity: Math.min(...all),
    maxControlWeight: Math.max(...controlWeights),
    commonSupportShare: inSupport / all.length,
    propensityModel: `bin-based stratification on ${config.timeVaryingCovariates.length} covariate${config.timeVaryingCovariates.length === 1 ? "" : "s"} (the matching/IPW estimators' own model)`
  };
}

export function adjustmentOverlap(document: GraphDocument, spec: AdjustmentSpec): OverlapDiagnostic | null {
  return computeOverlapDiagnostic(document, {
    treatmentVariables: spec.treatments,
    timeVaryingCovariates: spec.covariates,
    outcome: spec.outcome,
    strategies: spec.strategies,
    censoringVariables: spec.censoring.length > 0 ? spec.censoring : undefined,
    outcomeScale: spec.outcomeScale,
    covariateBasis: spec.covariateBasis ?? "linear"
  });
}

export type PositivityStatus = "ok" | "warning" | "violated";

// Heuristic verdict on whether positivity/overlap looks satisfied. Positivity fails two distinct
// ways, so the rule combines both: a common-support GAP (the treated and control PS ranges don't
// overlap) and WEIGHT CONCENTRATION (a low effective sample size or a single dominating IP weight).
// Thresholds calibrated against the example set: every clean example sits at ESS ≥ 56%, support
// ≥ 96%, max weight ≤ 4.3; the designed positivity showcase trips on ESS 44% / max weight 20×; the
// LaLonde-PSID replay trips hard on support 41% / ESS 7%. (The simulation is seeded, so stable.)
export function positivityStatus(overlap: OverlapDiagnostic): PositivityStatus {
  const essFraction = overlap.controlEffectiveSampleSize / Math.max(1, overlap.controlSampleSize);
  if (overlap.commonSupportShare < 0.6 || essFraction < 0.15) return "violated";
  if (overlap.commonSupportShare < 0.9 || essFraction < 0.5 || overlap.maxControlWeight > 10) return "warning";
  return "ok";
}
