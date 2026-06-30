import { runIntervenedEmpiricalSimulation } from "../simulation";
import type { GraphDocument, SurvivalOutputSpec, TreatmentStrategy } from "../types";
import type {
  GMethodsComparisonConfig,
  LongitudinalCohort,
  MethodSurvivalCurve,
  PersonTimeRow,
  StrategyEvaluation,
  StrategySupportSummary,
  SurvivalCurvePoint
} from "./types";
import {
  asBinary,
  assignedTreatmentValue,
  binaryProbabilityTable,
  compareRule,
  isUncensored,
  matchesStrategy,
  probabilityFromTable,
  strategyTreatmentVariables,
  survivalCensoringVariables,
  survivalEventVariables,
  treatmentHistory
} from "./internal";

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
