import { describe, expect, it } from "vitest";
import { parseModel } from "./parser";
import { setExampleSampleSize, setNode, setVariable } from "./examples/builders";
import { runSimulation } from "./simulation";
import { simpleEdge, type CopulaBlock } from "./copulaVine";

function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  let mx = 0, my = 0; for (let i = 0; i < n; i += 1) { mx += xs[i]!; my += ys[i]!; } mx /= n; my /= n;
  let c = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i += 1) { c += (xs[i]! - mx) * (ys[i]! - my); vx += (xs[i]! - mx) ** 2; vy += (ys[i]! - my) ** 2; }
  return c / Math.sqrt(vx * vy);
}

describe("copula block — engine integration", () => {
  function makeDoc() {
    const doc = parseModel(`dag {
      A [exposure]
      B
      C
      D [outcome]
      A -> D
      B -> D
      C -> D
    }`).document;
    setExampleSampleSize(doc, 3000);
    for (const id of ["A", "B", "C"]) {
      setVariable(doc, id, { valueType: "continuous", unit: "z" });
      setNode(doc, id, { distribution: { kind: "normal", mean: 0, sd: 1 }, noise: { kind: "constant", value: 0 } });
    }
    setVariable(doc, "D", { valueType: "continuous", unit: "y" });
    setNode(doc, "D", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 1 } });
    return doc;
  }

  it("without a block the root covariates are independent", () => {
    const doc = makeDoc();
    const r = runSimulation(doc.graph, doc.simulation);
    expect(Math.abs(pearson(r.nodeStates.A!.empirical.samples, r.nodeStates.B!.empirical.samples))).toBeLessThan(0.06);
  });

  it("a Gaussian D-vine block couples the covariates while preserving their marginals", () => {
    const doc = makeDoc();
    const block: CopulaBlock = {
      id: "cov", nodes: ["A", "B", "C"], order: [0, 1, 2], depth: 1,
      edges: [[simpleEdge("gaussian", 0.6), simpleEdge("gaussian", 0.6)], [simpleEdge("independence", 0)]]
    };
    doc.simulation.copulaBlocks = [block];
    const r = runSimulation(doc.graph, doc.simulation);
    const A = r.nodeStates.A!.empirical, B = r.nodeStates.B!.empirical, C = r.nodeStates.C!.empirical;
    // τ=0.6 gaussian ⇒ Pearson ρ = sin(π·0.6/2) ≈ 0.81 on adjacent T1 pairs.
    expect(pearson(A.samples, B.samples)).toBeGreaterThan(0.7);
    expect(pearson(B.samples, C.samples)).toBeGreaterThan(0.7);
    // A–C only leak through B (T2 independence) ⇒ weaker than the direct pairs.
    expect(pearson(A.samples, C.samples)).toBeLessThan(pearson(A.samples, B.samples));
    // Marginals preserved (standard normal).
    expect(A.mean!).toBeCloseTo(0, 1);
    expect(Math.sqrt(A.variance!)).toBeCloseTo(1, 1);
  });
});
