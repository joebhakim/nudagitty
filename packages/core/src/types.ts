export type GraphKind = "dag" | "digraph" | "mag" | "pdag" | "pag" | "graph";

export type EdgeKind =
  | "directed"
  | "bidirected"
  | "undirected"
  | "partialDirected"
  | "partialUndirected"
  | "unspecified";

export type ViewMode = "normal" | "moral" | "correlation" | "equivalence";

export type EffectKind = "total" | "direct" | "causalOdds" | "instrument";

export interface Point {
  x: number;
  y: number;
}

export interface NodeRoleFlags {
  exposure: boolean;
  outcome: boolean;
  adjusted: boolean;
  selected: boolean;
  latent: boolean;
}

export type VariableValueType =
  | "continuous"
  | "binary"
  | "categorical"
  | "ordinal"
  | "count"
  | "positive"
  | "proportion"
  | "time_to_event"
  | "vector"
  | "time_series"
  | "text"
  | "embedding"
  | "distributional";

export type MeasurementModelKind =
  | "observed"
  | "noisy_proxy"
  | "latent_construct"
  | "censored"
  | "rounded"
  | "missing_prone";

export type InterventionKind =
  | "none"
  | "hard_do"
  | "soft_shift"
  | "stochastic"
  | "policy"
  | "manual_override";

export type SimulationDisplayMode =
  | "single_draw"
  | "expected_value"
  | "population_mean"
  | "uncertainty_band"
  | "causal_contrast";

export type AdjustmentMethodKind =
  | "none"
  | "bins"
  | "stabilized_ipw"
  | "propensity_score_todo";

export interface VariableMeasurementModel {
  kind: MeasurementModelKind;
  errorSd: number;
  missingRate: number;
  lowerLimit: number | null;
  upperLimit: number | null;
}

export interface VariableInterventionModel {
  kind: InterventionKind;
  value: number;
  shift: number;
  probability: number;
}

export interface VariableSimulationView {
  mode: SimulationDisplayMode;
  sampleSize: number;
}

export interface VariableAdjustmentModel {
  method: AdjustmentMethodKind;
  cutpoints: number[];
}

export interface VariableModel {
  description: string;
  valueType: VariableValueType;
  unit: string;
  categories: string[];
  measurement: VariableMeasurementModel;
  intervention: VariableInterventionModel;
  simulation: VariableSimulationView;
  adjustment: VariableAdjustmentModel;
  tags: string[];
}

export type LongitudinalVariableRole =
  | "baseline"
  | "treatment"
  | "time_varying_confounder"
  | "outcome"
  | "censoring"
  | "selection"
  | "competing_event"
  | "latent"
  | "other";

export interface LongitudinalTimePoint {
  id: string;
  label: string;
  order: number;
}

export interface LongitudinalVariableMetadata {
  series: string;
  time: string | null;
  role: LongitudinalVariableRole;
}

export type TreatmentStrategyKind = "static" | "dynamic" | "stochastic";

export type TreatmentStrategyRuleOperator = "eq" | "neq" | "lt" | "lte" | "gt" | "gte";

export interface TreatmentStrategyAssignment {
  variable: string;
  value: number;
}

export interface TreatmentStrategyRule {
  variable: string;
  value: number;
  conditionVariable: string;
  operator: TreatmentStrategyRuleOperator;
  conditionValue: number;
  otherwise: number;
}

export interface TreatmentStrategy {
  id: string;
  label: string;
  description: string;
  kind: TreatmentStrategyKind;
  assignments: TreatmentStrategyAssignment[];
  rules: TreatmentStrategyRule[];
}

export type LongitudinalEstimandType =
  | "risk_difference"
  | "mean_difference"
  | "risk_ratio"
  | "hazard_ratio"
  | "survival_difference";

export interface LongitudinalEstimand {
  id: string;
  label: string;
  type: LongitudinalEstimandType;
  outcome: string;
  strategies: string[];
  population: string;
  horizon: string;
}

export interface CensoringSpec {
  id: string;
  variable: string;
  time: string | null;
  description: string;
}

export interface SurvivalOutputSpec {
  id: string;
  label: string;
  timeVariable: string | null;
  eventVariable: string;
  eventVariables: string[];
  censoringVariable: string | null;
  censoringVariables: string[];
  timeScale: string;
}

export interface SourceCitation {
  id: string;
  label: string;
  authors: string;
  title: string;
  year: string;
  url: string;
  chapter: string;
  section: string;
  reference: string;
  note: string;
}

export interface LongitudinalMetadata {
  timePoints: LongitudinalTimePoint[];
  variables: Record<string, LongitudinalVariableMetadata>;
  treatmentStrategies: TreatmentStrategy[];
  estimands: LongitudinalEstimand[];
  censoring: CensoringSpec[];
  survivalOutputs: SurvivalOutputSpec[];
}

export interface GraphDocumentMetadata {
  longitudinal: LongitudinalMetadata;
  sources: SourceCitation[];
}

export interface GraphNode {
  id: string;
  label: string;
  position: Point;
  roles: NodeRoleFlags;
  variable: VariableModel;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  control?: Point;
}

