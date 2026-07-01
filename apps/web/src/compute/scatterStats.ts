import { normalizeVariableModel } from "@nudagitty/core";
import type { GraphNode, SimulatedNodeState, SimulationResult } from "@nudagitty/core";
import { coerceBinary } from "../shared/formatting";
import type { ScatterPoint } from "../charts/CategoryOutcomePlot";
import type {
  BinaryCell,
  BinaryContinuousGroup,
  BinaryOutcomeContrastSummary,
  NodeDistributionSummary,
  PairDerivedSummary,
  SimulationDerivedCache,
  WeightedScatterSummary
} from "../app/types";
import { distributionPlotDomain, histogram } from "./distributionPlot";


export function buildSimulationDerivedCache(simulation: SimulationResult): SimulationDerivedCache {
  const nodes = new Map<string, NodeDistributionSummary>();
  for (const [id, state] of Object.entries(simulation.nodeStates)) {
    const domain = distributionPlotDomain(state);
    const finiteSamples = state.empirical.samples.filter(Number.isFinite);
    nodes.set(id, {
      domain,
      finiteSamples,
      histogram18: domain ? histogram(state.empirical.samples, domain, 18, state.empirical.weights) : [],
      histogram20: domain ? histogram(state.empirical.samples, domain, 20, state.empirical.weights) : []
    });
  }
  return {
    simulation,
    nodes,
    pairs: new Map()
  };
}

export function pairDerivedSummary(cache: SimulationDerivedCache, xId: string, yId: string): PairDerivedSummary {
  const key = `${xId}\u0000${yId}`;
  const cached = cache.pairs.get(key);
  if (cached) return cached;
  const xState = cache.simulation.nodeStates[xId];
  const yState = cache.simulation.nodeStates[yId];
  const points = scatterPoints(xState, yState);
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const cells = binaryCells(points);
  const summary: PairDerivedSummary = {
    points,
    stats: weightedScatterStats(points),
    binaryCells: cells,
    binaryContrast: binaryOutcomeContrastFromCells(cells),
    binaryContinuousGroups: binaryContinuousGroups(points),
    xDomain: scatterDomain(xValues, xState, cache.nodes.get(xId)),
    yDomain: scatterDomain(yValues, yState, cache.nodes.get(yId)),
    ySampleDomain: scatterSampleDomain(yValues, yState, cache.nodes.get(yId))
  };
  cache.pairs.set(key, summary);
  return summary;
}

export function scatterPoints(xState: SimulatedNodeState | undefined, yState: SimulatedNodeState | undefined): ScatterPoint[] {
  const xSamples = xState?.empirical.samples ?? [];
  const ySamples = yState?.empirical.samples ?? [];
  const xWeights = xState?.empirical.weights ?? [];
  const yWeights = yState?.empirical.weights ?? [];
  const length = Math.min(xSamples.length, ySamples.length);
  const points: ScatterPoint[] = [];
  for (let index = 0; index < length; index += 1) {
    const x = xSamples[index];
    const y = ySamples[index];
    if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push({
      x,
      y,
      weight: Math.max(0, xWeights[index] ?? yWeights[index] ?? 1),
      index
    });
  }
  return points;
}

export function binaryContinuousGroups(points: ScatterPoint[]): BinaryContinuousGroup[] {
  const groups: BinaryContinuousGroup[] = [
    { value: 0, count: 0, weight: 0, mean: null, share: 0 },
    { value: 1, count: 0, weight: 0, mean: null, share: 0 }
  ];
  const totals: Record<0 | 1, number> = { 0: 0, 1: 0 };
  for (const point of points) {
    const value = coerceBinary(point.x) as 0 | 1;
    const group = groups[value];
    if (!group) continue;
    group.count += 1;
    group.weight += point.weight;
    totals[value] += point.y * point.weight;
  }
  const totalWeight = groups.reduce((sum, group) => sum + group.weight, 0);
  return groups.map((group) => ({
    ...group,
    mean: group.weight > 0 ? totals[group.value] / group.weight : null,
    share: totalWeight > 0 ? group.weight / totalWeight : 0
  }));
}

export function binaryCells(points: ScatterPoint[]): BinaryCell[] {
  const cells: BinaryCell[] = [
    { x: 0, y: 0, weight: 0, count: 0, percent: 0, columnPercent: 0 },
    { x: 1, y: 0, weight: 0, count: 0, percent: 0, columnPercent: 0 },
    { x: 0, y: 1, weight: 0, count: 0, percent: 0, columnPercent: 0 },
    { x: 1, y: 1, weight: 0, count: 0, percent: 0, columnPercent: 0 }
  ];
  for (const point of points) {
    const x = coerceBinary(point.x) as 0 | 1;
    const y = coerceBinary(point.y) as 0 | 1;
    const cell = cells.find((candidate) => candidate.x === x && candidate.y === y);
    if (!cell) continue;
    cell.weight += point.weight;
    cell.count += 1;
  }
  const totalWeight = cells.reduce((sum, cell) => sum + cell.weight, 0);
  const xWeights: Record<0 | 1, number> = {
    0: cells.filter((cell) => cell.x === 0).reduce((sum, cell) => sum + cell.weight, 0),
    1: cells.filter((cell) => cell.x === 1).reduce((sum, cell) => sum + cell.weight, 0)
  };
  return cells.map((cell) => ({
    ...cell,
    percent: totalWeight > 0 ? cell.weight / totalWeight : 0,
    columnPercent: xWeights[cell.x] > 0 ? cell.weight / xWeights[cell.x] : 0
  }));
}

