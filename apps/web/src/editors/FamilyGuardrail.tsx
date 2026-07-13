import { useMemo } from "react";
import { familyWarnings } from "@nudagitty/core";
import type { FamilyWarning, GraphDocument, VariableModel } from "@nudagitty/core";
import { InfoDot } from "../controls";

const GUARD_TIP =
  "The engine will happily fit and simulate a family that could not possibly have produced your data, and say nothing. The worst case is the DEFAULT: earnings declared `continuous` are fit and generated as linear + Gaussian noise, so ~9% of the simulated population earns NEGATIVE money and nobody earns exactly zero — against real rows where negatives are impossible and 12% earn exactly zero. Every estimate below that is then computed on a population that cannot exist. These checks compare what the DATA says is possible against what the DGP actually emits. They are heuristics (thresholds, not proofs), so they always show you the number that fired them — judge the evidence, not the badge.";

const FAMILY_NAME: Partial<Record<VariableModel["valueType"], string>> = {
  semicontinuous: "two-part (zero + amount)",
  positive: "positive (log-scale)",
  continuous: "continuous"
};

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const money = (v: number) => (Math.abs(v) >= 1000 ? `${v < 0 ? "−" : ""}${Math.abs(Math.round(v)).toLocaleString()}` : String(Math.round(v)));

const INDICATOR_TIP =
  "A point mass is a DISCONTINUITY, and no smooth basis function — no polynomial, log, sqrt, spline or asinh — can represent one. So no functional form you can put on this edge will ever capture it; the mass needs its OWN regressor. This is not a stylistic point. On the LaLonde data the indicator 1(earnings-74 == 0) has a logit coefficient of 1.94–3.26 for programme participation, while earnings-74 IN DOLLARS has a coefficient of −0.00007 (Smith & Todd 2005, Table 3). The mass carries essentially all of the selection signal; the amount carries none. It becomes a NODE rather than a hidden term because it is a different causal construct — \"was this person employed?\" can have different causes and different effects from \"how much did they earn?\".";

function Body({ w, label }: { w: FamilyWarning; label: string }) {
  if (w.kind === "category-needs-dummies") {
    return (
      <p>
        <b>{label}</b> is an <b>unordered category</b> used as a predictor. A linear term cannot consume one
        at all — there is no coefficient you can put on a label. It needs <b>indicator variables</b>, one per
        level against a reference.
      </p>
    );
  }
  if (w.kind === "point-mass-predictor-needs-indicator") {
    return (
      <p>
        <b>{pct(w.fraction)}</b> of <b>{label}</b> sits at <b>exactly zero</b>, and it is used as a{" "}
        <b>predictor</b>. A point mass is a discontinuity — <i>no</i> curve you put on this edge can
        represent it. It needs its own indicator.
      </p>
    );
  }
  if (w.kind === "generates-impossible-negatives") {
    return (
      <p>
        This DGP emits values the data says are <b>impossible</b>: <b>{pct(w.fraction)}</b> of simulated{" "}
        <b>{label}</b> comes out <b>negative</b> (as low as <b>{money(w.extreme ?? 0)}</b>), yet not one real
        row is below zero. Every estimate downstream is being computed on a population that cannot exist.
      </p>
    );
  }
  if (w.kind === "zero-spike-under-additive") {
    return (
      <p>
        <b>{pct(w.fraction)}</b> of real <b>{label}</b> rows sit at <b>exactly zero</b> — a point mass, not a
        tail. An additive family cannot reproduce that spike <i>or</i> the floor beneath it: to fit the mean it
        will smear probability straight through zero and invent negatives.
      </p>
    );
  }
  return (
    <p>
      <b>{pct(w.fraction)}</b> of real <b>{label}</b> rows are <b>negative</b> (down to{" "}
      <b>{money(w.extreme ?? 0)}</b>), but the family is log-scale. Those rows are not modelled — they are
      silently re-labelled as <i>“it never happened”</i>, which is a different claim about the world.
    </p>
  );
}

/**
 * The check the app never made. Shown wherever the family matters — on the variable itself, and before you
 * impose a benchmark on it, because a positive control built on a family that cannot generate its own
 * outcome is worse than no benchmark at all.
 */
export function FamilyGuardrail(props: {
  document: GraphDocument;
  nodeId: string;
  samples?: readonly number[];
  onChangeFamily: (nodeId: string, kind: VariableModel["valueType"]) => void;
  onAddIndicator?: (nodeId: string) => void;
  onAddDummies?: (nodeId: string) => void;
}) {
  const warnings = useMemo(
    () => familyWarnings(props.document, props.nodeId, props.samples),
    [props.document, props.nodeId, props.samples]
  );
  if (warnings.length === 0) return null;
  const label = props.nodeId;

  // Several rules routinely fire on the SAME disease from different ends (the zero spike and the negative
  // draws are one misspecification, not two), so the fix is offered once per distinct family — not once per
  // finding, which would just stack identical buttons.
  const fixes = [...new Set(warnings.map((w) => w.suggest).filter(Boolean))] as Array<VariableModel["valueType"]>;
  // The SAME detected fact — a pile-up at exactly zero — gets a different fix depending on the variable's
  // ROLE: as an outcome it needs a two-part family; as a predictor it needs its own indicator.
  const needsIndicator = warnings.some((w) => w.kind === "point-mass-predictor-needs-indicator");
  const needsDummies = warnings.some((w) => w.kind === "category-needs-dummies");
  const onlyRepresentation = (needsIndicator || needsDummies) && fixes.length === 0;

  return (
    <div className="family-guardrail">
      <strong>
        {onlyRepresentation ? "⚠ This predictor cannot be represented as it stands" : "⚠ The family cannot produce this variable"}
        {<InfoDot tip={onlyRepresentation ? INDICATOR_TIP : GUARD_TIP} href="/effects.html#honesty" />}
      </strong>
      {warnings.map((w) => <Body key={w.kind} w={w} label={label} />)}
      <div className="family-guardrail-fixes">
        {fixes.map((kind) => (
          <button type="button" key={kind} onClick={() => props.onChangeFamily(props.nodeId, kind)}>
            switch to {FAMILY_NAME[kind] ?? kind}
          </button>
        ))}
        {needsIndicator && props.onAddIndicator && (
          <button type="button" onClick={() => props.onAddIndicator!(props.nodeId)}>
            add a zero-indicator
          </button>
        )}
        {needsDummies && props.onAddDummies && (
          <button type="button" onClick={() => props.onAddDummies!(props.nodeId)}>
            add indicator variables
          </button>
        )}
      </div>
    </div>
  );
}
