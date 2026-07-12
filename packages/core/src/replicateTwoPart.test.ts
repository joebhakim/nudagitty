import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import { LALONDE_OBS_DATASET } from "./data/lalonde-obs";
import {
  parseCsvToDataFrame, documentFromDataFrame, runSimulation, setNodeRole, addEdge, withGraph,
  registerRuntimeDataset, setExampleSampleSize, setVariable, pinNodeEquation, reconcilePins,
  imposeEffect, imposedEffectContext, imposableEffect, normalizeEdgeMechanism, normalizeNodeMechanism, setEdgeMechanism
} from "./index";
import type { GraphDocument } from "./types";

/**
 * THE GOAL, STATED AS A TEST: can a user land on the app with the LaLonde CSV and nothing else, and end up
 * with the two-part positive control — a DGP whose confounding is real, whose outcome has an honest zero
 * spike, and whose causal effect is a known +$1,794 that estimators can be graded against?
 *
 * Every step below is an operation the UI exposes, and nothing else:
 *   documentFromDataFrame   ← "Import data (CSV → nodes)"
 *   setNodeRole             ← the role toggles (exposure / outcome / adjusted)
 *   addEdge                 ← the Connect tool
 *   setVariable(valueType)  ← the response-family picker
 *   pinNodeEquation         ← the read / fit / author control ("learn this from data")
 *   imposeEffect            ← the "Impose a causal effect" card
 *   reconcilePins           ← what commitState runs on every edit
 *
 * If this passes, the workflow the user could not complete from a spreadsheet is complete.
 */
const COVS = ["age", "education", "black", "hispanic", "married", "nodegree", "re74", "re75"];
const CSV = [LALONDE_OBS_DATASET.columns.join(","), ...LALONDE_OBS_DATASET.rows.map((r) => r.join(","))].join("\n");

/** Steps 1–4: import, mark the roles, draw the DAG, declare the family. No fitting, no effect yet. */
function importAndWire(): GraphDocument {
  registerRuntimeDataset("lalonde-obs", LALONDE_OBS_DATASET);
  let doc = documentFromDataFrame(parseCsvToDataFrame(CSV), { title: "scratch", datasetName: "lalonde-obs" });
  let g = doc.graph;
  g = setNodeRole(g, "treat", "exposure", true);
  g = setNodeRole(g, "re78", "outcome", true);
  for (const c of COVS) g = setNodeRole(g, c, "adjusted", true);
  for (const c of ["age", "education", "nodegree", "re74", "re75"]) g = addEdge(g, c, "treat", "directed");
  for (const c of ["age", "education", "nodegree", "re74", "re75", "married"]) g = addEdge(g, c, "re78", "directed");
  g = addEdge(g, "treat", "re78", "directed");
  doc = withGraph(doc, g);
  setVariable(doc, "re78", { valueType: "semicontinuous" });   // earnings are zero-or-positive, not Gaussian
  // …and earnings HISTORY enters as a LOG, not as dollars — the Mincer specification. This is a real step a
  // user takes (the edge's function picker), and it is not optional: feeding dollar-valued history into a
  // log-link intensive margin makes E[Y|L] exponential in dollars and manufactures $2.9M earners.
  for (const src of ["re74", "re75"]) setEdgeMechanism(doc, src, "re78", "log_linear", { offset: 1, baseline: 0, coefficient: 0 });
  return doc;
}

const ate = (doc: GraphDocument, seed = 11) => {
  const at = (v: number) =>
    runSimulation(doc.graph, { ...doc.simulation, seed, overrides: { treat: v } }).nodeStates["re78"]!.empirical.mean ?? NaN;
  return at(1) - at(0);
};
const coefOf = (doc: GraphDocument, s: string, t: string) => {
  const e = doc.graph.edges.find((x) => x.source === s && x.target === t)!;
  const m = normalizeEdgeMechanism(doc.simulation.edges[e.id]);
  // A fitted coefficient now lives on whatever FORM the user authored — linear, log_linear, power_law.
  return m.kind === "linear" || m.kind === "log_linear" || m.kind === "power_law" ? m.coefficient : NaN;
};

