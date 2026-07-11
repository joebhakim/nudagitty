import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import { runSimulation } from "./index";

// REGRESSION (2026-07-11): a data-backed node (enabled table_lookup, no interactions) IS its data cell.
// Clicking "fit" on a data column leaves a fitted root marginal behind (an intercept + noise, and for a
// binary column a bernoulli_logit combiner). Every simulation path used to ADD that on top of the looked-up
// cell — `age` became 34 + real_age + N(0,10.5) (mean ~68!), and `black` was re-drawn through the leftover
// logit instead of being the real column. That silently corrupted the covariates (and hence the
// confounding) of any user-built plasmode DGP. All three paths now neutralize the mechanism.
describe("plasmode passthrough ignores a stale fitted marginal on a data column", () => {
  function covariateStats(doc: NonNullable<ReturnType<typeof exampleDocument>>, id: string) {
    const s = runSimulation(doc.graph, doc.simulation).nodeStates[id]?.empirical.samples ?? [];
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
    return { mean, sd };
  }

  it("a polluted covariate simulates identically to a clean one", () => {
    const clean = exampleDocument("lalonde-fit-recover-2part")!;
    const cleanAge = covariateStats(clean, "Age");
    const cleanBlack = covariateStats(clean, "Black");

    // Pollute exactly as the UI would after a stray "fit" on the column.
    const dirty = exampleDocument("lalonde-fit-recover-2part")!;
    dirty.simulation.nodes["Age"] = { ...dirty.simulation.nodes["Age"], intercept: 34.2257943925, noise: { kind: "normal", mean: 0, sd: 10.4978790948 } } as never;
    dirty.simulation.nodes["Black"] = { ...dirty.simulation.nodes["Black"], intercept: -0.8876801962, combiner: "bernoulli_logit" } as never;
    const dirtyAge = covariateStats(dirty, "Age");
    const dirtyBlack = covariateStats(dirty, "Black");

    // The stale marginal must be completely ignored — the cell wins.
    expect(dirtyAge.mean).toBeCloseTo(cleanAge.mean, 6);
    expect(dirtyAge.sd).toBeCloseTo(cleanAge.sd, 6);
    expect(dirtyBlack.mean).toBeCloseTo(cleanBlack.mean, 6);

    // Guard the specific failure mode: age must be the real ~34, never ~68 (cell + stale intercept).
    expect(dirtyAge.mean).toBeGreaterThan(30);
    expect(dirtyAge.mean).toBeLessThan(40);
  });
});
