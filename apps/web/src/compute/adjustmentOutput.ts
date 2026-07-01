import { adjusted, selected } from "@nudagitty/core";
import type { GraphDocument, SimulationResult } from "@nudagitty/core";
import type { OutputContext } from "../outputs/types";
import type { ScatterPair } from "../shared/pairs";
import type {
  AdjustmentStratumCondition,
  BinaryAdjustmentOutput,
  BinaryContinuousAdjustmentOutput,
  BinnedAdjustmentNode,
  SimulationDerivedCache
} from "../app/types";
import { computeStabilizedIpw } from "./ipw";
import { binaryCells, binaryContinuousGroups, isBinaryGraphNode, isStabilizedIpwNode, pairDerivedSummary } from "./scatterStats";
import {
  binaryAdjustmentExpander,
  binaryAdjustmentStrata,
  binaryContinuousAdjustmentStrata,
  binaryContinuousGap,
  binnedAdjustmentExpander,
  binnedAdjustmentNode,
  standardizedBinaryContinuousGap
} from "./stratification";


export function computeBinaryAdjustmentOutput(context: OutputContext, derived: SimulationDerivedCache, pair: ScatterPair): BinaryAdjustmentOutput | null {
  const exposure = context.document.graph.nodes.find((node) => node.id === pair.x);
  const outcome = context.document.graph.nodes.find((node) => node.id === pair.y);
  if (!exposure || !outcome) return null;
  const exposureState = context.simulation.nodeStates[exposure.id];
  const outcomeState = context.simulation.nodeStates[outcome.id];
  if (!isBinaryGraphNode(exposure, exposureState) || !isBinaryGraphNode(outcome, outcomeState)) return null;
  const rawSummary = pairDerivedSummary(derived, exposure.id, outcome.id);
  const rawPoints = rawSummary.points;
  if (rawPoints.length === 0) return null;
  const adjustedNodes = context.document.graph.nodes.filter((node) => node.roles.adjusted && node.id !== exposure.id && node.id !== outcome.id);
  const binaryAdjustedNodes = adjustedNodes.filter((node) => isBinaryGraphNode(node, context.simulation.nodeStates[node.id]));
  const stabilizedIpwNodes = adjustedNodes.filter(isStabilizedIpwNode);
  const binnedAdjustedNodes = adjustedNodes
    .filter((node) => !isBinaryGraphNode(node, context.simulation.nodeStates[node.id]) && !isStabilizedIpwNode(node))
    .map((node) => binnedAdjustmentNode(node, context.simulation.nodeStates[node.id], derived.nodes.get(node.id), { fallbackBins: 4 }))
    .filter((item): item is BinnedAdjustmentNode => item !== null);
  const binnedIds = new Set(binnedAdjustedNodes.map((item) => item.node.id));
  const unsupportedAdjustedNodes = adjustedNodes.filter((node) => (
    !isBinaryGraphNode(node, context.simulation.nodeStates[node.id]) && !binnedIds.has(node.id) && !isStabilizedIpwNode(node)
  ));
  const stabilizedIpw = stabilizedIpwNodes.length > 0
    ? computeStabilizedIpw(exposure, outcome, stabilizedIpwNodes, context.simulation, derived)
    : null;
  const expanders = [
    ...binaryAdjustedNodes.map((node) => binaryAdjustmentExpander(node, context.simulation.nodeStates[node.id])),
    ...binnedAdjustedNodes.map((item) => binnedAdjustmentExpander(item))
  ].filter((item): item is AdjustmentStratumCondition[] => item.length > 0).slice(0, 3);
  const strataResult = binaryAdjustmentStrata(expanders, exposureState, outcomeState);
  return {
    exposure,
    outcome,
    rawPoints,
    rawCells: rawSummary.binaryCells,
    rawContrast: rawSummary.binaryContrast,
    adjustedNodes,
    binaryAdjustedNodes,
    binnedAdjustedNodes,
    unsupportedAdjustedNodes,
    strata: strataResult.items,
    stabilizedIpw,
    truncated: binaryAdjustedNodes.length + binnedAdjustedNodes.length > expanders.length || strataResult.truncated
  };
}

