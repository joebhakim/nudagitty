import type {
  PaperNetworkEffect,
  PaperNetworkIntervention,
  PaperNetworkNode,
  PaperNetworkStudy
} from "./types";
import type {
  CanvasSize,
  EffectRow,
  EffectSort,
  GraphMode,
  RenderEdge,
  ScreenNode
} from "./paperNetworkTypes";

const countFormatter = new Intl.NumberFormat("en-US");
const DEFAULT_INTERVENTION_SYMBOL = "RPS3";

export function projectNodes(nodes: PaperNetworkNode[], size: CanvasSize, maxDegree: number): ScreenNode[] {
  if (nodes.length === 0 || size.width <= 0 || size.height <= 0) return [];
  const padding = Math.max(22, Math.min(46, Math.min(size.width, size.height) * 0.08));
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }
  const dataWidth = Math.max(1, maxX - minX);
  const dataHeight = Math.max(1, maxY - minY);
  const availableWidth = Math.max(1, size.width - padding * 2);
  const availableHeight = Math.max(1, size.height - padding * 2);
  const scale = Math.min(availableWidth / dataWidth, availableHeight / dataHeight);
  const drawnWidth = dataWidth * scale;
  const drawnHeight = dataHeight * scale;
  const offsetX = (size.width - drawnWidth) / 2;
  const offsetY = (size.height - drawnHeight) / 2;

  return nodes.map((node) => {
    const eigen = node.metrics.eigenCentrality ?? 0;
    const degreeRatio = Math.sqrt(Math.max(0, node.metrics.degree) / maxDegree);
    return {
      node,
      x: offsetX + (node.x - minX) * scale,
      y: offsetY + (node.y - minY) * scale,
      radius: 3.4 + degreeRatio * 7.4 + eigen * 2.4
    };
  });
}

export function drawPaperNetwork(ctx: CanvasRenderingContext2D, props: {
  width: number;
  height: number;
  nodes: ScreenNode[];
  nodeById: Map<string, ScreenNode>;
  edges: RenderEdge[];
  selectedId: string;
  hoverId: string | null;
  maxAbsGraphValue: number;
  graphMode: GraphMode;
}) {
  ctx.fillStyle = "#f7f9fa";
  ctx.fillRect(0, 0, props.width, props.height);

  const selectedEdgeIds = new Set<string>();
  if (props.selectedId) {
    for (const edge of props.edges) {
      if (edge.source === props.selectedId || edge.target === props.selectedId) selectedEdgeIds.add(`${edge.source}->${edge.target}`);
    }
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const edge of props.edges) {
    const source = props.nodeById.get(edge.source);
    const target = props.nodeById.get(edge.target);
    if (!source || !target) continue;
    const selected = selectedEdgeIds.has(`${edge.source}->${edge.target}`);
    const strength = Math.min(1, Math.abs(edge.value) / props.maxAbsGraphValue);
    const dense = props.graphMode === "full";
    const alpha = dense ? 0.05 + strength * 0.24 : selected ? 0.72 : 0.34 + strength * 0.38;
    const color = edge.value >= 0 ? `rgba(35, 113, 111, ${alpha})` : `rgba(163, 59, 52, ${alpha})`;
    drawDirectedLine(ctx, source, target, color, dense ? 0.45 + strength * 1.3 : 1.2 + strength * 2.4, dense ? 5 + strength * 5 : 7 + strength * 6, edge.mediated);
  }

  const labelNodes = new Set<string>([
    props.selectedId,
    props.hoverId ?? "",
    ...props.nodes
      .filter((item) => props.nodes.length <= 55 || item.node.metrics.outDegree >= 180 || (item.node.metrics.eigenCentrality ?? 0) >= 0.72)
      .map((item) => item.node.id)
      .slice(0, props.graphMode === "full" ? 14 : 24)
  ]);

  for (const item of props.nodes) {
    const selected = item.node.id === props.selectedId;
    const hovered = item.node.id === props.hoverId;
    const degreeRatio = Math.min(1, item.node.metrics.outDegree / 250);
    ctx.beginPath();
    ctx.arc(item.x, item.y, item.radius + (selected ? 4.2 : hovered ? 2.4 : 0), 0, Math.PI * 2);
    ctx.fillStyle = selected ? "#16282c" : hovered ? "#ffffff" : "#ffffff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
    ctx.fillStyle = selected ? "#23716f" : blendColor("#6e7982", "#2f6fa6", degreeRatio);
    ctx.fill();
    ctx.lineWidth = selected || hovered ? 1.8 : 0.7;
    ctx.strokeStyle = selected ? "#16282c" : hovered ? "#202428" : "rgba(255,255,255,0.82)";
    ctx.stroke();
  }

  ctx.font = "700 11px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  for (const item of props.nodes) {
    if (!labelNodes.has(item.node.id)) continue;
    const text = item.node.symbol;
    const x = item.x + item.radius + 4;
    const y = item.y;
    const width = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    roundRect(ctx, x - 3, y - 8, width + 6, 16, 4);
    ctx.fill();
    ctx.fillStyle = item.node.id === props.selectedId ? "#16282c" : "#34414a";
    ctx.fillText(text, x, y);
  }
}

