import type {
  EdgeKind,
  EdgeMechanism,
  EdgeMechanismKind,
  GraphDocument,
  GraphEdge,
  GraphKind,
  GraphModel,
  GraphNode,
  NodeDistribution,
  NodeInteraction,
  NodeMechanism,
  NodeRoleFlags,
  Point,
  SimulationSpec,
  SimulationSelectionCondition,
  AdjustmentMethodKind,
  InterventionKind,
  MeasurementModelKind,
  SimulationDisplayMode,
  VariableValueType,
  VariableModel
} from "./types";

const NODE_COMBINER_KINDS = new Set([
  "additive",
  "bounded_logistic",
  "positive_softplus",
  "bernoulli_logit",
  "poisson_log",
  "gamma_log",
  "noisy_or"
]);

const EDGE_MECHANISM_KINDS = new Set([
  "linear",
  "threshold",
  "smooth_threshold",
  "saturating",
  "quadratic",
  "piecewise_linear",
  "hill_emax",
  "log_linear",
  "power_law",
  "monotone_spline"
]);

const DEFAULT_ROLES: NodeRoleFlags = {
  exposure: false,
  outcome: false,
  adjusted: false,
  selected: false,
  latent: false
};

const VARIABLE_VALUE_TYPES: ReadonlySet<VariableValueType> = new Set([
  "continuous",
  "binary",
  "categorical",
  "ordinal",
  "count",
  "positive",
  "proportion",
  "time_to_event",
  "vector",
  "time_series",
  "text",
  "embedding",
  "distributional"
]);

const MEASUREMENT_MODEL_KINDS: ReadonlySet<MeasurementModelKind> = new Set([
  "observed",
  "noisy_proxy",
  "latent_construct",
  "censored",
  "rounded",
  "missing_prone"
]);

const INTERVENTION_KINDS: ReadonlySet<InterventionKind> = new Set([
  "none",
  "hard_do",
  "soft_shift",
  "stochastic",
  "policy",
  "manual_override"
]);

const SIMULATION_DISPLAY_MODES: ReadonlySet<SimulationDisplayMode> = new Set([
  "single_draw",
  "expected_value",
  "population_mean",
  "uncertainty_band",
  "causal_contrast"
]);

const ADJUSTMENT_METHOD_KINDS: ReadonlySet<AdjustmentMethodKind> = new Set([
  "none",
  "bins",
  "stabilized_ipw",
  "propensity_score_todo"
]);

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
      cutpoints: []
    },
    tags: []
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
    schemaVersion: 1,
    id: `model-${Math.random().toString(36).slice(2, 10)}`,
    title,
    graph: model,
    simulation: defaultSimulationSpec(model),
    updatedAt: nowIso()
  };
}

export function cloneDocument(document: GraphDocument): GraphDocument {
  return {
    ...document,
    graph: cloneGraph(document.graph),
    simulation: cloneSimulationSpec(document.simulation)
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
    selections: Object.fromEntries(Object.entries(spec.selections ?? {}).map(([id, condition]) => [id, normalizeSelectionCondition(condition)]))
  };
}

export function cloneNodeMechanism(mechanism: NodeMechanism): NodeMechanism {
  return normalizeNodeMechanism(mechanism);
}

export function normalizeNodeMechanism(mechanism: Partial<NodeMechanism> | undefined): NodeMechanism {
  return {
    distribution: normalizeNodeDistribution(mechanism?.distribution),
    intercept: mechanism?.intercept ?? 0,
    noise: normalizeNodeDistribution(mechanism?.noise, "constant"),
    combiner: isNodeCombinerKind(mechanism?.combiner) ? mechanism.combiner : "additive",
    interactions: (mechanism?.interactions ?? []).map(cloneInteraction)
  };
}

