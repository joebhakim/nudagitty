import { describe, expect, it } from "vitest";
import { analyzeGraph, exampleDocument, runSimulation } from "@nudagitty/core";
import { computeStructuralDiagnosis } from "./modules";

describe("computeStructuralDiagnosis on Lord's paradox", () => {
  it("reads the gain-score pattern as an estimand split (Lord's), not generic confounding", () => {
    const document = exampleDocument("lords-paradox");
    if (!document) throw new Error("missing");
    const simulation = runSimulation(document.graph, document.simulation);
    const analysis = analyzeGraph(document.graph);
    const out = computeStructuralDiagnosis({ analysis, document, simulation });
    if (!out) throw new Error("no diagnosis");

    // gain-score pattern detected (Pretest shares the Posttest unit) => estimand split
    expect(out.badge).toBe("estimand split");
    const labels = out.metrics.map((metric) => metric.label);
    expect(labels).toContain("crude contrast");
    expect(labels).toContain("causal contrast — do()");
    expect(labels).toContain("change-score (gain)");
    expect(out.conclusion).toContain("Lord's paradox");
    expect(out.conclusion).toContain("change score");
    // Pretest is still structurally a backdoor adjuster
    const bullets = Object.fromEntries(out.bullets.map((bullet) => [bullet.label, bullet.text]));
    expect(bullets.Structure).toContain("Pretest: backdoor");
  });
});
