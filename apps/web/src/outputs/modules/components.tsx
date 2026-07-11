import type React from "react";
import { Children, Fragment, memo, useState } from "react";
import { formatPercent, formatPercentagePointMagnitude, formatPercentagePoints, formatSignedValue, formatValue, formatWeightedCount } from "../../shared/formatting";
import { HighlightNames, NodeText } from "../../shared/NodeNames";
import { chartFrame } from "../../charts/chartFrame";
import { deterministicJitter } from "../../charts/jitter";
import { SERIES_COLORS } from "../../charts/chartColors";
import { CategoryOutcomePlot, binaryOutcomeSummaries, continuousOutcomeSummaries, wilsonInterval } from "../../charts/CategoryOutcomePlot";
import type { CovariateBasis, GMethodEstimate, GMethodsComparison } from "@nudagitty/core";
import type { CategoryOutcomeSummary, ScatterPoint } from "../../charts/CategoryOutcomePlot";
import type { CompletedOutputRenderOptions } from "../types";
import type {
  ComputedCompletedOutput, HuhCompletedOutput, HuhShift, IcuCompletedOutput, CollegeCompletedOutput,
  SimpsonCompletedOutput, TutoringCompletedOutput, WhatIfAdvancedOutput, WhatIfOutputScale,
  WhatIfStrategySurvivalSummary, WhatIfSurvivalSummary
} from "./types";

