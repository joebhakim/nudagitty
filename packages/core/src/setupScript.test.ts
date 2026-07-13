import { describe, it, expect } from "vitest";
import { EXAMPLES, exampleDocument } from "./examples";
import { analyzeSetup, setupScript, SETUP_GLYPHS as G } from "./setupScript";

/**
 * THE SETUP SCRIPT — one dense, pasteable glyph block per configuration.
 *
 * The `struct` row is the only one DERIVED from the DAG rather than declared, so it is the only one that can
 * DISAGREE with you. These tests are mostly about that disagreement being right.
 */
const of = (id: string) => analyzeSetup(exampleDocument(id)!);
const cellOf = (id: string, node: string, row: Parameters<typeof rowKey>[0]) =>
  of(id).nodes.find((n) => n.id === node)!.cells[row];
const rowKey = (r: "struct" | "family" | "link" | "ownI" | "ownB" | "adj" | "sel" | "seen" | "estimand") => r;

describe("setupScript renders every example without throwing", () => {
  it("EMPTY ROWS ARE DROPPED — the script shows only the axes a setup actually uses", () => {
    // galton-regression declares no exposure and no outcome, so `estimand` is blank end to end and vanishes.
    // A 3-node toy stays short; a plasmode benchmark grows. The alternative — padding every script with rows
    // of blanks — would make the dense mode unreadable and dishonest about what is being used.
    expect(setupScript(exampleDocument("galton-regression")!)).not.toContain("estimand");
    expect(setupScript(exampleDocument("lalonde-fit-recover-2part")!)).toContain("estimand");
    // …and the rows that only some setups need appear only there.
    expect(setupScript(exampleDocument("berkson-hospital")!)).toContain("selected");
    expect(setupScript(exampleDocument("tutoring-scores")!)).not.toContain("selected");
    expect(setupScript(exampleDocument("confounder-joint-copula")!)).toContain("coupled");
    expect(setupScript(exampleDocument("tutoring-scores")!)).not.toContain("coupled");
  }, 60000);

  it("all 70 of them", () => {
    for (const ex of EXAMPLES) {
      const doc = exampleDocument(ex.id);
      expect(doc, ex.id).toBeTruthy();
      const text = setupScript(doc!);
      expect(text, ex.id).toContain("┌");        // it renders a grid
      expect(text, ex.id).toContain("intercept"); // …and provenance is never absent
      expect(text, ex.id).toContain("keys");
    }
  }, 120000);

  it("every column is exactly as wide as its header — the grid must survive a paste", () => {
    // The whole point of the glyph is that it holds its columns in a monospace context. A label wider than
    // its group silently shoves every column right of it, so this is not cosmetic.
    for (const ex of EXAMPLES.slice(0, 20)) {
      const lines = setupScript(exampleDocument(ex.id)!).split("\n").filter((l) => l.includes("│"));
      const widths = new Set(lines.map((l) => [...l].length));
      expect(widths.size, `${ex.id} — ragged rows: ${[...widths].join(",")}`).toBe(1);
    }
  }, 120000);
});

