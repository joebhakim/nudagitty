import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import { setImposedEffect, reconcilePins, imposedEffectContext, normalizeEdgeMechanism, normalizeNodeMechanism } from "./index";

// What the manifold pad actually does: you re-author the STORY (the extensive/intensive split) and the
// engine re-DERIVES the coefficients. The dollar target must hold at every point on the curve — we bend
// the story, never the truth.
const coefs = (d: NonNullable<ReturnType<typeof exampleDocument>>) => {
  const e = d.graph.edges.find((x) => x.source === "In_program" && x.target === "Earnings_78")!;
  const em = normalizeEdgeMechanism(d.simulation.edges[e.id]);
  const m = normalizeNodeMechanism(d.simulation.nodes["Earnings_78"]);
  return { delta: em.kind === "linear" ? em.coefficient : NaN, gamma: m.gate?.coefficients["In_program"] ?? 0 };
};
// Build the example ONCE — exampleDocument() runs the whole configurator (fit + solve to a fixed point),
// so rebuilding it per case is what made this slow. setImposedEffect clones, so `base` is never mutated.
const base = exampleDocument("lalonde-fit-recover-2part")!;
const author = (share: number) => reconcilePins(setImposedEffect(base, { extensiveShare: share })).document;

describe("authoring the imposed effect's story (what the pad drives)", () => {
  it("every share on the curve still delivers EXACTLY the target", () => {
    for (const share of [0, 0.25, 0.5, 0.62, 0.8]) {
      const doc = author(share);
      const ctx = imposedEffectContext(doc)!;
      const { gamma, delta } = coefs(doc);
      const d = ctx.decompose(gamma, delta);
      expect(d.ate).toBeCloseTo(1794, 5);
      expect(d.extensive / 1794).toBeCloseTo(Math.min(share, ctx.maxExtensiveShare), 2);
    }
  });

  it("moving the story MOVES the coefficients (they are derived, not stored)", () => {
    const lo = coefs(author(0.2));
    const hi = coefs(author(0.8));
    expect(hi.gamma).toBeGreaterThan(lo.gamma);   // more of the effect via employment
    expect(hi.delta).toBeLessThan(lo.delta);      // ...so less of it via pay
  });

  it("an infeasible story is CLAMPED, and still lands on the target exactly", () => {
    const doc = author(1.0);                       // "make it ALL about employment" — impossible here
    const ctx = imposedEffectContext(doc)!;
    const { gamma, delta } = coefs(doc);
    const d = ctx.decompose(gamma, delta);
    expect(d.ate).toBeCloseTo(1794, 5);            // truth intact
    expect(d.extensive / 1794).toBeLessThan(0.83); // story clamped to what the data can deliver
    expect(delta).toBeGreaterThanOrEqual(ctx.deltaFloor - 1e-9);
  });

  it("re-authoring stays a fixed point (no drift, so it keeps the short share link)", () => {
    const once = author(0.4);
    const twice = reconcilePins(once).document;
    expect(JSON.stringify(twice.simulation)).toBe(JSON.stringify(once.simulation));
  });

  // FREE MODE (pad unlocked): dragging to an arbitrary (γ,δ) does NOT store coefficients. We read the target
  // AND the split off that point and re-author the ESTIMAND; the engine derives γ/δ from it.
  //
  // What round-trips is the ESTIMAND, not the coefficients — and that distinction is the whole thesis. The
  // new δ changes the offset the confounders are fit against, so the η's legitimately shift and the engine
  // lands on a slightly DIFFERENT coefficient that delivers the SAME dollar effect and the SAME split. The
  // estimand is honored exactly; the coefficient is just whatever encodes it against the current fit. (If we
  // had stored the coefficient instead, this shift is precisely the silent lie we would have shipped.)
  it("free-drag: the ESTIMAND round-trips exactly (the coefficients need not)", () => {
    const ctx0 = imposedEffectContext(base)!;
    for (const [gamma, delta] of [[0.9, 0.05], [2.2, 0.02], [0.3, 0.07]] as const) {
      const ate = Math.exp(delta) * ctx0.s(gamma) - ctx0.c0;      // what that DGP would impose
      const share = ctx0.decompose(gamma, delta).extensive / ate;
      const doc = reconcilePins(setImposedEffect(base, { target: ate, extensiveShare: share })).document;

      const back = coefs(doc);
      const got = imposedEffectContext(doc)!.decompose(back.gamma, back.delta);
      expect(got.ate).toBeCloseTo(ate, 4);                        // the dollar effect you chose: exact
      expect(got.extensive / got.ate).toBeCloseTo(share, 3);      // the story you chose: exact
      expect(back.gamma).toBeCloseTo(gamma, 1);                   // coefficients land NEAR the dragged point,
      expect(back.delta).toBeCloseTo(delta, 3);                   // shifted only by the confounders' refit
    }
  });
});
