import { describe, expect, it } from "vitest";
import { parseModel, serializeModel } from "./parser";

describe("DAGitty-compatible parser", () => {
  it("imports roles, positions, and directed edges", () => {
    const parsed = parseModel(`dag {
      X [exposure,pos="-2,1"]
      Y [outcome,pos="2,1"]
      Z [adjusted,pos="0,0"]
      X -> Y
      Z -> { X Y }
    }`);

    const graph = parsed.document.graph;
    expect(graph.nodes).toHaveLength(3);
    expect(graph.nodes.find((node) => node.id === "X")?.roles.exposure).toBe(true);
    expect(graph.nodes.find((node) => node.id === "Y")?.roles.outcome).toBe(true);
    expect(graph.nodes.find((node) => node.id === "Z")?.roles.adjusted).toBe(true);
    expect(graph.edges.map((edge) => `${edge.source}->${edge.target}`).sort()).toEqual(["X->Y", "Z->X", "Z->Y"]);
  });

  it("round-trips serialized model code through the clean parser", () => {
    const first = parseModel(`dag {
      A [selected,pos="-1,-1"]
      X [exposure,pos="-2,0"]
      Y [outcome,pos="2,0"]
      A -> X
      X -> Y
    }`).document;
    const second = parseModel(serializeModel(first)).document;
    expect(second.graph.nodes.map((node) => node.id).sort()).toEqual(["A", "X", "Y"]);
    expect(serializeModel(second)).toContain("X -> Y");
  });
});
