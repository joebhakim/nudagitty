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
export * from "./modules/compute";
import { computeStructuralDiagnosis, computeWhatIfAdvancedOutput } from "./modules/compute";
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


