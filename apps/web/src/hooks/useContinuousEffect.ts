import { useMemo } from "react";
import { analyzeContinuousEffect } from "@nudagitty/core";
import type { ContinuousEffectComparison, ExampleModel, GraphModel, SimulationResult, SimulationSpec } from "@nudagitty/core";
import type { ScatterPair } from "../shared/pairs";

// The continuous-exposure analog of useUnifiedAdjustment: for an ordered-numeric
// exposure (which the binary g-methods panel skips), produce the dose-response
// effect comparison. Returns null for binary exposures (the unified panel handles
// those) and for what-if examples (they own their output module).
export function useContinuousEffect(
  activeExample: ExampleModel | null,
  graph: GraphModel,
  spec: SimulationSpec,
  simulation: SimulationResult,
  activeOutputPair: ScatterPair
): { continuousEffect: ContinuousEffectComparison | null } {
  const continuousEffect = useMemo(() => {
    if (activeExample?.outputModule?.startsWith("what-if-")) return null;
    return analyzeContinuousEffect(graph, spec, simulation, activeOutputPair);
  }, [activeExample, graph, spec, simulation, activeOutputPair]);
  return { continuousEffect };
}
