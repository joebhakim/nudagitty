import type {
  GraphDocument,
  GraphEdge,
  GraphModel,
  GraphNode,
  SimulationSpec
} from "../types";
import {
  normalizeEdgeMechanism,
  normalizeGraphDocumentMetadata,
  normalizeNodeMechanism,
  normalizeSelectionCondition,
  normalizeVariableModel
} from "./normalize";

export function cloneDocument(document: GraphDocument): GraphDocument {
  return {
    ...document,
    graph: cloneGraph(document.graph),
    simulation: cloneSimulationSpec(document.simulation),
    metadata: normalizeGraphDocumentMetadata(document.metadata)
  };
}

export function cloneGraph(graph: GraphModel): GraphModel {
  return {
    kind: graph.kind,
    nodes: graph.nodes.map(cloneNode),
    edges: graph.edges.map(cloneEdge)
  };
}

export function cloneNode(node: GraphNode): GraphNode {
  return {
    ...node,
    position: { ...node.position },
    roles: { ...node.roles },
    variable: normalizeVariableModel(node.variable)
  };
}

export function cloneEdge(edge: GraphEdge): GraphEdge {
  return {
    ...edge,
    control: edge.control ? { ...edge.control } : undefined
  };
}

export function cloneSimulationSpec(spec: SimulationSpec): SimulationSpec {
  return {
    seed: spec.seed ?? 1,
    nodes: Object.fromEntries(Object.entries(spec.nodes ?? {}).map(([id, mechanism]) => [id, normalizeNodeMechanism(mechanism)])),
    edges: Object.fromEntries(Object.entries(spec.edges ?? {}).map(([id, mechanism]) => [id, normalizeEdgeMechanism(mechanism)])),
    overrides: { ...(spec.overrides ?? {}) },
    selections: Object.fromEntries(Object.entries(spec.selections ?? {}).map(([id, condition]) => [id, normalizeSelectionCondition(condition)])),
    ...(spec.copulaBlocks ? { copulaBlocks: JSON.parse(JSON.stringify(spec.copulaBlocks)) as SimulationSpec["copulaBlocks"] } : {}),
    ...(spec.datasets ? { datasets: spec.datasets } : {})
  };
}
