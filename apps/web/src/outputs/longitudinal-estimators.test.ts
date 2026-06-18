import { describe, expect, it } from "vitest";
import { analyzeGraph, exampleDocument, runSimulation } from "@nudagitty/core";
import { computeCompletedOutput } from "./modules";

// Regression guard for the continuous-confounder fix: the g-methods estimators
// (stratified / IPW / g-estimation) must actually adjust for CONTINUOUS confounders
// (Age, baseline risk, …). Before the fix, `historyKey` binarized them with
// `v >= 0.5`, which collapsed e.g. Age~N(50,10) to a constant — so stratification
// degenerated to the naive estimate and IP weights barely adjusted.
//
// `g_formula` re-simulates with do(), so it is the oracle truth. Sims are seeded,
// so these numbers are deterministic.

function estimates(id: string) {
  const document = exampleDocument(id);
  if (!document) throw new Error(`missing example ${id}`);
  const simulation = runSimulation(document.graph, document.simulation);
  const analysis = analyzeGraph(document.graph);
  const computed = computeCompletedOutput({ analysis, document, simulation }, id);
  const comparison = (computed?.result as { comparison?: { estimates: Array<{ id: string; estimate: number | null }> } } | null)?.comparison;
  if (!comparison) throw new Error(`no comparison for ${id}`);
  const get = (key: string) => {
    const value = comparison.estimates.find((estimate) => estimate.id === key)?.estimate;
    if (value == null || !Number.isFinite(value)) throw new Error(`${id}: ${key} estimate is ${value}`);
    return value;
  };
  return { naive: get("naive"), stratified: get("stratified"), ipw: get("ipw"), gFormula: get("g_formula"), gEstimation: get("g_estimation") };
}

describe("longitudinal g-methods adjust for continuous confounders", () => {
  it("treatment-feedback: IPW recovers the g-formula truth; naive is biased", () => {
    const e = estimates("what-if-treatment-feedback");
    // IPW correctly handles the time-varying confounding and lands on the oracle.
    expect(Math.abs(e.ipw - e.gFormula)).toBeLessThan(0.025);
    // The naive observed-regimen contrast is visibly confounded.
    expect(Math.abs(e.naive - e.gFormula)).toBeGreaterThan(0.03);
  });

  it("nhefs: continuous-confounder stratification no longer degenerates to naive", () => {
    const e = estimates("what-if-nhefs-mortality-survival");
    // The core regression: stratifying over continuous Age/health used to TIE the
    // naive estimate exactly. It must now move substantially off naive.
    expect(Math.abs(e.stratified - e.naive)).toBeGreaterThan(0.05);
    // Standardization and IP weighting now agree (both genuinely adjust).
    expect(Math.abs(e.stratified - e.ipw)).toBeLessThan(0.03);
    // With the censoring kludge removed and adaptive quantile binning, IPW now
    // converges to the oracle (the residual is finite-sample within-bin confounding,
    // far smaller than the naive bias).
    expect(Math.abs(e.ipw - e.gFormula)).toBeLessThan(0.04);
  });
});
