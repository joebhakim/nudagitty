import { analyzeAdjustment, cohortFromSimulationResult, compareLongitudinalGMethods, deriveAdjustmentSpec, estimateInstrument, estimateSurvivalCurve, observedMethodSurvivalCurves, normalizeVariableModel, runSimulation } from "@nudagitty/core";
import type { AdjustmentSpec, CovariateBasis, GMethodEstimate, GMethodsComparison, IvEstimate, MethodSurvivalCurve, SimulatedNodeState, SurvivalCurvePoint } from "@nudagitty/core";
import type React from "react";
import { Children, Fragment, memo, useState } from "react";
import {
  formatPercent,
  formatPercentagePointMagnitude,
  formatPercentagePoints,
  formatSignedValue,
  formatValue,
  formatWeightedCount
} from "../shared/formatting";
import { empiricalSampleWeight, formatAdjustmentSet, weightedBinaryShare, weightedConditionalMean, weightedJointConditionalMean } from "./helpers";
import { badControlWarning, describeEstimand } from "./estimand";
import { HighlightNames, NodeText } from "../shared/NodeNames";
import { chartFrame } from "../charts/chartFrame";
import { MARGINAL_COLOR, SERIES_COLORS, subgroupColor } from "../charts/chartColors";
import { CategoryOutcomePlot, binaryOutcomeSummaries, continuousOutcomeSummaries, wilsonInterval } from "../charts/CategoryOutcomePlot";
import type { CategoryOutcomeSummary } from "../charts/CategoryOutcomePlot";
import type { ScatterPoint } from "../charts/CategoryOutcomePlot";
import { stratifyRiskCurves } from "./stratify";
import type { CompletedOutputModule, CompletedOutputRenderOptions, OutputContext } from "./types";
export * from "./modules/exampleHandlers";
import { computeModeratorEffectOutput, computeInstrumentOutput, computeSimpsonCompletedOutput, computeIcuCompletedOutput, computeCollegeCompletedOutput, computeTutoringCompletedOutput, computeFrontDoorSmokingOutput, computeBirthweightParadoxOutput, computeObesityParadoxOutput, computeCatsHighriseSyndromeOutput, computePolicingEncountersOutput, computeMBiasOutput, computeChessSimpleFlipOutput, renderModeratorEffectOutput, renderInstrumentOutput, fallbackOutput } from "./modules/exampleHandlers";
export * from "./modules/components";
import { renderSimpsonOutput, renderIcuOutput, renderCollegeOutput, renderTutoringOutput, renderHuhOutput, renderWhatIfAdvancedOutput, sharedFacetYDomain, formatOutcomeDifference } from "./modules/components";
export * from "./modules/stats";
import { filteredConditionalMean, filteredMeanDifferenceInterval, weightedGroupMoments, intervalDetail, weightedConditionalMeanOfDifference, quantile, correlation } from "./modules/stats";
export * from "./modules/types";
import type {
  SimpsonCompletedOutput, IcuCompletedOutput, CollegeCompletedOutput, CollegeBinnedAdjustmentBin,
  TutoringCompletedOutput, TutoringAdjustedPair, HuhMetric, HuhShiftRow, HuhShift, HuhCompletedOutput,
  WhatIfOutputScale, WhatIfOutputView, WhatIfStrategySurvivalSummary, WhatIfSurvivalSummary,
  WhatIfAdvancedOutput, BasicOutputPunchlineMetric, BasicOutputPunchline, ComputedCompletedOutput,
  ModeratorFacet, ModeratorEffectOutput, InstrumentOutput
} from "./modules/types";


