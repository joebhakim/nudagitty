// PROTOTYPE v2 — three-box output redesign, rebuilt to use the app's visual language:
// levels-in-one-plot (not facets), CI error bars, the base.css color vocabulary, an outcome
// selector, and a generic structural-glyph treatment axis (no per-example prose). Gallery-only,
// hardcoded real K=3 HIV numbers. Throwaway.
import { useState } from "react";

type Method = {
  id: string;
  label: string;
  short: string;
  never: number; // % event under never-treat regime
  always: number; // % event under always-treat regime
  se: number; // CI half-width (pp) — fake but plausible (IPW wide from weights, truth narrow)
  effect: number; // pp (always - never)
  verdict: "truth" | "recovers" | "overadjusts" | "confounded";
  mechanics: { model: string; variables: string; note: string; weights?: number[] };
};

// Real numbers from the K=3 HIV methods table. se is illustrative for the prototype.
const METHODS: Method[] = [
  { id: "oracle", label: "True effect (g-formula)", short: "truth", never: 33, always: 12, se: 1.4, effect: -21.3, verdict: "truth",
    mechanics: { model: "Re-simulates the built model under each strategy", variables: "the whole DGP", note: "The oracle — the target, not a from-data estimate." } },
  { id: "ipw", label: "IPW", short: "IPW", never: 33, always: 12, se: 5.0, effect: -21.0, verdict: "recovers",
    mechanics: { model: "P(treat | CD4₀..₂) logistic → weight 1/P", variables: "CD4 only (never the outcome)", note: "Reweights to break CD4→treat; keeps CD4 on the causal path.", weights: [1.1, 1.4, 2.1, 3.6, 1.2, 6.8, 1.0, 2.4, 1.3] } },
  { id: "matching", label: "Matching", short: "matching", never: 38, always: 16, se: 4.2, effect: -21.9, verdict: "recovers",
    mechanics: { model: "1:1 nearest-neighbour on the propensity score", variables: "CD4 only", note: "Pairs comparable units; approximates randomization." } },
  { id: "gest", label: "g-estimation", short: "g-est", never: 28, always: 9, se: 3.2, effect: -19.3, verdict: "recovers",
    mechanics: { model: "Additive blip: solve E[(A−E[A|L])·(Y−ψA)]=0", variables: "CD4 + treatment", note: "Backs out the per-step effect without conditioning on the mediator." } },
  { id: "stratified", label: "Stratified", short: "stratified", never: 24, always: 16, se: 2.6, effect: -8.4, verdict: "overadjusts",
    mechanics: { model: "Average within CD4 strata, re-weight strata", variables: "CD4 + treatment", note: "Conditions on the mediator CD4 → over-adjusts." } },
  { id: "regression", label: "Outcome regression", short: "regression", never: 23, always: 15, se: 2.1, effect: -7.8, verdict: "overadjusts",
    mechanics: { model: "logistic Y ~ A + CD4, predict under each strategy", variables: "CD4 + treatment", note: "Holds observed CD4 fixed → erases the mediated benefit." } },
  { id: "aipw", label: "AIPW (doubly robust)", short: "AIPW", never: 24, always: 16, se: 2.5, effect: -7.6, verdict: "overadjusts",
    mechanics: { model: "outcome model + inverse-propensity correction", variables: "CD4 + treatment", note: "Dominated here by the over-adjusting outcome model." } },
  { id: "naive", label: "Naïve (observed)", short: "observed", never: 21, always: 16, se: 1.8, effect: -4.6, verdict: "confounded",
    mechanics: { model: "raw E[Y|A] by observed treatment", variables: "none", note: "No adjustment — confounded by who gets treated." } }
];

// Verdict colors from the base.css vocabulary (no ad-hoc hexes).
const VERDICT_VAR: Record<Method["verdict"], string> = {
  truth: "var(--chart-series-2)",   // ochre = the "adjusted/reference" emphasis
  recovers: "var(--ok)",
  overadjusts: "var(--danger)",
  confounded: "var(--chart-muted)"
};

// The treatment is a JOINED regime (A₀A₁A₂), not a node — represent each arm by its assignment
// pattern, generically. Filled = treat, open = not. Degenerates to one cell for a single node.
const ARMS = [
  { id: "always", pattern: [1, 1, 1] },
  { id: "never", pattern: [0, 0, 0] }
];

const fmtEffect = (e: number) => `${e > 0 ? "+" : "−"}${Math.abs(e).toFixed(1)}`;
const Y_MAX = 45;

