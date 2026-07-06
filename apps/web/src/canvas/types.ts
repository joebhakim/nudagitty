import type { AnalysisReport, EdgeMechanism, GraphEdge, GraphModel, Point, SimulationResult } from "@nudagitty/core";
import type { ModulationLink, ResultPendingState, SimulationDerivedCache } from "../app/types";
import type { Selection, ToolMode } from "../shared/appState";
import type { WorkbenchMode } from "../shared/workbench";

/** A pairwise copula coupling to draw on the canvas (a bidirected dependence link). */
export interface CopulaCoupling { id: string; aId: string; bId: string; short: string; label: string }

/** A "joint source" cloud: the shared hidden origin of a set of covariates' dependence, rendered
 *  identically whether the mechanism is a copula block (parametric — the latent projection of the
 *  coupling) or a plasmode row-source (empirical — resample real rows). Faded arrows to each coupled
 *  node; a moderator (if any) feeds INTO the cloud. A VIEW, not a model node — for plasmode, `sourceId`
 *  names the real latent node this cloud stands in for (hidden from the canvas with its table_lookup edges). */
export interface JointSourceCloud {
  id: string;
  kind: "copula" | "plasmode";
  nodeIds: string[];
  moderatorIds: string[];
  label: string;
  /** Short mechanism tag shown under the label (e.g. "copula" vs "real rows"). */
  sublabel?: string;
  /** Plasmode only: the real latent source node this cloud replaces on the canvas. */
  sourceId?: string;
}

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
  jointSources: JointSourceCloud[];
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
  /** Open the Joint / DGM editor for the confounder joint. Passing a joint source routes to its
   *  mechanism tab; called with no arg (e.g. double-clicking a coupling arc) opens the default tab. */
  onOpenJointLab?: (source?: { id: string; kind: "copula" | "plasmode" }) => void;
  /** Select a coupling arc (single click) so it can be deleted / highlighted. */
  onSelectCoupling?: (id: string) => void;
  /** Multi-select group actions (Shift+drag / Shift-click selects ≥2 nodes → the action bar). */
  onWireMany?: (sourceIds: string[], targetId: string) => void;
  onAdjustMany?: (ids: string[]) => void;
  onCoupleMany?: (ids: string[]) => void;
  onDeleteMany?: (ids: string[]) => void;
}
