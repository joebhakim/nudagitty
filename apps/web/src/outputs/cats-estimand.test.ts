import { describe, expect, it } from "vitest";
import { analyzeGraph, exampleDocument, runSimulation } from "@nudagitty/core";
import { computeCompletedOutput } from "./modules";

describe("cats card estimand + bad control", () => {
  it("surfaces the select estimand and the collider verdict", () => {
    const document = exampleDocument("cats-highrise-syndrome");
    if (!document) throw new Error("missing");
    const simulation = runSimulation(document.graph, document.simulation);
    const analysis = analyzeGraph(document.graph);
    const computed = computeCompletedOutput({ analysis, document, simulation }, "cats-highrise-syndrome");
    const result = computed?.result as { bullets: Array<{ label: string; text: string }> } | undefined;
    if (!result) throw new Error("no result");
    const byLabel = Object.fromEntries(result.bullets.map((b) => [b.label, b.text]));
    // Node-name ids are normalized to spaces and the formula is spaced for the chip renderer.
    expect(byLabel.Estimand).toContain("P( Survival | fall height, Brought to vet = 1 )");
    expect(byLabel["Bad control"]).toContain("collider");
    expect(byLabel["Bad control"]).toContain("do not control");
  });
});
