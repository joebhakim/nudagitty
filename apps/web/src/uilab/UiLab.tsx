import { useState } from "react";
import type { ComponentType } from "react";
import { TERMS } from "./fixtures";
import {
  CurrentDependence, EquationDependence, LedgerDependence, LedgerQuietDependence, ResidualCheckMock,
  RestyledDependence, TableDependence, useTerms
} from "./variants";
import type { Term } from "./fixtures";
import { EQ_NODES } from "./nodeSpecs";
import { EquationV2 } from "./EquationV2";

type VariantComponent = ComponentType<{ terms: Term[]; onCycle: (id: string) => void; onValue: (id: string, v: number) => void }>;

// Each variant is rendered at the REAL editor-column width and stacked directly above a ResidualCheck —
// the question isn't "is it pretty in isolation" but "does it sit right next to the precedent, in a narrow
// pane, with real 8-parent / long-label / 4-significant-figure data".
const VARIANTS: Array<{ id: string; title: string; note: string; Component: VariantComponent }> = [
  { id: "current", title: "0 · Current", note: "Baseline — the real markup + classes. Purple is off-palette; state is only legible by reading each segmented control; values don't align.", Component: CurrentDependence },
  { id: "ledger", title: "A · Provenance ledger", note: "Adopts the ResidualCheck row idiom: the row TINT is the provenance. Values right-aligned + tabular. The chip cycles state.", Component: LedgerDependence },
  { id: "ledger-quiet", title: "E · Ledger, exception-tinted", note: "Same rows as A, but 'fitted' (the default, ~every row) stays QUIET — only the exceptions you need to spot (authored, not-learned) carry a tint.", Component: LedgerQuietDependence },
  { id: "restyle", title: "B · Restyle only", note: "Identical layout/markup to Current — only the palette + provenance colours are unified. Lowest risk, mostly CSS.", Component: RestyledDependence },
  { id: "equation", title: "C · Equation", note: "Renders the structural equation literally; each coefficient is a chip coloured by provenance. Click a coefficient to cycle.", Component: EquationDependence },
  { id: "table", title: "D · Aligned table", note: "Dense 3-column table with tabular numerals. Calmest; provenance is a quiet column rather than a row tint.", Component: TableDependence }
];

const WIDTHS = [
  { id: "narrow", label: "narrow (280px)", px: 280 },
  { id: "editor", label: "editor pane (320px)", px: 320 },
  { id: "wide", label: "wide (420px)", px: 420 }
];

export function UiLab() {
  const [width, setWidth] = useState(320);
  const [withResidual, setWithResidual] = useState(true);

  return (
    <div className="uilab">
      <header className="uilab-head">
        <div>
          <h1>UI lab — the “Dependence” chunk</h1>
          <p className="uilab-sub">
            Five directions, at real editor width, each stacked above the <strong>ResidualCheck</strong> precedent
            it has to sit next to. Click a provenance chip / coefficient to cycle{" "}
            <code>not-learned → fitted → authored</code> and watch how each style carries state. Numbers are the
            real fitted values from <code>lalonde-fit-recover</code>. Dark follows your OS/browser theme
            (the app styles dark via <code>prefers-color-scheme</code>, so a fake in-page toggle would lie).
          </p>
        </div>
        <div className="uilab-controls">
          <label><input type="checkbox" checked={withResidual} onChange={(e) => setWithResidual(e.target.checked)} /> ResidualCheck</label>
          <label>
            width{" "}
            <select value={width} onChange={(e) => setWidth(Number(e.target.value))}>
              {WIDTHS.map((w) => <option key={w.id} value={w.px}>{w.label}</option>)}
            </select>
          </label>
        </div>
      </header>

      <section className="uilab-feature">
        <h2>C2 · Equation, family-aware <span className="uilab-pick">← chosen direction</span></h2>
        <p className="uilab-note uilab-note-wide">
          The equation renders the node's <strong>actual generative form</strong>, because that form is the thing
          worth teaching. A binary node is a logistic; the two-part outcome is a gate × an exp() — so the gate and
          the <code>exp</code> stop being invisible tooltip lore and just become the equation. Coefficients are{" "}
          <strong>ghost inputs</strong>: they read as part of the equation, click one to edit. The glyph on the
          right is provenance (📌 fitted / ✎ authored / ∅ not learned) — click to change.
        </p>
        <div className="uilab-grid">
          {EQ_NODES.map((n) => (
            <section className="uilab-col" key={n.id}>
              <h3>{n.label} <span className="muted">· {n.family}</span></h3>
              <div className="uilab-pane" style={{ width }}>
                <EquationV2 node={n} />
              </div>
            </section>
          ))}
        </div>
      </section>

      <h2 className="uilab-section-title">All directions (the original comparison)</h2>
      <div className="uilab-grid">
        {VARIANTS.map((v) => (
          <VariantColumn key={v.id} title={v.title} note={v.note} width={width} withResidual={withResidual} Component={v.Component} />
        ))}
      </div>
    </div>
  );
}

// A column owns its own term state, so cycling a chip in one variant doesn't mutate the others — you can
// leave each in a different configuration and compare them side by side.
function VariantColumn(props: {
  title: string; note: string; width: number; withResidual: boolean; Component: VariantComponent;
}) {
  const state = useTerms(TERMS);
  const { Component } = props;
  return (
    <section className="uilab-col">
      <h2>{props.title}</h2>
      <p className="uilab-note">{props.note}</p>
      <div className="uilab-pane" style={{ width: props.width }}>
        <Component {...state} />
        {props.withResidual && <ResidualCheckMock />}
      </div>
    </section>
  );
}
