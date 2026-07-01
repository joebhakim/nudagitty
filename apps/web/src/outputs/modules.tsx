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

function renderSimpsonOutput(output: SimpsonCompletedOutput, options?: CompletedOutputRenderOptions) {
  const hideOracle = options?.hideOracle === true;
  const crudeDirection = output.crudeDiff >= 0 ? "higher" : "lower";
  const demoConclusion = `Observed treated cases have a recovery rate ${formatPercentagePointMagnitude(output.crudeDiff)} ${crudeDirection} than untreated cases in the raw comparison. Severity drives both treatment and recovery, so this demo uses the adjusted estimate as the visible repair.`;
  return (
    <CompletedOutputShell badge={output.severityAdjusted ? "Simpson ready" : "fix target"} conclusion={hideOracle ? demoConclusion : output.conclusion}>
      <div className="completed-fix-prompt">
        <strong>{output.severityAdjusted ? "Adjustment active" : "Adjustment target"}</strong>
        <span>{output.severityAdjusted ? "Severity is adjusted. The stabilized-IPW estimate and diagnostics can now appear below." : "Mark Severity as adjust for, then compare the raw relation against the adjusted estimate."}</span>
      </div>
      <div className="completed-metric-grid">
        <div>
          <span>Raw recovery difference</span>
          <strong>{formatPercentagePoints(output.crudeDiff)}</strong>
          <small>treated {formatPercent(output.crudeTreatedRecovery)} vs untreated {formatPercent(output.crudeUntreatedRecovery)}</small>
        </div>
        {!hideOracle && <div>
          <span>DGP do difference</span>
          <strong>{formatPercentagePoints(output.causalDiff)}</strong>
          <small>do(1) {formatPercent(output.causalTreatedRecovery)} vs do(0) {formatPercent(output.causalUntreatedRecovery)}</small>
        </div>}
        <div>
          <span>Severity imbalance</span>
          <strong>{formatSignedValue(output.severityDiff)}</strong>
          <small>treated mean {formatValue(output.treatedSeverity)} vs untreated {formatValue(output.untreatedSeverity)}</small>
        </div>
      </div>
      <ul className="completed-output-list">
        <li><strong>Fast visual read:</strong> {output.visualRead}</li>
        <li><strong>Backdoor:</strong> Treatment &lt;- Severity -&gt; Recovery is the reason the aggregate comparison is not decisive.</li>
        <li><strong>Adjustment set:</strong> {output.adjustmentSet}</li>
        {!hideOracle && <li><strong>Paradox check:</strong> {output.paradox}</li>}
      </ul>
    </CompletedOutputShell>
  );
}

function renderIcuOutput(output: IcuCompletedOutput) {
  return (
    <CompletedOutputShell badge="ICU ready" conclusion={output.conclusion}>
      <div className="completed-metric-grid">
        <div>
          <span>Raw mortality difference</span>
          <strong>{formatPercentagePoints(output.crudeDiff)}</strong>
          <small>ICU {formatPercent(output.crudeIcuMortality)} vs no ICU {formatPercent(output.crudeWardMortality)}</small>
        </div>
        <div>
          <span>DGP do difference</span>
          <strong>{formatPercentagePoints(output.causalDiff)}</strong>
          <small>do(ICU) {formatPercent(output.causalIcuMortality)} vs do(no ICU) {formatPercent(output.causalWardMortality)}</small>
        </div>
        <div>
          <span>Severity imbalance</span>
          <strong>{formatSignedValue(output.severityDiff)}</strong>
          <small>ICU mean {formatValue(output.icuSeverity)} vs no ICU {formatValue(output.wardSeverity)}</small>
        </div>
        <div>
          <span>Triage imbalance</span>
          <strong>{formatSignedValue(output.triageDiff)}</strong>
          <small>ICU mean {formatValue(output.icuTriage)} vs no ICU {formatValue(output.wardTriage)}</small>
        </div>
      </div>
      <ul className="completed-output-list">
        <li><strong>Fast visual read:</strong> {output.visualRead}</li>
        <li><strong>Backdoor:</strong> ICU_admission &lt;- Severity -&gt; Death is the crude-comparison problem.</li>
        <li><strong>Bad-control warning:</strong> {output.colliderWarning}</li>
        <li><strong>Adjustment set:</strong> {output.adjustmentSet}</li>
        <li><strong>Verdict:</strong> {output.verdict}</li>
      </ul>
    </CompletedOutputShell>
  );
}

function renderCollegeOutput(output: CollegeCompletedOutput) {
  return (
    <>
      <CompletedOutputShell badge="college ready" conclusion={output.conclusion}>
        <div className="completed-metric-grid">
          <div>
            <span>Raw earnings difference</span>
            <strong>{formatSignedValue(output.crudePremium)}</strong>
            <small>college {formatValue(output.crudeCollegeEarnings)} vs no college {formatValue(output.crudeNoCollegeEarnings)}</small>
          </div>
          <div>
            <span>DGP do difference</span>
            <strong>{formatSignedValue(output.causalPremium)}</strong>
            <small>do(college) {formatValue(output.causalCollegeEarnings)} vs do(no college) {formatValue(output.causalNoCollegeEarnings)}</small>
          </div>
          <div>
            <span>Income imbalance</span>
            <strong>{formatSignedValue(output.incomeDiff)}</strong>
            <small>college {formatValue(output.collegeFamilyIncome)} vs no college {formatValue(output.noCollegeFamilyIncome)}</small>
          </div>
        </div>
        <ul className="completed-output-list">
          <li><strong>Fast visual read:</strong> {output.visualRead}</li>
          <li><strong>Backdoor:</strong> College &lt;- Family_log_income -&gt; Earnings inflates the raw wage premium.</li>
          <li><strong>Adjustment set:</strong> {output.adjustmentSet}</li>
          <li><strong>Verdict:</strong> {output.verdict}</li>
          <li><strong>Binned reveal:</strong> add cutpoints in the Family_log_income adjustment tab to show per-bin college/non-college earnings strips and support warnings.</li>
        </ul>
      </CompletedOutputShell>
      {output.binnedBins.length > 0 && <CollegeBinnedAdjustmentGraph output={output} />}
    </>
  );
}

function CollegeBinnedAdjustmentGraph({ output }: { output: CollegeCompletedOutput }) {
  const [minEarnings, maxEarnings] = output.earningsDomain;
  const width = 360;
  const height = 210;
  const plot = { x: 34, y: 36, width: 304, height: 116 };
  const binWidth = plot.width / Math.max(output.binnedBins.length, 1);
  const yScale = (earnings: number) => plot.y + plot.height - ((earnings - minEarnings) / Math.max(maxEarnings - minEarnings, 1)) * plot.height;
  return (
    <div className="binned-adjustment-graph-card" aria-label="Binned adjustment graph">
      <div className="module-card-header">
        <strong>Binned earnings adjustment</strong>
        <span className="module-badge active">{output.binnedBins.length} bins</span>
      </div>
      <svg className="binned-adjustment-graph" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="College earnings by family income bin">
        <line className="binned-axis" x1={plot.x} y1={plot.y} x2={plot.x} y2={plot.y + plot.height} />
        <text className="binned-axis-label" x={plot.x - 6} y={plot.y + 4}>{formatValue(maxEarnings)}</text>
        <text className="binned-axis-label" x={plot.x - 6} y={plot.y + plot.height + 4}>{formatValue(minEarnings)}</text>
        {output.binnedBins.map((bin) => {
          const center = plot.x + binWidth * (bin.index + 0.5);
          const xNoCollege = center - Math.min(18, binWidth * 0.18);
          const xCollege = center + Math.min(18, binWidth * 0.18);
          return (
            <g className={bin.warning ? "binned-bin warning" : "binned-bin"} key={bin.index}>
              <rect className="binned-bin-band" x={plot.x + bin.index * binWidth + 2} y={plot.y} width={Math.max(3, binWidth - 4)} height={plot.height} />
              {sampleScoresForPlot(bin.noCollegeSamples).map((earnings, index) => (
                <circle className="binned-strip-point no-college" cx={xNoCollege + deterministicBinnedJitter(index, bin.index, 0)} cy={yScale(earnings)} r="2" key={`n-${index}`} />
              ))}
              {sampleScoresForPlot(bin.collegeSamples).map((earnings, index) => (
                <circle className="binned-strip-point college" cx={xCollege + deterministicBinnedJitter(index, bin.index, 1)} cy={yScale(earnings)} r="2" key={`c-${index}`} />
              ))}
              {bin.noCollegeEarnings !== null && <circle className="binned-mean no-college" cx={xNoCollege} cy={yScale(bin.noCollegeEarnings)} r="5" />}
              {bin.collegeEarnings !== null && <circle className="binned-mean college" cx={xCollege} cy={yScale(bin.collegeEarnings)} r="5" />}
              {bin.gap !== null && bin.noCollegeEarnings !== null && bin.collegeEarnings !== null && <line
                className={bin.gap >= 0 ? "binned-mean-line positive" : "binned-mean-line negative"}
                x1={xNoCollege}
                y1={yScale(bin.noCollegeEarnings)}
                x2={xCollege}
                y2={yScale(bin.collegeEarnings)}
              />}
              <text className="binned-bin-label" x={center} y={plot.y + plot.height + 16}>bin {bin.index + 1}</text>
              <text className="binned-bin-gap" x={center} y={plot.y - 9}>{bin.gap === null ? "no support" : formatSignedValue(bin.gap)}</text>
            </g>
          );
        })}
        <g className="binned-legend">
          <circle className="binned-mean no-college" cx="120" cy="14" r="4" />
          <text x="129" y="18">no college</text>
          <circle className="binned-mean college" cx="210" cy="14" r="4" />
          <text x="219" y="18">college</text>
        </g>
      </svg>
      <div className="binned-bin-table">
        {output.binnedBins.map((bin) => (
          <div className={bin.warning ? "binned-bin-summary warning" : "binned-bin-summary"} key={bin.index}>
            <strong>{bin.label}</strong>
            <span>college {formatWeightedCount(bin.collegeCount)} / no college {formatWeightedCount(bin.noCollegeCount)}</span>
            <small>{bin.warning ?? "support ok"}</small>
          </div>
        ))}
      </div>
      <div className="adjusted-pair-summary">
        <strong>binned adjusted premium {output.binnedPremium === null ? "unavailable" : formatSignedValue(output.binnedPremium)}</strong>
        <span>Weak support metric: a bin is weak if either treatment arm has weighted n &lt; 8 or less than 8% of that bin. Empty arms are no support.</span>
      </div>
    </div>
  );
}

function renderTutoringOutput(output: TutoringCompletedOutput, options?: CompletedOutputRenderOptions) {
  const hideOracle = options?.hideOracle === true;
  const rawDirection = output.crudeGap >= 0 ? "higher" : "lower";
  const demoConclusion = `Tutored students score ${formatValue(Math.abs(output.crudeGap))} points ${rawDirection} than non-tutored students in the raw comparison. Academic_need drives both tutoring and lower scores, so this demo uses the within-need adjusted comparison as the visible repair.`;
  return (
    <>
      <CompletedOutputShell badge={output.academicNeedAdjusted ? "adjusted" : "fix available"} conclusion={hideOracle ? demoConclusion : output.conclusion}>
        <div className="completed-fix-prompt">
          <strong>{output.academicNeedAdjusted ? "Adjustment active" : "Adjustment target"}</strong>
          <span>{output.academicNeedAdjusted ? "Academic_need is adjusted. The within-need pair graph is now visible below." : "Mark Academic_need as adjusted, then compare the raw relation against the adjusted estimate."}</span>
        </div>
        <div className="completed-metric-grid">
          <div>
            <span>Raw score difference</span>
            <strong>{formatSignedValue(output.crudeGap)}</strong>
            <small>tutored {formatValue(output.crudeTutoredScore)} vs not tutored {formatValue(output.crudeUntutoredScore)}</small>
          </div>
          {!hideOracle && <div>
            <span>DGP do difference</span>
            <strong>{formatSignedValue(output.causalGap)}</strong>
            <small>do(tutoring) {formatValue(output.causalTutoredScore)} vs do(no tutoring) {formatValue(output.causalUntutoredScore)}</small>
          </div>}
          <div>
            <span>Need imbalance</span>
            <strong>{formatPercentagePoints(output.needDiff)}</strong>
            <small>tutored {formatPercent(output.tutoredNeed)} vs not tutored {formatPercent(output.untutoredNeed)}</small>
          </div>
        </div>
        <ul className="completed-output-list">
          <li><strong>Fast visual read:</strong> {output.visualRead}</li>
          <li><strong>Backdoor:</strong> Tutoring &lt;- Academic_need -&gt; Test_score changes the raw score difference.</li>
          <li><strong>Adjustment set:</strong> {output.adjustmentSet}</li>
          {!hideOracle && <li><strong>Verdict:</strong> {output.verdict}</li>}
          <li><strong>Adjusted reveal plan:</strong> when Academic_need is selected as adjusted, show a second graph with two within-need treatment pairs.</li>
        </ul>
      </CompletedOutputShell>
      {output.academicNeedAdjusted && output.adjustedPairs.length > 0 && <TutoringAdjustedPairsGraph output={output} />}
    </>
  );
}

function TutoringAdjustedPairsGraph({ output }: { output: TutoringCompletedOutput }) {
  const [minScore, maxScore] = output.scoreDomain;
  const yScale = (score: number) => 150 - ((score - minScore) / Math.max(maxScore - minScore, 1)) * 106;
  const columns = output.adjustedPairs.flatMap((pair, pairIndex) => {
    const offset = pairIndex === 0 ? 0 : 166;
    return [
      { pair, treatment: "no tutoring" as const, x: 73 + offset, mean: pair.untutoredScore, samples: pair.untutoredSamples },
      { pair, treatment: "tutoring" as const, x: 125 + offset, mean: pair.tutoredScore, samples: pair.tutoredSamples }
    ];
  });
  return (
    <div className="adjusted-pair-graph-card" aria-label="Stratified adjustment graph">
      <div className="module-card-header">
        <strong>Stratified adjustment</strong>
        <span className="module-badge active">Academic_need adjusted</span>
      </div>
      <svg className="adjusted-pair-graph" viewBox="0 0 340 202" role="img" aria-label="Within academic need vertical score scatterplots">
        <line className="adjusted-pair-axis" x1="26" y1="44" x2="26" y2="150" />
        <text className="adjusted-pair-axis-label" x="22" y="48">{formatValue(maxScore)}</text>
        <text className="adjusted-pair-axis-label" x="22" y="154">{formatValue(minScore)}</text>
        {columns.map((column) => (
          <g className="adjusted-strip-column" key={`${column.pair.needValue}-${column.treatment}`}>
            <line className="adjusted-strip-guide" x1={column.x} y1="44" x2={column.x} y2="150" />
            {sampleScoresForPlot(column.samples).map((score, index) => (
              <circle
                className={column.treatment === "tutoring" ? "adjusted-strip-point treated" : "adjusted-strip-point untreated"}
                cx={column.x + deterministicStripJitter(index, column.pair.needValue, column.treatment)}
                cy={yScale(score)}
                r="2.2"
                key={`${score}-${index}`}
              />
            ))}
            <circle className={column.treatment === "tutoring" ? "adjusted-pair-mean treated" : "adjusted-pair-mean untreated"} cx={column.x} cy={yScale(column.mean)} r="5.5" />
            <text className="adjusted-pair-value" x={column.x} y={yScale(column.mean) - 8}>{formatValue(column.mean)}</text>
            <text className="adjusted-strip-treatment-label" x={column.x} y="168">{column.treatment === "tutoring" ? "tutored" : "none"}</text>
          </g>
        ))}
        {output.adjustedPairs.map((pair, index) => {
          const offset = index === 0 ? 0 : 166;
          const x0 = 73 + offset;
          const x1 = 125 + offset;
          return (
            <g className={pair.gap >= 0 ? "adjusted-pair-row positive" : "adjusted-pair-row negative"} key={pair.needValue}>
              <line className="adjusted-pair-line" x1={x0} y1={yScale(pair.untutoredScore)} x2={x1} y2={yScale(pair.tutoredScore)} />
              <text className="adjusted-pair-label" x={(x0 + x1) / 2} y="26">{pair.label}</text>
              <text className="adjusted-pair-gap" x={(x0 + x1) / 2} y="38">{formatSignedValue(pair.gap)}</text>
            </g>
          );
        })}
        <g className="adjusted-pair-legend">
          <circle className="adjusted-pair-mean untreated" cx="100" cy="193" r="4" />
          <text x="109" y="197">no tutoring</text>
          <circle className="adjusted-pair-mean treated" cx="195" cy="193" r="4" />
          <text x="204" y="197">tutoring</text>
        </g>
      </svg>
      <div className="adjusted-pair-summary">
        <strong>weighted adjusted difference {output.adjustedPairGap === null ? "unavailable" : formatSignedValue(output.adjustedPairGap)}</strong>
        <span>Two exact pairs are possible here because Academic_need is binary. Continuous confounders need bins, local matching neighborhoods, or model-based standardization instead of a literal two-row graph.</span>
      </div>
    </div>
  );
}

