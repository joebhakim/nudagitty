import {
  EXAMPLES,
  defaultEdgeMechanism,
  defaultGraphDocumentMetadata,
  defaultNodeMechanism,
  defaultSimulationSpec,
  defaultVariableModel,
  edgeId,
  exampleDocument,
  GRAPH_DOCUMENT_SCHEMA_VERSION,
  initialDocument,
  normalizeEdgeMechanism,
  normalizeGraphDocumentMetadata,
  normalizeNodeMechanism,
  normalizeVariableModel,
  reconcileSimulationSpec
} from "@nudagitty/core";
import type {
  EdgeKind,
  EdgeMechanism,
  GraphDocumentMetadata,
  GraphDocument,
  GraphKind,
  GraphModel,
  GraphNode,
  NodeMechanism,
  NodeRoleFlags,
  Point,
  SimulationSelectionCondition,
  SimulationSpec,
  VariableModel
} from "@nudagitty/core";

export const STORAGE_KEY = "nudagitty.document.v2";
export const LEGACY_STORAGE_KEYS = ["nudagitty.document.v1"];
export const SHARE_DOCUMENT_HASH_KEY = "doc";
export const SHARE_COMPACT_HASH_KEY = "c";
export const SHARE_EXAMPLE_HASH_KEY = "example";
const SNAPSHOT_KIND = "nudagitty.snapshot";
const SNAPSHOT_VERSION = 1;
const COMPACT_SHARE_VERSION = 2;
const ROLE_CODES: Array<[keyof NodeRoleFlags, string]> = [
  ["exposure", "e"],
  ["outcome", "o"],
  ["adjusted", "a"],
  ["selected", "s"],
  ["latent", "l"]
];

export type ToolMode = "select" | "node" | "edge";
export type Selection = { kind: "node"; id: string } | { kind: "edge"; id: string } | null;
export type BibliographyTopic = "sem" | "nonlinear" | "probability" | "deep";
export type WorkbenchSnapshot = {
  kind: typeof SNAPSHOT_KIND;
  version: typeof SNAPSHOT_VERSION;
  savedAt: string;
  activeExampleId: string | null;
  document: GraphDocument;
};
export type LoadedWorkbenchState = {
  document: GraphDocument;
  activeExampleId: string | null;
  source: "share" | "example" | "local" | "default";
};
type CompactNode = {
  i: string;
  l?: string;
  x: number;
  y: number;
  r?: string;
  v?: Partial<VariableModel>;
};
type CompactEdge = {
  s: string;
  t: string;
  k?: EdgeKind;
  c?: Point;
};
type CompactSimulation = {
  d?: number;
  n?: Record<string, Partial<NodeMechanism>>;
  e?: Record<string, Partial<EdgeMechanism>>;
  o?: Record<string, number>;
  q?: Record<string, SimulationSelectionCondition>;
};
type CompactShareDocument = {
  v: typeof COMPACT_SHARE_VERSION;
  a?: string;
  t?: string;
  k?: GraphKind;
  m?: GraphDocumentMetadata;
  n: CompactNode[];
  e: CompactEdge[];
  s?: CompactSimulation;
};

export function loadInitialWorkbenchState(): LoadedWorkbenchState {
  const hashState = loadWorkbenchStateFromHash(window.location.hash);
  if (hashState) return hashState;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const loaded = loadWorkbenchStateFromUnknown(JSON.parse(stored), "local");
      if (loaded) return loaded;
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }
  for (const key of LEGACY_STORAGE_KEYS) window.localStorage.removeItem(key);
  return { document: initialDocument(), activeExampleId: EXAMPLES[0]?.id ?? null, source: "default" };
}

export function loadInitialDocument(): GraphDocument {
  return loadInitialWorkbenchState().document;
}

export function createWorkbenchSnapshot(document: GraphDocument, activeExampleId: string | null): WorkbenchSnapshot {
  return {
    kind: SNAPSHOT_KIND,
    version: SNAPSHOT_VERSION,
    savedAt: new Date().toISOString(),
    activeExampleId,
    document: normalizeGraphDocument(document) ?? document
  };
}

