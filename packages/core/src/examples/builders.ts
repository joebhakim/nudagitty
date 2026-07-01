import { parseModel } from "../parser";
import { analyzeGraph } from "../analysis";
import { datasetColumnIndex, datasetRows } from "../datasets";
import { defaultEdgeMechanism, normalizeGraphDocumentMetadata, normalizeNodeMechanism, normalizeSelectionCondition, normalizeVariableModel } from "../graph";
import type { EdgeMechanismKind, GraphDocument, GraphDocumentMetadata, GraphEdge, GraphModel, GraphNode, NodeDistribution, NodeInteraction, NodeMechanism, Point, SimulationSelectionCondition, VariableModel } from "../types";

type VariablePatch = Partial<Omit<VariableModel, "measurement" | "simulation" | "intervention" | "adjustment">> & {
  measurement?: Partial<VariableModel["measurement"]>;
  simulation?: Partial<VariableModel["simulation"]>;
  intervention?: Partial<VariableModel["intervention"]>;
  adjustment?: Partial<VariableModel["adjustment"]>;
};

export const ZERO_NOISE: NodeDistribution = { kind: "constant", value: 0 };
export const UNIT_NORMAL: NodeDistribution = { kind: "normal", mean: 0, sd: 1 };

export const HIV_CD4_SEQUENCE_VISITS = 3;

export function prepareDocument(document: GraphDocument, seed: number): GraphDocument {
  return {
    ...document,
    graph: {
      ...document.graph,
      nodes: document.graph.nodes.map((node) => ({
        ...node,
        variable: normalizeVariableModel(node.variable)
      }))
    },
    simulation: {
      ...document.simulation,
      nodes: { ...document.simulation.nodes },
      edges: { ...document.simulation.edges },
      seed
    }
  };
}

const EXAMPLE_LAYER_GAP = 132;
const EXAMPLE_DEEP_LAYER_GAP = 104;
const EXAMPLE_NODE_GAP = 48;
const EXAMPLE_NODE_MIN_WIDTH = 124;
const EXAMPLE_NODE_MAX_WIDTH = 196;
const EXAMPLE_LABEL_CHAR_WIDTH = 7.4;
const EXAMPLE_FIGURELET_WIDTH = 116;
const EXAMPLE_COLLINEAR_THRESHOLD = 58;
const EXAMPLE_SINGLETON_NUDGE = 116;
const EXAMPLE_ROLE_ORDER: Record<keyof GraphNode["roles"], number> = {
  latent: 0,
  adjusted: 1,
  exposure: 2,
  outcome: 3,
  selected: 4,
  instrument: 5
};

export function layoutExampleDocument(document: GraphDocument): GraphDocument {
  return {
    ...document,
    graph: layoutExampleGraph(document.graph)
  };
}

function layoutExampleGraph(graph: GraphModel): GraphModel {
  if (graph.nodes.length <= 1) return graph;
  const directedEdges = graph.edges.filter(isRankedEdge);
  const rankById = rankExampleNodes(graph, directedEdges);
  const layers = orderExampleLayers(graph, directedEdges, rankById);
  const nodeWidth = new Map(graph.nodes.map((node) => [node.id, exampleLayoutNodeWidth(node)]));
  const positions = new Map<string, Point>();
  const layerGap = exampleLayerGap(layers.length);
  const totalHeight = (layers.length - 1) * layerGap;
  for (const [layerIndex, layer] of layers.entries()) {
    const xPositions = exampleLayerXPositions(layer, nodeWidth);
    for (const node of layer) {
      positions.set(node.id, {
        x: xPositions.get(node.id) ?? node.position.x,
        y: layerIndex * layerGap - totalHeight / 2
      });
    }
  }
  breakExampleSingletonCollinearity(layers, positions);
  centerExamplePositions(positions, nodeWidth);
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      position: positions.get(node.id) ?? node.position
    })),
    edges: graph.edges.map((edge) => edge.control ? { ...edge, control: undefined } : edge)
  };
}

