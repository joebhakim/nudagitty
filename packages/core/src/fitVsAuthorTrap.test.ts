import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import { pinNumber, unpinKey, pinKeys, reconcilePins, imposedEffectContext, normalizeEdgeMechanism } from "./index";

// THE TRAP (hit by a real user): they FITTED the exposure→outcome edge instead of authoring it. That learns
// the CONFOUNDED association (−0.413 on the log scale) and hands it to the simulator as the causal mechanism
// — so do() just replays the bias and there is no imposed truth left to recover. The UI made "fit everything"
// the easy path and said nothing. Now the editor warns, and offers "Author it instead" (unpinKey).
describe("fitting the exposure→outcome edge destroys the imposed truth", () => {
  const doc = exampleDocument("lalonde-fit-recover-2part")!;
  const effect = doc.graph.edges.find((e) => e.source === "In_program" && e.target === "Earnings_78")!;
  const key = pinKeys.edge(effect.id);
  const deltaOf = (d: typeof doc) => {
    const m = normalizeEdgeMechanism(d.simulation.edges[effect.id]);
    return m.kind === "linear" ? m.coefficient : NaN;
  };

  it("as shipped, the effect is AUTHORED (never fitted) and the truth is exact", () => {
    expect(doc.metadata.authored).toContain(key);
    expect(doc.metadata.pins).not.toContain(key);
    const ctx = imposedEffectContext(doc)!;
    expect(ctx.decompose(0, 0)).toBeTruthy();
    expect(deltaOf(doc)).toBeGreaterThan(0); // a positive imposed effect
  });

  it("PINNING it makes the engine stand down — the solve refuses to fight the fit", () => {
    const trapped = reconcilePins(pinNumber(doc, key)).document;
    // Now FITTED: the coefficient is learned from the data, and on PSID that association is NEGATIVE —
    // the confounding, not the effect. The imposed truth is gone.
    expect(trapped.metadata.pins).toContain(key);
    expect(deltaOf(trapped)).toBeLessThan(0);
  });

  it("'Author it instead' (unpinKey) restores the imposed truth exactly", () => {
    const trapped = reconcilePins(pinNumber(doc, key)).document;
    const fixed = reconcilePins(unpinKey(trapped, key)).document;

    expect(fixed.metadata.authored).toContain(key);
    expect(fixed.metadata.pins).not.toContain(key);
    // The estimand is re-derived from scratch: back on target, exactly.
    const ctx = imposedEffectContext(fixed)!;
    const m = normalizeEdgeMechanism(fixed.simulation.edges[effect.id]);
    const gamma = (fixed.simulation.nodes["Earnings_78"] as { gate?: { coefficients: Record<string, number> } }).gate?.coefficients["In_program"] ?? 0;
    const delta = m.kind === "linear" ? m.coefficient : 0;
    expect(ctx.decompose(gamma, delta).ate).toBeCloseTo(1794, 4);
  });
});
