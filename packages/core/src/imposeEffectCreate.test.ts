import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import {
  clearImposedEffect, dataImpliedEffect, imposableEffect, imposeEffect, imposedEffectContext,
  normalizeNodeMechanism, pinKeys, pinNumber, reconcilePins, runSimulation, setVariable, suggestImposedShare
} from "./index";
import type { GraphDocument } from "./types";

const EXPOSURE = "In_program", OUTCOME = "Earnings_78";
const effectEdgeId = (d: GraphDocument) =>
  d.graph.edges.find((e) => e.source === EXPOSURE && e.target === OUTCOME && e.kind === "directed")!.id;

/**
 * The state the user's failed replication was ACTUALLY in: a fitted DGP whose effect edge is fitted too.
 * That is not a bug in their clicking — it is the obvious thing to do, and it is what the app offered. The
 * result is a DGP whose "truth" is the confounded-adjusted association, so every estimator that adjusts
 * "recovers" it and the benchmark is circular. This is the doc `imposeEffect` has to rescue.
 */
function trapped(): GraphDocument {
  const doc = clearImposedEffect(exampleDocument("lalonde-fit-recover-2part")!);
  return reconcilePins(pinNumber(doc, pinKeys.edge(effectEdgeId(doc)))).document;
}

// The do()-contrast off the ENGINE — the only number that settles what the DGP actually carries. The gate is
// a per-row Bernoulli draw, so this is Monte-Carlo: across seeds it sits at 1794 with sd ≈ 65 (n = 2675 rows,
// earnings are heavy-tailed). Hence the wide band below — the EXACT check is the algebraic one beside it.
function simulatedAte(doc: GraphDocument, seed = 7): number {
  const at = (v: number) =>
    runSimulation(doc.graph, { ...doc.simulation, seed, overrides: { [EXPOSURE]: v } })
      .nodeStates[OUTCOME]!.empirical.mean ?? Number.NaN;
  return at(1) - at(0);
}

// What the DGP carries by construction, read off the two coefficients that encode it. No sampling.
function algebraicAte(doc: GraphDocument): number {
  const gamma = normalizeNodeMechanism(doc.simulation.nodes[OUTCOME]).gate!.coefficients[EXPOSURE]!;
  const delta = doc.simulation.edges[effectEdgeId(doc)]!.coefficient!;
  return imposedEffectContext(doc)!.decompose(gamma, delta).ate;
}

describe("imposeEffect — the create path", () => {
  it("the trap is real: FITTING the effect edge builds a DGP that carries a large NEGATIVE effect", () => {
    const doc = trapped();
    const coef = doc.simulation.edges[effectEdgeId(doc)]!.coefficient!;
    // ≈ −$5,259 per worker. The intensive margin is now on the IDENTITY link, so the fitted effect
    // coefficient is a DOLLAR amount, and fitting it hands the DGP a large NEGATIVE causal effect.
    expect(coef).toBeLessThan(-1000);      // ≈ −$5,259 — δ is in DOLLARS on this link
    // …so the DGP's "true" ATE comes out at ≈ −$700 when it should be +$1,794: still SIGN-FLIPPED, ~$2,500
    // out. (It was < −$3,000 when the confounder surface was badly specified; a better-specified surface
    // absorbs more of the association, so the trap is less lurid. It is still a trap: the benchmark carries
    // a NEGATIVE truth, and every estimator that "recovers" it is recovering the bias.)
    const trap = simulatedAte(doc);
    expect(trap).toBeLessThan(0);                           // ≈ −$3,527: still SIGN-FLIPPED against a true +$1,794
    expect(Math.abs(trap - 1794)).toBeGreaterThan(4000);
  });

  it("the trapped edge is offerable — and imposing rescues it to exactly +$1,794", () => {
    const doc = trapped();
    expect(imposableEffect(doc, effectEdgeId(doc))).toEqual({ exposure: EXPOSURE, outcome: OUTCOME, family: "two_part" });

    const imposed = reconcilePins(imposeEffect(doc, { exposure: EXPOSURE, outcome: OUTCOME, target: 1794 })).document;
    expect(algebraicAte(imposed)).toBeCloseTo(1794, 4);        // by construction (to the solver's tolerance)
    expect(simulatedAte(imposed)).toBeGreaterThan(1794 - 260); // and the generator agrees, within ~4σ of MC
    expect(simulatedAte(imposed)).toBeLessThan(1794 + 260);
  });

  it("imposing AUTHORS the effect edge — a pinned edge means 'learn it from data', which is the circularity", () => {
    const doc = trapped();
    const key = pinKeys.edge(effectEdgeId(doc));
    expect(doc.metadata.pins).toContain(key);

    const imposed = imposeEffect(doc, { exposure: EXPOSURE, outcome: OUTCOME, target: 1794 });
    expect(imposed.metadata.pins).not.toContain(key);
    expect(imposed.metadata.authored).toContain(key);
  });

  it("no second estimand: once one edge is imposed, no edge is a candidate", () => {
    const imposed = imposeEffect(trapped(), { exposure: EXPOSURE, outcome: OUTCOME, target: 1794 });
    for (const edge of imposed.graph.edges) expect(imposableEffect(imposed, edge.id)).toBeNull();
  });

  it("the family decides whether there is a split at all", () => {
    const additive = clearImposedEffect(exampleDocument("lalonde-fit-recover")!);
    expect(imposableEffect(additive, effectEdgeId(additive))!.family).toBe("additive");

    // …and an additive impose needs no share, because the coefficient IS the ATE.
    const imposed = reconcilePins(imposeEffect(additive, { exposure: EXPOSURE, outcome: OUTCOME, target: 1794 })).document;
    expect(imposed.metadata.imposedEffect!.extensiveShare).toBeUndefined();
    expect(imposed.simulation.edges[effectEdgeId(imposed)]!.coefficient).toBeCloseTo(1794, 4);
  });
});