export function parseWorkbenchSnapshotText(text: string): LoadedWorkbenchState | null {
  try {
    return loadWorkbenchStateFromUnknown(JSON.parse(text), "share");
  } catch {
    return null;
  }
}

export function encodeWorkbenchSnapshot(snapshot: WorkbenchSnapshot): string {
  return encodeJsonBase64Url(snapshot);
}

export function decodeWorkbenchSnapshot(encoded: string): LoadedWorkbenchState | null {
  try {
    return loadWorkbenchStateFromUnknown(decodeJsonBase64Url(encoded), "share");
  } catch {
    return null;
  }
}

export function encodeCompactShareDocument(document: GraphDocument, activeExampleId: string | null): string {
  return encodeJsonBase64Url(compactShareDocument(document, activeExampleId));
}

export function decodeCompactShareDocument(encoded: string): LoadedWorkbenchState | null {
  try {
    return compactShareDocumentToState(decodeJsonBase64Url(encoded));
  } catch {
    return null;
  }
}

export function normalizeGraphDocument(raw: unknown): GraphDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<GraphDocument>;
  if (candidate.schemaVersion !== GRAPH_DOCUMENT_SCHEMA_VERSION || !candidate.graph || !candidate.simulation) return null;
  return {
    ...candidate,
    schemaVersion: GRAPH_DOCUMENT_SCHEMA_VERSION,
    id: typeof candidate.id === "string" ? candidate.id : crypto.randomUUID(),
    title: typeof candidate.title === "string" ? candidate.title : "Imported Nudagitty model",
    graph: candidate.graph,
    simulation: reconcileSimulationSpec(candidate.graph, candidate.simulation),
    metadata: normalizeGraphDocumentMetadata(candidate.metadata),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString()
  };
}

export function validExampleId(id: string | null | undefined): string | null {
  if (!id) return null;
  return EXAMPLES.some((example) => example.id === id) ? id : null;
}

export function snapshotFilename(document: GraphDocument): string {
  const base = (document.title || "nudagitty-model")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "nudagitty-model";
  return `${base}.nudagitty.json`;
}

function loadWorkbenchStateFromHash(hash: string): LoadedWorkbenchState | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const exampleId = validExampleId(params.get(SHARE_EXAMPLE_HASH_KEY));
  if (exampleId) {
    const document = exampleDocument(exampleId);
    if (document) return { document, activeExampleId: exampleId, source: "example" };
  }
  const encoded = params.get(SHARE_DOCUMENT_HASH_KEY);
  if (encoded) return decodeWorkbenchSnapshot(encoded);
  const compact = params.get(SHARE_COMPACT_HASH_KEY);
  if (compact) return decodeCompactShareDocument(compact);

  const legacyModel = params.get("model");
  if (legacyModel) {
    try {
      const document = normalizeGraphDocument(JSON.parse(decodeURIComponent(atob(legacyModel))));
      if (document) return { document, activeExampleId: null, source: "share" };
    } catch {
      return null;
    }
  }
  return null;
}

function loadWorkbenchStateFromUnknown(raw: unknown, source: LoadedWorkbenchState["source"]): LoadedWorkbenchState | null {
  const snapshot = raw as Partial<WorkbenchSnapshot>;
  if (snapshot?.kind === SNAPSHOT_KIND && snapshot.version === SNAPSHOT_VERSION) {
    const document = normalizeGraphDocument(snapshot.document);
    if (!document) return null;
    return { document, activeExampleId: validExampleId(snapshot.activeExampleId), source };
  }
  const document = normalizeGraphDocument(raw);
  if (!document) return null;
  return { document, activeExampleId: null, source };
}

