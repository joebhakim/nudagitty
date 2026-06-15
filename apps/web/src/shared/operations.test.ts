import { describe, expect, it } from "vitest";
import { exampleDocument } from "@nudagitty/core";
import { applyOperation, deriveOperation } from "./operations";

describe("operation derive/apply on the cats collider", () => {
  it("round-trips every operation on Brought_to_vet", () => {
    const base = exampleDocument("cats-highrise-syndrome");
    if (!base) throw new Error("missing");
    // ships as a selection
    expect(deriveOperation(base, "Brought_to_vet")).toBe("select");

    const adjusted = applyOperation(base, "Brought_to_vet", "adjust");
    expect(deriveOperation(adjusted, "Brought_to_vet")).toBe("adjust");
    expect(adjusted.simulation.selections.Brought_to_vet).toBeUndefined();
    expect(adjusted.graph.nodes.find((n) => n.id === "Brought_to_vet")!.roles.adjusted).toBe(true);
    expect(adjusted.graph.nodes.find((n) => n.id === "Brought_to_vet")!.roles.selected).toBe(false);

    const conditioned = applyOperation(adjusted, "Brought_to_vet", "condition");
    expect(deriveOperation(conditioned, "Brought_to_vet")).toBe("condition");
    expect(conditioned.graph.nodes.find((n) => n.id === "Brought_to_vet")!.variable.adjustment.standardize).toBe(false);

    const intervened = applyOperation(conditioned, "Brought_to_vet", "intervene");
    expect(deriveOperation(intervened, "Brought_to_vet")).toBe("intervene");
    expect(intervened.simulation.overrides.Brought_to_vet).toBe(1);
    expect(intervened.graph.nodes.find((n) => n.id === "Brought_to_vet")!.roles.adjusted).toBe(false);

    const cleared = applyOperation(intervened, "Brought_to_vet", "none");
    expect(deriveOperation(cleared, "Brought_to_vet")).toBe("none");
    expect(cleared.simulation.overrides.Brought_to_vet).toBeUndefined();

    const reselected = applyOperation(cleared, "Brought_to_vet", "select");
    expect(deriveOperation(reselected, "Brought_to_vet")).toBe("select");
    expect(reselected.simulation.selections.Brought_to_vet?.values).toEqual([1]);
  });
});
