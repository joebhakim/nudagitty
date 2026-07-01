import { useMemo } from "react";
import type { GraphDocument, SimulationResult } from "@nudagitty/core";
import type { ExampleModel } from "@nudagitty/core";
import type { OutputContext } from "../outputs/types";
import type { ComputedCompletedOutput } from "../outputs/modules";
import type { ScatterPair } from "../shared/pairs";
import type { BasicDemoContext } from "../app/types";
import { computeBinaryAdjustmentOutput } from "../compute/adjustmentOutput";
import { computeBasicRelationSummary, formatActiveInterventions } from "../compute/relationSummary";
import type { buildSimulationDerivedCache } from "../compute/scatterStats";

type SimulationDerived = ReturnType<typeof buildSimulationDerivedCache>;

// The demo/basic result-panel inputs: the default-pair binary adjustment estimate, the plain-language
// relation summary, and the active interventions/selections context. Extracted verbatim from App() as
// a contiguous run of useMemos — call order and every dependency array are preserved.
export function useBasicOutputs(
  outputContext: OutputContext,
  simulationDerived: SimulationDerived,
  defaultOutputPair: ScatterPair,
  activeExample: ExampleModel | null,
  completedOutput: ComputedCompletedOutput | null,
  isBasicMode: boolean,
  document: GraphDocument,
  simulation: SimulationResult
) {
  const demoBinaryAdjustmentOutput = useMemo(() => computeBinaryAdjustmentOutput(outputContext, simulationDerived, defaultOutputPair), [defaultOutputPair, outputContext, simulationDerived]);
  const basicRelationSummary = useMemo(
    () => computeBasicRelationSummary({ ...outputContext, moduleId: activeExample?.outputModule ?? null }, completedOutput, simulationDerived, demoBinaryAdjustmentOutput, { hideOracle: isBasicMode }),
    [activeExample?.outputModule, completedOutput, demoBinaryAdjustmentOutput, isBasicMode, outputContext, simulationDerived]
  );
  const basicDemoContext = useMemo<BasicDemoContext>(() => ({
    interventions: formatActiveInterventions(document),
    selections: simulation.conditioning.activeConditions
  }), [document.graph, document.simulation.overrides, simulation.conditioning.activeConditions]);
  return { demoBinaryAdjustmentOutput, basicRelationSummary, basicDemoContext };
}
