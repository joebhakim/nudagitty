import type { ReactNode } from "react";
import type { GraphNode } from "@nudagitty/core";
import {
  CategoryOutcomePlot,
  RiskCurvePlot,
  binaryOutcomeSummaries,
  continuousOutcomeSummaries,
  binnedBinaryRiskSummaries
} from "../charts/CategoryOutcomePlot";
import { NodeNamesProvider } from "../shared/NodeNames";
import { binaryPoints, continuousPoints, riskPoints } from "./fixtures";
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
