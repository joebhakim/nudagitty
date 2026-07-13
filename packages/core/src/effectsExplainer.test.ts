import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import { imposedEffectContext, normalizeNodeMechanism, normalizeEdgeMechanism, pinKeys, reconcilePins, runSimulation } from "./index";
import type { GraphDocument } from "./types";

/**
 * THE /effects.html EXPLAINER ASSERTS NUMBERS. THIS RE-DERIVES THEM FROM THE ENGINE.
 *
 * A prose page that quotes engine numbers is a CACHE, and caches go stale silently. This one did: when the
 * amount link moved from LOG to IDENTITY, the page kept teaching δ as "log-DOLLARS", kept printing the old
 * coefficients (γ=1.769, δ=0.0309) — and kept running a bolded proof that "training just gets people jobs is
 * mathematically impossible here", which the corrected DGP had made FALSE. The ceiling moved from $1,473 to
 * $1,835, above the $1,794 target, and nothing told anyone.
 *
 * Nobody reads an explainer page against the engine. So this does.
 *
 * IF YOU ARE HERE BECAUSE THIS FAILED: the DGP moved. Update apps/web/src/effects/EffectsExplainer.tsx to
 * match the new numbers — do not just update the expectation, or you have re-created the exact bug.
 */
const DOC = () => exampleDocument("lalonde-fit-recover-2part")!;

const doOracle = (doc: GraphDocument, seed = 11) => {
  const at = (v: number) =>
    runSimulation(doc.graph, { ...doc.simulation, seed, overrides: { In_program: v } }).nodeStates["Earnings_78"]!
      .empirical;
  return { lo: at(0), hi: at(1) };
};

describe("/effects.html — the numbers on the page are the engine's", () => {
  const doc = DOC();
  const ctx = imposedEffectContext(doc)!;

  it("§1 the amount link is IDENTITY, so δ is DOLLARS — not log-dollars", () => {
    const mech = normalizeNodeMechanism(doc.simulation.nodes["Earnings_78"]);
    expect(mech.combiner).toBe("positive_softplus");
    expect(ctx.identityAmount).toBe(true);
    expect(mech.noise.kind).toBe("gamma");        // not lognormal — log(Y)|Y>0 is LEFT-skewed
  });

  it("§2 the three stories on the contour, all delivering $1,794", () => {
    // story          γ       δ          from working   from pay
    // All pay        0       +$2,047    $0             $1,794
    // Mixed (0.62)   1.315   +$719      $1,112         $682
    // All employment 4.493   $0         $1,794         $0
    const rows = [
      { share: 0, gamma: 0, delta: 2047, ext: 0, int: 1794 },
      { share: 0.62, gamma: 1.315, delta: 719, ext: 1112, int: 682 },
      { share: 1, gamma: 4.493, delta: 0, ext: 1794, int: 0 }
    ];
    for (const r of rows) {
      const s = ctx.solve(r.share);
      const d = ctx.decompose(s.gamma, s.delta);
      expect(s.gamma).toBeCloseTo(r.gamma, 2);
      expect(s.delta).toBeCloseTo(r.delta, -1);
      expect(d.extensive).toBeCloseTo(r.ext, -2);
      expect(d.intensive).toBeCloseTo(r.int, -2);
      expect(d.ate).toBeCloseTo(1794, 3);          // every row is the SAME dollar effect
    }
  });

  it("§2 employment moves 86.7% → 94.7% at the imposed default", () => {
    const { lo, hi } = doOracle(doc);
    const share = (e: typeof lo) => (e.samples ?? []).filter((x) => x > 0).length / Math.max(1, (e.samples ?? []).length);
    expect(share(lo) * 100).toBeCloseTo(86.7, 0);
    expect(share(hi) * 100).toBeCloseTo(94.7, 0);
  });

  it("§3 the wall does NOT bind at $1,794 — and DOES at $4,000", () => {
    // The page used to claim, in bold, that it binds: a $1,473 ceiling, an 82% cap, "pay MUST rise 1.5%".
    // That was a real theorem applied to a broken (log-link-on-dollars) DGP. The corrected numbers:
    expect(ctx.c0).toBeCloseTo(20465, -2);
    expect(ctx.amax).toBeCloseTo(22299, -2);
    expect(ctx.amax - ctx.c0).toBeCloseTo(1835, -2);
    expect(ctx.amax - ctx.c0).toBeGreaterThan(1794);   // ← does NOT bind. The old page said the opposite.
    expect(ctx.maxExtensiveShare).toBe(1);

    const big = imposedEffectContext(doc, { target: 4000, exposure: "In_program", outcome: "Earnings_78" })!;
    expect(big.amax - big.c0).toBeLessThan(4000);      // ← but it bites on a bigger target
    expect(big.maxExtensiveShare).toBeCloseTo(0.46, 2);
  });

  it("§4 the DERIVED coefficients: γ = 1.315, δ = $719 per worker", () => {
    const mech = normalizeNodeMechanism(doc.simulation.nodes["Earnings_78"]);
    const edge = doc.graph.edges.find((e) => e.source === "In_program" && e.target === "Earnings_78")!;
    const em = normalizeEdgeMechanism(doc.simulation.edges[edge.id]);
    expect(mech.gate?.coefficients["In_program"]).toBeCloseTo(1.315, 2);
    expect(em.kind === "linear" ? em.coefficient : NaN).toBeCloseTo(719, -1);
  });

  it("§5 the trap: fitting the effect edge reports job training DESTROYING $3,553", () => {
    // Force-pin the effect edge — what "fit everything" used to do. (pinNodeEquation now refuses to, which is
    // the fix; this reaches past it deliberately, to keep the page's cautionary number honest.)
    const trap: GraphDocument = JSON.parse(JSON.stringify(doc));
    const id = trap.graph.edges.find((e) => e.source === "In_program" && e.target === "Earnings_78")!.id;
    trap.metadata.pins = [...new Set([...(trap.metadata.pins ?? []), pinKeys.edge(id)])];
    trap.metadata.authored = (trap.metadata.authored ?? []).filter((k) => k !== pinKeys.edge(id));
    const fitted = reconcilePins(trap).document;

    const em = normalizeEdgeMechanism(fitted.simulation.edges[id]);
    expect(em.kind === "linear" ? em.coefficient : NaN).toBeCloseTo(-5259, -2);

    const { lo, hi } = doOracle(fitted);
    const ate = (hi.mean ?? NaN) - (lo.mean ?? NaN);
    expect(ate).toBeCloseTo(-3553, -2);
    expect(ate).toBeLessThan(0);   // a world built to hold +$1,794 now reports a LOSS
  });
});
