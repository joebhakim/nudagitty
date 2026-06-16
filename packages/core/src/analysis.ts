import {
  adjusted,
  adjacentIds,
  cloneGraph,
  directedChildren,
  directedParents,
  exposures,
  getConnectingEdge,
  latent,
  outcomes,
  selected
} from "./graph";
import type {
  AdjustmentReport,
  AnalysisOperation,
  AnalysisReport,
  ConditionalIndependence,
  ConditionedClassification,
  ConditioningRole,
  EdgeKind,
  GraphEdge,
  GraphModel,
  InstrumentReport
} from "./types";

export function analyzeGraph(graph: GraphModel): AnalysisReport {
  const cycle = findDirectedCycle(graph);
  const sourceIds = exposures(graph);
  const targetIds = outcomes(graph);
  const adjustedIds = adjusted(graph);
  const selectedIds = selected(graph);
  const latentIds = latent(graph);
  const allPaths = sourceIds.length > 0 && targetIds.length > 0 ? simplePathsBetweenSets(graph, sourceIds, targetIds, 250) : [];
  const conditioned = [...adjustedIds, ...selectedIds];
  const causalPaths = allPaths.filter((path) => isDirectedPath(graph, path));
  const biasingPaths = allPaths.filter((path) => !isDirectedPath(graph, path) && isPathOpen(graph, path, conditioned));
  return {
    cycle,
    semiCycle: graph.edges.some((edge) => edge.kind === "undirected") ? cycle : null,
    exposures: sourceIds,
    outcomes: targetIds,
    adjusted: adjustedIds,
    selected: selectedIds,
    latent: latentIds,
    covariateCount: Math.max(0, graph.nodes.length - sourceIds.length - targetIds.length),
    causalPathCount: causalPaths.length,
    openBiasingPathCount: biasingPaths.length,
    causalPaths,
    biasingPaths,
    conditioningRoles: buildConditioningRoles(graph, adjustedIds, selectedIds),
    totalEffect: adjustmentReport(graph, "total"),
    directEffect: adjustmentReport(graph, "direct"),
    causalOdds: causalOddsReport(graph),
    instruments: instrumentReport(graph),
    implications: listImplications(graph, 12)
  };
}

// Classify a single conditioned-on variable against the exposure -> outcome estimand by
// comparing every non-causal path's openness with no conditioning versus conditioning on
// just this node. If conditioning OPENS a path it is a collider / bad control; if it CLOSES
// one it is a backdoor adjuster; otherwise it is neutral. Opening dominates (the dangerous
// case), so a node that both opens and closes paths is reported as a collider.
export function classifyConditioned(graph: GraphModel, nodeId: string): {
  classification: ConditionedClassification;
  opensBiasingPath: boolean;
  blocksBiasingPath: boolean;
} {
  const sourceIds = exposures(graph);
  const targetIds = outcomes(graph);
  if (sourceIds.length === 0 || targetIds.length === 0) {
    return { classification: "neutral", opensBiasingPath: false, blocksBiasingPath: false };
  }
  const paths = simplePathsBetweenSets(graph, sourceIds, targetIds, 250);
  let opens = false;
  let blocks = false;
  for (const path of paths) {
    if (isDirectedPath(graph, path)) continue; // a causal path, never a biasing path
    const openEmpty = isPathOpen(graph, path, []);
    const openWithNode = isPathOpen(graph, path, [nodeId]);
    if (openWithNode && !openEmpty) opens = true;
    if (!openWithNode && openEmpty) blocks = true;
  }
  return {
    classification: opens ? "collider" : blocks ? "backdoor" : "neutral",
    opensBiasingPath: opens,
    blocksBiasingPath: blocks
  };
}

// A coarse, categorical structural role for a node relative to the exposure -> outcome
// estimand, for analytics. Returns only the bucket (never the node id / label), so it is
// safe to send to a privacy-preserving tracker. Priority: declared roles first, then
// mediator (interior of a causal path), then collider / confounder by conditioning effect.
export type StructuralRole =
  | "exposure"
  | "outcome"
  | "latent"
  | "mediator"
  | "collider"
  | "confounder"
  | "other";

export function structuralRoleOf(graph: GraphModel, report: AnalysisReport, nodeId: string): StructuralRole {
  if (report.exposures.includes(nodeId)) return "exposure";
  if (report.outcomes.includes(nodeId)) return "outcome";
  if (report.latent.includes(nodeId)) return "latent";
  const onCausalInterior = report.causalPaths.some(
    (path) => path.length > 2 && path.slice(1, -1).includes(nodeId)
  );
  if (onCausalInterior) return "mediator";
  const { classification } = classifyConditioned(graph, nodeId);
  if (classification === "collider") return "collider";
  if (classification === "backdoor") return "confounder";
  return "other";
}

