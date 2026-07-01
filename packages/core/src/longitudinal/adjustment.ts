import { normalizeGraphDocumentMetadata, normalizeVariableModel } from "../graph";
import type { GraphDocument, TreatmentStrategy } from "../types";
import type {
  AdjustmentSpec,
  GMethodsComparison,
  GMethodsComparisonConfig,
  OverlapDiagnostic,
  PositivityStatus
} from "./types";
import { simulateLongitudinalCohort } from "./extract";
import { compareLongitudinalGMethods } from "./estimation";
import { binaryProbabilityTable, effectiveSampleSize, matchesStrategy, probabilityFromTable } from "./internal";

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
    controlEffectiveSampleSize: effectiveSampleSize(controlWeights) ?? 0,
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
