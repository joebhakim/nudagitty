import { analyzeAdjustment, cohortFromSimulationResult, compareLongitudinalGMethods, deriveAdjustmentSpec, estimateSurvivalCurve, normalizeVariableModel, runSimulation } from "@nudagitty/core";
import type { GMethodEstimate, GMethodsComparison, SimulatedNodeState, SurvivalCurvePoint } from "@nudagitty/core";
import type React from "react";
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
import { stratifyRiskCurves } from "./stratify";
import type { CompletedOutputModule, CompletedOutputRenderOptions, OutputContext } from "./types";

type SimpsonCompletedOutput = {
  crudeTreatedRecovery: number;
  crudeUntreatedRecovery: number;
  crudeDiff: number;
  causalTreatedRecovery: number;
  causalUntreatedRecovery: number;
  causalDiff: number;
  treatedSeverity: number;
  untreatedSeverity: number;
  severityDiff: number;
  adjustmentSet: string;
  visualRead: string;
  paradox: string;
  conclusion: string;
  severityAdjusted: boolean;
};

type IcuCompletedOutput = {
  crudeIcuMortality: number;
  crudeWardMortality: number;
  crudeDiff: number;
  causalIcuMortality: number;
  causalWardMortality: number;
  causalDiff: number;
  icuSeverity: number;
  wardSeverity: number;
  severityDiff: number;
  icuTriage: number;
  wardTriage: number;
  triageDiff: number;
  adjustmentSet: string;
  visualRead: string;
  colliderWarning: string;
  verdict: string;
  conclusion: string;
};

type CollegeCompletedOutput = {
  crudeCollegeEarnings: number;
  crudeNoCollegeEarnings: number;
  crudePremium: number;
  causalCollegeEarnings: number;
  causalNoCollegeEarnings: number;
  causalPremium: number;
  collegeFamilyIncome: number;
  noCollegeFamilyIncome: number;
  incomeDiff: number;
  adjustmentSet: string;
  visualRead: string;
  verdict: string;
  conclusion: string;
  binnedBins: CollegeBinnedAdjustmentBin[];
  binnedPremium: number | null;
  earningsDomain: [number, number];
};

type CollegeBinnedAdjustmentBin = {
  index: number;
  label: string;
  lower: number;
  upper: number;
  weight: number;
  collegeCount: number;
  noCollegeCount: number;
  collegeEarnings: number | null;
  noCollegeEarnings: number | null;
  gap: number | null;
  collegeSamples: number[];
  noCollegeSamples: number[];
  warning: string | null;
};

type TutoringCompletedOutput = {
  crudeTutoredScore: number;
  crudeUntutoredScore: number;
  crudeGap: number;
  causalTutoredScore: number;
  causalUntutoredScore: number;
  causalGap: number;
  tutoredNeed: number;
  untutoredNeed: number;
  needDiff: number;
  adjustmentSet: string;
  visualRead: string;
  verdict: string;
  conclusion: string;
  academicNeedAdjusted: boolean;
  adjustedPairs: TutoringAdjustedPair[];
  adjustedPairGap: number | null;
  scoreDomain: [number, number];
};

type TutoringAdjustedPair = {
  needValue: 0 | 1;
  label: string;
  weight: number;
  tutoredScore: number;
  untutoredScore: number;
  gap: number;
  tutoredSamples: number[];
  untutoredSamples: number[];
};

type HuhMetric = {
  label: string;
  value: string;
  detail: string;
  numericValue?: number;
  lower?: number;
  upper?: number;
};

// The contrast at the heart of a paradox card: a naive observed estimate versus
// the corrected causal estimate of the SAME quantity. Replaces the old, ambiguous
// "before / after" plot (which just charted metrics[0] vs metrics[1], even when
// those were unrelated quantities).
type HuhShiftRow = { label: string; sublabel?: string; value: string; numeric: number; lower?: number; upper?: number };
type HuhShift = {
  title: string;
  axisLabel: string;
  caption: string;
  observed: HuhShiftRow;
  causal: HuhShiftRow;
};

