import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import { gateCoefficientState, imposedEffectEdge, setImposedEffect, reconcilePins, pinNumber, pinKeys, normalizeNodeMechanism } from "./index";

// The gate is a SECOND coefficient vector on the node, not on the edges, so it has no provenance key. The
// editor could therefore not tell whether typing into a gate cell would stick — and in two of three cases it
// silently would NOT. This helper is the missing answer.
describe("gateCoefficientState — who owns γ", () => {
  const doc = exampleDocument("lalonde-fit-recover-2part")!;

  it("DERIVED for the exposure: an imposed effect re-solves γ every commit", () => {
    expect(gateCoefficientState(doc, "Earnings_78", "In_program")).toBe("derived");
    const edge = imposedEffectEdge(doc)!;
    expect(edge.exposure).toBe("In_program");
    expect(edge.outcome).toBe("Earnings_78");
  });

  it("FITTED for a confounder: the gate logistic learns it", () => {
    for (const conf of ["Age", "Education", "Earnings_74"]) {
      expect(gateCoefficientState(doc, "Earnings_78", conf)).toBe("fitted");
    }
  });

  it("...and a typed γ on a DERIVED parent really is overwritten (the UI was lying)", () => {
    const tampered = structuredClone(doc);
    const mech = normalizeNodeMechanism(tampered.simulation.nodes["Earnings_78"]);
    tampered.simulation.nodes["Earnings_78"] = {
      ...mech,
      gate: { intercept: mech.gate!.intercept, coefficients: { ...mech.gate!.coefficients, In_program: 9.99 } }
    } as never;

    const after = reconcilePins(tampered).document;
    const got = normalizeNodeMechanism(after.simulation.nodes["Earnings_78"]).gate!.coefficients["In_program"]!;
    expect(got).not.toBeCloseTo(9.99, 3);                    // typed value gone
    const original = normalizeNodeMechanism(doc.simulation.nodes["Earnings_78"]).gate!.coefficients["In_program"]!;
    expect(got).toBeCloseTo(original, 6);                    // re-derived from the estimand
  });

  it("AUTHORED once no imposed effect covers the exposure — then you genuinely own γ", () => {
    const freed = structuredClone(doc);
    delete freed.metadata.imposedEffect;                      // drop the estimand; the edge stays authored
    expect(gateCoefficientState(freed, "Earnings_78", "In_program")).toBe("authored");

    // and now a typed γ survives a commit
    const mech = normalizeNodeMechanism(freed.simulation.nodes["Earnings_78"]);
    freed.simulation.nodes["Earnings_78"] = {
      ...mech,
      gate: { intercept: mech.gate!.intercept, coefficients: { ...mech.gate!.coefficients, In_program: 2.5 } }
    } as never;
    const after = reconcilePins(freed).document;
    expect(normalizeNodeMechanism(after.simulation.nodes["Earnings_78"]).gate!.coefficients["In_program"]).toBeCloseTo(2.5, 9);
  });

  it("moving the STORY moves γ — the legitimate way to change it", () => {
    const lo = reconcilePins(setImposedEffect(doc, { extensiveShare: 0.2 })).document;
    const hi = reconcilePins(setImposedEffect(doc, { extensiveShare: 0.8 })).document;
    const g = (d: typeof doc) => normalizeNodeMechanism(d.simulation.nodes["Earnings_78"]).gate!.coefficients["In_program"]!;
    expect(g(hi)).toBeGreaterThan(g(lo));
    expect(gateCoefficientState(lo, "Earnings_78", "In_program")).toBe("derived");
  });

  it("FITTING the exposure edge flips it out of derived (the trap) — engine stands down", () => {
    const edge = imposedEffectEdge(doc)!;
    const trapped = reconcilePins(pinNumber(doc, pinKeys.edge(edge.edgeId))).document;
    // The effect is now being LEARNED from data, so it is no longer imposed: the gate coef is fitted too.
    expect(gateCoefficientState(trapped, "Earnings_78", "In_program")).toBe("fitted");
  });

  it("returns not-learned for a non-two-part outcome (there is no gate)", () => {
    const additive = exampleDocument("lalonde-fit-recover")!;
    expect(gateCoefficientState(additive, "Earnings_78", "In_program")).toBe("not-learned");
  });
});