export const completedOutputModules: CompletedOutputModule<unknown>[] = [
  {
    id: "effect-modification",
    label: "moderator",
    compute: computeModeratorEffectOutput,
    render: (result) => renderModeratorEffectOutput(result as ModeratorEffectOutput),
    fallback: fallbackOutput("needs a moderator", "This output needs a smooth-gated moderator on the outcome.")
  },
  {
    id: "instrument",
    label: "instrument",
    compute: computeInstrumentOutput,
    render: (result) => renderInstrumentOutput(result as InstrumentOutput),
    fallback: fallbackOutput("needs an instrument", "This output needs an instrument, an exposure, and an outcome role assigned in the graph.")
  },
  {
    id: "simpson-severity",
    label: "Simpson ready",
    compute: computeSimpsonCompletedOutput,
    render: (result, options) => renderSimpsonOutput(result as SimpsonCompletedOutput, options),
    fallback: fallbackOutput("needs roles", "This completed Simpson output needs Treatment, Recovery, and Severity in the graph.")
  },
  {
    id: "icu-mortality-triage",
    label: "ICU ready",
    compute: computeIcuCompletedOutput,
    render: (result) => renderIcuOutput(result as IcuCompletedOutput),
    fallback: fallbackOutput("needs roles", "This completed ICU output needs Severity, ICU_admission, Death, and Triage_score in the graph.")
  },
  {
    id: "college-earnings",
    label: "college ready",
    compute: computeCollegeCompletedOutput,
    render: (result) => renderCollegeOutput(result as CollegeCompletedOutput),
    fallback: fallbackOutput("needs roles", "This completed college output needs Family_log_income, College, and Earnings in the graph.")
  },
  {
    id: "tutoring-scores",
    label: "fix available",
    compute: computeTutoringCompletedOutput,
    render: (result, options) => renderTutoringOutput(result as TutoringCompletedOutput, options),
    fallback: fallbackOutput("needs roles", "This completed tutoring output needs Academic_need, Tutoring, and Test_score in the graph.")
  },
  {
    id: "front-door-smoking",
    label: "front door",
    compute: computeFrontDoorSmokingOutput,
    render: (result) => renderHuhOutput(result as HuhCompletedOutput),
    fallback: fallbackOutput("needs roles", "This front-door output needs Smoking, Tar, Cancer, and Genetic_risk in the graph.")
  },
  {
    id: "birthweight-paradox",
    label: "paradox ready",
    compute: computeBirthweightParadoxOutput,
    render: (result) => renderHuhOutput(result as HuhCompletedOutput),
    fallback: fallbackOutput("needs roles", "This birthweight output needs Smoking, Birthweight, Frailty, and Infant_mortality in the graph.")
  },
  {
    id: "obesity-paradox",
    label: "paradox ready",
    compute: computeObesityParadoxOutput,
    render: (result) => renderHuhOutput(result as HuhCompletedOutput),
    fallback: fallbackOutput("needs roles", "This obesity-paradox output needs Obesity, Chronic_disease, Frailty, and Mortality in the graph.")
  },
  {
    id: "cats-highrise-syndrome",
    label: "paradox ready",
    compute: computeCatsHighriseSyndromeOutput,
    render: (result) => renderHuhOutput(result as HuhCompletedOutput),
    fallback: fallbackOutput("needs roles", "This falling-cats output needs Fall_height, Injury_severity, Survival, and Brought_to_vet in the graph.")
  },
  {
    id: "policing-encounters",
    label: "selection ready",
    compute: computePolicingEncountersOutput,
    render: (result) => renderHuhOutput(result as HuhCompletedOutput),
    fallback: fallbackOutput("needs roles", "This policing output needs Group_A, Police_contact, Incident_risk, and Use_of_force in the graph.")
  },
  {
    id: "m-bias-adjustment",
    label: "bad control",
    compute: computeMBiasOutput,
    render: (result) => renderHuhOutput(result as HuhCompletedOutput),
    fallback: fallbackOutput("needs roles", "This M-bias output needs Exposure, Collider_score, and Outcome in the graph.")
  },
  {
    id: "structural-diagnosis",
    label: "diagnosis",
    compute: computeStructuralDiagnosis,
    render: (result) => renderHuhOutput(result as HuhCompletedOutput),
    fallback: fallbackOutput("diagnosis", "Mark one exposure and one outcome to read a structural diagnosis of this DAG.")
  },
  {
    id: "chess-intelligence-practice-simple-flip",
    label: "sign flip",
    compute: computeChessSimpleFlipOutput,
    render: (result) => renderHuhOutput(result as HuhCompletedOutput),
    fallback: fallbackOutput("needs roles", "This chess output needs Intelligence, Practice_hours, Chess_Elo, and Elite_sample in the graph.")
  },
  {
    id: "what-if-treatment-feedback",
    label: "g-methods",
    compute: (context) => computeWhatIfAdvancedOutput(context, "what-if-treatment-feedback"),
    render: (result) => renderWhatIfAdvancedOutput(result as WhatIfAdvancedOutput),
    fallback: fallbackOutput("needs metadata", "This longitudinal output needs A0, L1, A1, Y, and treatment-strategy metadata.")
  },
  {
    id: "what-if-ipw-pseudopopulation",
    label: "IP weighting",
    compute: (context) => computeWhatIfAdvancedOutput(context, "what-if-ipw-pseudopopulation"),
    render: (result) => renderWhatIfAdvancedOutput(result as WhatIfAdvancedOutput),
    fallback: fallbackOutput("needs metadata", "This output needs treatment, outcome, and strategy metadata.")
  },
  {
    id: "what-if-hazard-selection",
    label: "survival",
    compute: (context) => computeWhatIfAdvancedOutput(context, "what-if-hazard-selection"),
    render: (result) => renderWhatIfAdvancedOutput(result as WhatIfAdvancedOutput),
    fallback: fallbackOutput("needs metadata", "This output needs interval death and survival metadata.")
  },
  {
    id: "what-if-nhefs-mortality-survival",
    label: "survival",
    compute: (context) => computeWhatIfAdvancedOutput(context, "what-if-nhefs-mortality-survival"),
    render: (result) => renderWhatIfAdvancedOutput(result as WhatIfAdvancedOutput),
    fallback: fallbackOutput("needs metadata", "This output needs mortality, censoring, and strategy metadata.")
  },
  {
    id: "what-if-weight-gain-g-estimation",
    label: "g-estimation",
    compute: (context) => computeWhatIfAdvancedOutput(context, "what-if-weight-gain-g-estimation"),
    render: (result) => renderWhatIfAdvancedOutput(result as WhatIfAdvancedOutput),
    fallback: fallbackOutput("needs metadata", "This output needs quitting, weight gain, and strategy metadata.")
  },
  {
    id: "what-if-hiv-cd4-variants",
    label: "variants",
    compute: (context) => computeWhatIfAdvancedOutput(context, "what-if-hiv-cd4-variants"),
    render: (result) => renderWhatIfAdvancedOutput(result as WhatIfAdvancedOutput),
    fallback: fallbackOutput("needs metadata", "This output needs CD4, ART, and dynamic strategy metadata.")
  },
  {
    id: "what-if-censoring-ipcw",
    label: "IPCW",
    compute: (context) => computeWhatIfAdvancedOutput(context, "what-if-censoring-ipcw"),
    render: (result) => renderWhatIfAdvancedOutput(result as WhatIfAdvancedOutput),
    fallback: fallbackOutput("needs metadata", "This output needs censoring and strategy metadata.")
  },
  {
    id: "what-if-dynamic-g-formula",
    label: "g-formula",
    compute: (context) => computeWhatIfAdvancedOutput(context, "what-if-dynamic-g-formula"),
    render: (result) => renderWhatIfAdvancedOutput(result as WhatIfAdvancedOutput),
    fallback: fallbackOutput("needs metadata", "This output needs dynamic strategy metadata.")
  },
  {
    id: "what-if-snaft-survival",
    label: "SNAFT",
    compute: (context) => computeWhatIfAdvancedOutput(context, "what-if-snaft-survival"),
    render: (result) => renderWhatIfAdvancedOutput(result as WhatIfAdvancedOutput),
    fallback: fallbackOutput("needs metadata", "This output needs survival-time and censoring metadata.")
  }
];

