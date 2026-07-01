import { analyzeAdjustment, cohortFromSimulationResult, deriveAdjustmentSpec, estimateSurvivalCurve, normalizeVariableModel, observedMethodSurvivalCurves, runSimulation } from "@nudagitty/core";
import type { AdjustmentSpec, GMethodsComparison, MethodSurvivalCurve, SurvivalCurvePoint } from "@nudagitty/core";
import { formatSignedValue } from "../../shared/formatting";
import { weightedConditionalMean } from "../helpers";
import { describeEstimand } from "../estimand";
import { weightedConditionalMeanOfDifference } from "./stats";
import { formatOutcomeDifference } from "./components";
import type { OutputContext } from "../types";
import type {
  HuhCompletedOutput, HuhMetric, WhatIfAdvancedOutput, WhatIfOutputScale, WhatIfOutputView,
  WhatIfStrategySurvivalSummary, WhatIfSurvivalSummary
} from "./types";


// The analysis spec (treatments, covariates, outcome, censoring, strategies, scale) is
// now DERIVED from the graph operations via deriveAdjustmentSpec — not configured here.
// This config only carries presentation/narrative: badge, title, which view, the
// survival spec to chart, and the conclusion copy.
type WhatIfOutputConfig = {
  badge: string;
  title: string;
  view?: WhatIfOutputView;
  denominatorsOpen?: boolean;
  survivalSpecId?: string;
  conclusion: (comparison: GMethodsComparison | null, scale: WhatIfOutputScale, unit: string) => string;
};

const WHAT_IF_OUTPUT_CONFIGS: Record<string, WhatIfOutputConfig> = {
  "what-if-treatment-feedback": {
    badge: "What If",
    title: "G-method comparison",
    conclusion: (comparison, scale, unit) => {
      const naive = comparison?.estimates.find((estimate) => estimate.id === "naive");
      const stratified = comparison?.estimates.find((estimate) => estimate.id === "stratified");
      return `Estimate complete strategies here. L1 is post-A0 and pre-A1, so observed (${formatOutcomeDifference(naive?.estimate ?? null, scale, unit)}) and L1-standardized (${formatOutcomeDifference(stratified?.estimate ?? null, scale, unit)}) contrasts are diagnostics.`;
    }
  },
  "what-if-ipw-pseudopopulation": {
    badge: "What If",
    title: "Standardization and IP weighting",
    conclusion: (comparison, scale, unit) => `The weighted pseudo-population targets the same baseline strategy contrast as standardization; the crude observed read (${formatOutcomeDifference(comparison?.estimates.find((estimate) => estimate.id === "naive")?.estimate ?? null, scale, unit)}) is kept as a diagnostic.`,
  },
  "what-if-hazard-selection": {
    badge: "What If",
    title: "Survival and survivor selection",
    view: "survival",
    denominatorsOpen: true,
    survivalSpecId: "two-interval-survival",
    conclusion: () => "Interval hazards are conditioned on who remains alive. The survival curve keeps the cumulative risk denominator visible so a late hazard read is not mistaken for the target risk contrast.",
  },
  "what-if-nhefs-mortality-survival": {
    badge: "What If",
    title: "Mortality survival contrast",
    view: "survival",
    survivalSpecId: "mortality-survival",
    conclusion: () => "The graph separates baseline cessation, later weight change, death over follow-up, and censoring. Censoring-aware weights are reported with the strategy contrast.",
  },
  "what-if-weight-gain-g-estimation": {
    badge: "What If",
    title: "Weight-gain g-estimation",
    view: "g_estimation",
    conclusion: (comparison, scale, unit) => `The additive g-estimation row is the structural-nested teaching read; naive quitting differences (${formatOutcomeDifference(comparison?.estimates.find((estimate) => estimate.id === "naive")?.estimate ?? null, scale, unit)}) remain an observed-data comparison, and exchangeability is an assumption rather than a test result.`,
  },
  "what-if-hiv-cd4-variants": {
    badge: "What If",
    title: "Time-varying ART over CD4 history",
    view: "dynamic",
    conclusion: () => "Low CD4 channels patients into ART, so the crude 'ever-treated' contrast is badly confounded — treatment can look nearly useless. The g-formula re-simulates each strategy over the full CD4 history and recovers the always-vs-never effect, because CD4 is both a confounder for the next dose and a mediator of the last one (so adjusting for it directly is wrong).",
  },
  "what-if-censoring-ipcw": {
    badge: "What If",
    title: "Treatment and censoring weights",
    view: "ipcw",
    conclusion: () => "Censoring is explicit, so the IPW row includes treatment and censoring probabilities. Rows after censoring are not silently treated as ordinary follow-up.",
  },
  "what-if-dynamic-g-formula": {
    badge: "What If",
    title: "Dynamic g-formula",
    view: "dynamic",
    conclusion: () => "The dynamic strategy is evaluated as a rule over prior risk history. That makes the plotted contrast a strategy contrast rather than an exposure-category comparison.",
  },
  "what-if-snaft-survival": {
    badge: "What If",
    title: "Structural nested survival time",
    view: "survival_time",
    survivalSpecId: "observed-death-survival",
    conclusion: () => "The main contrast is on failure time, with observed death and censoring shown as follow-up diagnostics. This keeps the survival-time estimand separate from a simple risk read; rank preservation and exchangeability remain modeling assumptions.",
  }
};

