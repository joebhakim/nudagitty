import { normalizeVariableModel } from "@nudagitty/core";
import type { GraphNode, SimulatedNodeState } from "@nudagitty/core";
import { coerceBinary, formatValue } from "../shared/formatting";
import type { ScatterPoint } from "../charts/CategoryOutcomePlot";
import type {
  AdjustmentStratumCondition,
  BinaryAdjustmentStratum,
  BinaryContinuousAdjustmentStratum,
  BinaryContinuousGroup,
  BinnedAdjustmentNode,
  NodeDistributionSummary
} from "../app/types";
import { defaultQuantileCuts, sanitizeCutpoints } from "./conditioning";
import { distributionPlotDomain } from "./distributionPlot";
import { binaryCells, binaryContinuousGroups, binaryOutcomeContrastFromCells, empiricalWeightAt } from "./scatterStats";


export function binnedAdjustmentNode(
  node: GraphNode,
  state?: SimulatedNodeState,
  summary?: NodeDistributionSummary,
  options: { fallbackBins?: number } = {}
): BinnedAdjustmentNode | null {
  if (!state) return null;
  const variable = normalizeVariableModel(node.variable);
  const domain = summary?.domain ?? distributionPlotDomain(state);
  if (!domain) return null;
  const explicitCutpoints = variable.adjustment.method === "bins" ? sanitizeCutpoints(variable.adjustment.cutpoints, domain) : [];
  const fallbackBins = options.fallbackBins ?? 0;
  const automatic = explicitCutpoints.length === 0 && fallbackBins > 1;
  const cutpoints = automatic
    ? sanitizeCutpoints(defaultQuantileCuts(summary?.finiteSamples ?? state.empirical.samples, domain, fallbackBins), domain)
    : explicitCutpoints;
  if (cutpoints.length === 0) return null;
  return { node, state, domain, cutpoints, automatic };
}

export function binaryAdjustmentExpander(node: GraphNode, state?: SimulatedNodeState): AdjustmentStratumCondition[] {
  if (!state) return [];
  return [
    { kind: "binary", node, state, value: 0 },
    { kind: "binary", node, state, value: 1 }
  ];
}

export function binnedAdjustmentExpander(item: BinnedAdjustmentNode): AdjustmentStratumCondition[] {
  const boundaries = [item.domain[0], ...item.cutpoints, item.domain[1]];
  return boundaries.slice(0, -1).map((lower, index) => ({
    kind: "bin" as const,
    node: item.node,
    state: item.state,
    lower,
    upper: boundaries[index + 1] ?? item.domain[1],
    index,
    last: index === boundaries.length - 2
  }));
}

export function binaryAdjustmentStrata(
  expanders: AdjustmentStratumCondition[][],
  xState: SimulatedNodeState | undefined,
  yState: SimulatedNodeState | undefined
): { items: BinaryAdjustmentStratum[]; truncated: boolean } {
  if (expanders.length === 0) return { items: [], truncated: false };
  let combinations: AdjustmentStratumCondition[][] = [[]];
  for (const levels of expanders) {
    combinations = combinations.flatMap((base) => levels.map((level) => [...base, level]));
  }
  const maxStrata = 16;
  const truncated = combinations.length > maxStrata;
  const shownCombinations = combinations.slice(0, maxStrata);
  return { items: shownCombinations.map((conditions) => {
    const points = filteredBinaryScatterPoints(xState, yState, conditions);
    const cells = binaryCells(points);
    return {
      id: conditions.map(stratumConditionId).join("__"),
      label: conditions.map(stratumConditionLabel).join(", "),
      points,
      cells,
      contrast: binaryOutcomeContrastFromCells(cells),
      weight: points.reduce((sum, point) => sum + point.weight, 0)
    };
  }), truncated };
}