function compactShareDocument(document: GraphDocument, activeExampleId: string | null): CompactShareDocument {
  const graph = document.graph;
  const exampleId = validExampleId(activeExampleId);
  const compactNodes = graph.nodes.map((node) => compactNode(node));
  const compactEdges = graph.edges.map((edge) => ({
    s: edge.source,
    t: edge.target,
    ...(edge.kind === "directed" ? {} : { k: edge.kind }),
    ...(edge.control ? { c: roundPoint(edge.control) } : {})
  }));
  const compact: CompactShareDocument = {
    v: COMPACT_SHARE_VERSION,
    ...(exampleId ? { a: exampleId } : {}),
    ...(document.title && document.title !== "Untitled model" ? { t: document.title } : {}),
    ...(graph.kind === "dag" ? {} : { k: graph.kind }),
    n: compactNodes,
    e: compactEdges
  };
  const metadata = stripDefaults(normalizeGraphDocumentMetadata(document.metadata), defaultGraphDocumentMetadata()) as GraphDocumentMetadata | undefined;
  if (metadata && !isEmptyObject(metadata)) compact.m = metadata;
  const simulation = compactSimulation(graph, document.simulation);
  if (simulation) compact.s = simulation;
  return compact;
}

function compactNode(node: GraphNode): CompactNode {
  const roleText = compactRoles(node.roles);
  const variable = stripDefaults(normalizeVariableModel(node.variable), defaultVariableModel()) as Partial<VariableModel>;
  return {
    i: node.id,
    ...(node.label === node.id ? {} : { l: node.label }),
    x: roundCoordinate(node.position.x),
    y: roundCoordinate(node.position.y),
    ...(roleText ? { r: roleText } : {}),
    ...(isEmptyObject(variable) ? {} : { v: variable })
  };
}

function compactSimulation(graph: GraphModel, simulation: SimulationSpec): CompactSimulation | null {
  const compact: CompactSimulation = {};
  if (simulation.seed !== 1) compact.d = simulation.seed;

  const nodes: Record<string, Partial<NodeMechanism>> = {};
  for (const node of graph.nodes) {
    const normalized = normalizeNodeMechanism(simulation.nodes[node.id]);
    const delta = stripDefaults(normalized, defaultNodeMechanism(node)) as Partial<NodeMechanism>;
    if (!isEmptyObject(delta)) nodes[node.id] = delta;
  }
  if (!isEmptyObject(nodes)) compact.n = nodes;

  const edges: Record<string, Partial<EdgeMechanism>> = {};
  for (const edge of graph.edges) {
    const normalized = normalizeEdgeMechanism(simulation.edges[edge.id]);
    const delta = stripDefaults(normalized, defaultEdgeMechanism(normalized.kind)) as Partial<EdgeMechanism>;
    if (normalized.kind !== "linear") delta.kind = normalized.kind;
    if (!isEmptyObject(delta)) edges[edge.id] = delta;
  }
  if (!isEmptyObject(edges)) compact.e = edges;

  if (!isEmptyObject(simulation.overrides)) compact.o = simulation.overrides;
  if (!isEmptyObject(simulation.selections)) compact.q = simulation.selections;
  return isEmptyObject(compact) ? null : compact;
}

function compactShareDocumentToState(raw: unknown): LoadedWorkbenchState | null {
  if (!raw || typeof raw !== "object") return null;
  const compact = raw as Partial<CompactShareDocument>;
  if (compact.v !== COMPACT_SHARE_VERSION || !Array.isArray(compact.n) || !Array.isArray(compact.e)) return null;
  const graph = compactGraph(compact);
  if (!graph) return null;
  const baseSimulation = defaultSimulationSpec(graph);
  const simulation = reconcileSimulationSpec(graph, {
    seed: Number.isFinite(compact.s?.d) ? compact.s?.d ?? baseSimulation.seed : baseSimulation.seed,
    nodes: {
      ...baseSimulation.nodes,
      ...Object.fromEntries(Object.entries(compact.s?.n ?? {}).map(([id, mechanism]) => [id, normalizeNodeMechanism({
        ...baseSimulation.nodes[id],
        ...mechanism
      })]))
    },
    edges: {
      ...baseSimulation.edges,
      ...Object.fromEntries(Object.entries(compact.s?.e ?? {}).map(([id, mechanism]) => {
        const kind = normalizeEdgeMechanism(mechanism).kind;
        return [id, normalizeEdgeMechanism({
          ...defaultEdgeMechanism(kind),
          ...mechanism
        })];
      }))
    },
    overrides: compact.s?.o ?? {},
    selections: compact.s?.q ?? {}
  });
  return {
    document: {
      schemaVersion: GRAPH_DOCUMENT_SCHEMA_VERSION,
      id: `shared-${crypto.randomUUID()}`,
      title: typeof compact.t === "string" && compact.t.trim() ? compact.t : "Shared Nudagitty model",
      graph,
      simulation,
      metadata: normalizeGraphDocumentMetadata(compact.m),
      updatedAt: new Date().toISOString()
    },
    activeExampleId: validExampleId(compact.a),
    source: "share"
  };
}

