import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import { imposedEffectContext } from "./index";

// The solve context is PURE and is the single source of truth for BOTH the engine and the editor's
// manifold pad. Lock the math against the values derived by hand (see docs/plan-imposed-estimand.md).
describe("imposedEffectContext — the (γ,δ) iso-ATE manifold", () => {
  const doc = exampleDocument("lalonde-fit-recover-2part")!;
  const ctx = imposedEffectContext(doc)!;

  it("recognises the two-part family and the imposed target", () => {
    expect(ctx).toBeTruthy();
    expect(ctx.family).toBe("two_part");
    expect(ctx.target).toBe(1794);
    expect(ctx.exposure).toBe("In_program");
    expect(ctx.outcome).toBe("Earnings_78");
  });

  it("the feasibility wall is REAL but no longer BINDS — and that is a finding", () => {
    // The wall was one of the headline results of this example, and it was an ARTEFACT OF THE LOG SPEC.
    // Under the corrected (identity + gamma) DGP the gate can, in principle, deliver the whole $1,794:
    //     max extensive-only = Amax − C0 = $1,835 > $1,794.
    // The machinery is unchanged and still correct — the ceiling simply sits above this target now. It
    // still binds for a bigger one, which is what the second half of this test pins down.
    expect(ctx.c0).toBeCloseTo(20465, -2);    // do(T=0) mean earnings
    expect(ctx.amax).toBeCloseTo(22299, -2);  // S(∞): everyone works
    expect(ctx.amax - ctx.c0).toBeCloseTo(1835, -2);
    expect(ctx.amax - ctx.c0).toBeGreaterThan(ctx.target);   // ← the wall does NOT bind at $1,794
    expect(ctx.maxExtensiveShare).toBe(1);
    expect(ctx.identityAmount).toBe(true);    // δ is in DOLLARS now, not log-dollars
  });

  it("…and it DOES bind on a target the gate cannot reach", () => {
    const big = imposedEffectContext(doc, { target: 4000, exposure: "In_program", outcome: "Earnings_78" })!;
    expect(big.amax - big.c0).toBeLessThan(big.target);              // employment alone cannot get there
    expect(big.maxExtensiveShare).toBeCloseTo((big.amax - big.c0) / 4000, 3);
    expect(big.maxExtensiveShare).toBeLessThan(0.5);
    expect(big.deltaFloor).toBeGreaterThan(0);                       // ⇒ pay MUST rise
  });

  it("the closed-form contour holds the ATE at exactly the target, for ANY share", () => {
    for (const share of [0, 0.2, 0.4, 0.62, 0.8]) {
      const sol = ctx.solve(share);
      const { ate, extensive, intensive } = ctx.decompose(sol.gamma, sol.delta);
      expect(ate).toBeCloseTo(ctx.target, 4);                      // the whole point
      expect(extensive + intensive).toBeCloseTo(ctx.target, 4);    // Oaxaca split telescopes exactly
      expect(sol.delta).toBeGreaterThanOrEqual(ctx.deltaFloor - 1e-9);
    }
  });

  it("reproduces the example's operating point (62% extensive)", () => {
    // δ is now a per-worker RAISE IN DOLLARS ($719), not a log-dollar shift. The dollar decomposition is
    // what actually matters and it is still exact.
    const sol = ctx.solve(0.62);
    expect(sol.gamma).toBeCloseTo(1.315, 2);
    expect(sol.delta).toBeCloseTo(718.5, -1);      // DOLLARS per worker
    expect(sol.extensive).toBeCloseTo(1112, -2);   // 62% of $1,794
    expect(sol.intensive).toBeCloseTo(682, -2);    // 38%
    expect(sol.extensive + sol.intensive).toBeCloseTo(ctx.target, 4);
    expect(sol.clamped).toBe(false);
  });

  it("clamps an infeasible request instead of silently lying", () => {
    // At $1,794 nothing is infeasible any more (the wall sits above it), so the clamp is exercised on a
    // target the gate genuinely cannot reach alone.
    const big = imposedEffectContext(doc, { target: 4000, exposure: "In_program", outcome: "Earnings_78" })!;
    const sol = big.solve(1.0);                    // "make it ALL employment" — impossible
    expect(sol.clamped).toBe(true);
    expect(sol.extensiveShare).toBeCloseTo(big.maxExtensiveShare, 6);
    expect(sol.extensive + sol.intensive).toBeCloseTo(4000, 3);   // and it STILL lands on the target
  });

  it("share = 0 is the all-intensive end (γ=0, pay does all the work)", () => {
    const sol = ctx.solve(0);
    expect(sol.gamma).toBe(0);
    expect(sol.extensive).toBeCloseTo(0, 6);
    expect(sol.intensive).toBeCloseTo(ctx.target, 4);
    expect(sol.delta).toBeCloseTo(2047, -2);       // a $2,047 raise for every worker, and nobody new hired
  });
});
