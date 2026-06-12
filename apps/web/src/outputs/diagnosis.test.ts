import { describe, expect, it } from "vitest";
import { analyzeGraph, exampleDocument, runSimulation } from "@nudagitty/core";
import { computeStructuralDiagnosis } from "./modules";

describe("computeStructuralDiagnosis on Lord's paradox", () => {
  it("derives the confounder diagnosis, crude/causal contrast, and the gain-score pattern", () => {
    const document = exampleDocument("lords-paradox");
    if (!document) throw new Error("missing");
    const simulation = runSimulation(document.graph, document.simulation);
    const analysis = analyzeGraph(document.graph);
    const out = computeStructuralDiagnosis({ analysis, document, simulation });
    if (!out) throw new Error("no diagnosis");

    expect(out.badge).toBe("confounding");
    const labels = out.metrics.map((metric) => metric.label);
    expect(labels).toContain("crude contrast");
    expect(labels).toContain("causal contrast — do()");
    // gain-score pattern detected automatically (baseline weight shares the outcome's unit)
    expect(labels).toContain("change-score contrast");
    expect(out.conclusion).toContain("confounded by Baseline_weight");
    // estimand + structure bullets are derived
    const bullets = Object.fromEntries(out.bullets.map((bullet) => [bullet.label, bullet.text]));
    expect(bullets.Structure).toContain("Baseline_weight: backdoor");
    expect(bullets.Recommendation).toContain("Baseline_weight");
  });
});
