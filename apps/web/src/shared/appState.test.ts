import { describe, it, expect } from "vitest";
import { exampleDocument, normalizeNodeMechanism, normalizeEdgeMechanism } from "@nudagitty/core";
import { encodeCompactShareDocument, decodeCompactShareDocument, missingDatasets, shareDropsImportedData } from "./appState";

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
  "confounder-joint-copula"        // carries copulaBlocks (the dependence structure)
];

describe("compact share codec round-trip", () => {
  it.each(CASES)("%s survives encode -> decode -> encode unchanged", async (id) => {
    const doc = exampleDocument(id);
    expect(doc).toBeTruthy();

    const once = await encodeCompactShareDocument(doc!, id);
    const decoded = await decodeCompactShareDocument(once);
    expect(decoded).toBeTruthy();

    const twice = await encodeCompactShareDocument(decoded!.document, decoded!.activeExampleId);
    expect(twice).toBe(once);
  });

  // The codec deliberately rounds non-integers to 6 significant digits (fitted numbers are re-derived by
  // reconcilePins on load anyway). Assert values survive to THAT contract, not to float64 exactness.
  const closeToSixSigFigs = (actual: number, expected: number) =>
    expect(Math.abs(actual - expected) / Math.max(1e-12, Math.abs(expected))).toBeLessThan(1e-5);

  it("carries the fitted-DGP specifics: gate coefficient, authored provenance, imposed effect", async () => {
    const id = "lalonde-fit-recover-2part";
    const doc = exampleDocument(id)!;
    const decoded = (await decodeCompactShareDocument(await encodeCompactShareDocument(doc, id)))!.document;

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
    const edge = decoded.graph.edges.find((e: { source: string; target: string }) => e.source === "In_program" && e.target === "Earnings_78")!;
    const m = normalizeEdgeMechanism(decoded.simulation.edges[edge.id]);
    const m0 = normalizeEdgeMechanism(doc.simulation.edges[edge.id]);
    closeToSixSigFigs(m.kind === "linear" ? m.coefficient : NaN, m0.kind === "linear" ? m0.coefficient : NaN);
  });

  // REGRESSION: copula blocks had no key in CompactSimulation, so a shared copula/joint model arrived with
  // its dependence structure silently gone. The idempotence test above CANNOT catch this (encode dropped
  // them on both passes, so the payloads still matched) — it needs an explicit assertion.
  it("carries copula blocks (they used to be silently dropped)", async () => {
    const doc = exampleDocument("confounder-joint-copula")!;
    expect(doc.simulation.copulaBlocks?.length).toBeGreaterThan(0);
    const decoded = (await decodeCompactShareDocument(await encodeCompactShareDocument(doc, null)))!.document;
    expect(decoded.simulation.copulaBlocks?.length).toBe(doc.simulation.copulaBlocks!.length);
    expect(decoded.simulation.copulaBlocks).toEqual(doc.simulation.copulaBlocks);
  });

  // A shared imported-data link arrives with its table_lookup columns resolving to nothing. That used to be
  // silent (empty columns, a meaningless fit); it must now be detectable so the UI can ask for a re-upload.
  it("detects a dataset the link could not carry", () => {
    // built-in data is always registered -> nothing missing
    const builtin = exampleDocument("lalonde-fit-recover-2part")!;
    expect(missingDatasets(builtin)).toEqual([]);
    expect(shareDropsImportedData(builtin)).toBe(false);

    // simulate what a recipient sees: the same model pointed at an imported table that isn't registered
    const shared = exampleDocument("lalonde-fit-recover-2part")!;
    for (const edge of shared.graph.edges) {
      const m = shared.simulation.edges[edge.id];
      if (m && m.kind === "table_lookup") shared.simulation.edges[edge.id] = { ...m, dataset: "user-data" };
    }
    expect(missingDatasets(shared)).toEqual(["user-data"]);
  });

  // BACK-COMPAT: links shared before compression are plain JSON (their first decoded byte is `{`), and the
  // decoder sniffs that instead of blindly inflating. If this breaks, every link anyone has ever shared dies.
  it("still decodes a legacy uncompressed v2 link", async () => {
    const legacy = {
      v: 2,
      t: "Legacy model",
      n: [{ i: "A", x: 0, y: 0, r: "e" }, { i: "B", x: 120, y: 0, r: "o" }],
      e: [{ s: "A", t: "B" }]
    };
    const bytes = new TextEncoder().encode(JSON.stringify(legacy));
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const uncompressed = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

    const decoded = await decodeCompactShareDocument(uncompressed);
    expect(decoded).toBeTruthy();
    expect(decoded!.document.graph.nodes.map((n) => n.id)).toEqual(["A", "B"]);
    expect(decoded!.document.graph.edges.length).toBe(1);
    expect(decoded!.document.title).toBe("Legacy model");
  });

  it("actually compresses (the whole point)", async () => {
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    const encoded = await encodeCompactShareDocument(doc, null);
    // uncompressed this payload was ~8,034 b64 chars (and ~9,828 before the slimming).
    expect(encoded.length).toBeLessThan(3000);
    expect(await decodeCompactShareDocument(encoded)).toBeTruthy();
  });

  it("never rounds integers (the seed would be corrupted)", async () => {
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    expect(Number.isInteger(doc.simulation.seed)).toBe(true);
    const decoded = (await decodeCompactShareDocument(await encodeCompactShareDocument(doc, null)))!.document;
    // 2640834105 rounded to 6 significant digits would be 2640830000 — an entirely different RNG stream.
    expect(decoded.simulation.seed).toBe(doc.simulation.seed);
  });

  it("preserves a non-default seed and a non-linear edge mechanism kind", async () => {
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    const decoded = (await decodeCompactShareDocument(await encodeCompactShareDocument(doc, null)))!.document;
    expect(decoded.simulation.seed).toBe(doc.simulation.seed);
    // the plasmode row-source edges are table_lookup, not linear — the kind must survive
    const lookup = decoded.graph.edges.find((e) => e.source === "Row_source" && e.target === "Age")!;
    expect(normalizeEdgeMechanism(decoded.simulation.edges[lookup.id]).kind).toBe("table_lookup");
  });
});
