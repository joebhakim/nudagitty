import type {
  EdgeKind,
  EdgeMechanism,
  EdgeMechanismKind,
  GraphDocumentMetadata,
  GraphDocument,
  GraphModel,
  GraphNode,
  NodeDistribution,
  NodeMechanism,
  NodeRoleFlags,
  Point,
  VariableModel
} from "../types";
import { DEFAULT_ROLES, GRAPH_DOCUMENT_SCHEMA_VERSION } from "./constants";
import { cloneEdge, cloneNode } from "./clone";
import { defaultSimulationSpec } from "./manipulate";

export function roles(overrides: Partial<NodeRoleFlags> = {}): NodeRoleFlags {
  return { ...DEFAULT_ROLES, ...overrides };
}

export function defaultVariableModel(): VariableModel {
  return {
    description: "",
    valueType: "continuous",
    unit: "",
    categories: [],
    measurement: {
      kind: "observed",
      errorSd: 0,
      missingRate: 0,
      lowerLimit: null,
      upperLimit: null
    },
    intervention: {
      kind: "none",
      value: 0,
      shift: 0,
      probability: 0.5
    },
    simulation: {
      mode: "single_draw",
      sampleSize: 320
    },
    adjustment: {
      method: "none",
      cutpoints: [],
      standardize: true
    },
    tags: []
  };
}

export function defaultGraphDocumentMetadata(): GraphDocumentMetadata {
  return {
    longitudinal: {
      timePoints: [],
      variables: {},
      treatmentStrategies: [],
      estimands: [],
      censoring: [],
      survivalOutputs: []
    },
    sources: []
  };
}

export function edgeId(source: string, target: string, kind: EdgeKind): string {
  return `${kind}:${source}->${target}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function defaultNoise(): NodeDistribution {
  return { kind: "constant", value: 0 };
}

export function defaultNodeDistribution(kind: NodeDistribution["kind"] = "constant"): NodeDistribution {
  if (kind === "normal") return { kind, mean: 0, sd: 1 };
  if (kind === "lognormal") return { kind, meanLog: 0, sdLog: 1 };
  if (kind === "uniform") return { kind, min: 0, max: 1 };
  if (kind === "bernoulli") return { kind, p: 0.5 };
  if (kind === "poisson") return { kind, lambda: 1 };
  if (kind === "beta") return { kind, alpha: 2, beta: 2 };
  if (kind === "laplace") return { kind, mean: 0, scale: 1 };
  if (kind === "student_t") return { kind, mean: 0, scale: 1, df: 5 };
  if (kind === "gamma") return { kind, shape: 2, scale: 1 };
  if (kind === "exponential") return { kind, rate: 1 };
  if (kind === "categorical") return { kind, weights: [1, 1, 1] };
  return { kind: "constant", value: 0 };
}

export function defaultNodeMechanism(node: GraphNode): NodeMechanism {
  const value = node.roles.exposure ? 1 : 0;
  return {
    distribution: { kind: "constant", value },
    intercept: 0,
    noise: defaultNoise(),
    combiner: "additive",
    interactions: []
  };
}

export function defaultEdgeMechanism(kind: EdgeMechanismKind = "linear"): EdgeMechanism {
  return {
    kind,
    coefficient: 1,
    enabled: true,
    threshold: 0,
    low: 0,
    high: 1,
    scale: 1,
    steepness: 4,
    midpoint: 0,
    beta1: 1,
    beta2: 0,
    baseline: 0,
    maxEffect: 1,
    ec50: 1,
    exponent: 1,
    offset: kind === "log_linear" ? 1 : 0,
    points: [
      { x: -1, y: -1 },
      { x: 0, y: 0 },
      { x: 1, y: 1 }
    ]
  };
}

export function createNode(id: string, position: Point, roleOverrides: Partial<NodeRoleFlags> = {}): GraphNode {
  return {
    id,
    label: id,
    position,
    roles: roles(roleOverrides),
    variable: defaultVariableModel()
  };
}

export function createGraphDocument(graph?: Partial<GraphModel>, title = "Untitled model"): GraphDocument {
  const model: GraphModel = {
    kind: graph?.kind ?? "dag",
    nodes: graph?.nodes ? graph.nodes.map(cloneNode) : [],
    edges: graph?.edges ? graph.edges.map(cloneEdge) : []
  };
  return {
    schemaVersion: GRAPH_DOCUMENT_SCHEMA_VERSION,
    id: `model-${Math.random().toString(36).slice(2, 10)}`,
    title,
    graph: model,
    simulation: defaultSimulationSpec(model),
    metadata: defaultGraphDocumentMetadata(),
    updatedAt: nowIso()
  };
}
