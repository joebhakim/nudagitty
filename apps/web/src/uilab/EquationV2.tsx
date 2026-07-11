import { useState } from "react";
import type { EqNode, EqPart, EqTerm } from "./nodeSpecs";
import { STATE_LABEL, cycle } from "./fixtures";
import type { DepState } from "./fixtures";

// Equation view — family-aware, DENSE. One box. The shape line is line 1 and doubles as the
// link/combiner control (click the ▾). Each number carries a compact 2×2 icon control that fits inside
// the line height, so the real ∅/📌/✎ actions are back without costing a single pixel of height.

function fmtCoef(v: number | null): string {
  if (v === null) return "—";
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a < 0.001) return v.toExponential(1);
  return a >= 1 ? v.toFixed(2) : v.toFixed(3);
}

function Ghost({ value, state, onChange }: { value: number | null; state: DepState; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (value === null) return <span className="eq2-num st-not-learned">—</span>;
  if (editing) {
    return (
      <input className={`eq2-num eq2-num-input st-${state}`} autoFocus value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { const n = Number(draft); if (Number.isFinite(n)) onChange(n); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(false); }} />
    );
  }
  return (
    <span className={`eq2-num st-${state}`} role="button" tabIndex={0} title="click to edit"
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      onKeyDown={(e) => { if (e.key === "Enter") { setDraft(String(value)); setEditing(true); } }}>
      {fmtCoef(value)}
    </span>
  );
}

// The real controls, back — but as a 2×2 icon grid sized to fit inside one equation line, so it costs
// zero extra height. ∅ not learned · 📌 fit from data · ✎ author · ⓘ where this number came from.
function TermControls({ state, info, onSet }: { state: DepState; info: string; onSet: (s: DepState) => void }) {
  const btn = (s: DepState, glyph: string) => (
    <button type="button" className={`eq2-ctl-b${state === s ? " active" : ""} st-${s}`}
      title={STATE_LABEL[s]} onClick={() => onSet(s)}>{glyph}</button>
  );
  return (
    <span className="eq2-ctl" role="group" aria-label="how this number is set">
      {btn("not-learned", "∅")}
      {btn("fitted", "●")}
      {btn("authored", "✎")}
      <button type="button" className="eq2-ctl-b eq2-ctl-info" title={info}>ⓘ</button>
    </span>
  );
}

const INFO: Record<DepState, string> = {
  "not-learned": "No number: the arrow is structural only and contributes nothing to generation.",
  fitted: "Fitted from the data column by the DGP fit — it will be re-learned whenever the fit re-runs.",
  authored: "You set this number. The fit holds it fixed and fits everything else around it."
};

function Predictor(props: {
  lead: string; part: EqPart;
  onCoef: (id: string, v: number) => void; onState: (id: string, s: DepState) => void;
  onIntercept: (v: number) => void; onInterceptState: (s: DepState) => void;
}) {
  const { part } = props;
  return (
    <>
      <div className="eq2-term">
        <span className="eq2-lead">{props.lead} =</span>
        <Ghost value={part.intercept.value} state={part.intercept.state} onChange={props.onIntercept} />
        <span className="eq2-tail" />
        <TermControls state={part.intercept.state} info={INFO[part.intercept.state]} onSet={props.onInterceptState} />
      </div>
      {part.terms.map((t: EqTerm) => {
        const off = t.state === "not-learned";
        return (
          <div className={`eq2-term${off ? " is-off" : ""}`} key={t.id}>
            <span className="eq2-lead eq2-op">+</span>
            {off
              ? <span className="eq2-parent" title={t.parent}>{t.parent} <i>not learned</i></span>
              : <><Ghost value={t.coef} state={t.state} onChange={(v) => props.onCoef(t.id, v)} />
                  <span className="eq2-mul">·</span>
                  <span className="eq2-parent" title={t.parent}>{t.parent}</span></>}
            <span className="eq2-tail" />
            <TermControls state={t.state} info={INFO[t.state]} onSet={(s) => props.onState(t.id, s)} />
          </div>
        );
      })}
    </>
  );
}

