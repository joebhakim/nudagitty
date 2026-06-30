import type {
  EdgeKind,
  GraphDocument,
  GraphEdge,
  GraphKind,
  GraphModel,
  GraphNode,
  NodeRoleFlags,
  SimulationSpec
} from "../types";
import { DEFAULT_ROLES } from "./constants";
import { cloneEdge, cloneGraph, cloneNode, cloneSimulationSpec } from "./clone";
import { defaultEdgeMechanism, defaultNodeMechanism, edgeId, nowIso } from "./defaults";
import { normalizeEdgeMechanism, normalizeNodeMechanism } from "./normalize";

export function defaultSimulationSpec(graph: GraphModel): SimulationSpec {
  return {
    seed: 1,
    nodes: Object.fromEntries(graph.nodes.map((node) => [node.id, defaultNodeMechanism(node)])),
    edges: Object.fromEntries(graph.edges.map((edge) => [edge.id, defaultEdgeMechanism()])),
    overrides: {},
    selections: {}
  };
}

export function reconcileSimulationSpec(graph: GraphModel, spec: SimulationSpec): SimulationSpec {
  const next = cloneSimulationSpec(spec);
  for (const node of graph.nodes) {
    next.nodes[node.id] = next.nodes[node.id] ? normalizeNodeMechanism(next.nodes[node.id]) : defaultNodeMechanism(node);
  }
  for (const nodeId of Object.keys(next.nodes)) {
    if (!graph.nodes.some((node) => node.id === nodeId)) {
      delete next.nodes[nodeId];
      delete next.overrides[nodeId];
      delete next.selections[nodeId];
    }
  }
  for (const edge of graph.edges) {
    next.edges[edge.id] = next.edges[edge.id] ? normalizeEdgeMechanism(next.edges[edge.id]) : defaultEdgeMechanism();
  }
  for (const id of Object.keys(next.edges)) {
    if (!graph.edges.some((edge) => edge.id === id)) delete next.edges[id];
  }
  return next;
}

export function withGraph(document: GraphDocument, graph: GraphModel): GraphDocument {
  return {
    ...document,
    graph: cloneGraph(graph),
    simulation: reconcileSimulationSpec(graph, document.simulation),
    updatedAt: nowIso()
  };
}

export function ensureUniqueNodeId(graph: GraphModel, preferred = "V"): string {
  const taken = new Set(graph.nodes.map((node) => node.id));
  if (!taken.has(preferred)) return preferred;
  let index = 1;
  while (taken.has(`${preferred}${index}`)) index += 1;
  return `${preferred}${index}`;
}

export function addNode(graph: GraphModel, node: GraphNode): GraphModel {
  if (graph.nodes.some((candidate) => candidate.id === node.id)) return cloneGraph(graph);
  return { ...cloneGraph(graph), nodes: [...graph.nodes.map(cloneNode), cloneNode(node)] };
}

export function updateNode(graph: GraphModel, nodeId: string, patch: Partial<Omit<GraphNode, "id">>): GraphModel {
  return {
    ...cloneGraph(graph),
    nodes: graph.nodes.map((node) => {
      if (node.id !== nodeId) return cloneNode(node);
      return {
        ...cloneNode(node),
        ...patch,
        position: patch.position ? { ...patch.position } : { ...node.position },
        roles: patch.roles ? { ...patch.roles } : { ...node.roles }
      };
    })
  };
}

export function renameNode(graph: GraphModel, oldId: string, newId: string): GraphModel {
  const clean = normalizeId(newId);
  if (!clean || oldId === clean || graph.nodes.some((node) => node.id === clean)) return cloneGraph(graph);
  const edges = graph.edges.map((edge) => {
    const source = edge.source === oldId ? clean : edge.source;
    const target = edge.target === oldId ? clean : edge.target;
    return { ...cloneEdge(edge), source, target, id: edgeId(source, target, edge.kind) };
  });
  return {
    ...cloneGraph(graph),
    nodes: graph.nodes.map((node) => node.id === oldId ? { ...cloneNode(node), id: clean, label: clean } : cloneNode(node)),
    edges
  };
}

