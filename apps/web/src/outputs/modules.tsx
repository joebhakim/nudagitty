import { runSimulation } from "@nudagitty/core";
import type React from "react";
import {
  formatPercent,
  formatPercentagePointMagnitude,
  formatPercentagePoints,
  formatSignedValue,
  formatValue
} from "../shared/formatting";
import { formatAdjustmentSet, weightedConditionalMean } from "./helpers";
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
  collegeAdvantage: number;
  noCollegeAdvantage: number;
  advantageDiff: number;
  adjustmentSet: string;
  visualRead: string;
  verdict: string;
  conclusion: string;
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
    fallback: fallbackOutput("needs roles", "This completed college output needs Family_advantage, College, and Earnings in the graph.")
  },
  {
    id: "tutoring-scores",
    label: "sign flip ready",
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
          <span>advantage gap</span>
          <strong>{formatPercentagePoints(output.advantageDiff)}</strong>
          <small>college {formatPercent(output.collegeAdvantage)} vs no college {formatPercent(output.noCollegeAdvantage)}</small>
        </div>
      </div>
      <ul className="completed-output-list">
        <li><strong>Fast visual read:</strong> {output.visualRead}</li>
        <li><strong>Backdoor:</strong> College &lt;- Family_advantage -&gt; Earnings inflates the raw wage premium.</li>
        <li><strong>Adjustment set:</strong> {output.adjustmentSet}</li>
        <li><strong>Verdict:</strong> {output.verdict}</li>
      </ul>
    </CompletedOutputShell>
  );
}

function renderTutoringOutput(output: TutoringCompletedOutput) {
  return (
    <CompletedOutputShell badge="sign flip ready" conclusion={output.conclusion}>
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
      </ul>
    </CompletedOutputShell>
  );
}

function CompletedOutputShell(props: { badge: string; conclusion: string; children: React.ReactNode }) {
  return (
    <div className="completed-output-card">
      <div className="module-card-header">
        <strong>Completed output</strong>
        <span className="module-badge active">{props.badge}</span>
      </div>
      <p className="completed-conclusion">{props.conclusion}</p>
      {props.children}
    </div>
  );
}

function fallbackOutput(badge: string, message: string) {
  return (
    <div className="completed-output-card">
      <div className="module-card-header">
        <strong>Completed output</strong>
        <span className="module-badge planned">{badge}</span>
      </div>
      <p className="muted">{message}</p>
    </div>
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
  const advantage = simulation.nodeStates.Family_advantage;
  if (!college || !earnings || !advantage) return null;

  const crudeCollegeEarnings = weightedConditionalMean(college, earnings, 1);
  const crudeNoCollegeEarnings = weightedConditionalMean(college, earnings, 0);
  const collegeAdvantage = weightedConditionalMean(college, advantage, 1);
  const noCollegeAdvantage = weightedConditionalMean(college, advantage, 0);
  if (
    crudeCollegeEarnings === null ||
    crudeNoCollegeEarnings === null ||
    collegeAdvantage === null ||
    noCollegeAdvantage === null
  ) return null;

  const doCollege = runSimulation(document.graph, { ...document.simulation, overrides: { College: 1 }, selections: {} });
  const doNoCollege = runSimulation(document.graph, { ...document.simulation, overrides: { College: 0 }, selections: {} });
  const causalCollegeEarnings = doCollege.nodeStates.Earnings?.empirical.mean;
  const causalNoCollegeEarnings = doNoCollege.nodeStates.Earnings?.empirical.mean;
  if (causalCollegeEarnings === null || causalCollegeEarnings === undefined || causalNoCollegeEarnings === null || causalNoCollegeEarnings === undefined) return null;

  const crudePremium = crudeCollegeEarnings - crudeNoCollegeEarnings;
  const causalPremium = causalCollegeEarnings - causalNoCollegeEarnings;
  const advantageDiff = collegeAdvantage - noCollegeAdvantage;
  const adjustmentSet = formatAdjustmentSet(analysis.totalEffect.minimalSets[0] ?? ["Family_advantage"]);
  const rawDirection = crudePremium >= 0 ? "higher" : "lower";
  const causalDirection = causalPremium >= 0 ? "raises" : "lowers";
  const visualRead = `College attendees are ${formatPercentagePointMagnitude(advantageDiff)} more likely to come from advantaged families. That group separation means the raw earnings gap is not automatically a college effect.`;
  const overstatement = Math.abs(crudePremium) - Math.abs(causalPremium);
  const verdict = crudePremium !== 0 && causalPremium !== 0 && Math.sign(crudePremium) !== Math.sign(causalPremium)
    ? `Sign reversal: raw premium ${formatSignedValue(crudePremium)} versus causal premium ${formatSignedValue(causalPremium)}.`
    : overstatement > 0
      ? `Raw premium overstates the do-premium by ${formatValue(overstatement)} earnings units under this DAG.`
      : `Raw premium and do-premium point the same way; Family_advantage still makes the raw comparison non-causal.`;
  const conclusion = `College graduates earn ${formatValue(Math.abs(crudePremium))} earnings units ${rawDirection} than non-graduates in the raw comparison. Because Family_advantage affects both college attendance and earnings, the reportable causal contrast is do(College=1) versus do(College=0): under this DAG, college ${causalDirection} earnings by ${formatValue(Math.abs(causalPremium))} units.`;

  return {
    crudeCollegeEarnings,
    crudeNoCollegeEarnings,
    crudePremium,
    causalCollegeEarnings,
    causalNoCollegeEarnings,
    causalPremium,
    collegeAdvantage,
    noCollegeAdvantage,
    advantageDiff,
    adjustmentSet,
    visualRead,
    verdict,
    conclusion
  };
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
    conclusion
  };
}
