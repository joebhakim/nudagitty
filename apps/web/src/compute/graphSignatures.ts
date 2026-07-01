import { normalizeVariableModel } from "@nudagitty/core";
import type { GraphModel } from "@nudagitty/core";
import { clamp } from "../shared/formatting";
import type { WorkbenchMode } from "../shared/workbench";
import {
  BASE_VIEWBOX,
  BASIC_NODE_VIEW_MARGIN,
  BASIC_VIEWPORT_ZOOM_BONUS,
  DEFAULT_VIEWPORT,
  NODE_VIEW_MARGIN
} from "../app/constants";
import type { CanvasViewport } from "../app/types";

export function graphViewportSignature(graph: GraphModel): string {
  const nodes = graph.nodes.map((node) => `${node.id}:${node.label}`).join("|");
  const edges = graph.edges.map((edge) => `${edge.source}:${edge.kind}:${edge.target}`).join("|");
  return `${nodes}::${edges}`;
}

export function graphAnalysisSignature(graph: GraphModel): string {
  const nodes = graph.nodes
    .map((node) => `${node.id}:${Number(node.roles.exposure)}${Number(node.roles.outcome)}${Number(node.roles.adjusted)}${Number(node.roles.selected)}${Number(node.roles.latent)}${Number(node.roles.instrument)}`)
    .join("|");
  const edges = graph.edges.map((edge) => `${edge.id}:${edge.source}:${edge.kind}:${edge.target}`).join("|");
  return `${graph.kind}::${nodes}::${edges}`;
}

export function graphSimulationSignature(graph: GraphModel): string {
  const nodes = graph.nodes
    .map((node) => `${node.id}:${JSON.stringify(normalizeVariableModel(node.variable))}`)
    .join("|");
  const edges = graph.edges.map((edge) => `${edge.id}:${edge.source}:${edge.kind}:${edge.target}`).join("|");
  return `${graph.kind}::${nodes}::${edges}`;
}

export function graphOutputSignature(graph: GraphModel): string {
  const nodes = graph.nodes
    .map((node) => `${node.id}:${node.label}:${Number(node.roles.exposure)}${Number(node.roles.outcome)}${Number(node.roles.adjusted)}${Number(node.roles.selected)}${Number(node.roles.latent)}${Number(node.roles.instrument)}:${JSON.stringify(normalizeVariableModel(node.variable))}`)
    .join("|");
  const edges = graph.edges.map((edge) => `${edge.id}:${edge.source}:${edge.kind}:${edge.target}`).join("|");
  return `${graph.kind}::${nodes}::${edges}`;
}

export function fitViewportToGraph(graph: GraphModel, mode: WorkbenchMode = "pro"): CanvasViewport {
  if (graph.nodes.length === 0) return DEFAULT_VIEWPORT;
  const demoMode = mode === "basic";
  const margin = demoMode ? BASIC_NODE_VIEW_MARGIN : NODE_VIEW_MARGIN;
  const minX = Math.min(...graph.nodes.map((node) => node.position.x)) - margin.x;
  const maxX = Math.max(...graph.nodes.map((node) => node.position.x)) + margin.x;
  const minY = Math.min(...graph.nodes.map((node) => node.position.y)) - margin.top;
  const maxY = Math.max(...graph.nodes.map((node) => node.position.y)) + margin.bottom;
  const width = Math.max(demoMode ? 210 : 240, maxX - minX);
  const height = Math.max(demoMode ? 200 : 220, maxY - minY);
  const rawZoom = Math.min(BASE_VIEWBOX.width / width, BASE_VIEWBOX.height / height) * (demoMode ? BASIC_VIEWPORT_ZOOM_BONUS : 1);
  const zoom = clamp(rawZoom, 0.55, demoMode ? 2.1 : 1.85);
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    zoom
  };
}