export function binaryOutcomeContrast(points: ScatterPoint[]): BinaryOutcomeContrastSummary {
  return binaryOutcomeContrastFromCells(binaryCells(points));
}

export function binaryOutcomeContrastFromCells(cells: BinaryCell[]): BinaryOutcomeContrastSummary {
  const weightAtX0 = cells.filter((cell) => cell.x === 0).reduce((sum, cell) => sum + cell.weight, 0);
  const weightAtX1 = cells.filter((cell) => cell.x === 1).reduce((sum, cell) => sum + cell.weight, 0);
  const yAtX0Weight = cells.find((cell) => cell.x === 0 && cell.y === 1)?.weight ?? 0;
  const yAtX1Weight = cells.find((cell) => cell.x === 1 && cell.y === 1)?.weight ?? 0;
  const yAtX0 = weightAtX0 > 0 ? yAtX0Weight / weightAtX0 : null;
  const yAtX1 = weightAtX1 > 0 ? yAtX1Weight / weightAtX1 : null;
  return {
    yAtX0,
    yAtX1,
    diff: yAtX0 === null || yAtX1 === null ? null : yAtX1 - yAtX0
  };
}

export function weightedScatterStats(points: ScatterPoint[]): WeightedScatterSummary | null {
  const sumWeight = points.reduce((sum, point) => sum + point.weight, 0);
  if (points.length === 0 || sumWeight <= 0) return null;
  const meanX = points.reduce((sum, point) => sum + point.x * point.weight, 0) / sumWeight;
  const meanY = points.reduce((sum, point) => sum + point.y * point.weight, 0) / sumWeight;
  const varianceX = points.reduce((sum, point) => sum + point.weight * (point.x - meanX) ** 2, 0) / sumWeight;
  const varianceY = points.reduce((sum, point) => sum + point.weight * (point.y - meanY) ** 2, 0) / sumWeight;
  const covariance = points.reduce((sum, point) => sum + point.weight * (point.x - meanX) * (point.y - meanY), 0) / sumWeight;
  const correlation = varianceX <= Number.EPSILON || varianceY <= Number.EPSILON ? null : covariance / Math.sqrt(varianceX * varianceY);
  const slope = varianceX <= Number.EPSILON ? 0 : covariance / varianceX;
  return { meanX, meanY, correlation, slope, intercept: meanY - slope * meanX };
}




export function scatterDomain(values: number[], state: SimulatedNodeState | undefined, summary?: NodeDistributionSummary): [number, number] {
  const candidates = values.filter(Number.isFinite);
  const distributionDomain = summary?.domain ?? (state ? distributionPlotDomain(state) : null);
  if (distributionDomain) candidates.push(distributionDomain[0], distributionDomain[1]);
  if (candidates.length === 0) return [-1, 1];
  let min = Math.min(...candidates);
  let max = Math.max(...candidates);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [-1, 1];
  if (Math.abs(max - min) < 1e-6) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.06;
  return [min - pad, max + pad];
}

export function scatterSampleDomain(values: number[], state: SimulatedNodeState | undefined, summary?: NodeDistributionSummary): [number, number] {
  const candidates = values.filter(Number.isFinite);
  if (candidates.length === 0) {
    if (state?.empirical.min !== null && state?.empirical.min !== undefined) candidates.push(state.empirical.min);
    if (state?.empirical.max !== null && state?.empirical.max !== undefined) candidates.push(state.empirical.max);
  }
  if (candidates.length === 0 && summary?.domain) candidates.push(summary.domain[0], summary.domain[1]);
  if (candidates.length === 0) return [-1, 1];
  let min = Math.min(...candidates);
  let max = Math.max(...candidates);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [-1, 1];
  if (Math.abs(max - min) < 1e-6) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.08;
  min -= pad;
  max += pad;
  const step = niceTickStep(max - min);
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step];
}

export function niceTickStep(span: number): number {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const rough = span / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const scaled = rough / power;
  const factor = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return factor * power;
}

export function deterministicJitter(index: number): number {
  const x = Math.sin((index + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

export function empiricalWeightAt(index: number, ...states: Array<SimulatedNodeState | undefined>): number {
  for (const state of states) {
    const weight = state?.empirical.weights[index];
    if (weight !== undefined && Number.isFinite(weight)) return Math.max(0, weight);
  }
  return 1;
}

export function padDomain(domain: [number, number]): [number, number] {
  const [min, max] = domain;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [-1, 1];
  if (Math.abs(max - min) < 1e-9) return [min - 1, max + 1];
  const pad = (max - min) * 0.08;
  return [min - pad, max + pad];
}

export function isBinaryGraphNode(node: GraphNode, state?: SimulatedNodeState): boolean {
  return normalizeVariableModel(node.variable).valueType === "binary" || state?.analytic?.distribution.kind === "bernoulli";
}

export function isStabilizedIpwNode(node: GraphNode): boolean {
  const method = normalizeVariableModel(node.variable).adjustment.method;
  return method === "stabilized_ipw" || method === "propensity_score_todo";
}
