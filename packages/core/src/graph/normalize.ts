import type {
  EdgeMechanism,
  EdgeMechanismKind,
  GraphDocumentMetadata,
  NodeDistribution,
  NodeInteraction,
  NodeMechanism,
  SimulationSelectionCondition,
  TreatmentStrategyKind,
  TreatmentStrategyRuleOperator,
  VariableModel
} from "../types";
import { clamp01 } from "../stats/util";
import {
  ADJUSTMENT_METHOD_KINDS,
  EDGE_MECHANISM_KINDS,
  INTERVENTION_KINDS,
  LONGITUDINAL_ESTIMAND_TYPES,
  LONGITUDINAL_VARIABLE_ROLES,
  MEASUREMENT_MODEL_KINDS,
  NODE_COMBINER_KINDS,
  SIMULATION_DISPLAY_MODES,
  VARIABLE_VALUE_TYPES
} from "./constants";
import { defaultEdgeMechanism, defaultVariableModel } from "./defaults";

export function normalizeGraphDocumentMetadata(metadata: Partial<GraphDocumentMetadata> | undefined): GraphDocumentMetadata {
  const raw = (metadata ?? {}) as Record<string, unknown>;
  const longitudinal = (raw.longitudinal ?? {}) as Record<string, unknown>;
  return {
    longitudinal: {
      timePoints: Array.isArray(longitudinal.timePoints)
        ? longitudinal.timePoints.map((point) => {
          const rawPoint = (point ?? {}) as Record<string, unknown>;
          return {
            id: stringOr(rawPoint.id, ""),
            label: stringOr(rawPoint.label, stringOr(rawPoint.id, "")),
            order: numberOr(rawPoint.order, 0)
          };
        }).filter((point) => point.id).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        : [],
      variables: normalizeLongitudinalVariables(longitudinal.variables),
      treatmentStrategies: Array.isArray(longitudinal.treatmentStrategies)
        ? longitudinal.treatmentStrategies.map((strategy) => {
          const rawStrategy = (strategy ?? {}) as Record<string, unknown>;
          const kind: TreatmentStrategyKind = rawStrategy.kind === "dynamic" || rawStrategy.kind === "stochastic" ? rawStrategy.kind : "static";
          return {
            id: stringOr(rawStrategy.id, ""),
            label: stringOr(rawStrategy.label, stringOr(rawStrategy.id, "")),
            description: stringOr(rawStrategy.description, ""),
            kind,
            assignments: Array.isArray(rawStrategy.assignments)
              ? rawStrategy.assignments.map((assignment) => {
                const rawAssignment = (assignment ?? {}) as Record<string, unknown>;
                return {
                  variable: stringOr(rawAssignment.variable, ""),
                  value: numberOr(rawAssignment.value, 0)
                };
              }).filter((assignment) => assignment.variable)
              : [],
            rules: Array.isArray(rawStrategy.rules)
              ? rawStrategy.rules.map((rule) => {
                const rawRule = (rule ?? {}) as Record<string, unknown>;
                const operator: TreatmentStrategyRuleOperator = rawRule.operator === "neq" || rawRule.operator === "lt" || rawRule.operator === "lte" || rawRule.operator === "gt" || rawRule.operator === "gte" ? rawRule.operator : "eq";
                return {
                  variable: stringOr(rawRule.variable, ""),
                  value: numberOr(rawRule.value, 0),
                  conditionVariable: stringOr(rawRule.conditionVariable, ""),
                  operator,
                  conditionValue: numberOr(rawRule.conditionValue, 0),
                  otherwise: numberOr(rawRule.otherwise, 0)
                };
              }).filter((rule) => rule.variable && rule.conditionVariable)
              : []
          };
        }).filter((strategy) => strategy.id)
        : [],
      estimands: Array.isArray(longitudinal.estimands)
        ? longitudinal.estimands.map((estimand) => {
          const rawEstimand = (estimand ?? {}) as Record<string, unknown>;
          return {
            id: stringOr(rawEstimand.id, ""),
            label: stringOr(rawEstimand.label, stringOr(rawEstimand.id, "")),
            type: isMember(rawEstimand.type, LONGITUDINAL_ESTIMAND_TYPES) ? rawEstimand.type : "risk_difference",
            outcome: stringOr(rawEstimand.outcome, ""),
            strategies: stringListOr(rawEstimand.strategies),
            population: stringOr(rawEstimand.population, ""),
            horizon: stringOr(rawEstimand.horizon, "")
          };
        }).filter((estimand) => estimand.id && estimand.outcome)
        : [],
      censoring: Array.isArray(longitudinal.censoring)
        ? longitudinal.censoring.map((censoring) => {
          const rawCensoring = (censoring ?? {}) as Record<string, unknown>;
          return {
            id: stringOr(rawCensoring.id, ""),
            variable: stringOr(rawCensoring.variable, ""),
            time: typeof rawCensoring.time === "string" && rawCensoring.time ? rawCensoring.time : null,
            description: stringOr(rawCensoring.description, "")
          };
        }).filter((censoring) => censoring.id && censoring.variable)
        : [],
      survivalOutputs: Array.isArray(longitudinal.survivalOutputs)
        ? longitudinal.survivalOutputs.map((survival) => {
          const rawSurvival = (survival ?? {}) as Record<string, unknown>;
          return {
            id: stringOr(rawSurvival.id, ""),
            label: stringOr(rawSurvival.label, stringOr(rawSurvival.id, "")),
            timeVariable: typeof rawSurvival.timeVariable === "string" && rawSurvival.timeVariable ? rawSurvival.timeVariable : null,
            eventVariable: stringOr(rawSurvival.eventVariable, ""),
            eventVariables: stringListOr(rawSurvival.eventVariables),
            censoringVariable: typeof rawSurvival.censoringVariable === "string" && rawSurvival.censoringVariable ? rawSurvival.censoringVariable : null,
            censoringVariables: stringListOr(rawSurvival.censoringVariables),
            timeScale: stringOr(rawSurvival.timeScale, "")
          };
        }).map((survival) => ({
          ...survival,
          eventVariables: survival.eventVariables.length ? survival.eventVariables : [survival.eventVariable].filter(Boolean),
          censoringVariables: survival.censoringVariables.length ? survival.censoringVariables : [survival.censoringVariable].filter((value): value is string => Boolean(value))
        })).filter((survival) => survival.id && survival.eventVariable)
        : []
    },
    sources: Array.isArray(raw.sources)
      ? raw.sources.map((source) => {
        const rawSource = (source ?? {}) as Record<string, unknown>;
        return {
          id: stringOr(rawSource.id, ""),
          label: stringOr(rawSource.label, stringOr(rawSource.id, "")),
          authors: stringOr(rawSource.authors, ""),
          title: stringOr(rawSource.title, ""),
          year: stringOr(rawSource.year, ""),
          url: stringOr(rawSource.url, ""),
          chapter: stringOr(rawSource.chapter, ""),
          section: stringOr(rawSource.section, ""),
          reference: stringOr(rawSource.reference, ""),
          note: stringOr(rawSource.note, "")
        };
      }).filter((source) => source.id)
      : []
  };
}

