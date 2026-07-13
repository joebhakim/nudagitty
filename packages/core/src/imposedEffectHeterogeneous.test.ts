import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import { runSimulation, reconcilePins, imposedEffectContext, normalizeNodeMechanism } from "./index";
import { LALONDE_OBS_DATASET } from "./data/lalonde-obs";
import { setNode } from "./examples/builders";
import type { GraphDocument, NodeInteraction } from "./types";

/**
 * IMPOSING AN EFFECT WHEN THE EFFECT IS HETEROGENEOUS.
 *
 * An authored interaction (κ·T·X) is PART OF THE EFFECT: it moves η when — and only when — T flips. But
 * imposedEffectContext built its linear predictors from EDGE contributions alone, so the modifier never
 * entered the equation it was solving. The result was a confident, silent lie: the pad printed exactly
 * $1,794 while do() delivered $2,433, and the miss grew without bound in κ.
 *
 * On the additive branch the damage was exactly κ·E[X] — the omitted term, dead on:
 *      κ=1000 → do() = $2,130.8   (+$336.8 = 1000 × 0.337)
 *      κ=3000 → do() = $2,804.3   (+$1,010.3 = 3000 × 0.337)
 *
 * These lock the corrected math. The load-bearing claim is the LAST one: whatever the pad says the ATE is,
 * the SIMULATOR must actually deliver it. Everything else is a coefficient, and coefficients are not evidence.
 */

const ate = (doc: GraphDocument, exposure: string, outcome: string, seed = 11) => {
  const at = (v: number) =>
    runSimulation(doc.graph, { ...doc.simulation, seed, overrides: { [exposure]: v } }).nodeStates[outcome]!.empirical
      .mean ?? NaN;
  return at(1) - at(0);
};

/** Author a κ·T·modifier interaction on the outcome, then reconcile (what commitState does on every edit). */
function withModifier(exampleId: string, modifier: string, coefficient: number): GraphDocument {
  const base = exampleDocument(exampleId)!;
  const doc: GraphDocument = JSON.parse(JSON.stringify(base));
  const outcome = doc.graph.nodes.find((n) => n.roles?.outcome)!.id;
  const exposure = doc.graph.nodes.find((n) => n.roles?.exposure)!.id;
  const interaction: NodeInteraction = { id: "het", kind: "product", left: exposure, right: modifier, coefficient };
  setNode(doc, outcome, { ...normalizeNodeMechanism(doc.simulation.nodes[outcome]), interactions: [interaction] });
  return reconcilePins(doc).document;
}

