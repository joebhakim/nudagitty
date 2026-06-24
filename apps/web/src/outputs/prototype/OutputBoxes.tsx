// PROTOTYPE — three-box output redesign (graphs / table / mechanics), rendered in the gallery for
// visual iteration. Self-contained with hardcoded real HIV-example numbers; not wired into the app.
// Throwaway scaffolding: delete or graduate into real components once the visuals are settled.
import { useState } from "react";

type Method = {
  id: string;
  label: string;
  short: string;
  never: number; // % event under never-treat
  always: number; // % event under always-treat
  effect: number; // pp (always - never)
  verdict: "truth" | "recovers" | "overadjusts" | "confounded";
  mechanics: { model: string; variables: string; note: string; weights?: number[] };
};

// Real numbers from the K=3 HIV methods table.
const METHODS: Method[] = [
  { id: "oracle", label: "True effect (g-formula)", short: "truth", never: 33, always: 12, effect: -21.3, verdict: "truth",
    mechanics: { model: "Re-simulates the built model under each strategy", variables: "the whole DGP", note: "This is the oracle — the target, not a from-data estimate." } },
  { id: "ipw", label: "IPW", short: "IPW", never: 33, always: 12, effect: -21.0, verdict: "recovers",
    mechanics: { model: "P(treat | CD4₀..₂) logistic → weight 1/P", variables: "CD4 only (never the outcome)", note: "Reweights to break CD4→treat; keeps CD4 on the causal path.", weights: [1.1, 1.4, 2.1, 3.6, 1.2, 6.8, 1.0, 2.4, 1.3] } },
  { id: "matching", label: "Matching", short: "matching", never: 38, always: 16, effect: -21.9, verdict: "recovers",
    mechanics: { model: "1:1 nearest-neighbour on the propensity score", variables: "CD4 only", note: "Pairs comparable units; approximates randomization." } },
  { id: "gest", label: "g-estimation", short: "g-est", never: 28, always: 9, effect: -19.3, verdict: "recovers",
    mechanics: { model: "Additive blip: solve E[(A−E[A|L])·(Y−ψA)]=0", variables: "CD4 + treatment", note: "Backs out the per-step effect without conditioning on the mediator." } },
  { id: "stratified", label: "Stratified", short: "stratified", never: 24, always: 16, effect: -8.4, verdict: "overadjusts",
    mechanics: { model: "Average within CD4 strata, re-weight strata", variables: "CD4 + treatment", note: "Conditions on the mediator CD4 → over-adjusts." } },
  { id: "regression", label: "Outcome regression", short: "regression", never: 23, always: 15, effect: -7.8, verdict: "overadjusts",
    mechanics: { model: "logistic Y ~ A + CD4, predict under each strategy", variables: "CD4 + treatment", note: "Holds observed CD4 fixed → erases the mediated benefit." } },
  { id: "aipw", label: "AIPW (doubly robust)", short: "AIPW", never: 24, always: 16, effect: -7.6, verdict: "overadjusts",
    mechanics: { model: "outcome model + inverse-propensity correction", variables: "CD4 + treatment", note: "Dominated here by the over-adjusting outcome model." } },
  { id: "naive", label: "Naïve", short: "naïve", never: 21, always: 16, effect: -4.6, verdict: "confounded",
    mechanics: { model: "raw E[Y|A] by observed treatment", variables: "none", note: "No adjustment — confounded by who gets treated." } }
];

const fmtEffect = (e: number) => `${e > 0 ? "+" : "−"}${Math.abs(e).toFixed(1)}`;

const VERDICT_COLOR: Record<Method["verdict"], string> = {
  truth: "#d97706", recovers: "#15803d", overadjusts: "#b91c1c", confounded: "#6b7280"
};
const FACET_IDS = ["oracle", "ipw", "regression", "naive"]; // curated few

const Y_MAX = 45;

function FacetBars({ m, selected }: { m: Method; selected: boolean }) {
  const W = 92, H = 118, padB = 22, padT = 16, plotH = H - padB - padT;
  const barW = 22, gap = 14, x0 = (W - (2 * barW + gap)) / 2;
  const bar = (v: number, i: number, fill: string) => {
    const h = (v / Y_MAX) * plotH;
    return (
      <g key={i}>
        <rect x={x0 + i * (barW + gap)} y={padT + plotH - h} width={barW} height={h} fill={fill} rx={2} />
        <text x={x0 + i * (barW + gap) + barW / 2} y={padT + plotH - h - 3} textAnchor="middle" fontSize="9" fill="#475569">{v}</text>
      </g>
    );
  };
  const c = VERDICT_COLOR[m.verdict];
  const truthAlwaysY = padT + plotH - (12 / Y_MAX) * plotH; // ghost reference: where the truth's "always" sits
  return (
    <div className={`ob-facet${selected ? " ob-facet-selected" : ""}`}>
      <div className="ob-facet-title" style={{ color: c }}>{m.short}</div>
      <div className="ob-facet-effect" style={{ color: c }}>{fmtEffect(m.effect)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="ob-facet-svg">
        {m.id !== "oracle" && <line x1={4} y1={truthAlwaysY} x2={W - 4} y2={truthAlwaysY} stroke="#d97706" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />}
        {bar(m.never, 0, "#94a3b8")}
        {bar(m.always, 1, c)}
        <line x1={6} y1={padT + plotH} x2={W - 6} y2={padT + plotH} stroke="#cbd5e1" strokeWidth="1" />
        <text x={x0 + barW / 2} y={H - 7} textAnchor="middle" fontSize="8.5" fill="#64748b">never</text>
        <text x={x0 + barW + gap + barW / 2} y={H - 7} textAnchor="middle" fontSize="8.5" fill="#64748b">always</text>
      </svg>
    </div>
  );
}

export function OutputBoxesPrototype() {
  const [selectedId, setSelectedId] = useState("ipw");
  const selected = METHODS.find((m) => m.id === selectedId)!;
  const facets = METHODS.filter((m) => FACET_IDS.includes(m.id) || m.id === selectedId);
  return (
    <div className="ob-stack">
      <section className="ob-box">
        <h3 className="ob-box-head">Outcome by treatment</h3>
        <div className="ob-facets">
          {facets.map((m) => <FacetBars key={m.id} m={m} selected={m.id === selectedId} />)}
        </div>
        <div className="ob-axis-note">y = % AIDS / death · truth set apart</div>
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
                <td><span className="ob-dot" style={{ background: VERDICT_COLOR[m.verdict] }} />{m.label}</td>
                <td>{m.never}%</td>
                <td>{m.always}%</td>
                <td className="ob-effect" style={{ color: VERDICT_COLOR[m.verdict] }}>{fmtEffect(m.effect)}</td>
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
