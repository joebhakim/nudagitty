import { normalizeVariableModel } from "@nudagitty/core";
import type {
  EdgeMechanismKind,
  GraphNode,
  SimulatedNodeState,
  SimulationInferenceMode
} from "@nudagitty/core";
import {
  formatPercent,
  formatPercentagePoints,
  formatSignedValue,
  formatValue
} from "../shared/formatting";
import { displayNodeName } from "../outputs/estimand";
import type { WorkbenchMode } from "../shared/workbench";
import { DESIGN_MODULES, EDGE_MECHANISMS } from "../app/constants";
import { isBinaryGraphNode } from "./scatterStats";


export function formatOutcomeDifference(node: GraphNode, value: number): string {
  return normalizeVariableModel(node.variable).valueType === "binary" ? formatPercentagePoints(value) : formatSignedValue(value);
}

export function formatOutcomeMean(node: GraphNode, state: SimulatedNodeState | undefined, value: number): string {
  return isBinaryGraphNode(node, state) ? formatPercent(value) : formatValue(value);
}

export function signForPunchline(value: number | null): -1 | 0 | 1 {
  if (value === null || Math.abs(value) < 0.005) return 0;
  return value < 0 ? -1 : 1;
}

export function metricTone(value: number | null): "negative" | "neutral" | "positive" {
  const sign = signForPunchline(value);
  if (sign < 0) return "negative";
  if (sign > 0) return "positive";
  return "neutral";
}

export function nodeDisplayName(node: GraphNode): string {
  // Normalized name (unit + id parenthetical stripped, underscores → spaces) so
  // headings read like the node-name chips instead of exposing raw ids.
  return displayNodeName(node.label || node.id);
}

export function nodeOutputLabel(node: GraphNode): string {
  return node.label || node.id;
}

export function abbreviateLabel(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3))}...`;
}

export function binaryShortLabel(value: string): string {
  return abbreviateLabel(value.replace(/\s+\([^)]*\)$/u, ""), 18);
}

export function binaryAxisValueLabel(label: string, value: 0 | 1): string {
  return `${binaryShortLabel(label)}=${value}`;
}

export function binaryDisplayValueLabel(node: GraphNode | undefined, fallbackLabel: string, value: 0 | 1): string {
  const unit = node ? normalizeVariableModel(node.variable).unit.trim() : "";
  if (unit && value === 1) return abbreviateLabel(unit, 18);
  if (unit && value === 0) return "none";
  return binaryAxisValueLabel(fallbackLabel, value);
}

export function compactSvgText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}


export function inferenceModeLabel(mode: SimulationInferenceMode | "forward"): string {
  if (mode === "importance") return "importance sampling";
  if (mode === "rejection") return "rejection sampling";
  return mode;
}

export function analyticSummaryLabel(note: string): string {
  return note.replace(/^analytic\s+/i, "");
}

export function mechanismLabel(kind: EdgeMechanismKind): string {
  return EDGE_MECHANISMS.find((item) => item.kind === kind)?.label ?? kind;
}

export function mechanismDescription(kind: EdgeMechanismKind): string {
  return EDGE_MECHANISMS.find((item) => item.kind === kind)?.description ?? mechanismLabel(kind);
}

export function designModulesForMode(mode: WorkbenchMode) {
  if (mode === "pro") return DESIGN_MODULES;
  return DESIGN_MODULES.filter((module) => module.basic);
}

export function functionGlyphPath(kind: EdgeMechanismKind): string {
  if (kind === "absorbing") return "M 4 16 L 12 16 L 12 7 L 20 7 L 20 16 L 28 16";
  if (kind === "threshold") return "M 4 16 H 15 V 5 H 28";
  if (kind === "smooth_threshold") return "M 4 16 C 10 16 11 5 18 5 C 22 5 24 4 28 4";
  if (kind === "saturating") return "M 4 16 C 9 16 11 10 16 10 C 21 10 23 4 28 4";
  if (kind === "quadratic") return "M 4 5 Q 16 22 28 5";
  if (kind === "piecewise_linear") return "M 4 16 L 11 10 L 18 13 L 28 4";
  if (kind === "hill_emax") return "M 4 16 C 12 16 12 6 20 6 H 28";
  if (kind === "log_linear") return "M 4 16 C 7 9 12 6 28 4";
  if (kind === "power_law") return "M 4 16 C 12 16 20 10 28 4";
  if (kind === "monotone_spline") return "M 4 16 C 10 15 10 11 16 10 S 22 5 28 4";
  return "M 4 16 L 28 4";
}