type HuhCompletedOutput = {
  badge: string;
  conclusion: string;
  metrics: HuhMetric[];
  bullets: Array<{ label: string; text: string }>;
  shift?: HuhShift;
};

type WhatIfOutputScale = "risk" | "mean";
type WhatIfOutputView = "generic" | "survival" | "dynamic" | "g_estimation" | "ipcw" | "survival_time";

type WhatIfStrategySurvivalSummary = {
  strategyId: string;
  label: string;
  points: SurvivalCurvePoint[];
  finalRisk: number | null;
  finalSurvival: number | null;
  totalEvents: number;
  totalCensored: number;
  sampleSize: number;
  effectiveSampleSize: number | null;
};

type WhatIfSurvivalSummary = {
  label: string;
  strategies: WhatIfStrategySurvivalSummary[];
  natural: WhatIfStrategySurvivalSummary | null;
  riskDifference: number | null;
  survivalDifference: number | null;
};

type WhatIfAdvancedOutput = {
  badge: string;
  title: string;
  view: WhatIfOutputView;
  denominatorsOpen: boolean;
  comparison: GMethodsComparison | null;
  survival: WhatIfSurvivalSummary | null;
  conclusion: string;
  outcomeScale: WhatIfOutputScale;
  outcomeUnit: string;
  source: string;
  sourceUrl: string;
  sourceDetail: string;
};

export type BasicOutputPunchlineMetric = {
  label: string;
  value: string;
  detail: string;
  numericValue: number | null;
  lower?: number;
  upper?: number;
};

export type BasicOutputPunchline = {
  badge: string;
  title: string;
  observed: BasicOutputPunchlineMetric;
  comparison: BasicOutputPunchlineMetric;
  note: string;
};

export type ComputedCompletedOutput = {
  moduleId: string;
  module: CompletedOutputModule<unknown>;
  result: unknown | null;
};

export const completedOutputModules: CompletedOutputModule<unknown>[] = [
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
      <ul className="completed-output-list">
        {output.bullets.map((bullet) => (
          <li key={bullet.label}><strong>{bullet.label}:</strong> {bullet.text}</li>
        ))}
      </ul>
    </CompletedOutputShell>
  );
}

function renderWhatIfAdvancedOutput(output: WhatIfAdvancedOutput) {
  const comparison = output.comparison;
  const methodsOpen = output.view === "g_estimation" || output.view === "ipcw";
  return (
    <CompletedOutputShell badge={output.badge} title={output.title} conclusion={output.conclusion}>
      <WhatIfMetricGrid output={output} />
      {output.survival && (output.view === "survival" || output.view === "survival_time") && (
        <WhatIfStrategySurvivalCurve summary={output.survival} survivalTime={output.view === "survival_time"} denominatorsOpen={output.denominatorsOpen} />
      )}
      {comparison && output.view === "dynamic" && <WhatIfDynamicSupport comparison={comparison} />}
      {comparison && <MethodsComparisonPanel comparison={comparison} outcomeScale={output.outcomeScale} outcomeUnit={output.outcomeUnit} defaultOpen={methodsOpen} />}
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
    plain: "Compares the outcome by the treatment people actually took. Confounded by anything that drives both the treatment and the outcome.",
    formula: "E[ Y | A = a, uncensored ]"
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
  }
};

