import { describe, it, expect } from "vitest";
import { exampleDocument, normalizeNodeMechanism, normalizeEdgeMechanism } from "@nudagitty/core";
import { encodeCompactShareDocument, decodeCompactShareDocument } from "./appState";

// `appState.ts` (the whole share codec) had NO unit test — only an E2E that checks which hash key is used
// and never round-trips a decode. This is the safety net for shrinking the payload: anything the encoder
// drops or mangles has to show up here.
//
// The core property is IDEMPOTENCE: decode(encode(doc)) must re-encode to the exact same payload. That
// proves the compact form loses nothing, without having to fight the fact that decode normalizes/reconciles
// (so the decoded document is not byte-identical to the input — it's the normalized fixed point of it).
const CASES = [
  "simpson-severity",              // plain, small
  "lalonde-fit-recover-2part",     // fitted DGP: pins + authored + a two-part gate + imposedEffect
  "wg-dgm-copula"                  // copula blocks
];

describe("compact share codec round-trip", () => {
  it.each(CASES)("%s survives encode -> decode -> encode unchanged", (id) => {
    const doc = exampleDocument(id);
    expect(doc).toBeTruthy();

    const once = encodeCompactShareDocument(doc!, id);
    const decoded = decodeCompactShareDocument(once);
    expect(decoded).toBeTruthy();

    const twice = encodeCompactShareDocument(decoded!.document, decoded!.activeExampleId);
    expect(twice).toBe(once);
  });

  // The codec deliberately rounds non-integers to 6 significant digits (fitted numbers are re-derived by
  // reconcilePins on load anyway). Assert values survive to THAT contract, not to float64 exactness.
  const closeToSixSigFigs = (actual: number, expected: number) =>
    expect(Math.abs(actual - expected) / Math.max(1e-12, Math.abs(expected))).toBeLessThan(1e-5);

  it("carries the fitted-DGP specifics: gate coefficient, authored provenance, imposed effect", () => {
    const id = "lalonde-fit-recover-2part";
    const doc = exampleDocument(id)!;
    const decoded = decodeCompactShareDocument(encodeCompactShareDocument(doc, id))!.document;

    // the two-part gate (a nested object the default-stripper must not flatten away)
    const gate = normalizeNodeMechanism(decoded.simulation.nodes["Earnings_78"]).gate;
    const original = normalizeNodeMechanism(doc.simulation.nodes["Earnings_78"]).gate;
    expect(gate).toBeTruthy();
    closeToSixSigFigs(gate!.coefficients["In_program"]!, original!.coefficients["In_program"]!);
    closeToSixSigFigs(gate!.intercept, original!.intercept);

    // provenance + the imposed truth (an integer — must NOT be touched by the rounder)
    expect(decoded.metadata.authored).toEqual(doc.metadata.authored);
    expect(decoded.metadata.pins.length).toBe(doc.metadata.pins.length);
    expect(decoded.metadata.imposedEffect).toBe(1794);

    // the authored treatment effect (delta) on the intensive margin
    const edge = decoded.graph.edges.find((e) => e.source === "In_program" && e.target === "Earnings_78")!;
    const m = normalizeEdgeMechanism(decoded.simulation.edges[edge.id]);
    const m0 = normalizeEdgeMechanism(doc.simulation.edges[edge.id]);
    closeToSixSigFigs(m.kind === "linear" ? m.coefficient : NaN, m0.kind === "linear" ? m0.coefficient : NaN);
  });

  it("never rounds integers (the seed would be corrupted)", () => {
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    expect(Number.isInteger(doc.simulation.seed)).toBe(true);
    const decoded = decodeCompactShareDocument(encodeCompactShareDocument(doc, null))!.document;
    // 2640834105 rounded to 6 significant digits would be 2640830000 — an entirely different RNG stream.
    expect(decoded.simulation.seed).toBe(doc.simulation.seed);
  });

  it("preserves a non-default seed and a non-linear edge mechanism kind", () => {
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    const decoded = decodeCompactShareDocument(encodeCompactShareDocument(doc, null))!.document;
    expect(decoded.simulation.seed).toBe(doc.simulation.seed);
    // the plasmode row-source edges are table_lookup, not linear — the kind must survive
    const lookup = decoded.graph.edges.find((e) => e.source === "Row_source" && e.target === "Age")!;
    expect(normalizeEdgeMechanism(decoded.simulation.edges[lookup.id]).kind).toBe("table_lookup");
  });
});
