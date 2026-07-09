import type { CovariateDataset } from "./data/dataset";

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
  // An instrument: a cause of the exposure with no other path to the outcome (exclusion) and no shared
  // cause with it (independence). Lets the IV / 2SLS estimator recover the effect under unmeasured
  // confounding. Assigned explicitly by the user; candidate instruments are flagged structurally.
  instrument: boolean;
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
  // true  -> adjust: stratify on every level and standardize back to the population
  // false -> condition: stratify on every level and show each stratum, without combining
  standardize: boolean;
}

// Canonical description of a node's response support (its "family"). This is the
// intended single source of truth for a node's type; `VariableModel.valueType` is
// kept as a synced, derived mirror of `responseFamily.kind` (see normalizeVariableModel,
// which enforces `valueType === responseFamily.kind`). Level labels live in
// `VariableModel.categories`; `levels` records K for nominal/ordinal supports.
export interface ResponseFamily {
  kind: VariableValueType; // the family / support
  levels: number; // K for nominal/ordinal (0 otherwise); labels live in variable.categories
  thresholds: number[]; // ordinal cutpoints (empty otherwise)
}

export interface VariableModel {
  description: string;
  responseFamily: ResponseFamily;
  // Derived mirror of `responseFamily.kind`; normalize keeps the two in lockstep.
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
  | "mediator"
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
  // Provenance: keys of numbers PINNED to a data fit (live — recomputed on every commit). Keys:
  // `e:<edgeId>` (edge coefficient), `ni:<nodeId>` (node intercept), `nn:<nodeId>` (node noise sd).
  // Absent/empty ⇒ nothing pinned (the default; every existing model). A number is "read from data"
  // when its node has a table_lookup edge; "authored" otherwise and not pinned.
  pins: string[];
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
  | { kind: "exponential"; rate: number }
  // k unordered/ordinal levels; the sampled value is the level index 0..k-1, drawn ∝ weights.
  | { kind: "categorical"; weights: number[] };

export type NodeCombinerKind =
  | "additive"
  | "bounded_logistic"
  | "positive_softplus"
  | "bernoulli_logit"
  | "poisson_log"
  | "gamma_log"
  | "noisy_or"
  // Gaussian-copula marginal transform: treats the node's linear predictor η (built from
  // latent-Gaussian source parents + noise, so η ~ N(0,1)) as a copula coordinate and maps it
  // to the node's target marginal via L = F⁻¹(Φ(η)), where F = the node's `distribution`.
  // Used to give covariates a specified correlation while hitting exact marginals (NORTA).
  | "copula_marginal";

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
  | "monotone_spline"
  // Plasmode: the parent is a shared row-index source; this edge returns the embedded dataset's
  // value at dataTable[floor(parent)][dataColumn]. All covariates reading the same row reproduce
  // the real joint dependence exactly. See `dataset` / `dataColumn` below.
  | "table_lookup";

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
  // For kind === "table_lookup": which embedded dataset and which column to read.
  dataset?: string;
  dataColumn?: number;
}

// --- Copula / vine dependence model (functions live in copulaVine.ts) ---
export type CopulaFamily = "independence" | "gaussian" | "frank" | "clayton" | "gumbel";
export type CopulaRotation = 0 | 90 | 180 | 270;
export interface PairCopula { family: CopulaFamily; tau: number; rotation?: CopulaRotation }
/** A scalar that is constant (by === null) or a moderation curve of a conditioning variable's value. */
export interface Moderation { by: number | null; constant: number; mechanism?: EdgeMechanism }
export interface CopulaComponent { family: CopulaFamily; rotation: CopulaRotation; tau: Moderation }
export interface MixtureEdge { components: CopulaComponent[]; weights: Moderation[] }
/** A block of DAG nodes whose (root) marginals are coupled by a D-vine of mixture edges. */
export interface CopulaBlock {
  id: string;
  nodes: string[];          // DAG node ids in the block (roots)
  order: number[];          // D-vine order: line position → index into `nodes`
  edges: MixtureEdge[][];   // [tree][edge], truncatable
  depth: number;
}

export interface SimulationSpec {
  seed: number;
  nodes: Record<string, NodeMechanism>;
  edges: Record<string, EdgeMechanism>;
  overrides: Record<string, number>;
  selections: Record<string, SimulationSelectionCondition>;
  /** Optional copula blocks coupling root-covariate marginals; absent/empty ⇒ independent draws. */
  copulaBlocks?: CopulaBlock[];
  /** Imported/session datasets carried WITH the spec so `table_lookup` resolves them across threads
   * (the sim runs in a worker with its own module instance — a global registry wouldn't reach it). */
  datasets?: Record<string, CovariateDataset>;
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

// How a conditioned-on variable relates to the exposure -> outcome estimand.
//  - "backdoor": conditioning on it CLOSES an otherwise-open biasing path (a valid adjuster)
//  - "collider": conditioning on it OPENS a biasing path (a bad control)
//  - "neutral":  conditioning on it neither opens nor closes any exposure->outcome path
export type ConditionedClassification = "backdoor" | "neutral" | "collider";

// The estimand operation applied to a variable. See docs/causal-operations.md.
//  intervene = do(V=v); select = condition on one stratum (sample inclusion);
//  condition = stratify and show every stratum; adjust = stratify and standardize.
export type AnalysisOperation = "none" | "intervene" | "select" | "condition" | "adjust";

export interface ConditioningRole {
  node: string;
  operation: AnalysisOperation;
  classification: ConditionedClassification;
  opensBiasingPath: boolean;
  blocksBiasingPath: boolean;
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
  conditioningRoles: ConditioningRole[];
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
