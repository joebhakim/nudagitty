import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import { adjustmentOverlap, deriveAdjustmentSpec, positivityStatus } from "./longitudinal";

// Locks the positivity heuristic against its calibration anchors: a clean example must read "ok",
// the designed positivity showcase "warning" (weight blowup), and the LaLonde-PSID replay
// "violated" (common-support gap). The simulation is seeded, so these are stable.
describe("positivityStatus", () => {
  const verdict = (id: string) => {
    const doc = exampleDocument(id)!;
    const spec = deriveAdjustmentSpec(doc)!;
    const overlap = adjustmentOverlap(doc, spec)!;
    return positivityStatus(overlap);
  };

  it("clean overlap reads ok", () => {
    expect(verdict("lalonde-dgm-plasmode")).toBe("ok");
    expect(verdict("wg-dgm-copula")).toBe("ok");
  });

  it("the positivity showcase reads warning", () => {
    expect(verdict("wg-dgm-positivity")).toBe("warning");
  });

  it("the LaLonde-PSID replay reads violated", () => {
    expect(verdict("lalonde-recover-rct")).toBe("violated");
  });
});