function exampleLayerGap(layerCount: number): number {
  return layerCount >= 5 ? EXAMPLE_DEEP_LAYER_GAP : EXAMPLE_LAYER_GAP;
}

function exampleLayerXPositions(layer: GraphNode[], nodeWidth: Map<string, number>): Map<string, number> {
  const sorted = [...layer].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
  const positions = new Map(sorted.map((node) => [node.id, node.position.x]));
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    const minGap = ((nodeWidth.get(previous.id) ?? EXAMPLE_NODE_MIN_WIDTH) + (nodeWidth.get(current.id) ?? EXAMPLE_NODE_MIN_WIDTH)) / 2 + EXAMPLE_NODE_GAP;
    const previousX = positions.get(previous.id) ?? previous.position.x;
    const currentX = positions.get(current.id) ?? current.position.x;
    if (currentX - previousX < minGap) positions.set(current.id, previousX + minGap);
  }
  for (let index = sorted.length - 2; index >= 0; index -= 1) {
    const current = sorted[index]!;
    const next = sorted[index + 1]!;
    const minGap = ((nodeWidth.get(current.id) ?? EXAMPLE_NODE_MIN_WIDTH) + (nodeWidth.get(next.id) ?? EXAMPLE_NODE_MIN_WIDTH)) / 2 + EXAMPLE_NODE_GAP;
    const currentX = positions.get(current.id) ?? current.position.x;
    const nextX = positions.get(next.id) ?? next.position.x;
    if (nextX - currentX < minGap) positions.set(current.id, nextX - minGap);
  }
  const originalCenter = sorted.length === 0 ? 0 : sorted.reduce((sum, node) => sum + node.position.x, 0) / sorted.length;
  const adjustedCenter = sorted.length === 0 ? 0 : sorted.reduce((sum, node) => sum + (positions.get(node.id) ?? node.position.x), 0) / sorted.length;
  const delta = originalCenter - adjustedCenter;
  for (const node of sorted) positions.set(node.id, (positions.get(node.id) ?? node.position.x) + delta);
  return positions;
}

function breakExampleSingletonCollinearity(layers: GraphNode[][], positions: Map<string, Point>) {
  if (layers.length < 3) return;
  if (!layers.every((layer) => layer.length === 1)) return;
  for (let layerIndex = 1; layerIndex < layers.length - 1; layerIndex += 1) {
    const previous = layers[layerIndex - 1];
    const current = layers[layerIndex];
    const next = layers[layerIndex + 1];
    if (!previous || !current || !next || previous.length !== 1 || current.length !== 1 || next.length !== 1) continue;
    const previousPoint = positions.get(previous[0]!.id);
    const currentNode = current[0]!;
    const currentPoint = positions.get(currentNode.id);
    const nextPoint = positions.get(next[0]!.id);
    if (!previousPoint || !currentPoint || !nextPoint) continue;
    const expectedX = (previousPoint.x + nextPoint.x) / 2;
    if (Math.abs(currentPoint.x - expectedX) > EXAMPLE_COLLINEAR_THRESHOLD) continue;
    const direction = exampleSingletonNudgeDirection(currentNode, layerIndex, currentPoint.x - expectedX);
    positions.set(currentNode.id, {
      ...currentPoint,
      x: expectedX + direction * EXAMPLE_SINGLETON_NUDGE
    });
  }
}

function exampleSingletonNudgeDirection(node: GraphNode, layerIndex: number, deltaFromLine: number): -1 | 1 {
  if (node.roles.exposure) return -1;
  if (node.roles.outcome || node.roles.selected) return 1;
  if (Math.abs(deltaFromLine) > 1e-6) return deltaFromLine > 0 ? 1 : -1;
  return layerIndex % 2 === 0 ? 1 : -1;
}