function renderHuhOutput(output: HuhCompletedOutput) {
  return (
    <CompletedOutputShell badge={output.badge} conclusion={output.conclusion}>
      {output.shift && <HuhShiftPlot shift={output.shift} />}
      {output.metrics.length > 0 && (
        <div className="completed-metric-grid">
          {output.metrics.map((metric) => (
            <div key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </div>
          ))}
        </div>
      )}
      {output.bulletsAsBoxes
        ? output.bullets.map((bullet) => (
            <details className="output-box" key={bullet.label} open>
              <summary><strong>{bullet.label}</strong></summary>
              <div className="completed-output-body"><p>{bullet.text}</p></div>
            </details>
          ))
        : (
          <ul className="completed-output-list">
            {output.bullets.map((bullet) => (
              <li key={bullet.label}><strong>{bullet.label}:</strong> {bullet.text}</li>
            ))}
          </ul>
        )}
    </CompletedOutputShell>
  );
}

// The Estimand + Structure cards from the generic structural diagnosis, rendered ALONGSIDE a dedicated
// module's output so every adjustment/selection example surfaces its target estimand (not just the
// generic-fallback ones). Reuses computeStructuralDiagnosis so the wording stays in one place.
export function AuxEstimandStructure({ diagnosis }: { diagnosis: HuhCompletedOutput | null }) {
  const cards = (diagnosis?.bullets ?? []).filter((bullet) => bullet.label === "Estimand" || bullet.label === "Structure");
  if (cards.length === 0) return null;
  return (
    <HighlightNames>
      {cards.map((bullet) => (
        <details className="output-box" key={bullet.label} open>
          <summary><strong>{bullet.label}</strong></summary>
          <div className="completed-output-body"><p className="completed-conclusion">{bullet.text}</p></div>
        </details>
      ))}
    </HighlightNames>
  );
}

function renderWhatIfAdvancedOutput(output: WhatIfAdvancedOutput) {
  return <WhatIfAdvancedOutputView output={output} />;
}

function WhatIfAdvancedOutputView({ output }: { output: WhatIfAdvancedOutput }) {
  const comparison = output.comparison;
  const methodsOpen = output.view === "g_estimation" || output.view === "ipcw";
  // The primary-method selection is owned here so the metric tile, the survival curve,
  // and the methods table all reflect the SAME chosen estimator.
  const [primaryId, setPrimaryId] = useState<GMethodEstimate["id"]>(() => comparison ? defaultPrimaryMethod(comparison) : "naive");
  const primary = comparison?.estimates.find((estimate) => estimate.id === primaryId && estimate.estimate !== null)
    ?? comparison?.estimates.find((estimate) => estimate.estimate !== null)
    ?? null;
  return (
    <CompletedOutputShell badge={output.badge} title={output.title} conclusion={output.conclusion}>
      {comparison && (
        <details className="output-box" open>
          <summary><strong>Observed vs re-simulated</strong><span>the crude data and the re-simulated oracle, by arm</span></summary>
          <div className="what-if-effect-graph">
            <EffectByArmGraph comparison={comparison} outcomeScale={output.outcomeScale} selectedId={primaryId} show={["observed", "truth"]} />
          </div>
        </details>
      )}
      <WhatIfMetricGrid output={output} primary={primary} />
      {output.survival && (output.view === "survival" || output.view === "survival_time") && (
        <WhatIfStrategySurvivalCurve summary={output.survival} survivalTime={output.view === "survival_time"} denominatorsOpen={output.denominatorsOpen} methodId={primary?.id} methodLabel={primary?.label} />
      )}
      {comparison && output.view === "dynamic" && <WhatIfDynamicSupport comparison={comparison} />}
      {comparison && <MethodsComparisonPanel comparison={comparison} outcomeScale={output.outcomeScale} outcomeUnit={output.outcomeUnit} defaultOpen={methodsOpen} primaryId={primaryId} onPrimaryChange={setPrimaryId} />}
      {comparison && (
        <div className="what-if-strategy-grid">
          {comparison.strategies.map((strategy) => (
            <div key={strategy.id}>
              <strong>{strategy.label}</strong>
              <span>{strategy.description}</span>
            </div>
          ))}
        </div>
      )}
      <details className="what-if-info">
        <summary>Source and diagnostics</summary>
        <div>
          <p>{output.source} {output.sourceDetail} This app uses rewritten explanations and a simulated DGP, not the book tables.</p>
          {output.sourceUrl && <a href={output.sourceUrl} target="_blank" rel="noreferrer">Open source page</a>}
          <ul>
            {comparison && <li>Time order: {[...comparison.treatmentVariables, ...comparison.timeVaryingCovariates, comparison.outcome].filter(Boolean).join(" -> ")}.</li>}
            <li>Strategy-standardized estimates are displayed as the primary read; observed-history rows are diagnostics.</li>
            <li>{comparison && comparison.diagnostics.length > 0 ? comparison.diagnostics.join(" ") : "Longitudinal metadata validates cleanly."}</li>
          </ul>
        </div>
      </details>
    </CompletedOutputShell>
  );
}

// Plain-language + formula for each g-method row, so the table isn't just labels.
const METHOD_GLOSSARY: Record<GMethodEstimate["id"], { plain: string; formula: string }> = {
  naive: {
    plain: "The raw crude contrast — the outcome by the treatment people actually took. This is exactly the observed-relation plot above; it ignores both confounding and censoring.",
    formula: "E[ Y | A = a ]"
  },
  stratified: {
    plain: "Averages the outcome inside confounder strata, then re-weights those strata to the whole population. Unbiased only if every confounder is in L (and the bins are fine enough).",
    formula: "Σ_l  E[ Y | A = a, L = l ] · P(L = l)"
  },
  g_formula: {
    plain: "Re-simulates the whole population under each complete strategy from the fitted model. With the true model this is the oracle effect.",
    formula: "E[ Y | do(A = a) ]   (sequential over time for time-varying A)"
  },
  ipw: {
    plain: "Re-weights each person by the inverse probability of their own treatment (and of staying uncensored), building a pseudo-population where treatment is independent of the measured confounders.",
    formula: "E[ Y · 1(A = a) / P(A = a | L) ]   (stabilized; × censoring weights for IPCW)"
  },
  g_estimation: {
    plain: "Backs out the additive per-step treatment effect (the 'blip') by finding the value that makes the treatment-removed outcome independent of treatment given history.",
    formula: "U(ψ) = Y − ψ·A ;  solve  E[ (A − E[A | L]) · U(ψ) ] = 0"
  },
  outcome_regression: {
    plain: "Fits a parametric model of the outcome on treatment and confounders, then predicts everyone under each strategy and averages. Unbiased only if that functional form is right — real non-linearity biases it even where standardization holds.",
    formula: "Σ_i  m̂(a, L_i) / n,   m̂ = fitted E[ Y | A, L ]"
  },
  matching: {
    plain: "Pairs each treated unit with the nearest untreated unit on the estimated propensity score, then averages the within-pair outcome gap. Approximates a randomized comparison among comparable units.",
    formula: "1:1 NN on ê(L) = P(A = 1 | L);  mean over matched pairs of  Y_treated − Y_control"
  },
  aipw: {
    plain: "Combines the outcome model with inverse-propensity weighting so it stays correct if EITHER model is right (doubly robust).",
    formula: "E[ m̂(a, L) + 1(A = a)/ê · (Y − m̂(a, L)) ]"
  }
};

// The canonical adjustment readout — the g-method estimator table + the glossary.
// Used identically for every example (classic or longitudinal) so the same operation
// always renders the same panel.
// Default primary method: prefer the doubly-robust / workhorse estimators that are
// honest without the oracle, before falling back to whatever has a value.
const PRIMARY_METHOD_PREFERENCE: GMethodEstimate["id"][] = ["aipw", "ipw", "stratified", "outcome_regression", "matching", "g_estimation", "g_formula", "naive"];

export function defaultPrimaryMethod(comparison: GMethodsComparison): GMethodEstimate["id"] {
  const available = comparison.estimates.filter((estimate) => estimate.estimate !== null);
  return PRIMARY_METHOD_PREFERENCE.find((id) => available.some((estimate) => estimate.id === id)) ?? available[0]?.id ?? "naive";
}

// The effect graph (redesign step 2): the REAL CategoryOutcomePlot, fed the observed (naïve) arms
// as its base summaries, with the oracle (truth) and the selected method overlaid as point+CI
// series — observed + every method's estimate in one chart, slope = the effect.
// A y-scale shared across small-multiple facets so they're directly comparable. Continuous: span the
// summary means/CIs plus the central bulk of the points (1st–99th percentile), so a heavy tail in one
// facet can't blow up the common scale. Binary: a shared rate band cropped to where the proportions/CIs
// live, clamped to [0,1]. Pair with the chart's `clampToDomain` so it honours this instead of auto-fitting.
function sharedFacetYDomain(facets: Array<{ points: ScatterPoint[]; summaries: CategoryOutcomeSummary[] }>, binary: boolean): [number, number] {
  const finite = (vs: Array<number | null>) => vs.filter((v): v is number => v !== null && Number.isFinite(v));
  const rates = finite(facets.flatMap((f) => f.summaries.flatMap((s) => [s.mean, s.lower, s.upper])));
  if (binary) {
    if (!rates.length) return [0, 1];
    const lo = Math.min(...rates), hi = Math.max(...rates);
    const pad = Math.max((hi - lo) * 0.14, 0.01);
    return [Math.max(0, lo - pad), Math.min(1, hi + pad)];
  }
  const allPointYs = facets.flatMap((f) => f.points.map((p) => p.y)).filter(Number.isFinite).sort((a, b) => a - b);
  const pctl = (q: number): number | null => allPointYs.length ? allPointYs[Math.min(allPointYs.length - 1, Math.max(0, Math.round(q * (allPointYs.length - 1))))]! : null;
  const lo = Math.min(...(rates.length ? rates : [0]), pctl(0.01) ?? 0);
  const hi = Math.max(...(rates.length ? rates : [1]), pctl(0.99) ?? 1);
  const pad = Math.max((hi - lo) * 0.08, 1e-6);
  return [lo - pad, hi + pad];
}

function EffectByArmGraph(props: { comparison: GMethodsComparison; outcomeScale: "risk" | "mean"; selectedId: GMethodEstimate["id"]; points?: ScatterPoint[]; treatmentId?: string; show?: Array<"observed" | "truth" | "selected"> }) {
  const { comparison } = props;
  const binary = (props.outcomeScale ?? "risk") === "risk";
  const find = (id: GMethodEstimate["id"]) => comparison.estimates.find((e) => e.id === id);
  const naive = find("naive");
  if (!naive) return null;
  const points = props.points ?? [];
  const xLabel = props.treatmentId ?? comparison.treatmentVariables[0] ?? "treatment";
  // Base series = the observed individual points (continuous → swarm w/ alpha; binary → proportion),
  // via the same summary builders the scatter view uses (so the node-styled group labels match).
  const armN = (arm: { effectiveSampleSize: number | null; sampleSize: number }) => arm.effectiveSampleSize ?? arm.sampleSize;
  const summaries = points.length > 0
    ? (binary ? binaryOutcomeSummaries(points, xLabel) : continuousOutcomeSummaries(points, xLabel))
    : ([0, 1] as const).map((group) => {
        const arm = naive.arms[group]!;
        const ci = binary && arm.mean !== null ? wilsonInterval(arm.mean, armN(arm)) : { lower: null, upper: null };
        return { group, tone: (group === 0 ? "treated" : "untreated") as "treated" | "untreated", label: comparison.strategies[group]!.label, mean: arm.mean, lower: ci.lower, upper: ci.upper, nEff: arm.effectiveSampleSize, points: [] };
      });
  // Within-arm outcome SD (from the observed points) → approximate CI for the method overlays on the
  // continuous scale (the arm summaries don't carry an SD); Wilson on the binary scale.
  const armSd = ([0, 1] as const).map((g) => {
    const ys = points.filter((p) => Math.round(p.x) === g).map((p) => p.y);
    if (ys.length < 2) return 0;
    const m = ys.reduce((a, b) => a + b, 0) / ys.length;
    return Math.sqrt(ys.reduce((a, b) => a + (b - m) ** 2, 0) / (ys.length - 1));
  });
  const ciFor = (mean: number | null, n: number | null, group: 0 | 1): { lower: number | null; upper: number | null } => {
    if (mean === null || !n || n <= 0) return { lower: null, upper: null };
    if (binary) return wilsonInterval(mean, n);
    const se = (armSd[group] ?? 0) / Math.sqrt(n);
    return se > 0 ? { lower: mean - 1.96 * se, upper: mean + 1.96 * se } : { lower: null, upper: null };
  };
  // One FACET per series (observed / truth / selected) — each a real chart of the same treatment
  // contrast — instead of overlaying them at the two x-positions (which read as a confusing repeat
  // of treatment=0/1). Observed carries the swarm; truth/selected show the estimate means + CI. The
  // labels are shared so the facets line up.
  const labelFor = (group: 0 | 1) => summaries.find((s) => s.group === group)?.label ?? `${xLabel}=${group}`;
  // Arms are ordered by STRATEGY (often treated-first), not by treatment value — so map each arm to
  // the group of its assigned treatment value, or the swarm facet and the estimate facets disagree.
  const armGroup = (i: 0 | 1): 0 | 1 => {
    const assignment = comparison.strategies[i]?.assignments.find((a) => a.variable === xLabel);
    return assignment && assignment.value >= 0.5 ? 1 : 0;
  };
  const estimateSummaries = (estimate: GMethodEstimate) => ([0, 1] as const).map((i) => {
    const arm = estimate.arms[i]!;
    const group = armGroup(i);
    const { lower, upper } = ciFor(arm.mean, armN(arm), group);
    return { group, tone: (group === 1 ? "treated" : "untreated") as "treated" | "untreated", label: labelFor(group), mean: arm.mean, lower, upper, nEff: arm.effectiveSampleSize, points: [] as ScatterPoint[] };
  });
  const oracle = find("g_formula");
  const selected = props.selectedId !== "naive" ? find(props.selectedId) : null;
  // The method's per-unit cloud — re-simulated counterfactuals for the oracle, parametric
  // predictions for outcome-regression/AIPW, reweighted observations for IPW — placed under the
  // treatment group its arm assigns, so the truth/selected facets show individuals too (not just a
  // summary). Continuous only; the binary view shows proportions, where a swarm isn't drawn.
  const armScatter = (estimate: GMethodEstimate): ScatterPoint[] => {
    const out: ScatterPoint[] = [];
    let idx = 0;
    ([0, 1] as const).forEach((i) => {
      const group = armGroup(i);
      for (const p of estimate.arms[i]?.points ?? []) {
        if (!Number.isFinite(p.y)) continue;
        out.push({ x: group, y: p.y, weight: Number.isFinite(p.weight) && p.weight > 0 ? p.weight : 1, index: idx++ });
      }
    });
    return out;
  };
  type Facet = { id: string; title: string; color: string; effect: number | null; points: ScatterPoint[]; summaries: CategoryOutcomeSummary[] };
  const facetFor = (id: string, title: string, color: string, estimate: GMethodEstimate): Facet => {
    if (!binary) {
      const pts = armScatter(estimate);
      // Derive the swarm + mean + CI from the method's own points, so all three are mutually
      // consistent and the facet shares the labelling the observed facet uses.
      if (pts.length > 0) return { id, title, color, effect: estimate.estimate, points: pts, summaries: continuousOutcomeSummaries(pts, xLabel) };
    }
    return { id, title, color, effect: estimate.estimate, points: [], summaries: estimateSummaries(estimate) };
  };
  const facets: Facet[] = [
    { id: "observed", title: "observed", color: SERIES_COLORS.observed, effect: naive.estimate, points, summaries },
    ...(oracle ? [facetFor("truth", "re-simulated oracle", SERIES_COLORS.truth, oracle)] : []),
    ...(selected && selected.id !== "g_formula" && selected.id !== "naive" ? [facetFor("selected", selected.label, SERIES_COLORS.chosen, selected)] : [])
  ].filter((facet) => !props.show || props.show.includes(facet.id as "observed" | "truth" | "selected"));
  if (facets.length === 0) return null;
  // Shared y-scale across facets so the charts are directly comparable (a -21pp drop must look bigger
  // than a -8pp one).
  const yDomain = sharedFacetYDomain(facets, binary);
  return (
    <div className="effect-facet-row">
      {facets.map((f) => (
        <div className="effect-facet" key={f.id}>
          <div className="effect-facet-head"><strong style={{ color: f.color }}>{f.title}</strong><span>{formatOutcomeDifference(f.effect, props.outcomeScale, "")}</span></div>
          <div className="effect-facet-formula"><code>{f.id === "observed" ? "E[Y | X]" : "E[Y | do(X)]"}</code></div>
          <div className="effect-facet-body">
            <CategoryOutcomePlot compact points={f.points} summaries={f.summaries} xLabel={xLabel} yLabel={comparison.outcome} yDomain={yDomain} clampToDomain seriesColor={f.color} outcomeKind={binary ? "binary" : "continuous"} />
          </div>
        </div>
      ))}
    </div>
  );
}

