import { useMemo, useState } from "react";
import type { GraphDocument, ViewMode } from "@nudagitty/core";
import type { ResultPendingState } from "../app/types";
import {
  graphAnalysisSignature,
  graphOutputSignature,
  graphSimulationSignature
} from "../compute/graphSignatures";
import { transformView } from "../compute/viewTransforms";

// The signature-stable graph/simulation snapshots that gate the analysis, simulation, and
// output pipelines, plus the pending flags derived from comparing the requested signature to
// the last settled one. Extracted verbatim from App() as a contiguous run of hooks — call
// order and dependency arrays are unchanged.
export function useDerivedGraphs(document: GraphDocument, viewMode: ViewMode) {
  const visibleGraph = useMemo(() => transformView(document.graph, viewMode), [document.graph, viewMode]);
  const analysisSignature = graphAnalysisSignature(document.graph);
  const analysisGraph = useMemo(() => document.graph, [analysisSignature]);
  const [analysisResultSignature, setAnalysisResultSignature] = useState(() => analysisSignature);
  const simulationGraphSignature = graphSimulationSignature(document.graph);
  const simulationGraph = useMemo(() => document.graph, [simulationGraphSignature]);
  const simulationSignature = useMemo(() => `${simulationGraphSignature}::${JSON.stringify(document.simulation)}`, [document.simulation, simulationGraphSignature]);
  const [simulationResultSignature, setSimulationResultSignature] = useState(() => simulationSignature);
  const outputSignature = graphOutputSignature(document.graph);
  const outputGraph = useMemo(() => document.graph, [outputSignature]);
  const outputSimulation = useMemo(() => document.simulation, [simulationSignature]);
  const analysisPending = analysisResultSignature !== analysisSignature;
  const simulationPending = simulationResultSignature !== simulationSignature;
  const resultsPending: ResultPendingState = { analysis: analysisPending, simulation: simulationPending };
  const pairwisePending: ResultPendingState = { analysis: false, simulation: simulationPending };
  const computationDocument = useMemo<GraphDocument>(() => ({
    ...document,
    graph: outputGraph,
    simulation: outputSimulation
  }), [document.id, document.metadata, document.schemaVersion, outputGraph, outputSimulation]);
  return {
    visibleGraph,
    analysisSignature,
    analysisGraph,
    analysisResultSignature,
    setAnalysisResultSignature,
    simulationGraphSignature,
    simulationGraph,
    simulationSignature,
    simulationResultSignature,
    setSimulationResultSignature,
    outputSignature,
    outputGraph,
    outputSimulation,
    analysisPending,
    simulationPending,
    resultsPending,
    pairwisePending,
    computationDocument
  };
}
