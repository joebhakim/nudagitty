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
  // No exposure/outcome marked (a user-built graph, galton, the collider examples): GUESS a sensible
  // cause→effect pair from the DAG — a root (no incoming arrow) to a sink (no outgoing arrow) — instead
  // of arbitrarily plotting the first two nodes. The user can still switch axes from the dropdowns.
  const directed = graph.edges.filter((edge) => edge.kind === "directed" || edge.kind === "partialDirected");
  const hasIncoming = new Set(directed.map((edge) => edge.target));
  const hasOutgoing = new Set(directed.map((edge) => edge.source));
  const root = ids.find((id) => hasOutgoing.has(id) && !hasIncoming.has(id));
  const sink = ids.find((id) => hasIncoming.has(id) && !hasOutgoing.has(id));
  if (root && sink && root !== sink) return { x: root, y: sink };
  if (directed[0]) return { x: directed[0].source, y: directed[0].target };
  return { x: ids[0] ?? "", y: ids[1] ?? ids[0] ?? "" };
}

export function reconcileScatterPair(graph: GraphModel, pair: ScatterPair): ScatterPair {
  const options = scatterPairOptions(graph);
  if (options.exposures.length > 0 && options.outcomes.length > 0) {
    const x = options.exposures.includes(pair.x) ? pair.x : options.exposures[0]!;
    const y = options.outcomes.includes(pair.y) ? pair.y : options.outcomes[0]!;
    // Preserve referential identity when nothing changed: a new {x,y} object on every call would
    // churn scatterPair state on each node drag, needlessly re-running the whole estimator suite.
    return x === pair.x && y === pair.y ? pair : { x, y };
  }
  const ids = new Set(graph.nodes.map((node) => node.id));
  if (ids.has(pair.x) && ids.has(pair.y)) return pair;
  return defaultScatterPair(graph);
}
