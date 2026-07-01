import type { OverlapDiagnostic } from "@nudagitty/core";
import { ARM_COLORS } from "../charts/chartColors";

// Overlap / positivity diagnostic for the current adjustment: the per-arm propensity-score
// distribution (the estimators' OWN bin-based model), the inverse-probability-weight summary, and
// the common-support share. Positivity is the one identification assumption checkable from data —
// a control pile near 0 the treated never reach is the violation that makes propensity-based
// adjustment (IPW, matching) fail. Derived live from the document; null unless the example has a
// binary point-treatment adjustment spec with covariates.

// Arm colors from the canonical vocabulary (gray control / teal treated) — the treated arm no longer
// near-collides with the reserved method-blue (--causal).
const OVERLAP_CTRL = ARM_COLORS.untreated;
const OVERLAP_TREAT = ARM_COLORS.treated;

// Propensity-score distribution by arm (share within arm so the two are comparable despite very
// different N). A control pile near 0 that the treated never reach is the positivity violation.
export function OverlapHistogram({ overlap }: { overlap: OverlapDiagnostic }) {
  const bins = 20;
  const W = 340, H = 132, padL = 6, padR = 6, padB = 18, padT = 6;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const share = (xs: number[]): number[] => {
    const counts = new Array(bins).fill(0);
    for (const p of xs) counts[Math.min(bins - 1, Math.max(0, Math.floor(p * bins)))] += 1;
    const total = xs.length || 1;
    return counts.map((c) => c / total);
  };
  const ctrl = share(overlap.controlPropensities);
  const treat = share(overlap.treatedPropensities);
  const maxShare = Math.max(0.0001, ...ctrl, ...treat);
  const bw = plotW / bins;
  const bar = (s: number, i: number, fill: string) => {
    const h = (s / maxShare) * plotH;
    return <rect key={`${fill}-${i}`} x={padL + i * bw} y={padT + plotH - h} width={Math.max(0.5, bw - 1)} height={h} style={{ fill, opacity: 0.55 }} />;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="overlap-hist" role="img" aria-label="Propensity-score distribution by arm">
      {ctrl.map((s, i) => bar(s, i, OVERLAP_CTRL))}
      {treat.map((s, i) => bar(s, i, OVERLAP_TREAT))}
      {[0, 0.5, 1].map((t) => (
        <text key={t} x={padL + t * plotW} y={H - 5} textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"} className="overlap-tick">{t}</text>
      ))}
    </svg>
  );
}

export function OverlapInspector(props: { overlap: OverlapDiagnostic | null }) {
  const { overlap } = props;

  if (!overlap) {
    return (
      <div className="overlap-inspector">
        <section>
          <p className="muted">No overlap diagnostic for this example — it needs a binary treatment with adjustment covariates (a point-treatment adjustment spec).</p>
        </section>
      </div>
    );
  }

  return (
    <div className="overlap-inspector">
      <section>
        <h4>Overlap / positivity</h4>
        <div className="overlap-legend">
          <span><i className="overlap-sw" style={{ background: OVERLAP_CTRL }} /> control (n={overlap.controlSampleSize})</span>
          <span><i className="overlap-sw" style={{ background: OVERLAP_TREAT }} /> treated</span>
          <span className="muted">P(treatment) — share within arm</span>
        </div>
        <OverlapHistogram overlap={overlap} />
        <div className="overlap-tiles">
          <div><span>control ESS</span><strong>{Math.round(overlap.controlEffectiveSampleSize)}</strong><small>of {overlap.controlSampleSize} ({Math.round((100 * overlap.controlEffectiveSampleSize) / Math.max(1, overlap.controlSampleSize))}%)</small></div>
          <div><span>min propensity</span><strong>{overlap.minPropensity.toFixed(3)}</strong><small>≈0 ⇒ off support</small></div>
          <div><span>max ctrl weight</span><strong>{overlap.maxControlWeight.toFixed(1)}</strong><small>w = p/(1−p)</small></div>
          <div><span>common support</span><strong>{Math.round(overlap.commonSupportShare * 100)}%</strong><small>rows in overlap</small></div>
        </div>
        <p className="muted overlap-prov">ESS = (Σw)²/Σw² over control IP weights w = p/(1−p), from {overlap.propensityModel}. A control pile near 0 the treated never reach is a positivity violation — IPW/matching break there, so a biased number can hide as a confident one.</p>
      </section>
    </div>
  );
}