function centerExamplePositions(positions: Map<string, Point>, nodeWidth: Map<string, number>) {
  if (positions.size === 0) return;
  const entries = [...positions.entries()];
  const minX = Math.min(...entries.map(([id, point]) => point.x - (nodeWidth.get(id) ?? EXAMPLE_NODE_MIN_WIDTH) / 2));
  const maxX = Math.max(...entries.map(([id, point]) => point.x + (nodeWidth.get(id) ?? EXAMPLE_NODE_MIN_WIDTH) / 2));
  const delta = -(minX + maxX) / 2;
  for (const [id, point] of entries) {
    positions.set(id, { ...point, x: point.x + delta });
  }
}

function rankExampleNodes(graph: GraphModel, directedEdges: GraphEdge[]): Map<string, number> {
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const children = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of directedEdges) {
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    children.get(edge.source)?.push(edge.target);
  }
  const order = originalExampleNodeOrder(graph);
  const ready = graph.nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .sort((a, b) => compareExampleNodes(a, b, order));
  const rank = new Map(graph.nodes.map((node) => [node.id, 0]));
  const visited = new Set<string>();
  while (ready.length > 0) {
    const node = ready.shift()!;
    visited.add(node.id);
    for (const child of children.get(node.id) ?? []) {
      rank.set(child, Math.max(rank.get(child) ?? 0, (rank.get(node.id) ?? 0) + 1));
      indegree.set(child, (indegree.get(child) ?? 0) - 1);
      if ((indegree.get(child) ?? 0) === 0) {
        const childNode = graph.nodes.find((candidate) => candidate.id === child);
        if (childNode) {
          ready.push(childNode);
          ready.sort((a, b) => compareExampleNodes(a, b, order));
        }
      }
    }
  }
  for (const node of graph.nodes) {
    if (!visited.has(node.id)) rank.set(node.id, Math.max(0, Math.round(node.position.y / EXAMPLE_LAYER_GAP)));
  }
  return compactExampleRanks(rank);
}

function compactExampleRanks(rank: Map<string, number>): Map<string, number> {
  const values = [...new Set(rank.values())].sort((a, b) => a - b);
  const compacted = new Map(values.map((value, index) => [value, index]));
  return new Map([...rank.entries()].map(([id, value]) => [id, compacted.get(value) ?? 0]));
}

function orderExampleLayers(graph: GraphModel, directedEdges: GraphEdge[], rankById: Map<string, number>): GraphNode[][] {
  const order = originalExampleNodeOrder(graph);
  const maxRank = Math.max(...rankById.values(), 0);
  const layers = Array.from({ length: maxRank + 1 }, (_, rank) => graph.nodes
    .filter((node) => rankById.get(node.id) === rank)
    .sort((a, b) => compareExampleNodes(a, b, order)));
  const parents = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  const children = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of directedEdges) {
    parents.get(edge.target)?.push(edge.source);
    children.get(edge.source)?.push(edge.target);
  }
  for (let pass = 0; pass < 4; pass += 1) {
    for (let rank = 1; rank < layers.length; rank += 1) {
      sortLayerByBarycenter(layers[rank]!, layers, parents, order);
    }
    for (let rank = layers.length - 2; rank >= 0; rank -= 1) {
      sortLayerByBarycenter(layers[rank]!, layers, children, order);
    }
  }
  return layers;
}

function sortLayerByBarycenter(layer: GraphNode[], layers: GraphNode[][], neighbors: Map<string, string[]>, order: Map<string, number>) {
  const indexById = new Map<string, number>();
  for (const currentLayer of layers) {
    currentLayer.forEach((node, index) => indexById.set(node.id, index));
  }
  layer.sort((a, b) => {
    const aScore = exampleBarycenter(a.id, neighbors, indexById);
    const bScore = exampleBarycenter(b.id, neighbors, indexById);
    if (Math.abs(aScore - bScore) > 1e-6) return aScore - bScore;
    return compareExampleNodes(a, b, order);
  });
}

function exampleBarycenter(nodeId: string, neighbors: Map<string, string[]>, indexById: Map<string, number>): number {
  const indexes = (neighbors.get(nodeId) ?? [])
    .map((neighbor) => indexById.get(neighbor))
    .filter((value): value is number => value !== undefined);
  if (indexes.length === 0) return Number.POSITIVE_INFINITY;
  return indexes.reduce((sum, value) => sum + value, 0) / indexes.length;
}

