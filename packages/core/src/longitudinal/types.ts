import type {
  GraphNode,
  LongitudinalTimePoint,
  LongitudinalVariableMetadata,
  SimulationResult,
  TreatmentStrategy
} from "../types";

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
/** Which outcome model the model-based estimators use. Absent ⇒ the smallest hypothesis class (`ols`).
 *  See `estimation/learners.ts` — this is the RESPONSE-FAMILY axis, orthogonal to CovariateBasis above. */
import type { OutcomeLearnerId } from "./estimation/learners";
export type { OutcomeLearnerId };

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
  /** The outcome-model rung. Absent ⇒ `ols`, the smallest hypothesis class — never silently upgraded. */
  outcomeModel?: OutcomeLearnerId;
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
  // The effect the DGP imposes analytically (from document metadata), when the example declares one —
  // shown next to the simulated g-formula oracle, which carries MC noise for a nonlinear outcome.
  imposedEffect?: number | null;
}

export interface MethodSurvivalCurve {
  strategyId: string;
  points: SurvivalCurvePoint[];
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
  /** The outcome-model rung. Absent ⇒ `ols`, the smallest hypothesis class — never silently upgraded. */
  outcomeModel?: OutcomeLearnerId;
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

export type PositivityStatus = "ok" | "warning" | "violated";
