import { useEffect, useRef, useState } from "react";
import { normalizeVariableModel, pinKeys } from "@nudagitty/core";
import type { GraphDocument, GraphEdge, GraphNode, NodeCombinerKind, NodeMechanism, VariableModel } from "@nudagitty/core";
import { gateCoefficientState } from "@nudagitty/core";
import { NODE_COMBINERS } from "../app/constants";

// The generation block rendered as the node's REAL structural equation. The generative form is the thing
// worth teaching (a binary node is a logistic; a two-part outcome is a gate × an exp()), so we show it
// rather than a flat list of coefficients. Each number's UNDERLINE carries its provenance; clicking the
// number opens one popover with everything for that number (its value + how it's set).

export type DepState = "not-learned" | "fitted" | "authored";

const STATE_GLYPH: Record<DepState, string> = { "not-learned": "∅", fitted: "📌", authored: "✎" };
const STATE_LABEL: Record<DepState, string> = { "not-learned": "not learned", fitted: "fitted", authored: "authored" };
const STATE_NOTE: Record<DepState, string> = {
  "not-learned": "No number — the arrow is structural only and contributes nothing to generation.",
  fitted: "Learned from the data column. It is re-fitted whenever the fit re-runs.",
  authored: "You set this. The fit holds it fixed and fits everything else around it."
};
const STATES: DepState[] = ["not-learned", "fitted", "authored"];

export function depStateOf(document: GraphDocument, key: string): DepState {
  if (document.metadata.pins.includes(key)) return "fitted";
  if (document.metadata.authored.includes(key)) return "authored";
  return "not-learned";
}

function fmt(v: number | null): string {
  if (v === null) return "—";
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a < 0.001) return v.toExponential(1);
  return a >= 1 ? v.toFixed(2) : v.toFixed(3);
}

