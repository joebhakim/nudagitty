import type { AnalysisReport, EdgeMechanism, GraphEdge, GraphModel, Point, SimulationResult } from "@nudagitty/core";
import type { ModulationLink, ResultPendingState, SimulationDerivedCache } from "../app/types";
import type { Selection, ToolMode } from "../shared/appState";
import type { WorkbenchMode } from "../shared/workbench";

/** A pairwise copula coupling to draw on the canvas (a bidirected dependence link). */
export interface CopulaCoupling { id: string; aId: string; bId: string; short: string; label: string }

// Prop shape for the canvas surface. Extracted verbatim from the (now-deleted) legacy
// GraphCanvas so FlowGraphCanvas/FlowGraphCanvasInner keep their exact prop type.
export interface GraphCanvasProps {
  mode: WorkbenchMode;
  graph: GraphModel;
  sourceGraph: GraphModel;
  selection: Selection;
  tool: ToolMode;
  edgeSource: string | null;
  analysis: AnalysisReport;
  simulation: SimulationResult;
  derived: SimulationDerivedCache;
  edgeMechanisms: Record<string, EdgeMechanism>;
  modulations: ModulationLink[];
  copulaCouplings: CopulaCoupling[];
  disabledEdgeIds: Set<string>;
  highlightedEdges: Map<string, "causal" | "biasing">;
  ancestorIds: Set<string>;
  showNoiseNodes: boolean;
  pending: ResultPendingState;
  onSelect: (selection: Selection) => void;
  onAddNode: (point: Point) => void;
  onMoveNode: (id: string, position: Point) => void;
  onNodeClick: (id: string) => void;
  onEdgeClick: (id: string) => void;
  onEdgeControl: (edge: GraphEdge) => void;
  onResample: () => void;
  /** Open the Joint Lab to edit the confounder joint (e.g. clicking a coupling arc). */
  onOpenJointLab?: () => void;
}
