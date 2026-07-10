import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import { LALONDE_OBS_DATASET } from "./data/lalonde-obs";
import {
  parseCsvToDataFrame, documentFromDataFrame, runSimulation, dataFrameFromSimulation,
  setNodeRole, addEdge, withGraph, registerRuntimeDataset, setExampleSampleSize,
  pinNodeEquation, authorNumber, pinKeys, reconcilePins, setLinearCoefficient, normalizeEdgeMechanism
} from "./index";

// The "data-driven experimental setup" reproducibility guarantee: building the LaLonde "recover the RCT"
// plasmode FROM SCRATCH via the real import path (CSV → nodes) + marking roles + wiring the confounder DAG
// must reproduce the saved `lalonde-recover-rct` example's simulation EXACTLY, once the seed and sample size
// are aligned. Both are pure replays over the same rows, so the drawn sequence — and therefore every column,
// row-for-row — is identical. This locks the from-scratch workflow against the curated example.

const COVS = ["age", "education", "black", "hispanic", "married", "nodegree", "re74", "re75"];
// scratch label (= CSV column) → recover-rct node label (dataFrameFromSimulation names columns by LABEL)
const LABEL = { age: "age", education: "education", black: "black", hispanic: "hispanic", married: "married", nodegree: "no degree", re74: "earnings '74", re75: "earnings '75", treat: "in program", re78: "earnings '78" } as const;

function column(df: ReturnType<typeof dataFrameFromSimulation>, name: string): number[] {
  return df.columns.find((c) => c.name === name)?.values ?? [];
}

describe("recover-the-RCT: from-scratch import reproduces the saved example", () => {
  it("infers the right column types on import", () => {
    const csv = [LALONDE_OBS_DATASET.columns.join(","), ...LALONDE_OBS_DATASET.rows.map((r) => r.join(","))].join("\n");
    const df = parseCsvToDataFrame(csv);
    const typeOf = (n: string) => df.columns.find((c) => c.name === n)?.type;
    for (const b of ["treat", "black", "hispanic", "married", "nodegree"]) expect(typeOf(b)).toBe("binary");
    for (const c of ["age", "education", "re74", "re75", "re78"]) expect(typeOf(c)).toBe("continuous");
  });

  it("simulation output is IDENTICAL to lalonde-recover-rct (aligned seed + sample size)", () => {
    registerRuntimeDataset("lalonde-obs", LALONDE_OBS_DATASET);
    const ref = exampleDocument("lalonde-recover-rct")!;
    const refDf = dataFrameFromSimulation(ref.graph, runSimulation(ref.graph, ref.simulation));

    // Build the same thing from scratch: import the CSV, mark roles, draw the confounder → treat/outcome DAG.
    const csv = [LALONDE_OBS_DATASET.columns.join(","), ...LALONDE_OBS_DATASET.rows.map((r) => r.join(","))].join("\n");
    let scratch = documentFromDataFrame(parseCsvToDataFrame(csv), { title: "scratch", datasetName: "lalonde-obs" });
    let g = scratch.graph;
    g = setNodeRole(g, "treat", "exposure", true);
    g = setNodeRole(g, "re78", "outcome", true);
    for (const c of COVS) g = setNodeRole(g, c, "adjusted", true);
    for (const c of ["age", "education", "nodegree", "re74", "re75"]) g = addEdge(g, c, "treat", "directed");
    for (const c of ["age", "education", "nodegree", "re74", "re75", "married"]) g = addEdge(g, c, "re78", "directed");
    g = addEdge(g, "treat", "re78", "directed");
    scratch = withGraph(scratch, g);
    // Align the two knobs the curated example sets that a fresh import does not inherit.
    setExampleSampleSize(scratch, 4000);
    scratch.simulation = { ...scratch.simulation, seed: ref.simulation.seed };

    const scDf = dataFrameFromSimulation(scratch.graph, runSimulation(scratch.graph, scratch.simulation));

    // Every column matches the saved example row-for-row.
    for (const [scratchName, refLabel] of Object.entries(LABEL)) {
      const s = column(scDf, scratchName);
      const r = column(refDf, refLabel);
      expect(s.length).toBe(4000);
      expect(r.length).toBe(4000);
      expect(s).toEqual(r);
    }
  });
});