describe("the derived structure disagrees with the author — correctly", () => {
  it("LaLonde: only 7 of the 10 'confounders' actually confound", () => {
    // The DGP gives black and hispanic NO path to treatment, so adjusting for them buys nothing; married
    // predicts the outcome only, which is precision, not confounding. Dehejia-Wahba's propensity model
    // includes black and hispanic — a real, small fidelity gap in our example that nobody had noticed until
    // the glyph derived it.
    const s = of("lalonde-fit-recover-2part");
    const struct = (n: string) => s.nodes.find((x) => x.id === n)!.cells.struct;
    for (const n of ["Age", "Education", "No_degree", "Earnings_74", "Earnings_75",
                     "Earnings_74_is_zero", "Earnings_75_is_zero"]) {
      expect(struct(n), n).toBe(G.confounder);          // ∧ — a genuine fork
    }
    expect(struct("Black")).toBe(G.inert);              // ø — on no path at all
    expect(struct("Hispanic")).toBe(G.inert);           // ø
    expect(struct("Married")).toBe(G.precision);        // ↓ — predicts Y only
    expect(s.warnings.filter((w) => w.startsWith("Black") || w.startsWith("Hispanic"))).toHaveLength(2);
  }, 60000);

  it("M-BIAS: a collider on NO path between T and Y still manufactures bias when conditioned on", () => {
    // The case a position-only walk gets wrong, and the reason this asks d-separation instead. The collider
    // sits outside every T–Y path — so "where is it?" says harmless — yet conditioning on it opens a backdoor
    // through two unmeasured causes.
    const s = of("m-bias-adjustment");
    const c = s.nodes.find((n) => n.id === "Collider_score")!;
    expect(c.cells.struct).toBe(G.collider);            // ∨ — promoted by the d-separation check
    expect(c.cells.adj).toBe(G.adjusted);               // | — and you conditioned on it
    expect(s.warnings.join(" ")).toContain("OPENS a biasing path");
    expect(s.notes.join(" ")).toContain("not on any path");   // …and BOTH are true. That is M-bias.
  }, 60000);

  it("finds the point of each teaching example without being told what it is", () => {
    expect(of("berkson-hospital").warnings.join(" ")).toContain("OPENS a biasing path");   // by SELECTION
    expect(of("front-door-smoking").warnings.join(" ")).toContain("MEDIATOR");
    expect(of("bias-amplification-z").warnings.join(" ")).toContain("AMPLIFIES bias");
    expect(of("john-snow-cholera").warnings.join(" ")).toContain("UNMEASURED CONFOUNDER");
  }, 60000);

  it("the plasmode row-source is a latent common cause — and that is NOT a warning", () => {
    // It IS an unmeasured confounder of everything, structurally. But that is precisely its job: it is the
    // shared hidden cause that reproduces the real joint, and its children are the observed covariates. So
    // the check suppresses it when the node is plumbing — otherwise every plasmode would scream.
    const s = of("lalonde-fit-recover-2part");
    const row = s.nodes.find((n) => n.id === "Row_source")!;
    expect(row.cells.struct).toBe(G.confounder);
    expect(row.cells.seen).toBe(G.unmeasured);
    expect(row.cells.ownI).toBe(G.plumbing);
    expect(s.warnings.some((w) => w.startsWith("Row_source"))).toBe(false);
  }, 60000);
});

describe("the glyphs say what they mean", () => {
  it("the family glyph IS the support", () => {
    expect(cellOf("lalonde-fit-recover-2part", "Earnings_78", rowKey("family"))).toBe(G.twopart);  // ≥ zero or more
    expect(cellOf("lalonde-fit-recover-2part", "In_program", rowKey("family"))).toBe(G.binary);    // ½
    expect(cellOf("tutoring-scores", "Test_score", rowKey("family"))).toBe(G.continuous);          // ∼
  }, 60000);

  it("owner is INK, and it is PER NUMBER — the one authored cell is the whole benchmark", () => {
    const toy = of("tutoring-scores");
    expect(toy.nodes.every((n) => n.cells.ownI === G.authored)).toBe(true);   // every number is yours

    const lal = of("lalonde-fit-recover-2part");
    const ink = lal.nodes.map((n) => n.cells.ownI);
    expect(ink.filter((i) => i === G.fromData).length).toBe(10);   // the data wrote the covariates' intercepts
    expect(ink.filter((i) => i === G.fitted).length).toBe(2);      // the fit wrote treat + outcome
    expect(lal.effectOwner).toBe("authored");                      // …and YOU wrote the effect

    // …and THIS is why provenance had to split. Of 63 numbers exactly ONE is authored — the effect edge —
    // and it lives in the outcome's COEFFICIENTS. A single glyph per node could not show it.
    const outcome = lal.nodes.find((n) => n.id === "Earnings_78")!;
    expect(outcome.cells.ownI).toBe(G.fitted);      // its intercept: learned from the data
    expect(outcome.cells.ownN).toBe(G.fitted);      // its noise:     learned from the data
    expect(outcome.cells.ownB).toBe(G.authored);    // its COEFFICIENTS: one of them is the imposed truth
  }, 60000);

  it("SELECTION is its own row — the act you cannot undo", () => {
    // 15 of the 70 examples restrict the sample, and every one of them was invisible before this row.
    const berk = of("berkson-hospital");
    const h = berk.nodes.find((n) => n.id === "Hospitalized")!;
    expect(h.cells.sel).toBe(G.selected);                          // ⊂ — you kept a SUBSET
    expect(berk.warnings.join(" ")).toContain("cannot undo");
  }, 60000);
});