export function binaryContinuousAdjustmentStrata(
  expanders: AdjustmentStratumCondition[][],
  xState: SimulatedNodeState | undefined,
  yState: SimulatedNodeState | undefined
): { items: BinaryContinuousAdjustmentStratum[]; truncated: boolean } {
  if (expanders.length === 0) return { items: [], truncated: false };
  let combinations: AdjustmentStratumCondition[][] = [[]];
  for (const levels of expanders) {
    combinations = combinations.flatMap((base) => levels.map((level) => [...base, level]));
  }
  const maxStrata = 16;
  const truncated = combinations.length > maxStrata;
  const shownCombinations = combinations.slice(0, maxStrata);
  return { items: shownCombinations.map((conditions) => {
    const points = filteredBinaryScatterPoints(xState, yState, conditions);
    const groups = binaryContinuousGroups(points);
    return {
      id: conditions.map(stratumConditionId).join("__"),
      label: conditions.map(stratumConditionLabel).join(", "),
      displayLabels: conditions.map(stratumConditionDisplayLabel),
      points,
      groups,
      gap: binaryContinuousGap(groups),
      weight: points.reduce((sum, point) => sum + point.weight, 0)
    };
  }), truncated };
}

export function binaryContinuousGap(groups: BinaryContinuousGroup[]): number | null {
  const groupZero = groups[0];
  const groupOne = groups[1];
  if (groupZero?.mean === null || groupZero?.mean === undefined || groupOne?.mean === null || groupOne?.mean === undefined) return null;
  return groupOne.mean - groupZero.mean;
}

export function standardizedBinaryContinuousGap(strata: BinaryContinuousAdjustmentStratum[]): number | null {
  let numerator = 0;
  let denominator = 0;
  for (const stratum of strata) {
    if (stratum.gap === null || stratum.weight <= 0) continue;
    numerator += stratum.gap * stratum.weight;
    denominator += stratum.weight;
  }
  return denominator > 0 ? numerator / denominator : null;
}

export function stratumConditionId(condition: AdjustmentStratumCondition): string {
  if (condition.kind === "binary") return `${condition.node.id}-${condition.value}`;
  return `${condition.node.id}-bin-${condition.index}`;
}

export function stratumConditionLabel(condition: AdjustmentStratumCondition): string {
  if (condition.kind === "binary") return `${condition.node.id}=${condition.value}`;
  return `${condition.node.id} bin ${condition.index + 1}: ${formatValue(condition.lower)} to ${formatValue(condition.upper)}`;
}

export function stratumConditionDisplayLabel(condition: AdjustmentStratumCondition): string {
  const label = (condition.node.label || condition.node.id).replace(/_/g, " ");
  if (condition.kind === "binary") return `${label}=${condition.value}`;
  return `${label} bin ${condition.index + 1}`;
}

export function filteredBinaryScatterPoints(
  xState: SimulatedNodeState | undefined,
  yState: SimulatedNodeState | undefined,
  conditions: AdjustmentStratumCondition[]
): ScatterPoint[] {
  const xSamples = xState?.empirical.samples ?? [];
  const ySamples = yState?.empirical.samples ?? [];
  const conditionSamples = conditions.map((condition) => condition.state.empirical.samples);
  const length = Math.min(xSamples.length, ySamples.length, ...conditionSamples.map((samples) => samples.length));
  const points: ScatterPoint[] = [];
  for (let index = 0; index < length; index += 1) {
    const x = xSamples[index];
    const y = ySamples[index];
    if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const matches = conditions.every((condition) => {
      const sample = condition.state.empirical.samples[index];
      if (sample === undefined || !Number.isFinite(sample)) return false;
      if (condition.kind === "binary") return coerceBinary(sample) === condition.value;
      return condition.last
        ? sample >= condition.lower && sample <= condition.upper
        : sample >= condition.lower && sample < condition.upper;
    });
    if (!matches) continue;
    points.push({
      x,
      y,
      weight: empiricalWeightAt(index, xState, yState, ...conditions.map((condition) => condition.state)),
      index
    });
  }
  return points;
}
