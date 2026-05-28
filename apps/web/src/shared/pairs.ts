import type { GraphModel } from "@nudagitty/core";

export type ScatterPair = { x: string; y: string };

export function defaultScatterPair(graph: GraphModel): ScatterPair {
  const ids = graph.nodes.map((node) => node.id);
  if (ids.includes("Father_height") && ids.includes("Son_height")) return { x: "Father_height", y: "Son_height" };
  const exposure = graph.nodes.find((node) => node.roles.exposure)?.id;
  const outcome = graph.nodes.find((node) => node.roles.outcome)?.id;
  if (exposure && outcome) return { x: exposure, y: outcome };
  return { x: ids[0] ?? "", y: ids[1] ?? ids[0] ?? "" };
}

export function reconcileScatterPair(graph: GraphModel, pair: ScatterPair): ScatterPair {
  const ids = new Set(graph.nodes.map((node) => node.id));
  if (ids.has(pair.x) && ids.has(pair.y)) return pair;
  return defaultScatterPair(graph);
}
