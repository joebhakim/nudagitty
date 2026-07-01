import { useMemo } from "react";
import type { ExampleModel, GraphDocument } from "@nudagitty/core";
import type { OutputContext } from "../outputs/types";
import type { ScatterPair } from "../shared/pairs";
import { computeCompletedOutput, computeStructuralDiagnosis, observedSurvivalView } from "../outputs/modules";
import { defaultScatterPair, reconcileScatterPair } from "../shared/pairs";
import { computeBinaryAdjustmentOutput, computeBinaryContinuousAdjustmentOutput } from "../compute/adjustmentOutput";
import { deriveOperation } from "../shared/operations";
import type { buildSimulationDerivedCache } from "../compute/scatterStats";

type SimulationDerived = ReturnType<typeof buildSimulationDerivedCache>;

// The operation-aware output modules: the completed what-if output, the structural diagnosis and
// its trustworthiness, the observed-survival crude view, the scatter pairs, the binary/continuous
// adjustment estimates, and the frame operation. Extracted verbatim from App() as a contiguous run
// of useMemos — call order and every dependency array preserved.
export function useOutputComputations(
  outputContext: OutputContext,
  simulationDerived: SimulationDerived,
  activeExample: ExampleModel | null,
  computationDocument: GraphDocument,
  scatterPair: ScatterPair,
  document: GraphDocument
) {
  const completedOutput = useMemo(() => computeCompletedOutput(outputContext, activeExample?.outputModule ?? null), [activeExample?.outputModule, outputContext]);
  // The generic structural diagnosis, computed for EVERY example so its Estimand/Structure cards can be
  // shown alongside a dedicated module too (consistency: the target estimand shouldn't depend on whether
  // the example happens to have a bespoke output module).
  const structuralAux = useMemo(() => computeStructuralDiagnosis(outputContext), [outputContext]);
  // Only surface the auto-estimand alongside a dedicated module when it's TRUSTWORTHY: a descriptive
  // selection/stratification estimand is always fine, but a "backdoor-standardized" estimand is only
  // valid when the adjustment actually identifies the effect — otherwise (front-door's mediator, M-bias's
  // collider) it would assert a wrong target, so we suppress it there rather than mislead.
  const auxEstimandTrustworthy = useMemo(() => {
    const primary = outputContext.analysis.conditioningRoles[0];
    if (!primary) return false;
    if (primary.operation !== "adjust") return true;
    return outputContext.analysis.totalEffect.valid;
  }, [outputContext]);
  // For survival examples the observed-association card shows the crude (naive) survival
  // curves — the same view as the adjusted estimate, before adjustment.
  const observedSurvival = useMemo(() => observedSurvivalView(completedOutput), [completedOutput]);
  const activeOutputPair = useMemo(() => reconcileScatterPair(computationDocument.graph, scatterPair), [computationDocument.graph, scatterPair]);
  const defaultOutputPair = useMemo(() => defaultScatterPair(computationDocument.graph), [computationDocument.graph]);
  const binaryAdjustmentOutput = useMemo(() => computeBinaryAdjustmentOutput(outputContext, simulationDerived, activeOutputPair), [activeOutputPair, outputContext, simulationDerived]);
  const binaryContinuousAdjustmentOutput = useMemo(() => computeBinaryContinuousAdjustmentOutput(outputContext, simulationDerived, activeOutputPair), [activeOutputPair, outputContext, simulationDerived]);
  const completedOutputActive = Boolean(activeExample?.outputModule?.startsWith("what-if-") && completedOutput);
  // The output frame is operation-aware: select / condition / adjust are distinct estimands,
  // not all "adjustment". With no conditioning operation it is a structural diagnosis of the
  // DAG, not an "adjustment target".
  const frameOperation = useMemo(() => {
    const operations = document.graph.nodes
      .filter((node) => node.roles.adjusted || node.roles.selected)
      .map((node) => deriveOperation(document, node.id));
    if (operations.includes("select")) return "select" as const;
    if (operations.includes("adjust")) return "adjust" as const;
    if (operations.includes("condition")) return "condition" as const;
    return "none" as const;
  }, [document]);
  return {
    completedOutput,
    structuralAux,
    auxEstimandTrustworthy,
    observedSurvival,
    activeOutputPair,
    defaultOutputPair,
    binaryAdjustmentOutput,
    binaryContinuousAdjustmentOutput,
    completedOutputActive,
    frameOperation
  };
}