// The FITTED-DGP target (lalonde-fit-recover): building it from scratch — import, mark, wire, impose the
// +$1,794 effect (author treat→re78), FIT treat's logistic + re78's confounders — must reproduce the saved
// example's FITTED COEFFICIENTS (deterministic OLS/logistic on the same rows) and its do()-oracle (=+1794).
function coefOf(doc: ReturnType<typeof exampleDocument>, source: string, target: string): number {
  const e = doc!.graph.edges.find((x) => x.source === source && x.target === target);
  const m = e ? normalizeEdgeMechanism(doc!.simulation.edges[e.id]) : null;
  return m && m.kind === "linear" ? m.coefficient : NaN;
}
function ate(doc: ReturnType<typeof exampleDocument>, treatId: string, outId: string): number {
  const do1 = runSimulation(doc!.graph, { ...doc!.simulation, overrides: { [treatId]: 1 } });
  const do0 = runSimulation(doc!.graph, { ...doc!.simulation, overrides: { [treatId]: 0 } });
  return (do1.nodeStates[outId]?.empirical?.mean ?? NaN) - (do0.nodeStates[outId]?.empirical?.mean ?? NaN);
}

describe("fitted DGP (lalonde-fit-recover): from-scratch build reproduces the saved example", () => {
  it("imposed effect recovered by do(); fitted coefficients match", () => {
    registerRuntimeDataset("lalonde-obs", LALONDE_OBS_DATASET);
    const ref = exampleDocument("lalonde-fit-recover")!;
    expect(ate(ref, "In_program", "Earnings_78")).toBeCloseTo(1794, 0); // the imposed truth

    // From scratch: import, roles, the same causal DAG, impose +1794, fit treat + re78's confounders.
    const csv = [LALONDE_OBS_DATASET.columns.join(","), ...LALONDE_OBS_DATASET.rows.map((r) => r.join(","))].join("\n");
    let scratch = documentFromDataFrame(parseCsvToDataFrame(csv), { title: "scratch", datasetName: "lalonde-obs" });
    let g = scratch.graph;
    g = setNodeRole(g, "treat", "exposure", true);
    g = setNodeRole(g, "re78", "outcome", true);
    for (const c of COVS) g = setNodeRole(g, c, "adjusted", true);
    for (const c of ["age", "education", "nodegree", "re74", "re75"]) g = addEdge(g, c, "treat", "directed");
    for (const c of ["age", "education", "nodegree", "re74", "re75", "married"]) g = addEdge(g, c, "re78", "directed");
    g = addEdge(g, "treat", "re78", "directed");
    scratch = withGraph(scratch, g);
    setLinearCoefficient(scratch, "treat", "re78", 1794);
    scratch = pinNodeEquation(scratch, "treat");
    scratch = pinNodeEquation(scratch, "re78");
    const effect = scratch.graph.edges.find((e) => e.source === "treat" && e.target === "re78")!;
    scratch = authorNumber(scratch, pinKeys.edge(effect.id));
    setExampleSampleSize(scratch, 4000);
    scratch.simulation = { ...scratch.simulation, seed: ref.simulation.seed };
    scratch = reconcilePins(scratch).document;

    // do()-oracle recovers the imposed effect, exactly like the saved example.
    expect(ate(scratch, "treat", "re78")).toBeCloseTo(1794, 0);
    // Fitted coefficients match the curated example (deterministic fit on the same rows).
    const pairs: Array<[[string, string], [string, string]]> = [
      [["age", "re78"], ["Age", "Earnings_78"]],
      [["re74", "re78"], ["Earnings_74", "Earnings_78"]],
      [["education", "treat"], ["Education", "In_program"]],
      [["re75", "treat"], ["Earnings_75", "In_program"]]
    ];
    for (const [[ss, st], [rs, rt]] of pairs) {
      expect(coefOf(scratch, ss, st)).toBeCloseTo(coefOf(ref, rs, rt), 4);
    }
    expect(coefOf(scratch, "treat", "re78")).toBe(1794); // imposed, not fit
  });
});
