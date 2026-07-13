import { clamp } from "../shared/formatting";
import type { EdgeMechanism, GraphEdge, GraphNode, Point } from "@nudagitty/core";
import type { ArrowHeadGeometry, EdgeGeometry, FlowGraphEdgeData } from "../app/types";
import {
  EDGE_ARROW_NODE_OVERLAP,
  EDGE_ARROW_TIP_EXTENSION_FACTOR,
  EDGE_CROWDED_FAN_MAX_OFFSET,
  EDGE_CROWDED_FAN_SPACING,
  EDGE_CROWDED_FAN_THRESHOLD,
  EDGE_ENDPOINT_PORT_DISTANCE,
  EDGE_ENDPOINT_PORT_MAX_OFFSET,
  EDGE_ENDPOINT_PORT_SPACING,
  EDGE_OUTGOING_FAN_MAX_OFFSET,
  EDGE_OUTGOING_FAN_SPACING,
  EDGE_OUTGOING_FAN_THRESHOLD,
  EDGE_SOURCE_CLEARANCE,
  FLOW_NODE_CENTER_X,
  FLOW_NODE_CENTER_Y,
  NODE_DISTRIBUTION_BOUNDS
} from "../app/constants";

export function flowEdgeClassName(data: FlowGraphEdgeData, selected?: boolean): string {
  const edgeStrength = edgeMechanismDisplayStrength(data.mechanism);
  const coefficientClass = edgeStrength > 0 ? "coefficient-positive" : edgeStrength < 0 ? "coefficient-negative" : "coefficient-zero";
  // `inert` is NOT `disabled`: disabled is a switch the user flipped; inert is an arrow they drew that the
  // engine silently ignores because its target replays its data column. It has to LOOK dead, or the canvas
  // keeps promising a model that isn't running.
  return `edge ${coefficientClass} ${selected ? "selected" : ""} ${data.semantic ?? ""} ${data.enabled ? "" : "disabled"} ${data.inert ? "inert" : ""}`;
}

export function graphPointToFlowPoint(point: Point): Point {
  return {
    x: point.x - FLOW_NODE_CENTER_X,
    y: point.y - FLOW_NODE_CENTER_Y
  };
}

export function flowNodePositionToGraphPoint(point: Point): Point {
  return {
    x: point.x + FLOW_NODE_CENTER_X,
    y: point.y + FLOW_NODE_CENTER_Y
  };
}


export function edgeVisibleStrokePath(geometry: EdgeGeometry, startArrow: ArrowHeadGeometry | null, endArrow: ArrowHeadGeometry | null): string {
  const start = startArrow?.base ?? geometry.start;
  const end = endArrow?.base ?? geometry.end;
  if (geometry.curved) return `M ${start.x} ${start.y} Q ${geometry.control.x} ${geometry.control.y} ${end.x} ${end.y}`;
  return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
}

export function arrowHeadGeometry(tip: Point, from: Point, strokeWidth: number): ArrowHeadGeometry {
  const direction = unitVector(from, tip);
  const length = clamp(strokeWidth * 3.1, 7.5, 11);
  const halfWidth = clamp(strokeWidth * 1.55, 3.8, 5.8);
  const base = {
    x: tip.x - direction.x * length,
    y: tip.y - direction.y * length
  };
  const normal = { x: -direction.y, y: direction.x };
  const left = {
    x: base.x + normal.x * halfWidth,
    y: base.y + normal.y * halfWidth
  };
  const right = {
    x: base.x - normal.x * halfWidth,
    y: base.y - normal.y * halfWidth
  };
  return {
    base,
    path: `M ${tip.x} ${tip.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`
  };
}

export function edgeMechanismDisplayStrength(mechanism: EdgeMechanism): number {
  if (mechanism.kind === "linear") return mechanism.coefficient;
  if (mechanism.kind === "absorbing") return 1;
  if (mechanism.kind === "threshold") return mechanism.high - mechanism.low;
  if (mechanism.kind === "smooth_threshold" || mechanism.kind === "saturating") return mechanism.scale;
  if (mechanism.kind === "quadratic") return mechanism.beta1 + mechanism.beta2;
  if (mechanism.kind === "piecewise_linear" || mechanism.kind === "monotone_spline") {
    const first = mechanism.points[0];
    const last = mechanism.points.at(-1);
    if (!first || !last) return 0;
    return last.y - first.y;
  }
  if (mechanism.kind === "hill_emax") return mechanism.maxEffect;
  if (mechanism.kind === "log_linear" || mechanism.kind === "power_law") return mechanism.coefficient;
  return 0;
}

