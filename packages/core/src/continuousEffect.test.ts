import { describe, expect, it } from "vitest";
import { exampleDocument } from "./examples";
import { parseModel } from "./parser";
import { setExampleSampleSize, setLinearCoefficient, setNode, setVariable } from "./examples/builders";
import { runSimulation } from "./simulation";
import { analyzeContinuousEffect } from "./continuousEffect";

// continuous-dose-response: Severity confounds Dose→Recovery.
//   Severity→Dose +1.6, Severity→Recovery −3.6, Dose→Recovery +0.8 (the truth).
// The crude slope of Recovery on Dose works out to ≈ −1.0 (WRONG SIGN); every valid
// adjustment (g-comp / GPS-IPW / AIPW / oracle) must recover ≈ +0.8.
describe("analyzeContinuousEffect", () => {
  const document = exampleDocument("continuous-dose-response")!;
  const result = runSimulation(document.graph, document.simulation);
  const comparison = analyzeContinuousEffect(document.graph, document.simulation, result, { x: "Dose", y: "Recovery" });

  it("returns a comparison with all five methods and the confounder", () => {
    expect(comparison).not.toBeNull();
    expect(comparison!.covariates).toEqual(["Severity"]);
    expect(comparison!.methods.map((m) => m.id)).toEqual(["crude", "g-computation", "gps-ipw", "aipw", "oracle"]);
  });

  it("crude slope has the wrong sign (confounded)", () => {
    const crude = comparison!.methods.find((m) => m.id === "crude")!;
    expect(crude.slope).toBeLessThan(-0.5); // ≈ −1.0, confounding flips the sign
  });

  it("the outcome model (g-computation) recovers the true +0.8 slope (≈ oracle)", () => {
    const oracle = comparison!.methods.find((m) => m.id === "oracle")!;
    expect(oracle.slope).toBeCloseTo(0.8, 1);
    const gcomp = comparison!.methods.find((m) => m.id === "g-computation")!;
    expect(Math.abs(gcomp.slope - oracle.slope)).toBeLessThan(0.1);
  });

  it("AIPW is doubly robust: it recovers the truth even though the GPS weights are broken", () => {
    const oracle = comparison!.methods.find((m) => m.id === "oracle")!;
    const aipw = comparison!.methods.find((m) => m.id === "aipw")!;
    expect(Math.abs(aipw.slope - oracle.slope)).toBeLessThan(0.1);
  });

  it("GPS-IPW visibly degrades under the strained overlap (the positivity lesson)", () => {
    const oracle = comparison!.methods.find((m) => m.id === "oracle")!;
    const ipw = comparison!.methods.find((m) => m.id === "gps-ipw")!;
    // The stabilized density weights have (near-)infinite variance here, so IPW stays
    // badly confounded — far from the oracle, unlike g-comp/AIPW.
    expect(Math.abs(ipw.slope - oracle.slope)).toBeGreaterThan(0.3);
    expect(comparison!.overlap!.essFraction).toBeLessThan(0.1); // ≈ 3% — severe strain
    expect(comparison!.overlap!.maxWeight).toBeGreaterThan(50); // ≈ 247×
  });

  it("the standardized p10→p90 contrast is the slope times the dose swing", () => {
    const gcomp = comparison!.methods.find((m) => m.id === "g-computation")!;
    const [p10, p90] = comparison!.loHiDose;
    expect(gcomp.standardized).toBeCloseTo(gcomp.slope * (p90 - p10), 6);
  });
});

// A COUNT exposure (drawn Poisson) is ordered-numeric, so it rides the same dose-
// response estimator — proving the ordered-family generalization beyond continuous.
describe("analyzeContinuousEffect — count exposure", () => {
  const document = parseModel(`dag {
    Stress [adjusted]
    Coffee [exposure]
    Productivity [outcome]
    Stress -> Coffee
    Stress -> Productivity
    Coffee -> Productivity
  }`).document;
  setExampleSampleSize(document, 6000);
  setVariable(document, "Stress", { valueType: "continuous", unit: "z" });
  setVariable(document, "Coffee", { valueType: "count", unit: "cups" });
  setVariable(document, "Productivity", { valueType: "continuous", unit: "score" });
  setNode(document, "Stress", { distribution: { kind: "normal", mean: 0, sd: 1 }, noise: { kind: "constant", value: 0 } });
  setNode(document, "Coffee", { combiner: "poisson_log", intercept: Math.log(3), noise: { kind: "constant", value: 0 } });
  setNode(document, "Productivity", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 1 } });
  setLinearCoefficient(document, "Stress", "Coffee", 0.35);        // more stress → more coffee (log-mean)
  setLinearCoefficient(document, "Stress", "Productivity", -2.2);  // stress hurts productivity (confounding)
  setLinearCoefficient(document, "Coffee", "Productivity", 0.5);   // TRUE effect: coffee helps
  const result = runSimulation(document.graph, document.simulation);
  const comparison = analyzeContinuousEffect(document.graph, document.simulation, result, { x: "Coffee", y: "Productivity" });

  it("treats the count exposure as an ordered dose and returns all five methods", () => {
    expect(comparison).not.toBeNull();
    expect(comparison!.methods.map((m) => m.id)).toEqual(["crude", "g-computation", "gps-ipw", "aipw", "oracle"]);
  });

  it("g-computation recovers the true +0.5/cup effect the crude slope misses", () => {
    const oracle = comparison!.methods.find((m) => m.id === "oracle")!;
    const gcomp = comparison!.methods.find((m) => m.id === "g-computation")!;
    const crude = comparison!.methods.find((m) => m.id === "crude")!;
    expect(oracle.slope).toBeGreaterThan(0.2);                    // truth is positive
    expect(Math.abs(gcomp.slope - oracle.slope)).toBeLessThan(0.15);
    expect(Math.abs(crude.slope - oracle.slope)).toBeGreaterThan(Math.abs(gcomp.slope - oracle.slope)); // crude more biased
  });
});
