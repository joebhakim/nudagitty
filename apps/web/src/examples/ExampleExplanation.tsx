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
