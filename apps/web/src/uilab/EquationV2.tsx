import { useState } from "react";
import { FAMILY_SHAPE } from "./nodeSpecs";
import type { EqNode, EqPart, EqTerm } from "./nodeSpecs";
import { STATE_GLYPH, STATE_LABEL, cycle } from "./fixtures";
import type { DepState } from "./fixtures";

// Equation view, v2 — family-aware. The generative FORM is the teaching payload: a binary node is a
// logistic, a two-part node is a gate × an exp(). Coefficients are ghost inputs (look like text, editable
// on click) so the block stays an equation you can read, not a form you have to parse.

function fmtCoef(v: number | null): string {
  if (v === null) return "—";
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a < 0.001) return v.toExponential(1);
  if (a >= 1000) return v.toFixed(2);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

// A number that reads as part of the equation until you touch it, then becomes an input.
function GhostNumber({ value, state, onChange }: { value: number | null; state: DepState; onChange: (v: number) => void }) {
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
    <span
      className={`eq2-num st-${state}`}
      role="button"
      tabIndex={0}
      title="click to edit"
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      onKeyDown={(e) => { if (e.key === "Enter") { setDraft(String(value)); setEditing(true); } }}
    >
      {fmtCoef(value)}
    </span>
  );
}

function ProvChip({ state, onCycle }: { state: DepState; onCycle: () => void }) {
  return (
    <button type="button" className={`eq2-prov st-${state}`} onClick={onCycle} title={`${STATE_LABEL[state]} — click to change`}>
      {STATE_GLYPH[state]}
    </button>
  );
}

// One linear predictor: intercept + Σ coefficient·parent, one term per line.
function Predictor(props: {
  name: string; part: EqPart; onCoef: (id: string, v: number) => void; onCycle: (id: string) => void;
  onIntercept: (v: number) => void; onCycleIntercept: () => void;
}) {
  const { part } = props;
  return (
    <div className="eq2-pred">
      <div className="eq2-term">
        <span className="eq2-lead">{props.name} =</span>
        <GhostNumber value={part.intercept.value} state={part.intercept.state} onChange={props.onIntercept} />
        <span className="eq2-tail" />
        <ProvChip state={part.intercept.state} onCycle={props.onCycleIntercept} />
      </div>
      {part.terms.map((t: EqTerm) => (
        <div className={`eq2-term ${t.state === "not-learned" ? "is-off" : ""}`} key={t.id}>
          <span className="eq2-lead eq2-op">+</span>
          <GhostNumber value={t.coef} state={t.state} onChange={(v) => props.onCoef(t.id, v)} />
          <span className="eq2-mul">·</span>
          <span className="eq2-parent" title={t.parent}>{t.parent}</span>
          {t.state === "not-learned" && <span className="eq2-off">not learned</span>}
          <span className="eq2-tail" />
          <ProvChip state={t.state} onCycle={() => props.onCycle(t.id)} />
        </div>
      ))}
    </div>
  );
}

export function EquationV2({ node: initial }: { node: EqNode }) {
  const [node, setNode] = useState(initial);
  const shape = FAMILY_SHAPE[node.family];

  const editPart = (which: "eta" | "gate", fn: (p: EqPart) => EqPart) =>
    setNode((n) => ({ ...n, [which]: fn(n[which] as EqPart) }));
  const setCoef = (which: "eta" | "gate") => (id: string, v: number) =>
    editPart(which, (p) => ({ ...p, terms: p.terms.map((t) => (t.id === id ? { ...t, coef: v } : t)) }));
  const cycleTerm = (which: "eta" | "gate") => (id: string) =>
    editPart(which, (p) => ({ ...p, terms: p.terms.map((t) => (t.id === id ? { ...t, state: cycle(t.state), coef: t.coef ?? 0 } : t)) }));
  const setIntercept = (which: "eta" | "gate") => (v: number) =>
    editPart(which, (p) => ({ ...p, intercept: { ...p.intercept, value: v } }));
  const cycleIntercept = (which: "eta" | "gate") => () =>
    editPart(which, (p) => ({ ...p, intercept: { ...p.intercept, state: cycle(p.intercept.state) } }));

  const twoPart = node.family === "semicontinuous";

  return (
    <div className="eq2-card">
      <div className="eq2-head">
        <strong>Dependence</strong>
        <span className="muted">modeled on parents</span>
      </div>

      {/* THE SHAPE — what kind of thing this variable is. The teaching payload. */}
      <div className="eq2-shape">
        <code>
          <b>{node.label}</b>{" "}
          {node.family === "binary" ? <>: P({node.label} = 1) = σ(η)</> : shape.shape}
        </code>
        <p className="eq2-gloss">{shape.gloss}</p>
      </div>

      <div className="eq2-body">
        {twoPart && node.gate && (
          <>
            <div className="eq2-sub">
              <span className="eq2-sub-title">works?</span>
              <code>~ Bernoulli( σ(η<sub>gate</sub>) )</code>
              <span className="eq2-margin-tag">extensive margin</span>
            </div>
            <Predictor
              name="η_gate" part={node.gate}
              onCoef={setCoef("gate")} onCycle={cycleTerm("gate")}
              onIntercept={setIntercept("gate")} onCycleIntercept={cycleIntercept("gate")}
            />
            <div className="eq2-sub">
              <span className="eq2-sub-title">amount</span>
              <code>= exp( η + ε )</code>
              <span className="eq2-margin-tag">intensive margin</span>
            </div>
          </>
        )}

        <Predictor
          name="η" part={node.eta}
          onCoef={setCoef("eta")} onCycle={cycleTerm("eta")}
          onIntercept={setIntercept("eta")} onCycleIntercept={cycleIntercept("eta")}
        />

        {node.noise && (
          <div className="eq2-term eq2-noise">
            <span className="eq2-lead">ε ~</span>
            <span className="eq2-dist">Normal(0, {node.noise.sd})</span>
            <span className="eq2-tail" />
            <ProvChip state={node.noise.state} onCycle={() => setNode((n) => (n.noise ? { ...n, noise: { ...n.noise, state: cycle(n.noise.state) } } : n))} />
          </div>
        )}
        {node.family === "binary" && (
          <p className="eq2-foot">No ε — a coin flip at probability σ(η) <em>is</em> the randomness.</p>
        )}
      </div>

      <button type="button" className="dl-fit">Fit all from data →</button>
    </div>
  );
}