export function computeWhatIfAdvancedOutput(context: OutputContext, moduleId: string): WhatIfAdvancedOutput | null {
  const config = WHAT_IF_OUTPUT_CONFIGS[moduleId];
  if (!config) return null;
  // Same unified pipeline as every other example: derive the spec from the graph's
  // operations, then run the shared engine.
  const derivedSpec = deriveAdjustmentSpec(context.document);
  if (!derivedSpec) return null;
  const spec = { ...derivedSpec, covariateBasis: context.covariateBasis ?? "linear" };
  const outcomeScale: WhatIfOutputScale = spec.outcomeScale;
  const outcomeNode = context.document.graph.nodes.find((node) => node.id === spec.outcome);
  const outcomeUnit = outcomeNode?.variable.unit ?? "";
  const comparison = analyzeAdjustment(context.document, spec);
  const source = context.document.metadata.sources.find((candidate) => candidate.id === "hernan-robins-what-if");
  const survivalSpec = config.survivalSpecId
    ? context.document.metadata.longitudinal.survivalOutputs.find((spec) => spec.id === config.survivalSpecId)
    : null;
  const survival = survivalSpec ? summarizeSurvival(context, survivalSpec.id, comparison, spec) : null;
  return {
    badge: config.badge,
    title: config.title,
    view: config.view ?? "generic",
    denominatorsOpen: config.denominatorsOpen ?? false,
    comparison,
    survival,
    outcomeScale,
    outcomeUnit,
    conclusion: config.conclusion(comparison, outcomeScale, outcomeUnit),
    source: source ? `${source.authors}, ${source.title} (${source.year}).` : "Inspired by Hernan and Robins, Causal Inference: What If.",
    sourceUrl: source?.url ?? "",
    sourceDetail: source ? `${source.chapter}${source.section ? `, ${source.section}` : ""}${source.reference ? ` (${source.reference})` : ""}.` : ""
  };
}

export function survivalSummaryFromPoints(strategyId: string, label: string, points: SurvivalCurvePoint[]): WhatIfStrategySurvivalSummary {
  const last = points[points.length - 1];
  return {
    strategyId,
    label,
    points,
    finalRisk: last?.risk ?? null,
    finalSurvival: last?.survival ?? null,
    totalEvents: points.reduce((sum, point) => sum + point.events, 0),
    totalCensored: points.reduce((sum, point) => sum + point.censored, 0),
    sampleSize: 0,
    effectiveSampleSize: null
  };
}

