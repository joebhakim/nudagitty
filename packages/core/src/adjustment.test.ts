import { describe, expect, it } from "vitest";
import { analyzeAdjustment, deriveAdjustmentSpec } from "./longitudinal";
import { exampleDocument } from "./examples";

// Stage 1 of the adjustment-pipeline unification: the analysis spec is DERIVED from
// the graph's roles + longitudinal metadata, not hand-coded per example. These cases
// pin the derived spec to the (previously hard-coded) WHAT_IF_OUTPUT_CONFIGS so the
// same operation maps to the same analysis everywhere.
const CASES: Array<{ id: string; treatments: string[]; covariates: string[]; outcome: string; censoring: string[] }> = [
  { id: "what-if-treatment-feedback", treatments: ["A0", "A1"], covariates: ["Baseline_risk", "L1"], outcome: "Y", censoring: [] },
  { id: "what-if-ipw-pseudopopulation", treatments: ["Treatment_A"], covariates: ["Baseline_C"], outcome: "Outcome_Y", censoring: [] },
  { id: "what-if-nhefs-mortality-survival", treatments: ["Quit_smoking"], covariates: ["Age", "Baseline_risk"], outcome: "Death_10y", censoring: ["Censoring_5y"] },
  { id: "what-if-weight-gain-g-estimation", treatments: ["Quit_smoking"], covariates: ["Smoking_intensity", "Socioeconomic"], outcome: "Weight_gain_8y", censoring: [] },
  { id: "what-if-hiv-cd4-variants", treatments: ["A0", "A1", "A2"], covariates: ["CD4_0", "CD4_1", "CD4_2"], outcome: "AIDS_death", censoring: [] },
  { id: "what-if-censoring-ipcw", treatments: ["A0", "A1"], covariates: ["Baseline_risk", "L1"], outcome: "Y", censoring: ["C1", "C2"] },
  // SNAFT targets the survival-TIME contrast (the estimand outcome), not the binary
  // death indicator the old hard-coded config used.
  { id: "what-if-snaft-survival", treatments: ["Treatment_start"], covariates: ["Baseline_risk"], outcome: "Failure_time", censoring: ["Censoring"] },
  { id: "what-if-hazard-selection", treatments: ["Treatment_A"], covariates: ["Frailty", "Alive_1"], outcome: "Death_2", censoring: [] },
  { id: "what-if-dynamic-g-formula", treatments: ["A0", "A1", "A2"], covariates: ["Risk_0", "Risk_1", "Risk_2"], outcome: "Y", censoring: [] }
];

const sorted = (xs: string[]) => [...xs].sort();

describe("deriveAdjustmentSpec reproduces the hand-coded what-if configs", () => {
  for (const expected of CASES) {
    it(expected.id, () => {
      const document = exampleDocument(expected.id);
      if (!document) throw new Error(`missing ${expected.id}`);
      const spec = deriveAdjustmentSpec(document);
      if (!spec) throw new Error(`no spec for ${expected.id}`);
      expect(sorted(spec.treatments)).toEqual(sorted(expected.treatments));
      expect(sorted(spec.covariates)).toEqual(sorted(expected.covariates));
      expect(spec.outcome).toBe(expected.outcome);
      expect(sorted(spec.censoring)).toEqual(sorted(expected.censoring));
      // The unified engine yields the full 5-estimator panel with finite estimates.
      const comparison = analyzeAdjustment(document, spec);
      expect(comparison).not.toBeNull();
      const ids = comparison!.estimates.map((estimate) => estimate.id);
      expect(ids).toEqual(["naive", "stratified", "g_formula", "ipw", "g_estimation", "outcome_regression", "matching", "aipw"]);
    });
  }

  it("works on a classic single-exposure example (Simpson) when Severity is adjusted", () => {
    const document = exampleDocument("simpson-severity");
    if (!document) throw new Error("missing simpson");
    // Classic examples are interactive: nothing is adjusted by default, so the spec's
    // covariate set is empty until the user marks a node. Simulate "adjust for Severity".
    expect(deriveAdjustmentSpec(document)!.covariates).toEqual([]);
    const severity = document.graph.nodes.find((node) => node.id === "Severity")!;
    severity.roles = { ...severity.roles, adjusted: true };
    const spec = deriveAdjustmentSpec(document);
    if (!spec) throw new Error("no spec");
    expect(spec.treatments).toEqual(["Treatment"]);
    expect(spec.covariates).toEqual(["Severity"]);
    expect(spec.outcome).toBe("Recovery");
    const comparison = analyzeAdjustment(document, spec)!;
    const naive = comparison.estimates.find((e) => e.id === "naive")!.estimate!;
    const gFormula = comparison.estimates.find((e) => e.id === "g_formula")!.estimate!;
    // Simpson: crude looks harmful, the do() effect (and adjusted estimators) are not.
    expect(naive).toBeLessThan(0);
    expect(gFormula).toBeGreaterThan(naive);
  });
});
