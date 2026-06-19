import { describe, expect, it } from "vitest";
import { analyzeAdjustment, deriveAdjustmentSpec } from "./longitudinal";
import { exampleDocument } from "./examples";

// The flexible-adjustment example: the confounder enters purely as L², so LINEAR outcome
// regression cannot adjust at all, while a quadratic covariate basis recovers it.
describe("covariate basis flexibility", () => {
  const doc = () => exampleDocument("flexible-adjustment")!;
  const outreg = (basis: "linear" | "quadratic" | "cubic") => {
    const spec = { ...deriveAdjustmentSpec(doc())!, covariateBasis: basis };
    const cmp = analyzeAdjustment(doc(), spec)!;
    const get = (id: string) => cmp.estimates.find((e) => e.id === id)!.estimate!;
    return { est: get("outcome_regression"), truth: get("g_formula") };
  };

  it("linear outcome regression is badly biased (it ignores the L² confounding)", () => {
    const { est, truth } = outreg("linear");
    expect(Math.abs(est - truth)).toBeGreaterThan(0.15);
  });

  it("a quadratic basis removes most of the bias", () => {
    const linear = outreg("linear");
    const quadratic = outreg("quadratic");
    expect(Math.abs(quadratic.est - quadratic.truth)).toBeLessThan(0.06);
    // and it's a big improvement over linear
    expect(Math.abs(quadratic.est - quadratic.truth)).toBeLessThan(Math.abs(linear.est - linear.truth) - 0.1);
  });

  it("nonparametric stratification needs no basis (already flexible)", () => {
    const spec = deriveAdjustmentSpec(doc())!;
    const cmp = analyzeAdjustment(doc(), spec)!;
    const naive = cmp.estimates.find((e) => e.id === "naive")!.estimate!;
    const stratified = cmp.estimates.find((e) => e.id === "stratified")!.estimate!;
    // the crude is confounded to the wrong sign; stratification flips it negative
    expect(naive).toBeGreaterThan(0);
    expect(stratified).toBeLessThan(-0.08);
  });
});