// The canonical adjustment readout — the g-method estimator table + the glossary.
// Used identically for every example (classic or longitudinal) so the same operation
// always renders the same panel.
export function MethodsComparisonPanel(props: { comparison: GMethodsComparison; outcomeScale: "risk" | "mean"; outcomeUnit: string; defaultOpen?: boolean }) {
  const { comparison, outcomeScale, outcomeUnit } = props;
  return (
    <>
      <details className="what-if-method-table-card" open={props.defaultOpen}>
        <summary className="module-card-header">
          <strong>Methods</strong>
          <span>{formatWeightedCount(comparison.cohort.sampleSize)} simulated rows</span>
        </summary>
        <table className="what-if-method-table">
          <thead>
            <tr>
              <th>Method</th>
              <th>{comparison.strategies[0].label}</th>
              <th>{comparison.strategies[1].label}</th>
              <th>Difference</th>
            </tr>
          </thead>
          <tbody>
            {comparison.estimates.map((estimate) => (
              <tr key={estimate.id}>
                <td>
                  <strong>{estimate.label}</strong>
                  <small>{estimate.diagnostics[0] ?? ""}</small>
                </td>
                <td>{formatOutcomeValue(estimate.arms[0].mean, outcomeScale, outcomeUnit)}</td>
                <td>{formatOutcomeValue(estimate.arms[1].mean, outcomeScale, outcomeUnit)}</td>
                <td className={estimateToneClass(estimate.estimate)}>{formatOutcomeDifference(estimate.estimate, outcomeScale, outcomeUnit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <WhatIfMethodGlossary comparison={comparison} />
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
      </dl>
      <p className="what-if-method-glossary-note">
        g-formula is the do()-resimulated oracle here. The others estimate the same effect from the observed
        cohort — they agree with the oracle when the confounders are correctly adjusted, and reveal bias when
        they don&rsquo;t.
      </p>
    </details>
  );
}

function WhatIfMetricGrid(props: { output: WhatIfAdvancedOutput }) {
  const comparison = props.output.comparison;
  const gFormula = comparison?.estimates.find((estimate) => estimate.id === "g_formula");
  const ipw = comparison?.estimates.find((estimate) => estimate.id === "ipw");
  const naive = comparison?.estimates.find((estimate) => estimate.id === "naive");
  const gEstimation = comparison?.estimates.find((estimate) => estimate.id === "g_estimation");
  const survival = props.output.survival;
  const support = comparison ? minimumObservedSupport(comparison) : null;
  if (!comparison && !survival) return null;
  if (props.output.view === "survival" && survival) {
    return (
      <div className="completed-metric-grid what-if-metrics">
        <div>
          <span>Final risk difference</span>
          <strong>{formatOutcomeDifference(survival.riskDifference, "risk", "")}</strong>
          <small>{comparison ? `${comparison.strategies[0].label} vs ${comparison.strategies[1].label}` : survival.label}</small>
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

function WhatIfStrategySurvivalCurve(props: { summary: WhatIfSurvivalSummary; survivalTime: boolean; denominatorsOpen: boolean }) {
  const width = 340;
  const series = props.summary.strategies.length > 0 ? props.summary.strategies : props.summary.natural ? [props.summary.natural] : [];
  if (series.length === 0) return null;
  const pointCount = Math.max(...series.map((entry) => entry.points.length));
  const frame = chartFrame({ width, height: 162, x: { ticks: true, title: true }, y: { ticks: true, title: true }, yDomain: [0, 1], insetX: 12, insetY: 6 });
  const { plot, anchors } = frame;
  const x = (index: number) => plot.x + (pointCount <= 1 ? plot.width / 2 : (index / (pointCount - 1)) * plot.width);
  const y = frame.yScale;
  const yTicks = [0, 0.5, 1];
  const path = (entry: WhatIfStrategySurvivalSummary) => entry.points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.survival)}`).join(" ");
  return (
    <div className="what-if-survival-card">
      <div className="module-card-header">
        <strong>{props.survivalTime ? "Observed-death survival by strategy" : "Survival curves by strategy"}</strong>
        <span>{props.summary.label}</span>
      </div>
      <p className="what-if-survival-method">
        Counterfactual survival under each strategy — the g-formula curve: the model is re-simulated with
        <em> everyone</em> assigned that strategy, not the observed (confounded) sub-group. The natural-course
        line below is the observed cohort for reference.
      </p>
      <svg className="what-if-survival-plot" viewBox={`0 0 ${width} ${frame.height}`} role="img" aria-label={`${props.summary.label} survival curves by strategy`}>
        <line className="huh-shift-axis" x1={plot.x} y1={plot.bottom} x2={plot.right} y2={plot.bottom} />
        <line className="huh-shift-axis" x1={plot.x} y1={plot.y} x2={plot.x} y2={plot.bottom} />
        {yTicks.map((tick) => (
          <text key={tick} className="huh-shift-axis-label" x={anchors.ticks.yX} y={y(tick) + 4} style={{ textAnchor: "end" }}>{formatPercent(tick)}</text>
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
          <text key={point.interval} className="what-if-survival-label" x={x(index)} y={anchors.ticks.xY}>{index + 1}</text>
        ))}
        <text className="what-if-survival-axis-title" x={plot.cx} y={anchors.title.xY} style={{ textAnchor: "middle" }}>follow-up interval</text>
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
}

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
  return (
    <details className="completed-output-card" open>
      <summary className="module-card-header completed-output-summary">
        <strong>{props.title ?? "Interpretation"}</strong>
        <span className="module-badge active">{props.badge}</span>
      </summary>
      {/* One wrapper auto-chips every node name in the conclusion, visual reads,
          backdoor lines, metric labels and bullets below. */}
      <HighlightNames>
        <div className="completed-output-body">
          <p className="completed-conclusion">{props.conclusion}</p>
          {props.children}
        </div>
      </HighlightNames>
    </details>
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
    title: "Dynamic ART variants",
    view: "dynamic",
    conclusion: () => "Treatment variants are rules over CD4 history, not just an ever-treated label. The g-formula row materializes the dynamic rule before standardizing over histories.",
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
  const spec = deriveAdjustmentSpec(context.document);
  if (!spec) return null;
  const outcomeScale: WhatIfOutputScale = spec.outcomeScale;
  const outcomeNode = context.document.graph.nodes.find((node) => node.id === spec.outcome);
  const outcomeUnit = outcomeNode?.variable.unit ?? "";
  const comparison = analyzeAdjustment(context.document, spec);
  const source = context.document.metadata.sources.find((candidate) => candidate.id === "hernan-robins-what-if");
  const survivalSpec = config.survivalSpecId
    ? context.document.metadata.longitudinal.survivalOutputs.find((spec) => spec.id === config.survivalSpecId)
    : null;
  const survival = survivalSpec ? summarizeSurvival(context, survivalSpec.id, comparison) : null;
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

function summarizeSurvival(context: OutputContext, specId: string, comparison: GMethodsComparison | null): WhatIfSurvivalSummary | null {
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
  return {
    label: spec.label,
    strategies,
    natural,
    riskDifference: left && right && left.finalRisk !== null && right.finalRisk !== null ? left.finalRisk - right.finalRisk : null,
    survivalDifference: left && right && left.finalSurvival !== null && right.finalSurvival !== null ? left.finalSurvival - right.finalSurvival : null
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

  if (metrics.length === 0) return null;

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

function filteredConditionalMean(
  conditionState: SimulatedNodeState,
  outcomeState: SimulatedNodeState,
  conditionValue: 0 | 1,
  filterState: SimulatedNodeState,
  predicate: (value: number) => boolean
): number | null {
  const conditions = conditionState.empirical.samples;
  const outcomes = outcomeState.empirical.samples;
  const filters = filterState.empirical.samples;
  const length = Math.min(conditions.length, outcomes.length, filters.length);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < length; index += 1) {
    const condition = conditions[index];
    const outcome = outcomes[index];
    const filter = filters[index];
    if (
      condition === undefined ||
      outcome === undefined ||
      filter === undefined ||
      !Number.isFinite(condition) ||
      !Number.isFinite(outcome) ||
      !Number.isFinite(filter)
    ) continue;
    if ((condition >= 0.5 ? 1 : 0) !== conditionValue || !predicate(filter)) continue;
    numerator += outcome;
    denominator += 1;
  }
  return denominator > 0 ? numerator / denominator : null;
}

type MeanDifferenceInterval = {
  diff: number;
  lower: number;
  upper: number;
  n0: number;
  n1: number;
};

function filteredMeanDifferenceInterval(
  conditionState: SimulatedNodeState,
  outcomeState: SimulatedNodeState,
  predicate: ((index: number) => boolean) | null
): MeanDifferenceInterval | null {
  const group0 = weightedGroupMoments(conditionState, outcomeState, 0, predicate);
  const group1 = weightedGroupMoments(conditionState, outcomeState, 1, predicate);
  if (!group0 || !group1 || group0.nEff <= 1 || group1.nEff <= 1) return null;
  const diff = group1.mean - group0.mean;
  const se = Math.sqrt(group1.variance / group1.nEff + group0.variance / group0.nEff);
  return {
    diff,
    lower: diff - 1.96 * se,
    upper: diff + 1.96 * se,
    n0: Math.round(group0.nEff),
    n1: Math.round(group1.nEff)
  };
}

function weightedGroupMoments(
  conditionState: SimulatedNodeState,
  outcomeState: SimulatedNodeState,
  conditionValue: 0 | 1,
  predicate: ((index: number) => boolean) | null
): { mean: number; variance: number; nEff: number } | null {
  const conditions = conditionState.empirical.samples;
  const outcomes = outcomeState.empirical.samples;
  const length = Math.min(conditions.length, outcomes.length);
  let sumWeight = 0;
  let sumWeightSquared = 0;
  let sum = 0;
  const retained: Array<{ value: number; weight: number }> = [];
  for (let index = 0; index < length; index += 1) {
    if (predicate && !predicate(index)) continue;
    const condition = conditions[index];
    const outcome = outcomes[index];
    if (condition === undefined || outcome === undefined || !Number.isFinite(condition) || !Number.isFinite(outcome)) continue;
    if ((condition >= 0.5 ? 1 : 0) !== conditionValue) continue;
    const weight = empiricalSampleWeight(index, conditionState, outcomeState);
    if (weight <= 0) continue;
    retained.push({ value: outcome, weight });
    sumWeight += weight;
    sumWeightSquared += weight * weight;
    sum += outcome * weight;
  }
  if (sumWeight <= 0 || sumWeightSquared <= 0) return null;
  const mean = sum / sumWeight;
  const variance = retained.reduce((acc, item) => acc + item.weight * (item.value - mean) ** 2, 0) / sumWeight;
  return {
    mean,
    variance,
    nEff: sumWeight * sumWeight / sumWeightSquared
  };
}

function intervalDetail(interval: MeanDifferenceInterval): string {
  return `95% CI ${formatSignedValue(interval.lower)} to ${formatSignedValue(interval.upper)}`;
}

function weightedConditionalMeanOfDifference(
  conditionState: SimulatedNodeState,
  leftState: SimulatedNodeState,
  rightState: SimulatedNodeState,
  conditionValue: 0 | 1
): number | null {
  const conditions = conditionState.empirical.samples;
  const left = leftState.empirical.samples;
  const right = rightState.empirical.samples;
  const length = Math.min(conditions.length, left.length, right.length);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < length; index += 1) {
    const condition = conditions[index];
    const leftValue = left[index];
    const rightValue = right[index];
    if (
      condition === undefined ||
      leftValue === undefined ||
      rightValue === undefined ||
      !Number.isFinite(condition) ||
      !Number.isFinite(leftValue) ||
      !Number.isFinite(rightValue)
    ) continue;
    if ((condition >= 0.5 ? 1 : 0) !== conditionValue) continue;
    numerator += (leftValue - rightValue);
    denominator += 1;
  }
  return denominator > 0 ? numerator / denominator : null;
}

function quantile(values: number[], p: number): number | null {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const index = Math.min(finite.length - 1, Math.max(0, Math.floor((finite.length - 1) * p)));
  return finite[index] ?? null;
}

function correlation(x: number[], y: number[]): number {
  const paired = x.map((value, index) => [value, y[index]] as const)
    .filter((pair): pair is readonly [number, number] => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
  if (paired.length < 2) return 0;
  const meanX = paired.reduce((sum, pair) => sum + pair[0], 0) / paired.length;
  const meanY = paired.reduce((sum, pair) => sum + pair[1], 0) / paired.length;
  let numerator = 0;
  let xVariance = 0;
  let yVariance = 0;
  for (const [xValue, yValue] of paired) {
    const dx = xValue - meanX;
    const dy = yValue - meanY;
    numerator += dx * dy;
    xVariance += dx * dx;
    yVariance += dy * dy;
  }
  return numerator / Math.sqrt(Math.max(Number.EPSILON, xVariance * yVariance));
}
