import type {
  AdjustmentMethodKind,
  InterventionKind,
  LongitudinalEstimandType,
  LongitudinalVariableRole,
  MeasurementModelKind,
  NodeRoleFlags,
  SimulationDisplayMode,
  VariableValueType
} from "../types";

export const GRAPH_DOCUMENT_SCHEMA_VERSION = 2 as const;

export const NODE_COMBINER_KINDS = new Set([
  "additive",
  "bounded_logistic",
  "positive_softplus",
  "bernoulli_logit",
  "poisson_log",
  "gamma_log",
  "noisy_or",
  "copula_marginal"
]);

export const EDGE_MECHANISM_KINDS = new Set([
  "linear",
  "absorbing",
  "threshold",
  "smooth_threshold",
  "saturating",
  "quadratic",
  "piecewise_linear",
  "hill_emax",
  "log_linear",
  "power_law",
  "monotone_spline",
  "table_lookup"
]);

export const DEFAULT_ROLES: NodeRoleFlags = {
  exposure: false,
  outcome: false,
  adjusted: false,
  selected: false,
  latent: false,
  instrument: false
};

export const VARIABLE_VALUE_TYPES: ReadonlySet<VariableValueType> = new Set([
  "continuous",
  "binary",
  "categorical",
  "ordinal",
  "count",
  "positive",
  "semicontinuous",
  "proportion",
  "time_to_event",
  "vector",
  "time_series",
  "text",
  "embedding",
  "distributional"
]);

export const MEASUREMENT_MODEL_KINDS: ReadonlySet<MeasurementModelKind> = new Set([
  "observed",
  "noisy_proxy",
  "latent_construct",
  "censored",
  "rounded",
  "missing_prone"
]);

export const INTERVENTION_KINDS: ReadonlySet<InterventionKind> = new Set([
  "none",
  "hard_do",
  "soft_shift",
  "stochastic",
  "policy",
  "manual_override"
]);

export const SIMULATION_DISPLAY_MODES: ReadonlySet<SimulationDisplayMode> = new Set([
  "single_draw",
  "expected_value",
  "population_mean",
  "uncertainty_band",
  "causal_contrast"
]);

export const ADJUSTMENT_METHOD_KINDS: ReadonlySet<AdjustmentMethodKind> = new Set([
  "none",
  "bins",
  "stabilized_ipw",
  "propensity_score_todo"
]);

export const LONGITUDINAL_VARIABLE_ROLES: ReadonlySet<LongitudinalVariableRole> = new Set([
  "baseline",
  "treatment",
  "time_varying_confounder",
  "outcome",
  "censoring",
  "selection",
  "competing_event",
  "latent",
  "mediator",
  "other"
]);

export const LONGITUDINAL_ESTIMAND_TYPES: ReadonlySet<LongitudinalEstimandType> = new Set([
  "risk_difference",
  "mean_difference",
  "risk_ratio",
  "hazard_ratio",
  "survival_difference"
]);
