import { describe, expect, it } from "vitest";
import { analyzeGraph, structuralRoleOf } from "./analysis";
import { exampleDocument } from "./examples";

function rolesFor(exampleId: string) {
  const document = exampleDocument(exampleId);
  if (!document) throw new Error(`missing example ${exampleId}`);
  const report = analyzeGraph(document.graph);
  return (nodeId: string) => structuralRoleOf(document.graph, report, nodeId);
}

describe("structuralRoleOf", () => {
  it("classifies the falling-cats collider example by structural position", () => {
    const role = rolesFor("cats-highrise-syndrome");
    expect(role("Fall_height")).toBe("exposure");
    expect(role("Survival")).toBe("outcome");
    expect(role("Injury_severity")).toBe("mediator"); // on the causal path Fall -> Injury -> Survival
    expect(role("Brought_to_vet")).toBe("collider"); // common effect of Injury + Survival
  });

  it("classifies a Simpson confounder as a backdoor (confounder) role", () => {
    const role = rolesFor("simpson-severity");
    expect(role("Treatment")).toBe("exposure");
    expect(role("Recovery")).toBe("outcome");
    expect(role("Severity")).toBe("confounder"); // common cause of Treatment + Recovery
  });
});