function buildConditioningRoles(graph: GraphModel, adjustedIds: string[], selectedIds: string[]): ConditioningRole[] {
  const seen = new Set<string>();
  const roles: ConditioningRole[] = [];
  const add = (nodeId: string, operation: AnalysisOperation) => {
    if (seen.has(nodeId)) return;
    seen.add(nodeId);
    roles.push({ node: nodeId, operation, ...classifyConditioned(graph, nodeId) });
  };
  // selection takes precedence in the label when a node carries both legacy flags
  for (const id of selectedIds) add(id, "select");
  for (const id of adjustedIds) add(id, "adjust");
  return roles;
}

export function findDirectedCycle(graph: GraphModel): string[] | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    if (visited.has(id)) return null;
    visiting.add(id);
    stack.push(id);
    for (const child of directedChildren(graph, id)) {
      const cycle = visit(child);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  };
  for (const node of graph.nodes) {
    const cycle = visit(node.id);
    if (cycle) return cycle;
  }
  return null;
}

export function topologicalOrder(graph: GraphModel): string[] | null {
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) {
    if (edge.kind !== "directed") continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }
  const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
  const out: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    out.push(id);
    for (const child of directedChildren(graph, id)) {
      const next = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, next);
      if (next === 0) queue.push(child);
    }
  }
  return out.length === graph.nodes.length ? out : null;
}

export function ancestorsOf(graph: GraphModel, ids: string[]): string[] {
  const seen = new Set<string>();
  const stack = [...ids];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id) continue;
    for (const parent of directedParents(graph, id)) {
      if (!seen.has(parent)) {
        seen.add(parent);
        stack.push(parent);
      }
    }
  }
  return [...seen];
}

export function descendantsOf(graph: GraphModel, ids: string[]): string[] {
  const seen = new Set<string>();
  const stack = [...ids];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id) continue;
    for (const child of directedChildren(graph, id)) {
      if (!seen.has(child)) {
        seen.add(child);
        stack.push(child);
      }
    }
  }
  return [...seen];
}

export function dSeparated(graph: GraphModel, left: string[], right: string[], conditioned: string[]): boolean {
  const paths = simplePathsBetweenSets(graph, left, right, 500);
  return paths.every((path) => !isPathOpen(graph, path, conditioned));
}

export function isPathOpen(graph: GraphModel, path: string[], conditioned: string[]): boolean {
  if (path.length <= 2) return true;
  const conditionedSet = new Set(conditioned);
  const descendantsOfConditioned = new Set<string>();
  for (const id of conditionedSet) {
    for (const descendant of descendantsOf(graph, [id])) descendantsOfConditioned.add(descendant);
  }
  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    const next = path[index + 1];
    if (!previous || !current || !next) continue;
    const collider = isCollider(graph, previous, current, next);
    if (collider) {
      if (!conditionedSet.has(current) && ![...conditionedSet].some((id) => descendantsOf(graph, [current]).includes(id))) return false;
    } else if (conditionedSet.has(current)) {
      return false;
    }
  }
  return true;
}

export function simplePathsBetweenSets(graph: GraphModel, starts: string[], ends: string[], limit = 100): string[][] {
  const endSet = new Set(ends);
  const paths: string[][] = [];
  const visit = (current: string, path: string[]) => {
    if (paths.length >= limit) return;
    if (endSet.has(current) && path.length > 1) {
      paths.push([...path]);
      return;
    }
    for (const next of adjacentIds(graph, current)) {
      if (path.includes(next)) continue;
      visit(next, [...path, next]);
    }
  };
  for (const start of starts) visit(start, [start]);
  return paths;
}

export function isDirectedPath(graph: GraphModel, path: string[]): boolean {
  if (path.length < 2) return false;
  for (let index = 0; index < path.length - 1; index += 1) {
    const source = path[index];
    const target = path[index + 1];
    if (!source || !target) return false;
    const edge = graph.edges.find((candidate) => candidate.kind === "directed" && candidate.source === source && candidate.target === target);
    if (!edge) return false;
  }
  return true;
}

