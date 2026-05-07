import {
  createGraphDocument,
  createNode,
  edgeId,
  ensureUniqueNodeId,
  normalizeId
} from "./graph";
import type { EdgeKind, GraphDocument, GraphEdge, GraphKind, GraphModel, GraphNode, NodeRoleFlags, ParsedModel } from "./types";

const EDGE_OPERATORS = ["@->", "<-@", "<->", "--@", "@--", "@-@", "->", "<-", "--"] as const;

type EdgeOperator = typeof EDGE_OPERATORS[number];

export function parseModel(text: string, title = "Imported model"): ParsedModel {
  const warnings: string[] = [];
  const { kind, body } = unwrapGraph(text);
  let graph: GraphModel = { kind, nodes: [], edges: [] };
  for (const statement of splitStatements(body)) {
    const parsed = parseStatement(statement, graph, warnings);
    graph = parsed;
  }
  if (graph.nodes.length === 0) {
    graph = {
      ...graph,
      nodes: [
        createNode("E", { x: -180, y: 80 }, { exposure: true }),
        createNode("D", { x: 180, y: 80 }, { outcome: true })
      ],
      edges: [{ id: edgeId("E", "D", "directed"), source: "E", target: "D", kind: "directed" }]
    };
  }
  const document = createGraphDocument(graph, title);
  return { document, warnings };
}

export function serializeModel(documentOrGraph: GraphDocument | GraphModel): string {
  const graph = "graph" in documentOrGraph ? documentOrGraph.graph : documentOrGraph;
  const lines = [`${graph.kind} {`];
  for (const node of [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    const attrs = serializeNodeAttrs(node);
    lines.push(`  ${quoteId(node.id)}${attrs.length ? ` [${attrs.join(",")}]` : ""}`);
  }
  for (const edge of [...graph.edges].sort((a, b) => a.id.localeCompare(b.id))) {
    const attrs = edge.control ? ` [pos="${formatNumber(edge.control.x)},${formatNumber(edge.control.y)}"]` : "";
    lines.push(`  ${quoteId(edge.source)} ${edgeToOperator(edge.kind)} ${quoteId(edge.target)}${attrs}`);
  }
  lines.push("}");
  return lines.join("\n");
}

export function serializeTikz(graph: GraphModel): string {
  const lines: string[] = [];
  for (const node of graph.nodes) {
    lines.push(`\\node (${safeTikzId(node.id)}) at (${formatNumber(node.position.x / 100)},${formatNumber(-node.position.y / 100)}) {${escapeTikz(node.label)}};`);
  }
  for (const edge of graph.edges) {
    const arrow = edge.kind === "directed" ? "->" : edge.kind === "bidirected" ? "<->" : "-";
    lines.push(`\\draw[${arrow}] (${safeTikzId(edge.source)}) -- (${safeTikzId(edge.target)});`);
  }
  return lines.join("\n");
}

function unwrapGraph(text: string): { kind: GraphKind; body: string } {
  const trimmed = text.trim();
  const match = /^(dag|digraph|mag|pdag|pag|graph)\s*(?:[A-Za-z0-9_.-]+)?\s*\{([\s\S]*)\}\s*$/i.exec(trimmed);
  if (!match) return { kind: "dag", body: trimmed };
  const kind = (match[1]?.toLowerCase() ?? "dag") as GraphKind;
  return { kind, body: match[2] ?? "" };
}

function splitStatements(body: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quote = false;
  let bracketDepth = 0;
  let braceDepth = 0;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index] ?? "";
    const previous = body[index - 1];
    if (char === '"' && previous !== "\\") quote = !quote;
    if (!quote) {
      if (char === "[") bracketDepth += 1;
      if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
      if (char === "{") braceDepth += 1;
      if (char === "}") braceDepth = Math.max(0, braceDepth - 1);
      if ((char === "\n" || char === ";") && bracketDepth === 0 && braceDepth === 0) {
        const trimmed = current.trim();
        if (trimmed) statements.push(trimmed);
        current = "";
        continue;
      }
    }
    current += char;
  }
  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements.filter((statement) => !statement.startsWith("//") && statement !== "}");
}

function parseStatement(statement: string, graph: GraphModel, warnings: string[]): GraphModel {
  if (/^(bb|layout|label)\s*=/.test(statement)) return graph;
  const oldSyntax = parseOldSyntax(statement, graph);
  if (oldSyntax) return oldSyntax;
  const edgeOp = findEdgeOperator(statement);
  if (edgeOp) return parseEdgeStatement(statement, edgeOp, graph, warnings);
  return parseNodeStatement(statement, graph, warnings);
}

