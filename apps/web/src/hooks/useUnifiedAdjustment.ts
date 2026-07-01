import { useCallback, useMemo } from "react";
import { analyzeAdjustment, deriveAdjustmentSpec, normalizeVariableModel } from "@nudagitty/core";
import type { CovariateBasis, ExampleModel, GraphDocument } from "@nudagitty/core";
import { pairDerivedSummary } from "../compute/scatterStats";
import type { buildSimulationDerivedCache } from "../compute/scatterStats";
import type { ScatterPair } from "../shared/pairs";

type SimulationDerived = ReturnType<typeof buildSimulationDerivedCache>;

// Classic examples (no what-if module) get the SAME canonical g-method panel as the longitudinal
// ones, derived from the current adjust/condition operations + the pair. Extracted verbatim from
// App() as the contiguous computeUnifiedAdjustment useCallback + its two useMemo applications;
// call order and every dependency array are preserved.
export function useUnifiedAdjustment(
  activeExample: ExampleModel | null,
  computationDocument: GraphDocument,
  covariateBasis: CovariateBasis,
  simulationDerived: SimulationDerived,
  activeOutputPair: ScatterPair,
  defaultOutputPair: ScatterPair
) {
  const computeUnifiedAdjustment = useCallback((pair: ScatterPair) => {
    if (activeExample?.outputModule?.startsWith("what-if-")) return null;
    const spec = deriveAdjustmentSpec(computationDocument, { exposure: pair.x, outcome: pair.y });
    // Show the observed/re-simulated effect graph for ANY exposure→outcome pair, even with no
    // adjustment set (mediation, a randomized treatment, a selection example) — observed-vs-oracle is
    // always informative. With an empty set the from-data methods collapse toward the crude contrast,
    // which is honest ("nothing to adjust"); an IV example keeps them too (unmeasured confounder).
    if (!spec) return null;
    // g-methods contrast two treatment arms — only meaningful for a BINARY treatment. For a continuous
    // exposure (e.g. the chess IQ selection example) skip the unified panel; the estimand/structure
    // still render via the structural diagnosis.
    const treatmentNode = computationDocument.graph.nodes.find((node) => node.id === (spec.treatments[0] ?? pair.x));
    if (treatmentNode && normalizeVariableModel(treatmentNode.variable).valueType !== "binary") return null;
    const comparison = analyzeAdjustment(computationDocument, { ...spec, covariateBasis });
    if (!comparison) return null;
    const outcomeNode = computationDocument.graph.nodes.find((node) => node.id === spec.outcome);
    // Observed individual outcome-by-treatment points (the swarm + the observed mean/CI) for the
    // effect graph; treatment node id is kept so the graph can style the X axis like other charts.
    const observed = pairDerivedSummary(simulationDerived, spec.treatments[0] ?? pair.x, spec.outcome);
    return { comparison, outcomeScale: spec.outcomeScale, outcomeUnit: outcomeNode?.variable.unit ?? "", points: observed.points, treatmentId: spec.treatments[0] ?? pair.x };
  }, [activeExample, computationDocument, covariateBasis, simulationDerived]);
  const unifiedAdjustment = useMemo(() => computeUnifiedAdjustment(activeOutputPair), [computeUnifiedAdjustment, activeOutputPair]);
  const demoUnifiedAdjustment = useMemo(() => computeUnifiedAdjustment(defaultOutputPair), [computeUnifiedAdjustment, defaultOutputPair]);
  return { unifiedAdjustment, demoUnifiedAdjustment };
}
