import { normalizeVariableModel, runSimulation } from "@nudagitty/core";
import type { SimulatedNodeState } from "@nudagitty/core";
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

type HuhCompletedOutput = {
  badge: string;
  conclusion: string;
  metrics: HuhMetric[];
  bullets: Array<{ label: string; text: string }>;
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
    id: "lords-paradox",
    label: "estimand split",
    compute: computeLordsParadoxOutput,
    render: (result) => renderHuhOutput(result as HuhCompletedOutput),
    fallback: fallbackOutput("needs roles", "This Lord's paradox output needs Program, Baseline_weight, and Final_weight in the graph.")
  },
  {
    id: "chess-intelligence-practice-simple-flip",
    label: "sign flip",
    compute: computeChessSimpleFlipOutput,
    render: (result) => renderHuhOutput(result as HuhCompletedOutput),
    fallback: fallbackOutput("needs roles", "This chess output needs Intelligence, Practice_hours, Chess_Elo, and Elite_sample in the graph.")
  }
];

export function computeCompletedOutput(context: OutputContext, moduleId: string | null): ComputedCompletedOutput | null {
  const module = completedOutputModules.find((candidate) => candidate.id === moduleId);
  if (!module || !moduleId) return null;
  return {
    moduleId,
    module,
    result: module.compute(context)
  };
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
        label: "Causal do contrast",
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
        label: "Causal do contrast",
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
        label: "Causal do contrast",
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
        label: "Observed score gap",
        value: formatSignedValue(output.crudeGap),
        detail: `tutored ${formatValue(output.crudeTutoredScore)} vs untutored ${formatValue(output.crudeUntutoredScore)}`,
        numericValue: output.crudeGap
      },
      comparison: {
        label: "Causal do contrast",
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
        <strong>{output.severityAdjusted ? "Fix detected" : "Fix target"}</strong>
        <span>{output.severityAdjusted ? "Severity is adjusted. The stabilized-IPW comparison and diagnostics can now appear below." : "Mark Severity as adjust for, then compare the raw graph against the fixed association reveal."}</span>
      </div>
      <div className="completed-metric-grid">
        <div>
          <span>crude association</span>
          <strong>{formatPercentagePoints(output.crudeDiff)}</strong>
          <small>treated {formatPercent(output.crudeTreatedRecovery)} vs untreated {formatPercent(output.crudeUntreatedRecovery)}</small>
        </div>
        {!hideOracle && <div>
          <span>do contrast</span>
          <strong>{formatPercentagePoints(output.causalDiff)}</strong>
          <small>do(1) {formatPercent(output.causalTreatedRecovery)} vs do(0) {formatPercent(output.causalUntreatedRecovery)}</small>
        </div>}
        <div>
          <span>severity separation</span>
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
          <span>crude mortality</span>
          <strong>{formatPercentagePoints(output.crudeDiff)}</strong>
          <small>ICU {formatPercent(output.crudeIcuMortality)} vs no ICU {formatPercent(output.crudeWardMortality)}</small>
        </div>
        <div>
          <span>do mortality</span>
          <strong>{formatPercentagePoints(output.causalDiff)}</strong>
          <small>do(ICU) {formatPercent(output.causalIcuMortality)} vs do(no ICU) {formatPercent(output.causalWardMortality)}</small>
        </div>
        <div>
          <span>severity separation</span>
          <strong>{formatSignedValue(output.severityDiff)}</strong>
          <small>ICU mean {formatValue(output.icuSeverity)} vs no ICU {formatValue(output.wardSeverity)}</small>
        </div>
        <div>
          <span>triage collider</span>
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
            <span>raw premium</span>
            <strong>{formatSignedValue(output.crudePremium)}</strong>
            <small>college {formatValue(output.crudeCollegeEarnings)} vs no college {formatValue(output.crudeNoCollegeEarnings)}</small>
          </div>
          <div>
            <span>do premium</span>
            <strong>{formatSignedValue(output.causalPremium)}</strong>
            <small>do(college) {formatValue(output.causalCollegeEarnings)} vs do(no college) {formatValue(output.causalNoCollegeEarnings)}</small>
          </div>
          <div>
            <span>income gap</span>
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
          <strong>{output.academicNeedAdjusted ? "Fix detected" : "Fix target"}</strong>
          <span>{output.academicNeedAdjusted ? "Academic_need is adjusted. The within-need pair graph is now visible below." : "Mark Academic_need as adjusted, then compare the raw graph against the adjusted pair graph reveal."}</span>
        </div>
        <div className="completed-metric-grid">
          <div>
            <span>raw score gap</span>
            <strong>{formatSignedValue(output.crudeGap)}</strong>
            <small>tutored {formatValue(output.crudeTutoredScore)} vs not tutored {formatValue(output.crudeUntutoredScore)}</small>
          </div>
          {!hideOracle && <div>
            <span>do score gain</span>
            <strong>{formatSignedValue(output.causalGap)}</strong>
            <small>do(tutoring) {formatValue(output.causalTutoredScore)} vs do(no tutoring) {formatValue(output.causalUntutoredScore)}</small>
          </div>}
          <div>
            <span>need gap</span>
            <strong>{formatPercentagePoints(output.needDiff)}</strong>
            <small>tutored {formatPercent(output.tutoredNeed)} vs not tutored {formatPercent(output.untutoredNeed)}</small>
          </div>
        </div>
        <ul className="completed-output-list">
          <li><strong>Fast visual read:</strong> {output.visualRead}</li>
          <li><strong>Backdoor:</strong> Tutoring &lt;- Academic_need -&gt; Test_score makes the raw score gap point the wrong way.</li>
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
    <div className="adjusted-pair-graph-card" aria-label="Adjusted pair graph">
      <div className="module-card-header">
        <strong>Adjusted pair graph</strong>
        <span className="module-badge active">Academic_need adjusted</span>
      </div>
      <svg className="adjusted-pair-graph" viewBox="0 0 340 184" role="img" aria-label="Within academic need vertical score scatterplots">
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
          <circle className="adjusted-pair-mean untreated" cx="105" cy="14" r="4" />
          <text x="114" y="18">no tutoring</text>
          <circle className="adjusted-pair-mean treated" cx="184" cy="14" r="4" />
          <text x="193" y="18">tutoring</text>
        </g>
      </svg>
      <div className="adjusted-pair-summary">
        <strong>weighted adjusted gap {output.adjustedPairGap === null ? "unavailable" : formatSignedValue(output.adjustedPairGap)}</strong>
        <span>Two exact pairs are possible here because Academic_need is binary. Continuous confounders need bins, local matching neighborhoods, or model-based standardization instead of a literal two-row graph.</span>
      </div>
    </div>
  );
}

