import { correlationGraph, equivalenceGraph, graphWithKind, moralGraph } from "@nudagitty/core";
import type { AnalysisReport, GraphModel, ViewMode } from "@nudagitty/core";

export function transformView(graph: GraphModel, mode: ViewMode): GraphModel {
  if (mode === "moral") return moralGraph(graph);
  if (mode === "correlation") return correlationGraph(graph);
  if (mode === "equivalence") return equivalenceGraph(graph);
  return graphWithKind(graph, graph.kind);
}

export function computeHighlightedEdges(graph: GraphModel, analysis: AnalysisReport, showCausal: boolean, showBiasing: boolean): Map<string, "causal" | "biasing"> {
  const out = new Map<string, "causal" | "biasing">();
  if (showCausal) addPathEdges(graph, analysis.causalPaths, out, "causal");
  if (showBiasing) addPathEdges(graph, analysis.biasingPaths, out, "biasing");
  return out;
}

export function addPathEdges(graph: GraphModel, paths: string[][], out: Map<string, "causal" | "biasing">, kind: "causal" | "biasing") {
  for (const path of paths) {
    for (let index = 0; index < path.length - 1; index += 1) {
      const source = path[index];
      const target = path[index + 1];
      if (!source || !target) continue;
      const edge = graph.edges.find((candidate) => (candidate.source === source && candidate.target === target) || (candidate.source === target && candidate.target === source));
      if (edge) out.set(edge.id, kind);
    }
  }
}
