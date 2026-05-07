import { describe, expect, it } from "vitest";
import { analyzeGraph } from "./analysis";
import { parseModel } from "./parser";

describe("causal analysis", () => {
  it("recognizes sufficient adjustment in a confounding triangle", () => {
    const doc = parseModel(`dag {
      X [exposure]
      Y [outcome]
      Z [adjusted]
      Z -> X
      Z -> Y
      X -> Y
    }`).document;
    const report = analyzeGraph(doc.graph);
    expect(report.totalEffect.valid).toBe(true);
    expect(report.openBiasingPathCount).toBe(0);
  });

  it("flags unadjusted confounding", () => {
    const doc = parseModel(`dag {
      X [exposure]
      Y [outcome]
      Z
      Z -> X
      Z -> Y
      X -> Y
    }`).document;
    const report = analyzeGraph(doc.graph);
    expect(report.totalEffect.valid).toBe(false);
    expect(report.totalEffect.minimalSets).toContainEqual(["Z"]);
  });

  it("detects directed cycles", () => {
    const doc = parseModel(`dag {
      A -> B
      B -> C
      C -> A
    }`).document;
    expect(analyzeGraph(doc.graph).cycle).toEqual(["A", "B", "C", "A"]);
  });
});
