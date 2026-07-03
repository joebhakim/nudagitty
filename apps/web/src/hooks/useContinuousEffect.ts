import { useMemo } from "react";
import { analyzeCategoricalEffect, analyzeContinuousEffect } from "@nudagitty/core";
import type { CategoricalEffectComparison, ContinuousEffectComparison, ExampleModel, GraphModel, SimulationResult, SimulationSpec } from "@nudagitty/core";
import type { ScatterPair } from "../shared/pairs";

// The non-binary-exposure analog of useUnifiedAdjustment: for an exposure the binary
// g-methods panel skips, produce the family-appropriate effect comparison — a dose-
// response for ordered-numeric exposures, or a per-level multi-arm comparison for a
// categorical (unordered) exposure. Both are null for binary exposures (the unified
// panel handles those) and for what-if examples (they own their output module).
export function useContinuousEffect(
  activeExample: ExampleModel | null,
  graph: GraphModel,
  spec: SimulationSpec,
  simulation: SimulationResult,
  activeOutputPair: ScatterPair
): { continuousEffect: ContinuousEffectComparison | null; categoricalEffect: CategoricalEffectComparison | null } {
  const suppress = activeExample?.outputModule?.startsWith("what-if-") ?? false;
  const continuousEffect = useMemo(() => {
    if (suppress) return null;
    return analyzeContinuousEffect(graph, spec, simulation, activeOutputPair);
  }, [suppress, graph, spec, simulation, activeOutputPair]);
  const categoricalEffect = useMemo(() => {
    if (suppress) return null;
    return analyzeCategoricalEffect(graph, spec, simulation, activeOutputPair);
  }, [suppress, graph, spec, simulation, activeOutputPair]);
  return { continuousEffect, categoricalEffect };
}