export function computeCompletedOutput(context: OutputContext, moduleId: string | null): ComputedCompletedOutput | null {
  const module = moduleId ? completedOutputModules.find((candidate) => candidate.id === moduleId) : undefined;
  if (module && moduleId) {
    return { moduleId, module, result: module.compute(context) };
  }
  // No example-specific module: fall back to the generic, DAG-derived structural diagnosis.
  const diagnosis = completedOutputModules.find((candidate) => candidate.id === "structural-diagnosis");
  if (!diagnosis) return null;
  const result = diagnosis.compute(context);
  if (result === null) return null;
  return { moduleId: "structural-diagnosis", module: diagnosis, result };
}

export function renderCompletedOutput(computed: ComputedCompletedOutput, options?: CompletedOutputRenderOptions) {
  return computed.result === null ? computed.module.fallback : computed.module.render(computed.result, options);
}

export function computeBasicOutputPunchline(context: OutputContext, moduleId: string | null): BasicOutputPunchline | null {
  const computed = computeCompletedOutput(context, moduleId);
  return basicOutputPunchlineFromResult(moduleId, computed?.result ?? null);
}

export function basicOutputPunchlineFromResult(moduleId: string | null, result: unknown | null): BasicOutputPunchline | null {
  if (result === null) return null;
  if (isHuhCompletedOutput(result)) {
    const observed = result.metrics[0];
    const comparison = result.metrics[1];
    if (!observed || !comparison) return null;
    return {
      badge: result.badge,
      title: "Huh moment",
      observed: metricForPunchline(observed),
      comparison: metricForPunchline(comparison),
      note: result.conclusion
    };
  }
  if (moduleId === "simpson-severity") {
    const output = result as SimpsonCompletedOutput;
    return {
      badge: "Simpson",
      title: "Huh moment",
      observed: {
        label: "Observed association",
        value: formatPercentagePoints(output.crudeDiff),
        detail: `treated ${formatPercent(output.crudeTreatedRecovery)} vs untreated ${formatPercent(output.crudeUntreatedRecovery)}`,
        numericValue: output.crudeDiff
      },
      comparison: {
        label: "DGP do difference",
        value: formatPercentagePoints(output.causalDiff),
        detail: `do(1) ${formatPercent(output.causalTreatedRecovery)} vs do(0) ${formatPercent(output.causalUntreatedRecovery)}`,
        numericValue: output.causalDiff
      },
      note: output.conclusion
    };
  }
  if (moduleId === "icu-mortality-triage") {
    const output = result as IcuCompletedOutput;
    return {
      badge: "triage",
      title: "Huh moment",
      observed: {
        label: "Observed mortality",
        value: formatPercentagePoints(output.crudeDiff),
        detail: `ICU ${formatPercent(output.crudeIcuMortality)} vs no ICU ${formatPercent(output.crudeWardMortality)}`,
        numericValue: output.crudeDiff
      },
      comparison: {
        label: "DGP do difference",
        value: formatPercentagePoints(output.causalDiff),
        detail: `do(ICU) ${formatPercent(output.causalIcuMortality)} vs do(no ICU) ${formatPercent(output.causalWardMortality)}`,
        numericValue: output.causalDiff
      },
      note: output.conclusion
    };
  }
  if (moduleId === "college-earnings") {
    const output = result as CollegeCompletedOutput;
    return {
      badge: "confounding",
      title: "Huh moment",
      observed: {
        label: "Observed premium",
        value: formatSignedValue(output.crudePremium),
        detail: `college ${formatValue(output.crudeCollegeEarnings)} vs no college ${formatValue(output.crudeNoCollegeEarnings)}`,
        numericValue: output.crudePremium
      },
      comparison: {
        label: "DGP do difference",
        value: formatSignedValue(output.causalPremium),
        detail: `do(college) ${formatValue(output.causalCollegeEarnings)} vs do(no college) ${formatValue(output.causalNoCollegeEarnings)}`,
        numericValue: output.causalPremium
      },
      note: output.conclusion
    };
  }
  if (moduleId === "tutoring-scores") {
    const output = result as TutoringCompletedOutput;
    return {
      badge: output.academicNeedAdjusted ? "adjusted" : "needs adjustment",
      title: "Huh moment",
      observed: {
        label: "Observed score difference",
        value: formatSignedValue(output.crudeGap),
        detail: `tutored ${formatValue(output.crudeTutoredScore)} vs untutored ${formatValue(output.crudeUntutoredScore)}`,
        numericValue: output.crudeGap
      },
      comparison: {
        label: "DGP do difference",
        value: formatSignedValue(output.causalGap),
        detail: `do(tutoring) ${formatValue(output.causalTutoredScore)} vs do(no tutoring) ${formatValue(output.causalUntutoredScore)}`,
        numericValue: output.causalGap
      },
      note: output.conclusion
    };
  }
  return null;
}