function compactGraph(compact: Partial<CompactShareDocument>): GraphModel | null {
  const nodes = compact.n?.map((node) => compactGraphNode(node)).filter((node): node is GraphNode => node !== null) ?? [];
  if (nodes.length !== compact.n?.length || new Set(nodes.map((node) => node.id)).size !== nodes.length) return null;
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = compact.e?.map((edge) => {
    if (!edge || typeof edge !== "object" || typeof edge.s !== "string" || typeof edge.t !== "string") return null;
    if (!nodeIds.has(edge.s) || !nodeIds.has(edge.t)) return null;
    const kind = edge.k ?? "directed";
    return {
      id: edgeId(edge.s, edge.t, kind),
      source: edge.s,
      target: edge.t,
      kind,
      ...(isPoint(edge.c) ? { control: roundPoint(edge.c) } : {})
    };
  }).filter((edge): edge is NonNullable<typeof edge> => edge !== null) ?? [];
  if (edges.length !== compact.e?.length) return null;
  return {
    kind: compact.k ?? "dag",
    nodes,
    edges
  };
}

function compactGraphNode(node: unknown): GraphNode | null {
  if (!node || typeof node !== "object") return null;
  const raw = node as Partial<CompactNode>;
  if (typeof raw.i !== "string" || typeof raw.x !== "number" || typeof raw.y !== "number" || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return null;
  return {
    id: raw.i,
    label: typeof raw.l === "string" ? raw.l : raw.i,
    position: { x: raw.x, y: raw.y },
    roles: expandRoles(raw.r),
    variable: normalizeVariableModel(raw.v)
  };
}

function compactRoles(roles: NodeRoleFlags): string {
  return ROLE_CODES.filter(([role]) => roles[role]).map(([, code]) => code).join("");
}

function expandRoles(raw: unknown): NodeRoleFlags {
  const text = typeof raw === "string" ? raw : "";
  return {
    exposure: text.includes("e"),
    outcome: text.includes("o"),
    adjusted: text.includes("a"),
    selected: text.includes("s"),
    latent: text.includes("l")
  };
}

function stripDefaults(value: unknown, defaults: unknown): unknown {
  if (Array.isArray(value)) return JSON.stringify(value) === JSON.stringify(defaults) ? undefined : value;
  if (!value || typeof value !== "object" || !defaults || typeof defaults !== "object") {
    return Object.is(value, defaults) ? undefined : value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const stripped = stripDefaults(child, (defaults as Record<string, unknown>)[key]);
    if (stripped !== undefined) out[key] = stripped;
  }
  return out;
}

function encodeJsonBase64Url(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeJsonBase64Url(encoded: string): unknown {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function isPoint(value: unknown): value is Point {
  return Boolean(value && typeof value === "object" && Number.isFinite((value as Point).x) && Number.isFinite((value as Point).y));
}

function roundPoint(point: Point): Point {
  return { x: roundCoordinate(point.x), y: roundCoordinate(point.y) };
}

function roundCoordinate(value: number): number {
  return Math.round(value * 10) / 10;
}

function isEmptyObject(value: object | undefined): boolean {
  return !value || Object.keys(value).length === 0;
}