const LINKS = ["additive", "bernoulli logit", "gamma log", "two-part", "bounded logistic", "poisson log"];

export function EquationV2({ node: initial }: { node: EqNode }) {
  const [node, setNode] = useState(initial);
  const [linkOpen, setLinkOpen] = useState(false);
  const twoPart = node.family === "semicontinuous";

  const editPart = (w: "eta" | "gate", fn: (p: EqPart) => EqPart) => setNode((n) => ({ ...n, [w]: fn(n[w] as EqPart) }));
  const setCoef = (w: "eta" | "gate") => (id: string, v: number) =>
    editPart(w, (p) => ({ ...p, terms: p.terms.map((t) => (t.id === id ? { ...t, coef: v } : t)) }));
  const setState = (w: "eta" | "gate") => (id: string, s: DepState) =>
    editPart(w, (p) => ({ ...p, terms: p.terms.map((t) => (t.id === id ? { ...t, state: s, coef: t.coef ?? 0 } : t)) }));
  const setInt = (w: "eta" | "gate") => (v: number) => editPart(w, (p) => ({ ...p, intercept: { ...p.intercept, value: v } }));
  const setIntState = (w: "eta" | "gate") => (s: DepState) => editPart(w, (p) => ({ ...p, intercept: { ...p.intercept, state: s } }));

  const chip = <span className="node-name">{node.label}</span>;
  const shape = node.family === "binary"
    ? <>P( {chip} = 1 ) = σ(η)</>
    : twoPart ? <>{chip} = works? × amount</> : <>{chip} = η + ε</>;

  return (
    <div className="eq2-card">
      <div className="eq2-head">
        <strong>Dependence</strong>
        <span className="muted">modeled on parents</span>
      </div>

      <div className="eq2-body">
        {/* Line 1: the shape. Doubles as the link/combiner control — no separate dropdown row. */}
        <div className="eq2-term eq2-shape-row">
          <code className="eq2-shape">{shape}</code>
          <span className="eq2-tail" />
          <button type="button" className="eq2-link" title="change the link / combiner" onClick={() => setLinkOpen((v) => !v)}>▾</button>
        </div>
        {linkOpen && (
          <div className="eq2-term eq2-link-row">
            <select defaultValue={twoPart ? "two-part" : node.family === "binary" ? "bernoulli logit" : "additive"}
              onChange={() => setLinkOpen(false)}>
              {LINKS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
        )}

        {twoPart && node.gate && (
          <>
            <div className="eq2-term eq2-sub"><code>works? ~ Bernoulli( σ(η_gate) )</code><span className="eq2-tail" /><span className="eq2-margin-tag">ext</span></div>
            <Predictor lead="η_gate" part={node.gate}
              onCoef={setCoef("gate")} onState={setState("gate")}
              onIntercept={setInt("gate")} onInterceptState={setIntState("gate")} />
            <div className="eq2-term eq2-sub"><code>amount = exp( η + ε )</code><span className="eq2-tail" /><span className="eq2-margin-tag">int</span></div>
          </>
        )}

        <Predictor lead="η" part={node.eta}
          onCoef={setCoef("eta")} onState={setState("eta")}
          onIntercept={setInt("eta")} onInterceptState={setIntState("eta")} />

        {node.noise && (
          <div className="eq2-term">
            <span className="eq2-lead">ε ~</span>
            <span className="eq2-dist">N(0,</span>
            <Ghost value={node.noise.sd} state={node.noise.state}
              onChange={(v) => setNode((n) => (n.noise ? { ...n, noise: { ...n.noise, sd: v } } : n))} />
            <span className="eq2-dist">)</span>
            <span className="eq2-tail" />
            <TermControls state={node.noise.state} info={INFO[node.noise.state]}
              onSet={(s) => setNode((n) => (n.noise ? { ...n, noise: { ...n.noise, state: s } } : n))} />
          </div>
        )}
      </div>

      <button type="button" className="dl-fit">Fit all from data →</button>
    </div>
  );
}