export function moralGraph(graph: GraphModel): GraphModel {
  const retained = new Set([...exposures(graph), ...outcomes(graph), ...adjusted(graph), ...selected(graph)]);
  for (const ancestor of ancestorsOf(graph, [...retained])) retained.add(ancestor);
  const nodes = graph.nodes.filter((node) => retained.has(node.id));
  const edges: GraphEdge[] = [];
  const addUndirected = (a: string, b: string) => {
    if (a === b) return;
    const source = a < b ? a : b;
    const target = a < b ? b : a;
    const id = `undirected:${source}->${target}`;
    if (!edges.some((edge) => edge.id === id)) edges.push({ id, source, target, kind: "undirected" });
  };
  for (const edge of graph.edges) {
    if (retained.has(edge.source) && retained.has(edge.target)) addUndirected(edge.source, edge.target);
  }
  for (const node of nodes) {
    const parents = directedParents(graph, node.id).filter((id) => retained.has(id));
    for (let i = 0; i < parents.length; i += 1) {
      for (let j = i + 1; j < parents.length; j += 1) {
        const a = parents[i];
        const b = parents[j];
        if (a && b) addUndirected(a, b);
      }
    }
  }
  return { kind: "graph", nodes, edges };
}

export function correlationGraph(graph: GraphModel): GraphModel {
  const nodes = graph.nodes.map((node) => ({ ...node, roles: { ...node.roles }, position: { ...node.position } }));
  const edges: GraphEdge[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i]?.id;
      const b = nodes[j]?.id;
      if (!a || !b) continue;
      if (!dSeparated(graph, [a], [b], [])) {
        edges.push({ id: `undirected:${a}->${b}`, source: a, target: b, kind: "undirected" });
      }
    }
  }
  return { kind: "graph", nodes, edges };
}

export function equivalenceGraph(graph: GraphModel): GraphModel {
  const next = cloneGraph(graph);
  next.kind = "pdag";
  const compelled = new Set<string>();
  for (const node of graph.nodes) {
    const parents = directedParents(graph, node.id);
    for (let i = 0; i < parents.length; i += 1) {
      for (let j = i + 1; j < parents.length; j += 1) {
        const a = parents[i];
        const b = parents[j];
        if (!a || !b || getConnectingEdge(graph, a, b)) continue;
        compelled.add(`directed:${a}->${node.id}`);
        compelled.add(`directed:${b}->${node.id}`);
      }
    }
  }
  next.edges = next.edges.map((edge) => edge.kind === "directed" && !compelled.has(edge.id) ? { ...edge, kind: "undirected" as const } : edge);
  return next;
}

function adjustmentReport(graph: GraphModel, kind: "total" | "direct"): AdjustmentReport {
  const sourceIds = exposures(graph);
  const targetIds = outcomes(graph);
  if (sourceIds.length === 0 || targetIds.length === 0) return { valid: false, message: "Exposure and outcome must be defined.", minimalSets: [] };
  if (kind === "direct" && selected(graph).length > 0) return { valid: false, message: "Direct-effect adjustment is disabled with sample-selection nodes.", minimalSets: [] };
  const conditioned = adjusted(graph).concat(selected(graph));
  const valid = kind === "direct" ? directEffectClosed(graph, conditioned) : dSeparated(backDoorGraph(graph), sourceIds, targetIds, conditioned);
  const minimalSets = listMinimalAdjustmentSets(graph, kind);
  return {
    valid,
    message: valid ? (conditioned.length > 0 ? "Correctly adjusted." : "No open biasing paths.") : (conditioned.length > 0 ? "Incorrectly adjusted." : "Biasing paths are open."),
    minimalSets
  };
}

function causalOddsReport(graph: GraphModel): AdjustmentReport {
  const sourceIds = exposures(graph);
  const targetIds = outcomes(graph);
  const selectedIds = selected(graph);
  if (sourceIds.length !== 1 || targetIds.length !== 1) return { valid: false, message: "Causal odds ratio requires one exposure and one outcome.", minimalSets: [] };
  if (selectedIds.length !== 1) return { valid: false, message: "Causal odds ratio requires exactly one sample-selection node.", minimalSets: [] };
  const valid = dSeparated(graph, sourceIds, selectedIds, targetIds.concat(adjusted(graph))) && adjustmentReport(graph, "total").valid;
  return { valid, message: valid ? "Causal odds ratio adjustment conditions hold." : "Causal odds ratio adjustment conditions fail.", minimalSets: [] };
}