function normalizeLongitudinalVariables(value: unknown): GraphDocumentMetadata["longitudinal"]["variables"] {
  if (!value || typeof value !== "object") return {};
  const out: GraphDocumentMetadata["longitudinal"]["variables"] = {};
  for (const [nodeId, metadata] of Object.entries(value as Record<string, unknown>)) {
    const raw = (metadata ?? {}) as Record<string, unknown>;
    out[nodeId] = {
      series: stringOr(raw.series, nodeId),
      time: typeof raw.time === "string" && raw.time ? raw.time : null,
      role: isMember(raw.role, LONGITUDINAL_VARIABLE_ROLES) ? raw.role : "other"
    };
  }
  return out;
}

export function cloneNodeMechanism(mechanism: NodeMechanism): NodeMechanism {
  return normalizeNodeMechanism(mechanism);
}

export function normalizeNodeMechanism(mechanism: Partial<NodeMechanism> | undefined): NodeMechanism {
  return {
    distribution: normalizeNodeDistribution(mechanism?.distribution),
    intercept: mechanism?.intercept ?? 0,
    noise: normalizeNodeDistribution(mechanism?.noise, "constant"),
    combiner: isNodeCombinerKind(mechanism?.combiner) ? mechanism.combiner : "additive",
    interactions: (mechanism?.interactions ?? []).map(cloneInteraction)
  };
}

