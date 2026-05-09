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
import { formatAdjustmentSet, weightedBinaryShare, weightedConditionalMean, weightedJointConditionalMean } from "./helpers";
import type { CompletedOutputModule, OutputContext } from "./types";

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

export const completedOutputModules: CompletedOutputModule<unknown>[] = [
  {
    id: "simpson-severity",
    label: "Simpson ready",
    compute: computeSimpsonCompletedOutput,
    render: (result) => renderSimpsonOutput(result as SimpsonCompletedOutput),
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
    render: (result) => renderTutoringOutput(result as TutoringCompletedOutput),
    fallback: fallbackOutput("needs roles", "This completed tutoring output needs Academic_need, Tutoring, and Test_score in the graph.")
  }
];

function renderSimpsonOutput(output: SimpsonCompletedOutput) {
  return (
    <CompletedOutputShell badge="Simpson ready" conclusion={output.conclusion}>
      <div className="completed-metric-grid">
        <div>
          <span>crude association</span>
          <strong>{formatPercentagePoints(output.crudeDiff)}</strong>
          <small>treated {formatPercent(output.crudeTreatedRecovery)} vs untreated {formatPercent(output.crudeUntreatedRecovery)}</small>
        </div>
        <div>
          <span>do contrast</span>
          <strong>{formatPercentagePoints(output.causalDiff)}</strong>
          <small>do(1) {formatPercent(output.causalTreatedRecovery)} vs do(0) {formatPercent(output.causalUntreatedRecovery)}</small>
        </div>
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
        <li><strong>Paradox check:</strong> {output.paradox}</li>
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

function renderTutoringOutput(output: TutoringCompletedOutput) {
  return (
    <>
      <CompletedOutputShell badge={output.academicNeedAdjusted ? "adjusted" : "fix available"} conclusion={output.conclusion}>
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
          <div>
            <span>do score gain</span>
            <strong>{formatSignedValue(output.causalGap)}</strong>
            <small>do(tutoring) {formatValue(output.causalTutoredScore)} vs do(no tutoring) {formatValue(output.causalUntutoredScore)}</small>
          </div>
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
          <li><strong>Verdict:</strong> {output.verdict}</li>
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
        <strong>Completed output</strong>
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
        <strong>Completed output</strong>
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
    conclusion
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
  const colliderWarning = `Triage_score is drawn as ICU_admission -> Triage_score <- Severity. Its ICU group mean is ${formatValue(Math.abs(triageDiff))} points ${triageDirection}, but that score is a common effect/downstream summary, not a clean baseline confounder.`;
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
