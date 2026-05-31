import type { GraphModel } from "@nudagitty/core";

export type ScatterPair = { x: string; y: string };

export function scatterPairOptions(graph: GraphModel): { exposures: string[]; outcomes: string[] } {
  return {
    exposures: graph.nodes.filter((node) => node.roles.exposure).map((node) => node.id),
    outcomes: graph.nodes.filter((node) => node.roles.outcome).map((node) => node.id)
  };
}

export function defaultScatterPair(graph: GraphModel): ScatterPair {
  const ids = graph.nodes.map((node) => node.id);
  const exposure = graph.nodes.find((node) => node.roles.exposure)?.id;
  const outcome = graph.nodes.find((node) => node.roles.outcome)?.id;
  if (exposure && outcome) return { x: exposure, y: outcome };
  if (ids.includes("Father_height") && ids.includes("Son_height")) return { x: "Father_height", y: "Son_height" };
  return { x: ids[0] ?? "", y: ids[1] ?? ids[0] ?? "" };
}

export function reconcileScatterPair(graph: GraphModel, pair: ScatterPair): ScatterPair {
  const options = scatterPairOptions(graph);
  if (options.exposures.length > 0 && options.outcomes.length > 0) {
    return {
      x: options.exposures.includes(pair.x) ? pair.x : options.exposures[0]!,
      y: options.outcomes.includes(pair.y) ? pair.y : options.outcomes[0]!
    };
  }
  const ids = new Set(graph.nodes.map((node) => node.id));
  if (ids.has(pair.x) && ids.has(pair.y)) return pair;
  return defaultScatterPair(graph);
}