export function normalizeEdgeMechanism(mechanism: Partial<EdgeMechanism> | undefined): EdgeMechanism {
  const kind = isEdgeMechanismKind(mechanism?.kind) ? mechanism.kind : "linear";
  const base = defaultEdgeMechanism(kind);
  return {
    ...base,
    ...mechanism,
    kind,
    enabled: mechanism?.enabled ?? true,
    coefficient: numberOr(mechanism?.coefficient, base.coefficient),
    threshold: numberOr(mechanism?.threshold, base.threshold),
    low: numberOr(mechanism?.low, base.low),
    high: numberOr(mechanism?.high, base.high),
    // scale may be negative: a falling smooth_threshold / saturating edge is an
    // inhibitory transfer function (e.g. injury severity suppressing survival).
    scale: numberOr(mechanism?.scale, base.scale),
    steepness: positiveOr(mechanism?.steepness, base.steepness),
    midpoint: numberOr(mechanism?.midpoint, base.midpoint),
    beta1: numberOr(mechanism?.beta1, base.beta1),
    beta2: numberOr(mechanism?.beta2, base.beta2),
    baseline: numberOr(mechanism?.baseline, base.baseline),
    maxEffect: numberOr(mechanism?.maxEffect, base.maxEffect),
    ec50: positiveOr(mechanism?.ec50, base.ec50),
    exponent: positiveOr(mechanism?.exponent, base.exponent),
    offset: numberOr(mechanism?.offset, base.offset),
    points: normalizePiecewisePoints(mechanism?.points, base.points),
    ...(mechanism?.dataset !== undefined ? { dataset: mechanism.dataset } : {}),
    ...(mechanism?.dataColumn !== undefined ? { dataColumn: mechanism.dataColumn } : {})
  };
}

function cloneInteraction(interaction: NodeInteraction): NodeInteraction {
  return { ...interaction };
}

export function normalizeVariableModel(model: Partial<VariableModel> | undefined): VariableModel {
  const base = defaultVariableModel();
  const raw = (model ?? {}) as Record<string, unknown>;
  const measurement = (raw.measurement ?? {}) as Record<string, unknown>;
  const intervention = (raw.intervention ?? {}) as Record<string, unknown>;
  const simulation = (raw.simulation ?? {}) as Record<string, unknown>;
  const adjustment = (raw.adjustment ?? {}) as Record<string, unknown>;
  return {
    description: stringOr(raw.description, base.description),
    valueType: isMember(raw.valueType, VARIABLE_VALUE_TYPES) ? raw.valueType : base.valueType,
    unit: stringOr(raw.unit, base.unit),
    categories: stringListOr(raw.categories),
    measurement: {
      kind: isMember(measurement.kind, MEASUREMENT_MODEL_KINDS) ? measurement.kind : base.measurement.kind,
      errorSd: nonnegativeOr(measurement.errorSd, base.measurement.errorSd),
      missingRate: clamp01(numberOr(measurement.missingRate, base.measurement.missingRate)),
      lowerLimit: nullableNumber(measurement.lowerLimit),
      upperLimit: nullableNumber(measurement.upperLimit)
    },
    intervention: {
      kind: isMember(intervention.kind, INTERVENTION_KINDS) ? intervention.kind : base.intervention.kind,
      value: numberOr(intervention.value, base.intervention.value),
      shift: numberOr(intervention.shift, base.intervention.shift),
      probability: clamp01(numberOr(intervention.probability, base.intervention.probability))
    },
    simulation: {
      mode: isMember(simulation.mode, SIMULATION_DISPLAY_MODES) ? simulation.mode : base.simulation.mode,
      sampleSize: integerOr(simulation.sampleSize, base.simulation.sampleSize, 1)
    },
    adjustment: {
      method: isMember(adjustment.method, ADJUSTMENT_METHOD_KINDS) ? adjustment.method : base.adjustment.method,
      cutpoints: numberListOr(adjustment.cutpoints),
      standardize: typeof adjustment.standardize === "boolean" ? adjustment.standardize : base.adjustment.standardize
    },
    tags: stringListOr(raw.tags)
  };
}

