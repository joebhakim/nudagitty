import { Fragment, useState } from "react";
import type { ContinuousEffectComparison, EffectMethodId } from "@nudagitty/core";

// Plain-language notes for the continuous-exposure estimators — the dose-response
// analog of METHOD_GLOSSARY. Deliberately name the double-robustness and positivity
// lessons the continuous-dose-response flagship demonstrates.
const METHOD_NOTES: Record<EffectMethodId, string> = {
  crude: "Regresses the outcome on the dose alone, ignoring the confounders — so it inherits their bias (here it flips the sign).",
  "g-computation": "Fits an outcome model on dose + confounders, then averages the predicted dose-response over the population. The outcome-model workhorse.",
  "gps-ipw": "Reweights each row by f(X)/f(X|C) so dose becomes independent of the confounders, then regresses outcome on dose. Fragile: when a dose is implausible given the confounders the weights explode.",
  aipw: "Combines the outcome model with the propensity weights. Doubly robust — correct if EITHER model is right, so it can recover the truth even when the weights are broken.",
  oracle: "Re-simulates the structural model forcing the dose to each value — the constructed truth E[Y | do(X = x)], not a from-data estimator."
};

// Direction is carried by the +/− sign, not colour — a positive dose-slope is not
// "bias" the way the binary panel's red/green coding implies, so numbers stay neutral.
const signed = (value: number, digits = 2): string => (value >= 0 ? "+" : "") + value.toFixed(digits);

export function ContinuousEffectReadout(props: { comparison: ContinuousEffectComparison; xLabel: string; yLabel: string }) {
  const { comparison, xLabel, yLabel } = props;
  const [primaryId, setPrimaryId] = useState<EffectMethodId>("g-computation");
  const [openId, setOpenId] = useState<EffectMethodId | null>(null);
  const primary = comparison.methods.find((method) => method.id === primaryId) ?? comparison.methods[1]!;
  const crude = comparison.methods.find((method) => method.id === "crude")!;
  const xUnit = comparison.xUnit || "unit";
  const yUnit = comparison.yUnit || "units";
  const overlap = comparison.overlap;
  const positivity = overlap
    ? overlap.essFraction < 0.1 || overlap.maxWeight > 20 ? "strained" : overlap.essFraction < 0.4 ? "watch" : "ok"
    : null;

  return (
    <>
      <div className="continuous-effect-headline">
        <div className="methods-primary-select-row">
          <label htmlFor="cont-effect-primary">Adjusted effect of {xLabel} on {yLabel}</label>
          <select id="cont-effect-primary" className="methods-primary-select" value={primaryId} onChange={(event) => setPrimaryId(event.target.value as EffectMethodId)}>
            {comparison.methods.filter((method) => method.id !== "oracle").map((method) => (
              <option key={method.id} value={method.id}>{method.label}</option>
            ))}
          </select>
        </div>
        <div className="methods-primary-headline">
          <strong>{signed(primary.slope)} {yUnit} per {xUnit}</strong>
          <span>crude {signed(crude.slope)} · a p10→p90 dose swing moves {yLabel} by {signed(primary.standardized, 1)} {yUnit}</span>
        </div>
        <p className="methods-primary-plain">{METHOD_NOTES[primary.id]}</p>
      </div>

      <details className="output-box what-if-method-table-card nested-method-table" open>
        <summary>
          <strong>Compare all methods</strong>
          <span>slope + a p10→p90 dose swing · adjusting for {comparison.covariates.join(", ") || "nothing"}</span>
        </summary>
        <table className="what-if-method-table">
          <thead>
            <tr>
              <th>Method</th>
              <th>slope / {xUnit}</th>
              <th>p10→p90 {yUnit}</th>
              <th>ESS</th>
            </tr>
          </thead>
          <tbody>
            {comparison.methods.map((method) => {
              const isOracle = method.id === "oracle";
              const open = openId === method.id;
              const rowClass = [isOracle ? "method-row-oracle" : "", method.id === primaryId ? "method-row-primary" : "", "what-if-method-row", open ? "is-open" : ""].filter(Boolean).join(" ");
              return (
                <Fragment key={method.id}>
                  <tr className={rowClass} onClick={() => setOpenId(open ? null : method.id)}>
                    <td><strong>{open ? "▾ " : "▸ "}{isOracle ? "True effect — oracle" : method.label}{method.id === primaryId ? " ◄" : ""}</strong></td>
                    <td>{signed(method.slope)}</td>
                    <td>{signed(method.standardized, 1)}</td>
                    <td>{method.ess === null ? "—" : `${Math.round(method.ess * 100)}%`}</td>
                  </tr>
                  {open && (
                    <tr className="what-if-method-detail">
                      <td colSpan={4}><p>{METHOD_NOTES[method.id]}</p></td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </details>

      {overlap && positivity && (
        <details className="output-box continuous-overlap-card" open>
          <summary>
            <strong>Generalized-propensity overlap</strong>
            <span>continuous positivity — is every dose plausible given {comparison.covariates.join(", ")}?</span>
          </summary>
          <div className="continuous-overlap-body">
            <span className={`positivity-badge positivity-${positivity}`}>{positivity}</span>
            <dl>
              <div><dt>effective sample</dt><dd>{(overlap.essFraction * 100).toFixed(1)}% of rows</dd></div>
              <div><dt>max weight</dt><dd>{Math.round(overlap.maxWeight)}×</dd></div>
              <div><dt>model</dt><dd>{overlap.model}</dd></div>
            </dl>
            <p className="continuous-overlap-note">
              {positivity === "strained"
                ? "The density weights concentrate on a handful of rows — GPS-IPW is unreliable here. Trust the outcome model (g-computation) or the doubly-robust AIPW, which the table shows recovering the oracle."
                : "Doses are well supported across the confounder range, so the weighted estimators are trustworthy too."}
            </p>
          </div>
        </details>
      )}
    </>
  );
}
