import { Fragment, cloneElement, createContext, isValidElement, useContext, useMemo, type ReactNode } from "react";
import type { GraphNode } from "@nudagitty/core";
import { displayNodeName } from "../outputs/estimand";

// A registry of every textual alias by which a node may appear in rendered copy
// (raw id, label, and their normalized display forms) mapped to the canonical
// chip name. Built once per document and shared via context so any text can be
// auto-highlighted without threading the node list everywhere.
export interface NodeNameRegistry {
  regex: RegExp | null;
  byText: Map<string, string>;
}

const EMPTY: NodeNameRegistry = { regex: null, byText: new Map() };
const NodeNamesContext = createContext<NodeNameRegistry>(EMPTY);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildNodeNameRegistry(nodes: GraphNode[]): NodeNameRegistry {
  // Keyed by LOWERCASED alias so matching is case-insensitive (prose paraphrases
  // a node's name in any casing — "survival", "Survival" — and all chip to the
  // node's canonical display). Over-matching common words is accepted by design.
  const byText = new Map<string, string>();
  const aliasSet = new Set<string>();
  for (const node of nodes) {
    const canonical = displayNodeName(node.label || node.id);
    for (const alias of [node.id, node.label, displayNodeName(node.id), displayNodeName(node.label || node.id)]) {
      const text = (alias ?? "").trim();
      if (text.length < 2) continue;
      aliasSet.add(text);
      const key = text.toLowerCase();
      if (!byText.has(key)) byText.set(key, canonical);
    }
  }
  // Longest alias first so "fall height" wins over "fall", "ICU_admission" over "ICU".
  const aliases = [...aliasSet].sort((a, b) => b.length - a.length);
  const regex = aliases.length
    ? new RegExp(`(?<![\\w])(${aliases.map(escapeRegExp).join("|")})(?![\\w])`, "gi")
    : null;
  return { regex, byText };
}

export function NodeNamesProvider({ nodes, children }: { nodes: GraphNode[]; children: ReactNode }) {
  const registry = useMemo(() => buildNodeNameRegistry(nodes), [nodes]);
  return <NodeNamesContext.Provider value={registry}>{children}</NodeNamesContext.Provider>;
}

export function useNodeNames(): NodeNameRegistry {
  return useContext(NodeNamesContext);
}

// Split a plain string into plain text + node-name chips.
export function highlightNodeNames(text: string, registry: NodeNameRegistry): ReactNode {
  if (!registry.regex || !text) return text;
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(registry.regex)) {
    const start = match.index ?? 0;
    const matched = match[0];
    if (start > last) out.push(<Fragment key={key++}>{text.slice(last, start)}</Fragment>);
    out.push(<span key={key++} className="node-name">{registry.byText.get(matched.toLowerCase()) ?? displayNodeName(matched)}</span>);
    last = start + matched.length;
  }
  if (out.length === 0) return text;
  if (last < text.length) out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return <>{out}</>;
}

// Highlight a single string leaf.
export function NodeText({ children }: { children: ReactNode }) {
  const registry = useNodeNames();
  if (typeof children !== "string") return <>{children}</>;
  return <>{highlightNodeNames(children, registry)}</>;
}

const SVG_TAGS = new Set([
  "svg", "g", "text", "tspan", "rect", "circle", "line", "path", "polyline",
  "polygon", "ellipse", "defs", "clipPath", "use", "marker", "foreignObject"
]);

function walk(node: ReactNode, registry: NodeNameRegistry, keyPrefix: string): ReactNode {
  if (node == null || typeof node === "boolean") return node;
  if (typeof node === "string") return highlightNodeNames(node, registry);
  if (typeof node === "number") return node;
  if (Array.isArray(node)) {
    // Re-created arrays need a key on EVERY element (the originals were static
    // siblings that didn't), so key cloned elements too, not just wrapped text.
    return node.map((child, index) => {
      const key = `${keyPrefix}.${index}`;
      const walked = walk(child, registry, key);
      if (isValidElement(walked)) return walked.key != null ? walked : cloneElement(walked, { key });
      return <Fragment key={key}>{walked}</Fragment>;
    });
  }
  if (isValidElement(node)) {
    // Don't descend into SVG (chips can't render there), inputs/selects, or chips.
    if (typeof node.type === "string" && SVG_TAGS.has(node.type)) return node;
    if (node.type === "input" || node.type === "select" || node.type === "textarea") return node;
    const props = node.props as { className?: unknown; children?: ReactNode };
    if (typeof props.className === "string" && props.className.includes("node-name")) return node;
    if (props.children == null) return node;
    return cloneElement(node, undefined, walk(props.children, registry, keyPrefix));
  }
  return node;
}

// Auto-highlight every string text node inside a subtree (skipping SVG, form
// controls, and existing chips). Wrap a card body once and all of its prose,
// labels, and static lines get node-name chips — no per-leaf wrapping.
export function HighlightNames({ children }: { children: ReactNode }) {
  const registry = useNodeNames();
  if (!registry.regex) return <>{children}</>;
  return <>{walk(children, registry, "h")}</>;
}

// An SVG-native node-name chip (rounded rect + monospace text) so figure axes
// speak the same visual language as the HTML chips. A smart drop-in: it renders
// a chip when the label is a recognized node name and plain <text> otherwise,
// so it can replace any axis-title <text> safely. Width is estimated from the
// monospace character count (no DOM measure available at render).
export function SvgAxisName(props: {
  label: string;
  x: number;
  y: number;
  fontSize?: number;
  transform?: string;
  className?: string;
  maxChars?: number;
}) {
  const registry = useNodeNames();
  const stripped = displayNodeName(props.label);
  // A bare node name, or the "name=value" axis form (e.g. "Survival=1") whose
  // name part is a node — chip the name, keep the "=value" as plain suffix.
  let canonical = registry.byText.get(stripped.toLowerCase());
  let suffix = "";
  if (!canonical) {
    const eq = stripped.indexOf("=");
    if (eq > 0) {
      const head = registry.byText.get(stripped.slice(0, eq).trim().toLowerCase());
      if (head) {
        canonical = head;
        suffix = stripped.slice(eq);
      }
    }
  }
  if (!canonical) {
    const text = props.maxChars && props.label.length > props.maxChars
      ? `${props.label.slice(0, Math.max(0, props.maxChars - 1))}…`
      : props.label;
    return <text className={props.className} x={props.x} y={props.y} transform={props.transform}>{text}</text>;
  }
  const fontSize = props.fontSize ?? 10;
  const chipText = props.maxChars && canonical.length > props.maxChars
    ? `${canonical.slice(0, Math.max(0, props.maxChars - 1))}…`
    : canonical;
  const chipWidth = chipText.length * fontSize * 0.6 + 11;
  const height = fontSize + 4;
  // Center the CHIP on the axis position (so a rotated y-axis chip never shifts
  // off its narrow margin); the "=value" suffix, if any, extends outward.
  return (
    <g transform={props.transform}>
      <rect className="svg-node-name-bg" x={props.x - chipWidth / 2} y={props.y - height / 2} width={chipWidth} height={height} rx={4} />
      <text className="svg-node-name" x={props.x} y={props.y} fontSize={fontSize} textAnchor="middle" dominantBaseline="central">{chipText}</text>
      {suffix && <text className={props.className} x={props.x + chipWidth / 2 + 2} y={props.y} dominantBaseline="central" style={{ textAnchor: "start" }}>{suffix}</text>}
    </g>
  );
}