export function edgeGeometry(edge: GraphEdge, source: GraphNode, target: GraphNode, strokeWidth: number, edges: GraphEdge[], nodesById: Map<string, GraphNode>): EdgeGeometry {
  const automaticControl = automaticControlPoint(edge, source, target, edges, nodesById);
  const control = edge.control ?? automaticControl.point;
  const curved = !!edge.control || automaticControl.curved;
  const arrowClearance = edgeArrowClearance(strokeWidth);
  const startClearance = edge.kind === "bidirected" ? arrowClearance : EDGE_SOURCE_CLEARANCE;
  const endClearance = edge.kind === "directed" || edge.kind === "bidirected" ? arrowClearance : EDGE_SOURCE_CLEARANCE;
  const sourcePortOffset = crowdedSourcePortOffset(edge, edges, nodesById);
  const targetPortOffset = crowdedTargetPortOffset(edge, edges, nodesById);
  if (!curved) {
    const start = nodeBoundaryPoint(source, endpointPortToward(source.position, target.position, sourcePortOffset), startClearance, { includeDistribution: edge.kind === "bidirected" });
    const end = nodeBoundaryPoint(target, endpointPortToward(target.position, source.position, targetPortOffset), endClearance, { includeDistribution: edge.kind === "bidirected" });
    return { path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`, control, label: control, start, end, curved: false };
  }
  const start = nodeBoundaryPoint(source, endpointPortToward(source.position, control, sourcePortOffset), startClearance, { includeDistribution: edge.kind === "bidirected" });
  const end = nodeBoundaryPoint(target, endpointPortToward(target.position, control, targetPortOffset), endClearance, { includeDistribution: edge.kind === "bidirected" });
  return { path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`, control, label: control, start, end, curved: true };
}

export function edgeArrowClearance(strokeWidth: number): number {
  return Math.max(1.25, strokeWidth * EDGE_ARROW_TIP_EXTENSION_FACTOR - EDGE_ARROW_NODE_OVERLAP);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function automaticControlPoint(edge: GraphEdge, source: GraphNode, target: GraphNode, edges: GraphEdge[], nodesById: Map<string, GraphNode>): { point: Point; curved: boolean } {
  const mid = midpoint(source.position, target.position);
  const dx = target.position.x - source.position.x;
  const dy = target.position.y - source.position.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / length, y: dx / length };
  if (hasReciprocalDirectedEdge(edge, edges)) {
    const sign = edge.source < edge.target ? 1 : -1;
    return { point: { x: mid.x + normal.x * 44 * sign, y: mid.y + normal.y * 44 * sign }, curved: true };
  }
  const fanOffset = crowdedEdgeFanOffset(edge, edges, nodesById);
  if (Math.abs(fanOffset) <= 1e-6) return { point: mid, curved: false };
  return { point: { x: mid.x + normal.x * fanOffset, y: mid.y + normal.y * fanOffset }, curved: true };
}

export function hasReciprocalDirectedEdge(edge: GraphEdge, edges: GraphEdge[]): boolean {
  if (edge.kind !== "directed") return false;
  return edges.some((candidate) => candidate.kind === "directed" && candidate.source === edge.target && candidate.target === edge.source);
}

export function crowdedEdgeFanOffset(edge: GraphEdge, edges: GraphEdge[], nodesById: Map<string, GraphNode>): number {
  if (edge.kind !== "directed" && edge.kind !== "bidirected") return 0;
  const target = nodesById.get(edge.target);
  const source = nodesById.get(edge.source);
  if (!target || !source) return 0;
  const incoming = edges
    .filter((candidate) => (candidate.kind === "directed" || candidate.kind === "bidirected") && candidate.target === edge.target)
    .map((candidate) => {
      const source = nodesById.get(candidate.source);
      if (!source) return null;
      return {
        key: candidate.id,
        angle: positiveAngle(Math.atan2(source.position.y - target.position.y, source.position.x - target.position.x))
      };
    })
    .filter((candidate): candidate is { key: string; angle: number } => candidate !== null);
  const targetOffset = incoming.length >= EDGE_CROWDED_FAN_THRESHOLD
    ? edgeFanOffset(edge.id, incoming, EDGE_CROWDED_FAN_SPACING, EDGE_CROWDED_FAN_MAX_OFFSET)
    : 0;
  const outgoing = edges
    .filter((candidate) => (candidate.kind === "directed" || candidate.kind === "bidirected") && candidate.source === edge.source)
    .map((candidate) => {
      const target = nodesById.get(candidate.target);
      if (!target) return null;
      return {
        key: candidate.id,
        angle: positiveAngle(Math.atan2(target.position.y - source.position.y, target.position.x - source.position.x))
      };
    })
    .filter((candidate): candidate is { key: string; angle: number } => candidate !== null);
  const sourceOffset = outgoing.length >= EDGE_OUTGOING_FAN_THRESHOLD
    ? edgeFanOffset(edge.id, outgoing, EDGE_OUTGOING_FAN_SPACING, EDGE_OUTGOING_FAN_MAX_OFFSET)
    : 0;
  return targetOffset + sourceOffset;
}

export function crowdedTargetPortOffset(edge: GraphEdge, edges: GraphEdge[], nodesById: Map<string, GraphNode>): number {
  if (edge.kind !== "directed" && edge.kind !== "bidirected") return 0;
  const target = nodesById.get(edge.target);
  if (!target) return 0;
  const incoming = edges
    .filter((candidate) => (candidate.kind === "directed" || candidate.kind === "bidirected") && candidate.target === edge.target)
    .map((candidate) => {
      const source = nodesById.get(candidate.source);
      if (!source) return null;
      return {
        key: candidate.id,
        angle: positiveAngle(Math.atan2(source.position.y - target.position.y, source.position.x - target.position.x))
      };
    })
    .filter((candidate): candidate is { key: string; angle: number } => candidate !== null);
  return incoming.length >= EDGE_CROWDED_FAN_THRESHOLD
    ? edgeFanOffset(edge.id, incoming, EDGE_ENDPOINT_PORT_SPACING, EDGE_ENDPOINT_PORT_MAX_OFFSET)
    : 0;
}

export function crowdedSourcePortOffset(edge: GraphEdge, edges: GraphEdge[], nodesById: Map<string, GraphNode>): number {
  if (edge.kind !== "directed" && edge.kind !== "bidirected") return 0;
  const source = nodesById.get(edge.source);
  if (!source) return 0;
  const outgoing = edges
    .filter((candidate) => (candidate.kind === "directed" || candidate.kind === "bidirected") && candidate.source === edge.source)
    .map((candidate) => {
      const target = nodesById.get(candidate.target);
      if (!target) return null;
      return {
        key: candidate.id,
        angle: positiveAngle(Math.atan2(target.position.y - source.position.y, target.position.x - source.position.x))
      };
    })
    .filter((candidate): candidate is { key: string; angle: number } => candidate !== null);
  return outgoing.length >= EDGE_OUTGOING_FAN_THRESHOLD
    ? edgeFanOffset(edge.id, outgoing, EDGE_ENDPOINT_PORT_SPACING, EDGE_ENDPOINT_PORT_MAX_OFFSET)
    : 0;
}

export function edgeFanOffset(edgeId: string, ports: Array<{ key: string; angle: number }>, spacing: number, maxOffset: number): number {
  const ordered = orderCircularArrowPorts(ports);
  const index = ordered.findIndex((candidate) => candidate.key === edgeId);
  if (index < 0) return 0;
  return clamp((index - (ordered.length - 1) / 2) * spacing, -maxOffset, maxOffset);
}

export function endpointPortToward(origin: Point, toward: Point, portOffset: number): Point {
  if (Math.abs(portOffset) <= 1e-6) return toward;
  const direction = unitVector(origin, toward);
  const normal = { x: -direction.y, y: direction.x };
  return {
    x: origin.x + direction.x * EDGE_ENDPOINT_PORT_DISTANCE + normal.x * portOffset,
    y: origin.y + direction.y * EDGE_ENDPOINT_PORT_DISTANCE + normal.y * portOffset
  };
}

export function nodeRadius(node: GraphNode): number {
  return node.roles.exposure || node.roles.outcome ? 25 : 21;
}

export function nodeBoundaryPoint(node: GraphNode, toward: Point, clearance: number, options: { includeDistribution: boolean }): Point {
  const unit = unitVector(node.position, toward);
  const distance = nodeBoundaryDistance(node, unit, clearance, options);
  return {
    x: node.position.x + unit.x * distance,
    y: node.position.y + unit.y * distance
  };
}

export function nodeBoundaryDistance(node: GraphNode, unit: Point, clearance: number, options: { includeDistribution: boolean }): number {
  const circleBoundary = nodeRadius(node) + clearance;
  const adjustedBoundary = node.roles.adjusted ? rayCenteredRectDistance(unit, 28 + clearance, 28 + clearance) : 0;
  const selectedBoundary = node.roles.selected ? rayRectExitDistance(unit, { left: -23 - clearance, right: 23 + clearance, top: 22 - clearance, bottom: 36 + clearance }) : 0;
  const distributionBoundary = options.includeDistribution
    ? rayRectExitDistance(unit, {
        left: NODE_DISTRIBUTION_BOUNDS.left - clearance,
        right: NODE_DISTRIBUTION_BOUNDS.right + clearance,
        top: NODE_DISTRIBUTION_BOUNDS.top - clearance,
        bottom: NODE_DISTRIBUTION_BOUNDS.bottom + clearance
      })
    : 0;
  return Math.max(circleBoundary, adjustedBoundary, selectedBoundary, distributionBoundary);
}

export function rayCenteredRectDistance(unit: Point, halfWidth: number, halfHeight: number): number {
  const xDistance = Math.abs(unit.x) > 1e-6 ? halfWidth / Math.abs(unit.x) : Number.POSITIVE_INFINITY;
  const yDistance = Math.abs(unit.y) > 1e-6 ? halfHeight / Math.abs(unit.y) : Number.POSITIVE_INFINITY;
  return Math.min(xDistance, yDistance);
}

export function rayRectExitDistance(unit: Point, rect: { left: number; right: number; top: number; bottom: number }): number {
  let enter = 0;
  let exit = Number.POSITIVE_INFINITY;
  if (Math.abs(unit.x) < 1e-6) {
    if (rect.left > 0 || rect.right < 0) return 0;
  } else {
    const t1 = rect.left / unit.x;
    const t2 = rect.right / unit.x;
    enter = Math.max(enter, Math.min(t1, t2));
    exit = Math.min(exit, Math.max(t1, t2));
  }
  if (Math.abs(unit.y) < 1e-6) {
    if (rect.top > 0 || rect.bottom < 0) return 0;
  } else {
    const t1 = rect.top / unit.y;
    const t2 = rect.bottom / unit.y;
    enter = Math.max(enter, Math.min(t1, t2));
    exit = Math.min(exit, Math.max(t1, t2));
  }
  return exit >= enter && exit > 0 ? exit : 0;
}

export function orderCircularArrowPorts<T extends { angle: number; key: string }>(ports: T[]): T[] {
  const ordered = [...ports].sort((a, b) => {
    const angleDelta = a.angle - b.angle;
    return Math.abs(angleDelta) > 1e-6 ? angleDelta : a.key.localeCompare(b.key);
  });
  if (ordered.length <= 2) return ordered;
  let largestGap = -1;
  let startIndex = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index]!;
    const next = ordered[(index + 1) % ordered.length]!;
    const gap = (next.angle - current.angle + Math.PI * 2) % (Math.PI * 2);
    if (gap > largestGap) {
      largestGap = gap;
      startIndex = (index + 1) % ordered.length;
    }
  }
  return [...ordered.slice(startIndex), ...ordered.slice(0, startIndex)];
}

export function positiveAngle(angle: number): number {
  return angle < 0 ? angle + Math.PI * 2 : angle;
}

export function unitVector(from: Point, toward: Point): Point {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}
