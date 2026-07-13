import { describe, it, expect } from "vitest";
import { LALONDE_OBS_DATASET } from "./data/lalonde-obs";
import {
  parseCsvToDataFrame, documentFromDataFrame, registerRuntimeDataset, runSimulation, withGraph, addEdge,
  setNodeRole, setNodeDataMode, setLinearCoefficient, replayState, nodeReplaysData, edgeIsInert,
  deriveAdjustmentSpec, analyzeAdjustment
} from "./index";
import type { GraphDocument } from "./types";

/**
 * THE STATE RIGHT AFTER AN IMPORT: nothing is generated, and the app used to print a causal effect anyway.
 *
 * Every imported node is fed by a table_lookup edge, so the simulator replaces its whole equation with the
 * data cell — and discards every OTHER incoming edge. The DAG you draw does not generate; it only adjusts.
 * The arrows still rendered `linear coef +1.00`, and the re-simulated oracle still rendered a number.
 *
 * That number was $0.00. Exactly. Because you cannot intervene on a column read from a file.
 */
const CSV = [LALONDE_OBS_DATASET.columns.join(","), ...LALONDE_OBS_DATASET.rows.map((r) => r.join(","))].join("\n");
const COVS = ["age", "education", "black", "hispanic", "married", "nodegree", "re74", "re75"];

function imported(): GraphDocument {
  registerRuntimeDataset("lalonde-obs", LALONDE_OBS_DATASET);
  let doc = documentFromDataFrame(parseCsvToDataFrame(CSV), { title: "scratch", datasetName: "lalonde-obs" });
  let g = doc.graph;
  g = setNodeRole(g, "treat", "exposure", true);
  g = setNodeRole(g, "re78", "outcome", true);
  for (const c of COVS) {
    g = setNodeRole(g, c, "adjusted", true);
    g = addEdge(g, c, "treat", "directed");
    g = addEdge(g, c, "re78", "directed");
  }
  g = addEdge(g, "treat", "re78", "directed");
  return withGraph(doc, g);
}

const ate = (doc: GraphDocument, seed = 11) => {
  const at = (v: number) =>
    runSimulation(doc.graph, { ...doc.simulation, seed, overrides: { treat: v } }).nodeStates["re78"]!.empirical.mean ?? NaN;
  return at(1) - at(0);
};

describe("replay: the DAG is drawn but nothing is generated", () => {
  it("every drawn arrow is INERT — setting one to 999 does not move the simulation", () => {
    const doc = imported();
    const before = ate(doc);

    const wild: GraphDocument = JSON.parse(JSON.stringify(doc));
    for (const c of [...COVS, "treat"]) setLinearCoefficient(wild, c, "re78", 999);
    expect(ate(wild)).toBe(before);          // …not "close to". IDENTICAL. The edges do nothing.

    const state = replayState(doc);
    expect(state.replayNodes).toContain("re78");
    expect(state.inertEdges.length).toBe(17);   // 8 → treat, 8 → re78, plus treat → re78
    expect(state.any).toBe(true);
    expect(nodeReplaysData(doc, "re78")).toBe(true);

    const effectEdge = doc.graph.edges.find((e) => e.source === "treat" && e.target === "re78")!;
    expect(edgeIsInert(doc, effectEdge.id)).toBe(true);
  });

  it("…and do() is EXACTLY zero, which is why the oracle must refuse rather than report it", () => {
    const doc = imported();
    expect(ate(doc)).toBe(0);                // not ≈0. Exactly 0. You cannot intervene on a file.

    const spec = deriveAdjustmentSpec(doc)!;
    const oracle = analyzeAdjustment(doc, spec)!.estimates.find((e) => e.id === "g_formula")!;
    expect(oracle.estimate).toBeNull();      // ← REFUSES. It used to print 0.00 beside the real estimators.
    expect(oracle.diagnostics[0]).toContain("REPLAYING");
    expect(oracle.diagnostics[0]).toContain("exactly 0 by construction");
  }, 60000);

  it("fitting the outcome wakes the edges up and the oracle answers again", () => {
    const doc = setNodeDataMode(imported(), "re78", "fit");
    expect(nodeReplaysData(doc, "re78")).toBe(false);
    expect(replayState(doc).outcomeReplays).toBe(false);
    expect(ate(doc)).not.toBe(0);

    const spec = deriveAdjustmentSpec(doc)!;
    const oracle = analyzeAdjustment(doc, spec)!.estimates.find((e) => e.id === "g_formula")!;
    expect(oracle.estimate).not.toBeNull();
    expect(oracle.estimate!).toBeGreaterThan(0);   // ≈ +$752
  }, 60000);

  it("a node that is FITTED has live edges; the predicate matches the simulator's, node by node", () => {
    // The exposure still replays, so ITS incoming arrows stay inert — the state is per-node, not global.
    const doc = setNodeDataMode(imported(), "re78", "fit");
    const state = replayState(doc);
    expect(state.replayNodes).toContain("treat");
    expect(state.replayNodes).not.toContain("re78");
    const intoOutcome = doc.graph.edges.find((e) => e.source === "age" && e.target === "re78")!;
    const intoTreat = doc.graph.edges.find((e) => e.source === "age" && e.target === "treat")!;
    expect(edgeIsInert(doc, intoOutcome.id)).toBe(false);   // woken up
    expect(edgeIsInert(doc, intoTreat.id)).toBe(true);      // still dead
  });
});