export function summarizeSurvival(context: OutputContext, specId: string, comparison: GMethodsComparison | null, adjustmentSpec: AdjustmentSpec | null): WhatIfSurvivalSummary | null {
  const spec = context.document.metadata.longitudinal.survivalOutputs.find((candidate) => candidate.id === specId);
  if (!spec) return null;
  const natural = survivalSummaryFromResult("natural-course", "natural course", context.simulation, spec);
  const strategies = comparison
    ? comparison.strategyEvaluations
      .map((evaluation) => survivalSummaryFromResult(evaluation.strategy.id, evaluation.strategy.label, evaluation.result, spec))
      .filter((summary): summary is WhatIfStrategySurvivalSummary => summary !== null)
    : [];
  if (!natural && strategies.length === 0) return null;
  const left = strategies[0] ?? null;
  const right = strategies[1] ?? null;
  // g-formula is the re-simulated curve; also compute the crude (naive) and IPCW-weighted
  // curves from the observed cohort so the dropdown can swap the whole trajectory.
  const curvesByMethod: WhatIfSurvivalSummary["curvesByMethod"] = { g_formula: strategies };
  if (comparison && adjustmentSpec) {
    const labelOf = (id: string) => comparison.strategies.find((strategy) => strategy.id === id)?.label ?? id;
    const wrap = (curve: MethodSurvivalCurve) => survivalSummaryFromPoints(curve.strategyId, labelOf(curve.strategyId), curve.points);
    const observed = observedMethodSurvivalCurves(cohortFromSimulationResult(context.simulation), spec, {
      treatmentVariables: adjustmentSpec.treatments,
      timeVaryingCovariates: adjustmentSpec.covariates,
      outcome: adjustmentSpec.outcome,
      censoringVariables: adjustmentSpec.censoring,
      strategies: adjustmentSpec.strategies
    }, adjustmentSpec.strategies);
    curvesByMethod.naive = observed.naive.map(wrap);
    curvesByMethod.ipw = observed.ipw.map(wrap);
  }
  return {
    label: spec.label,
    strategies,
    natural,
    riskDifference: left && right && left.finalRisk !== null && right.finalRisk !== null ? left.finalRisk - right.finalRisk : null,
    survivalDifference: left && right && left.finalSurvival !== null && right.finalSurvival !== null ? left.finalSurvival - right.finalSurvival : null,
    curvesByMethod
  };
}

export function survivalSummaryFromResult(strategyId: string, label: string, result: OutputContext["simulation"], spec: NonNullable<OutputContext["document"]["metadata"]["longitudinal"]["survivalOutputs"][number]>): WhatIfStrategySurvivalSummary | null {
  const cohort = cohortFromSimulationResult(result);
  const points = estimateSurvivalCurve(cohort, spec);
  if (points.length === 0) return null;
  const last = points[points.length - 1]!;
  return {
    strategyId,
    label,
    points,
    finalRisk: last.risk,
    finalSurvival: last.survival,
    totalEvents: points.reduce((sum, point) => sum + point.events, 0),
    totalCensored: points.reduce((sum, point) => sum + point.censored, 0),
    sampleSize: cohort.sampleSize,
    effectiveSampleSize: result.conditioning.effectiveSampleSize
  };
}