function renderHuhOutput(output: HuhCompletedOutput) {
  const before = output.metrics[0];
  const after = output.metrics[1];
  return (
    <CompletedOutputShell badge={output.badge} conclusion={output.conclusion}>
      <div className="completed-metric-grid">
        {output.metrics.map((metric) => (
          <div key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </div>
        ))}
      </div>
      {before && after && before.numericValue !== undefined && after.numericValue !== undefined && (
        <HuhShiftPlot before={before} after={after} />
      )}
      <ul className="completed-output-list">
        {output.bullets.map((bullet) => (
          <li key={bullet.label}><strong>{bullet.label}:</strong> {bullet.text}</li>
        ))}
      </ul>
    </CompletedOutputShell>
  );
}

function HuhShiftPlot(props: { before: HuhMetric; after: HuhMetric }) {
  const width = 320;
  const height = 104;
  const plot = { left: 78, right: 28, top: 18, rowGap: 32 };
  const values = [
    props.before.numericValue,
    props.after.numericValue,
    props.before.lower,
    props.before.upper,
    props.after.lower,
    props.after.upper
  ].filter((value): value is number => value !== undefined && Number.isFinite(value));
  if (values.length === 0) return null;
  const maxAbs = Math.max(0.1, ...values.map((value) => Math.abs(value)));
  const domain = maxAbs * 1.18;
  const x = (value: number) => plot.left + ((value + domain) / (2 * domain)) * (width - plot.left - plot.right);
  const rows = [
    { key: "before", label: "before", metric: props.before, y: plot.top + 15 },
    { key: "after", label: "after", metric: props.after, y: plot.top + 15 + plot.rowGap }
  ] as const;
  return (
    <div className="huh-shift-plot-card">
      <div className="module-card-header">
        <strong>Before / after</strong>
        <span>same signed scale</span>
      </div>
      <svg className="huh-shift-plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${props.before.label} compared with ${props.after.label}`}>
        <line className="huh-shift-axis" x1={plot.left} y1={height - 20} x2={width - plot.right} y2={height - 20} />
        <line className="huh-shift-zero" x1={x(0)} y1="12" x2={x(0)} y2={height - 18} />
        <text className="huh-shift-axis-label" x={plot.left} y={height - 4}>{formatSignedValue(-domain)}</text>
        <text className="huh-shift-axis-label end" x={width - plot.right} y={height - 4}>{formatSignedValue(domain)}</text>
        {rows.map((row) => (
          <g key={row.key}>
            <text className="huh-shift-row-label" x="10" y={row.y + 4}>{row.label}</text>
            {row.metric.lower !== undefined && row.metric.upper !== undefined && (
              <line className="huh-shift-interval" x1={x(row.metric.lower)} y1={row.y} x2={x(row.metric.upper)} y2={row.y} />
            )}
            <circle className={`huh-shift-dot ${row.key} ${metricToneClass(row.metric.numericValue ?? null)}`} cx={x(row.metric.numericValue ?? 0)} cy={row.y} r="5" />
            <text className="huh-shift-value" x={Math.min(width - 8, x(row.metric.numericValue ?? 0) + 9)} y={row.y + 4}>{row.metric.value}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function metricToneClass(value: number | null): "negative" | "neutral" | "positive" {
  if (value === null || Math.abs(value) < 0.005) return "neutral";
  return value < 0 ? "negative" : "positive";
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

function CompletedOutputShell(props: { badge: string; conclusion: string; children: React.ReactNode }) {
  return (
    <details className="completed-output-card">
      <summary className="module-card-header completed-output-summary">
        <strong>What this shows</strong>
        <span className="module-badge active">{props.badge}</span>
      </summary>
      <div className="completed-output-body">
        <p className="completed-conclusion">{props.conclusion}</p>
        {props.children}
      </div>
    </details>
  );
}

function fallbackOutput(badge: string, message: string) {
  return (
    <details className="completed-output-card">
      <summary className="module-card-header completed-output-summary">
        <strong>What this shows</strong>
        <span className="module-badge planned">{badge}</span>
      </summary>
      <div className="completed-output-body">
        <p className="muted">{message}</p>
      </div>
    </details>
  );
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
  const visualRead = `College attendees average ${formatValue(Math.abs(incomeDiff))} family-log-income units ${incomeDiff >= 0 ? "higher" : "lower"} than non-attendees. That baseline separation means the raw earnings gap is not automatically a college effect.`;
  const overstatement = Math.abs(crudePremium) - Math.abs(causalPremium);
  const verdict = crudePremium !== 0 && causalPremium !== 0 && Math.sign(crudePremium) !== Math.sign(causalPremium)
    ? `Sign reversal: raw premium ${formatSignedValue(crudePremium)} versus causal premium ${formatSignedValue(causalPremium)}.`
    : overstatement > 0
      ? `Raw premium overstates the do-premium by ${formatValue(overstatement)} earnings units under this DAG.`
      : `Raw premium and do-premium point the same way; Family_log_income still makes the raw comparison non-causal.`;
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
  const visualRead = `Tutored students are ${formatPercentagePointMagnitude(needDiff)} more likely to be high-need students. That imbalance is enough to make the raw score gap point the wrong way.`;
  const signsReverse = crudeGap !== 0 && causalGap !== 0 && Math.sign(crudeGap) !== Math.sign(causalGap);
  const verdict = signsReverse
    ? `Sign reversal: raw gap ${formatSignedValue(crudeGap)} score points versus causal gain ${formatSignedValue(causalGap)} points.`
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
    conclusion: `The raw smoking-cancer gap is ${formatPercentagePoints(rawDiff)}, but smokers also differ on latent Genetic_risk by ${formatSignedValue(riskGap)}. The useful causal read is the mediated do contrast: do(Smoking=1) changes Tar by ${formatSignedValue(tarShift)} and raises Cancer by ${formatPercentagePointMagnitude(doDiff)} under this DGP.`,
    metrics: [
      { label: "naive cancer gap", value: formatPercentagePoints(rawDiff), detail: `smokers ${formatPercent(rawSmokerCancer)} vs non-smokers ${formatPercent(rawNonSmokerCancer)}`, numericValue: rawDiff },
      { label: "do cancer gap", value: formatPercentagePoints(doDiff), detail: `do(smoke) ${formatPercent(doSmokeCancer)} vs do(no smoke) ${formatPercent(doNoSmokeCancer)}`, numericValue: doDiff },
      { label: "mediator shift", value: formatSignedValue(tarShift), detail: `Tar moves from ${formatValue(doNoSmokeTar)} to ${formatValue(doSmokeTar)}`, numericValue: tarShift },
      { label: "latent imbalance", value: formatSignedValue(riskGap), detail: `smokers have higher Genetic_risk in the observed data`, numericValue: riskGap }
    ],
    bullets: [
      { label: "Huh", text: "Hidden confounding blocks ordinary backdoor adjustment, but the observed mediator still carries a front-door style causal story." },
      { label: "Mechanism", text: "Smoking -> Tar -> Cancer is the directed path; Genetic_risk confounds Smoking and Cancer." },
      { label: "Caveat", text: "This card shows the DGP do contrast, not a full nonparametric front-door estimator from data." }
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
    conclusion: `Inside the low-birthweight sample, smoking appears ${selectedDiff < 0 ? "protective" : "harmful"} by ${formatPercentagePointMagnitude(selectedDiff)}. In the full DGP, do(Smoking=1) ${doDiff >= 0 ? "raises" : "lowers"} infant mortality by ${formatPercentagePointMagnitude(doDiff)}. The difference is the selected low-birthweight world: non-smoking low-birthweight babies are much frailer on average.`,
    metrics: [
      { label: "low-birthweight read", value: formatPercentagePoints(selectedDiff), detail: `smoking ${formatPercent(selectedSmokerMortality)} vs no smoking ${formatPercent(selectedNonSmokerMortality)}`, numericValue: selectedDiff },
      { label: "population do effect", value: formatPercentagePoints(doDiff), detail: `do(smoke) ${formatPercent(doSmokeMortality)} vs do(no smoke) ${formatPercent(doNoSmokeMortality)}`, numericValue: doDiff },
      { label: "frailty gap in sample", value: formatSignedValue(frailtyGap), detail: `smokers ${formatValue(selectedSmokerFrailty)} vs non-smokers ${formatValue(selectedNonSmokerFrailty)}`, numericValue: frailtyGap }
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
    conclusion: `Among people selected for chronic disease, obesity appears ${selectedDiff < 0 ? "protective" : "harmful"} by ${formatPercentagePointMagnitude(selectedDiff)}. In the population DGP, do(Obesity=1) ${doDiff >= 0 ? "raises" : "lowers"} mortality by ${formatPercentagePointMagnitude(doDiff)}. The selected cohort makes obesity and latent frailty substitute routes into disease.`,
    metrics: [
      { label: "disease-sample read", value: formatPercentagePoints(selectedDiff), detail: `obese ${formatPercent(selectedObeseMortality)} vs non-obese ${formatPercent(selectedNonObeseMortality)}`, numericValue: selectedDiff },
      { label: "population do effect", value: formatPercentagePoints(doDiff), detail: `do(obese) ${formatPercent(doObeseMortality)} vs do(non-obese) ${formatPercent(doNonObeseMortality)}`, numericValue: doDiff },
      { label: "frailty gap in sample", value: formatSignedValue(frailtyGap), detail: `obese ${formatValue(selectedObeseFrailty)} vs non-obese ${formatValue(selectedNonObeseFrailty)}`, numericValue: frailtyGap }
    ],
    bullets: [
      { label: "Huh", text: "Inside the diseased sample, obese patients can be less frail because obesity itself was one route into the sample." },
      { label: "Selection", text: "Chronic_disease is a selected common effect of Obesity and Frailty." },
      { label: "Report", text: "The disease-restricted association should not be read as a population obesity effect." }
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
      { label: "raw outcome gap", value: formatSignedValue(rawGap), detail: `${rawUncertainty}; exposed ${formatValue(rawExposed)} vs unexposed ${formatValue(rawUnexposed)}`, numericValue: rawGap, lower: rawInterval?.lower, upper: rawInterval?.upper },
      { label: "conditioned gap", value: formatSignedValue(colliderGap), detail: `${conditionedUncertainty}; within Collider_score >= ${formatValue(cutoff)}`, numericValue: colliderGap, lower: conditionedInterval?.lower, upper: conditionedInterval?.upper },
      { label: "true do effect", value: formatSignedValue(0), detail: "no directed path from Exposure to Outcome", numericValue: 0 }
    ],
    bullets: [
      { label: "Huh", text: "A pre-treatment variable can still be a collider; adjusting for it opens a path that was closed." },
      { label: "Path", text: "Exposure <- Cause_of_exposure -> Collider_score <- Cause_of_outcome -> Outcome opens when Collider_score is conditioned on." },
      { label: "Report", text: "No adjustment is better than adjusting for this collider." }
    ]
  };
}

function computeLordsParadoxOutput(context: OutputContext): HuhCompletedOutput | null {
  const { document, simulation } = context;
  const program = simulation.nodeStates.Program;
  const baseline = simulation.nodeStates.Baseline_weight;
  const final = simulation.nodeStates.Final_weight;
  if (!program || !baseline || !final) return null;
  const baselineProgram = weightedConditionalMean(program, baseline, 1);
  const baselineControl = weightedConditionalMean(program, baseline, 0);
  const changeProgram = weightedConditionalMeanOfDifference(program, final, baseline, 1);
  const changeControl = weightedConditionalMeanOfDifference(program, final, baseline, 0);
  if (baselineProgram === null || baselineControl === null || changeProgram === null || changeControl === null) return null;
  const doProgram = runSimulation(document.graph, { ...document.simulation, overrides: { Program: 1 }, selections: {} });
  const doControl = runSimulation(document.graph, { ...document.simulation, overrides: { Program: 0 }, selections: {} });
  const doProgramFinal = doProgram.nodeStates.Final_weight?.empirical.mean;
  const doControlFinal = doControl.nodeStates.Final_weight?.empirical.mean;
  if (doProgramFinal === null || doProgramFinal === undefined || doControlFinal === null || doControlFinal === undefined) return null;
  const changeGap = changeProgram - changeControl;
  const doGap = doProgramFinal - doControlFinal;
  const baselineGap = baselineProgram - baselineControl;
  return {
    badge: "estimand split",
    conclusion: `The change-score comparison says Program changes weight by ${formatSignedValue(changeGap)} kg, while the baseline-standardized do contrast on final weight is ${formatSignedValue(doGap)} kg. The groups start ${formatSignedValue(baselineGap)} kg apart, so the two analyses are not answering the same question.`,
    metrics: [
      { label: "change-score read", value: formatSignedValue(changeGap), detail: `program ${formatValue(changeProgram)} kg vs control ${formatValue(changeControl)} kg`, numericValue: changeGap },
      { label: "final do contrast", value: formatSignedValue(doGap), detail: `do(program) ${formatValue(doProgramFinal)} kg vs do(control) ${formatValue(doControlFinal)}`, numericValue: doGap },
      { label: "baseline imbalance", value: formatSignedValue(baselineGap), detail: `program ${formatValue(baselineProgram)} kg vs control ${formatValue(baselineControl)} kg`, numericValue: baselineGap }
    ],
    bullets: [
      { label: "Huh", text: "Change scores and baseline-adjusted final outcomes can disagree because they encode different estimands." },
      { label: "Question first", text: "Ask whether the target is change from baseline or final outcome at comparable baseline values." },
      { label: "Report", text: "Do not treat this as a generic model-choice dispute; state the causal question." }
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