export interface GraphModel {
  kind: GraphKind;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type NodeDistribution =
  | { kind: "constant"; value: number }
  | { kind: "normal"; mean: number; sd: number }
  | { kind: "lognormal"; meanLog: number; sdLog: number }
  | { kind: "uniform"; min: number; max: number }
  | { kind: "bernoulli"; p: number }
  | { kind: "poisson"; lambda: number }
  | { kind: "beta"; alpha: number; beta: number }
  | { kind: "laplace"; mean: number; scale: number }
  | { kind: "student_t"; mean: number; scale: number; df: number }
  | { kind: "gamma"; shape: number; scale: number }
  | { kind: "exponential"; rate: number };

export type NodeCombinerKind =
  | "additive"
  | "bounded_logistic"
  | "positive_softplus"
  | "bernoulli_logit"
  | "poisson_log"
  | "gamma_log"
  | "noisy_or";

export type NodeInteraction =
  | { id: string; kind: "product"; left: string; right: string; coefficient: number }
  | { id: string; kind: "smooth_gated"; source: string; gate: string; coefficient: number; threshold: number; steepness: number };

export interface NodeMechanism {
  distribution: NodeDistribution;
  intercept: number;
  noise: NodeDistribution;
  combiner: NodeCombinerKind;
  interactions: NodeInteraction[];
}

export type EdgeMechanismKind =
  | "linear"
  | "absorbing"
  | "threshold"
  | "smooth_threshold"
  | "saturating"
  | "quadratic"
  | "piecewise_linear"
  | "hill_emax"
  | "log_linear"
  | "power_law"
  | "monotone_spline";

export interface PiecewisePoint {
  x: number;
  y: number;
}

export interface EdgeMechanism {
  kind: EdgeMechanismKind;
  coefficient: number;
  enabled: boolean;
  threshold: number;
  low: number;
  high: number;
  scale: number;
  steepness: number;
  midpoint: number;
  beta1: number;
  beta2: number;
  baseline: number;
  maxEffect: number;
  ec50: number;
  exponent: number;
  offset: number;
  points: PiecewisePoint[];
}

export interface SimulationSpec {
  seed: number;
  nodes: Record<string, NodeMechanism>;
  edges: Record<string, EdgeMechanism>;
  overrides: Record<string, number>;
  selections: Record<string, SimulationSelectionCondition>;
}

export type SimulationSelectionOperator = "at_least" | "at_most" | "between" | "one_of";
export type SimulationInferenceMode = "auto" | "analytic" | "rejection" | "importance";
export type SimulationSamplingMode = SimulationInferenceMode;

export interface SimulationSelectionCondition {
  operator: SimulationSelectionOperator;
  value: number;
  upper: number | null;
  // Optional node-id references that override the literal `value` / `upper` per draw.
  // When set, the bound is read from the current draw's value of that node, enabling
  // conditions like `Practice >= population_mean_Practice`. Forces rejection sampling.
  valueRef: string | null;
  upperRef: string | null;
  values?: number[] | null;
  sampling: SimulationSamplingMode;
}

export type SimulatedAnalyticDensity =
  | { kind: "truncated_normal"; mean: number; sd: number; lower: number | null; upper: number | null }
  | { kind: "bernoulli"; p: number };

export interface SimulatedAnalyticDistribution {
  distribution: NodeDistribution;
  mean: number | null;
  variance: number | null;
  note: string;
  density?: SimulatedAnalyticDensity;
}

export interface SimulatedEmpiricalDistribution {
  samples: number[];
  weights: number[];
  mean: number | null;
  variance: number | null;
  min: number | null;
  max: number | null;
  effectiveSampleSize: number | null;
}

export interface SimulatedNodeState {
  kind: "scalar" | "distribution";
  value: number;
  observed: number | null;
  analytic: SimulatedAnalyticDistribution | null;
  empirical: SimulatedEmpiricalDistribution;
}

export interface SimulationConditioningSummary {
  totalSamples: number;
  acceptedSamples: number;
  activeConditions: string[];
  analytic: string | null;
  empiricalMethod: "forward" | "rejection" | "importance";
  requestedInference: SimulationInferenceMode;
  primaryMethod: "forward" | "analytic" | "rejection" | "importance";
  effectiveSampleSize: number | null;
}

export interface GraphDocument {
  schemaVersion: 2;
  id: string;
  title: string;
  graph: GraphModel;
  simulation: SimulationSpec;
  metadata: GraphDocumentMetadata;
  updatedAt: string;
}

export interface ParsedModel {
  document: GraphDocument;
  warnings: string[];
}

export interface ConditionalIndependence {
  left: string;
  right: string;
  given: string[];
}

export interface AdjustmentReport {
  valid: boolean;
  message: string;
  minimalSets: string[][];
}

export interface InstrumentReport {
  instruments: Array<{ instrument: string; conditionedOn: string[] }>;
  message: string;
}

export interface AnalysisReport {
  cycle: string[] | null;
  semiCycle: string[] | null;
  exposures: string[];
  outcomes: string[];
  adjusted: string[];
  selected: string[];
  latent: string[];
  covariateCount: number;
  causalPathCount: number;
  openBiasingPathCount: number;
  causalPaths: string[][];
  biasingPaths: string[][];
  totalEffect: AdjustmentReport;
  directEffect: AdjustmentReport;
  causalOdds: AdjustmentReport;
  instruments: InstrumentReport;
  implications: ConditionalIndependence[];
}

export interface SimulationResult {
  seed: number;
  values: Record<string, number>;
  nodeStates: Record<string, SimulatedNodeState>;
  contributions: Record<string, number>;
  changedNodes: string[];
  diagnostics: string[];
  conditioning: SimulationConditioningSummary;
}