describe("dataImpliedEffect — what the data can and cannot tell you about the SHAPE", () => {
  const fitted = exampleDocument("lalonde-fit-recover-2part")!;

  it("the two margins FIGHT, so the full split is meaningless", () => {
    const d = dataImpliedEffect(fitted, EXPOSURE, OUTCOME)!;
    expect(d.gamma).toBeGreaterThan(0);     // employment: UP. right sign.
    expect(d.delta).toBeLessThan(-0.3);     // pay: DOWN 36%. badly confounded — this IS the LaLonde finding.
    expect(d.extensive).toBeGreaterThan(0);
    expect(d.intensive).toBeLessThan(0);
    expect(d.ate).toBeLessThan(0);          // the adjusted "estimate" is −$8.4k against a true +$1.8k
    expect(d.extensiveShare).toBeNull();    // ⇒ no story. The UI must not invent one.
  });

  it("…so the suggestion adopts the gate and SOLVES the amount for your target", () => {
    const s = suggestImposedShare(fitted, EXPOSURE, OUTCOME, 1794);
    expect(s.basis).toBe("gate-only");
    expect(s.share).toBeCloseTo(0.619, 2);  // 62% extensive — and now the data AGREES with the example
    expect(s.clamped).toBe(false);
    expect(s.share).toBeLessThan(imposedEffectContext(fitted)!.maxExtensiveShare);
  });

  it("the shape is a suggestion; the TARGET is not — the estimand still lands exactly", () => {
    const doc = reconcilePins(imposeEffect(trapped(), { exposure: EXPOSURE, outcome: OUTCOME, target: 1794 })).document;
    const share = doc.metadata.imposedEffect!.extensiveShare!;
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.8);        // gate-derived

    const sol = imposedEffectContext(doc)!.solve(share);
    expect(sol.extensive + sol.intensive).toBeCloseTo(1794, 4);
  });

  it("no zeros ⇒ no gate ⇒ nothing to say", () => {
    const positive = structuredClone(exampleDocument("lalonde-fit-recover-2part")!);
    setVariable(positive, OUTCOME, { valueType: "positive" });
    expect(dataImpliedEffect(positive, EXPOSURE, OUTCOME)).toBeNull();
    expect(suggestImposedShare(positive, EXPOSURE, OUTCOME, 1794).basis).toBe("none");
  });
});

describe("clearImposedEffect", () => {
  it("hands the coefficients back to you at the values they were last derived to", () => {
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    const id = effectEdgeId(doc);
    const before = doc.simulation.edges[id]!.coefficient!;

    const cleared = reconcilePins(clearImposedEffect(doc)).document;
    expect(cleared.metadata.imposedEffect).toBeUndefined();
    expect(cleared.simulation.edges[id]!.coefficient).toBeCloseTo(before, 9);  // kept, not reset
    expect(cleared.metadata.authored).toContain(pinKeys.edge(id));             // and now genuinely yours
  });
});