// One plot, both arms (levels) in it. Shows observed + truth + the selected method, each as a
// point with a CI error bar, connected across arms (slope = the effect). Color vocab.
function ArmsPlot({ selected }: { selected: Method }) {
  const W = 300, H = 188, padL = 30, padR = 10, padT = 10, padB = 52;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const yPix = (v: number) => padT + plotH - (v / Y_MAX) * plotH;
  const armX = (i: number) => padL + plotW * (0.28 + 0.44 * i);

  const observed = METHODS.find((m) => m.id === "naive")!;
  const truth = METHODS.find((m) => m.id === "oracle")!;
  const showSelected = selected.id !== "oracle" && selected.id !== "naive";
  const series = [
    { m: observed, color: "var(--chart-muted)", label: "observed", k: 0 },
    { m: truth, color: VERDICT_VAR.truth, label: "truth", k: 1 },
    ...(showSelected ? [{ m: selected, color: VERDICT_VAR[selected.verdict], label: selected.short, k: 2 }] : [])
  ];
  const n = series.length;
  const dodge = (k: number) => (k - (n - 1) / 2) * 12;
  const armVal = (m: Method, i: number) => (i === 0 ? m.always : m.never);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ob-arms-svg" role="img" aria-label="Outcome by treatment regime">
      {/* y gridlines + ticks */}
      {[0, 15, 30, 45].map((v) => (
        <g key={v}>
          <line x1={padL} y1={yPix(v)} x2={W - padR} y2={yPix(v)} stroke="var(--line)" strokeWidth="1" />
          <text x={padL - 4} y={yPix(v) + 3} textAnchor="end" fontSize="8.5" fill="var(--chart-muted)">{v}</text>
        </g>
      ))}
      {/* per-series connecting lines (the effect slope) */}
      {series.map((s) => (
        <line key={`l${s.k}`} x1={armX(0) + dodge(s.k)} y1={yPix(armVal(s.m, 0))} x2={armX(1) + dodge(s.k)} y2={yPix(armVal(s.m, 1))}
              stroke={s.color} strokeWidth={s.m.id === selected.id || s.m.id === "oracle" ? 1.6 : 1} opacity="0.5" />
      ))}
      {/* points + CI error bars */}
      {series.map((s) => ARMS.map((_, i) => {
        const v = armVal(s.m, i), x = armX(i) + dodge(s.k);
        return (
          <g key={`${s.k}-${i}`}>
            <line x1={x} y1={yPix(v - s.m.se)} x2={x} y2={yPix(v + s.m.se)} stroke={s.color} strokeWidth="1.5" />
            <line x1={x - 2.5} y1={yPix(v - s.m.se)} x2={x + 2.5} y2={yPix(v - s.m.se)} stroke={s.color} strokeWidth="1.5" />
            <line x1={x - 2.5} y1={yPix(v + s.m.se)} x2={x + 2.5} y2={yPix(v + s.m.se)} stroke={s.color} strokeWidth="1.5" />
            <circle cx={x} cy={yPix(v)} r={3.1} fill={s.color} />
          </g>
        );
      }))}
      {/* baseline */}
      <line x1={padL} y1={yPix(0)} x2={W - padR} y2={yPix(0)} stroke="var(--line-strong)" strokeWidth="1" />
      {/* structural glyphs per arm (the joined regime) */}
      {ARMS.map((arm, i) => (
        <g key={arm.id}>
          {arm.pattern.map((p, j) => {
            const cell = 9, gap = 2, totalW = arm.pattern.length * cell + (arm.pattern.length - 1) * gap;
            const gx = armX(i) - totalW / 2 + j * (cell + gap);
            return <rect key={j} x={gx} y={H - 30} width={cell} height={cell} rx={1.5}
                         fill={p ? "var(--accent)" : "none"} stroke="var(--line-strong)" strokeWidth="1" />;
          })}
          <text x={armX(i)} y={H - 6} textAnchor="middle" fontSize="8" fill="var(--chart-muted)">A₀A₁A₂</text>
        </g>
      ))}
    </svg>
  );
}

export function OutputBoxesPrototype() {
  const [selectedId, setSelectedId] = useState("ipw");
  const [outcome, setOutcome] = useState("AIDS_death");
  const selected = METHODS.find((m) => m.id === selectedId)!;
  return (
    <div className="ob-stack">
      <section className="ob-box">
        <div className="ob-box-bar">
          <h3 className="ob-box-head">Outcome by treatment</h3>
          <label className="ob-outcome">outcome
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="AIDS_death">AIDS / death</option>
              <option value="cd4_final">final CD4</option>
            </select>
          </label>
        </div>
        <ArmsPlot selected={selected} />
        <div className="ob-legend">
          <span><i style={{ background: "var(--chart-muted)" }} /> observed</span>
          <span><i style={{ background: "var(--chart-series-2)" }} /> truth</span>
          <span><i style={{ background: VERDICT_VAR[selected.verdict] }} /> {selected.short}</span>
          <span className="ob-legend-note">y = % event · ▣ = treat, □ = not · bars = 95% CI</span>
        </div>
      </section>

      <section className="ob-box">
        <h3 className="ob-box-head">Methods</h3>
        <table className="ob-table">
          <thead><tr><th>method</th><th>never</th><th>always</th><th>effect</th></tr></thead>
          <tbody>
            {METHODS.map((m) => (
              <tr key={m.id}
                  className={[m.verdict === "truth" ? "ob-row-truth" : "", m.id === selectedId ? "ob-row-selected" : ""].filter(Boolean).join(" ") || undefined}
                  onClick={() => setSelectedId(m.id)}>
                <td><span className="ob-dot" style={{ background: VERDICT_VAR[m.verdict] }} />{m.label}</td>
                <td>{m.never}%</td>
                <td>{m.always}%</td>
                <td className="ob-effect" style={{ color: VERDICT_VAR[m.verdict] }}>{fmtEffect(m.effect)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="ob-box">
        <h3 className="ob-box-head">How {selected.label} works</h3>
        <dl className="ob-mech">
          <dt>model</dt><dd>{selected.mechanics.model}</dd>
          <dt>variables</dt><dd>{selected.mechanics.variables}</dd>
          {selected.mechanics.weights && (
            <><dt>weights</dt><dd><span className="ob-spark">{selected.mechanics.weights.map((w, i) => <i key={i} style={{ height: `${Math.min(100, w / 7 * 100)}%` }} />)}</span> 1/P spread</dd></>
          )}
        </dl>
        <p className="ob-mech-note">{selected.mechanics.note}</p>
      </section>
    </div>
  );
}
