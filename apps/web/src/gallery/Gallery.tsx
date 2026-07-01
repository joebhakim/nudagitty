import type { ReactNode } from "react";
import type { GraphNode } from "@nudagitty/core";
import {
  CategoryOutcomePlot,
  RiskCurvePlot,
  binaryOutcomeSummaries,
  continuousOutcomeSummaries,
  binnedBinaryRiskSummaries
} from "../charts/CategoryOutcomePlot";
import { ScatterChart } from "../charts/ScatterChart";
import type { DoseResponseCurves } from "@nudagitty/core";
import { NodeNamesProvider } from "../shared/NodeNames";
import { CONTINUOUS_VARIABLE, binaryNodeState, binaryPoints, continuousNodeState, continuousPoints, doseCurvesFixture, huhShift, ledgerRows, riskPoints, scatter2d, scatterFit } from "./fixtures";
import type { ScatterPoint } from "../charts/CategoryOutcomePlot";
import { HuhShiftPlot, WhatIfStrategySurvivalCurve } from "../outputs/modules/components";
import { whatIfSurvival } from "./fixtures";
import { BasicComparisonLedgerPlot } from "../panels/demo";
import { NodeDistributionMiniPlot, BinaryNodeDistributionMiniPlot } from "../canvas/FlowGraphCanvas";
import { OverlapHistogram } from "../outputs/OverlapInspector";
import { overlapDiagnostic } from "./fixtures";
import { OutputBoxesPrototype } from "../outputs/prototype/OutputBoxes";

// Fake nodes so the SvgAxisName chips resolve, like in the real app.
const FAKE_NODES = [
  { id: "Mortality", label: "Mortality" },
  { id: "Obesity", label: "Obesity" },
  { id: "Survival", label: "Survival" },
  { id: "fall_height", label: "fall height" },
  { id: "Posttest", label: "Posttest" }
] as unknown as GraphNode[];

// Container sizes — the continuous "container" axis sampled at its boundaries
// (the flex/overflow bugs live here): real panel sizes plus a tiny and a tall.
const SIZES = [
  { id: "short 300x118", w: 300, h: 118 },
  { id: "panel 280x200", w: 280, h: 200 },
  { id: "wide 460x150", w: 460, h: 150 },
  { id: "tall 200x300", w: 200, h: 300 },
  { id: "tiny 150x96", w: 150, h: 96 }
];

type Fixture = { name: string; render: () => ReactNode };

// Each subplot gets a stable, sequential two-letter code (AA, AB, … in
// section → fixture → size order) for quick referencing ("fix BD").
function codeFor(index: number): string {
  return String.fromCharCode(65 + Math.floor(index / 26)) + String.fromCharCode(65 + (index % 26));
}

function binaryFixture(name: string, pX1: number, p0: number, p1: number, n = 220): Fixture {
  const data = binaryPoints(pX1, p0, p1, n);
  return { name, render: () => (
    <CategoryOutcomePlot points={data} summaries={binaryOutcomeSummaries(data, "Obesity")} xLabel="Obesity" yLabel="Mortality=1" yDomain={[0, 1]} outcomeKind="binary" />
  ) };
}

function continuousFixture(name: string, m0: number, m1: number, sd: number): Fixture {
  const data = continuousPoints(m0, m1, sd);
  return { name, render: () => (
    <CategoryOutcomePlot points={data} summaries={continuousOutcomeSummaries(data, "Obesity")} xLabel="Obesity" yLabel="Posttest" yDomain={[0, 100]} outcomeKind="continuous" />
  ) };
}

function riskFixture(name: string, risk: (x: number) => number, binCount: number): Fixture {
  const data = riskPoints(0, 30, risk);
  return { name, render: () => (
    <RiskCurvePlot bins={binnedBinaryRiskSummaries(data, binCount)} xLabel="fall height" yLabel="Survival=1" />
  ) };
}