function isHuhCompletedOutput(value: unknown): value is HuhCompletedOutput {
  return Boolean(
    value &&
    typeof value === "object" &&
    "badge" in value &&
    "conclusion" in value &&
    "metrics" in value &&
    Array.isArray((value as { metrics?: unknown }).metrics)
  );
}

function metricForPunchline(metric: HuhMetric): BasicOutputPunchlineMetric {
  return {
    label: metric.label,
    value: metric.value,
    detail: metric.detail,
    numericValue: metric.numericValue ?? null,
    lower: metric.lower,
    upper: metric.upper
  };
}



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

function computeWhatIfAdvancedOutput(context: OutputContext, moduleId: string): WhatIfAdvancedOutput | null {
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

function survivalSummaryFromPoints(strategyId: string, label: string, points: SurvivalCurvePoint[]): WhatIfStrategySurvivalSummary {
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

function summarizeSurvival(context: OutputContext, specId: string, comparison: GMethodsComparison | null, adjustmentSpec: AdjustmentSpec | null): WhatIfSurvivalSummary | null {
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

function survivalSummaryFromResult(strategyId: string, label: string, result: OutputContext["simulation"], spec: NonNullable<OutputContext["document"]["metadata"]["longitudinal"]["survivalOutputs"][number]>): WhatIfStrategySurvivalSummary | null {
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