export function normalizeEdgeMechanism(mechanism: Partial<EdgeMechanism> | undefined): EdgeMechanism {
  const kind = isEdgeMechanismKind(mechanism?.kind) ? mechanism.kind : "linear";
  const base = defaultEdgeMechanism(kind);
  return {
    ...base,
    ...mechanism,
    kind,
    enabled: mechanism?.enabled ?? true,
    coefficient: numberOr(mechanism?.coefficient, base.coefficient),
    threshold: numberOr(mechanism?.threshold, base.threshold),
    low: numberOr(mechanism?.low, base.low),
    high: numberOr(mechanism?.high, base.high),
    scale: positiveOr(mechanism?.scale, base.scale),
    steepness: positiveOr(mechanism?.steepness, base.steepness),
    midpoint: numberOr(mechanism?.midpoint, base.midpoint),
    beta1: numberOr(mechanism?.beta1, base.beta1),
    beta2: numberOr(mechanism?.beta2, base.beta2),
    baseline: numberOr(mechanism?.baseline, base.baseline),
    maxEffect: numberOr(mechanism?.maxEffect, base.maxEffect),
    ec50: positiveOr(mechanism?.ec50, base.ec50),
    exponent: positiveOr(mechanism?.exponent, base.exponent),
    offset: numberOr(mechanism?.offset, base.offset),
    points: normalizePiecewisePoints(mechanism?.points, base.points)
  };
}

function cloneInteraction(interaction: NodeInteraction): NodeInteraction {
  return { ...interaction };
}

export function normalizeVariableModel(model: Partial<VariableModel> | undefined): VariableModel {
  const base = defaultVariableModel();
  const raw = (model ?? {}) as Record<string, unknown>;
  const measurement = (raw.measurement ?? {}) as Record<string, unknown>;
  const intervention = (raw.intervention ?? {}) as Record<string, unknown>;
  const simulation = (raw.simulation ?? {}) as Record<string, unknown>;
  const adjustment = (raw.adjustment ?? {}) as Record<string, unknown>;
  return {
    description: stringOr(raw.description, base.description),
    valueType: isMember(raw.valueType, VARIABLE_VALUE_TYPES) ? raw.valueType : base.valueType,
    unit: stringOr(raw.unit, base.unit),
    categories: stringListOr(raw.categories),
    measurement: {
      kind: isMember(measurement.kind, MEASUREMENT_MODEL_KINDS) ? measurement.kind : base.measurement.kind,
      errorSd: nonnegativeOr(measurement.errorSd, base.measurement.errorSd),
      missingRate: clamp01(numberOr(measurement.missingRate, base.measurement.missingRate)),
      lowerLimit: nullableNumber(measurement.lowerLimit),
      upperLimit: nullableNumber(measurement.upperLimit)
    },
    intervention: {
      kind: isMember(intervention.kind, INTERVENTION_KINDS) ? intervention.kind : base.intervention.kind,
      value: numberOr(intervention.value, base.intervention.value),
      shift: numberOr(intervention.shift, base.intervention.shift),
      probability: clamp01(numberOr(intervention.probability, base.intervention.probability))
    },
    simulation: {
      mode: isMember(simulation.mode, SIMULATION_DISPLAY_MODES) ? simulation.mode : base.simulation.mode,
      sampleSize: integerOr(simulation.sampleSize, base.simulation.sampleSize, 1)
    },
    adjustment: {
      method: isMember(adjustment.method, ADJUSTMENT_METHOD_KINDS) ? adjustment.method : base.adjustment.method,
      cutpoints: numberListOr(adjustment.cutpoints)
    },
    tags: stringListOr(raw.tags)
  };
}

