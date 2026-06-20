import type { ReactNode } from "react";
import type { ExampleDenouement } from "@nudagitty/core";
import { DenouementPanel } from "../outputs/DenouementPanel";

function SimpsonLordComparison() {
  const rows: Array<[string, string, string]> = [
    ["What the paradox is", "an association reverses", "two estimators disagree"],
    ["The two analyses", "unadjusted vs adjusted", "change-score vs ANCOVA"],
    ["Third variable", "any confounder", "a commensurate baseline (same scale as the outcome)"],
    ["Needs same-scale pre/post?", "no", "yes — otherwise there is no change score"],
    ["Engine", "aggregation / non-collapsibility", "regression to the mean (post-on-pre slope ≠ 1)"],
    ["Resolution", "the DAG picks the estimand (adjust the confounder)", "the DAG + a chosen estimand (effect on the level vs the change)"]
  ];
  return (
    <div className="explanation-comparison">
      <strong>Simpson vs Lord — keeping them separate</strong>
      <table>
        <thead>
          <tr><th aria-label="aspect" /><th>Simpson's paradox</th><th>Lord's paradox</th></tr>
        </thead>
        <tbody>
          {rows.map(([aspect, simpson, lord]) => (
            <tr key={aspect}><th scope="row">{aspect}</th><td>{simpson}</td><td>{lord}</td></tr>
          ))}
        </tbody>
      </table>
      <p>
        They share a DAG (the confounding triangle), which is why they feel alike — and modern
        causal inference says Lord's with a clean pre-treatment baseline <em>reduces</em> to
        Simpson's "adjust the confounder". The distinctively-Lord ingredient is the
        <em> commensurate baseline</em> (a prior measurement of the outcome on the same scale),
        which unlocks a third, seductive analysis — the change score — that Simpson never has.
      </p>
    </div>
  );
}

function WeightGainBookComparison() {
  // Book figures are the published Hernán & Robins estimates (NHEFS, n=1566); the
  // "This example" column is the calibrated simulation's read-out (n=4000 seeded SEM).
  const rows: Array<[string, string, string]> = [
    ["Analytic sample", "1566 smokers (aged 25–74), ~26% quit", "n = 4000, ~29% quit"],
    ["Outcome", "10-year weight change (kg)", "weight change (kg)"],
    ["Crude difference", "+2.5 kg (95% CI 1.7, 3.4)", "≈ +2.7 kg"],
    ["IP weighting — Ch 12", "+3.4 kg (95% CI 2.4, 4.5)", "≈ +3.4 kg"],
    ["Standardization / g-formula — Ch 13", "+3.5 kg (95% CI 2.5, 4.5)", "≈ +3.5 kg"],
    ["G-estimation — Ch 14", "+3.4 kg (95% CI 2.5, 4.5)", "≈ +3.3 kg"],
    ["True effect (do-oracle)", "— (unknown in real data)", "+3.5 kg (set in the SEM)"]
  ];
  return (
    <div className="explanation-comparison">
      <strong>This simulation vs the book (Hernán &amp; Robins, <em>Causal Inference: What If</em>, Part II)</strong>
      <table>
        <thead>
          <tr><th aria-label="quantity" /><th>Book (NHEFS data)</th><th>This example</th></tr>
        </thead>
        <tbody>
          {rows.map(([aspect, book, here]) => (
            <tr key={aspect}><th scope="row">{aspect}</th><td>{book}</td><td>{here}</td></tr>
          ))}
        </tbody>
      </table>
      <p>
        The point of the match is the <em>direction</em>: the crude comparison <strong>understates</strong>
        the effect, and every adjustment method moves it <em>up</em> toward ~3.4–3.5 kg. (The doubly-robust
        AIPW, outcome-regression, and propensity-matching rows in the methods table read a little higher,
        ~3.7–4.0 kg — they are within the book's confidence interval; matching is the least robust here
        because it pairs on a coarsely-<em>binned</em> propensity score across six covariates.)
      </p>
    </div>
  );
}

type Explainer = { what: ReactNode; comparison?: ReactNode };