function drawDirectedLine(ctx: CanvasRenderingContext2D, source: ScreenNode, target: ScreenNode, color: string, width: number, arrowSize: number, dashed = false) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / distance;
  const uy = dy / distance;
  const startX = source.x + ux * (source.radius + 1);
  const startY = source.y + uy * (source.radius + 1);
  const endX = target.x - ux * (target.radius + 3);
  const endY = target.y - uy * (target.radius + 3);

  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dashed ? [6, 4] : []);
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.setLineDash([]);

  const angle = Math.atan2(uy, ux);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - Math.cos(angle - Math.PI / 6) * arrowSize, endY - Math.sin(angle - Math.PI / 6) * arrowSize);
  ctx.lineTo(endX - Math.cos(angle + Math.PI / 6) * arrowSize, endY - Math.sin(angle + Math.PI / 6) * arrowSize);
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

export function defaultInterventionGeneId(study: PaperNetworkStudy): string {
  return study.nodes.find((node) => node.symbol === DEFAULT_INTERVENTION_SYMBOL)?.id
    ?? study.featuredInterventionGenes[0]?.id
    ?? study.summary.topOutDegreeGenes[0]?.id
    ?? study.nodes[0]?.id
    ?? "";
}

export function sortEffectRows(left: EffectRow, right: EffectRow, sort: EffectSort): number {
  if (sort === "fdr") {
    return (left.effect.fdr ?? 1) - (right.effect.fdr ?? 1) || Math.abs(right.predicted) - Math.abs(left.predicted);
  }
  if (sort === "ace") return Math.abs(right.effect.ace) - Math.abs(left.effect.ace);
  return Math.abs(right.predicted) - Math.abs(left.predicted);
}

export function effectMechanicLabel(effect: PaperNetworkEffect): string {
  const hasDirect = Math.abs(effect.directEffect) > 0;
  if (!hasDirect && effect.pathLength !== null) return `mediated path ${effect.pathLength}`;
  if (!hasDirect) return "no sparse path";
  if (effect.ace * effect.directEffect < 0) return "signs disagree";
  if (effect.effectExplained !== null && effect.effectExplained > 1) return "path cancellation";
  return "direct edge";
}

export function directionShare(intervention: PaperNetworkIntervention, direction: "positive" | "negative"): number {
  const total = Math.max(1, intervention.summary.significantPositiveTotalCount + intervention.summary.significantNegativeTotalCount);
  const count = direction === "positive" ? intervention.summary.significantPositiveTotalCount : intervention.summary.significantNegativeTotalCount;
  return Math.max(8, (count / total) * 100);
}

export function interventionScore(node: PaperNetworkNode, interventions: Map<string, PaperNetworkIntervention>): number {
  return interventions.get(node.id)?.summary.significantTotalEffectCount ?? 0;
}

export function searchRank(node: PaperNetworkNode, query: string): number {
  const symbol = node.symbol.toLowerCase();
  const id = node.id.toLowerCase();
  if (symbol === query || id === query) return 0;
  if (symbol.startsWith(query)) return 1;
  if (id.startsWith(query)) return 2;
  if (symbol.includes(query)) return 3;
  return 4;
}

function blendColor(from: string, to: string, amount: number): string {
  const left = hexToRgb(from);
  const right = hexToRgb(to);
  const clamped = Math.max(0, Math.min(1, amount));
  return `rgb(${Math.round(left.r + (right.r - left.r) * clamped)}, ${Math.round(left.g + (right.g - left.g) * clamped)}, ${Math.round(left.b + (right.b - left.b) * clamped)})`;
}

function hexToRgb(hex: string) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16)
  };
}

export function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function formatCount(value: number): string {
  return countFormatter.format(value);
}

export function formatNullableCount(value: number | null): string {
  return value === null ? "n/a" : countFormatter.format(value);
}

export function formatFixed(value: number, digits: number): string {
  return value.toFixed(digits);
}

export function formatSigned(value: number, digits: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatNullable(value: number | null, digits: number): string {
  return value === null ? "n/a" : value.toFixed(digits);
}

export function formatSignedNullable(value: number | null, digits: number): string {
  return value === null ? "n/a" : formatSigned(value, digits);
}

export function formatPValue(value: number | null): string {
  if (value === null) return "n/a";
  if (value === 0) return "<1e-6";
  if (value < 0.001) return value.toExponential(1);
  return value.toFixed(3);
}

export function formatEffectExplained(value: number | null): string {
  if (value === null) return "n/a";
  return `${(value * 100).toFixed(0)}%`;
}
