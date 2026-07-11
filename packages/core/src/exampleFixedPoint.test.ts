import { describe, it, expect } from "vitest";
import { EXAMPLES, exampleDocument, reconcilePins, syncGenerativeState, imposedEffectContext, normalizeEdgeMechanism, normalizeNodeMechanism } from "./index";

const canon = (d: { graph: unknown; simulation: unknown }) => JSON.stringify({ graph: d.graph, simulation: d.simulation });

// INVARIANT: every curated example must be a FIXED POINT of the app's own commit pipeline
// (workbenchStore.commitState = reconcilePins(syncGenerativeState(doc))). If it isn't, then merely OPENING
// the example silently mutates it — the doc the app shows is not the doc we authored.
//
// This bit us for real. `lalonde-fit-recover-2part` fitted the outcome's confounders with the treatment
// effect authored at 0, then set the effect afterwards WITHOUT re-reconciling. On load the app refit the
// confounders holding the real effect as an offset, drifting every coefficient. Two consequences:
//   1. the example silently changed under the user, and
//   2. it stopped byte-matching exampleDocument(id), so it fell off the ~60-char `#example=<id>` share link
//      and serialized a ~10KB `#c=` payload of the whole document instead.
// Fixed by deriving the effect's coefficients INSIDE reconcile, which converges to a fixed point.
describe("every example is a fixed point of the commit pipeline", () => {
  it.each(EXAMPLES.map((e) => e.id))("%s is unchanged by reconcile(syncGenerativeState(doc))", (id) => {
    const pristine = exampleDocument(id)!;
    // Clone rather than rebuild: the two-part configurator fits + solves to a fixed point, and this runs
    // for EVERY example.
    const afterCommit = reconcilePins(syncGenerativeState(structuredClone(pristine))).document;
    expect(canon(afterCommit)).toBe(canon(pristine));
  });
});

// The imposed effect is the AUTHORED ESTIMAND; the coefficients are DERIVED. So the truth must survive a
// refit — that is the whole point, and the property the old "store the coefficient" design silently broke.
describe("an imposed effect is exact, and survives a refit", () => {
  const coefs = (d: NonNullable<ReturnType<typeof exampleDocument>>) => {
    const e = d.graph.edges.find((x) => x.source === "In_program" && x.target === "Earnings_78")!;
    const em = normalizeEdgeMechanism(d.simulation.edges[e.id]);
    const m = normalizeNodeMechanism(d.simulation.nodes["Earnings_78"]);
    return { delta: em.kind === "linear" ? em.coefficient : NaN, gamma: m.gate?.coefficients["In_program"] ?? 0 };
  };

  it("two-part: the analytic do()-contrast is EXACTLY the target", () => {
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    const ctx = imposedEffectContext(doc)!;
    const { gamma, delta } = coefs(doc);
    const d = ctx.decompose(gamma, delta);
    expect(d.ate).toBeCloseTo(1794, 6);
    expect(d.extensive + d.intensive).toBeCloseTo(1794, 6);
    expect(d.extensive / 1794).toBeCloseTo(0.62, 2);   // the authored story: extensive-led
    expect(delta).toBeGreaterThanOrEqual(ctx.deltaFloor - 1e-9);
  });

  it("two-part: SELF-HEALING — reconciling again re-derives and still lands on the target", () => {
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    const again = reconcilePins(doc).document;
    const ctx = imposedEffectContext(again)!;
    const { gamma, delta } = coefs(again);
    expect(ctx.decompose(gamma, delta).ate).toBeCloseTo(1794, 6);
  });

  it("additive (#95): the coefficient IS the ATE — beta == target", () => {
    const doc = exampleDocument("lalonde-fit-recover")!;
    const ctx = imposedEffectContext(doc)!;
    expect(ctx.family).toBe("additive");
    expect(coefs(doc).delta).toBeCloseTo(1794, 9);
  });

  it("the effect edge is AUTHORED, never fitted (fitting it destroys the imposed truth)", () => {
    for (const id of ["lalonde-fit-recover", "lalonde-fit-recover-2part"]) {
      const doc = exampleDocument(id)!;
      const e = doc.graph.edges.find((x) => x.source === "In_program" && x.target === "Earnings_78")!;
      expect(doc.metadata.authored).toContain(`e:${e.id}`);
      expect(doc.metadata.pins).not.toContain(`e:${e.id}`);
    }
  });
});