// Generic, example-agnostic diagnosis derived from the DAG structure: classify each
// conditioned node (backdoor / collider / neutral), state the estimand, compute the crude
// vs. causal (do) contrast for a binary exposure, and detect the gain-score pattern (a
// continuous baseline measure of the outcome). This replaces hand-written per-example cards.
export function computeStructuralDiagnosis(context: OutputContext): HuhCompletedOutput | null {
  const { analysis, document, simulation } = context;
  const exposureId = analysis.exposures[0];
  const outcomeId = analysis.outcomes[0];
  if (!exposureId || !outcomeId) return null;
  const exposureNode = document.graph.nodes.find((node) => node.id === exposureId);
  const outcomeNode = document.graph.nodes.find((node) => node.id === outcomeId);
  if (!exposureNode || !outcomeNode) return null;
  const exposureVar = normalizeVariableModel(exposureNode.variable);
  const outcomeVar = normalizeVariableModel(outcomeNode.variable);
  const exposureState = simulation.nodeStates[exposureId];
  const outcomeState = simulation.nodeStates[outcomeId];
  if (!exposureState || !outcomeState) return null;
  const exposureBinary = exposureVar.valueType === "binary";

  const colliders = analysis.conditioningRoles.filter((role) => role.classification === "collider");
  const adjusters = analysis.conditioningRoles.filter((role) => role.classification === "backdoor");
  const minimalSet = analysis.totalEffect.minimalSets[0] ?? [];

  const metrics: HuhMetric[] = [];
  let crudeContrast: number | null = null;
  let causalContrast: number | null = null;
  if (exposureBinary) {
    const treated = weightedConditionalMean(exposureState, outcomeState, 1);
    const control = weightedConditionalMean(exposureState, outcomeState, 0);
    crudeContrast = treated !== null && control !== null ? treated - control : null;
    const doTreated = runSimulation(document.graph, { ...document.simulation, overrides: { [exposureId]: 1 }, selections: {} });
    const doControl = runSimulation(document.graph, { ...document.simulation, overrides: { [exposureId]: 0 }, selections: {} });
    const dt = doTreated.nodeStates[outcomeId]?.empirical.mean;
    const dc = doControl.nodeStates[outcomeId]?.empirical.mean;
    causalContrast = dt !== null && dt !== undefined && dc !== null && dc !== undefined ? dt - dc : null;
    if (crudeContrast !== null) metrics.push({ label: "crude contrast", value: formatSignedValue(crudeContrast), detail: `observed ${exposureNode.label} difference, unadjusted`, numericValue: crudeContrast });
    if (causalContrast !== null) metrics.push({ label: "causal contrast — do()", value: formatSignedValue(causalContrast), detail: minimalSet.length > 0 ? `adjusted for ${minimalSet.join(", ")}` : "no adjustment needed", numericValue: causalContrast });
  }

  // gain-score pattern: a backdoor adjuster that is a continuous baseline measure of the
  // outcome (same unit, and a direct cause of the outcome) — e.g. Lord's baseline weight.
  const gainNode = adjusters
    .map((role) => document.graph.nodes.find((node) => node.id === role.node))
    .find((node) => {
      if (!node) return false;
      const variable = normalizeVariableModel(node.variable);
      const parentOfOutcome = document.graph.edges.some((edge) => edge.kind === "directed" && edge.source === node.id && edge.target === outcomeId);
      return variable.valueType !== "binary" && variable.unit.length > 0 && variable.unit === outcomeVar.unit && parentOfOutcome;
    });
  let gainScore: number | null = null;
  let baselineImbalance: number | null = null;
  if (gainNode && exposureBinary) {
    const gainState = simulation.nodeStates[gainNode.id];
    if (gainState) {
      const treated = weightedConditionalMean(exposureState, gainState, 1);
      const control = weightedConditionalMean(exposureState, gainState, 0);
      baselineImbalance = treated !== null && control !== null ? treated - control : null;
      const gainTreated = weightedConditionalMeanOfDifference(exposureState, outcomeState, gainState, 1);
      const gainControl = weightedConditionalMeanOfDifference(exposureState, outcomeState, gainState, 0);
      gainScore = gainTreated !== null && gainControl !== null ? gainTreated - gainControl : null;
      if (baselineImbalance !== null) metrics.push({ label: `${gainNode.label} imbalance`, value: formatSignedValue(baselineImbalance), detail: "the groups differ on the baseline measure", numericValue: baselineImbalance });
      if (gainScore !== null) metrics.push({ label: "change-score (gain)", value: formatSignedValue(gainScore), detail: `gain ${outcomeNode.label} − ${gainNode.label} — the effect on the change`, numericValue: gainScore });
    }
  }

  // Continuous-exposure selection examples (chess, restaurant collider) have no binary contrast
  // metrics, but a conditioning operation still has a well-defined estimand + structure worth showing.
  if (metrics.length === 0 && analysis.conditioningRoles.length === 0) return null;

  const primaryRole = analysis.conditioningRoles[0];
  const primaryNode = primaryRole ? document.graph.nodes.find((node) => node.id === primaryRole.node) : undefined;
  const estimand = describeEstimand({
    operation: primaryRole?.operation ?? "none",
    exposureLabel: exposureNode.label,
    outcomeLabel: outcomeNode.label,
    nodeLabel: primaryNode?.label ?? primaryRole?.node,
    value: primaryNode && normalizeVariableModel(primaryNode.variable).valueType === "binary" ? 1 : undefined
  });

  const hasGainScore = gainNode !== undefined && gainScore !== null;
  let conclusion: string;
  let recommendation: string;
  if (colliders.length > 0) {
    conclusion = `${colliders[0]!.node} is a collider on ${exposureNode.label} → ${outcomeNode.label}; conditioning on it opens a biasing path, so the unconditioned (crude) estimate is the unbiased one.`;
    recommendation = `Do not control for ${colliders.map((role) => role.node).join(", ")}.`;
  } else if (hasGainScore) {
    conclusion = `Two analyses of the same pre/post data disagree. The change score (gain in ${outcomeNode.label}) makes ${exposureNode.label} look like ${formatSignedValue(gainScore!)}, while adjusting for ${gainNode!.label} (ANCOVA) gives ${causalContrast !== null ? formatSignedValue(causalContrast) : "n/a"}. These are different estimands — the effect on the change versus the effect at a fixed ${gainNode!.label}. The groups start ${baselineImbalance !== null ? `${formatSignedValue(baselineImbalance)} apart` : "apart"} on ${gainNode!.label} and high scorers regress toward the mean, so the two diverge. This is Lord's paradox, not generic confounding.`;
    recommendation = `Choose the estimand before comparing: effect on the change (change score) versus the effect at equal ${gainNode!.label} (ANCOVA / adjust). With non-random groups the change score is biased for the level effect.`;
  } else if (adjusters.length > 0) {
    conclusion = `${exposureNode.label} → ${outcomeNode.label} is confounded by ${adjusters.map((role) => role.node).join(", ")}. Adjusting identifies the effect: crude contrast ${crudeContrast !== null ? formatSignedValue(crudeContrast) : "n/a"} versus causal ${causalContrast !== null ? formatSignedValue(causalContrast) : "n/a"}.`;
    recommendation = analysis.totalEffect.valid ? `Identified by adjusting for ${(minimalSet.length > 0 ? minimalSet : adjusters.map((role) => role.node)).join(", ")}.` : `Adjust for ${minimalSet.join(", ") || "a valid backdoor set"} to identify the effect.`;
  } else if (analysis.openBiasingPathCount > 0) {
    conclusion = `${exposureNode.label} → ${outcomeNode.label} has ${analysis.openBiasingPathCount} open biasing path(s); the crude contrast ${crudeContrast !== null ? formatSignedValue(crudeContrast) : ""} is confounded.`;
    recommendation = minimalSet.length > 0 ? `Adjust for ${minimalSet.join(", ")}.` : "No valid adjustment set exists in this graph.";
  } else {
    conclusion = `No open biasing paths between ${exposureNode.label} and ${outcomeNode.label}; the crude contrast ${crudeContrast !== null ? formatSignedValue(crudeContrast) : ""} is already the causal effect.`;
    recommendation = "No adjustment needed.";
  }

  return {
    badge: colliders.length > 0 ? "bad control" : hasGainScore ? "estimand split" : adjusters.length > 0 ? "confounding" : "identified",
    conclusion,
    metrics,
    bulletsAsBoxes: true,
    bullets: [
      { label: "Estimand", text: `${estimand.formal} — ${estimand.plain}` },
      { label: "Structure", text: analysis.conditioningRoles.length > 0 ? analysis.conditioningRoles.map((role) => `${role.node}: ${role.classification}`).join("; ") : "no variables conditioned" },
      { label: "Recommendation", text: recommendation }
    ]
  };
}