export function renderSimpsonOutput(output: SimpsonCompletedOutput, options?: CompletedOutputRenderOptions) {
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

export function renderIcuOutput(output: IcuCompletedOutput) {
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

export function renderCollegeOutput(output: CollegeCompletedOutput) {
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

export function CollegeBinnedAdjustmentGraph({ output }: { output: CollegeCompletedOutput }) {
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

export function renderTutoringOutput(output: TutoringCompletedOutput, options?: CompletedOutputRenderOptions) {
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

export function TutoringAdjustedPairsGraph({ output }: { output: TutoringCompletedOutput }) {
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

export function renderHuhOutput(output: HuhCompletedOutput) {
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

export function renderWhatIfAdvancedOutput(output: WhatIfAdvancedOutput) {
  return <WhatIfAdvancedOutputView output={output} />;
}

export function WhatIfAdvancedOutputView({ output }: { output: WhatIfAdvancedOutput }) {
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
// Shared explanation of the oracle / re-simulated "true effect" — used both as the tooltip on the
// oracle graph facet and as the g-formula row's prose in the methods panel. Written to answer the
// real confusion (why is one simulation "the truth" and the others "estimates"): the estimators only
// see the data; the oracle owns the structural equations and runs them under each do().
const ORACLE_EXPLANATION =
  "Every other method (IPW, matching, …) only uses the data — imagine a literal spreadsheet. The oracle is different: we actually have the structural equation model — each variable is generated from its parents plus noise via the equations you specified (a plain outcome is treatment + confounders + noise; a two-part earnings outcome is a participation gate × a positive amount; a survival outcome is a hazard, …). So instead of fitting curves from the data we plug in the real math — simulate under each do(treatment), i.e. each treatment setting, then take the difference. For a nonlinear outcome (e.g. two-part) this simulated contrast carries a little Monte-Carlo noise around the effect the DGP actually imposes.";

export const METHOD_GLOSSARY: Record<GMethodEstimate["id"], { plain: string; formula: string }> = {
  naive: {
    plain: "The raw crude contrast — the outcome by the treatment people actually took. This is exactly the observed-relation plot above; it ignores both confounding and censoring.",
    formula: "E[ Y | A = a ]"
  },
  stratified: {
    plain: "Averages the outcome inside confounder strata, then re-weights those strata to the whole population. Unbiased only if every confounder is in L (and the bins are fine enough).",
    formula: "Σ_l  E[ Y | A = a, L = l ] · P(L = l)"
  },
  g_formula: {
    plain: ORACLE_EXPLANATION,
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
export const PRIMARY_METHOD_PREFERENCE: GMethodEstimate["id"][] = ["aipw", "ipw", "stratified", "outcome_regression", "matching", "g_estimation", "g_formula", "naive"];

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
export function sharedFacetYDomain(facets: Array<{ points: ScatterPoint[]; summaries: CategoryOutcomeSummary[] }>, binary: boolean): [number, number] {
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

export function EffectByArmGraph(props: { comparison: GMethodsComparison; outcomeScale: "risk" | "mean"; selectedId: GMethodEstimate["id"]; points?: ScatterPoint[]; treatmentId?: string; show?: Array<"observed" | "truth" | "selected"> }) {
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
          <div className="effect-facet-head"><strong style={{ color: f.color }} className={f.id === "truth" ? "facet-title-info" : undefined} title={f.id === "truth" ? ORACLE_EXPLANATION : undefined}>{f.title}</strong><span>{formatOutcomeDifference(f.effect, props.outcomeScale, "")}</span></div>
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
                    {isOracle && comparison.imposedEffect != null && (
                      <small className="method-imposed">DGP imposes <strong>{formatOutcomeDifference(comparison.imposedEffect, outcomeScale, "")}</strong> exactly (analytic) · this row is a Monte-Carlo estimate of it</small>
                    )}
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

export function WhatIfMethodGlossary(props: { comparison: GMethodsComparison }) {
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

export function WhatIfMetricGrid(props: { output: WhatIfAdvancedOutput; primary?: GMethodEstimate | null }) {
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

export const SURVIVAL_CURVE_NOTE: Partial<Record<GMethodEstimate["id"], string>> = {
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

export function WhatIfSurvivalDenominators(props: { series: WhatIfStrategySurvivalSummary[]; open: boolean }) {
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

export function WhatIfDynamicSupport(props: { comparison: GMethodsComparison }) {
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

export function HuhShiftPlot(props: { shift: HuhShift }) {
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

export function minimumObservedSupport(comparison: GMethodsComparison): number | null {
  const values = comparison.support
    .map((row) => row.observedMatchShare)
    .filter((value) => Number.isFinite(value));
  return values.length > 0 ? Math.min(...values) : null;
}

export function formatSurvivalEvents(summary: WhatIfSurvivalSummary): string {
  const strategyEvents = summary.strategies.map((strategy) => `${formatWeightedCount(strategy.totalEvents)}/${formatWeightedCount(strategy.totalCensored)}`);
  if (strategyEvents.length > 0) return strategyEvents.join(" | ");
  return summary.natural ? `${formatWeightedCount(summary.natural.totalEvents)}/${formatWeightedCount(summary.natural.totalCensored)}` : "NA";
}

export function formatStrategyRules(strategy: GMethodsComparison["strategies"][number]): string[] {
  if (strategy.rules.length > 0) {
    return strategy.rules.map((rule) => `${rule.variable}=${rule.value} if ${rule.conditionVariable} ${operatorLabel(rule.operator)} ${rule.conditionValue}; else ${rule.otherwise}`);
  }
  if (strategy.assignments.length > 0) return strategy.assignments.map((assignment) => `${assignment.variable}=${assignment.value}`);
  return ["natural observed treatment"];
}

export function operatorLabel(operator: GMethodsComparison["strategies"][number]["rules"][number]["operator"]): string {
  if (operator === "neq") return "!=";
  if (operator === "lte") return "<=";
  if (operator === "gte") return ">=";
  return operator === "eq" ? "=" : operator;
}

export function estimateToneClass(value: number | null): string {
  if (value === null || Math.abs(value) < 0.005) return "neutral";
  return value < 0 ? "negative" : "positive";
}

export function formatOutcomeValue(value: number | null, scale: WhatIfOutputScale, unit: string): string {
  if (value === null) return "NA";
  if (scale === "risk") return formatPercent(value);
  return `${formatValue(value)}${unit ? ` ${unit}` : ""}`;
}

export function formatOutcomeDifference(value: number | null, scale: WhatIfOutputScale, unit: string): string {
  if (value === null) return "NA";
  if (scale === "risk") return formatPercentagePoints(value);
  return `${formatSignedValue(value)}${unit ? ` ${unit}` : ""}`;
}

export function formatNullablePercent(value: number | null): string {
  return value === null ? "NA" : formatPercent(value);
}

export function formatEss(estimate: GMethodEstimate | undefined): string {
  if (!estimate) return "NA";
  const values = estimate.arms.map((arm) => arm.effectiveSampleSize).filter((value): value is number => value !== null && Number.isFinite(value));
  return values.length === 0 ? "NA" : formatWeightedCount(Math.min(...values));
}

export function sampleScoresForPlot(samples: number[]): number[] {
  const maxPoints = 52;
  if (samples.length <= maxPoints) return samples;
  const stride = samples.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, index) => samples[Math.floor(index * stride)]).filter((value): value is number => value !== undefined);
}

export function deterministicStripJitter(index: number, needValue: 0 | 1, treatment: "no tutoring" | "tutoring"): number {
  // Byte-identical to the former inline hash: same salted seed, scale 10000, ±8.5px band.
  const seed = (index + 1) * 1103515245 + needValue * 12345 + (treatment === "tutoring" ? 6789 : 0);
  return deterministicJitter(seed, 10000, 17);
}

export function deterministicBinnedJitter(index: number, binIndex: number, arm: 0 | 1): number {
  // Byte-identical to the former inline hash: same salted seed, scale 10000, ±6.5px band.
  const seed = (index + 1) * 1664525 + binIndex * 1013904223 + arm * 7919;
  return deterministicJitter(seed, 10000, 13);
}

export function CompletedOutputShell(props: { badge: string; conclusion: string; title?: string; children: React.ReactNode }) {
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