function scatterFixture(name: string, points: ScatterPoint[], doseResponse?: DoseResponseCurves): Fixture {
  const fit = scatterFit(points);
  return { name, render: () => (
    <ScatterChart
      points={points}
      xDomain={fit.xDomain}
      yDomain={fit.yDomain}
      regression={fit.regression}
      xLabel="fall height"
      yLabel="Posttest"
      pointAlpha={0.4}
      doseResponse={doseResponse ?? null}
    />
  ) };
}

function huhShiftFixture(name: string, observed: number, causal: number, spread: number): Fixture {
  const shift = huhShift(observed, causal, { spread });
  return { name, render: () => <HuhShiftPlot shift={shift} /> };
}

function ledgerFixture(name: string, rows: Array<[string, number, "raw" | "adjusted" | "selected" | "intervention" | "dgp"]>): Fixture {
  const data = ledgerRows(rows);
  return { name, render: () => <BasicComparisonLedgerPlot rows={data} /> };
}

// The mini-plots draw a translated <g> meant to sit inside a node SVG; frame it in its own viewBox
// (the plot spans roughly x −53..53, y 35..77 in the node's coordinate space) so it stands alone.
function nodeMiniFixture(name: string, node: () => ReactNode): Fixture {
  return { name, render: () => (
    <svg viewBox="-56 33 112 48" style={{ width: "100%", height: "100%" }} role="img" aria-label={name}>{node()}</svg>
  ) };
}

const SECTIONS: Array<{ title: string; fixtures: Fixture[] }> = [
  {
    title: "CategoryOutcomePlot — binary outcome",
    fixtures: [
      binaryFixture("normal 40/60", 0.5, 0.4, 0.6),
      binaryFixture("both ~100%", 0.5, 0.97, 0.99),
      binaryFixture("both ~0%", 0.5, 0.02, 0.05),
      binaryFixture("extreme 5/95", 0.5, 0.05, 0.95),
      binaryFixture("tied ~50%", 0.5, 0.5, 0.5),
      binaryFixture("tiny n", 0.5, 0.5, 0.6, 8)
    ]
  },
  {
    title: "CategoryOutcomePlot — continuous outcome",
    fixtures: [
      continuousFixture("normal", 60, 70, 8),
      continuousFixture("narrow", 69, 71, 1.2),
      continuousFixture("wide overlap", 50, 90, 24)
    ]
  },
  {
    title: "RiskCurvePlot",
    fixtures: [
      riskFixture("decreasing", (x) => 0.95 - x / 45, 7),
      riskFixture("flat high", () => 0.95, 7),
      riskFixture("J-curve dip", (x) => 0.95 - 0.45 * Math.exp(-((x - 14) ** 2) / 40), 7),
      riskFixture("few bins (3)", (x) => 0.9 - x / 50, 3),
      riskFixture("many bins (12)", (x) => 0.9 - x / 50, 12)
    ]
  },
  {
    title: "ScatterChart — continuous × continuous",
    fixtures: [
      scatterFixture("strong positive", scatter2d(3, 6)),
      scatterFixture("flat / no trend", scatter2d(0, 12)),
      scatterFixture("negative", scatter2d(-2.6, 7)),
      scatterFixture("high noise", scatter2d(1.5, 30)),
      scatterFixture("tiny n", scatter2d(3, 6, { n: 6 })),
      scatterFixture("dose-response overlay", scatter2d(3, 8), doseCurvesFixture(3))
    ]
  },
  {
    title: "HuhShiftPlot — observed vs causal contrast",
    fixtures: [
      huhShiftFixture("sign agreement", -0.14, -0.1, 0.02),
      huhShiftFixture("sign flip", 0.12, -0.08, 0.025),
      huhShiftFixture("wide CIs", -0.1, -0.06, 0.11),
      huhShiftFixture("near zero", 0.004, -0.003, 0.015)
    ]
  },
  {
    title: "BasicComparisonLedgerPlot — same-contrast estimates",
    fixtures: [
      ledgerFixture("raw → adjusted → dgp", [["raw", 0.16, "raw"], ["adjusted", 0.05, "adjusted"], ["do()", 0.04, "dgp"]]),
      ledgerFixture("sign flip on adjust", [["raw", 0.11, "raw"], ["adjusted", -0.07, "selected"]]),
      ledgerFixture("near zero", [["raw", 0.006, "raw"], ["adjusted", -0.004, "adjusted"]])
    ]
  },
  {
    title: "Node distribution mini-plots",
    fixtures: [
      nodeMiniFixture("continuous normal", () => <NodeDistributionMiniPlot state={continuousNodeState("normal")} variable={CONTINUOUS_VARIABLE} />),
      nodeMiniFixture("continuous skewed", () => <NodeDistributionMiniPlot state={continuousNodeState("skewed")} variable={CONTINUOUS_VARIABLE} />),
      nodeMiniFixture("near-degenerate", () => <NodeDistributionMiniPlot state={continuousNodeState("degenerate")} variable={CONTINUOUS_VARIABLE} />),
      nodeMiniFixture("binary 10/90", () => <BinaryNodeDistributionMiniPlot state={binaryNodeState(0.9)} />)
    ]
  },
  {
    title: "OverlapHistogram — propensity by arm",
    fixtures: [
      { name: "good overlap", render: () => <OverlapHistogram overlap={overlapDiagnostic("good")} /> },
      { name: "positivity violation", render: () => <OverlapHistogram overlap={overlapDiagnostic("violation")} /> }
    ]
  },
  {
    title: "WhatIfStrategySurvivalCurve — survival by strategy",
    fixtures: [
      { name: "separated curves", render: () => <WhatIfStrategySurvivalCurve summary={whatIfSurvival("strong")} survivalTime={false} denominatorsOpen={false} /> },
      { name: "overlapping curves", render: () => <WhatIfStrategySurvivalCurve summary={whatIfSurvival("null")} survivalTime={false} denominatorsOpen={false} /> }
    ]
  }
];