export function deleteNode(graph: GraphModel, nodeId: string): GraphModel {
  return {
    ...cloneGraph(graph),
    nodes: graph.nodes.filter((node) => node.id !== nodeId).map(cloneNode),
    edges: graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId).map(cloneEdge)
  };
}

export function addEdge(graph: GraphModel, source: string, target: string, kind: EdgeKind = "directed"): GraphModel {
  if (source === target) return cloneGraph(graph);
  if (!graph.nodes.some((node) => node.id === source) || !graph.nodes.some((node) => node.id === target)) return cloneGraph(graph);
  const id = edgeId(source, target, kind);
  if (graph.edges.some((edge) => edge.id === id)) return cloneGraph(graph);
  return {
    ...cloneGraph(graph),
    edges: [...graph.edges.map(cloneEdge), { id, source, target, kind }]
  };
}

export function upsertEdge(graph: GraphModel, edge: GraphEdge): GraphModel {
  const next = cloneGraph(graph);
  const index = next.edges.findIndex((candidate) => candidate.id === edge.id);
  if (index >= 0) next.edges[index] = cloneEdge(edge);
  else next.edges.push(cloneEdge(edge));
  return next;
}

export function deleteEdge(graph: GraphModel, edgeIdToDelete: string): GraphModel {
  return {
    ...cloneGraph(graph),
    edges: graph.edges.filter((edge) => edge.id !== edgeIdToDelete).map(cloneEdge)
  };
}

export function setNodeRole(graph: GraphModel, nodeId: string, role: keyof NodeRoleFlags, value: boolean): GraphModel {
  return updateNode(graph, nodeId, {
    roles: {
      ...(findNode(graph, nodeId)?.roles ?? DEFAULT_ROLES),
      [role]: value
    }
  });
}

export function findNode(graph: GraphModel, nodeId: string): GraphNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}

export function findEdge(graph: GraphModel, edgeIdToFind: string): GraphEdge | undefined {
  return graph.edges.find((edge) => edge.id === edgeIdToFind);
}

export function normalizeId(value: string): string {
  return value.trim().replace(/\s+/g, "_");
}

export function roleIds(graph: GraphModel, role: keyof NodeRoleFlags): string[] {
  return graph.nodes.filter((node) => node.roles[role]).map((node) => node.id).sort();
}

export function exposures(graph: GraphModel): string[] {
  return roleIds(graph, "exposure");
}

export function outcomes(graph: GraphModel): string[] {
  return roleIds(graph, "outcome");
}

export function adjusted(graph: GraphModel): string[] {
  return roleIds(graph, "adjusted");
}

export function selected(graph: GraphModel): string[] {
  return roleIds(graph, "selected");
}

export function latent(graph: GraphModel): string[] {
  return roleIds(graph, "latent");
}

export function instruments(graph: GraphModel): string[] {
  return roleIds(graph, "instrument");
}

export function directedParents(graph: GraphModel, nodeId: string): string[] {
  return graph.edges.filter((edge) => edge.kind === "directed" && edge.target === nodeId).map((edge) => edge.source);
}

export function directedChildren(graph: GraphModel, nodeId: string): string[] {
  return graph.edges.filter((edge) => edge.kind === "directed" && edge.source === nodeId).map((edge) => edge.target);
}

export function adjacentIds(graph: GraphModel, nodeId: string): string[] {
  const out = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.source === nodeId) out.add(edge.target);
    if (edge.target === nodeId) out.add(edge.source);
  }
  return [...out];
}

export function getConnectingEdge(graph: GraphModel, a: string, b: string): GraphEdge | undefined {
  return graph.edges.find((edge) => (edge.source === a && edge.target === b) || (edge.source === b && edge.target === a));
}

export function graphWithKind(graph: GraphModel, kind: GraphKind): GraphModel {
  return { ...cloneGraph(graph), kind };
}
