import { useMemo } from "react";
import type { AnalysisReport, GraphDocument, GraphModel } from "@nudagitty/core";
import type { ModulationLink } from "../app/types";
import { computeHighlightedEdges } from "../compute/viewTransforms";

// The derived overlay data the canvas draws on top of the structural graph: causal/biasing edge
// highlighting, the ancestor set, and moderator (smooth-gated interaction) links. Extracted
// verbatim from App() as a contiguous run of useMemos — call order and dependency arrays unchanged.
export function useCanvasOverlays(
  analysisGraph: GraphModel,
  analysis: AnalysisReport,
  showCausal: boolean,
  showBiasing: boolean,
  showAncestors: boolean,
  document: GraphDocument
) {
  // Keyed on analysisGraph (position-stable) not document.graph: edge highlighting is structural,
  // so a node drag should not re-run the path analysis.
  const highlightedEdges = useMemo(() => computeHighlightedEdges(analysisGraph, analysis, showCausal, showBiasing), [analysis, analysisGraph, showBiasing, showCausal]);
  const ancestorIds = useMemo(() => showAncestors ? new Set(analysis.causalPaths.flat()) : new Set<string>(), [analysis.causalPaths, showAncestors]);
  // Moderator / effect-modifier links: each smooth-gated interaction is a node (the gate) acting upon
  // the source→target edge. Surfaced to the canvas so it can draw the gate→edge modulation arrow.
  const modulations = useMemo<ModulationLink[]>(() => {
    const out: ModulationLink[] = [];
    for (const [targetId, mechanism] of Object.entries(document.simulation.nodes)) {
      for (const interaction of mechanism?.interactions ?? []) {
        if (interaction.kind === "smooth_gated") {
          out.push({ id: interaction.id, gateId: interaction.gate, sourceId: interaction.source, targetId, sign: Math.sign(interaction.coefficient), coefficient: interaction.coefficient });
        }
      }
    }
    return out;
  }, [document.simulation.nodes]);
  return { highlightedEdges, ancestorIds, modulations };
}
