import { describe, expect, it } from "vitest";
import { runSimulation } from "./simulation";
import { parseModel } from "./parser";
import { defaultEdgeMechanism, normalizeNodeMechanism, normalizeVariableModel } from "./graph";

// R2: the `count` response family draws Poisson(λ = link(η)) instead of returning the
// continuous mean. No existing example uses count, so the golden net is unaffected;
// these are the behavioral tests for the new capability.
describe("response families — count (Poisson)", () => {
  function countChildDoc(intercept: number, coefficient: number) {
    const doc = parseModel(`dag {
      X
      Y
      X -> Y
    }`).document;
    const y = doc.graph.nodes.find((node) => node.id === "Y")!;
    y.variable = normalizeVariableModel({ ...y.variable, valueType: "count" });
    doc.simulation.nodes.X = normalizeNodeMechanism({ distribution: { kind: "constant", value: 1 }, noise: { kind: "constant", value: 0 } });
    // log link: λ = exp(intercept + coefficient·X), noise 0 so λ is deterministic per draw.
    doc.simulation.nodes.Y = normalizeNodeMechanism({ combiner: "poisson_log", intercept, noise: { kind: "constant", value: 0 } });
    doc.simulation.edges[doc.graph.edges[0]!.id] = { ...defaultEdgeMechanism(), coefficient };
    return doc;
  }

  it("draws non-negative integers with mean ≈ λ", () => {
    const doc = countChildDoc(Math.log(4), 0); // λ = exp(ln 4) = 4
    const ys = runSimulation(doc.graph, doc.simulation).nodeStates.Y!.empirical.samples;
    expect(ys.length).toBeGreaterThan(50);
    expect(ys.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    expect(mean).toBeGreaterThan(3);
    expect(mean).toBeLessThan(5);
  });

  it("λ scales with the linear predictor (parent effect on the log-mean)", () => {
    const doc = countChildDoc(0, Math.log(3)); // λ = exp(0 + ln3·1) = 3
    const ys = runSimulation(doc.graph, doc.simulation).nodeStates.Y!.empirical.samples;
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    expect(mean).toBeGreaterThan(2.2);
    expect(mean).toBeLessThan(3.8);
  });
});

describe("response families — ordinal (ordered logit)", () => {
  function ordinalChildDoc(intercept: number) {
    const doc = parseModel(`dag {
      X
      Y
      X -> Y
    }`).document;
    const y = doc.graph.nodes.find((node) => node.id === "Y")!;
    y.variable = normalizeVariableModel({ ...y.variable, valueType: "ordinal", categories: ["a", "b", "c"] }); // K = 3
    doc.simulation.nodes.X = normalizeNodeMechanism({ distribution: { kind: "constant", value: 0 }, noise: { kind: "constant", value: 0 } });
    doc.simulation.nodes.Y = normalizeNodeMechanism({ combiner: "additive", intercept, noise: { kind: "constant", value: 0 } });
    doc.simulation.edges[doc.graph.edges[0]!.id] = { ...defaultEdgeMechanism(), coefficient: 0 };
    return doc;
  }

  it("draws integer levels 0..K-1, and higher η shifts toward higher levels", () => {
    const lowDoc = ordinalChildDoc(-2.5);
    const highDoc = ordinalChildDoc(2.5);
    const low = runSimulation(lowDoc.graph, lowDoc.simulation).nodeStates.Y!.empirical.samples;
    const high = runSimulation(highDoc.graph, highDoc.simulation).nodeStates.Y!.empirical.samples;
    expect(low.every((v) => v === 0 || v === 1 || v === 2)).toBe(true);
    expect(high.every((v) => v === 0 || v === 1 || v === 2)).toBe(true);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(high)).toBeGreaterThan(mean(low));
    expect(mean(low)).toBeLessThan(0.7);
    expect(mean(high)).toBeGreaterThan(1.3);
  });
});