function parseNodeStatement(statement: string, graph: GraphModel, warnings: string[]): GraphModel {
  const { head, attrs } = extractAttrs(statement);
  const id = unquoteId(head.trim().split(/\s+/)[0] ?? "");
  if (!id || id === "graph") return graph;
  const existing = graph.nodes.find((node) => node.id === id);
  const parsedAttrs = attrsToNode(attrs);
  const node: GraphNode = existing ? { ...existing, ...parsedAttrs, roles: { ...existing.roles, ...parsedAttrs.roles } } : {
    ...createNode(id, defaultPosition(graph.nodes.length), parsedAttrs.roles),
    ...parsedAttrs
  };
  const nodes = existing ? graph.nodes.map((candidate) => candidate.id === id ? node : candidate) : [...graph.nodes, node];
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) warnings.push(`Imported quoted or unusual node id "${id}".`);
  return { ...graph, nodes };
}

function parseEdgeStatement(statement: string, op: EdgeOperator, graph: GraphModel, warnings: string[]): GraphModel {
  const { head, attrs } = extractAttrs(statement);
  const parts = head.split(op);
  const left = parseEndpointList(parts[0] ?? "");
  const right = parseEndpointList(parts.slice(1).join(op));
  let next = graph;
  for (const id of [...left, ...right]) {
    if (!next.nodes.some((node) => node.id === id)) {
      next = { ...next, nodes: [...next.nodes, createNode(id, defaultPosition(next.nodes.length))] };
    }
  }
  const kind = operatorToKind(op);
  const control = attrsToPoint(attrs);
  for (const source of left) {
    for (const target of right) {
      const normalized = normalizeEdgeDirection(source, target, kind, op);
      const id = edgeId(normalized.source, normalized.target, normalized.kind);
      if (next.edges.some((edge) => edge.id === id)) continue;
      next = {
        ...next,
        edges: [...next.edges, { id, source: normalized.source, target: normalized.target, kind: normalized.kind, control }]
      };
    }
  }
  if (left.length === 0 || right.length === 0) warnings.push(`Could not fully parse edge statement "${statement}".`);
  return next;
}

function parseOldSyntax(statement: string, graph: GraphModel): GraphModel | null {
  if (statement.includes("[") || EDGE_OPERATORS.some((operator) => statement.includes(operator))) return null;
  const tokens = statement.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const roleToken = tokens[1];
  const maybePosition = tokens.find((token) => token.startsWith("@"));
  if (tokens.length >= 3 && maybePosition && roleToken) {
    const id = unquoteId(tokens[0] ?? "");
    const rolePatch: Partial<NodeRoleFlags> = {
      exposure: roleToken.includes("E"),
      outcome: roleToken.includes("O"),
      adjusted: roleToken.includes("A") || roleToken === "1",
      selected: roleToken.includes("S"),
      latent: roleToken.includes("U")
    };
    const [xRaw, yRaw] = maybePosition.slice(1).split(",");
    const point = { x: Number(xRaw) * 100, y: -Number(yRaw) * 100 };
    const node = createNode(id, Number.isFinite(point.x) && Number.isFinite(point.y) ? point : defaultPosition(graph.nodes.length), rolePatch);
    return { ...graph, nodes: [...graph.nodes.filter((candidate) => candidate.id !== id), node] };
  }
  if (tokens.length >= 2) {
    const source = unquoteId(tokens[0] ?? "");
    let next = graph.nodes.some((node) => node.id === source) ? graph : { ...graph, nodes: [...graph.nodes, createNode(source, defaultPosition(graph.nodes.length))] };
    for (const token of tokens.slice(1)) {
      const target = unquoteId(token);
      if (!next.nodes.some((node) => node.id === target)) {
        next = { ...next, nodes: [...next.nodes, createNode(target, defaultPosition(next.nodes.length))] };
      }
      const id = edgeId(source, target, "directed");
      if (!next.edges.some((edge) => edge.id === id)) {
        next = { ...next, edges: [...next.edges, { id, source, target, kind: "directed" }] };
      }
    }
    return next;
  }
  return null;
}

function findEdgeOperator(statement: string): EdgeOperator | null {
  return EDGE_OPERATORS.find((operator) => statement.includes(operator)) ?? null;
}

function parseEndpointList(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const inner = trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed.slice(1, -1) : trimmed;
  return splitEndpointTokens(inner).map(unquoteId).map(normalizeId).filter(Boolean);
}