describe("imposed effect × an authored effect modifier", () => {
  describe("ADDITIVE outcome (lalonde-fit-recover)", () => {
    it("δ gives back exactly what the modifier delivers for free: δ = target − κ·E[X]", () => {
      // The modifier hands out κ·No_degree to the treated. E[No_degree] ≈ 0.337 in this dataset, so on a
      // $1,794 target with κ = 3000 the modifier alone already delivers ~$1,010 — and δ must SHRINK by that
      // much. Before the fix δ was left at the full $1,794 and the DGP quietly paid out $2,804.
      const plain = imposedEffectContext(exampleDocument("lalonde-fit-recover")!)!;
      expect(plain.family).toBe("additive");
      expect(plain.heterogeneous).toBe(false);
      expect(plain.deltaFor(0)).toBeCloseTo(1794, 6); // no modifier ⇒ the coefficient IS the ATE, exactly

      const k1 = imposedEffectContext(withModifier("lalonde-fit-recover", "No_degree", 1000))!;
      const k3 = imposedEffectContext(withModifier("lalonde-fit-recover", "No_degree", 3000))!;
      expect(k1.heterogeneous).toBe(true);

      // δ(κ) is linear in κ with slope −E[X]; two points pin both the level and the slope.
      const meanX = (1794 - k1.deltaFor(0)) / 1000;
      expect(meanX).toBeCloseTo(0.337, 2); // ← E[No_degree], read back out of the solve
      expect(k3.deltaFor(0)).toBeCloseTo(1794 - 3000 * meanX, 6);
      expect(k3.deltaFor(0)).toBeLessThan(1000); // the modifier is carrying most of the effect now
    });

    it("…and the SIMULATOR actually delivers the target (the only claim that counts)", () => {
      for (const kappa of [1000, 3000]) {
        const doc = withModifier("lalonde-fit-recover", "No_degree", kappa);
        const realized = ate(doc, "In_program", "Earnings_78");
        // Was +$336.8 / +$1,010.3 off, growing in κ. Now flat, at the seed's own resampling error.
        expect(realized).toBeGreaterThan(1794 - 60);
        expect(realized).toBeLessThan(1794 + 60);
      }
    });
  });

  describe("TWO-PART outcome (lalonde-fit-recover-2part)", () => {
    it("the iso-ATE contour still holds the ATE at the target, for ANY extensive share", () => {
      const ctx = imposedEffectContext(withModifier("lalonde-fit-recover-2part", "No_degree", 1600))!;
      expect(ctx.family).toBe("two_part");
      expect(ctx.heterogeneous).toBe(true);
      for (const share of [0, 0.25, 0.62, 0.9]) {
        const sol = ctx.solve(share);
        expect(ctx.decompose(sol.gamma, sol.delta).ate).toBeCloseTo(ctx.target, 4);
      }
    });

    it("the feasibility wall stays defined on the GATE, not the modifier", () => {
      // S(γ), c0 and amax describe WHO works and what they'd earn at BASELINE. A modifier changes what the
      // employed EARN when treated, so it must never enter those sums. If e^shift leaked into S, c0 would
      // carry exp(1600·No_degree) and blow up by orders of magnitude — so a tight relative bound is a strong
      // test for exactly that leak.
      //
      // They do move slightly (~0.1%), and that is CORRECT: an interaction invalidates the outcome's fit
      // cache, δ shrinks to make room for the modifier, that changes the authored offset the confounders are
      // fitted against, and reconcile recurses to a new fixed point (intercept −2611 → −2494). A real but
      // second-order shift in the baseline — not a leak.
      const plain = imposedEffectContext(exampleDocument("lalonde-fit-recover-2part")!)!;
      const het = imposedEffectContext(withModifier("lalonde-fit-recover-2part", "No_degree", 1600))!;
      expect(het.c0 / plain.c0).toBeCloseTo(1, 2);       // 20,492 vs 20,465
      expect(het.amax / plain.amax).toBeCloseTo(1, 2);   // 22,3xx — still dollars, not exp(dollars)
      expect(het.amax).toBeLessThan(30000);              // the leak canary: e^shift would be astronomical
      expect(het.maxExtensiveShare).toBeCloseTo(plain.maxExtensiveShare, 2);
    });

    it("…and the SIMULATOR delivers the target, flat in κ", () => {
      const base = ate(exampleDocument("lalonde-fit-recover-2part")!, "In_program", "Earnings_78");
      for (const kappa of [400, 1600]) {
        const realized = ate(withModifier("lalonde-fit-recover-2part", "No_degree", kappa), "In_program", "Earnings_78");
        // The miss used to grow with κ (+$266 → +$639). It must now be κ-INDEPENDENT: whatever is left is the
        // finite-sample error this seed already had with no interaction at all.
        expect(Math.abs(realized - base)).toBeLessThan(40);
      }
    });
  });

  describe("the FIT treats an authored modifier as an offset (not as something to absorb)", () => {
    it("the outcome's marginal stays on the data it was fitted to, however large κ gets", () => {
      // The fit's rule is that an AUTHORED contribution enters as a fixed per-row offset, computed by the
      // simulator. Interactions were not in that offset, so the confounders and the intercept absorbed the
      // modifier — and generation then added κ·T·X a SECOND time on top:
      //     κ=1600  mean $20,566 (+$64)      κ=12000  mean $20,972 (+$470, 2.3% off the data)
      // and the fitted intercept slid −2611 → −1736 doing it. That is a treatment effect being credited to
      // the covariates, which is the fit-vs-author trap in a different hat.
      const ci = LALONDE_OBS_DATASET.columns.indexOf("re78");
      const dataMean = LALONDE_OBS_DATASET.rows.reduce((s, r) => s + (r[ci] ?? 0), 0) / LALONDE_OBS_DATASET.rows.length;

      for (const kappa of [0, 1600, 12000]) {
        const doc = kappa === 0
          ? exampleDocument("lalonde-fit-recover-2part")!
          : withModifier("lalonde-fit-recover-2part", "No_degree", kappa);
        const gen = runSimulation(doc.graph, { ...doc.simulation, seed: 11 }).nodeStates["Earnings_78"]!.empirical.mean!;
        // Now flat: $3 / $5 / $28. The residual at κ=12000 is the gate×softplus nonlinearity — an offset on
        // the η scale cannot exactly preserve a mean pushed through a nonlinear link — not absorption.
        expect(Math.abs(gen - dataMean) / dataMean).toBeLessThan(0.005);
      }
    });
  });

  it("REFUSES to solve when a modifier's value cannot be read — no pad beats a wrong pad", () => {
    // effect-modification-crossover is moderated by `Regime`, a synthetic root with no data column. There is
    // no distribution to average the shift over, so there is no honest ATE to solve for. It used to answer
    // δ = 0.5 on a DGP whose true ATE is 0.009.
    const doc: GraphDocument = JSON.parse(JSON.stringify(exampleDocument("effect-modification-crossover")!));
    doc.metadata.imposedEffect = { target: 0.5, exposure: "Treatment", outcome: "Outcome" };
    expect(imposedEffectContext(doc)).toBeNull();
  });
});
