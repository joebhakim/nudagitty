import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import { imposedEffectContext } from "./index";

// The solve context is PURE and is the single source of truth for BOTH the engine and the editor's
// manifold pad. Lock the math against the values derived by hand (see docs/plan-imposed-estimand.md).
describe("imposedEffectContext — the (γ,δ) iso-ATE manifold", () => {
  const ctx = imposedEffectContext(exampleDocument("lalonde-fit-recover-2part")!)!;

  it("recognises the two-part family and the imposed target", () => {
    expect(ctx).toBeTruthy();
    expect(ctx.family).toBe("two_part");
    expect(ctx.target).toBe(1794);
    expect(ctx.exposure).toBe("In_program");
    expect(ctx.outcome).toBe("Earnings_78");
  });

  it("computes the feasibility wall: employment ALONE cannot reach $1,794", () => {
    expect(ctx.c0).toBeCloseTo(20542, -2);   // do(T=0) mean earnings
    expect(ctx.amax).toBeCloseTo(21866, -2); // S(∞): everyone works
    const maxExtensiveDollars = ctx.amax - ctx.c0;
    expect(maxExtensiveDollars).toBeCloseTo(1324, -2);
    expect(maxExtensiveDollars).toBeLessThan(ctx.target);          // <-- the wall
    expect(ctx.maxExtensiveShare).toBeCloseTo(0.738, 2);           // never 100%
    expect(ctx.deltaFloor).toBeCloseTo(0.0213, 3);                 // pay MUST still rise, ~0.6%
  });

  it("the closed-form contour holds the ATE at exactly the target, for ANY share", () => {
    for (const share of [0, 0.2, 0.4, 0.62, 0.8]) {
      const sol = ctx.solve(share);
      const { ate, extensive, intensive } = ctx.decompose(sol.gamma, sol.delta);
      expect(ate).toBeCloseTo(ctx.target, 6);                      // the whole point
      expect(extensive + intensive).toBeCloseTo(ctx.target, 6);    // Oaxaca split telescopes exactly
      expect(sol.delta).toBeGreaterThanOrEqual(ctx.deltaFloor - 1e-9);
    }
  });

  it("reproduces the example's operating point (62% extensive)", () => {
    // γ ≈ 2.241. Earnings history now enters the fit through sqrt(x), so the confounder η's — and therefore
    // the γ that buys a 62% extensive share — differ from every earlier baseline. The
    // dollar decomposition and the target are what actually matter, and both are still exact.
    const sol = ctx.solve(0.62);
    expect(sol.gamma).toBeCloseTo(2.241, 2);
    expect(sol.delta).toBeCloseTo(0.0310, 3);
    expect(sol.extensive).toBeCloseTo(1112, -2);   // 62% of $1,794
    expect(sol.intensive).toBeCloseTo(682, -2);    // 38%
    expect(sol.extensive + sol.intensive).toBeCloseTo(ctx.target, 6);
    expect(sol.clamped).toBe(false);
  });

  it("clamps an infeasible request instead of silently lying", () => {
    const sol = ctx.solve(1.0);                                     // "make it ALL about employment"
    expect(sol.clamped).toBe(true);
    expect(sol.extensiveShare).toBeCloseTo(ctx.maxExtensiveShare, 6);
    // clamped, but STILL exactly on target — we bend the story, never the truth
    expect(ctx.decompose(sol.gamma, sol.delta).ate).toBeCloseTo(ctx.target, 6);
  });

  it("share = 0 is the all-intensive end (γ=0, pay does all the work)", () => {
    const sol = ctx.solve(0);
    expect(sol.gamma).toBe(0);
    expect(sol.delta).toBeCloseTo(Math.log(1 + ctx.target / ctx.c0), 6);
    expect(ctx.decompose(sol.gamma, sol.delta).ate).toBeCloseTo(ctx.target, 6);
  });
});
