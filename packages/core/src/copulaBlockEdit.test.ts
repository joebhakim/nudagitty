import { describe, expect, it } from "vitest";
import { withCoupling, withoutCoupling, blockCouplings, couplingOrder } from "./copulaBlockEdit";
import { simpleEdge } from "./copulaVine";
import type { CopulaBlock } from "./types";

const g = simpleEdge("gaussian", 0.4);
const ids = ["A", "B", "C", "D"];
const pairs = (block: CopulaBlock) => blockCouplings(block).map((c) => [c.a, c.b].sort().join("")).sort();

describe("copulaBlockEdit — draw/delete couplings", () => {
  it("draws the first coupling into a fresh block", () => {
    const r = withCoupling(null, ids, "A", "C", g);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.block.nodes).toEqual(ids);
    expect(r.block.depth).toBe(1);
    // A and C must be adjacent in the order
    const pos = (id: string) => r.block.order.indexOf(ids.indexOf(id));
    expect(Math.abs(pos("A") - pos("C"))).toBe(1);
    expect(pairs(r.block)).toEqual(["AC"]);
  });

  it("chains couplings that form a path (A–B, B–C, C–D)", () => {
    let block: CopulaBlock | null = null;
    for (const [a, b] of [["A", "B"], ["B", "C"], ["C", "D"]] as const) {
      const r = withCoupling(block, ids, a, b, g);
      expect(r.ok).toBe(true);
      if (r.ok) block = r.block;
    }
    expect(pairs(block!)).toEqual(["AB", "BC", "CD"]);
    // the order is a Hamiltonian path A-B-C-D (or its reverse)
    expect(couplingOrder(ids, blockCouplings(block!))).not.toBeNull();
  });

  it("rejects a coupling that gives a node 3 neighbours (not a D-vine path)", () => {
    let block: CopulaBlock | null = null;
    for (const [a, b] of [["A", "B"], ["A", "C"]] as const) {
      const r = withCoupling(block, ids, a, b, g);
      expect(r.ok).toBe(true);
      if (r.ok) block = r.block;
    }
    const bad = withCoupling(block, ids, "A", "D", g); // A would have 3 couplings
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toMatch(/3\+|D-vine|Joint Lab/);
  });

  it("rejects a cycle (A–B, B–C, C–A)", () => {
    expect(couplingOrder(["A", "B", "C"], [{ a: "A", b: "B" }, { a: "B", b: "C" }, { a: "C", b: "A" }])).toBeNull();
  });

  it("removing a coupling rebuilds; emptying drops the block", () => {
    let block = (withCoupling(null, ids, "A", "B", g) as { ok: true; block: CopulaBlock }).block;
    block = (withCoupling(block, ids, "C", "D", g) as { ok: true; block: CopulaBlock }).block;
    expect(pairs(block).length).toBe(2);
    const after = withoutCoupling(block, ids, "A", "B");
    expect(after).not.toBeNull();
    expect(pairs(after!)).toEqual(["CD"]);
    expect(withoutCoupling(after!, ids, "C", "D")).toBeNull(); // last one → drop the block
  });

  it("preserves an existing coupling's copula when a second is drawn", () => {
    const strong = simpleEdge("clayton", 0.7, 90);
    let block = (withCoupling(null, ids, "A", "B", strong) as { ok: true; block: CopulaBlock }).block;
    block = (withCoupling(block, ids, "C", "D", g) as { ok: true; block: CopulaBlock }).block;
    const ab = blockCouplings(block).find((c) => [c.a, c.b].sort().join("") === "AB")!;
    expect(ab.edge.components[0]!.family).toBe("clayton");
    expect(ab.edge.components[0]!.rotation).toBe(90);
  });
});
