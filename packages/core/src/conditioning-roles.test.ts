import { describe, expect, it } from "vitest";
import { analyzeGraph, classifyConditioned } from "./analysis";
import { exampleDocument } from "./examples";

describe("conditioning-role classification", () => {
  it("flags the cats Brought_to_vet selection as a collider / bad control", () => {
    const document = exampleDocument("cats-highrise-syndrome");
    if (!document) throw new Error("missing cats example");
    const report = analyzeGraph(document.graph);
    const role = report.conditioningRoles.find((entry) => entry.node === "Brought_to_vet");
    expect(role).toBeDefined();
    expect(role!.operation).toBe("select");
    expect(role!.classification).toBe("collider");
    expect(role!.opensBiasingPath).toBe(true);
    // direct cross-check of the classifier
    expect(classifyConditioned(document.graph, "Brought_to_vet").classification).toBe("collider");
  });

  it("classifies the Simpson Severity confounder as a backdoor adjuster", () => {
    const document = exampleDocument("simpson-severity");
    if (!document) throw new Error("missing simpson example");
    // Severity ships unmarked (the learner chooses to adjust it); the classifier is
    // role-agnostic, so it can say what conditioning on it WOULD do: close the
    // Treatment <- Severity -> Recovery backdoor path.
    const verdict = classifyConditioned(document.graph, "Severity");
    expect(verdict.classification).toBe("backdoor");
    expect(verdict.blocksBiasingPath).toBe(true);
    expect(verdict.opensBiasingPath).toBe(false);
    // and by default nothing is conditioned, so there are no bad controls to warn about
    const report = analyzeGraph(document.graph);
    expect(report.conditioningRoles).toEqual([]);
  });
});