describe("THE GOAL: build the two-part LaLonde benchmark from a raw CSV", () => {
  it("import → roles → DAG → family → fit → impose  ⇒  the DGP carries exactly +$1,794", () => {
    let doc = importAndWire();

    // Step 5: learn the confounding from the data. Treatment assignment AND the covariate→earnings surface.
    doc = pinNodeEquation(doc, "treat");
    doc = pinNodeEquation(doc, "re78");

    // Step 6: the effect edge is now a candidate — this is the affordance that did not exist before.
    expect(imposableEffect(doc, doc.graph.edges.find((e) => e.source === "treat" && e.target === "re78")!.id))
      .toEqual({ exposure: "treat", outcome: "re78", family: "two_part" });
    doc = imposeEffect(doc, { exposure: "treat", outcome: "re78", target: 1794 });

    setExampleSampleSize(doc, 4000);
    doc = reconcilePins(doc).document;

    // The DGP carries the imposed truth — by algebra exactly, and by the engine within Monte-Carlo noise.
    // (Each simulation is 4,000 rows, so every one below is computed ONCE and reused — a naive re-call per
    // assertion pushed this past vitest's 5s budget under full-suite load.)
    const ctx = imposedEffectContext(doc)!;
    const gamma = normalizeNodeMechanism(doc.simulation.nodes["re78"]).gate!.coefficients["treat"]!;
    expect(ctx.decompose(gamma, coefOf(doc, "treat", "re78")).ate).toBeCloseTo(1794, 4);

    const oracle = ate(doc);
    expect(oracle).toBeGreaterThan(1794 - 300);
    expect(oracle).toBeLessThan(1794 + 300);

    // …and the outcome is HONEST: a real zero spike, and not one impossible negative.
    const base = runSimulation(doc.graph, doc.simulation);
    const y = base.nodeStates["re78"]!.empirical.samples ?? [];
    expect(Math.min(...y)).toBe(0);
    expect(y.filter((v) => v === 0).length / y.length).toBeGreaterThan(0.05);

    // The confounding is REAL: the crude treated-vs-untreated gap points the WRONG WAY by thousands of
    // dollars against the truth we just imposed. That gap is the entire reason the benchmark exists.
    const t = base.nodeStates["treat"]!.empirical.samples ?? [];
    const mean = (want: number) => {
      const v = y.filter((_, i) => t[i] === want);
      return v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
    };
    expect(mean(1) - mean(0)).toBeLessThan(-5000);   // naive: "training DESTROYS earnings"
    expect(oracle).toBeGreaterThan(0);               // truth:  +$1,794
  });

  it("the from-scratch build reproduces the SHIPPED example, coefficient for coefficient", () => {
    const ref = exampleDocument("lalonde-fit-recover-2part")!;
    let doc = importAndWire();
    doc = pinNodeEquation(doc, "treat");
    doc = pinNodeEquation(doc, "re78");
    // Pass the example's split explicitly — the only authored number besides the target.
    doc = imposeEffect(doc, { exposure: "treat", outcome: "re78", target: 1794, extensiveShare: 0.62 });
    setExampleSampleSize(doc, 4000);
    doc = reconcilePins(doc).document;

    // Both margins of the effect, and the confounder fits, land on the shipped example's numbers.
    expect(coefOf(doc, "treat", "re78")).toBeCloseTo(coefOf(ref, "In_program", "Earnings_78"), 6);
    expect(normalizeNodeMechanism(doc.simulation.nodes["re78"]).gate!.coefficients["treat"])
      .toBeCloseTo(normalizeNodeMechanism(ref.simulation.nodes["Earnings_78"]).gate!.coefficients["In_program"]!, 6);
    for (const [s, t, rs, rt] of [
      ["age", "re78", "Age", "Earnings_78"],
      ["re74", "re78", "Earnings_74", "Earnings_78"],
      ["education", "treat", "Education", "In_program"],
      ["re75", "treat", "Earnings_75", "In_program"]
    ] as const) {
      expect(coefOf(doc, s, t)).toBeCloseTo(coefOf(ref, rs, rt), 6);
    }
  });

  it("skip the family step and the guardrail is the only thing standing between you and nonsense", () => {
    // The same build, but leaving earnings `continuous` (the import default). It still "works" — and it
    // generates a population where people earn negative money. This is why the family step is not optional.
    let doc = documentFromDataFrame(parseCsvToDataFrame(CSV), { title: "scratch", datasetName: "lalonde-obs" });
    let g = doc.graph;
    g = setNodeRole(g, "treat", "exposure", true);
    g = setNodeRole(g, "re78", "outcome", true);
    for (const c of ["age", "education", "nodegree", "re74", "re75", "married"]) g = addEdge(g, c, "re78", "directed");
    g = addEdge(g, "treat", "re78", "directed");
    doc = withGraph(doc, g);
    doc = reconcilePins(pinNodeEquation(doc, "re78")).document;
    doc = reconcilePins(imposeEffect(doc, { exposure: "treat", outcome: "re78", target: 1794 })).document;

    const draws = runSimulation(doc.graph, doc.simulation).nodeStates["re78"]!.empirical.samples ?? [];
    expect(Math.min(...draws)).toBeLessThan(0);                          // negative earnings, silently
    expect(draws.filter((v) => v < 0).length / draws.length).toBeGreaterThan(0.02);
  });
});