export function normalizeNodeDistribution(distribution: Partial<NodeDistribution> | undefined, fallbackKind: NodeDistribution["kind"] = "constant"): NodeDistribution {
  const raw = (distribution ?? {}) as Record<string, unknown> & { kind?: NodeDistribution["kind"] };
  const kind = raw.kind ?? fallbackKind;
  if (kind === "normal") return { kind, mean: numberOr(raw.mean, 0), sd: positiveOr(raw.sd, 1) };
  if (kind === "lognormal") return { kind, meanLog: numberOr(raw.meanLog, 0), sdLog: positiveOr(raw.sdLog, 1) };
  if (kind === "uniform") {
    const min = numberOr(raw.min, 0);
    const max = numberOr(raw.max, 1);
    return min <= max ? { kind, min, max } : { kind, min: max, max: min };
  }
  if (kind === "bernoulli") return { kind, p: clamp01(numberOr(raw.p, 0.5)) };
  if (kind === "poisson") return { kind, lambda: positiveOr(raw.lambda, 1) };
  if (kind === "beta") return { kind, alpha: positiveOr(raw.alpha, 2), beta: positiveOr(raw.beta, 2) };
  if (kind === "laplace") return { kind, mean: numberOr(raw.mean, 0), scale: positiveOr(raw.scale, 1) };
  if (kind === "student_t") return { kind, mean: numberOr(raw.mean, 0), scale: positiveOr(raw.scale, 1), df: positiveOr(raw.df, 5) };
  if (kind === "gamma") return { kind, shape: positiveOr(raw.shape, 2), scale: positiveOr(raw.scale, 1) };
  if (kind === "exponential") return { kind, rate: positiveOr(raw.rate, 1) };
  if (kind === "categorical") {
    const weights = Array.isArray(raw.weights) && raw.weights.length > 0
      ? raw.weights.map((w) => positiveOr(w, 0))
      : [1, 1, 1];
    return { kind, weights: weights.some((w) => w > 0) ? weights : [1, 1, 1] };
  }
  return { kind: "constant", value: numberOr(raw.value, 0) };
}

export function normalizeSelectionCondition(condition: Partial<SimulationSelectionCondition> | undefined): SimulationSelectionCondition {
  const operator = condition?.operator === "at_most" || condition?.operator === "between" || condition?.operator === "one_of" ? condition.operator : "at_least";
  const value = numberOr(condition?.value, 0);
  const rawUpper = nullableNumber(condition?.upper);
  const valueRef = typeof condition?.valueRef === "string" && condition.valueRef.length > 0 ? condition.valueRef : null;
  const upperRef = typeof condition?.upperRef === "string" && condition.upperRef.length > 0 ? condition.upperRef : null;
  const sampling = condition?.sampling === "rejection" || condition?.sampling === "importance" || condition?.sampling === "analytic" ? condition.sampling : "auto";
  if (operator === "one_of") {
    const values = Array.isArray(condition?.values)
      ? [...new Set(condition.values.filter((item) => Number.isFinite(item)).map((item) => Number(item)))].sort((a, b) => a - b)
      : [value];
    return { operator, value: values[0] ?? value, upper: null, valueRef: null, upperRef: null, values, sampling: "rejection" };
  }
  if (operator !== "between") return { operator, value, upper: null, valueRef, upperRef: null, sampling };
  const upper = rawUpper ?? value;
  // Only swap literal bounds for ordering when neither side is a ref - we cannot compare refs at normalization time.
  if (valueRef || upperRef) return { operator, value, upper, valueRef, upperRef, sampling };
  return value <= upper ? { operator, value, upper, valueRef: null, upperRef: null, sampling } : { operator, value: upper, upper: value, valueRef: null, upperRef: null, sampling };
}

function isNodeCombinerKind(value: unknown): value is NodeMechanism["combiner"] {
  return typeof value === "string" && NODE_COMBINER_KINDS.has(value);
}

function isEdgeMechanismKind(value: unknown): value is EdgeMechanismKind {
  return typeof value === "string" && EDGE_MECHANISM_KINDS.has(value);
}

function normalizePiecewisePoints(points: EdgeMechanism["points"] | undefined, fallback: EdgeMechanism["points"]): EdgeMechanism["points"] {
  const normalized = (points ?? [])
    .map((point) => ({ x: numberOr(point.x, Number.NaN), y: numberOr(point.y, Number.NaN) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  return normalized.length >= 2 ? normalized : fallback.map((point) => ({ ...point }));
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function integerOr(value: unknown, fallback: number, min = Number.NEGATIVE_INFINITY): number {
  const next = Math.round(numberOr(value, fallback));
  return next >= min ? next : fallback;
}

function nonnegativeOr(value: unknown, fallback: number): number {
  const next = numberOr(value, fallback);
  return next >= 0 ? next : fallback;
}

function positiveOr(value: unknown, fallback: number): number {
  const next = numberOr(value, fallback);
  return next > 0 ? next : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function stringListOr(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
}

function numberListOr(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)).sort((a, b) => a - b);
}

function isMember<T extends string>(value: unknown, values: ReadonlySet<T>): value is T {
  return typeof value === "string" && values.has(value as T);
}
