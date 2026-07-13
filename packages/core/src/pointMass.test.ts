import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import {
  addEdge, addPointMassIndicator, familyWarnings, findPointMassColumn, lookupDataset, normalizeEdgeMechanism,
  normalizeVariableModel, pinNodeEquation, pointMassCandidate, pointMassShare, reconcilePins, runSimulation,
  withGraph, withPointMassIndicator
} from "./index";
import type { GraphDocument } from "./types";

const coefOf = (doc: GraphDocument, s: string, t: string) => {
  const e = doc.graph.edges.find((x) => x.source === s && x.target === t);
  const m = e ? normalizeEdgeMechanism(doc.simulation.edges[e.id]) : null;
  return m && m.kind === "linear" ? m.coefficient : Number.NaN;
};

describe("the point-mass indicator — the one derived column we build", () => {
  it("u74/u75 are canonical LaLonde columns and ship with the embedded dataset", () => {
    // Not an embellishment: DW 1999/2002, Smith-Todd, Diamond-Sekhon, Imbens 2015, Imbens-Xu 2024 and the
    // R `Matching::lalonde` dataset all carry them. APPENDED, so every existing column index is unchanged.
    const ds = lookupDataset("lalonde-obs")!;
    expect(ds.columns.slice(0, 10)).toEqual(["age", "education", "black", "hispanic", "married", "nodegree", "re74", "re75", "treat", "re78"]);
    expect(ds.columns.slice(10)).toEqual(["u74", "u75"]);
    expect(pointMassShare(ds, "re74")).toBeCloseTo(0.129, 2);

    // and the derived column really is 1(re74 == 0), row for row
    const i74 = ds.columns.indexOf("re74"), iu74 = ds.columns.indexOf("u74");
    for (const row of ds.rows) expect(row[iu74]).toBe(row[i74] === 0 ? 1 : 0);
  });

  it("is idempotent, and declines a column that is already binary", () => {
    const ds = lookupDataset("lalonde-obs")!;
    expect(withPointMassIndicator(ds, "re74", { name: "u74" })).toBe(ds);   // already there ⇒ unchanged
    // (lalonde-fit-recover is the ADDITIVE example — it does not ship the indicators, so it is the right
    // doc to test the offer on. lalonde-fit-recover-2part now wires u74/u75 itself.)
    const doc = exampleDocument("lalonde-fit-recover")!;
    expect(pointMassCandidate(doc, "Black")).toBeNull();                     // 0/1 already — nothing to indicate
    expect(pointMassCandidate(doc, "Age")).toBeNull();                       // no mass at zero
    expect(pointMassCandidate(exampleDocument("lalonde-fit-recover-2part")!, "Earnings_74")).toBeNull();  // already wired
  });

  it("offers itself on a predictor with a genuine point mass", () => {
    const doc = exampleDocument("lalonde-fit-recover")!;
    const cand = pointMassCandidate(doc, "Earnings_74")!;
    expect(cand.column).toBe("re74");
    expect(cand.share).toBeCloseTo(0.129, 2);
  });

  it("reuses the dataset's OWN indicator column, matched by value not by name", () => {
    // LaLonde's is called `u74`, not `re74_is_zero`. Matching on the name would silently create a duplicate
    // column carrying identical data — so we match on the DATA.
    const ds = lookupDataset("lalonde-obs")!;
    expect(findPointMassColumn(ds, "re74")).toBe("u74");
    expect(findPointMassColumn(ds, "re75")).toBe("u75");
    expect(findPointMassColumn(ds, "age")).toBeNull();

    const doc = addPointMassIndicator(exampleDocument("lalonde-fit-recover")!, "Earnings_74");
    const lookup = doc.graph.edges.find((e) => e.target === "Earnings_74_is_zero")!;
    const mech = normalizeEdgeMechanism(doc.simulation.edges[lookup.id]);
    expect(mech.kind === "table_lookup" && mech.dataColumn).toBe(ds.columns.indexOf("u74"));
    // no duplicate column was invented
    expect(lookupDataset("lalonde-obs")!.columns.filter((c) => c.startsWith("re74"))).toEqual(["re74"]);
  });

  it("stops offering itself once a node actually READS the indicator", () => {
    // An unused column in the dataset helps nobody — the offer stands until a NODE is wired to it.
    const before = exampleDocument("lalonde-fit-recover")!;
    expect(pointMassCandidate(before, "Earnings_74")).not.toBeNull();   // u74 exists, but nothing reads it
    const after = addPointMassIndicator(before, "Earnings_74");
    expect(pointMassCandidate(after, "Earnings_74")).toBeNull();        // now it does
  });

  it("does NOT nag a plasmode covariate about its family — a node replaying its column IS the data", () => {
    // Earnings_74 does not generate; it reads. Its declared family is never consulted, so it cannot be
    // wrong. Warning about it was a false positive that fired on every zero-inflated covariate.
    const doc = exampleDocument("lalonde-fit-recover")!;
    const kinds = familyWarnings(doc, "Earnings_74").map((w) => w.kind);
    expect(kinds).toEqual(["point-mass-predictor-needs-indicator"]);    // the representation rule, and ONLY that
  });

  it("creates a NODE, unwired — the user decides what it causes", () => {
    // It is a node and not a hidden basis term because it is a different causal CONSTRUCT: "was this person
    // employed in 1974?" can have different parents and children from "how much did they earn in 1974?".
    const doc = addPointMassIndicator(exampleDocument("lalonde-fit-recover")!, "Earnings_74");
    const node = doc.graph.nodes.find((n) => n.id === "Earnings_74_is_zero")!;
    expect(node).toBeDefined();
    expect(normalizeVariableModel(node.variable).valueType).toBe("binary");
    expect(node.label).toBe("no earnings '74");
    expect(node.roles.exposure).toBe(false);
    expect(node.roles.outcome).toBe(false);

    // read from the SAME row-source as the column it indicates
    const lookup = doc.graph.edges.find((e) => e.target === "Earnings_74_is_zero")!;
    const mech = normalizeEdgeMechanism(doc.simulation.edges[lookup.id]);
    expect(mech.kind).toBe("table_lookup");
    expect(lookup.source).toBe("Row_source");

    // …and it arrives with NO outgoing edges. It does not silently join any model.
    expect(doc.graph.edges.filter((e) => e.source === "Earnings_74_is_zero")).toHaveLength(0);
    // simulating it reproduces the indicator: the share of drawn rows with re74 == 0 (a resample of the
    // 12.9% in the data, so it wobbles a little with the example's sample size).
    const y = runSimulation(doc.graph, doc.simulation).nodeStates["Earnings_74_is_zero"]!.empirical;
    expect(y.mean!).toBeCloseTo(0.13, 1);
  });

  it("REPRODUCES THE LITERATURE: the indicator carries the selection signal, the dollars carry none", () => {
    // Smith & Todd (2005) Table 3, Dehejia-Wahba logit on LaLonde:
    //     1(re74 == 0)      1.9368 (CPS)   3.2583 (PSID)
    //     re74, in dollars  -0.00007       -0.00002
    // The step at zero is worth 7x-26x in the odds; the slope in dollars is nil. This is the fact that no
    // smooth transform of re74 — log, sqrt, polynomial, asinh — can express, and the reason this primitive
    // exists at all. See docs/lalonde-specification.md and docs/scope-boundary.md.
    let doc = addPointMassIndicator(exampleDocument("lalonde-fit-recover")!, "Earnings_74");
    doc = withGraph(doc, addEdge(doc.graph, "Earnings_74_is_zero", "In_program", "directed"));
    doc = reconcilePins(pinNodeEquation(doc, "In_program")).document;

    const indicator = coefOf(doc, "Earnings_74_is_zero", "In_program");
    const dollars = coefOf(doc, "Earnings_74", "In_program");
    expect(indicator).toBeGreaterThan(1.5);            // measured: +2.60 — squarely in Smith-Todd's range
    expect(indicator).toBeLessThan(4);
    expect(Math.abs(dollars)).toBeLessThan(1e-3);      // measured: −1.7e-5 — nil, as in the literature
    // the point mass is worth ORDERS OF MAGNITUDE more than the amount, per unit of information
    expect(Math.abs(indicator)).toBeGreaterThan(1000 * Math.abs(dollars));
  });
});
