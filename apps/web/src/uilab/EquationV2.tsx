import { useState } from "react";
import type { EqNode, EqPart, EqTerm } from "./nodeSpecs";
import { STATE_GLYPH, STATE_LABEL, cycle } from "./fixtures";
import type { DepState } from "./fixtures";

// Equation view, v2 — family-aware. The generative FORM is the teaching payload: a binary node is a
// logistic; a two-part node is a gate × an exp(). No prose — the equation says it. The LHS is the
// variable in the house .node-name chip; the RHS is the actual structural form.

function fmtCoef(v: number | null): string {
  if (v === null) return "—";
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a < 0.001) return v.toExponential(1);
  return a >= 1 ? v.toFixed(2) : v.toFixed(3);
}

// Reads as part of the equation; click turns it into an input.
function Ghost({ value, state, onChange }: { value: number | null; state: DepState; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (value === null) return <span className="eq2-num st-not-learned">—</span>;
  if (editing) {
    return (
      <input
        className={`eq2-num eq2-num-input st-${state}`}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { const n = Number(draft); if (Number.isFinite(n)) onChange(n); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(false); }}
      />
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

function Prov({ state, onCycle }: { state: DepState; onCycle: () => void }) {
  return (
    <button type="button" className={`eq2-prov st-${state}`} onClick={onCycle} title={`${STATE_LABEL[state]} — click to change`}>
      {STATE_GLYPH[state]}
    </button>
  );
}

function Predictor(props: {
  lead: string; part: EqPart;
  onCoef: (id: string, v: number) => void; onCycle: (id: string) => void;
  onIntercept: (v: number) => void; onCycleIntercept: () => void;
}) {
  const { part } = props;
  return (
    <div className="eq2-pred">
      <div className="eq2-term">
        <span className="eq2-lead">{props.lead} =</span>
        <Ghost value={part.intercept.value} state={part.intercept.state} onChange={props.onIntercept} />
        <span className="eq2-tail" />
        <Prov state={part.intercept.state} onCycle={props.onCycleIntercept} />
      </div>
      {part.terms.map((t: EqTerm) => {
        const off = t.state === "not-learned";
        return (
          <div className={`eq2-term${off ? " is-off" : ""}`} key={t.id}>
            <span className="eq2-lead eq2-op">+</span>
            {off
              ? <span className="eq2-parent" title={t.parent}>{t.parent}</span>
              : <><Ghost value={t.coef} state={t.state} onChange={(v) => props.onCoef(t.id, v)} />
                  <span className="eq2-mul">·</span>
                  <span className="eq2-parent" title={t.parent}>{t.parent}</span></>}
            {off && <span className="eq2-off">not learned</span>}
            <span className="eq2-tail" />
            <Prov state={t.state} onCycle={() => props.onCycle(t.id)} />
          </div>
        );
      })}
    </div>
  );
}

export function EquationV2({ node: initial }: { node: EqNode }) {
  const [node, setNode] = useState(initial);
  const twoPart = node.family === "semicontinuous";

  const editPart = (which: "eta" | "gate", fn: (p: EqPart) => EqPart) =>
    setNode((n) => ({ ...n, [which]: fn(n[which] as EqPart) }));
  const setCoef = (w: "eta" | "gate") => (id: string, v: number) =>
    editPart(w, (p) => ({ ...p, terms: p.terms.map((t) => (t.id === id ? { ...t, coef: v } : t)) }));
  const cycleTerm = (w: "eta" | "gate") => (id: string) =>
    editPart(w, (p) => ({ ...p, terms: p.terms.map((t) => (t.id === id ? { ...t, state: cycle(t.state), coef: t.coef ?? 0 } : t)) }));
  const setInt = (w: "eta" | "gate") => (v: number) => editPart(w, (p) => ({ ...p, intercept: { ...p.intercept, value: v } }));
  const cycleInt = (w: "eta" | "gate") => () => editPart(w, (p) => ({ ...p, intercept: { ...p.intercept, state: cycle(p.intercept.state) } }));

  const chip = <span className="node-name">{node.label}</span>;

  return (
    <div className="eq2-card">
      <div className="eq2-head">
        <strong>Dependence</strong>
        <span className="muted">modeled on parents</span>
      </div>

      {/* The shape: the variable (house chip) as LHS, its real generative form as RHS. */}
      <div className="eq2-shape">
        {node.family === "binary"
          ? <code>P( {chip} = 1 ) = σ(η)</code>
          : twoPart
            ? <code>{chip} = works? × amount</code>
            : <code>{chip} = η + ε</code>}
      </div>

      <div className="eq2-body">
        {twoPart && node.gate && (
          <>
            <div className="eq2-sub"><code>works? ~ Bernoulli( σ(η_gate) )</code><span className="eq2-margin-tag">extensive</span></div>
            <Predictor lead="η_gate" part={node.gate}
              onCoef={setCoef("gate")} onCycle={cycleTerm("gate")}
              onIntercept={setInt("gate")} onCycleIntercept={cycleInt("gate")} />
            <div className="eq2-sub"><code>amount = exp( η + ε )</code><span className="eq2-margin-tag">intensive</span></div>
          </>
        )}

        <Predictor lead="η" part={node.eta}
          onCoef={setCoef("eta")} onCycle={cycleTerm("eta")}
          onIntercept={setInt("eta")} onCycleIntercept={cycleInt("eta")} />

        {node.noise && (
          <div className="eq2-term eq2-noise">
            <span className="eq2-lead">ε ~</span>
            <span className="eq2-dist">Normal(0,</span>
            <Ghost value={node.noise.sd} state={node.noise.state}
              onChange={(v) => setNode((n) => (n.noise ? { ...n, noise: { ...n.noise, sd: v } } : n))} />
            <span className="eq2-dist">)</span>
            <span className="eq2-tail" />
            <Prov state={node.noise.state}
              onCycle={() => setNode((n) => (n.noise ? { ...n, noise: { ...n.noise, state: cycle(n.noise.state) } } : n))} />
          </div>
        )}
      </div>

      <button type="button" className="dl-fit">Fit all from data →</button>
    </div>
  );
}