/** A number in the equation + its popover — the single affordance for that number. */
function NumberCell(props: {
  value: number | null; state: DepState; editable: boolean; isData: boolean;
  onValue: (v: number) => void; onState: (s: DepState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const commit = () => { const n = Number(draft); if (Number.isFinite(n)) props.onValue(n); };

  return (
    <span className="eq-cell" ref={wrap}>
      <button type="button" className={`eq-num st-${props.state}`}
        title={`${STATE_LABEL[props.state]} — click to edit`}
        onClick={() => { setDraft(props.value === null ? "0" : String(props.value)); setOpen((v) => !v); }}>
        {fmt(props.value)}
      </button>
      {open && (
        <span className="eq-pop" role="dialog">
          {props.editable && (
            <>
              <span className="eq-pop-row">
                <label className="eq-pop-label">value</label>
                <input className="eq-pop-input" autoFocus value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => { if (e.key === "Enter") { commit(); setOpen(false); } }} />
              </span>
              {props.isData && <span className="eq-pop-sep" />}
            </>
          )}
          {/* Provenance only means something for a DATA node — a from-scratch node's numbers are always yours. */}
          {props.isData && (
            <>
              <span className="eq-pop-label">how it&rsquo;s set</span>
              {STATES.map((s) => (
                <button type="button" key={s}
                  className={`eq-pop-state st-${s}${s === props.state ? " active" : ""}`}
                  onClick={() => { props.onState(s); setOpen(false); }}>
                  <span className="eq-pop-glyph">{STATE_GLYPH[s]}</span>
                  <span>{STATE_LABEL[s]}</span>
                  {s === props.state && <span className="eq-pop-tick">✓</span>}
                </button>
              ))}
              <span className="eq-pop-note">{STATE_NOTE[props.state]}</span>
            </>
          )}
        </span>
      )}
    </span>
  );
}

export interface ParentTerm {
  edge: GraphEdge;
  label: string;
  coef: number | null;   // null ⇒ a non-linear mechanism (edit it on the edge)
  kind: string;
  key: string;
}

/** How this node's family renders as an equation. */
function shapeFor(variable: VariableModel, mechanism: NodeMechanism, chip: React.ReactNode) {
  const vt = variable.valueType;
  const c = mechanism.combiner;
  if (vt === "semicontinuous") return { rhs: <>{chip} = works? × amount</>, noise: true, twoPart: true };
  if (vt === "binary" || c === "bernoulli_logit") return { rhs: <>P( {chip} = 1 ) = σ(η)</>, noise: false, twoPart: false };
  if (vt === "count" || c === "poisson_log") return { rhs: <>{chip} ~ Poisson( exp(η) )</>, noise: false, twoPart: false };
  if (c === "gamma_log") return { rhs: <>{chip} = exp( η + ε )</>, noise: true, twoPart: false };
  if (c === "bounded_logistic") return { rhs: <>{chip} = σ( η + ε )</>, noise: true, twoPart: false };
  if (c === "positive_softplus") return { rhs: <>{chip} = softplus( η + ε )</>, noise: true, twoPart: false };
  return { rhs: <>{chip} = η + ε</>, noise: true, twoPart: false };
}

export function EquationBlock(props: {
  node: GraphNode;
  document: GraphDocument;
  mechanism: NodeMechanism;
  isData: boolean;
  parents: ParentTerm[];
  onMechanism: (id: string, patch: Partial<NodeMechanism>) => void;
  onCoefficient: (edge: GraphEdge, coefficient: number) => void;
  onPinNumber: (key: string) => void;
  onUnpinKey: (key: string) => void;
  onUnlearnNumber: (key: string) => void;
  /** Jump to the edge carrying the imposed effect — where a DERIVED γ is legitimately changed. */
  onSelectEdge?: (edgeId: string) => void;
}) {
  const { node, document: doc, mechanism, isData, parents } = props;
  const variable = normalizeVariableModel(node.variable);
  const [linkOpen, setLinkOpen] = useState(false);

  // A from-scratch node's numbers are always authored; only a DATA node has the 3-way provenance.
  const stateOf = (key: string): DepState => (isData ? depStateOf(doc, key) : "authored");
  const setState = (key: string) => (s: DepState) => {
    if (s === "fitted") props.onPinNumber(key);
    else if (s === "authored") props.onUnpinKey(key);
    else props.onUnlearnNumber(key);
  };

  const chip = <span className="node-name">{node.label || node.id}</span>;
  const { rhs, noise: hasNoise, twoPart } = shapeFor(variable, mechanism, chip);
  const gate = mechanism.gate ?? null;
  const noiseSd = mechanism.noise.kind === "normal" ? mechanism.noise.sd : null;

  const interceptKey = pinKeys.intercept(node.id);
  const noiseKey = pinKeys.noise(node.id);

  const setGateCoef = (source: string, v: number) => {
    if (!gate) return;
    props.onMechanism(node.id, { gate: { intercept: gate.intercept, coefficients: { ...gate.coefficients, [source]: v } } });
  };

  const terms = (lead: string, forGate: boolean) => (
    <>
      <div className="eq-term">
        <span className="eq-lead">{lead} =</span>
        {forGate && gate
          ? /* The gate INTERCEPT has no provenance key in core (only edges/intercept/noise do), so it can't
               be authored-vs-fitted independently. It IS fitted (reconcilePins' gate fit sets it), so say so
               and offer value-editing only — a re-fit will overwrite it. */
            <NumberCell value={gate.intercept} state={isData ? "fitted" : "authored"} editable isData={false}
              onValue={(v) => props.onMechanism(node.id, { gate: { intercept: v, coefficients: gate.coefficients } })}
              onState={() => {}} />
          : <NumberCell value={mechanism.intercept} state={stateOf(interceptKey)} editable isData={isData}
              onValue={(v) => props.onMechanism(node.id, { intercept: v })}
              onState={setState(interceptKey)} />}
      </div>
      {parents.map((p) => {
        const state = stateOf(p.key);
        const off = isData && state === "not-learned";
        // The gate's coefficient for this parent lives on mechanism.gate, not on the edge.
        const value = forGate ? (gate?.coefficients[p.edge.source] ?? 0) : p.coef;
        if (!forGate && p.coef === null) {
          return (
            <div className="eq-term" key={p.edge.id}>
              <span className="eq-lead eq-op">+</span>
              <span className="eq-curve">{p.kind}</span>
              <span className="eq-mul">·</span>
              <span className="eq-parent" title={p.label}>{p.label}</span>
              <span className="eq-off">edit on edge</span>
            </div>
          );
        }
        // The GATE coefficient has no provenance key of its own (it lives on mechanism.gate, not the edge),
        // so ask core who actually owns it. Typing into a cell the ENGINE owns is the lie we're removing:
        // a fitted γ silently reverts on the next gate re-fit, and a DERIVED γ is re-solved from the
        // estimand on every commit. You move a derived γ by moving the STORY, on the pad.
        const gateState = forGate ? gateCoefficientState(doc, node.id, p.edge.source) : null;
        const derived = gateState === "derived";
        const gateFitted = gateState === "fitted";
        const cellState: DepState = derived ? "fitted" : state; // 📌-style chip; `derived` isn't a DepState
        return (
          <div className={`eq-term${off ? " is-off" : ""}${derived ? " is-derived" : ""}`} key={p.edge.id}>
            <span className="eq-lead eq-op">+</span>
            <NumberCell value={off ? null : value} state={cellState}
              editable={!off && !derived && !gateFitted} isData={isData}
              onValue={(v) => (forGate ? setGateCoef(p.edge.source, v) : props.onCoefficient(p.edge, v))}
              onState={derived ? () => {} : setState(p.key)} />
            <span className="eq-mul">·</span>
            {/* Click the parent to open ITS arrow. The canvas is not a reliable route: the import lays nodes
                out in a grid, so an edge between two NEIGHBOURS is drawn entirely underneath them and cannot
                be clicked at all — which made the exposure → outcome edge (and therefore "impose an effect")
                unreachable from a fresh import. The equation always knows which edge each term belongs to. */}
            <button
              type="button"
              className="eq-parent eq-parent-link"
              title={`${p.label} → open this arrow`}
              onClick={() => props.onSelectEdge?.(p.edge.id)}
            >{p.label}</button>
            {off && <span className="eq-off">not learned</span>}
            {derived && (
              <button
                type="button"
                className="eq-derived"
                title="This γ is DERIVED from the imposed effect — the engine re-solves it from the estimand on every commit, so typing it would be overwritten. Change it by moving the story (how much of the effect comes from more people working) on the effect's pad."
                onClick={() => props.onSelectEdge?.(p.edge.id)}
              >
                derived · edit the effect →
              </button>
            )}
          </div>
        );
      })}
    </>
  );

  return (
    <div className="eq-body">
      {/* Line 1: the shape. Doubles as the link/combiner control — no separate dropdown row. */}
      <div className="eq-term eq-shape-row">
        <code className="eq-shape">{rhs}</code>
        <span className="eq-tail" />
        <button type="button" className="eq-link" title="change the link / combiner" onClick={() => setLinkOpen((v) => !v)}>▾</button>
      </div>
      {linkOpen && (
        <div className="eq-term eq-link-row">
          <select value={mechanism.combiner}
            onChange={(e) => { props.onMechanism(node.id, { combiner: e.target.value as NodeCombinerKind }); setLinkOpen(false); }}>
            {NODE_COMBINERS.map((c) => <option value={c.kind} key={c.kind}>{c.label}</option>)}
          </select>
        </div>
      )}

      {twoPart && gate && (
        <>
          <div className="eq-term eq-sub"><code>works? ~ Bernoulli( σ(η_gate) )</code><span className="eq-tail" /><span className="eq-margin-tag">ext</span></div>
          {terms("η_gate", true)}
          <div className="eq-term eq-sub"><code>amount = exp( η + ε )</code><span className="eq-tail" /><span className="eq-margin-tag">int</span></div>
        </>
      )}

      {terms("η", false)}

      {hasNoise && noiseSd !== null && (
        <div className="eq-term">
          <span className="eq-lead">ε ~</span>
          <span className="eq-dist">N(0,</span>
          <NumberCell value={noiseSd} state={stateOf(noiseKey)} editable isData={isData}
            onValue={(v) => props.onMechanism(node.id, { noise: { kind: "normal", mean: 0, sd: v } })}
            onState={setState(noiseKey)} />
          <span className="eq-dist">)</span>
        </div>
      )}
    </div>
  );
}
