import { describe, expect, it } from "vitest";
import { EXAMPLES, exampleDocument } from "./examples";
import { runSimulation } from "./simulation";

describe("example catalog", () => {
  it("uses the classic example set and keeps Galton", () => {
    expect(EXAMPLES.map((example) => example.id)).toEqual([
      "simpson-severity",
      "front-door-smoking",
      "berkson-hospital",
      "birthweight-paradox",
      "instrumental-encouragement",
      "mediation-direct-total",
      "measurement-error-latent",
      "case-control-selection",
      "galton-regression"
    ]);
    expect(EXAMPLES.some((example) => example.id === "confounding-triangle")).toBe(false);
    expect(EXAMPLES.some((example) => example.id === "collider")).toBe(false);
    expect(EXAMPLES.some((example) => example.id === "mediator")).toBe(false);
    expect(EXAMPLES.some((example) => example.id === "selection")).toBe(false);
  });

  it("loads and simulates every example", () => {
    for (const example of EXAMPLES) {
      const document = exampleDocument(example.id);
      if (!document) throw new Error(`missing ${example.id}`);
      const result = runSimulation(document.graph, document.simulation);
      expect(result.diagnostics.some((message) => message.startsWith("Simulation disabled"))).toBe(false);
      expect(Object.keys(result.values).length).toBe(document.graph.nodes.length);
    }
  });
});