const EXPLAINERS: Record<string, Explainer> = {
  "lords-paradox": {
    what: (
      <>
        <p><strong>Lord's paradox.</strong> Two classes take the same test before and after a term; the new-method class started ahead at pretest. Two honest analyses disagree:</p>
        <ul>
          <li><strong>Change score (gain):</strong> both classes improved, but the new-method class improved <em>less</em> → "the new method is worse".</li>
          <li><strong>ANCOVA (adjust for the pretest):</strong> at the same starting score, new-method students end <em>higher</em> → "it helps".</li>
        </ul>
        <p>
          The driver is <strong>regression to the mean</strong>: the high-starting class drifts
          back down, shrinking its raw gain. The two numbers answer <em>different questions</em> —
          the effect on the <em>change</em> versus the effect at a <em>fixed baseline</em> — so
          neither is simply "wrong"; you must state the estimand. (With randomised groups both
          agree; the paradox needs non-random groups that differ at baseline.)
        </p>
      </>
    ),
    comparison: <SimpsonLordComparison />
  },
  "simpson-severity": {
    what: (
      <>
        <p><strong>Simpson's paradox.</strong> A treatment can look beneficial overall yet harmful within every severity stratum (or vice versa), because sicker patients are more likely to receive it. The pooled (crude) association <em>reverses sign</em> once you condition on severity.</p>
        <p>Severity is a <strong>confounder</strong> — a common cause of treatment and recovery. The DAG resolves it cleanly: adjust for severity and the within-stratum effect is the causal one. Unlike Lord's, there is a single right answer here.</p>
      </>
    ),
    comparison: <SimpsonLordComparison />
  },
  "what-if-nhefs-weight-gain": {
    what: (
      <>
        <p>
          <strong>The book's flagship example.</strong> This is a faithful, single-time-point replica
          of the running example in Hernán &amp; Robins' <em>Causal Inference: What If</em>, Part II
          (Chapters 12–14): <em>what is the average causal effect of smoking cessation on weight gain?</em>
          The book uses real NHEFS data on 1566 smokers followed from a 1971–75 baseline to a 1982 visit;
          treatment <strong>A</strong> is "quit smoking before follow-up" and the outcome <strong>Y</strong>
          is weight change in kg.
        </p>
        <p>
          <strong>The surprise.</strong> Quitters gained more weight — about <strong>4.5 kg vs 2.0 kg</strong>,
          a crude difference of <strong>+2.5 kg</strong>. But this <em>understates</em> the causal effect.
          Quitters were on average ~4 years older and somewhat heavier, and <em>older, heavier people gain
          less weight regardless of whether they quit</em>. So the confounders push the crude comparison
          <strong> down</strong>, masking part of the effect. Adjusting for the baseline covariates
          <strong> raises</strong> the estimate to about <strong>+3.4–3.5 kg</strong> — the opposite of the
          usual "adjustment shrinks the naive effect" intuition. <strong>Age</strong> is the headline
          (surrogate) confounder the book singles out.
        </p>
        <p>
          <strong>The structure.</strong> It is the clean confounding triangle: a vector of pre-treatment
          covariates <strong>L</strong> → treatment <strong>A</strong>, <strong>L</strong> → outcome
          <strong> Y</strong>, and <strong>A</strong> → <strong>Y</strong>. There is no mediator and no
          time-varying feedback (that is the multi-year survival example) — this is a pure point treatment,
          which is exactly why the same number is recovered by IP weighting (Ch 12), standardization /
          the g-formula (Ch 13), and g-estimation (Ch 14). Here <strong>L</strong> is six measured baseline
          variables: <em>age, sex, cigarettes per day, years smoking, recreational exercise, and baseline
          weight</em> (the book uses nine; these carry the confounding). Because there are several
          continuous covariates, nonparametric stratification is infeasible — which is the book's own
          motivation for modeling the treatment (IP weighting) or the outcome (standardization).
        </p>
        <p>
          <strong>Reading the panels.</strong> The "Observed association" card shows the crude
          two-arm contrast (~+2.7 kg). The "Adjusted estimate" card shows the standardized do-contrast
          (~+3.5 kg) and a method picker so you can step through every estimator and watch them converge
          on the truth. The confounder-basis selector (linear / quadratic / cubic) is the bias–variance
          flexibility dial on the parametric estimators.
        </p>
      </>
    ),
    comparison: <WeightGainBookComparison />
  }
};

export function ExampleExplanation({ exampleId, denouement, title }: { exampleId: string; denouement: ExampleDenouement; title: string }) {
  const explainer = EXPLAINERS[exampleId];
  return (
    <div className="example-explanation">
      {explainer && (
        <div className="explanation-explainer">
          {explainer.what}
          {explainer.comparison}
        </div>
      )}
      <DenouementPanel denouement={denouement} title={title} />
    </div>
  );
}
