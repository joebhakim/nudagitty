import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import { pinNumber, unpinKey, pinKeys, reconcilePins, imposedEffectContext, normalizeEdgeMechanism, imposedEffectEdge, normalizeNodeMechanism, pinNodeEquation
} from "./index";

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

describe("the trap re-entered: 'Fit all from data' AFTER imposing", () => {
  it("no longer re-pins the effect edge and silently destroys the imposed truth", () => {
    // Found by decoding a real share link from a real session. The document had metadata.imposedEffect
    // {target: 1794} sitting there looking authoritative — and "e:directed:treat->re78" in metadata.PINS,
    // with no `authored` array at all. applyImposed() deliberately stands down on a pinned effect edge
    // ("the user is FITTING the effect, not imposing it"), so the DGP was carrying the CONFOUNDED fitted
    // coefficient while the UI still showed an imposed $1,794.
    //
    // The cause: `pinNodeEquation` — the "Fit all from data →" button — pins EVERY drawn parent, including
    // the effect edge. Impose first, then click it again, and the benchmark quietly dies. Measured before
    // the fix: do() fell from $1,753 to $1,278 against an imposed $1,794.
    //
    // The original fit-vs-author trap was "fit the effect edge by hand". This is the same trap through a
    // different door: "fit everything, twice".
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    const effect = imposedEffectEdge(doc)!;
    const key = pinKeys.edge(effect.edgeId);

    expect(doc.metadata.authored).toContain(key);       // imposed ⇒ the effect edge is AUTHORED
    expect(doc.metadata.pins).not.toContain(key);

    // …now re-run the bulk fit on the outcome, exactly as the button does.
    const refit = reconcilePins(pinNodeEquation(doc, effect.outcome)).document;
    expect(refit.metadata.pins).not.toContain(key);     // still not fitted
    expect(refit.metadata.authored).toContain(key);     // still authored ⇒ applyImposed still runs

    // and the DGP still carries the imposed truth, exactly
    const ctx = imposedEffectContext(refit)!;
    const gamma = normalizeNodeMechanism(refit.simulation.nodes[effect.outcome]).gate!.coefficients[effect.exposure]!;
    const delta = (refit.simulation.edges[effect.edgeId] as { coefficient: number }).coefficient;
    expect(ctx.decompose(gamma, delta).ate).toBeCloseTo(1794, 3);

    // every OTHER parent is still fitted — the bulk fit does its job, it just does not eat the estimand
    const other = refit.graph.edges.find((e) =>
      e.target === effect.outcome && e.source !== effect.exposure && e.kind === "directed" &&
      normalizeEdgeMechanism(refit.simulation.edges[e.id]).kind !== "table_lookup")!;   // a real covariate
    expect(refit.metadata.pins).toContain(pinKeys.edge(other.id));
  });
});
