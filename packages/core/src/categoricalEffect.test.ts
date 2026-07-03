import { describe, expect, it } from "vitest";
import { parseModel } from "./parser";
import { setExampleSampleSize, setLinearCoefficient, setNode, setVariable } from "./examples/builders";
import { runSimulation } from "./simulation";
import { analyzeCategoricalEffect } from "./categoricalEffect";

// A categorical (unordered) exposure confounded by severity:
//   Severity → Regimen (sicker patients get the higher-index regimen),
//   Severity → Outcome (−3, the confounding), Regimen → Outcome (+2 per level, the truth).
// Crude per-level means are dragged down by severity; g-computation and the oracle
// recover the true monotone +2-per-level lift.
function buildDocument() {
  const document = parseModel(`dag {
    Severity [adjusted]
    Regimen [exposure]
    Outcome [outcome]
    Severity -> Regimen
    Severity -> Outcome
    Regimen -> Outcome
  }`).document;
  setExampleSampleSize(document, 6000);
  setVariable(document, "Severity", { valueType: "continuous", unit: "z" });
  setVariable(document, "Regimen", { valueType: "categorical", categories: ["A", "B", "C"], unit: "" });
  setVariable(document, "Outcome", { valueType: "continuous", unit: "score" });
  setNode(document, "Severity", { distribution: { kind: "normal", mean: 0, sd: 1 }, noise: { kind: "constant", value: 0 } });
  setNode(document, "Outcome", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 1 } });
  setLinearCoefficient(document, "Severity", "Regimen", 1.2);
  setLinearCoefficient(document, "Severity", "Outcome", -3);
  setLinearCoefficient(document, "Regimen", "Outcome", 2);
  return document;
}

describe("analyzeCategoricalEffect", () => {
  const document = buildDocument();
  const result = runSimulation(document.graph, document.simulation);
  const comparison = analyzeCategoricalEffect(document.graph, document.simulation, result, { x: "Regimen", y: "Outcome" });

  it("returns a per-level comparison with the three levels + confounder", () => {
    expect(comparison).not.toBeNull();
    expect(comparison!.covariates).toEqual(["Severity"]);
    expect(comparison!.levels.map((level) => level.label)).toEqual(["A", "B", "C"]);
  });

  it("g-computation recovers the true +2-per-level lift that the crude means miss", () => {
    const levels = comparison!.levels;
    // Oracle is the truth: each level is ~+2 above the previous.
    expect(levels[1]!.oracle - levels[0]!.oracle).toBeCloseTo(2, 0);
    expect(levels[2]!.oracle - levels[0]!.oracle).toBeCloseTo(4, 0);
    // g-computation matches the oracle contrasts (within simulation noise).
    expect(Math.abs((levels[2]!.adjusted - levels[0]!.adjusted) - (levels[2]!.oracle - levels[0]!.oracle))).toBeLessThan(0.4);
    // Crude is confounded: the level-2 − level-0 gap is pulled well below the true +4.
    expect(levels[2]!.crude - levels[0]!.crude).toBeLessThan(3);
  });
});
