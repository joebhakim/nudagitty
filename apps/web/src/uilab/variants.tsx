import { useState } from "react";
import { TactileNumberField } from "../controls";
import { COMBINERS, OUTCOME_LABEL, STATE_GLYPH, STATE_LABEL, STATE_SHORT, cycle, fmt } from "./fixtures";
import type { DepState, Term } from "./fixtures";

type VariantProps = { terms: Term[]; onCycle: (id: string) => void; onValue: (id: string, v: number) => void };

// ─────────────────────────────────────────────────────────────────────────────
// 0. CURRENT — the real markup + real classes, so the baseline is exact.
// ─────────────────────────────────────────────────────────────────────────────
export function CurrentDependence({ terms, onCycle, onValue }: VariantProps) {
  return (
    <div className="dependence-block">
      <div className="dependence-head">
        <strong>Dependence</strong>
        <span className="muted">modeled on parents</span>
      </div>
      <div className="generation-equation dense">
        {terms.map((t) => (
          <div className="generation-term" key={t.id}>
            <span className="gen-term-name" title={t.name}>{t.name}</span>
            {t.state === "not-learned"
              ? <span className="gen-notlearned muted">not learned</span>
              : t.kind === "noise"
                ? <span className="gen-curve muted">{t.display}</span>
                : <TactileNumberField label="" value={t.value ?? 0} step={0.1} nudge={1} onChange={(v) => onValue(t.id, v)} />}
            <DepControlMock state={t.state} onClick={() => onCycle(t.id)} />
          </div>
        ))}
        <div className="generation-term gen-term-combiner">
          <span className="gen-term-name">combiner</span>
          <select defaultValue="additive">{COMBINERS.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
      </div>
      <button type="button" className="generation-fit">Fit all from data →</button>
    </div>
  );
}

// The real 3-button segmented control (∅ / 📌 / ✎). Cycles on click in the lab.
function DepControlMock({ state, onClick }: { state: DepState; onClick: () => void }) {
  return (
    <div className="dep-control" role="group" aria-label="dependence provenance">
      {(["not-learned", "fitted", "authored"] as DepState[]).map((s) => (
        <button type="button" key={s} className={state === s ? "active" : ""} onClick={onClick}>{STATE_GLYPH[s]}</button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A. PROVENANCE LEDGER — the ResidualCheck row idiom: the row TINT is the state.
// ─────────────────────────────────────────────────────────────────────────────
export function LedgerDependence({ terms, onCycle }: VariantProps) {
  return (
    <div className="dl-card">
      <div className="dl-head"><strong>Dependence</strong><span className="muted">modeled on parents</span></div>
      <div className="dl-rows">
        {terms.map((t) => (
          <div className={`dl-row st-${t.state}`} key={t.id}>
            <span className="dl-name" title={t.name}>{t.name}</span>
            <span className="dl-val">{t.kind === "noise" && t.state !== "not-learned" ? "σ 6500" : fmt(t.value)}</span>
            <button type="button" className="dl-chip" onClick={() => onCycle(t.id)} title="click to change how this number is set">
              {STATE_GLYPH[t.state]} {STATE_LABEL[t.state]}
            </button>
          </div>
        ))}
        <div className="dl-row dl-row-plain">
          <span className="dl-name">combiner</span>
          <select className="dl-select" defaultValue="additive">{COMBINERS.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
      </div>
      <button type="button" className="dl-fit">Fit all from data →</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// E. LEDGER, EXCEPTION-TINTED — same rows as A, but "fitted" (the overwhelmingly
// common state) is left QUIET. Only the exceptions you actually need to spot —
// authored (you set it) and not-learned (no number yet) — carry a tint. In A,
// with 8 fitted parents, the tint is a uniform wall of teal that says nothing.
// ─────────────────────────────────────────────────────────────────────────────
export function LedgerQuietDependence(props: VariantProps) {
  return <div className="dl-quiet"><LedgerDependence {...props} /></div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// B. RESTYLE ONLY — identical markup to CURRENT, wrapped so CSS recolours it.
// ─────────────────────────────────────────────────────────────────────────────
export function RestyledDependence(props: VariantProps) {
  return <div className="dep-restyled"><CurrentDependence {...props} /></div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// C. EQUATION — render the structural equation literally; coefficients are chips.
// ─────────────────────────────────────────────────────────────────────────────
export function EquationDependence({ terms, onCycle }: VariantProps) {
  const intercept = terms.find((t) => t.kind === "intercept");
  const coefs = terms.filter((t) => t.kind === "coef");
  const noise = terms.find((t) => t.kind === "noise");
  return (
    <div className="de-card">
      <div className="de-head"><strong>Dependence</strong><span className="muted">modeled on parents</span></div>
      <div className="de-eq">
        <div className="de-lhs">{OUTCOME_LABEL} =</div>
        {intercept && (
          <div className="de-term">
            <span className={`de-coef st-${intercept.state}`} onClick={() => onCycle(intercept.id)}>{fmt(intercept.value)}</span>
          </div>
        )}
        {coefs.map((t) => (
          t.state === "not-learned" ? (
            // No number yet ⇒ the arrow is structural only. Don't fake a coefficient slot.
            <div className="de-term de-term-off" key={t.id} onClick={() => onCycle(t.id)}>
              <span className="de-op">+</span>
              <span className="de-parent">{t.name.replace(" ×", "")}</span>
              <span className="de-off-tag">not learned</span>
            </div>
          ) : (
            <div className="de-term" key={t.id}>
              <span className="de-op">+</span>
              <span className={`de-coef st-${t.state}`} onClick={() => onCycle(t.id)}>{fmt(t.value)}</span>
              <span className="de-mul">·</span>
              <span className="de-parent">{t.name.replace(" ×", "")}</span>
            </div>
          )
        ))}
        {noise && (
          <div className="de-term">
            <span className="de-op">+</span>
            <span className={`de-coef st-${noise.state}`} onClick={() => onCycle(noise.id)}>ε ~ normal(0, 6500)</span>
          </div>
        )}
      </div>
      <div className="de-via">
        <span className="muted">via</span>
        <select defaultValue="additive">{COMBINERS.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      <button type="button" className="dl-fit">Fit all from data →</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// D. ALIGNED TABLE — dense 3-column table, tabular numerals, quiet provenance.
// ─────────────────────────────────────────────────────────────────────────────
export function TableDependence({ terms, onCycle }: VariantProps) {
  return (
    <div className="dt-card">
      <div className="dt-head"><strong>Dependence</strong><span className="muted">modeled on parents</span></div>
      <table className="dt-table">
        <thead><tr><th>term</th><th>value</th><th>from</th></tr></thead>
        <tbody>
          {terms.map((t) => (
            <tr key={t.id} className={`st-${t.state}`}>
              <td className="dt-name" title={t.name}>{t.name}</td>
              <td className="dt-val">{t.kind === "noise" && t.state !== "not-learned" ? "σ 6500" : fmt(t.value)}</td>
              <td className="dt-from">
                <button type="button" onClick={() => onCycle(t.id)}>{STATE_GLYPH[t.state]} {STATE_SHORT[t.state]}</button>
              </td>
            </tr>
          ))}
          <tr className="dt-row-plain">
            <td className="dt-name">combiner</td>
            <td colSpan={2}><select defaultValue="additive">{COMBINERS.map((c) => <option key={c}>{c}</option>)}</select></td>
          </tr>
        </tbody>
      </table>
      <button type="button" className="dl-fit">Fit all from data →</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The PRECEDENT — a static ResidualCheck, rendered with the REAL classes, so each
// variant can be judged against the thing it has to sit next to.
// ─────────────────────────────────────────────────────────────────────────────
export function ResidualCheckMock() {
  return (
    <div className="residual-check verdict-violated">
      <div className="residual-head">
        <strong>Residual check<span className="info-dot" title="two-part diagnostics">ⓘ</span></strong>
        <span className="residual-verdict">endogenous ⚠</span>
      </div>
      <p className="muted">Residuals <b>depend on the parents</b> (dCor 0.23, p=0.005); worst = <b>earnings '74</b>. The exogenous-noise assumption <b>ε ⊥ X looks violated</b>.</p>
      <div className="residual-tests">
        <div className="rtest fail"><span className="rt-name">exogeneity (ε ⊥ X)</span><span className="rt-stat">dCor 0.23, p=0.005</span></div>
        <div className="rtest pass"><span className="rt-name">homoskedasticity (ε² ⊥ X)</span><span className="rt-stat">dCor 0.08, p=0.31</span></div>
        <div className="rtest warn"><span className="rt-name">Gaussian noise (Jarque–Bera)</span><span className="rt-stat">skew -2.0, exk 6.8, p&lt;0.001</span></div>
        <div className="rtest fail"><span className="rt-name">participation gate (P(Y&gt;0))</span><span className="rt-stat">87% obs / 89% pred, dCor 0.35</span></div>
      </div>
    </div>
  );
}

export function useTerms(initial: Term[]) {
  const [terms, setTerms] = useState(initial);
  return {
    terms,
    onCycle: (id: string) => setTerms((ts) => ts.map((t) => (t.id === id ? { ...t, state: cycle(t.state), value: t.state === "not-learned" && t.value === null ? 0 : t.value } : t))),
    onValue: (id: string, v: number) => setTerms((ts) => ts.map((t) => (t.id === id ? { ...t, value: v } : t)))
  };
}