function instrumentReport(graph: GraphModel): InstrumentReport {
  const sourceIds = exposures(graph);
  const targetIds = outcomes(graph);
  if (sourceIds.length !== 1 || targetIds.length !== 1) return { instruments: [], message: "Instrument checks require one exposure and one outcome." };
  const source = sourceIds[0];
  const target = targetIds[0];
  if (!source || !target) return { instruments: [], message: "Instrument checks require one exposure and one outcome." };
  const candidates = graph.nodes.filter((node) => !node.roles.exposure && !node.roles.outcome && !node.roles.latent);
  const instruments = candidates.filter((node) => {
    const reachesExposure = !dSeparated(graph, [node.id], [source], []);
    const graphWithoutExposureOutcome = {
      ...graph,
      edges: graph.edges.filter((edge) => !(edge.kind === "directed" && edge.source === source && edge.target === target))
    };
    const independentOutcome = dSeparated(graphWithoutExposureOutcome, [node.id], [target], [source]);
    return reachesExposure && independentOutcome;
  }).map((node) => ({ instrument: node.id, conditionedOn: [] }));
  return { instruments, message: instruments.length > 0 ? "Candidate instruments found." : "No candidate instruments found." };
}

function listMinimalAdjustmentSets(graph: GraphModel, kind: "total" | "direct"): string[][] {
  const forbidden = new Set([...exposures(graph), ...outcomes(graph), ...latent(graph)]);
  const candidates = graph.nodes.filter((node) => !forbidden.has(node.id)).map((node) => node.id);
  if (candidates.length > 10) return [];
  const results: string[][] = [];
  for (let size = 0; size <= candidates.length; size += 1) {
    for (const set of combinations(candidates, size)) {
      const valid = kind === "direct" ? directEffectClosed(graph, set) : dSeparated(backDoorGraph(graph), exposures(graph), outcomes(graph), set.concat(selected(graph)));
      if (!valid) continue;
      if (!results.some((existing) => existing.every((id) => set.includes(id)))) results.push(set.sort());
    }
    if (results.length > 0) break;
  }
  return results.slice(0, 20);
}

function directEffectClosed(graph: GraphModel, conditioned: string[]): boolean {
  const sourceIds = exposures(graph);
  const targetIds = outcomes(graph);
  const indirectGraph = {
    ...graph,
    edges: graph.edges.filter((edge) => !(edge.kind === "directed" && sourceIds.includes(edge.source) && targetIds.includes(edge.target)))
  };
  return dSeparated(indirectGraph, sourceIds, targetIds, conditioned);
}

function backDoorGraph(graph: GraphModel): GraphModel {
  const sourceSet = new Set(exposures(graph));
  const targetSet = new Set(outcomes(graph));
  const edges = graph.edges.filter((edge) => {
    if (edge.kind !== "directed" || !sourceSet.has(edge.source)) return true;
    return !descendantsOf(graph, [edge.target]).some((id) => targetSet.has(id)) && !targetSet.has(edge.target);
  });
  return { ...graph, edges };
}

function listImplications(graph: GraphModel, limit: number): ConditionalIndependence[] {
  const observed = graph.nodes.filter((node) => !node.roles.latent).map((node) => node.id);
  const out: ConditionalIndependence[] = [];
  for (let i = 0; i < observed.length; i += 1) {
    for (let j = i + 1; j < observed.length; j += 1) {
      const left = observed[i];
      const right = observed[j];
      if (!left || !right || getConnectingEdge(graph, left, right)) continue;
      const rest = observed.filter((id) => id !== left && id !== right);
      const candidateSets = [[] as string[], ...rest.map((id) => [id]), ...combinations(rest, 2)];
      const found = candidateSets.find((given) => dSeparated(graph, [left], [right], given));
      if (found) out.push({ left, right, given: found.sort() });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function combinations(values: string[], size: number): string[][] {
  if (size === 0) return [[]];
  if (size > values.length) return [];
  const out: string[][] = [];
  const visit = (start: number, selectedValues: string[]) => {
    if (selectedValues.length === size) {
      out.push([...selectedValues]);
      return;
    }
    for (let index = start; index < values.length; index += 1) {
      const value = values[index];
      if (!value) continue;
      visit(index + 1, [...selectedValues, value]);
    }
  };
  visit(0, []);
  return out;
}

function isCollider(graph: GraphModel, previous: string, current: string, next: string): boolean {
  const left = getConnectingEdge(graph, previous, current);
  const right = getConnectingEdge(graph, current, next);
  if (!left || !right) return false;
  return arrowHeadAt(left, current) && arrowHeadAt(right, current);
}

function arrowHeadAt(edge: GraphEdge, nodeId: string): boolean {
  if (edge.kind === "bidirected" || edge.kind === "unspecified") return edge.source === nodeId || edge.target === nodeId;
  if (edge.kind === "directed" || edge.kind === "partialDirected") return edge.target === nodeId;
  return false;
}

export function edgeKindAllowsDirectedSemantics(kind: EdgeKind): boolean {
  return kind === "directed";
}
