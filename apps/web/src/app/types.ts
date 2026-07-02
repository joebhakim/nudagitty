import type {
  EdgeMechanism,
  GraphEdge,
  GraphNode,
  Point,
  SimulatedNodeState,
  SimulationResult
} from "@nudagitty/core";
import type { ScatterPoint } from "../charts/CategoryOutcomePlot";
import type { BasicOutputPunchlineMetric } from "../outputs/modules";

export type CanvasViewport = { cx: number; cy: number; zoom: number };
export type BinaryCell = { x: 0 | 1; y: 0 | 1; weight: number; count: number; percent: number; columnPercent: number };
export type BinaryContinuousGroup = { value: 0 | 1; count: number; weight: number; mean: number | null; share: number };
export type BasicRelationSummary = {
  relationLabel: string;
  observed: BasicOutputPunchlineMetric;
  comparison: BasicOutputPunchlineMetric | null;
  ledgerRows?: BasicComparisonLedgerRow[];
  note: string;
};
export type BasicComparisonLedgerRow = {
  id: string;
  label: string;
  sample: string;
  adjustment: string;
  method: string;
  status: "raw" | "adjusted" | "selected" | "intervention" | "dgp";
  metric: BasicOutputPunchlineMetric;
};
export type BasicDemoContext = {
  interventions: string[];
  selections: string[];
};
export type WeightedScatterSummary = {
  meanX: number;
  meanY: number;
  correlation: number | null;
  slope: number;
  intercept: number;
};
export type BinaryOutcomeContrastSummary = { yAtX0: number | null; yAtX1: number | null; diff: number | null };
export type NodeDistributionSummary = {
  domain: [number, number] | null;
  finiteSamples: number[];
  histogram18: number[];
  histogram20: number[];
};
export type PairDerivedSummary = {
  points: ScatterPoint[];
  stats: WeightedScatterSummary | null;
  binaryCells: BinaryCell[];
  binaryContrast: BinaryOutcomeContrastSummary;
  binaryContinuousGroups: BinaryContinuousGroup[];
  xDomain: [number, number];
  yDomain: [number, number];
  ySampleDomain: [number, number];
};
export type SimulationDerivedCache = {
  simulation: SimulationResult;
  nodes: Map<string, NodeDistributionSummary>;
  pairs: Map<string, PairDerivedSummary>;
};
export type BinaryAdjustmentOutput = {
  exposure: GraphNode;
  outcome: GraphNode;
  rawPoints: ScatterPoint[];
  rawCells: BinaryCell[];
  rawContrast: BinaryOutcomeContrastSummary;
  adjustedNodes: GraphNode[];
  binaryAdjustedNodes: GraphNode[];
  binnedAdjustedNodes: BinnedAdjustmentNode[];
  unsupportedAdjustedNodes: GraphNode[];
  strata: BinaryAdjustmentStratum[];
  stabilizedIpw: StabilizedIpwOutput | null;
  truncated: boolean;
};
export type BinaryContinuousAdjustmentOutput = {
  exposure: GraphNode;
  outcome: GraphNode;
  rawPoints: ScatterPoint[];
  rawGroups: BinaryContinuousGroup[];
  rawGap: number | null;
  yDomain: [number, number];
  adjustedNodes: GraphNode[];
  binaryAdjustedNodes: GraphNode[];
  binnedAdjustedNodes: BinnedAdjustmentNode[];
  unsupportedAdjustedNodes: GraphNode[];
  strata: BinaryContinuousAdjustmentStratum[];
  stabilizedIpw: StabilizedIpwOutput | null;
  adjustedGap: number | null;
  truncated: boolean;
};
export type ResultPendingState = {
  analysis: boolean;
  simulation: boolean;
};
export type StabilizedIpwOutput = {
  exposure: GraphNode;
  outcome: GraphNode | null;
  adjustedNodes: GraphNode[];
  treatedShare: number;
  rawTreated: number | null;
  rawUntreated: number | null;
  rawDiff: number | null;
  weightedTreated: number | null;
  weightedUntreated: number | null;
  weightedDiff: number | null;
  effectiveSampleSize: number | null;
  maxWeight: number | null;
  clippedCount: number;
  sampleCount: number;
  weightedPoints: ScatterPoint[];
  weightedCells: BinaryCell[];
  weightedContrast: BinaryOutcomeContrastSummary;
  balances: StabilizedIpwBalance[];
};
export type StabilizedIpwBalance = {
  node: GraphNode;
  domain: [number, number];
  rawTreatedMean: number | null;
  rawUntreatedMean: number | null;
  weightedTreatedMean: number | null;
  weightedUntreatedMean: number | null;
  rawSmd: number | null;
  weightedSmd: number | null;
};
export type StabilizedIpwRow = {
  treatment: 0 | 1;
  outcome: number | null;
  covariates: number[];
  baseWeight: number;
  weight: number;
};
export type BinnedAdjustmentNode = {
  node: GraphNode;
  state: SimulatedNodeState;
  domain: [number, number];
  cutpoints: number[];
  automatic?: boolean;
};
export type BinaryAdjustmentStratum = {
  id: string;
  label: string;
  points: ScatterPoint[];
  cells: BinaryCell[];
  contrast: BinaryOutcomeContrastSummary;
  weight: number;
};
export type BinaryContinuousAdjustmentStratum = {
  id: string;
  label: string;
  displayLabels: string[];
  points: ScatterPoint[];
  groups: BinaryContinuousGroup[];
  gap: number | null;
  weight: number;
};
export type AdjustmentStratumCondition =
  | { kind: "binary"; node: GraphNode; value: 0 | 1; state: SimulatedNodeState }
  | { kind: "bin"; node: GraphNode; lower: number; upper: number; index: number; last: boolean; state: SimulatedNodeState };
export type PositivityRow = { lower: number; upper: number; exposed: number; unexposed: number; total: number; warning: string | null };
export type DesignModuleStatus = "usable" | "todo";
export type DragState =
  | { kind: "node"; id: string; offset: Point }
  | { kind: "edge-control"; id: string }
  | { kind: "pan"; pointerId: number; lastPoint: Point; moved: boolean }
  | null;
export type PointerScreenPoint = { clientX: number; clientY: number };
export type EdgeGeometry = { path: string; control: Point; label: Point; start: Point; end: Point; curved: boolean };
export type ShareStatus = "idle" | "copied" | "too-large" | "failed";
export type FlowGraphNodeData = Record<string, unknown> & {
  node: GraphNode;
  selected: boolean;
  edgeSource: boolean;
  ancestor: boolean;
  changed: boolean;
  value?: number;
  state?: SimulatedNodeState;
  summary?: NodeDistributionSummary;
  candidateInstrument: boolean;
  showNoise: boolean;
  onNodeClick: (id: string) => void;
};
export type FlowGraphEdgeData = Record<string, unknown> & {
  edge: GraphEdge;
  source: GraphNode;
  target: GraphNode;
  mechanism: EdgeMechanism;
  geometry: EdgeGeometry;
  semantic?: "causal" | "biasing";
  enabled: boolean;
  denseEdges: boolean;
  onSelect: (id: string) => void;
};
export type ModulationLink = { id: string; gateId: string; sourceId: string; targetId: string; sign: number; coefficient: number };
export type ArrowHeadGeometry = { path: string; base: Point };
export type ShowcaseGuide = {
  title: string;
  target: string;
  items: string[];
};
export type ModuleTone = "edit" | "output" | "scenario";
