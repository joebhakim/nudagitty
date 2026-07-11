import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import { familyWarnings, lookupDataset, registerRuntimeDataset, runSimulation, setVariable } from "./index";
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