export const MethodsComparisonPanel = memo(function MethodsComparisonPanel(props: { comparison: GMethodsComparison; outcomeScale: "risk" | "mean"; outcomeUnit: string; defaultOpen?: boolean; primaryId?: GMethodEstimate["id"]; onPrimaryChange?: (id: GMethodEstimate["id"]) => void; basis?: CovariateBasis; onBasisChange?: (basis: CovariateBasis) => void; points?: ScatterPoint[]; treatmentId?: string }) {
  const { comparison, outcomeScale, outcomeUnit } = props;
  // Units go in the column headers, not redundantly in every cell (risk shows % inline, so no
  // suffix there).
  const unitSuffix = outcomeScale === "mean" && outcomeUnit ? ` (${outcomeUnit})` : "";
  const available = comparison.estimates.filter((estimate) => estimate.estimate !== null);
  // Controlled (parent owns the selection, so the metric tile + curve stay in sync) or
  // self-managed (classic examples that render the panel standalone).
  const [internalPrimary, setInternalPrimary] = useState<GMethodEstimate["id"]>(() => defaultPrimaryMethod(comparison));
  const primaryId = props.primaryId ?? internalPrimary;
  const setPrimaryId = props.onPrimaryChange ?? setInternalPrimary;
  const primary = comparison.estimates.find((estimate) => estimate.id === primaryId && estimate.estimate !== null) ?? available[0] ?? null;
  // Per-method expandable detail (the redesign): each row opens to its plain explanation, the
  // variables it uses, its formula, and a slot for the prediction/performance viz (step 3).
  const [openId, setOpenId] = useState<GMethodEstimate["id"] | null>(null);
  // The chosen method's own graph belongs in this panel — but only when it's a from-data estimator;
  // when the chosen method IS the naive/oracle, that graph already lives in the observed/re-simulated panel.
  const showChosenGraph = primary !== null && primary.id !== "naive" && primary.id !== "g_formula";
  return (
    <details className="output-box adjustment-methods-panel" open>
      <summary><strong>Adjustment methods</strong><span>the chosen estimator's adjusted effect, and how every method gets there</span></summary>
      {showChosenGraph && (
        <div className="what-if-effect-graph">
          <EffectByArmGraph comparison={comparison} outcomeScale={outcomeScale} selectedId={primary!.id} points={props.points} treatmentId={props.treatmentId} show={["selected"]} />
        </div>
      )}
      {primary && (
        <div className="methods-primary">
          <div className="methods-primary-controls">
            <label htmlFor="primary-method-select">Primary method</label>
            <select
              id="primary-method-select"
              className="methods-primary-select"
              value={primary.id}
              onChange={(event) => setPrimaryId(event.target.value as GMethodEstimate["id"])}
            >
              {comparison.estimates.map((estimate) => (
                <option key={estimate.id} value={estimate.id} disabled={estimate.estimate === null}>
                  {estimate.label}{estimate.estimate === null ? " — n/a" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="methods-primary-headline">
            <strong className={estimateToneClass(primary.estimate)}>{formatOutcomeDifference(primary.estimate, outcomeScale, outcomeUnit)}</strong>
            <span>{comparison.strategies[0].label} vs {comparison.strategies[1].label}</span>
          </div>
          <p className="methods-primary-plain">{METHOD_GLOSSARY[primary.id].plain}</p>
        </div>
      )}
      <details className="output-box what-if-method-table-card nested-method-table" open={props.defaultOpen}>
        <summary>
          <strong>Compare all methods</strong>
          <span>every estimator + how it gets there · {formatWeightedCount(comparison.cohort.sampleSize)} rows</span>
        </summary>
        <table className="what-if-method-table">
          <thead>
            <tr>
              <th>Method</th>
              <th>{comparison.strategies[0].label}{unitSuffix}</th>
              <th>{comparison.strategies[1].label}{unitSuffix}</th>
              <th>Difference{unitSuffix}</th>
            </tr>
          </thead>
          <tbody>
            {comparison.estimates.map((estimate) => {
              // g_formula here is the re-simulation of the model we built — the constructed TRUTH
              // (oracle), not a from-data estimator. Set it apart so it's never read as "the one
              // estimator that happened to work."
              const isOracle = estimate.id === "g_formula";
              const open = openId === estimate.id;
              const glossary = METHOD_GLOSSARY[estimate.id];
              // Default subtitle is the estimand FORMULA; the prose explanation lives in the row's
              // expansion below (open the row to read it).
              const formula = glossary?.formula ?? null;
              const uses = estimate.id === "naive" ? "nothing — the crude contrast"
                : comparison.timeVaryingCovariates.length > 0 ? comparison.timeVaryingCovariates.join(", ")
                : "—";
              const rowClass = [isOracle ? "method-row-oracle" : "", estimate.id === primary?.id ? "method-row-primary" : "", "what-if-method-row", open ? "is-open" : ""].filter(Boolean).join(" ");
              return (
              <Fragment key={estimate.id}>
                <tr className={rowClass} onClick={() => setOpenId(open ? null : estimate.id)}>
                  <td>
                    <strong>{open ? "▾ " : "▸ "}{isOracle ? "True effect — g-formula (oracle)" : estimate.label}{estimate.id === primary?.id ? " ◄" : ""}</strong>
                    <small className="method-row-formula">{formula ? <code>{formula}</code> : (estimate.diagnostics[0] ?? "")}</small>
                  </td>
                  <td>{formatOutcomeValue(estimate.arms[0].mean, outcomeScale, "")}</td>
                  <td>{formatOutcomeValue(estimate.arms[1].mean, outcomeScale, "")}</td>
                  <td className={estimateToneClass(estimate.estimate)}>{formatOutcomeDifference(estimate.estimate, outcomeScale, "")}</td>
                </tr>
                {open && glossary && (
                  <tr className="what-if-method-detail">
                    <td colSpan={4}>
                      <p>{glossary.plain}</p>
                      <dl>
                        <div><dt>uses</dt><dd>{uses}</dd></div>
                        <div><dt>formula</dt><dd><code>{glossary.formula}</code></dd></div>
                      </dl>
                      <p className="what-if-method-detail-pending">Prediction / performance view — coming with the estimator internals.</p>
                    </td>
                  </tr>
                )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </details>
      {props.onBasisChange && (
        <div className="methods-estimator-settings">
          <label htmlFor="covariate-basis-select" title="How flexibly continuous confounders enter the parametric estimators (outcome regression, AIPW). Higher degree = more flexible.">Estimator setting — confounder basis</label>
          <select
            id="covariate-basis-select"
            className="methods-primary-select"
            value={props.basis ?? "linear"}
            onChange={(event) => props.onBasisChange!(event.target.value as CovariateBasis)}
          >
            <option value="linear">Linear</option>
            <option value="quadratic">Quadratic (+ L²)</option>
            <option value="cubic">Cubic (+ L³)</option>
          </select>
        </div>
      )}
    </details>
  );
});

// Shared readout used by the classic (non-what-if) adjustment output: the effect graph + the
// methods table, with one selected method linking the two. (The what-if path composes the same
// pieces inline.) This is how the redesign reaches every adjustment example, not just what-if.
export function UnifiedAdjustmentReadout(props: { comparison: GMethodsComparison; outcomeScale: "risk" | "mean"; outcomeUnit: string; points?: ScatterPoint[]; treatmentId?: string; basis?: CovariateBasis; onBasisChange?: (basis: CovariateBasis) => void }) {
  const [primaryId, setPrimaryId] = useState<GMethodEstimate["id"]>(() => defaultPrimaryMethod(props.comparison));
  return (
    <>
      <details className="output-box" open>
        <summary><strong>Observed vs re-simulated</strong><span>the crude data and the re-simulated oracle, by treatment arm</span></summary>
        <div className="what-if-effect-graph">
          <EffectByArmGraph comparison={props.comparison} outcomeScale={props.outcomeScale} selectedId={primaryId} points={props.points} treatmentId={props.treatmentId} show={["observed", "truth"]} />
        </div>
      </details>
      <MethodsComparisonPanel comparison={props.comparison} outcomeScale={props.outcomeScale} outcomeUnit={props.outcomeUnit} defaultOpen primaryId={primaryId} onPrimaryChange={setPrimaryId} basis={props.basis} onBasisChange={props.onBasisChange} points={props.points} treatmentId={props.treatmentId} />
    </>
  );
}

function WhatIfMethodGlossary(props: { comparison: GMethodsComparison }) {
  return (
    <details className="what-if-method-glossary">
      <summary>How to read these methods</summary>
      <dl>
        {props.comparison.estimates.map((estimate) => {
          const entry = METHOD_GLOSSARY[estimate.id];
          if (!entry) return null;
          return (
            <div key={estimate.id}>
              <dt>{estimate.label}</dt>
              <dd>
                <p>{entry.plain}</p>
                <code className="what-if-method-formula">{entry.formula}</code>
              </dd>
            </div>
          );
        })}
        <div>
          <dt>Confidence band (Greenwood)</dt>
          <dd>
            <p>The shaded ribbon around a survival curve is a pointwise 95% confidence interval. Greenwood&rsquo;s formula gives the standard error of a Kaplan-Meier survival estimate at each follow-up time, and the band is &plusmn;1.96&middot;SE &mdash; it widens as the at-risk set shrinks, and is tight here because the simulated cohort is large.</p>
            <code className="what-if-method-formula">Var(S&#770;(t)) = S&#770;(t)&sup2; &middot; &Sigma; d&#7522; / (n&#7522; (n&#7522; &minus; d&#7522;))</code>
          </dd>
        </div>
      </dl>
      <p className="what-if-method-glossary-note">
        g-formula is the do()-resimulated oracle here. The others estimate the same effect from the observed
        cohort — they agree with the oracle when the confounders are correctly adjusted, and reveal bias when
        they don&rsquo;t.
      </p>
    </details>
  );
}

function WhatIfMetricGrid(props: { output: WhatIfAdvancedOutput; primary?: GMethodEstimate | null }) {
  const comparison = props.output.comparison;
  const gFormula = comparison?.estimates.find((estimate) => estimate.id === "g_formula");
  const ipw = comparison?.estimates.find((estimate) => estimate.id === "ipw");
  const naive = comparison?.estimates.find((estimate) => estimate.id === "naive");
  const gEstimation = comparison?.estimates.find((estimate) => estimate.id === "g_estimation");
  const survival = props.output.survival;
  const support = comparison ? minimumObservedSupport(comparison) : null;
  if (!comparison && !survival) return null;
  // The headline tile shows the SELECTED primary method's final-interval risk difference,
  // so it always matches the table row + curve. Falls back to the survival summary.
  const headline = props.primary?.estimate ?? survival?.riskDifference ?? null;
  if (props.output.view === "survival" && survival) {
    return (
      <div className="completed-metric-grid what-if-metrics">
        <div>
          <span>Risk difference</span>
          <strong className={estimateToneClass(headline)}>{formatOutcomeDifference(headline, "risk", "")}</strong>
          <small>{props.primary ? `${props.primary.label}` : comparison ? `${comparison.strategies[0].label} vs ${comparison.strategies[1].label}` : survival.label}</small>
        </div>
        <div>
          <span>Final survival difference</span>
          <strong>{formatOutcomeDifference(survival.survivalDifference, "risk", "")}</strong>
          <small>Kaplan-Meier style product over intervals</small>
        </div>
        <div>
          <span>Events / censored</span>
          <strong>{formatSurvivalEvents(survival)}</strong>
          <small>by strategy, at plotted follow-up</small>
        </div>
      </div>
    );
  }
  if (props.output.view === "survival_time") {
    return (
      <div className="completed-metric-grid what-if-metrics">
        <div>
          <span>Failure-time contrast</span>
          <strong>{formatOutcomeDifference(gFormula?.estimate ?? null, props.output.outcomeScale, props.output.outcomeUnit)}</strong>
          <small>{comparison ? `${comparison.strategies[0].label} vs ${comparison.strategies[1].label}` : "strategy contrast"}</small>
        </div>
        <div>
          <span>Observed death risk diff</span>
          <strong>{formatOutcomeDifference(survival?.riskDifference ?? null, "risk", "")}</strong>
          <small>secondary survival diagnostic</small>
        </div>
        <div>
          <span>IPW support</span>
          <strong>{formatEss(ipw)}</strong>
          <small>minimum arm effective sample size</small>
        </div>
      </div>
    );
  }
  if (props.output.view === "dynamic") {
    return (
      <div className="completed-metric-grid what-if-metrics">
        <div>
          <span>Sequential g-formula</span>
          <strong>{formatOutcomeDifference(gFormula?.estimate ?? null, props.output.outcomeScale, props.output.outcomeUnit)}</strong>
          <small>{comparison ? `${comparison.strategies[0].label} vs ${comparison.strategies[1].label}` : "strategy contrast"}</small>
        </div>
        <div>
          <span>Observed rule support</span>
          <strong>{support === null ? "NA" : formatPercent(support)}</strong>
          <small>lowest observed match share across visits</small>
        </div>
        <div>
          <span>IPW support</span>
          <strong>{formatEss(ipw)}</strong>
          <small>minimum arm effective sample size</small>
        </div>
      </div>
    );
  }
  if (props.output.view === "g_estimation") {
    return (
      <div className="completed-metric-grid what-if-metrics">
        <div>
          <span>Additive g-estimation</span>
          <strong>{formatOutcomeDifference(gEstimation?.estimate ?? null, props.output.outcomeScale, props.output.outcomeUnit)}</strong>
          <small>{gEstimation?.diagnostics[0] ?? "structural nested blip read"}</small>
        </div>
        <div>
          <span>Parametric g-formula</span>
          <strong>{formatOutcomeDifference(gFormula?.estimate ?? null, props.output.outcomeScale, props.output.outcomeUnit)}</strong>
          <small>strategy simulation comparison</small>
        </div>
        <div>
          <span>Observed regimen read</span>
          <strong>{formatOutcomeDifference(naive?.estimate ?? null, props.output.outcomeScale, props.output.outcomeUnit)}</strong>
          <small>diagnostic, not the target estimand</small>
        </div>
      </div>
    );
  }
  if (props.output.view === "ipcw") {
    return (
      <div className="completed-metric-grid what-if-metrics">
        <div>
          <span>Stabilized IPW/IPCW</span>
          <strong>{formatOutcomeDifference(ipw?.estimate ?? null, props.output.outcomeScale, props.output.outcomeUnit)}</strong>
          <small>weights treatment and remaining uncensored</small>
        </div>
        <div>
          <span>Sequential g-formula</span>
          <strong>{formatOutcomeDifference(gFormula?.estimate ?? null, props.output.outcomeScale, props.output.outcomeUnit)}</strong>
          <small>strategy simulation comparison</small>
        </div>
        <div>
          <span>Support ESS</span>
          <strong>{formatEss(ipw)}</strong>
          <small>minimum weighted arm size</small>
        </div>
      </div>
    );
  }
  return (
    <div className="completed-metric-grid what-if-metrics">
      {comparison && (
        <>
          <div>
            <span>Strategy contrast</span>
            <strong>{formatOutcomeDifference(gFormula?.estimate ?? null, props.output.outcomeScale, props.output.outcomeUnit)}</strong>
            <small>{comparison.strategies[0].label} vs {comparison.strategies[1].label}</small>
          </div>
          <div>
            <span>Observed regimen read</span>
            <strong>{formatOutcomeDifference(naive?.estimate ?? null, props.output.outcomeScale, props.output.outcomeUnit)}</strong>
            <small>conditions on matching observed histories</small>
          </div>
          <div>
            <span>IPW support</span>
            <strong>{formatEss(ipw)}</strong>
            <small>minimum arm effective sample size</small>
          </div>
        </>
      )}
    </div>
  );
}

const SURVIVAL_CURVE_NOTE: Partial<Record<GMethodEstimate["id"], string>> = {
  g_formula: "g-formula counterfactual: the model is re-simulated with everyone assigned each strategy, not the observed sub-group.",
  naive: "Crude Kaplan-Meier among each strategy's observed followers — confounded, and the curves match the naive table row.",
  ipw: "IPCW-weighted Kaplan-Meier: each follower is re-weighted by the inverse probability of their own treatment and of staying uncensored."
};

// For a survival what-if example, the data needed to render the OBSERVED (crude/naive)
// survival curves in the observed-association card — the same component the adjusted card
// uses, just pinned to the naive method.
export function observedSurvivalView(completedOutput: ComputedCompletedOutput | null): { summary: WhatIfSurvivalSummary; survivalTime: boolean } | null {
  if (!completedOutput || !completedOutput.moduleId.startsWith("what-if-")) return null;
  const result = completedOutput.result as WhatIfAdvancedOutput | null;
  if (!result || !result.survival || (result.view !== "survival" && result.view !== "survival_time")) return null;
  return { summary: result.survival, survivalTime: result.view === "survival_time" };
}

export const WhatIfStrategySurvivalCurve = memo(function WhatIfStrategySurvivalCurve(props: { summary: WhatIfSurvivalSummary; survivalTime: boolean; denominatorsOpen: boolean; methodId?: GMethodEstimate["id"]; methodLabel?: string }) {
  const width = 340;
  const methodCurves = props.methodId ? props.summary.curvesByMethod[props.methodId] : undefined;
  const usingFallback = Boolean(props.methodId) && !methodCurves;
  const baseSeries = methodCurves ?? props.summary.strategies;
  const series = baseSeries.length > 0 ? baseSeries : props.summary.natural ? [props.summary.natural] : [];
  if (series.length === 0) return null;
  const note = (props.methodId && SURVIVAL_CURVE_NOTE[props.methodId])
    ? SURVIVAL_CURVE_NOTE[props.methodId]!
    : usingFallback
      ? `${props.methodLabel ?? "This method"} is a point estimate; the trajectory shown is the g-formula counterfactual.`
      : SURVIVAL_CURVE_NOTE.g_formula!;
  const pointCount = Math.max(...series.map((entry) => entry.points.length));
  const frame = chartFrame({ width, height: 162, x: { ticks: true, title: true }, y: { ticks: true, title: true }, yDomain: [0, 1], insetX: 12, insetY: 6 });
  const { plot, anchors } = frame;
  const x = (index: number) => plot.x + (pointCount <= 1 ? plot.width / 2 : (index / (pointCount - 1)) * plot.width);
  const y = frame.yScale;
  const yTicks = [0, 0.5, 1];
  const path = (entry: WhatIfStrategySurvivalSummary) => entry.points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.survival)}`).join(" ");
  // Greenwood 95% band: upper edge forward, lower edge back, closed.
  const bandPath = (entry: WhatIfStrategySurvivalSummary) => {
    const upper = entry.points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.survivalHi)}`).join(" ");
    const lower = entry.points.map((point, index) => ({ index, point })).reverse().map(({ index, point }) => `L ${x(index)} ${y(point.survivalLo)}`).join(" ");
    return `${upper} ${lower} Z`;
  };
  return (
    <div className="what-if-survival-card">
      <div className="module-card-header">
        <strong>{props.survivalTime ? "Observed-death survival by strategy" : "Survival curves by strategy"}</strong>
        <span>{props.methodLabel ?? props.summary.label}</span>
      </div>
      <p className="what-if-survival-method">{note} Shaded band: pointwise 95% CI (Greenwood) — tight here because the simulated cohort is large. The natural-course line below is the observed cohort for reference.</p>
      <svg className="what-if-survival-plot" viewBox={`0 0 ${width} ${frame.height}`} role="img" aria-label={`${props.summary.label} survival curves by strategy`}>
        <line className="huh-shift-axis" x1={plot.x} y1={plot.bottom} x2={plot.right} y2={plot.bottom} />
        <line className="huh-shift-axis" x1={plot.x} y1={plot.y} x2={plot.x} y2={plot.bottom} />
        {yTicks.map((tick) => (
          <text key={tick} className="huh-shift-axis-label" x={anchors.ticks.yX} y={y(tick) + 4} style={{ textAnchor: "end" }}>{formatPercent(tick)}</text>
        ))}
        {series.map((entry, seriesIndex) => (
          <path key={`band-${entry.strategyId}`} className={`what-if-survival-band series-${seriesIndex}`} d={bandPath(entry)} />
        ))}
        {series.map((entry, seriesIndex) => (
          <g key={entry.strategyId}>
            <path className={`what-if-survival-line series-${seriesIndex}`} d={path(entry)} />
            {entry.points.map((point, index) => (
              <circle key={point.interval} className={`what-if-survival-dot series-${seriesIndex}`} cx={x(index)} cy={y(point.survival)} r="3.5" />
            ))}
          </g>
        ))}
        {series[0]?.points.map((point, index) => (
          <text key={point.interval} className="what-if-survival-label" x={x(index)} y={anchors.ticks.xY}>{point.label}</text>
        ))}
        <text className="what-if-survival-axis-title" x={plot.cx} y={anchors.title.xY} style={{ textAnchor: "middle" }}>follow-up</text>
        <text className="what-if-survival-axis-title" x={anchors.title.yX} y={plot.cy} style={{ textAnchor: "middle" }} transform={`rotate(-90 ${anchors.title.yX} ${plot.cy})`}>survival</text>
      </svg>
      <div className="what-if-survival-legend">
        {series.map((entry, index) => (
          <div key={entry.strategyId}>
            <span className={`what-if-survival-swatch series-${index}`} />
            <strong>{entry.label}</strong>
            <small>risk {formatNullablePercent(entry.finalRisk)} / survival {formatNullablePercent(entry.finalSurvival)}</small>
          </div>
        ))}
      </div>
      {props.summary.natural && (
        <details className="what-if-natural-survival">
          <summary>Natural-course survival</summary>
          <span>risk {formatNullablePercent(props.summary.natural.finalRisk)}, survival {formatNullablePercent(props.summary.natural.finalSurvival)}</span>
        </details>
      )}
      <WhatIfSurvivalDenominators series={series} open={props.denominatorsOpen} />
    </div>
  );
});

function WhatIfSurvivalDenominators(props: { series: WhatIfStrategySurvivalSummary[]; open: boolean }) {
  const rows = props.series.flatMap((entry) => entry.points.map((point) => ({ entry, point })));
  if (rows.length === 0) return null;
  return (
    <details className="what-if-survival-denominators" open={props.open}>
      <summary>Interval denominators</summary>
      <table>
        <thead>
          <tr>
            <th>Strategy</th>
            <th>Interval</th>
            <th>At risk</th>
            <th>Events</th>
            <th>Censored</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ entry, point }) => (
            <tr key={`${entry.strategyId}:${point.interval}`}>
              <td>{entry.label}</td>
              <td>{point.interval + 1}</td>
              <td>{formatWeightedCount(point.atRisk)}</td>
              <td>{formatWeightedCount(point.events)}</td>
              <td>{formatWeightedCount(point.censored)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function WhatIfDynamicSupport(props: { comparison: GMethodsComparison }) {
  return (
    <div className="what-if-support-card">
      <div className="module-card-header">
        <strong>Rule support by visit</strong>
        <span>{props.comparison.treatmentVariables.join(", ")}</span>
      </div>
      <div className="what-if-rule-grid">
        {props.comparison.strategies.map((strategy) => (
          <div key={strategy.id}>
            <strong>{strategy.label}</strong>
            {formatStrategyRules(strategy).map((rule) => <span key={rule}>{rule}</span>)}
          </div>
        ))}
      </div>
      <table className="what-if-method-table what-if-support-table">
        <thead>
          <tr>
            <th>Strategy</th>
            <th>Visit</th>
            <th>Rule trigger</th>
            <th>Assigned</th>
            <th>Observed match</th>
            <th>Uncensored</th>
          </tr>
        </thead>
        <tbody>
          {props.comparison.support.map((row) => (
            <tr key={`${row.strategyId}:${row.treatment}`}>
              <td>{row.label}</td>
              <td>{row.treatment}</td>
              <td>{row.ruleConditionShare === null ? "fixed" : formatPercent(row.ruleConditionShare)}</td>
              <td>{formatPercent(row.assignedShare)}</td>
              <td>{formatPercent(row.observedMatchShare)}</td>
              <td>{formatPercent(row.uncensoredShare)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HuhShiftPlot(props: { shift: HuhShift }) {
  const { observed, causal } = props.shift;
  const rows = [{ key: "observed", row: observed }, { key: "causal", row: causal }] as const;
  const rowGap = 38;
  const values = rows.flatMap(({ row }) => [row.numeric, row.lower, row.upper])
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  const maxAbs = Math.max(0.05, ...values.map((value) => Math.abs(value)));
  const domain = maxAbs * 1.28;

  // Declare the layout instead of hand-computing offsets: a fixed left gutter for
  // the row labels, and a bottom axis carrying tick labels + a title.
  const frame = chartFrame({
    width: 360,
    plotHeight: rowGap * rows.length,
    y: { size: 150 },
    x: { ticks: true, title: true },
    xDomain: [-domain, domain]
  });
  const { plot, xScale, anchors } = frame;
  const rowY = (index: number) => plot.y + rowGap * (index + 0.5);

  return (
    <div className="huh-shift-plot-card">
      <div className="module-card-header">
        <strong>{props.shift.title}</strong>
      </div>
      <svg className="huh-shift-plot" viewBox={`0 0 ${frame.width} ${frame.height}`} role="img" aria-label={props.shift.title}>
        <line className="huh-shift-zero" x1={xScale(0)} y1={plot.y - 6} x2={xScale(0)} y2={plot.bottom} />
        {rows.map(({ key, row }, index) => {
          const y = rowY(index);
          return (
            <g key={key}>
              <text className="huh-shift-row-label" x="8" y={y - 4}>{row.label}</text>
              {row.sublabel && <text className="huh-shift-row-sublabel" x="8" y={y + 9}>{row.sublabel}</text>}
              {row.lower !== undefined && row.upper !== undefined && (
                <line className="huh-shift-interval" x1={xScale(row.lower)} y1={y} x2={xScale(row.upper)} y2={y} />
              )}
              <circle className={`huh-shift-dot ${key}`} cx={xScale(row.numeric)} cy={y} r="5.5" />
              {/* Value sits on the toward-zero side of the dot so it always stays inside the plot. */}
              <text className="huh-shift-value" x={row.numeric < 0 ? xScale(row.numeric) + 10 : xScale(row.numeric) - 10} y={y + 4} style={{ textAnchor: row.numeric < 0 ? "start" : "end" }}>{row.value}</text>
            </g>
          );
        })}
        <line className="huh-shift-axis" x1={plot.x} y1={plot.bottom} x2={plot.right} y2={plot.bottom} />
        <text className="huh-shift-axis-label" x={plot.x} y={anchors.ticks.xY}>{formatSignedValue(-domain)}</text>
        <text className="huh-shift-axis-label" x={xScale(0)} y={anchors.ticks.xY} style={{ textAnchor: "middle" }}>0</text>
        <text className="huh-shift-axis-label end" x={plot.right} y={anchors.ticks.xY}>{formatSignedValue(domain)}</text>
        <text className="huh-shift-axis-title" x={plot.cx} y={anchors.title.xY} style={{ textAnchor: "middle" }}>{props.shift.axisLabel}</text>
      </svg>
      <p className="huh-shift-caption"><NodeText>{props.shift.caption}</NodeText></p>
    </div>
  );
}

function minimumObservedSupport(comparison: GMethodsComparison): number | null {
  const values = comparison.support
    .map((row) => row.observedMatchShare)
    .filter((value) => Number.isFinite(value));
  return values.length > 0 ? Math.min(...values) : null;
}

function formatSurvivalEvents(summary: WhatIfSurvivalSummary): string {
  const strategyEvents = summary.strategies.map((strategy) => `${formatWeightedCount(strategy.totalEvents)}/${formatWeightedCount(strategy.totalCensored)}`);
  if (strategyEvents.length > 0) return strategyEvents.join(" | ");
  return summary.natural ? `${formatWeightedCount(summary.natural.totalEvents)}/${formatWeightedCount(summary.natural.totalCensored)}` : "NA";
}

function formatStrategyRules(strategy: GMethodsComparison["strategies"][number]): string[] {
  if (strategy.rules.length > 0) {
    return strategy.rules.map((rule) => `${rule.variable}=${rule.value} if ${rule.conditionVariable} ${operatorLabel(rule.operator)} ${rule.conditionValue}; else ${rule.otherwise}`);
  }
  if (strategy.assignments.length > 0) return strategy.assignments.map((assignment) => `${assignment.variable}=${assignment.value}`);
  return ["natural observed treatment"];
}

function operatorLabel(operator: GMethodsComparison["strategies"][number]["rules"][number]["operator"]): string {
  if (operator === "neq") return "!=";
  if (operator === "lte") return "<=";
  if (operator === "gte") return ">=";
  return operator === "eq" ? "=" : operator;
}

function estimateToneClass(value: number | null): string {
  if (value === null || Math.abs(value) < 0.005) return "neutral";
  return value < 0 ? "negative" : "positive";
}

function formatOutcomeValue(value: number | null, scale: WhatIfOutputScale, unit: string): string {
  if (value === null) return "NA";
  if (scale === "risk") return formatPercent(value);
  return `${formatValue(value)}${unit ? ` ${unit}` : ""}`;
}

function formatOutcomeDifference(value: number | null, scale: WhatIfOutputScale, unit: string): string {
  if (value === null) return "NA";
  if (scale === "risk") return formatPercentagePoints(value);
  return `${formatSignedValue(value)}${unit ? ` ${unit}` : ""}`;
}

function formatNullablePercent(value: number | null): string {
  return value === null ? "NA" : formatPercent(value);
}

function formatEss(estimate: GMethodEstimate | undefined): string {
  if (!estimate) return "NA";
  const values = estimate.arms.map((arm) => arm.effectiveSampleSize).filter((value): value is number => value !== null && Number.isFinite(value));
  return values.length === 0 ? "NA" : formatWeightedCount(Math.min(...values));
}

function sampleScoresForPlot(samples: number[]): number[] {
  const maxPoints = 52;
  if (samples.length <= maxPoints) return samples;
  const stride = samples.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, index) => samples[Math.floor(index * stride)]).filter((value): value is number => value !== undefined);
}

function deterministicStripJitter(index: number, needValue: 0 | 1, treatment: "no tutoring" | "tutoring"): number {
  const seed = (index + 1) * 1103515245 + needValue * 12345 + (treatment === "tutoring" ? 6789 : 0);
  const normalized = ((Math.sin(seed) * 10000) % 1 + 1) % 1;
  return (normalized - 0.5) * 17;
}

function deterministicBinnedJitter(index: number, binIndex: number, arm: 0 | 1): number {
  const seed = (index + 1) * 1664525 + binIndex * 1013904223 + arm * 7919;
  const normalized = ((Math.sin(seed) * 10000) % 1 + 1) % 1;
  return (normalized - 0.5) * 13;
}

function CompletedOutputShell(props: { badge: string; conclusion: string; title?: string; children: React.ReactNode }) {
  // The primary visual (the first child — e.g. the "Effect by treatment" graph, or the metric grid)
  // leads; the "Interpretation" prose is its own box using the same .output-box primitive as every
  // other card, so the green wrapper is gone and the boxes read as siblings.
  const [lead, ...rest] = Children.toArray(props.children);
  // One wrapper auto-chips every node name in the conclusion, visual reads, backdoor lines, etc.
  return (
    <HighlightNames>
      <div className="completed-output">
        {lead}
        <details className="output-box completed-interpretation" open>
          <summary>
            <strong>{props.title ?? "Interpretation"}</strong>
            <span className="module-badge active">{props.badge}</span>
          </summary>
          <div className="completed-output-body">
            <p className="completed-conclusion">{props.conclusion}</p>
          </div>
        </details>
        {rest}
      </div>
    </HighlightNames>
  );
}

// --- Effect modification / moderator-CATE output -----------------------------------------------
// Faces the treatment→outcome effect by a MODERATOR (the gate of a smooth_gated interaction): one
// facet per moderator level, plus a leading marginal facet. A disordinal (crossover) interaction
// shows as opposite-signed subgroup facets whose average — the marginal — hides them.


function computeModeratorEffectOutput(context: OutputContext): ModeratorEffectOutput | null {
  const { document, simulation } = context;
  // The moderator is the `gate` of a smooth_gated interaction; it lives on the outcome (target) node.
  let spec: { outcomeId: string; treatmentId: string; moderatorId: string } | null = null;
  for (const [outcomeId, mechanism] of Object.entries(document.simulation.nodes)) {
    const gated = (mechanism?.interactions ?? []).find((interaction) => interaction.kind === "smooth_gated");
    if (gated && gated.kind === "smooth_gated") { spec = { outcomeId, treatmentId: gated.source, moderatorId: gated.gate }; break; }
  }
  if (!spec) return null;
  const tState = simulation.nodeStates[spec.treatmentId];
  const yState = simulation.nodeStates[spec.outcomeId];
  const mState = simulation.nodeStates[spec.moderatorId];
  if (!tState || !yState || !mState) return null;
  const tSamples = tState.empirical.samples, ySamples = yState.empirical.samples, mSamples = mState.empirical.samples;
  const tWeights = tState.empirical.weights, yWeights = yState.empirical.weights;
  const count = Math.min(tSamples.length, ySamples.length, mSamples.length);
  type Row = { x: number; y: number; weight: number; index: number; mod: number };
  const rows: Row[] = [];
  for (let index = 0; index < count; index += 1) {
    const x = tSamples[index], y = ySamples[index], mod = mSamples[index];
    if (x === undefined || y === undefined || mod === undefined || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(mod)) continue;
    rows.push({ x, y, weight: Math.max(0, tWeights[index] ?? yWeights[index] ?? 1), index, mod });
  }
  if (rows.length === 0) return null;
  const binary = rows.every((row) => row.y === 0 || row.y === 1);
  const labelOf = (id: string) => document.graph.nodes.find((node) => node.id === id)?.label ?? id;
  const treatmentLabel = labelOf(spec.treatmentId);
  const moderatorLabel = labelOf(spec.moderatorId);
  const outcomeLabel = labelOf(spec.outcomeId);
  const outcomeUnit = document.graph.nodes.find((node) => node.id === spec.outcomeId)?.variable.unit ?? "";
  const toPoints = (subset: Row[]): ScatterPoint[] => subset.map((row) => ({ x: row.x, y: row.y, weight: row.weight, index: row.index }));
  const summariesOf = (points: ScatterPoint[]) => binary ? binaryOutcomeSummaries(points, treatmentLabel) : continuousOutcomeSummaries(points, treatmentLabel);
  const effectOf = (summaries: CategoryOutcomeSummary[]): number | null => {
    const treated = summaries.find((summary) => summary.group === 1)?.mean ?? null;
    const untreated = summaries.find((summary) => summary.group === 0)?.mean ?? null;
    return treated === null || untreated === null ? null : treated - untreated;
  };
  const allPoints = toPoints(rows);
  const allSummaries = summariesOf(allPoints);
  const facets: ModeratorFacet[] = [
    { id: "marginal", title: "all (marginal)", color: MARGINAL_COLOR, effect: effectOf(allSummaries), points: allPoints, summaries: allSummaries }
  ];
  for (const level of [0, 1] as const) {
    const subset = rows.filter((row) => Math.round(row.mod) === level);
    if (subset.length === 0) continue;
    const points = toPoints(subset);
    const summaries = summariesOf(points);
    // Subgroup axis: ordered violet ramp, distinct from the method colors (gray/ochre/blue).
    facets.push({ id: `mod-${level}`, title: `${moderatorLabel}=${level}`, color: subgroupColor(level, 2), effect: effectOf(summaries), points, summaries });
  }
  const levelEffects = facets.filter((facet) => facet.id.startsWith("mod-")).map((facet) => facet.effect);
  const bothLevels = levelEffects.length >= 2 && levelEffects.every((effect) => effect !== null && Number.isFinite(effect));
  const crossover = bothLevels && Math.sign(levelEffects[0]!) !== Math.sign(levelEffects[1]!) && levelEffects.some((effect) => Math.abs(effect!) > 1e-6);
  // Ordinal = same sign, but the magnitudes differ enough to be real moderation (not just noise).
  const maxMagnitude = Math.max(...levelEffects.map((effect) => Math.abs(effect ?? 0)), 1e-9);
  const ordinal = bothLevels && !crossover && Math.abs(levelEffects[0]! - levelEffects[1]!) > 0.15 * maxMagnitude;
  return { treatmentLabel, moderatorLabel, outcomeLabel, outcomeUnit, binary, facets, marginalEffect: effectOf(allSummaries), crossover, ordinal };
}

function renderModeratorEffectOutput(result: ModeratorEffectOutput): React.ReactNode {
  const scale: WhatIfOutputScale = result.binary ? "risk" : "mean";
  const yDomain = sharedFacetYDomain(result.facets, result.binary);
  return (
    <details className="output-box moderator-effect-output" open>
      <summary><strong>Effect by {result.moderatorLabel}</strong><span>per subgroup vs marginal</span></summary>
      <div className="what-if-effect-graph">
        <div className="effect-facet-row">
          {result.facets.map((facet) => (
            <div className="effect-facet" key={facet.id}>
              <div className="effect-facet-head"><strong style={{ color: facet.color }}>{facet.title}</strong><span>{formatOutcomeDifference(facet.effect, scale, result.binary ? "" : result.outcomeUnit)}</span></div>
              <div className="effect-facet-body">
                <CategoryOutcomePlot compact points={facet.points} summaries={facet.summaries} xLabel={result.treatmentLabel} yLabel={result.outcomeLabel} yDomain={yDomain} clampToDomain seriesColor={facet.color} outcomeKind={result.binary ? "binary" : "continuous"} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

// --- Instrument / IV output ---------------------------------------------------------------------
// Tells the IV story in three moves: the famous reduced-form comparison (outcome by instrument), the
// first stage (treatment by instrument), and the verdict (naive vs IV/2SLS vs oracle truth). Reads the
// instrument from the node role; the estimator lives in core.

function computeInstrumentOutput(context: OutputContext): InstrumentOutput | null {
  const { document, simulation } = context;
  const instrument = document.graph.nodes.find((node) => node.roles.instrument)?.id;
  const treatment = document.graph.nodes.find((node) => node.roles.exposure)?.id;
  const outcome = document.graph.nodes.find((node) => node.roles.outcome)?.id;
  if (!instrument || !treatment || !outcome) return null;
  const cohort = cohortFromSimulationResult(simulation);
  const iv = estimateInstrument(cohort.rows, cohort.weights, { instrument, treatment, outcome });
  if (!iv) return null;
  const labelOf = (id: string) => document.graph.nodes.find((node) => node.id === id)?.label ?? id;
  const instrumentLabel = labelOf(instrument);
  const pointsBy = (yId: string): ScatterPoint[] => cohort.rows
    .map((row, i) => ({ x: row[instrument]!, y: row[yId]!, weight: cohort.weights[i] ?? 1, index: i }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const reducedFormPoints = pointsBy(outcome);
  const firstStagePoints = pointsBy(treatment);
  const binaryOutcome = reducedFormPoints.every((p) => p.y === 0 || p.y === 1);
  const binaryTreatment = firstStagePoints.every((p) => p.y === 0 || p.y === 1);
  const reducedFormSummaries = binaryOutcome ? binaryOutcomeSummaries(reducedFormPoints, instrumentLabel) : continuousOutcomeSummaries(reducedFormPoints, instrumentLabel);
  const firstStageSummaries = binaryTreatment ? binaryOutcomeSummaries(firstStagePoints, instrumentLabel) : continuousOutcomeSummaries(firstStagePoints, instrumentLabel);
  // Oracle truth: the g-formula re-simulates under do(treatment), so it recovers the real effect even
  // though the confounder is latent.
  let oracle: number | null = null;
  const spec = deriveAdjustmentSpec(document, { exposure: treatment, outcome });
  if (spec) oracle = analyzeAdjustment(document, spec)?.estimates.find((e) => e.id === "g_formula")?.estimate ?? null;
  return {
    instrumentLabel,
    treatmentLabel: labelOf(treatment),
    outcomeLabel: labelOf(outcome),
    binaryOutcome,
    binaryTreatment,
    reducedFormSummaries,
    firstStageSummaries,
    reducedFormPoints,
    firstStagePoints,
    reducedFormDomain: sharedFacetYDomain([{ points: reducedFormPoints, summaries: reducedFormSummaries }], binaryOutcome),
    firstStageDomain: sharedFacetYDomain([{ points: firstStagePoints, summaries: firstStageSummaries }], binaryTreatment),
    iv,
    oracle
  };
}

function renderInstrumentOutput(result: InstrumentOutput): React.ReactNode {
  const { iv } = result;
  const rd = (value: number | null) => formatOutcomeDifference(value, result.binaryOutcome ? "risk" : "mean", "");
  return (
    <>
      <details className="output-box" open>
        <summary><strong>By {result.instrumentLabel}</strong><span>reduced form &amp; first stage</span></summary>
        <div className="instrument-grid">
          <div className="instrument-chart">
            <div className="instrument-chart-title">{result.outcomeLabel}</div>
            <CategoryOutcomePlot compact points={result.reducedFormPoints} summaries={result.reducedFormSummaries} xLabel={result.instrumentLabel} yLabel={result.outcomeLabel} yDomain={result.reducedFormDomain} clampToDomain outcomeKind={result.binaryOutcome ? "binary" : "continuous"} />
            <p className="instrument-readout">reduced form = {rd(iv.reducedForm)}</p>
          </div>
          <div className="instrument-chart">
            <div className="instrument-chart-title">{result.treatmentLabel}</div>
            <CategoryOutcomePlot compact points={result.firstStagePoints} summaries={result.firstStageSummaries} xLabel={result.instrumentLabel} yLabel={result.treatmentLabel} yDomain={result.firstStageDomain} clampToDomain outcomeKind={result.binaryTreatment ? "binary" : "continuous"} />
            <p className="instrument-readout">first stage = {formatOutcomeDifference(iv.firstStage, result.binaryTreatment ? "risk" : "mean", "")}</p>
          </div>
        </div>
      </details>

      <details className="output-box" open>
        <summary><strong>Naive · IV · truth</strong></summary>
        <div className="instrument-verdict">
          <div className="instrument-verdict-row biased"><span>Naive</span><strong>{rd(iv.naive)}</strong></div>
          <div className="instrument-verdict-row iv"><span>IV — 2SLS = Wald</span><strong>{rd(iv.wald)}</strong><i>{rd(iv.reducedForm)} ÷ {formatOutcomeDifference(iv.firstStage, result.binaryTreatment ? "risk" : "mean", "")}</i></div>
          {result.oracle !== null && <div className="instrument-verdict-row truth"><span>Truth (oracle)</span><strong>{rd(result.oracle)}</strong></div>}
        </div>
        {iv.weakInstrument && <p className="instrument-note warn">Weak instrument: first stage ≈ 0.</p>}
      </details>
    </>
  );
}

function fallbackOutput(badge: string, message: string) {
  return (
    <details className="completed-output-card">
      <summary className="module-card-header completed-output-summary">
        <strong>Interpretation</strong>
        <span className="module-badge planned">{badge}</span>
      </summary>
      <div className="completed-output-body">
        <p className="muted">{message}</p>
      </div>
    </details>
  );
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

function computeSimpsonCompletedOutput(context: OutputContext): SimpsonCompletedOutput | null {
  const { analysis, document, simulation } = context;
  const treatment = simulation.nodeStates.Treatment;
  const recovery = simulation.nodeStates.Recovery;
  const severity = simulation.nodeStates.Severity;
  if (!treatment || !recovery || !severity) return null;

  const treatedRecovery = weightedConditionalMean(treatment, recovery, 1);
  const untreatedRecovery = weightedConditionalMean(treatment, recovery, 0);
  const treatedSeverity = weightedConditionalMean(treatment, severity, 1);
  const untreatedSeverity = weightedConditionalMean(treatment, severity, 0);
  if (
    treatedRecovery === null ||
    untreatedRecovery === null ||
    treatedSeverity === null ||
    untreatedSeverity === null
  ) return null;

  const causalOne = runSimulation(document.graph, { ...document.simulation, overrides: { Treatment: 1 }, selections: {} });
  const causalZero = runSimulation(document.graph, { ...document.simulation, overrides: { Treatment: 0 }, selections: {} });
  const causalTreatedRecovery = causalOne.nodeStates.Recovery?.empirical.mean;
  const causalUntreatedRecovery = causalZero.nodeStates.Recovery?.empirical.mean;
  if (causalTreatedRecovery === null || causalTreatedRecovery === undefined || causalUntreatedRecovery === null || causalUntreatedRecovery === undefined) return null;

  const crudeDiff = treatedRecovery - untreatedRecovery;
  const causalDiff = causalTreatedRecovery - causalUntreatedRecovery;
  const severityDiff = treatedSeverity - untreatedSeverity;
  const adjustmentSet = formatAdjustmentSet(analysis.totalEffect.minimalSets[0] ?? ["Severity"]);
  const severityDirection = severityDiff >= 0 ? "higher" : "lower";
  const visualRead = `Treatment groups are separated on Severity: treated cases average ${formatValue(Math.abs(severityDiff))} severity units ${severityDirection}. If that vertical separation is visible, the crude recovery gap is already suspect.`;
  const signsReverse = crudeDiff !== 0 && causalDiff !== 0 && Math.sign(crudeDiff) !== Math.sign(causalDiff);
  const paradox = signsReverse
    ? `Sign reversal: crude ${formatPercentagePoints(crudeDiff)} versus causal ${formatPercentagePoints(causalDiff)}.`
    : `No sign reversal with the current parameters, but Severity still confounds the crude comparison.`;
  const causalDirection = causalDiff >= 0 ? "raises" : "lowers";
  const crudeDirection = crudeDiff >= 0 ? "higher" : "lower";
  const conclusion = `Observed treated cases have a recovery rate ${formatPercentagePointMagnitude(crudeDiff)} ${crudeDirection} than untreated cases in the crude comparison. Because Severity drives both treatment and recovery, the reportable causal contrast is do(Treatment=1) versus do(Treatment=0): under this DAG, treatment ${causalDirection} recovery by ${formatPercentagePointMagnitude(causalDiff)}.`;
  const severityAdjusted = document.graph.nodes.find((node) => node.id === "Severity")?.roles.adjusted ?? false;

  return {
    crudeTreatedRecovery: treatedRecovery,
    crudeUntreatedRecovery: untreatedRecovery,
    crudeDiff,
    causalTreatedRecovery,
    causalUntreatedRecovery,
    causalDiff,
    treatedSeverity,
    untreatedSeverity,
    severityDiff,
    adjustmentSet,
    visualRead,
    paradox,
    conclusion,
    severityAdjusted
  };
}

function computeIcuCompletedOutput(context: OutputContext): IcuCompletedOutput | null {
  const { analysis, document, simulation } = context;
  const admission = simulation.nodeStates.ICU_admission;
  const death = simulation.nodeStates.Death;
  const severity = simulation.nodeStates.Severity;
  const triage = simulation.nodeStates.Triage_score;
  if (!admission || !death || !severity || !triage) return null;

  const crudeIcuMortality = weightedConditionalMean(admission, death, 1);
  const crudeWardMortality = weightedConditionalMean(admission, death, 0);
  const icuSeverity = weightedConditionalMean(admission, severity, 1);
  const wardSeverity = weightedConditionalMean(admission, severity, 0);
  const icuTriage = weightedConditionalMean(admission, triage, 1);
  const wardTriage = weightedConditionalMean(admission, triage, 0);
  if (
    crudeIcuMortality === null ||
    crudeWardMortality === null ||
    icuSeverity === null ||
    wardSeverity === null ||
    icuTriage === null ||
    wardTriage === null
  ) return null;

  const causalIcu = runSimulation(document.graph, { ...document.simulation, overrides: { ICU_admission: 1 }, selections: {} });
  const causalWard = runSimulation(document.graph, { ...document.simulation, overrides: { ICU_admission: 0 }, selections: {} });
  const causalIcuMortality = causalIcu.nodeStates.Death?.empirical.mean;
  const causalWardMortality = causalWard.nodeStates.Death?.empirical.mean;
  if (causalIcuMortality === null || causalIcuMortality === undefined || causalWardMortality === null || causalWardMortality === undefined) return null;

  const crudeDiff = crudeIcuMortality - crudeWardMortality;
  const causalDiff = causalIcuMortality - causalWardMortality;
  const severityDiff = icuSeverity - wardSeverity;
  const triageDiff = icuTriage - wardTriage;
  const adjustmentSet = formatAdjustmentSet(analysis.totalEffect.minimalSets[0] ?? ["Severity"]);
  const severityDirection = severityDiff >= 0 ? "sicker" : "less sick";
  const triageDirection = triageDiff >= 0 ? "higher" : "lower";
  const visualRead = `ICU patients are ${formatValue(Math.abs(severityDiff))} severity units ${severityDirection} on average. That vertical baseline gap makes raw ICU-versus-ward mortality a poor causal read before any arithmetic.`;
  const colliderWarning = `Triage_score is shown as ICU_admission -> Triage_score <- Severity. Its ICU group mean is ${formatValue(Math.abs(triageDiff))} points ${triageDirection}, but that score is a common effect/downstream summary, not a clean baseline confounder.`;
  const signsReverse = crudeDiff !== 0 && causalDiff !== 0 && Math.sign(crudeDiff) !== Math.sign(causalDiff);
  const verdict = signsReverse
    ? `Sign reversal: crude ICU mortality ${formatPercentagePoints(crudeDiff)} versus causal ICU effect ${formatPercentagePoints(causalDiff)}.`
    : `No sign reversal with the current parameters, but Severity still makes the crude ICU mortality gap non-causal.`;
  const crudeDirection = crudeDiff >= 0 ? "higher" : "lower";
  const causalDirection = causalDiff >= 0 ? "raises" : "lowers";
  const conclusion = `Observed ICU patients have mortality ${formatPercentagePointMagnitude(crudeDiff)} ${crudeDirection} than non-ICU patients. They are also much sicker at baseline, so the reportable contrast is do(ICU_admission=1) versus do(ICU_admission=0): under this DAG, ICU admission ${causalDirection} mortality by ${formatPercentagePointMagnitude(causalDiff)}.`;

  return {
    crudeIcuMortality,
    crudeWardMortality,
    crudeDiff,
    causalIcuMortality,
    causalWardMortality,
    causalDiff,
    icuSeverity,
    wardSeverity,
    severityDiff,
    icuTriage,
    wardTriage,
    triageDiff,
    adjustmentSet,
    visualRead,
    colliderWarning,
    verdict,
    conclusion
  };
}

function computeCollegeCompletedOutput(context: OutputContext): CollegeCompletedOutput | null {
  const { analysis, document, simulation } = context;
  const college = simulation.nodeStates.College;
  const earnings = simulation.nodeStates.Earnings;
  const income = simulation.nodeStates.Family_log_income;
  if (!college || !earnings || !income) return null;

  const crudeCollegeEarnings = weightedConditionalMean(college, earnings, 1);
  const crudeNoCollegeEarnings = weightedConditionalMean(college, earnings, 0);
  const collegeFamilyIncome = weightedConditionalMean(college, income, 1);
  const noCollegeFamilyIncome = weightedConditionalMean(college, income, 0);
  if (
    crudeCollegeEarnings === null ||
    crudeNoCollegeEarnings === null ||
    collegeFamilyIncome === null ||
    noCollegeFamilyIncome === null
  ) return null;

  const doCollege = runSimulation(document.graph, { ...document.simulation, overrides: { College: 1 }, selections: {} });
  const doNoCollege = runSimulation(document.graph, { ...document.simulation, overrides: { College: 0 }, selections: {} });
  const causalCollegeEarnings = doCollege.nodeStates.Earnings?.empirical.mean;
  const causalNoCollegeEarnings = doNoCollege.nodeStates.Earnings?.empirical.mean;
  if (causalCollegeEarnings === null || causalCollegeEarnings === undefined || causalNoCollegeEarnings === null || causalNoCollegeEarnings === undefined) return null;

  const crudePremium = crudeCollegeEarnings - crudeNoCollegeEarnings;
  const causalPremium = causalCollegeEarnings - causalNoCollegeEarnings;
  const incomeDiff = collegeFamilyIncome - noCollegeFamilyIncome;
  const adjustmentSet = formatAdjustmentSet(analysis.totalEffect.minimalSets[0] ?? ["Family_log_income"]);
  const rawDirection = crudePremium >= 0 ? "higher" : "lower";
  const causalDirection = causalPremium >= 0 ? "raises" : "lowers";
  const visualRead = `College attendees average ${formatValue(Math.abs(incomeDiff))} family-log-income units ${incomeDiff >= 0 ? "higher" : "lower"} than non-attendees. That baseline separation means the raw earnings difference is not automatically a college effect.`;
  const overstatement = Math.abs(crudePremium) - Math.abs(causalPremium);
  const verdict = crudePremium !== 0 && causalPremium !== 0 && Math.sign(crudePremium) !== Math.sign(causalPremium)
    ? `Sign reversal: raw earnings difference ${formatSignedValue(crudePremium)} versus DGP do difference ${formatSignedValue(causalPremium)}.`
    : overstatement > 0
      ? `Raw earnings difference exceeds the DGP do difference by ${formatValue(overstatement)} earnings units under this DAG.`
      : `Raw earnings difference and DGP do difference point the same way; Family_log_income still makes the raw comparison non-causal.`;
  const conclusion = `College graduates earn ${formatValue(Math.abs(crudePremium))} earnings units ${rawDirection} than non-graduates in the raw comparison. Because Family_log_income affects both college attendance and earnings, the reportable causal contrast is do(College=1) versus do(College=0): under this DAG, college ${causalDirection} earnings by ${formatValue(Math.abs(causalPremium))} units.`;
  const incomeNode = document.graph.nodes.find((node) => node.id === "Family_log_income");
  const incomeVariable = normalizeVariableModel(incomeNode?.variable);
  const cutpoints = incomeVariable.adjustment.method === "bins" ? incomeVariable.adjustment.cutpoints : [];
  const binnedBins = incomeNode?.roles.adjusted && cutpoints.length > 0
    ? collegeBinnedAdjustmentBins(income, college, earnings, cutpoints)
    : [];
  const binnedPremium = weightedBinnedPremium(binnedBins);
  const earningsValues = [
    crudeCollegeEarnings,
    crudeNoCollegeEarnings,
    causalCollegeEarnings,
    causalNoCollegeEarnings,
    ...binnedBins.flatMap((bin) => [
      ...(bin.collegeSamples.length ? bin.collegeSamples : []),
      ...(bin.noCollegeSamples.length ? bin.noCollegeSamples : [])
    ])
  ].filter(Number.isFinite);
  const earningsMin = Math.min(...earningsValues);
  const earningsMax = Math.max(...earningsValues);
  const earningsPad = Math.max((earningsMax - earningsMin) * 0.08, 1);

  return {
    crudeCollegeEarnings,
    crudeNoCollegeEarnings,
    crudePremium,
    causalCollegeEarnings,
    causalNoCollegeEarnings,
    causalPremium,
    collegeFamilyIncome,
    noCollegeFamilyIncome,
    incomeDiff,
    adjustmentSet,
    visualRead,
    verdict,
    conclusion,
    binnedBins,
    binnedPremium,
    earningsDomain: [earningsMin - earningsPad, earningsMax + earningsPad]
  };
}

function collegeBinnedAdjustmentBins(income: SimulatedNodeState, college: SimulatedNodeState, earnings: SimulatedNodeState, cutpoints: number[]): CollegeBinnedAdjustmentBin[] {
  const incomeSamples = income.empirical.samples;
  const collegeSamples = college.empirical.samples;
  const earningsSamples = earnings.empirical.samples;
  const finiteIncome = incomeSamples.filter(Number.isFinite);
  if (finiteIncome.length === 0) return [];
  const lowerBound = Math.min(...finiteIncome);
  const upperBound = Math.max(...finiteIncome);
  const boundaries = [lowerBound, ...cutpoints.filter((value) => value > lowerBound && value < upperBound).sort((a, b) => a - b), upperBound];
  return boundaries.slice(0, -1).map((lower, index) => {
    const upper = boundaries[index + 1] ?? upperBound;
    const noCollegeSamples: number[] = [];
    const collegeEarningSamples: number[] = [];
    let noCollegeWeighted = 0;
    let collegeWeighted = 0;
    let noCollegeSum = 0;
    let collegeSum = 0;
    for (let sampleIndex = 0; sampleIndex < Math.min(incomeSamples.length, collegeSamples.length, earningsSamples.length); sampleIndex += 1) {
      const incomeValue = incomeSamples[sampleIndex];
      const collegeValue = collegeSamples[sampleIndex];
      const earningsValue = earningsSamples[sampleIndex];
      if (
        incomeValue === undefined ||
        collegeValue === undefined ||
        earningsValue === undefined ||
        !Number.isFinite(incomeValue) ||
        !Number.isFinite(collegeValue) ||
        !Number.isFinite(earningsValue)
      ) continue;
      const inBin = index === boundaries.length - 2 ? incomeValue >= lower && incomeValue <= upper : incomeValue >= lower && incomeValue < upper;
      if (!inBin) continue;
      const weight = Math.max(0, income.empirical.weights[sampleIndex] ?? college.empirical.weights[sampleIndex] ?? earnings.empirical.weights[sampleIndex] ?? 1);
      if (Math.round(collegeValue) === 1) {
        collegeWeighted += weight;
        collegeSum += earningsValue * weight;
        collegeEarningSamples.push(earningsValue);
      } else {
        noCollegeWeighted += weight;
        noCollegeSum += earningsValue * weight;
        noCollegeSamples.push(earningsValue);
      }
    }
    const collegeEarnings = collegeWeighted > 0 ? collegeSum / collegeWeighted : null;
    const noCollegeEarnings = noCollegeWeighted > 0 ? noCollegeSum / noCollegeWeighted : null;
    const gap = collegeEarnings !== null && noCollegeEarnings !== null ? collegeEarnings - noCollegeEarnings : null;
    return {
      index,
      label: `${formatValue(lower)} to ${formatValue(upper)}`,
      lower,
      upper,
      weight: collegeWeighted + noCollegeWeighted,
      collegeCount: collegeWeighted,
      noCollegeCount: noCollegeWeighted,
      collegeEarnings,
      noCollegeEarnings,
      gap,
      collegeSamples: collegeEarningSamples,
      noCollegeSamples,
      warning: supportWarning(collegeWeighted, noCollegeWeighted)
    };
  });
}

function weightedBinnedPremium(bins: CollegeBinnedAdjustmentBin[]): number | null {
  let numerator = 0;
  let denominator = 0;
  for (const bin of bins) {
    if (bin.gap === null || bin.weight <= 0) continue;
    numerator += bin.gap * bin.weight;
    denominator += bin.weight;
  }
  return denominator > 0 ? numerator / denominator : null;
}

function supportWarning(exposed: number, unexposed: number): string | null {
  const total = exposed + unexposed;
  const smallerArm = Math.min(exposed, unexposed);
  if (total <= 0) return "empty bin";
  if (smallerArm <= 0) return "no support";
  if (smallerArm < 8 || smallerArm / total < 0.08) return "weak support";
  return null;
}

function computeTutoringCompletedOutput(context: OutputContext): TutoringCompletedOutput | null {
  const { analysis, document, simulation } = context;
  const tutoring = simulation.nodeStates.Tutoring;
  const score = simulation.nodeStates.Test_score;
  const need = simulation.nodeStates.Academic_need;
  if (!tutoring || !score || !need) return null;

  const crudeTutoredScore = weightedConditionalMean(tutoring, score, 1);
  const crudeUntutoredScore = weightedConditionalMean(tutoring, score, 0);
  const tutoredNeed = weightedConditionalMean(tutoring, need, 1);
  const untutoredNeed = weightedConditionalMean(tutoring, need, 0);
  if (
    crudeTutoredScore === null ||
    crudeUntutoredScore === null ||
    tutoredNeed === null ||
    untutoredNeed === null
  ) return null;

  const doTutoring = runSimulation(document.graph, { ...document.simulation, overrides: { Tutoring: 1 }, selections: {} });
  const doNoTutoring = runSimulation(document.graph, { ...document.simulation, overrides: { Tutoring: 0 }, selections: {} });
  const causalTutoredScore = doTutoring.nodeStates.Test_score?.empirical.mean;
  const causalUntutoredScore = doNoTutoring.nodeStates.Test_score?.empirical.mean;
  if (causalTutoredScore === null || causalTutoredScore === undefined || causalUntutoredScore === null || causalUntutoredScore === undefined) return null;

  const crudeGap = crudeTutoredScore - crudeUntutoredScore;
  const causalGap = causalTutoredScore - causalUntutoredScore;
  const needDiff = tutoredNeed - untutoredNeed;
  const adjustmentSet = formatAdjustmentSet(analysis.totalEffect.minimalSets[0] ?? ["Academic_need"]);
  const rawDirection = crudeGap >= 0 ? "higher" : "lower";
  const causalDirection = causalGap >= 0 ? "raises" : "lowers";
  const visualRead = `Tutored students are ${formatPercentagePointMagnitude(needDiff)} more likely to be high-need students. That imbalance changes the raw score difference.`;
  const signsReverse = crudeGap !== 0 && causalGap !== 0 && Math.sign(crudeGap) !== Math.sign(causalGap);
  const verdict = signsReverse
    ? `Sign reversal: raw score difference ${formatSignedValue(crudeGap)} points versus DGP do difference ${formatSignedValue(causalGap)} points.`
    : `No sign reversal with the current parameters, but Academic_need still confounds the raw tutoring comparison.`;
  const conclusion = `Tutored students score ${formatValue(Math.abs(crudeGap))} points ${rawDirection} than non-tutored students in the raw comparison. Because Academic_need drives both tutoring and lower scores, the reportable causal contrast is do(Tutoring=1) versus do(Tutoring=0): under this DAG, tutoring ${causalDirection} scores by ${formatValue(Math.abs(causalGap))} points.`;
  const academicNeedAdjusted = document.graph.nodes.find((node) => node.id === "Academic_need")?.roles.adjusted ?? false;
  const adjustedPairs = tutoringAdjustedPairs(tutoring, need, score);
  const adjustedPairGap = adjustedPairs.length > 0
    ? adjustedPairs.reduce((sum, pair) => sum + pair.weight * pair.gap, 0) / adjustedPairs.reduce((sum, pair) => sum + pair.weight, 0)
    : null;
  const pairScores = adjustedPairs.flatMap((pair) => [pair.tutoredScore, pair.untutoredScore]);
  const scoreMin = Math.min(crudeTutoredScore, crudeUntutoredScore, causalTutoredScore, causalUntutoredScore, ...pairScores);
  const scoreMax = Math.max(crudeTutoredScore, crudeUntutoredScore, causalTutoredScore, causalUntutoredScore, ...pairScores);
  const scorePadding = Math.max((scoreMax - scoreMin) * 0.08, 1);

  return {
    crudeTutoredScore,
    crudeUntutoredScore,
    crudeGap,
    causalTutoredScore,
    causalUntutoredScore,
    causalGap,
    tutoredNeed,
    untutoredNeed,
    needDiff,
    adjustmentSet,
    visualRead,
    verdict,
    conclusion,
    academicNeedAdjusted,
    adjustedPairs,
    adjustedPairGap,
    scoreDomain: [scoreMin - scorePadding, scoreMax + scorePadding]
  };
}

function tutoringAdjustedPairs(tutoring: SimulatedNodeState, need: SimulatedNodeState, score: SimulatedNodeState): TutoringAdjustedPair[] {
  return ([0, 1] as const).flatMap((needValue) => {
    const untutoredScore = weightedJointConditionalMean(need, needValue, tutoring, 0, score);
    const tutoredScore = weightedJointConditionalMean(need, needValue, tutoring, 1, score);
    const weight = weightedBinaryShare(need, needValue);
    if (untutoredScore === null || tutoredScore === null || weight === null) return [];
    const untutoredSamples = jointSamplesForPair(need, needValue, tutoring, 0, score);
    const tutoredSamples = jointSamplesForPair(need, needValue, tutoring, 1, score);
    return [{
      needValue,
      label: needValue === 1 ? "High need" : "Low need",
      weight,
      untutoredScore,
      tutoredScore,
      gap: tutoredScore - untutoredScore,
      untutoredSamples,
      tutoredSamples
    }];
  });
}

function jointSamplesForPair(need: SimulatedNodeState, needValue: 0 | 1, tutoring: SimulatedNodeState, tutoringValue: 0 | 1, score: SimulatedNodeState): number[] {
  const scores = score.empirical.samples;
  const needs = need.empirical.samples;
  const tutoringValues = tutoring.empirical.samples;
  const length = Math.min(scores.length, needs.length, tutoringValues.length);
  const out: number[] = [];
  for (let index = 0; index < length; index += 1) {
    const scoreValue = scores[index];
    const needSample = needs[index];
    const tutoringSample = tutoringValues[index];
    if (
      scoreValue === undefined ||
      needSample === undefined ||
      tutoringSample === undefined ||
      !Number.isFinite(scoreValue) ||
      !Number.isFinite(needSample) ||
      !Number.isFinite(tutoringSample)
    ) continue;
    if (Math.round(needSample) !== needValue || Math.round(tutoringSample) !== tutoringValue) continue;
    out.push(scoreValue);
  }
  return out;
}

function computeFrontDoorSmokingOutput(context: OutputContext): HuhCompletedOutput | null {
  const { document, simulation } = context;
  const smoking = simulation.nodeStates.Smoking;
  const cancer = simulation.nodeStates.Cancer;
  const geneticRisk = simulation.nodeStates.Genetic_risk;
  if (!smoking || !cancer || !geneticRisk) return null;
  const rawSmokerCancer = weightedConditionalMean(smoking, cancer, 1);
  const rawNonSmokerCancer = weightedConditionalMean(smoking, cancer, 0);
  const smokerRisk = weightedConditionalMean(smoking, geneticRisk, 1);
  const nonSmokerRisk = weightedConditionalMean(smoking, geneticRisk, 0);
  if (rawSmokerCancer === null || rawNonSmokerCancer === null || smokerRisk === null || nonSmokerRisk === null) return null;
  const doSmoke = runSimulation(document.graph, { ...document.simulation, overrides: { Smoking: 1 }, selections: {} });
  const doNoSmoke = runSimulation(document.graph, { ...document.simulation, overrides: { Smoking: 0 }, selections: {} });
  const doSmokeCancer = doSmoke.nodeStates.Cancer?.empirical.mean;
  const doNoSmokeCancer = doNoSmoke.nodeStates.Cancer?.empirical.mean;
  const doSmokeTar = doSmoke.nodeStates.Tar?.empirical.mean;
  const doNoSmokeTar = doNoSmoke.nodeStates.Tar?.empirical.mean;
  if (
    doSmokeCancer === null ||
    doSmokeCancer === undefined ||
    doNoSmokeCancer === null ||
    doNoSmokeCancer === undefined ||
    doSmokeTar === null ||
    doSmokeTar === undefined ||
    doNoSmokeTar === null ||
    doNoSmokeTar === undefined
  ) return null;
  const rawDiff = rawSmokerCancer - rawNonSmokerCancer;
  const doDiff = doSmokeCancer - doNoSmokeCancer;
  const tarShift = doSmokeTar - doNoSmokeTar;
  const riskGap = smokerRisk - nonSmokerRisk;
  return {
    badge: "front door",
    conclusion: `The raw smoking-cancer difference is ${formatPercentagePoints(rawDiff)}, but smokers also differ on latent Genetic_risk by ${formatSignedValue(riskGap)}. The useful causal read is the mediated DGP do difference: do(Smoking=1) changes Tar by ${formatSignedValue(tarShift)} and changes Cancer by ${formatPercentagePoints(doDiff)} under this DGP.`,
    metrics: [
      { label: "Raw cancer difference", value: formatPercentagePoints(rawDiff), detail: `smokers ${formatPercent(rawSmokerCancer)} vs non-smokers ${formatPercent(rawNonSmokerCancer)}`, numericValue: rawDiff },
      { label: "DGP do difference", value: formatPercentagePoints(doDiff), detail: `do(smoke) ${formatPercent(doSmokeCancer)} vs do(no smoke) ${formatPercent(doNoSmokeCancer)}`, numericValue: doDiff },
      { label: "Mediator shift", value: formatSignedValue(tarShift), detail: `Tar moves from ${formatValue(doNoSmokeTar)} to ${formatValue(doSmokeTar)}`, numericValue: tarShift },
      { label: "Genetic-risk imbalance", value: formatSignedValue(riskGap), detail: `smokers have higher Genetic_risk in the observed data`, numericValue: riskGap }
    ],
    bullets: [
      { label: "Huh", text: "Hidden confounding blocks ordinary backdoor adjustment, but the observed mediator still carries a front-door style causal story." },
      { label: "Mechanism", text: "Smoking -> Tar -> Cancer is the directed path; Genetic_risk confounds Smoking and Cancer." },
      { label: "Caveat", text: "This card shows the DGP do difference, not a full nonparametric front-door estimator from data." }
    ]
  };
}

function computeBirthweightParadoxOutput(context: OutputContext): HuhCompletedOutput | null {
  const { document, simulation } = context;
  const smoking = simulation.nodeStates.Smoking;
  const mortality = simulation.nodeStates.Infant_mortality;
  const frailty = simulation.nodeStates.Frailty;
  if (!smoking || !mortality || !frailty) return null;
  const selectedSmokerMortality = weightedConditionalMean(smoking, mortality, 1);
  const selectedNonSmokerMortality = weightedConditionalMean(smoking, mortality, 0);
  const selectedSmokerFrailty = weightedConditionalMean(smoking, frailty, 1);
  const selectedNonSmokerFrailty = weightedConditionalMean(smoking, frailty, 0);
  if (selectedSmokerMortality === null || selectedNonSmokerMortality === null || selectedSmokerFrailty === null || selectedNonSmokerFrailty === null) return null;
  const doSmoke = runSimulation(document.graph, { ...document.simulation, overrides: { Smoking: 1 }, selections: {} });
  const doNoSmoke = runSimulation(document.graph, { ...document.simulation, overrides: { Smoking: 0 }, selections: {} });
  const doSmokeMortality = doSmoke.nodeStates.Infant_mortality?.empirical.mean;
  const doNoSmokeMortality = doNoSmoke.nodeStates.Infant_mortality?.empirical.mean;
  if (doSmokeMortality === null || doSmokeMortality === undefined || doNoSmokeMortality === null || doNoSmokeMortality === undefined) return null;
  const selectedDiff = selectedSmokerMortality - selectedNonSmokerMortality;
  const doDiff = doSmokeMortality - doNoSmokeMortality;
  const frailtyGap = selectedSmokerFrailty - selectedNonSmokerFrailty;
  return {
    badge: "birthweight paradox",
    conclusion: `Inside the low-birthweight sample, smoking is associated with a ${formatPercentagePoints(selectedDiff)} mortality difference. In the full DGP, do(Smoking=1) changes infant mortality by ${formatPercentagePoints(doDiff)}. The difference is the selected low-birthweight world: non-smoking low-birthweight babies are much frailer on average.`,
    metrics: [
      { label: "Selected-sample difference", value: formatPercentagePoints(selectedDiff), detail: `smoking ${formatPercent(selectedSmokerMortality)} vs no smoking ${formatPercent(selectedNonSmokerMortality)}`, numericValue: selectedDiff },
      { label: "DGP do difference", value: formatPercentagePoints(doDiff), detail: `do(smoke) ${formatPercent(doSmokeMortality)} vs do(no smoke) ${formatPercent(doNoSmokeMortality)}`, numericValue: doDiff },
      { label: "Frailty imbalance", value: formatSignedValue(frailtyGap), detail: `smokers ${formatValue(selectedSmokerFrailty)} vs non-smokers ${formatValue(selectedNonSmokerFrailty)}`, numericValue: frailtyGap }
    ],
    bullets: [
      { label: "Huh", text: "Conditioning on low birthweight compares smoking-caused small babies to babies made small by severe latent frailty." },
      { label: "Selection", text: "Birthweight is downstream of Smoking and Frailty, so the low-birthweight analysis sample is a conditioned collider world." },
      { label: "Report", text: "The birthweight-restricted contrast is not the total effect of smoking." }
    ]
  };
}

function computeObesityParadoxOutput(context: OutputContext): HuhCompletedOutput | null {
  const { document, simulation } = context;
  const obesity = simulation.nodeStates.Obesity;
  const mortality = simulation.nodeStates.Mortality;
  const frailty = simulation.nodeStates.Frailty;
  if (!obesity || !mortality || !frailty) return null;
  const selectedObeseMortality = weightedConditionalMean(obesity, mortality, 1);
  const selectedNonObeseMortality = weightedConditionalMean(obesity, mortality, 0);
  const selectedObeseFrailty = weightedConditionalMean(obesity, frailty, 1);
  const selectedNonObeseFrailty = weightedConditionalMean(obesity, frailty, 0);
  if (selectedObeseMortality === null || selectedNonObeseMortality === null || selectedObeseFrailty === null || selectedNonObeseFrailty === null) return null;
  const doObese = runSimulation(document.graph, { ...document.simulation, overrides: { Obesity: 1 }, selections: {} });
  const doNonObese = runSimulation(document.graph, { ...document.simulation, overrides: { Obesity: 0 }, selections: {} });
  const doObeseMortality = doObese.nodeStates.Mortality?.empirical.mean;
  const doNonObeseMortality = doNonObese.nodeStates.Mortality?.empirical.mean;
  if (doObeseMortality === null || doObeseMortality === undefined || doNonObeseMortality === null || doNonObeseMortality === undefined) return null;
  const selectedDiff = selectedObeseMortality - selectedNonObeseMortality;
  const doDiff = doObeseMortality - doNonObeseMortality;
  const frailtyGap = selectedObeseFrailty - selectedNonObeseFrailty;
  return {
    badge: "obesity paradox",
    conclusion: `Obesity looks protective here — but that is the selection talking. Chronic_disease is a collider of Obesity and Frailty, so inside the diseased sample an obese patient is on average less frail than a non-obese one. Intervene on the whole population and the sign flips: Obesity raises Mortality.`,
    shift: {
      title: "What the records show vs. what intervening would do",
      axisLabel: "mortality difference (percentage points)",
      observed: {
        label: "In the diseased records",
        sublabel: `obese ${formatPercent(selectedObeseMortality)} · non-obese ${formatPercent(selectedNonObeseMortality)}`,
        value: formatPercentagePoints(selectedDiff),
        numeric: selectedDiff
      },
      causal: {
        label: "If you intervened on everyone",
        sublabel: `do(1) ${formatPercent(doObeseMortality)} · do(0) ${formatPercent(doNonObeseMortality)}`,
        value: formatPercentagePoints(doDiff),
        numeric: doDiff
      },
      caption: `Same outcome, two estimands. Selecting on Chronic_disease — a common effect of Obesity and Frailty — opens a backdoor that the population do() closes, so the observed association lands on the opposite side of zero from the real effect.`
    },
    metrics: [
      { label: "Frailty imbalance in the sample", value: formatSignedValue(frailtyGap), detail: `obese ${formatValue(selectedObeseFrailty)} vs non-obese ${formatValue(selectedNonObeseFrailty)} — the collider artefact`, numericValue: frailtyGap }
    ],
    bullets: [
      { label: "Selection", text: "Chronic_disease is a selected common effect of Obesity and Frailty." },
      { label: "Report", text: "The disease-restricted association should not be read as a population obesity effect." }
    ]
  };
}

function computeCatsHighriseSyndromeOutput(context: OutputContext): HuhCompletedOutput | null {
  const { document, simulation } = context;
  const survival = simulation.nodeStates.Survival;
  const injury = simulation.nodeStates.Injury_severity;
  const height = simulation.nodeStates.Fall_height;
  if (!survival || !injury || !height) return null;
  const recordedSurvival = weightedBinaryShare(survival, 1);
  if (recordedSurvival === null) return null;
  const recordedMeanHeight = height.empirical.mean;
  // Population terminal-velocity curve under do(fall height) plus the unselected population.
  const doPeak = runSimulation(document.graph, { ...document.simulation, overrides: { Fall_height: 7 }, selections: {} });
  const doTall = runSimulation(document.graph, { ...document.simulation, overrides: { Fall_height: 20 }, selections: {} });
  const full = runSimulation(document.graph, { ...document.simulation, selections: {} });
  const injuryPeak = doPeak.nodeStates.Injury_severity?.empirical.mean;
  const injuryTall = doTall.nodeStates.Injury_severity?.empirical.mean;
  const survivalPeak = doPeak.nodeStates.Survival?.empirical.mean;
  const survivalTall = doTall.nodeStates.Survival?.empirical.mean;
  const fullSurvival = full.nodeStates.Survival;
  const populationSurvival = fullSurvival ? weightedBinaryShare(fullSurvival, 1) : null;
  if (
    injuryPeak === null || injuryPeak === undefined || injuryTall === null || injuryTall === undefined ||
    survivalPeak === null || survivalPeak === undefined || survivalTall === null || survivalTall === undefined ||
    populationSurvival === null
  ) return null;
  const injuryGap = injuryPeak - injuryTall; // positive: the 7th floor injures more than the 20th
  const survivalGap = survivalPeak - survivalTall; // negative: the 7th floor is deadlier than the 20th
  const selectionInflation = recordedSurvival - populationSurvival; // positive: records overstate survival
  // Precise estimand + bad-control verdict for the active operation on Brought_to_vet.
  const vetRole = context.analysis.conditioningRoles.find((entry) => entry.node === "Brought_to_vet");
  const estimand = describeEstimand({
    operation: vetRole?.operation ?? "select",
    exposureLabel: "fall height",
    outcomeLabel: "Survival",
    nodeLabel: "Brought_to_vet",
    value: 1
  });
  const badControl = vetRole ? badControlWarning("Brought_to_vet", vetRole.classification) : null;
  // Three-way stratified contrast on the collider (all / select vet=1 / condition vet=0),
  // plus the standardized "adjust" estimand, from the unconditioned population.
  const stratified = stratifyRiskCurves(full, "Fall_height", "Survival", "Brought_to_vet", 7);
  const stratifiedText = stratified
    ? (() => {
        const s1 = stratified.strata.find((s) => s.stratumValue === 1);
        const s0 = stratified.strata.find((s) => s.stratumValue === 0);
        const standardizedOverall = stratified.strata.reduce((sum, s) => sum + s.share * s.outcomeRate, 0);
        return `Condition on Brought_to_vet and survival splits three ways: all ${formatPercent(stratified.crude.outcomeRate)}, select vet=1 ${s1 ? formatPercent(s1.outcomeRate) : "?"}, vet=0 ${s0 ? formatPercent(s0.outcomeRate) : "?"}. Selecting one stratum is the bias; adjusting (standardizing over vet) re-marginalizes back to ${formatPercent(standardizedOverall)} ≈ the crude truth.`;
      })()
    : null;
  return {
    badge: "falling-cats paradox",
    conclusion: `Recorded cats fall from a mean of ${recordedMeanHeight === null ? "?" : formatValue(recordedMeanHeight)} stories and ${formatPercent(recordedSurvival)} survive, so the data makes long falls look safe. Two things drive it: a real terminal-velocity effect makes injury severity peak near the seventh story and then fall, and selecting on brought to vet drops the cats killed outright. Intervening still says the 7th floor is the worst place to fall from — at do(fall height = 7), Survival is ${formatPercent(survivalPeak)} versus ${formatPercent(survivalTall)} at the 20th.`,
    metrics: [
      { label: "injury severity: 7th vs 20th floor", value: formatSignedValue(injuryGap), detail: `terminal-velocity J-curve: injury severity ${formatValue(injuryPeak)} at 7 stories vs ${formatValue(injuryTall)} at 20`, numericValue: injuryGap },
      { label: "do(7th) vs do(20th) survival", value: formatPercentagePoints(survivalGap), detail: "the deadliest height is the mid-rise fall, not the 32nd floor", numericValue: survivalGap },
      { label: "recorded vs true survival", value: formatPercentagePoints(selectionInflation), detail: `clinic records ${formatPercent(recordedSurvival)} vs full population ${formatPercent(populationSurvival)}`, numericValue: selectionInflation }
    ],
    bullets: [
      { label: "Huh", text: "In the recorded data, cats from very high falls look as safe as cats from the seventh floor." },
      { label: "Physics", text: "Injury severity is non-monotonic in height: it peaks near terminal velocity, then drops as the cat relaxes and spreads out to add drag." },
      { label: "Estimand", text: `${estimand.formal} — ${estimand.plain}` },
      { label: "Bad control", text: badControl ?? "Brought_to_vet is the selected collider (a common effect of Survival and injury): cats that die on impact are rarely brought in, so the recorded sample is conditioned on it." },
      ...(stratifiedText ? [{ label: "Stratify", text: stratifiedText }] : []),
      { label: "Report", text: "Do not read 'higher is safer' as a clean causal law: the deadliest do() is the mid-rise fall, and the records omit the cats that never arrived." }
    ]
  };
}

function computePolicingEncountersOutput(context: OutputContext): HuhCompletedOutput | null {
  const { document, simulation } = context;
  const group = simulation.nodeStates.Group_A;
  const force = simulation.nodeStates.Use_of_force;
  const risk = simulation.nodeStates.Incident_risk;
  if (!group || !force || !risk) return null;
  const selectedGroupForce = weightedConditionalMean(group, force, 1);
  const selectedOtherForce = weightedConditionalMean(group, force, 0);
  const selectedGroupRisk = weightedConditionalMean(group, risk, 1);
  const selectedOtherRisk = weightedConditionalMean(group, risk, 0);
  if (selectedGroupForce === null || selectedOtherForce === null || selectedGroupRisk === null || selectedOtherRisk === null) return null;
  const doGroup = runSimulation(document.graph, { ...document.simulation, overrides: { Group_A: 1 }, selections: {} });
  const doOther = runSimulation(document.graph, { ...document.simulation, overrides: { Group_A: 0 }, selections: {} });
  const doGroupForce = doGroup.nodeStates.Use_of_force?.empirical.mean;
  const doOtherForce = doOther.nodeStates.Use_of_force?.empirical.mean;
  if (doGroupForce === null || doGroupForce === undefined || doOtherForce === null || doOtherForce === undefined) return null;
  const encounterDiff = selectedGroupForce - selectedOtherForce;
  const structuralDiff = doGroupForce - doOtherForce;
  const riskGap = selectedGroupRisk - selectedOtherRisk;
  return {
    badge: "selected data",
    conclusion: `Among police contacts, Group_A has a use-of-force contrast of ${formatPercentagePoints(encounterDiff)} in this toy DGP. The population structural contrast is ${formatPercentagePoints(structuralDiff)}. The denominator changed: contact selection makes Group_A contacts lower-risk by ${formatSignedValue(riskGap)} on latent incident risk.`,
    metrics: [
      { label: "encounter-only read", value: formatPercentagePoints(encounterDiff), detail: `Group_A ${formatPercent(selectedGroupForce)} vs other ${formatPercent(selectedOtherForce)}`, numericValue: encounterDiff },
      { label: "population contrast", value: formatPercentagePoints(structuralDiff), detail: `synthetic do(group A) ${formatPercent(doGroupForce)} vs do(other) ${formatPercent(doOtherForce)}`, numericValue: structuralDiff },
      { label: "risk gap in contacts", value: formatSignedValue(riskGap), detail: `Group_A ${formatValue(selectedGroupRisk)} vs other ${formatValue(selectedOtherRisk)}`, numericValue: riskGap }
    ],
    bullets: [
      { label: "Huh", text: "Encounter-only data are already conditioned on Police_contact, and contact is part of the causal process." },
      { label: "Careful wording", text: "This is a synthetic denominator example, not an empirical claim about a real police department." },
      { label: "Report", text: "Separate upstream contact risk from conditional force risk." }
    ]
  };
}

function computeMBiasOutput(context: OutputContext): HuhCompletedOutput | null {
  const { simulation } = context;
  const exposure = simulation.nodeStates.Exposure;
  const outcome = simulation.nodeStates.Outcome;
  const collider = simulation.nodeStates.Collider_score;
  if (!exposure || !outcome || !collider) return null;
  const rawExposed = weightedConditionalMean(exposure, outcome, 1);
  const rawUnexposed = weightedConditionalMean(exposure, outcome, 0);
  if (rawExposed === null || rawUnexposed === null) return null;
  const rawInterval = filteredMeanDifferenceInterval(exposure, outcome, null);
  const cutoff = quantile(collider.empirical.samples, 0.7);
  if (cutoff === null) return null;
  const adjustedExposed = filteredConditionalMean(exposure, outcome, 1, collider, (value) => value >= cutoff);
  const adjustedUnexposed = filteredConditionalMean(exposure, outcome, 0, collider, (value) => value >= cutoff);
  if (adjustedExposed === null || adjustedUnexposed === null) return null;
  const conditionedInterval = filteredMeanDifferenceInterval(exposure, outcome, (index) => {
    const value = collider.empirical.samples[index];
    return value !== undefined && Number.isFinite(value) && value >= cutoff;
  });
  const rawGap = rawExposed - rawUnexposed;
  const colliderGap = adjustedExposed - adjustedUnexposed;
  const rawUncertainty = rawInterval ? intervalDetail(rawInterval) : "uncertainty unavailable";
  const conditionedUncertainty = conditionedInterval ? intervalDetail(conditionedInterval) : "uncertainty unavailable";
  return {
    badge: "bad control",
    conclusion: `Before adjustment, Exposure and Outcome differ by ${formatSignedValue(rawGap)} (${rawUncertainty}), which is compatible with the null in this finite sample. After conditioning on high Collider_score, the apparent gap becomes ${formatSignedValue(colliderGap)} (${conditionedUncertainty}) even though the DAG has no Exposure -> Outcome path.`,
    metrics: [
      { label: "Raw outcome difference", value: formatSignedValue(rawGap), detail: `${rawUncertainty}; exposed ${formatValue(rawExposed)} vs unexposed ${formatValue(rawUnexposed)}`, numericValue: rawGap, lower: rawInterval?.lower, upper: rawInterval?.upper },
      { label: "Conditioned difference", value: formatSignedValue(colliderGap), detail: `${conditionedUncertainty}; within Collider_score >= ${formatValue(cutoff)}`, numericValue: colliderGap, lower: conditionedInterval?.lower, upper: conditionedInterval?.upper },
      { label: "DGP do difference", value: formatSignedValue(0), detail: "no directed path from Exposure to Outcome", numericValue: 0 }
    ],
    bullets: [
      { label: "Huh", text: "A pre-treatment variable can still be a collider; adjusting for it opens a path that was closed." },
      { label: "Path", text: "Exposure <- Cause_of_exposure -> Collider_score <- Cause_of_outcome -> Outcome opens when Collider_score is conditioned on." },
      { label: "Report", text: "No adjustment is better than adjusting for this collider." }
    ]
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

function computeChessSimpleFlipOutput(context: OutputContext): HuhCompletedOutput | null {
  const { document, simulation } = context;
  const full = runSimulation(document.graph, { ...document.simulation, selections: {} });
  const fullIq = full.nodeStates.Intelligence;
  const fullPractice = full.nodeStates.Practice_hours;
  const fullElo = full.nodeStates.Chess_Elo;
  const selectedIq = simulation.nodeStates.Intelligence;
  const selectedPractice = simulation.nodeStates.Practice_hours;
  const selectedElo = simulation.nodeStates.Chess_Elo;
  if (!fullIq || !fullPractice || !fullElo || !selectedIq || !selectedPractice || !selectedElo) return null;
  const fullIqElo = correlation(fullIq.empirical.samples, fullElo.empirical.samples);
  const selectedIqElo = correlation(selectedIq.empirical.samples, selectedElo.empirical.samples);
  const selectedIqPractice = correlation(selectedIq.empirical.samples, selectedPractice.empirical.samples);
  const selectedPracticeElo = correlation(selectedPractice.empirical.samples, selectedElo.empirical.samples);
  return {
    badge: "selected sign flip",
    conclusion: `In the full DGP, intelligence and rating correlate ${formatSignedValue(fullIqElo)}. Inside the selected rated/elite sample, the correlation flips to ${formatSignedValue(selectedIqElo)} because intelligence and practice become substitute routes into the sample.`,
    metrics: [
      { label: "full-pop IQ/Elo", value: formatSignedValue(fullIqElo), detail: "before selecting the rated/elite sample", numericValue: fullIqElo },
      { label: "selected IQ/Elo", value: formatSignedValue(selectedIqElo), detail: `${simulation.conditioning.acceptedSamples} selected samples`, numericValue: selectedIqElo },
      { label: "selected IQ/practice", value: formatSignedValue(selectedIqPractice), detail: "substitute routes inside selected sample", numericValue: selectedIqPractice },
      { label: "practice/Elo", value: formatSignedValue(selectedPracticeElo), detail: "practice remains the dominant selected-sample driver", numericValue: selectedPracticeElo }
    ],
    bullets: [
      { label: "Huh", text: "A helpful trait in the population can correlate negatively with performance inside a selected sample." },
      { label: "Selection", text: "Children can enter the rated sample through high intelligence, high practice, or both." },
      { label: "Report", text: "The selected-sample correlation is not the same object as the full-population mechanism." }
    ]
  };
}

