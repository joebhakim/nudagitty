import { normalizeGraphDocumentMetadata } from "../graph";
import { runSimulation } from "../simulation";
import type { GraphDocument, SimulationResult } from "../types";
import type { ExtractedLongitudinalGraph, ExtractedLongitudinalNode, LongitudinalCohort } from "./types";

export function extractLongitudinalGraph(document: GraphDocument): ExtractedLongitudinalGraph {
  const metadata = normalizeGraphDocumentMetadata(document.metadata);
  const timeById = new Map(metadata.longitudinal.timePoints.map((point) => [point.id, point]));
  const nodes = document.graph.nodes.flatMap((node): ExtractedLongitudinalNode[] => {
    const nodeMetadata = metadata.longitudinal.variables[node.id];
    if (!nodeMetadata) return [];
    return [{
      node,
      metadata: nodeMetadata,
      timePoint: nodeMetadata.time ? timeById.get(nodeMetadata.time) ?? null : null
    }];
  });
  const nodeIds = new Set(document.graph.nodes.map((node) => node.id));
  const diagnostics = validateLongitudinalMetadata(document);
  for (const [nodeId] of Object.entries(metadata.longitudinal.variables)) {
    if (!nodeIds.has(nodeId)) diagnostics.push(`Longitudinal metadata references missing node ${nodeId}.`);
  }
  return {
    timePoints: metadata.longitudinal.timePoints,
    nodes,
    treatmentStrategies: metadata.longitudinal.treatmentStrategies,
    diagnostics
  };
}

export function validateLongitudinalMetadata(document: GraphDocument): string[] {
  const metadata = normalizeGraphDocumentMetadata(document.metadata).longitudinal;
  const diagnostics: string[] = [];
  const nodeIds = new Set(document.graph.nodes.map((node) => node.id));
  const timeIds = new Set(metadata.timePoints.map((point) => point.id));
  for (const [nodeId, variable] of Object.entries(metadata.variables)) {
    if (!nodeIds.has(nodeId)) diagnostics.push(`Missing graph node for longitudinal variable ${nodeId}.`);
    if (variable.time && !timeIds.has(variable.time)) diagnostics.push(`${nodeId} references missing time point ${variable.time}.`);
  }
  for (const strategy of metadata.treatmentStrategies) {
    for (const assignment of strategy.assignments) {
      if (!nodeIds.has(assignment.variable)) diagnostics.push(`${strategy.label} assigns missing treatment ${assignment.variable}.`);
    }
    for (const rule of strategy.rules) {
      if (!nodeIds.has(rule.variable)) diagnostics.push(`${strategy.label} rules target missing treatment ${rule.variable}.`);
      if (!nodeIds.has(rule.conditionVariable)) diagnostics.push(`${strategy.label} conditions on missing variable ${rule.conditionVariable}.`);
    }
  }
  for (const estimand of metadata.estimands) {
    if (!nodeIds.has(estimand.outcome)) diagnostics.push(`${estimand.label} uses missing outcome ${estimand.outcome}.`);
    for (const strategyId of estimand.strategies) {
      if (!metadata.treatmentStrategies.some((strategy) => strategy.id === strategyId)) diagnostics.push(`${estimand.label} references missing strategy ${strategyId}.`);
    }
  }
  return diagnostics;
}

export function simulateLongitudinalCohort(document: GraphDocument): LongitudinalCohort {
  const result = runSimulation(document.graph, document.simulation);
  return cohortFromSimulationResult(result);
}

export function cohortFromSimulationResult(result: SimulationResult): LongitudinalCohort {
  const states = Object.entries(result.nodeStates);
  const sampleSize = states.reduce((size, [, state]) => Math.min(size, state.empirical.samples.length), Number.POSITIVE_INFINITY);
  const finiteSampleSize = Number.isFinite(sampleSize) ? sampleSize : 0;
  const rows: Array<Record<string, number>> = [];
  const weights: number[] = [];
  for (let index = 0; index < finiteSampleSize; index += 1) {
    const row: Record<string, number> = {};
    let weight = 1;
    for (const [id, state] of states) {
      const value = state.empirical.samples[index];
      if (value !== undefined && Number.isFinite(value)) row[id] = value;
      const candidateWeight = state.empirical.weights[index];
      if (candidateWeight !== undefined && Number.isFinite(candidateWeight)) weight = Math.max(0, candidateWeight);
    }
    rows.push(row);
    weights.push(weight);
  }
  return {
    result,
    rows,
    weights,
    sampleSize: rows.length
  };
}
