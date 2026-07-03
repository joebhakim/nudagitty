import { describe, expect, it } from "vitest";
import { exampleDocument } from "./examples";
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
