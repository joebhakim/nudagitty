import type { LongitudinalCohort } from "./types";
import type { SurvivalOutputSpec, TreatmentStrategy } from "../types";

interface BinaryProbabilityTable {
  treatment: string;
  value: 0 | 1;
  history: string[];
  binners: Map<string, CovariateBinner>;
  probabilities: Map<string, number>;
  fallback: number;
}

export function binaryProbabilityTable(cohort: LongitudinalCohort, treatment: string, value: number, history: string[]): BinaryProbabilityTable {
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

export function probabilityFromTable(table: BinaryProbabilityTable, row: Record<string, number>): number {
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

export function buildBinners(cohort: LongitudinalCohort, ids: string[]): Map<string, CovariateBinner> {
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

export function keyFromBinners(row: Record<string, number>, ids: string[], binners: Map<string, CovariateBinner>): string {
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

export function strategyTreatmentVariables(strategy: TreatmentStrategy): string[] {
  return [...new Set([...strategy.assignments.map((assignment) => assignment.variable), ...strategy.rules.map((rule) => rule.variable)])];
}

export function assignedTreatmentValue(row: Record<string, number>, strategy: TreatmentStrategy, treatment: string): number {
  const assignment = strategy.assignments.find((candidate) => candidate.variable === treatment);
  if (assignment) return assignment.value;
  const rule = strategy.rules.find((candidate) => candidate.variable === treatment);
  if (!rule) return row[treatment] ?? 0;
  return compareRule(row[rule.conditionVariable], rule.operator, rule.conditionValue) ? rule.value : rule.otherwise;
}

export function matchesStrategy(row: Record<string, number>, strategy: TreatmentStrategy, treatmentVariables: readonly string[]): boolean {
  return treatmentVariables.every((treatment) => asBinary(row[treatment]) === asBinary(assignedTreatmentValue(row, strategy, treatment)));
}

export function compareRule(value: number | undefined, operator: TreatmentStrategy["rules"][number]["operator"], target: number): boolean {
  const left = value ?? 0;
  if (operator === "neq") return left !== target;
  if (operator === "lt") return left < target;
  if (operator === "lte") return left <= target;
  if (operator === "gt") return left > target;
  if (operator === "gte") return left >= target;
  return left === target;
}

export function isUncensored(row: Record<string, number>, censoringVariables: string[] | undefined): boolean {
  return !censoringVariables?.some((variable) => asBinary(row[variable]) === 1);
}

export function treatmentHistory(treatment: string, priorTreatments: string[], covariates: string[]): string[] {
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

export function survivalEventVariables(spec: SurvivalOutputSpec): string[] {
  return spec.eventVariables?.length ? spec.eventVariables : [spec.eventVariable];
}

export function survivalCensoringVariables(spec: SurvivalOutputSpec): string[] {
  if (spec.censoringVariables?.length) return spec.censoringVariables;
  return spec.censoringVariable ? [spec.censoringVariable] : [];
}

export function effectiveSampleSize(weights: number[]): number {
  const sum = weights.reduce((total, weight) => total + weight, 0);
  const sumSquares = weights.reduce((total, weight) => total + weight * weight, 0);
  return sumSquares > 0 ? (sum * sum) / sumSquares : 0;
}

export function asBinary(value: number | undefined): 0 | 1 {
  return (value ?? 0) >= 0.5 ? 1 : 0;
}
