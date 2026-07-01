import { useMemo } from "react";
import { findNode, structuralRoleOf } from "@nudagitty/core";
import type { AnalysisReport, GraphDocument, SimulationResult } from "@nudagitty/core";
import { useAnalyticsTelemetry, type TelemetrySignals } from "../analyticsTelemetry";
import type { ChartKind, EmptyReason, FunnelRole, OutputKind } from "../analytics";
import { deriveOperation } from "../shared/operations";
import { isBinaryGraphNode } from "../compute/scatterStats";
import type { ComputedCompletedOutput } from "../outputs/modules";
import type { Selection } from "../shared/appState";
import type { ScatterPair } from "../shared/pairs";
import type { ExampleModel } from "@nudagitty/core";

// Granular, privacy-preserving telemetry (see analyticsTelemetry). Every field is
// a categorical signal derived from the analysis report / simulation summary —
// never a node label or free-form value — so it stays banner-free. Extracted verbatim
// from App() as the contiguous telemetrySignals useMemo + the useAnalyticsTelemetry hook;
// call order and the dependency array are unchanged.
export function useAppTelemetry(
  activeExample: ExampleModel | null,
  analysis: AnalysisReport,
  completedOutput: ComputedCompletedOutput | null,
  document: GraphDocument,
  selection: Selection | null,
  simulation: SimulationResult,
  activeOutputPair: ScatterPair
): void {
  const telemetrySignals = useMemo<TelemetrySignals>(() => {
    const hasEstimand = analysis.exposures.length > 0 && analysis.outcomes.length > 0;
    const selectedNodeId = selection?.kind === "node" ? selection.id : null;
    const conditionedOps = analysis.adjusted.map((id) => deriveOperation(document, id));
    const conditioningActive = simulation.conditioning.activeConditions.length > 0;
    const acceptedSamples = simulation.conditioning.acceptedSamples;

    const outputKind: OutputKind | null = !hasEstimand ? null
      : conditionedOps.includes("adjust") ? "standardized"
      : conditionedOps.includes("condition") ? "stratified"
      : completedOutput?.result ? "completed"
      : activeExample && !activeExample.outputModule ? "diagnosis"
      : "crude";

    const outputEmptyReason: EmptyReason | null = !hasEstimand ? "no_exposure_outcome"
      : completedOutput && completedOutput.result === null ? "needs_roles"
      : conditioningActive && acceptedSamples === 0 ? "no_data"
      : null;

    let chartKind: ChartKind | null = null;
    if (activeOutputPair) {
      const xNode = findNode(document.graph, activeOutputPair.x);
      const yNode = findNode(document.graph, activeOutputPair.y);
      if (xNode && yNode) {
        const xBinary = isBinaryGraphNode(xNode, simulation.nodeStates[xNode.id]);
        const yBinary = isBinaryGraphNode(yNode, simulation.nodeStates[yNode.id]);
        chartKind = xBinary && yBinary ? "category_binary"
          : xBinary && !yBinary ? "category_continuous"
          : !xBinary && yBinary ? "risk_curve"
          : "scatter";
      }
    }

    return {
      exampleId: activeExample?.id ?? "",
      selectedNodeId,
      selectedRole: selectedNodeId ? (structuralRoleOf(document.graph, analysis, selectedNodeId) as FunnelRole) : null,
      outputKind,
      outputEmptyReason,
      chartKind,
      badControlActive: analysis.conditioningRoles.some((role) => role.opensBiasingPath),
      simStatus: conditioningActive && acceptedSamples === 0 ? "empty" : "ok",
      conditioningActive,
      samplingMethod: simulation.conditioning.empiricalMethod,
      acceptedSamples
    };
  }, [activeExample, analysis, completedOutput, document, selection, simulation, activeOutputPair]);
  useAnalyticsTelemetry(telemetrySignals);
}