function splitEndpointTokens(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? "";
    const previous = value[index - 1];
    if (char === '"' && previous !== "\\") quote = !quote;
    if (!quote && /[\s,]+/.test(char)) {
      if (current.trim()) tokens.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

function extractAttrs(statement: string): { head: string; attrs: string[] } {
  const match = /^(.*?)\s*\[([\s\S]*)\]\s*$/.exec(statement);
  if (!match) return { head: statement, attrs: [] };
  return { head: match[1]?.trim() ?? "", attrs: splitAttrs(match[2] ?? "") };
}

function splitAttrs(raw: string): string[] {
  const attrs: string[] = [];
  let current = "";
  let quote = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index] ?? "";
    const previous = raw[index - 1];
    if (char === '"' && previous !== "\\") quote = !quote;
    if (!quote && (char === "," || char === ";")) {
      if (current.trim()) attrs.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) attrs.push(current.trim());
  return attrs;
}

function attrsToNode(attrs: string[]): Partial<GraphNode> & { roles: NodeRoleFlags } {
  const rolePatch: Partial<NodeRoleFlags> = {};
  const patch: Partial<GraphNode> = {};
  for (const attr of attrs) {
    const [rawKey, ...rawValueParts] = attr.split("=");
    const key = (rawKey ?? "").trim().toLowerCase();
    const value = unquoteId(rawValueParts.join("=").trim());
    if (key === "exposure") rolePatch.exposure = true;
    if (key === "outcome") rolePatch.outcome = true;
    if (key === "adjusted") rolePatch.adjusted = true;
    if (key === "selected") rolePatch.selected = true;
    if (key === "latent" || key === "unobserved") rolePatch.latent = true;
    if (key === "label" && value) patch.label = value;
    if (key === "pos") {
      const point = parsePoint(value, true);
      if (point) patch.position = point;
    }
  }
  return {
    ...patch,
    roles: {
      exposure: rolePatch.exposure ?? false,
      outcome: rolePatch.outcome ?? false,
      adjusted: rolePatch.adjusted ?? false,
      selected: rolePatch.selected ?? false,
      latent: rolePatch.latent ?? false
    }
  };
}

function attrsToPoint(attrs: string[]) {
  const pos = attrs.find((attr) => attr.trim().toLowerCase().startsWith("pos="));
  if (!pos) return undefined;
  const value = unquoteId(pos.split("=").slice(1).join("=").trim());
  return parsePoint(value, true);
}

function parsePoint(value: string, dagittyScale: boolean) {
  const [xRaw, yRaw] = value.split(",");
  const x = Number(xRaw);
  const y = Number(yRaw);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return dagittyScale ? { x: x * 100, y: -y * 100 } : { x, y };
}

function serializeNodeAttrs(node: GraphNode): string[] {
  const attrs: string[] = [];
  if (node.roles.exposure) attrs.push("exposure");
  if (node.roles.outcome) attrs.push("outcome");
  if (node.roles.adjusted) attrs.push("adjusted");
  if (node.roles.selected) attrs.push("selected");
  if (node.roles.latent) attrs.push("latent");
  if (node.label !== node.id) attrs.push(`label="${escapeAttr(node.label)}"`);
  attrs.push(`pos="${formatNumber(node.position.x / 100)},${formatNumber(-node.position.y / 100)}"`);
  return attrs;
}

function operatorToKind(op: EdgeOperator): EdgeKind {
  if (op === "<->") return "bidirected";
  if (op === "--") return "undirected";
  if (op === "@->" || op === "<-@") return "partialDirected";
  if (op === "--@" || op === "@--") return "partialUndirected";
  if (op === "@-@") return "unspecified";
  return "directed";
}

function normalizeEdgeDirection(source: string, target: string, kind: EdgeKind, op: EdgeOperator): { source: string; target: string; kind: EdgeKind } {
  if (op === "<-" || op === "<-@") return { source: target, target: source, kind };
  return { source, target, kind };
}

function edgeToOperator(kind: EdgeKind): string {
  if (kind === "bidirected") return "<->";
  if (kind === "undirected") return "--";
  if (kind === "partialDirected") return "@->";
  if (kind === "partialUndirected") return "--@";
  if (kind === "unspecified") return "@-@";
  return "->";
}

function quoteId(id: string): string {
  return /^[A-Za-z0-9_.-]+$/.test(id) ? id : `"${escapeAttr(id)}"`;
}

function unquoteId(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return trimmed;
}

function escapeAttr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function defaultPosition(index: number) {
  const angle = index * 1.9;
  const radius = 150 + Math.floor(index / 6) * 70;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function safeTikzId(id: string): string {
  return id.replace(/[^A-Za-z0-9]/g, "_");
}

function escapeTikz(value: string): string {
  return value.replace(/([_#$%&{}])/g, "\\$1");
}

export function emptyDocument(): GraphDocument {
  return parseModel("dag {\n  E [exposure,pos=\"-1,0\"]\n  D [outcome,pos=\"1,0\"]\n  E -> D\n}", "New model").document;
}

export function createNewNodeId(graph: GraphModel): string {
  return ensureUniqueNodeId(graph, "V");
}