function compareExampleNodes(a: GraphNode, b: GraphNode, order: Map<string, number>): number {
  const roleDelta = exampleRoleSort(a) - exampleRoleSort(b);
  if (roleDelta !== 0) return roleDelta;
  const xDelta = a.position.x - b.position.x;
  if (Math.abs(xDelta) > 1e-6) return xDelta;
  const yDelta = a.position.y - b.position.y;
  if (Math.abs(yDelta) > 1e-6) return yDelta;
  return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
}

function exampleRoleSort(node: GraphNode): number {
  const active = (Object.keys(node.roles) as Array<keyof GraphNode["roles"]>)
    .filter((role) => node.roles[role])
    .map((role) => EXAMPLE_ROLE_ORDER[role]);
  return active.length === 0 ? 2.5 : Math.min(...active);
}

function originalExampleNodeOrder(graph: GraphModel): Map<string, number> {
  return new Map(graph.nodes.map((node, index) => [node.id, index]));
}

function isRankedEdge(edge: GraphEdge): boolean {
  return edge.kind === "directed" || edge.kind === "partialDirected";
}

function exampleLayoutNodeWidth(node: GraphNode): number {
  const labelLines = exampleNodeLabelLines(node.label || node.id);
  const labelWidth = Math.max(...labelLines.map((line) => line.length), 1) * EXAMPLE_LABEL_CHAR_WIDTH + 34;
  return Math.max(EXAMPLE_NODE_MIN_WIDTH, Math.min(EXAMPLE_NODE_MAX_WIDTH, Math.max(labelWidth, EXAMPLE_FIGURELET_WIDTH)));
}

function exampleNodeLabelLines(label: string): string[] {
  const normalized = label.replace(/_/g, " ").trim();
  if (normalized.length <= 11) return [normalized];
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [normalized];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= 11 || current.length === 0) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  if (lines.length <= 3) return lines;
  return [lines[0]!, lines[1]!, lines.slice(2).join(" ")];
}

type WhatIfMetadataConfig = {
  chapter: string;
  section: string;
  reference: string;
  longitudinal: GraphDocumentMetadata["longitudinal"];
};

export function applyWhatIfMetadata(document: GraphDocument, config: WhatIfMetadataConfig) {
  document.metadata = normalizeGraphDocumentMetadata({
    ...document.metadata,
    longitudinal: config.longitudinal,
    sources: [
      ...document.metadata.sources.filter((source) => source.id !== "hernan-robins-what-if"),
      {
        id: "hernan-robins-what-if",
        label: "What If",
        authors: "Miguel A. Hernan and James M. Robins",
        title: "Causal Inference: What If",
        year: "2025",
        url: "https://www.hsph.harvard.edu/miguel-hernan/causal-inference-book/",
        chapter: config.chapter,
        section: config.section,
        reference: config.reference,
        note: "Book-inspired structure; all app explanations and simulation settings are rewritten for Nudagitty."
      }
    ]
  });
}

export function staticStrategy(id: string, label: string, description: string, assignments: Array<[string, number]>): GraphDocumentMetadata["longitudinal"]["treatmentStrategies"][number] {
  return {
    id,
    label,
    description,
    kind: "static",
    assignments: assignments.map(([variable, value]) => ({ variable, value })),
    rules: []
  };
}

export function binaryStrategies(
  leftId: string,
  leftLabel: string,
  leftVariable: string,
  leftDescription: string,
  rightId: string,
  rightLabel: string,
  rightVariable: string,
  rightDescription: string
): GraphDocumentMetadata["longitudinal"]["treatmentStrategies"] {
  return [
    staticStrategy(leftId, leftLabel, leftDescription, [[leftVariable, 1]]),
    staticStrategy(rightId, rightLabel, rightDescription, [[rightVariable, 0]])
  ];
}

