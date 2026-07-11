import { useEffect, useRef, useState } from "react";
import type { EqNode, EqPart, EqTerm } from "./nodeSpecs";
import { STATE_GLYPH, STATE_LABEL } from "./fixtures";
import type { DepState } from "./fixtures";

// Equation view — family-aware, dense. The block reads as a plain equation: no per-row control clutter.
// A number's UNDERLINE carries its provenance (teal = fitted, ochre = authored, dashed = not learned), and
// clicking the number opens one small popover holding everything for that number — value + how it's set.

function fmtCoef(v: number | null): string {
  if (v === null) return "—";
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a < 0.001) return v.toExponential(1);
  return a >= 1 ? v.toFixed(2) : v.toFixed(3);
}

const INFO: Record<DepState, string> = {
  "not-learned": "No number — the arrow is structural only and contributes nothing to generation.",
  fitted: "Learned from the data column. It is re-fitted whenever the fit re-runs.",
  authored: "You set this. The fit holds it fixed and fits everything else around it."
};

const STATES: DepState[] = ["not-learned", "fitted", "authored"];

/** The number, plus its popover — the single affordance for this coefficient. */
function NumberCell({ value, state, onChange, onState }: {
  value: number | null; state: DepState;
  onChange: (v: number) => void; onState: (s: DepState) => void;
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

  const commit = () => { const n = Number(draft); if (Number.isFinite(n)) onChange(n); };

  return (
    <span className="eq2-cell" ref={wrap}>
      <button type="button" className={`eq2-num st-${state}`}
        title={`${STATE_LABEL[state]} — click to edit`}
        onClick={() => { setDraft(value === null ? "0" : String(value)); setOpen((v) => !v); }}>
        {fmtCoef(value)}
      </button>

      {open && (
        <span className="eq2-pop" role="dialog">
          <span className="eq2-pop-row">
            <label className="eq2-pop-label">value</label>
            <input className="eq2-pop-input" autoFocus value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === "Enter") { commit(); setOpen(false); } }} />
          </span>
          <span className="eq2-pop-sep" />
          <span className="eq2-pop-label">how it&rsquo;s set</span>
          {STATES.map((s) => (
            <button type="button" key={s}
              className={`eq2-pop-state st-${s}${s === state ? " active" : ""}`}
              onClick={() => { onState(s); setOpen(false); }}>
              <span className="eq2-pop-glyph">{STATE_GLYPH[s]}</span>
              <span>{STATE_LABEL[s]}</span>
              {s === state && <span className="eq2-pop-tick">✓</span>}
            </button>
          ))}
          <span className="eq2-pop-note">{INFO[state]}</span>
        </span>
      )}
    </span>
  );
}

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
        <NumberCell value={part.intercept.value} state={part.intercept.state}
          onChange={props.onIntercept} onState={props.onInterceptState} />
      </div>
      {part.terms.map((t: EqTerm) => {
        const off = t.state === "not-learned";
        return (
          <div className={`eq2-term${off ? " is-off" : ""}`} key={t.id}>
            <span className="eq2-lead eq2-op">+</span>
            <NumberCell value={off ? null : t.coef} state={t.state}
              onChange={(v) => props.onCoef(t.id, v)} onState={(s) => props.onState(t.id, s)} />
            <span className="eq2-mul">·</span>
            <span className="eq2-parent" title={t.parent}>{t.parent}</span>
            {off && <span className="eq2-off">not learned</span>}
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
            <NumberCell value={node.noise.sd} state={node.noise.state}
              onChange={(v) => setNode((n) => (n.noise ? { ...n, noise: { ...n.noise, sd: v } } : n))}
              onState={(s) => setNode((n) => (n.noise ? { ...n, noise: { ...n.noise, state: s } } : n))} />
            <span className="eq2-dist">)</span>
          </div>
        )}
      </div>

      <button type="button" className="dl-fit">Fit all from data →</button>
    </div>
  );
}