export function Gallery() {
  let cell = 0;
  return (
    <NodeNamesProvider nodes={FAKE_NODES}>
      <div className="gallery-root">
        <header className="gallery-header">
          <h1>Chart gallery</h1>
          <p>Every chart × data boundary × container size. Each subplot has a two-letter code (top-left) — reference it directly, e.g. &ldquo;BD clips&rdquo;.</p>
        </header>
        <section className="g-section">
          <h2>PROTOTYPE — output redesign (three boxes)</h2>
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap", background: "#eef2f6", padding: 16, borderRadius: 8 }}>
            {[{ id: "panel 380", w: 380 }, { id: "wide 460", w: 460 }, { id: "mobile 340", w: 340 }].map((s) => (
              <div key={s.id}>
                <div className="g-col-head" style={{ marginBottom: 6 }}>{s.id}</div>
                <div style={{ width: s.w }}><OutputBoxesPrototype /></div>
              </div>
            ))}
          </div>
        </section>
        {SECTIONS.map((section) => (
          <section className="g-section" key={section.title}>
            <h2>{section.title}</h2>
            <div className="g-grid" style={{ gridTemplateColumns: `max-content repeat(${SIZES.length}, max-content)` }}>
              <div className="g-corner" />
              {SIZES.map((size) => <div className="g-col-head" key={size.id}>{size.id}</div>)}
              {section.fixtures.map((fixture) => (
                <div className="g-row" key={fixture.name} style={{ display: "contents" }}>
                  <div className="g-row-head">{fixture.name}</div>
                  {SIZES.map((size) => {
                    const code = codeFor(cell++);
                    return (
                      <div className="g-cell" key={size.id} data-fixture={fixture.name} data-size={size.id} data-code={code}>
                        <div className="g-cell-code">{code}</div>
                        <div className="g-chart" style={{ width: size.w, height: size.h }}>{fixture.render()}</div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </NodeNamesProvider>
  );
}