export function dynamicLowRiskStrategy(id: string, label: string, treatments: string[], riskVariables: string[], description: string): GraphDocumentMetadata["longitudinal"]["treatmentStrategies"][number] {
  return {
    id,
    label,
    description,
    kind: "dynamic",
    assignments: [],
    rules: treatments.map((variable, index) => ({
      variable,
      value: 1,
      conditionVariable: riskVariables[index] ?? riskVariables[riskVariables.length - 1] ?? variable,
      operator: "eq",
      conditionValue: 1,
      otherwise: 0
    }))
  };
}

export function riskEstimand(id: string, label: string, outcome: string, strategies: string[], horizon: string): GraphDocumentMetadata["longitudinal"]["estimands"][number] {
  return {
    id,
    label,
    type: "risk_difference",
    outcome,
    strategies,
    population: "baseline simulated cohort",
    horizon
  };
}

export function survivalSpec(id: string, label: string, eventVariables: string[], censoringVariables: string[]): GraphDocumentMetadata["longitudinal"]["survivalOutputs"][number] {
  return {
    id,
    label,
    timeVariable: null,
    eventVariable: eventVariables[0] ?? "",
    eventVariables,
    censoringVariable: censoringVariables[0] ?? null,
    censoringVariables,
    timeScale: "interval"
  };
}

export function markExposures(document: GraphDocument, ids: string[]) {
  const exposureIds = new Set(ids);
  document.graph.nodes = document.graph.nodes.map((node) => exposureIds.has(node.id) ? { ...node, roles: { ...node.roles, exposure: true } } : node);
}

export function setContinuousVariable(document: GraphDocument, id: string, description: string, unit: string, tags: string[] = [], measurement?: Partial<VariableModel["measurement"]>) {
  setVariable(document, id, {
    description,
    valueType: "continuous",
    unit,
    tags,
    measurement
  });
}

export function setBinaryVariable(document: GraphDocument, id: string, description: string, unit: string) {
  setVariable(document, id, {
    description,
    valueType: "binary",
    unit,
    categories: ["0", "1"],
    simulation: { mode: "expected_value" }
  });
}

export function setVariable(document: GraphDocument, id: string, patch: VariablePatch) {
  document.graph.nodes = document.graph.nodes.map((node) => {
    if (node.id !== id) return node;
    const variable = normalizeVariableModel(node.variable);
    return {
      ...node,
      variable: normalizeVariableModel({
        ...variable,
        ...patch,
        measurement: patch.measurement ? { ...variable.measurement, ...patch.measurement } : variable.measurement,
        simulation: patch.simulation ? { ...variable.simulation, ...patch.simulation } : variable.simulation,
        intervention: patch.intervention ? { ...variable.intervention, ...patch.intervention } : variable.intervention,
        adjustment: patch.adjustment ? { ...variable.adjustment, ...patch.adjustment } : variable.adjustment
      })
    };
  });
}

export function setExampleSampleSize(document: GraphDocument, sampleSize: number) {
  document.graph.nodes = document.graph.nodes.map((node) => {
    const variable = normalizeVariableModel(node.variable);
    return {
      ...node,
      variable: normalizeVariableModel({
        ...variable,
        simulation: {
          ...variable.simulation,
          sampleSize
        }
      })
    };
  });
}

export function setNode(document: GraphDocument, id: string, mechanism: Partial<NodeMechanism>) {
  document.simulation.nodes[id] = normalizeNodeMechanism(mechanism);
}

export function setLogitNode(document: GraphDocument, id: string, intercept: number) {
  setNode(document, id, { intercept, noise: ZERO_NOISE, combiner: "bernoulli_logit" });
}