export function normalizeNodeDistribution(distribution: Partial<NodeDistribution> | undefined, fallbackKind: NodeDistribution["kind"] = "constant"): NodeDistribution {
  const raw = (distribution ?? {}) as Record<string, unknown> & { kind?: NodeDistribution["kind"] };
  const kind = raw.kind ?? fallbackKind;
  if (kind === "normal") return { kind, mean: numberOr(raw.mean, 0), sd: positiveOr(raw.sd, 1) };
  if (kind === "lognormal") return { kind, meanLog: numberOr(raw.meanLog, 0), sdLog: positiveOr(raw.sdLog, 1) };
  if (kind === "uniform") {
    const min = numberOr(raw.min, 0);
    const max = numberOr(raw.max, 1);
    return min <= max ? { kind, min, max } : { kind, min: max, max: min };
  }
  if (kind === "bernoulli") return { kind, p: clamp01(numberOr(raw.p, 0.5)) };
  if (kind === "poisson") return { kind, lambda: positiveOr(raw.lambda, 1) };
  if (kind === "beta") return { kind, alpha: positiveOr(raw.alpha, 2), beta: positiveOr(raw.beta, 2) };
  if (kind === "laplace") return { kind, mean: numberOr(raw.mean, 0), scale: positiveOr(raw.scale, 1) };
  if (kind === "student_t") return { kind, mean: numberOr(raw.mean, 0), scale: positiveOr(raw.scale, 1), df: positiveOr(raw.df, 5) };
  if (kind === "gamma") return { kind, shape: positiveOr(raw.shape, 2), scale: positiveOr(raw.scale, 1) };
  if (kind === "exponential") return { kind, rate: positiveOr(raw.rate, 1) };
  return { kind: "constant", value: numberOr(raw.value, 0) };
}

export function normalizeSelectionCondition(condition: Partial<SimulationSelectionCondition> | undefined): SimulationSelectionCondition {
  const operator = condition?.operator === "at_most" || condition?.operator === "between" || condition?.operator === "one_of" ? condition.operator : "at_least";
  const value = numberOr(condition?.value, 0);
  const rawUpper = nullableNumber(condition?.upper);
  const valueRef = typeof condition?.valueRef === "string" && condition.valueRef.length > 0 ? condition.valueRef : null;
  const upperRef = typeof condition?.upperRef === "string" && condition.upperRef.length > 0 ? condition.upperRef : null;
  const sampling = condition?.sampling === "rejection" || condition?.sampling === "importance" || condition?.sampling === "analytic" ? condition.sampling : "auto";
  if (operator === "one_of") {
    const values = Array.isArray(condition?.values)
      ? [...new Set(condition.values.filter((item) => Number.isFinite(item)).map((item) => Number(item)))].sort((a, b) => a - b)
      : [value];
    return { operator, value: values[0] ?? value, upper: null, valueRef: null, upperRef: null, values, sampling: "rejection" };
  }
  if (operator !== "between") return { operator, value, upper: null, valueRef, upperRef: null, sampling };
  const upper = rawUpper ?? value;
  // Only swap literal bounds for ordering when neither side is a ref - we cannot compare refs at normalization time.
  if (valueRef || upperRef) return { operator, value, upper, valueRef, upperRef, sampling };
  return value <= upper ? { operator, value, upper, valueRef: null, upperRef: null, sampling } : { operator, value: upper, upper: value, valueRef: null, upperRef: null, sampling };
}

function isNodeCombinerKind(value: unknown): value is NodeMechanism["combiner"] {
  return typeof value === "string" && NODE_COMBINER_KINDS.has(value);
}

function isEdgeMechanismKind(value: unknown): value is EdgeMechanismKind {
  return typeof value === "string" && EDGE_MECHANISM_KINDS.has(value);
}

function normalizePiecewisePoints(points: EdgeMechanism["points"] | undefined, fallback: EdgeMechanism["points"]): EdgeMechanism["points"] {
  const normalized = (points ?? [])
    .map((point) => ({ x: numberOr(point.x, Number.NaN), y: numberOr(point.y, Number.NaN) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  return normalized.length >= 2 ? normalized : fallback.map((point) => ({ ...point }));
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function integerOr(value: unknown, fallback: number, min = Number.NEGATIVE_INFINITY): number {
  const next = Math.round(numberOr(value, fallback));
  return next >= min ? next : fallback;
}

function nonnegativeOr(value: unknown, fallback: number): number {
  const next = numberOr(value, fallback);
  return next >= 0 ? next : fallback;
}

function positiveOr(value: unknown, fallback: number): number {
  const next = numberOr(value, fallback);
  return next > 0 ? next : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function stringListOr(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
}

function numberListOr(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)).sort((a, b) => a - b);
}

function isMember<T extends string>(value: unknown, values: ReadonlySet<T>): value is T {
  return typeof value === "string" && values.has(value as T);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

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
