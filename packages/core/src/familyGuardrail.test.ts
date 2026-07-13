import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import { familyWarnings, lookupDataset, reconcilePins, registerRuntimeDataset, runSimulation, setNode, setVariable } from "./index";
import type { GraphDocument } from "./types";

const draws = (doc: GraphDocument, id: string) =>
  runSimulation(doc.graph, doc.simulation).nodeStates[id]!.empirical.samples ?? [];

describe("familyWarnings — does the family match the variable?", () => {
  it("catches the default that generates NEGATIVE EARNINGS", () => {
    // lalonde-fit-recover declares earnings `continuous`, so it is fit and generated as linear + Gaussian.
    // Against real rows where negatives are impossible, the DGP pays ~9% of the population negative money.
    // Nothing in the app said so — every estimate below it is computed on a population that cannot exist.
    const doc = exampleDocument("lalonde-fit-recover")!;
    const warns = familyWarnings(doc, "Earnings_78", draws(doc, "Earnings_78"));

    const neg = warns.find((w) => w.kind === "generates-impossible-negatives")!;
    expect(neg).toBeDefined();
    expect(neg.fraction).toBeGreaterThan(0.05);      // measured: ~9.2%
    expect(neg.extreme).toBeLessThan(-10000);        // measured: −$29,403
    expect(neg.suggest).toBe("semicontinuous");      // …and the real column ALSO has a zero spike

    // The same doc trips the spike rule too — the two findings are the same disease from both ends.
    const spike = warns.find((w) => w.kind === "zero-spike-under-additive")!;
    expect(spike).toBeDefined();
    expect(spike.fraction).toBeCloseTo(0.124, 2);    // 331 of 2675 real rows earn exactly zero
  });

  it("…and goes SILENT once the family is honest", () => {
    // The two-part upgrade of the same DGP: Y = 1(gate) × exp(...) cannot emit a negative, and it
    // reproduces the zero spike instead of smearing through it.
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    const samples = draws(doc, "Earnings_78");
    expect(Math.min(...samples)).toBe(0);
    expect(familyWarnings(doc, "Earnings_78", samples)).toEqual([]);
  });

  it("flags negatives sitting under a log-scale family — those rows are being silently reinterpreted", () => {
    // A semicontinuous fit takes log(Y) on Y>0 and treats everything else as "did not participate". If the
    // column actually contains negatives, they are quietly relabelled as non-participation — a different
    // claim about the world, made without asking.
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    const original = lookupDataset("lalonde-obs")!;
    const poisoned = structuredClone(original);
    poisoned.rows[0]![9] = -500;                       // one worker "earns" −$500
    registerRuntimeDataset("lalonde-obs", poisoned);
    try {
      const hit = familyWarnings(doc, "Earnings_78").find((x) => x.kind === "negatives-under-positive-family")!;
      expect(hit).toBeDefined();
      expect(hit.extreme).toBe(-500);
      expect(hit.suggest).toBe("continuous");
    } finally {
      registerRuntimeDataset("lalonde-obs", original);   // never leave a poisoned dataset behind
    }
  });

  it("does not nag a variable that is legitimately signed or has no spike", () => {
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    // Age: continuous, no zeros, never negative — nothing to say.
    expect(familyWarnings(doc, "Age", draws(doc, "Age"))).toEqual([]);
    // Binary treatment: a 0/1 column is not a "zero spike".
    expect(familyWarnings(doc, "In_program", draws(doc, "In_program"))).toEqual([]);
  });

  it("stays quiet when there is no real column to compare against", () => {
    const doc = exampleDocument("simpson-severity")!;
    for (const node of doc.graph.nodes) expect(familyWarnings(doc, node.id)).toEqual([]);
  });

  it("the spike rule fires on the DATA alone — before a single draw is taken", () => {
    // This is what lets the impose card warn you BEFORE you build a benchmark on a broken family.
    const doc = structuredClone(exampleDocument("lalonde-fit-recover-2part")!);
    setVariable(doc, "Earnings_78", { valueType: "continuous" });   // "just make it continuous"
    const w = familyWarnings(doc, "Earnings_78");                   // no `generated` passed
    expect(w.map((x) => x.kind)).toEqual(["zero-spike-under-additive"]);
    expect(w[0]!.suggest).toBe("semicontinuous");
  });
});

describe("generates-beyond-support — the rule that would have caught OUR OWN bug", () => {
  it("is silent on the correct DGP and fires on the log-link one", () => {
    // We shipped a log-link intensive margin for weeks. It built a world containing $1.6M earners against a
    // real LaLonde maximum of $121k, and NOTHING in the app said so — this rule was on my own "obvious next
    // rules" list when the guardrail was built, and I skipped it. Measured:
    //     levels + gamma  (correct)   max $153,270 = 1.3x the data's max   ⇒ silent
    //     log + lognormal (the bug)   max $1,571,370 = 13x                 ⇒ fires
    // Two conditions (max > 5x AND p99.9 > 1.5x) so one freak draw cannot trip it: a good model SHOULD be
    // able to exceed its sample. Thirteen-fold is not "exceeding"; it is a different world.
    const good = exampleDocument("lalonde-fit-recover-2part")!;
    const gy = runSimulation(good.graph, good.simulation).nodeStates["Earnings_78"]!.empirical.samples ?? [];
    expect(familyWarnings(good, "Earnings_78", gy)).toEqual([]);

    const flipped = structuredClone(good);
    setNode(flipped, "Earnings_78", { combiner: "gamma_log" });   // back to the log amount model
    const bad = reconcilePins(flipped).document;
    const by = runSimulation(bad.graph, bad.simulation).nodeStates["Earnings_78"]!.empirical.samples ?? [];

    const hit = familyWarnings(bad, "Earnings_78", by).find((w) => w.kind === "generates-beyond-support")!;
    expect(hit).toBeDefined();
    expect(hit.extreme).toBeGreaterThan(500_000);      // measured: $1,571,370
    expect(hit.fraction).toBeGreaterThan(0.002);       // measured: 0.88% of draws beyond the data's max
  }, 60000);
});