export function computeBinaryContinuousAdjustmentOutput(context: OutputContext, derived: SimulationDerivedCache, pair: ScatterPair): BinaryContinuousAdjustmentOutput | null {
  const exposure = context.document.graph.nodes.find((node) => node.id === pair.x);
  const outcome = context.document.graph.nodes.find((node) => node.id === pair.y);
  if (!exposure || !outcome) return null;
  const exposureState = context.simulation.nodeStates[exposure.id];
  const outcomeState = context.simulation.nodeStates[outcome.id];
  if (!isBinaryGraphNode(exposure, exposureState) || isBinaryGraphNode(outcome, outcomeState)) return null;
  const rawSummary = pairDerivedSummary(derived, exposure.id, outcome.id);
  const rawPoints = rawSummary.points;
  if (rawPoints.length === 0) return null;
  const rawGap = binaryContinuousGap(rawSummary.binaryContinuousGroups);
  const adjustedNodes = context.document.graph.nodes.filter((node) => node.roles.adjusted && node.id !== exposure.id && node.id !== outcome.id);
  const binaryAdjustedNodes = adjustedNodes.filter((node) => isBinaryGraphNode(node, context.simulation.nodeStates[node.id]));
  const stabilizedIpwNodes = adjustedNodes.filter(isStabilizedIpwNode);
  const binnedAdjustedNodes = adjustedNodes
    .filter((node) => !isBinaryGraphNode(node, context.simulation.nodeStates[node.id]) && !isStabilizedIpwNode(node))
    .map((node) => binnedAdjustmentNode(node, context.simulation.nodeStates[node.id], derived.nodes.get(node.id), { fallbackBins: 4 }))
    .filter((item): item is BinnedAdjustmentNode => item !== null);
  const binnedIds = new Set(binnedAdjustedNodes.map((item) => item.node.id));
  const unsupportedAdjustedNodes = adjustedNodes.filter((node) => (
    !isBinaryGraphNode(node, context.simulation.nodeStates[node.id]) && !binnedIds.has(node.id) && !isStabilizedIpwNode(node)
  ));
  const stabilizedIpw = stabilizedIpwNodes.length > 0
    ? computeStabilizedIpw(exposure, outcome, stabilizedIpwNodes, context.simulation, derived)
    : null;
  const expanders = [
    ...binaryAdjustedNodes.map((node) => binaryAdjustmentExpander(node, context.simulation.nodeStates[node.id])),
    ...binnedAdjustedNodes.map((item) => binnedAdjustmentExpander(item))
  ].filter((item): item is AdjustmentStratumCondition[] => item.length > 0).slice(0, 3);
  const strataResult = binaryContinuousAdjustmentStrata(expanders, exposureState, outcomeState);
  return {
    exposure,
    outcome,
    rawPoints,
    rawGroups: rawSummary.binaryContinuousGroups,
    rawGap,
    yDomain: rawSummary.ySampleDomain,
    adjustedNodes,
    binaryAdjustedNodes,
    binnedAdjustedNodes,
    unsupportedAdjustedNodes,
    strata: strataResult.items,
    stabilizedIpw,
    adjustedGap: stabilizedIpw?.weightedDiff ?? standardizedBinaryContinuousGap(strataResult.items),
    truncated: binaryAdjustedNodes.length + binnedAdjustedNodes.length > expanders.length || strataResult.truncated
  };
}

export function shouldShowAdjustedOutputColumn(document: GraphDocument, simulation: SimulationResult, moduleId: string | null, pair: ScatterPair): boolean {
  if (moduleId) return true;
  const exposure = document.graph.nodes.find((node) => node.id === pair.x);
  const outcome = document.graph.nodes.find((node) => node.id === pair.y);
  if (!exposure || !outcome) return false;
  if (isBinaryGraphNode(exposure, simulation.nodeStates[exposure.id])) return true;
  // Continuous-exposure examples still earn the adjusted column (estimand + structure) when there's a
  // conditioning operation — a selected / adjusted variable other than the exposure/outcome.
  return document.graph.nodes.some((node) => (node.roles.selected || node.roles.adjusted) && node.id !== exposure.id && node.id !== outcome.id);
}


export function shouldRenderBinaryAdjustmentOutput(output: BinaryAdjustmentOutput): boolean {
  return output.stabilizedIpw !== null || output.strata.length > 0;
}