// Add a smooth-gated interaction to a node: `gate` modulates the effect of `source` on `target`
// (the term added to target's equation is coefficient · source · sigmoid(steepness·(gate − threshold))).
// This is the "a node acts upon an edge" / moderator-effect-modifier primitive, and it is what the
// canvas renders as an arrow from `gate` onto the `source → target` edge. Merges onto any existing
// node mechanism so it can follow setLinearCoefficient/setLogitNode for the same target.
export function setSmoothGate(document: GraphDocument, target: string, source: string, gate: string, coefficient: number, threshold = 0.5, steepness = 6) {
  const current = normalizeNodeMechanism(document.simulation.nodes[target] ?? {});
  const interaction: NodeInteraction = { id: `gate-${source}-${gate}-${target}`, kind: "smooth_gated", source, gate, coefficient, threshold, steepness };
  document.simulation.nodes[target] = { ...current, interactions: [...current.interactions.filter((existing) => existing.id !== interaction.id), interaction] };
}

export function setLinearCoefficient(document: GraphDocument, source: string, target: string, coefficient: number) {
  const edge = document.graph.edges.find((candidate) => candidate.source === source && candidate.target === target);
  if (!edge) return;
  document.simulation.edges[edge.id] = { ...defaultEdgeMechanism("linear"), coefficient };
}

// Generate a block of CORRELATED covariates via a one-factor Gaussian copula (NORTA): a shared
// latent standard-normal `source` drives each covariate's standard-normal coordinate
// η = loading·source + residual (Var η = 1), which the `copula_marginal` combiner maps to the
// covariate's exact marginal as F⁻¹(Φ(η)). Pairwise correlation ≈ loading_i · loading_j, so
// same-sign loadings on the shared factor make the covariates co-vary while each marginal is hit
// exactly. The `source` node and one edge source→covariate must exist in the DAG code.
export function addCopulaCovariates(
  document: GraphDocument,
  sourceId: string,
  covariates: Array<{ id: string; marginal: NodeDistribution; loading: number }>
) {
  setNode(document, sourceId, { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  for (const { id, marginal, loading } of covariates) {
    const lambda = Math.max(-0.985, Math.min(0.985, loading));
    const residualSd = Math.sqrt(Math.max(0, 1 - lambda * lambda));
    setNode(document, id, {
      combiner: "copula_marginal",
      distribution: marginal,
      intercept: 0,
      noise: { kind: "normal", mean: 0, sd: residualSd }
    });
    setLinearCoefficient(document, sourceId, id, lambda);
  }
}

// Plasmode: generate covariates by resampling whole rows from an embedded real dataset. A shared
// `source` node draws a uniform row index over the dataset; each covariate's `table_lookup` edge
// reads its column from that same row, so the real joint dependence (and mixed types) is
// reproduced exactly. The `source` node and one edge source→covariate must exist in the DAG code.
export function addPlasmodeCovariates(
  document: GraphDocument,
  sourceId: string,
  dataset: string,
  covariates: Array<{ id: string; column: string }>
) {
  const rows = datasetRows(dataset);
  const n = Math.max(1, rows.length);
  setNode(document, sourceId, { distribution: { kind: "uniform", min: 0, max: n }, noise: ZERO_NOISE });
  for (const { id, column } of covariates) {
    setNode(document, id, { combiner: "additive", intercept: 0, noise: ZERO_NOISE });
    setEdgeMechanism(document, sourceId, id, "table_lookup", { dataset, dataColumn: datasetColumnIndex(dataset, column) });
  }
}

export function setEdgeMechanism(
  document: GraphDocument,
  source: string,
  target: string,
  kind: EdgeMechanismKind,
  patch: Partial<ReturnType<typeof defaultEdgeMechanism>>
) {
  const edge = document.graph.edges.find((candidate) => candidate.source === source && candidate.target === target);
  if (!edge) return;
  document.simulation.edges[edge.id] = { ...defaultEdgeMechanism(kind), ...patch };
}

export function setSelection(document: GraphDocument, id: string, condition: Partial<SimulationSelectionCondition>) {
  document.simulation.selections[id] = normalizeSelectionCondition(condition);
}

export function exampleSeed(id: string): number {
  return [...id].reduce((seed, char) => ((seed * 31) + char.charCodeAt(0)) >>> 0, 17) || 1;
}
