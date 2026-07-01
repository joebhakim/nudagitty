import { analyzeAdjustment, cohortFromSimulationResult, deriveAdjustmentSpec, estimateInstrument, normalizeVariableModel, runSimulation } from "@nudagitty/core";
import type { SimulatedNodeState } from "@nudagitty/core";
import type React from "react";
import { formatPercent, formatPercentagePointMagnitude, formatPercentagePoints, formatSignedValue, formatValue, formatWeightedCount } from "../../shared/formatting";
import { empiricalSampleWeight, formatAdjustmentSet, weightedBinaryShare, weightedConditionalMean, weightedJointConditionalMean } from "../helpers";
import { badControlWarning, describeEstimand } from "../estimand";
import { stratifyRiskCurves } from "../stratify";
import { MARGINAL_COLOR, subgroupColor } from "../../charts/chartColors";
import { CategoryOutcomePlot, binaryOutcomeSummaries, continuousOutcomeSummaries } from "../../charts/CategoryOutcomePlot";
import type { CategoryOutcomeSummary, ScatterPoint } from "../../charts/CategoryOutcomePlot";
import { correlation, filteredConditionalMean, filteredMeanDifferenceInterval, intervalDetail, quantile } from "./stats";
import { formatOutcomeDifference, sharedFacetYDomain } from "./components";
import type { OutputContext } from "../types";
import type {
  CollegeBinnedAdjustmentBin, CollegeCompletedOutput, HuhCompletedOutput, IcuCompletedOutput,
  InstrumentOutput, ModeratorEffectOutput, ModeratorFacet, SimpsonCompletedOutput,
  TutoringAdjustedPair, TutoringCompletedOutput, WhatIfOutputScale
} from "./types";

// --- Effect modification / moderator-CATE output -----------------------------------------------
// Faces the treatment→outcome effect by a MODERATOR (the gate of a smooth_gated interaction): one
// facet per moderator level, plus a leading marginal facet. A disordinal (crossover) interaction
// shows as opposite-signed subgroup facets whose average — the marginal — hides them.


export function computeModeratorEffectOutput(context: OutputContext): ModeratorEffectOutput | null {
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

export function renderModeratorEffectOutput(result: ModeratorEffectOutput): React.ReactNode {
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

export function computeInstrumentOutput(context: OutputContext): InstrumentOutput | null {
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

export function renderInstrumentOutput(result: InstrumentOutput): React.ReactNode {
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

export function fallbackOutput(badge: string, message: string) {
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

export function computeSimpsonCompletedOutput(context: OutputContext): SimpsonCompletedOutput | null {
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

export function computeIcuCompletedOutput(context: OutputContext): IcuCompletedOutput | null {
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

export function computeCollegeCompletedOutput(context: OutputContext): CollegeCompletedOutput | null {
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

export function collegeBinnedAdjustmentBins(income: SimulatedNodeState, college: SimulatedNodeState, earnings: SimulatedNodeState, cutpoints: number[]): CollegeBinnedAdjustmentBin[] {
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

export function weightedBinnedPremium(bins: CollegeBinnedAdjustmentBin[]): number | null {
  let numerator = 0;
  let denominator = 0;
  for (const bin of bins) {
    if (bin.gap === null || bin.weight <= 0) continue;
    numerator += bin.gap * bin.weight;
    denominator += bin.weight;
  }
  return denominator > 0 ? numerator / denominator : null;
}

export function supportWarning(exposed: number, unexposed: number): string | null {
  const total = exposed + unexposed;
  const smallerArm = Math.min(exposed, unexposed);
  if (total <= 0) return "empty bin";
  if (smallerArm <= 0) return "no support";
  if (smallerArm < 8 || smallerArm / total < 0.08) return "weak support";
  return null;
}

export function computeTutoringCompletedOutput(context: OutputContext): TutoringCompletedOutput | null {
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

export function tutoringAdjustedPairs(tutoring: SimulatedNodeState, need: SimulatedNodeState, score: SimulatedNodeState): TutoringAdjustedPair[] {
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

export function jointSamplesForPair(need: SimulatedNodeState, needValue: 0 | 1, tutoring: SimulatedNodeState, tutoringValue: 0 | 1, score: SimulatedNodeState): number[] {
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

export function computeFrontDoorSmokingOutput(context: OutputContext): HuhCompletedOutput | null {
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

export function computeBirthweightParadoxOutput(context: OutputContext): HuhCompletedOutput | null {
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

export function computeObesityParadoxOutput(context: OutputContext): HuhCompletedOutput | null {
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

export function computeCatsHighriseSyndromeOutput(context: OutputContext): HuhCompletedOutput | null {
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

export function computePolicingEncountersOutput(context: OutputContext): HuhCompletedOutput | null {
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

export function computeMBiasOutput(context: OutputContext): HuhCompletedOutput | null {
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

export function computeChessSimpleFlipOutput(context: OutputContext): HuhCompletedOutput | null {
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
