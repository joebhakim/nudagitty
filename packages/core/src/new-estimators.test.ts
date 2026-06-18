import { describe, expect, it } from "vitest";
import { analyzeAdjustment, deriveAdjustmentSpec } from "./longitudinal";
import { exampleDocument } from "./examples";

// The three choosable estimators added alongside the nonparametric g-methods.
function run(id: string, markAdjusted?: string) {
  const document = exampleDocument(id);
  if (!document) throw new Error(`missing ${id}`);
  if (markAdjusted) {
    const node = document.graph.nodes.find((n) => n.id === markAdjusted)!;
    node.roles = { ...node.roles, adjusted: true };
  }
  const spec = deriveAdjustmentSpec(document)!;
  const comparison = analyzeAdjustment(document, spec)!;
  const get = (k: string) => comparison.estimates.find((e) => e.id === k)?.estimate ?? null;
  return { get, ids: comparison.estimates.map((e) => e.id) };
}

describe("matching / outcome-regression / AIPW estimators", () => {
  it("all three appear in the panel", () => {
    const { ids } = run("simpson-severity", "Severity");
    expect(ids).toContain("outcome_regression");
    expect(ids).toContain("matching");
    expect(ids).toContain("aipw");
  });

  it("Simpson: all three flip the crude sign (adjusting reveals treatment helps)", () => {
    const { get } = run("simpson-severity", "Severity");
    expect(get("naive")!).toBeLessThan(0); // crude looks harmful
    for (const method of ["outcome_regression", "matching", "aipw"] as const) {
      expect(get(method)!, method).toBeGreaterThan(0); // adjusted: helpful, like the do() truth
    }
  });

  it("NHEFS: nonparametric estimators track the oracle more tightly than the parametric outcome model", () => {
    const { get } = run("what-if-nhefs-mortality-survival");
    const truth = get("g_formula")!;
    // matching/AIPW (which lean on the nonparametric propensity) stay close to the oracle...
    expect(Math.abs(get("matching")! - truth)).toBeLessThan(0.03);
    expect(Math.abs(get("aipw")! - truth)).toBeLessThan(0.03);
    // ...while the purely parametric linear outcome model is more biased under the
    // example's non-linear age effect (the misspecification teaching point).
    expect(Math.abs(get("outcome_regression")! - truth)).toBeGreaterThan(Math.abs(get("matching")! - truth));
  });

  it("continuous outcome (weight gain): estimators agree within reason", () => {
    const { get } = run("what-if-weight-gain-g-estimation");
    for (const method of ["outcome_regression", "matching", "aipw"] as const) {
      expect(Math.abs(get(method)! - get("g_formula")!), method).toBeLessThan(0.5);
    }
  });
});
