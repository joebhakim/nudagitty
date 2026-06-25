import CodeMirror from "@uiw/react-codemirror";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  Handle,
  Position,
  useReactFlow,
  useStore,
  ViewportPortal
} from "@xyflow/react";
import type { Edge as FlowEdge, EdgeProps as FlowEdgeProps, Node as FlowNode, NodeChange, NodeProps as FlowNodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import {
  ArrowRight,
  Braces,
  Camera,
  CirclePlus,
  Download,
  FilePlus2,
  Info,
  MousePointer2,
  Presentation,
  Redo2,
  RefreshCw,
  Share2,
  Sigma,
  Blend,
  Trash2,
  Undo2,
  Upload,
  X
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EXAMPLES,
  addEdge,
  addNode,
  adjusted,
  analyzeGraph,
  analyzeAdjustment,
  adjustmentOverlap,
  positivityStatus,
  deriveAdjustmentSpec,
  classifyConditioned,
  structuralRoleOf,
  correlationGraph,
  createNewNodeId,
  createNode,
  defaultEdgeMechanism,
  defaultNodeDistribution,
  deleteEdge,
  deleteNode,
  edgeId,
  emptyDocument,
  exampleDenouement,
  exampleDocument,
  equivalenceGraph,
  exposures,
  findEdge,
  findNode,
  graphWithKind,
  moralGraph,
  normalizeVariableModel,
  outcomes,
  parseModel,
  reconcileSimulationSpec,
  renameNode,
  normalizeEdgeMechanism,
  normalizeNodeMechanism,
  runSimulation,
  selected,
  serializeModel,
  serializeTikz,
  setNodeRole,
  updateNode,
  upsertEdge,
  withGraph
} from "@nudagitty/core";
import type {
  AnalysisOperation,
  AnalysisReport,
  EdgeMechanism,
  EdgeMechanismKind,
  EdgeKind,
  ExampleDenouement,
  EffectKind,
  CovariateBasis,
  GMethodsComparison,
  GraphDocument,
  GraphEdge,
  GraphModel,
  GraphNode,
  NodeDistribution,
  NodeCombinerKind,
  NodeInteraction,
  NodeMechanism,
  NodeRoleFlags,
  Point,
  SimulationResult,
  SimulationInferenceMode,
  SimulationSelectionCondition,
  SimulatedAnalyticDistribution,
  SimulatedNodeState,
  VariableModel,
  ViewMode
} from "@nudagitty/core";
import {
  clamp,
  coerceBinary,
  formatInputNumber,
  formatPercent,
  formatPercentagePoints,
  formatSignedValue,
  formatValue,
  formatWeightedCount
} from "./shared/formatting";
import {
  CategoryOutcomePlot,
  RiskCurvePlot,
  binaryOutcomeSummaries,
  binnedBinaryRiskSummaries,
  categoryOutcomeDomain,
  continuousOutcomeSummaries,
  weightedPointMoments
} from "./charts/CategoryOutcomePlot";
import type { RiskBin, ScatterPoint } from "./charts/CategoryOutcomePlot";
import { computeEdgeTransfer } from "./charts/edgeTransfer";
import { chartFrame, niceTicks, paddedDomain } from "./charts/chartFrame";
import { startEngagementMilestones, trackAnalyticsEvent, trackDenouementViewed, trackEditCommitted, trackInfoOverlayOpened, trackOperationSet, type ChartKind, type EmptyReason, type FunnelRole, type OutputKind } from "./analytics";
import { useAnalyticsTelemetry, type TelemetrySignals } from "./analyticsTelemetry";
import { OPERATION_BLURBS, OPERATION_LABELS, applyOperation, deriveOperation } from "./shared/operations";
import { badControlWarning, describeEstimand, displayNodeName } from "./outputs/estimand";
import { EstimandFormula, NodeName } from "./outputs/EstimandFormula";
import { HighlightNames, NodeNamesProvider, SvgAxisName } from "./shared/NodeNames";
import { stratifyRiskCurves } from "./outputs/stratify";
import type { StratifiedRiskContrast } from "./outputs/stratify";
import { MethodsComparisonPanel, UnifiedAdjustmentReadout, WhatIfStrategySurvivalCurve, basicOutputPunchlineFromResult, computeCompletedOutput, observedSurvivalView } from "./outputs/modules";
import type { BasicOutputPunchline, BasicOutputPunchlineMetric, ComputedCompletedOutput } from "./outputs/modules";
import { CompletedOutputPanel } from "./outputs/CompletedOutputPanel";
import { DgpInspector } from "./outputs/DgpInspector";
import { OverlapInspector } from "./outputs/OverlapInspector";
import type { OutputContext } from "./outputs/types";
import { DenouementPanel } from "./outputs/DenouementPanel";
import { ExampleExplanation } from "./examples/ExampleExplanation";
import { ExampleMenu } from "./examples/ExampleMenu";
import { ModeToggle } from "./examples/ModeToggle";
import { PaperNetworkView } from "./papers/PaperNetworkView";
import { K562_NETWORK_STUDY } from "./papers/k562Study";
import { MODE_LABELS } from "./shared/workbench";
import type { WorkbenchMode } from "./shared/workbench";
import {
  SHARE_COMPACT_HASH_KEY,
  SHARE_DOCUMENT_HASH_KEY,
  SHARE_EXAMPLE_HASH_KEY,
  STORAGE_KEY,
  createWorkbenchSnapshot,
  encodeCompactShareDocument,
  encodeWorkbenchSnapshot,
  parseWorkbenchSnapshotText,
  snapshotFilename
} from "./shared/appState";
import type { BibliographyTopic, Selection, ToolMode } from "./shared/appState";
import { defaultScatterPair, reconcileScatterPair, scatterPairOptions } from "./shared/pairs";
import type { ScatterPair } from "./shared/pairs";
import { useWorkbenchStore } from "./store/workbenchStore";

type CanvasViewport = { cx: number; cy: number; zoom: number };
type BinaryCell = { x: 0 | 1; y: 0 | 1; weight: number; count: number; percent: number; columnPercent: number };
type BinaryContinuousGroup = { value: 0 | 1; count: number; weight: number; mean: number | null; share: number };
type BasicRelationSummary = {
  relationLabel: string;
  observed: BasicOutputPunchlineMetric;
  comparison: BasicOutputPunchlineMetric | null;
  ledgerRows?: BasicComparisonLedgerRow[];
  note: string;
};
type BasicComparisonLedgerRow = {
  id: string;
  label: string;
  sample: string;
  adjustment: string;
  method: string;
  status: "raw" | "adjusted" | "selected" | "intervention" | "dgp";
  metric: BasicOutputPunchlineMetric;
};
type BasicDemoContext = {
  interventions: string[];
  selections: string[];
};
type WeightedScatterSummary = {
  meanX: number;
  meanY: number;
  correlation: number | null;
  slope: number;
  intercept: number;
};
type BinaryOutcomeContrastSummary = { yAtX0: number | null; yAtX1: number | null; diff: number | null };
type NodeDistributionSummary = {
  domain: [number, number] | null;
  finiteSamples: number[];
  histogram18: number[];
  histogram20: number[];
};
type PairDerivedSummary = {
  points: ScatterPoint[];
  stats: WeightedScatterSummary | null;
  binaryCells: BinaryCell[];
  binaryContrast: BinaryOutcomeContrastSummary;
  binaryContinuousGroups: BinaryContinuousGroup[];
  xDomain: [number, number];
  yDomain: [number, number];
  ySampleDomain: [number, number];
};
type SimulationDerivedCache = {
  simulation: SimulationResult;
  nodes: Map<string, NodeDistributionSummary>;
  pairs: Map<string, PairDerivedSummary>;
};
type BinaryAdjustmentOutput = {
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
type BinaryContinuousAdjustmentOutput = {
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
type ResultPendingState = {
  analysis: boolean;
  simulation: boolean;
};
type StabilizedIpwOutput = {
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
type StabilizedIpwBalance = {
  node: GraphNode;
  domain: [number, number];
  rawTreatedMean: number | null;
  rawUntreatedMean: number | null;
  weightedTreatedMean: number | null;
  weightedUntreatedMean: number | null;
  rawSmd: number | null;
  weightedSmd: number | null;
};
type StabilizedIpwRow = {
  treatment: 0 | 1;
  outcome: number | null;
  covariates: number[];
  baseWeight: number;
  weight: number;
};
type BinnedAdjustmentNode = {
  node: GraphNode;
  state: SimulatedNodeState;
  domain: [number, number];
  cutpoints: number[];
  automatic?: boolean;
};
type BinaryAdjustmentStratum = {
  id: string;
  label: string;
  points: ScatterPoint[];
  cells: BinaryCell[];
  contrast: BinaryOutcomeContrastSummary;
  weight: number;
};
type BinaryContinuousAdjustmentStratum = {
  id: string;
  label: string;
  displayLabels: string[];
  points: ScatterPoint[];
  groups: BinaryContinuousGroup[];
  gap: number | null;
  weight: number;
};
type AdjustmentStratumCondition =
  | { kind: "binary"; node: GraphNode; value: 0 | 1; state: SimulatedNodeState }
  | { kind: "bin"; node: GraphNode; lower: number; upper: number; index: number; last: boolean; state: SimulatedNodeState };
type PositivityRow = { lower: number; upper: number; exposed: number; unexposed: number; total: number; warning: string | null };
type DesignModuleStatus = "usable" | "todo";
type DragState =
  | { kind: "node"; id: string; offset: Point }
  | { kind: "edge-control"; id: string }
  | { kind: "pan"; pointerId: number; lastPoint: Point; moved: boolean }
  | null;
type PointerScreenPoint = { clientX: number; clientY: number };
type EdgeGeometry = { path: string; control: Point; label: Point; start: Point; end: Point; curved: boolean };
type ShareStatus = "idle" | "copied" | "too-large" | "failed";
type FlowGraphNodeData = Record<string, unknown> & {
  node: GraphNode;
  selected: boolean;
  edgeSource: boolean;
  ancestor: boolean;
  changed: boolean;
  value?: number;
  state?: SimulatedNodeState;
  summary?: NodeDistributionSummary;
  onNodeClick: (id: string) => void;
};
type FlowGraphEdgeData = Record<string, unknown> & {
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

const BASE_VIEWBOX = { width: 1000, height: 700 };
const DEFAULT_VIEWPORT: CanvasViewport = { cx: 0, cy: 0, zoom: 1 };
const NODE_VIEW_MARGIN = { x: 100, top: 110, bottom: 130 };
const BASIC_NODE_VIEW_MARGIN = { x: 66, top: 86, bottom: 118 };
const BASIC_VIEWPORT_ZOOM_BONUS = 1.12;
const EMPIRICAL_DRAW_MIN = 80;
const EMPIRICAL_DRAW_DEFAULT = 320;
const EMPIRICAL_DRAW_MAX = 50000;
const EMPIRICAL_DRAW_STEP = 80;
const WORKER_FALLBACK_MS = 2500;
const MAX_SHARE_URL_LENGTH = 16000;
const PAPER_NETWORK_HASH = "paper=k562";
const EDGE_SOURCE_CLEARANCE = 1.5;
const EDGE_ARROW_TIP_EXTENSION_FACTOR = 1.88;
const EDGE_ARROW_NODE_OVERLAP = 1.2;
const EDGE_CROWDED_FAN_THRESHOLD = 2;
const EDGE_CROWDED_FAN_SPACING = 44;
const EDGE_CROWDED_FAN_MAX_OFFSET = 68;
const EDGE_OUTGOING_FAN_THRESHOLD = 2;
const EDGE_OUTGOING_FAN_SPACING = 24;
const EDGE_OUTGOING_FAN_MAX_OFFSET = 36;
const EDGE_ENDPOINT_PORT_SPACING = 18;
const EDGE_ENDPOINT_PORT_MAX_OFFSET = 26;
const EDGE_ENDPOINT_PORT_DISTANCE = 64;

function graphViewportSignature(graph: GraphModel): string {
  const nodes = graph.nodes.map((node) => `${node.id}:${node.label}`).join("|");
  const edges = graph.edges.map((edge) => `${edge.source}:${edge.kind}:${edge.target}`).join("|");
  return `${nodes}::${edges}`;
}

function graphAnalysisSignature(graph: GraphModel): string {
  const nodes = graph.nodes
    .map((node) => `${node.id}:${Number(node.roles.exposure)}${Number(node.roles.outcome)}${Number(node.roles.adjusted)}${Number(node.roles.selected)}${Number(node.roles.latent)}`)
    .join("|");
  const edges = graph.edges.map((edge) => `${edge.id}:${edge.source}:${edge.kind}:${edge.target}`).join("|");
  return `${graph.kind}::${nodes}::${edges}`;
}

function graphSimulationSignature(graph: GraphModel): string {
  const nodes = graph.nodes
    .map((node) => `${node.id}:${JSON.stringify(normalizeVariableModel(node.variable))}`)
    .join("|");
  const edges = graph.edges.map((edge) => `${edge.id}:${edge.source}:${edge.kind}:${edge.target}`).join("|");
  return `${graph.kind}::${nodes}::${edges}`;
}

function graphOutputSignature(graph: GraphModel): string {
  const nodes = graph.nodes
    .map((node) => `${node.id}:${node.label}:${Number(node.roles.exposure)}${Number(node.roles.outcome)}${Number(node.roles.adjusted)}${Number(node.roles.selected)}${Number(node.roles.latent)}:${JSON.stringify(normalizeVariableModel(node.variable))}`)
    .join("|");
  const edges = graph.edges.map((edge) => `${edge.id}:${edge.source}:${edge.kind}:${edge.target}`).join("|");
  return `${graph.kind}::${nodes}::${edges}`;
}

function fitViewportToGraph(graph: GraphModel, mode: WorkbenchMode = "pro"): CanvasViewport {
  if (graph.nodes.length === 0) return DEFAULT_VIEWPORT;
  const demoMode = mode === "basic";
  const margin = demoMode ? BASIC_NODE_VIEW_MARGIN : NODE_VIEW_MARGIN;
  const minX = Math.min(...graph.nodes.map((node) => node.position.x)) - margin.x;
  const maxX = Math.max(...graph.nodes.map((node) => node.position.x)) + margin.x;
  const minY = Math.min(...graph.nodes.map((node) => node.position.y)) - margin.top;
  const maxY = Math.max(...graph.nodes.map((node) => node.position.y)) + margin.bottom;
  const width = Math.max(demoMode ? 210 : 240, maxX - minX);
  const height = Math.max(demoMode ? 200 : 220, maxY - minY);
  const rawZoom = Math.min(BASE_VIEWBOX.width / width, BASE_VIEWBOX.height / height) * (demoMode ? BASIC_VIEWPORT_ZOOM_BONUS : 1);
  const zoom = clamp(rawZoom, 0.55, demoMode ? 2.1 : 1.85);
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    zoom
  };
}

const EDGE_MECHANISMS: Array<{ kind: EdgeMechanismKind; label: string; description: string }> = [
  { kind: "linear", label: "linear", description: "Straight proportional effect." },
  { kind: "absorbing", label: "absorbing event", description: "Deterministic cumulative-event edge: if the source event has happened, the target cumulative event has happened too." },
  { kind: "threshold", label: "threshold", description: "Step change after a cutoff." },
  { kind: "smooth_threshold", label: "smooth threshold", description: "Soft sigmoid transition around a cutoff." },
  { kind: "saturating", label: "saturating", description: "Effect rises and levels off." },
  { kind: "quadratic", label: "quadratic", description: "Curved parabolic response." },
  { kind: "piecewise_linear", label: "piecewise", description: "Connected straight segments." },
  { kind: "hill_emax", label: "Hill / Emax", description: "Dose-response curve with a maximum effect." },
  { kind: "log_linear", label: "log-linear", description: "Fast early change that flattens with input." },
  { kind: "power_law", label: "power law", description: "Scaled curved response with an exponent." },
  { kind: "monotone_spline", label: "monotone spline", description: "Smooth shape-constrained increasing or decreasing curve." }
];

const NODE_COMBINERS: Array<{ kind: NodeCombinerKind; label: string }> = [
  { kind: "additive", label: "additive / normal mean" },
  { kind: "bounded_logistic", label: "bounded logistic" },
  { kind: "positive_softplus", label: "positive softplus" },
  { kind: "bernoulli_logit", label: "Bernoulli logit probability" },
  { kind: "poisson_log", label: "Poisson log rate" },
  { kind: "gamma_log", label: "Gamma log mean" },
  { kind: "noisy_or", label: "noisy-OR probability" }
];

const VARIABLE_TYPES: Array<[VariableModel["valueType"], string]> = [
  ["continuous", "continuous"],
  ["binary", "binary"],
  ["categorical", "categorical"],
  ["ordinal", "ordinal"],
  ["count", "count"],
  ["positive", "positive real"],
  ["proportion", "proportion"],
  ["time_to_event", "time to event"],
  ["vector", "vector"],
  ["time_series", "time series"],
  ["text", "text"],
  ["embedding", "embedding"],
  ["distributional", "distributional"]
];

const PLANNED_CAUSAL_MODULES = [
  { id: "soft_shift", label: "Soft intervention" },
  { id: "stochastic", label: "Stochastic assignment" },
  { id: "policy", label: "Policy rule" }
] as const;

const FRONTLINE_EXAMPLE_IDS = ["tutoring-scores", "simpson-severity"] as const;

const DESIGN_MODULES: Array<{
  id: string;
  label: string;
  status: DesignModuleStatus;
  basic?: boolean;
  description: string;
}> = [
  {
    id: "adjustment",
    label: "Adjustment / backdoor",
    status: "usable",
    basic: true,
    description: "Use roles, biasing paths, and minimal adjustment sets to decide what belongs in the estimating equation."
  },
  {
    id: "target-trial",
    label: "Target trial",
    status: "todo",
    description: "TODO: specify eligibility, time zero, treatment strategies, follow-up, censoring, estimand, and analysis plan."
  },
  {
    id: "negative-controls",
    label: "Negative controls",
    status: "todo",
    description: "TODO: mark exposure/outcome controls that should have no effect and use violations as residual-bias warnings."
  },
  {
    id: "iv",
    label: "Instrumental variables",
    status: "usable",
    description: "Check relevance paths, exclusion restrictions, and unblocked backdoors from candidate instruments to outcomes."
  },
  {
    id: "did",
    label: "DiD / event study",
    status: "todo",
    description: "TODO: track policy timing, panel unit/time structure, pre-trends, staggered adoption, and placebo endpoints."
  },
  {
    id: "rd",
    label: "Regression discontinuity",
    status: "todo",
    description: "TODO: mark running variable, cutoff, manipulation risks, bandwidth choices, and continuity assumptions."
  },
  {
    id: "synthetic-control",
    label: "Synthetic control / CausalImpact",
    status: "todo",
    description: "TODO: define treated unit, donor pool, pre-period fit, unaffected control series, and placebo permutations."
  },
  {
    id: "experiment-uplift",
    label: "Experiment / uplift",
    status: "todo",
    description: "TODO: represent randomization, holdouts, geolift, guardrails, spillovers, and heterogeneous treatment effects."
  },
  {
    id: "mediation",
    label: "Mediation",
    status: "usable",
    basic: true,
    description: "Separate direct and indirect paths, then make post-treatment adjustment risks visible."
  },
  {
    id: "graph-refutation",
    label: "Graph refutation",
    status: "todo",
    description: "TODO: run conditional-independence checks implied by the graph and flag assumptions contradicted by data."
  },
  {
    id: "causal-discovery",
    label: "Discovery hypotheses",
    status: "todo",
    description: "TODO: import candidate structures from discovery tools as hypotheses, not automatic truth."
  },
  {
    id: "root-cause",
    label: "Root cause",
    status: "todo",
    description: "TODO: compare old/new mechanism behavior and attribute observed changes to upstream nodes."
  },
  {
    id: "distribution-change",
    label: "Distribution change",
    status: "todo",
    description: "TODO: attribute target distribution shifts to changed causal mechanisms, not only changed marginal correlations."
  },
  {
    id: "latent-measurement",
    label: "Latent measurement",
    status: "todo",
    description: "TODO: connect latent constructs, proxies, survey error, rounding, missingness, and attrition mechanisms."
  }
];

const ROADMAP_TODOS = [
  {
    label: "Question-first analysis plan",
    description: "TODO mode for population, unit, time zero, treatment strategies, outcome horizon, estimand, contrast, data source, and design assumptions. Keep it optional because it demands more upfront thinking than quick DAG sketching."
  },
  {
    label: "Data-aware DAG",
    description: "TODO: CSV import, column-to-node mapping, type/missingness summaries, positivity and balance checks, and graph implication tests. Synthetic datasets will plug in here later."
  },
  {
    label: "Code/export bridge",
    description: "TODO: generate R, Python, and Stata starter code for selected design modules plus a collaborator-facing report with DAG, assumptions, threats, and chosen estimand."
  }
];

const CUSTOM_DENOUEMENT: ExampleDenouement = {
  module: "Custom causal claim packet",
  punchline: "Turn the graph into a claim packet: what can be said causally, what design supports it, and what assumptions could embarrass the claim.",
  estimand: "Set an exposure and outcome, then choose whether the target is a total effect, direct effect, IV estimand, mediation contrast, policy effect, or descriptive mechanism claim.",
  primaryOutput: "A concise conclusion backed by an adjustment or design verdict, visible causal and biasing paths, diagnostics, and unresolved threats.",
  validity: "Credible only after the graph declares time order, treatment/exposure status, outcome, adjustment choices, sample-selection nodes, latent nodes, and post-treatment variables.",
  nextAction: "Pick a catalog example closest to the current problem or mark exposure/outcome roles and use the identification panel to start the packet.",
  sections: [
    {
      title: "Claim packet",
      defaultOpen: true,
      items: [
        "Name the causal contrast before interpreting associations.",
        "State the unit, population, exposure or treatment, outcome, time horizon, and contrast scale.",
        "Separate the graph-supported claim from unresolved threats.",
        "Write the final sentence as a claim with a validity qualifier, not as a dashboard observation."
      ]
    },
    {
      title: "Checklist",
      defaultOpen: true,
      items: [
        "Mark exposure and outcome roles.",
        "Mark adjusted, sample-selection, and unobserved nodes.",
        "Inspect causal and biasing paths.",
        "Choose the identification mode in Advanced diagnostics.",
        "Document any TODO design module that is relevant but not implemented yet."
      ]
    },
    {
      title: "Threats",
      items: [
        "Post-treatment adjustment can change the estimand or introduce bias.",
        "Sample-selection nodes can make the analysis population differ from the target population.",
        "Latent variables mean the DAG is an assumption statement, not a complete control strategy.",
        "Poor overlap, interference, and measurement error usually require specialized modules."
      ]
    }
  ]
};

const BIBLIOGRAPHY: Array<{
  topic: BibliographyTopic;
  label: string;
  citation: string;
  url: string;
}> = [
  {
    topic: "sem",
    label: "Linear non-Gaussian SEM",
    citation: "Shimizu et al. (2006), A Linear Non-Gaussian Acyclic Model for Causal Discovery",
    url: "https://www.jmlr.org/beta/papers/v7/shimizu06a.html"
  },
  {
    topic: "sem",
    label: "Additive noise SEM",
    citation: "Peters et al. (2014), Causal Discovery with Continuous Additive Noise Models",
    url: "https://jmlr.csail.mit.edu/beta/papers/v15/peters14a.html"
  },
  {
    topic: "nonlinear",
    label: "Post-nonlinear SEM",
    citation: "Zhang and Hyvarinen (2012), On the Identifiability of the Post-Nonlinear Causal Model",
    url: "https://arxiv.org/abs/1205.2599"
  },
  {
    topic: "nonlinear",
    label: "Monotone cubic interpolation",
    citation: "Fritsch and Carlson (1980), Monotone Piecewise Cubic Interpolation",
    url: "https://epubs.siam.org/doi/10.1137/0717021"
  },
  {
    topic: "nonlinear",
    label: "Hill / Emax dose response",
    citation: "PK/PD reviews describe sigmoid Emax models based on the Hill equation",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7050630/"
  },
  {
    topic: "probability",
    label: "Generalized SEM",
    citation: "Generalized semiparametric SEMs use link functions and distributions for different data types",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5129644/"
  },
  {
    topic: "probability",
    label: "Noisy-OR",
    citation: "A Generalization of the Noisy-Or Model",
    url: "https://arxiv.org/abs/1303.1479"
  },
  {
    topic: "deep",
    label: "Causal generative neural networks",
    citation: "Goudet et al. (2017), Causal Generative Neural Networks",
    url: "https://arxiv.org/abs/1711.08936"
  },
  {
    topic: "deep",
    label: "Flow-based causal inference",
    citation: "Geffner et al. (2022), Deep End-to-end Causal Inference",
    url: "https://arxiv.org/abs/2202.02195"
  }
];

const BIBLIOGRAPHY_TOPICS: Array<{ id: BibliographyTopic; label: string }> = [
  { id: "sem", label: "SEM foundations" },
  { id: "nonlinear", label: "Nonlinear functions" },
  { id: "probability", label: "Probabilistic nodes" },
  { id: "deep", label: "Neural mechanisms" }
];

export function App() {
  const document = useWorkbenchStore((state) => state.document);
  const history = useWorkbenchStore((state) => state.history);
  const future = useWorkbenchStore((state) => state.future);
  const selection = useWorkbenchStore((state) => state.selection);
  const tool = useWorkbenchStore((state) => state.tool);
  const edgeSource = useWorkbenchStore((state) => state.edgeSource);
  const viewMode = useWorkbenchStore((state) => state.viewMode);
  const effectKind = useWorkbenchStore((state) => state.effectKind);
  const bibliographyTopic = useWorkbenchStore((state) => state.bibliographyTopic);
  const showCausal = useWorkbenchStore((state) => state.showCausal);
  const showBiasing = useWorkbenchStore((state) => state.showBiasing);
  const showAncestors = useWorkbenchStore((state) => state.showAncestors);
  const workbenchMode = useWorkbenchStore((state) => state.workbenchMode);
  const basicResultsOpen = useWorkbenchStore((state) => state.basicResultsOpen);
  const activeExampleId = useWorkbenchStore((state) => state.activeExampleId);
  const modelText = useWorkbenchStore((state) => state.modelText);
  const modelDirty = useWorkbenchStore((state) => state.modelDirty);
  const scatterPair = useWorkbenchStore((state) => state.scatterPair);
  const commit = useWorkbenchStore((state) => state.commit);
  const undo = useWorkbenchStore((state) => state.undo);
  const redo = useWorkbenchStore((state) => state.redo);
  const replaceGraph = useWorkbenchStore((state) => state.replaceGraph);
  const setSelection = useWorkbenchStore((state) => state.setSelection);
  const setTool = useWorkbenchStore((state) => state.setTool);
  const setEdgeSource = useWorkbenchStore((state) => state.setEdgeSource);
  const setViewMode = useWorkbenchStore((state) => state.setViewMode);
  const setEffectKind = useWorkbenchStore((state) => state.setEffectKind);
  const setBibliographyTopic = useWorkbenchStore((state) => state.setBibliographyTopic);
  const setShowCausal = useWorkbenchStore((state) => state.setShowCausal);
  const setShowBiasing = useWorkbenchStore((state) => state.setShowBiasing);
  const setShowAncestors = useWorkbenchStore((state) => state.setShowAncestors);
  const setWorkbenchMode = useWorkbenchStore((state) => state.setWorkbenchMode);
  const setBasicResultsOpen = useWorkbenchStore((state) => state.setBasicResultsOpen);
  const setActiveExampleId = useWorkbenchStore((state) => state.setActiveExampleId);
  const setModelText = useWorkbenchStore((state) => state.setModelText);
  const setModelDirty = useWorkbenchStore((state) => state.setModelDirty);
  const setScatterPair = useWorkbenchStore((state) => state.setScatterPair);
  const [simulation, setSimulation] = useState<SimulationResult>(() => runSimulation(document.graph, document.simulation));

  const [analysis, setAnalysis] = useState<AnalysisReport>(() => analyzeGraph(document.graph));
  const snapshotInputRef = useRef<HTMLInputElement | null>(null);
  const [compactShareStatus, setCompactShareStatus] = useState<ShareStatus>("idle");
  const [fullShareStatus, setFullShareStatus] = useState<ShareStatus>("idle");
  const [paperNetworkOpen, setPaperNetworkOpen] = useState(() => hashMatchesPaperNetwork(window.location.hash));
  const [showExplanation, setShowExplanation] = useState(false);
  const [showDgp, setShowDgp] = useState(false);
  const [showOverlap, setShowOverlap] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const visibleGraph = useMemo(() => transformView(document.graph, viewMode), [document.graph, viewMode]);
  const analysisSignature = graphAnalysisSignature(document.graph);
  const analysisGraph = useMemo(() => document.graph, [analysisSignature]);
  const [analysisResultSignature, setAnalysisResultSignature] = useState(() => analysisSignature);
  const simulationGraphSignature = graphSimulationSignature(document.graph);
  const simulationGraph = useMemo(() => document.graph, [simulationGraphSignature]);
  const simulationSignature = useMemo(() => `${simulationGraphSignature}::${JSON.stringify(document.simulation)}`, [document.simulation, simulationGraphSignature]);
  const [simulationResultSignature, setSimulationResultSignature] = useState(() => simulationSignature);
  const outputSignature = graphOutputSignature(document.graph);
  const outputGraph = useMemo(() => document.graph, [outputSignature]);
  const outputSimulation = useMemo(() => document.simulation, [simulationSignature]);
  const analysisPending = analysisResultSignature !== analysisSignature;
  const simulationPending = simulationResultSignature !== simulationSignature;
  const resultsPending: ResultPendingState = { analysis: analysisPending, simulation: simulationPending };
  const pairwisePending: ResultPendingState = { analysis: false, simulation: simulationPending };
  const computationDocument = useMemo<GraphDocument>(() => ({
    ...document,
    graph: outputGraph,
    simulation: outputSimulation
  }), [document.id, document.metadata, document.schemaVersion, outputGraph, outputSimulation]);
  // How flexibly continuous confounders enter the parametric estimators (outcome
  // regression, AIPW). Drives the basis selector on the methods panel.
  const [covariateBasis, setCovariateBasis] = useState<CovariateBasis>("linear");
  const outputContext = useMemo<OutputContext>(() => ({
    analysis,
    document: computationDocument,
    simulation,
    covariateBasis
  }), [analysis, computationDocument, simulation, covariateBasis]);
  const simulationDerived = useMemo(() => buildSimulationDerivedCache(simulation), [simulation]);
  const selectedNode = selection?.kind === "node" ? findNode(document.graph, selection.id) : undefined;
  const selectedEdge = selection?.kind === "edge" ? findEdge(document.graph, selection.id) : undefined;
  const activeExample = EXAMPLES.find((example) => example.id === activeExampleId) ?? null;
  const activeDenouement = activeExample ? exampleDenouement(activeExample.id) : null;
  const isBasicMode = workbenchMode === "basic";
  const presentationActive = presentationMode && !paperNetworkOpen && !isBasicMode;
  const compactWorkspace = useMediaQuery("(max-width: 1120px)");
  const empiricalDraws = graphEmpiricalDraws(document.graph);
  // Keyed on analysisGraph (position-stable) not document.graph: edge highlighting is structural,
  // so a node drag should not re-run the path analysis.
  const highlightedEdges = useMemo(() => computeHighlightedEdges(analysisGraph, analysis, showCausal, showBiasing), [analysis, analysisGraph, showBiasing, showCausal]);
  const ancestorIds = useMemo(() => showAncestors ? new Set(analysis.causalPaths.flat()) : new Set<string>(), [analysis.causalPaths, showAncestors]);
  const completedOutput = useMemo(() => computeCompletedOutput(outputContext, activeExample?.outputModule ?? null), [activeExample?.outputModule, outputContext]);
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

  useEffect(() => startEngagementMilestones(), []);
  const adjustedFrameTitle = completedOutputActive ? "Adjusted estimate"
    : frameOperation === "adjust" ? "Adjusted (standardized) output"
      : frameOperation === "condition" ? "Conditioned (stratified) output"
        : frameOperation === "select" ? "Selected-sample output"
          : "Structural diagnosis";
  const adjustedFrameDetail = completedOutputActive ? "What the methods estimate after adjusting for the confounders"
    : frameOperation === "adjust" ? "Stratify on every level of the adjustment set, then standardize to the population"
      : frameOperation === "condition" ? "Each stratum shown separately — not combined or standardized"
        : frameOperation === "select" ? "Restricted to the selected sub-population; the complement is unobserved"
          : "Derived from the DAG structure — set an operation on a variable to refine the estimand";
  const demoBinaryAdjustmentOutput = useMemo(() => computeBinaryAdjustmentOutput(outputContext, simulationDerived, defaultOutputPair), [defaultOutputPair, outputContext, simulationDerived]);
  const basicRelationSummary = useMemo(
    () => computeBasicRelationSummary({ ...outputContext, moduleId: activeExample?.outputModule ?? null }, completedOutput, simulationDerived, demoBinaryAdjustmentOutput, { hideOracle: isBasicMode }),
    [activeExample?.outputModule, completedOutput, demoBinaryAdjustmentOutput, isBasicMode, outputContext, simulationDerived]
  );
  const basicDemoContext = useMemo<BasicDemoContext>(() => ({
    interventions: formatActiveInterventions(document),
    selections: simulation.conditioning.activeConditions
  }), [document.graph, document.simulation.overrides, simulation.conditioning.activeConditions]);
  const showAdjustedOutputColumn = shouldShowAdjustedOutputColumn(computationDocument, simulation, activeExample?.outputModule ?? null, activeOutputPair);

  // Classic examples (no what-if module) get the SAME canonical g-method panel as the
  // longitudinal ones, derived from the current adjust/condition operations + the pair —
  // so the same operation renders the same output everywhere (Pro and Demo alike).
  const computeUnifiedAdjustment = useCallback((pair: ScatterPair) => {
    if (activeExample?.outputModule?.startsWith("what-if-")) return null;
    const spec = deriveAdjustmentSpec(computationDocument, { exposure: pair.x, outcome: pair.y });
    if (!spec || spec.covariates.length === 0) return null;
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
  // Overlap/positivity diagnostic, computed once per (signature-stable) computationDocument — so it
  // does NOT re-run on node drags — and shared by the toolbar badge and the overlap modal.
  const overlapDiagnostic = useMemo(() => {
    const spec = deriveAdjustmentSpec(computationDocument);
    return spec ? adjustmentOverlap(computationDocument, spec) : null;
  }, [computationDocument]);
  const positivity = overlapDiagnostic ? positivityStatus(overlapDiagnostic) : "ok";
  const basicRecommendedAdjustmentId = basicDemoRecommendedAdjustmentId(activeExample?.outputModule ?? null, document.graph);

  // Granular, privacy-preserving telemetry (see analyticsTelemetry). Every field is
  // a categorical signal derived from the analysis report / simulation summary —
  // never a node label or free-form value — so it stays banner-free.
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

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    let worker: Worker | null = null;
    const requestSignature = analysisSignature;
    const complete = (nextAnalysis: AnalysisReport) => {
      if (cancelled || settled) return;
      settled = true;
      window.clearTimeout(fallbackTimer);
      worker?.terminate();
      setAnalysis(nextAnalysis);
      setAnalysisResultSignature(requestSignature);
    };
    const completeFallback = () => {
      if (cancelled || settled) return;
      try {
        complete(analyzeGraph(analysisGraph));
      } catch (error) {
        console.error("analysis worker fallback failed", error);
        if (!cancelled && !settled) {
          settled = true;
          window.clearTimeout(fallbackTimer);
          worker?.terminate();
          setAnalysisResultSignature(requestSignature);
        }
      }
    };
    const fallbackTimer = window.setTimeout(completeFallback, WORKER_FALLBACK_MS);
    try {
      worker = new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<AnalysisReport>) => complete(event.data);
      worker.onerror = (event) => {
        event.preventDefault();
        completeFallback();
      };
      worker.onmessageerror = completeFallback;
      worker.postMessage(analysisGraph);
    } catch (error) {
      console.error("analysis worker start failed", error);
      completeFallback();
    }
    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      worker?.terminate();
    };
  }, [analysisGraph, analysisSignature]);

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    let worker: Worker | null = null;
    const requestSignature = simulationSignature;
    const complete = (nextSimulation: SimulationResult) => {
      if (cancelled || settled) return;
      settled = true;
      window.clearTimeout(fallbackTimer);
      worker?.terminate();
      setSimulation(nextSimulation);
      setSimulationResultSignature(requestSignature);
    };
    const completeFallback = () => {
      if (cancelled || settled) return;
      try {
        complete(runSimulation(simulationGraph, outputSimulation));
      } catch (error) {
        console.error("simulation worker fallback failed", error);
        if (!cancelled && !settled) {
          settled = true;
          window.clearTimeout(fallbackTimer);
          worker?.terminate();
          setSimulationResultSignature(requestSignature);
        }
      }
    };
    const fallbackTimer = window.setTimeout(completeFallback, WORKER_FALLBACK_MS);
    try {
      worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<SimulationResult>) => complete(event.data);
      worker.onerror = (event) => {
        event.preventDefault();
        completeFallback();
      };
      worker.onmessageerror = completeFallback;
      worker.postMessage({ graph: simulationGraph, spec: outputSimulation });
    } catch (error) {
      console.error("simulation worker start failed", error);
      completeFallback();
    }
    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      worker?.terminate();
    };
    // Keyed on outputSimulation (the signature-stable snapshot), NOT raw document.simulation:
    // a position-only move clones document.simulation (new identity, identical content), which
    // would otherwise re-run this effect — re-simulating on every node drag for nothing.
  }, [outputSimulation, simulationGraph, simulationSignature]);

  useEffect(() => {
    setScatterPair((pair) => reconcileScatterPair(document.graph, pair));
  }, [document.graph, setScatterPair]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
  }, [document]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (paperNetworkOpen) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if (event.key === "Escape") {
        setSelection(null);
      } else if (event.key === "Delete" || event.key.toLowerCase() === "d") {
        event.preventDefault();
        deleteSelection();
      } else if (selection?.kind === "node") {
        const roleMap: Record<string, keyof NodeRoleFlags> = { e: "exposure", o: "outcome", a: "adjusted", s: "selected", u: "latent" };
        const role = roleMap[event.key.toLowerCase()];
        if (role) {
          event.preventDefault();
          toggleRole(selection.id, role);
        }
        if (event.key.toLowerCase() === "r") {
          event.preventDefault();
          renameSelectedNode();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const deleteNodeById = useCallback((nodeId: string) => {
    const graph = deleteNode(document.graph, nodeId);
    setSelection(null);
    replaceGraph(graph);
  }, [document.graph, replaceGraph]);

  const deleteEdgeById = useCallback((edgeId: string) => {
    setSelection(null);
    replaceGraph(deleteEdge(document.graph, edgeId));
  }, [document.graph, replaceGraph]);

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    if (selection.kind === "node") {
      deleteNodeById(selection.id);
      return;
    }
    deleteEdgeById(selection.id);
  }, [deleteEdgeById, deleteNodeById, selection]);

  const toggleRole = useCallback((nodeId: string, role: keyof NodeRoleFlags) => {
    const node = findNode(document.graph, nodeId);
    if (!node) return;
    replaceGraph(setNodeRole(document.graph, nodeId, role, !node.roles[role]));
  }, [document.graph, replaceGraph]);

  const renameNodeById = useCallback((nodeId: string) => {
    const nextId = window.prompt("Rename variable", nodeId);
    if (!nextId) return;
    const graph = renameNode(document.graph, nodeId, nextId);
    const renamed = graph.nodes.find((node) => node.label === nextId || node.id === nextId);
    setSelection((current) => current?.kind === "node" && current.id === nodeId ? (renamed ? { kind: "node", id: renamed.id } : null) : current);
    replaceGraph(graph);
  }, [document.graph, replaceGraph]);

  const renameSelectedNode = useCallback(() => {
    if (selection?.kind !== "node") return;
    renameNodeById(selection.id);
  }, [renameNodeById, selection]);

  const addNodeAt = useCallback((point: Point) => {
    const id = createNewNodeId(document.graph);
    const graph = addNode(document.graph, createNode(id, point));
    trackAnalyticsEvent("graph_action", { action: "add_node" });
    setSelection({ kind: "node", id });
    replaceGraph(graph);
  }, [document.graph, replaceGraph]);

  const selectNode = useCallback((id: string) => {
    setSelection({ kind: "node", id });
  }, []);

  const selectEdge = useCallback((id: string) => {
    setSelection({ kind: "edge", id });
  }, []);

  const createOrSelectEdge = useCallback((target: string) => {
    if (!edgeSource) {
      setEdgeSource(target);
      return;
    }
    if (edgeSource === target) {
      setEdgeSource(null);
      return;
    }
    const id = edgeId(edgeSource, target, "directed");
    const graph = addEdge(document.graph, edgeSource, target, "directed");
    trackAnalyticsEvent("graph_action", { action: "add_edge" });
    selectEdge(id);
    setEdgeSource(null);
    replaceGraph(graph);
  }, [document.graph, edgeSource, replaceGraph, selectEdge]);

  const updateModelFromText = useCallback(() => {
    const parsed = parseModel(modelText, document.title);
    commit({
      ...parsed.document,
      id: document.id,
      title: document.title,
      simulation: reconcileSimulationSpec(parsed.document.graph, document.simulation)
    });
  }, [commit, document.id, document.simulation, document.title, modelText]);

  const loadExample = useCallback((id: string) => {
    const document = exampleDocument(id);
    if (!document) return;
    const example = EXAMPLES.find((candidate) => candidate.id === id);
    trackAnalyticsEvent("example_loaded", {
      example_id: id,
      domain: example?.domain,
      mode: workbenchMode
    });
    setPaperNetworkOpen(false);
    commit(document);
    setActiveExampleId(id);
    setSelection(null);
  }, [commit, setActiveExampleId, setSelection, workbenchMode]);

  const loadSnapshotState = useCallback((nextDocument: GraphDocument, nextExampleId: string | null) => {
    commit({
      ...nextDocument,
      simulation: reconcileSimulationSpec(nextDocument.graph, nextDocument.simulation)
    });
    setActiveExampleId(nextExampleId);
    setSelection(null);
    setTool("select");
    setEdgeSource(null);
    setCompactShareStatus("idle");
    setFullShareStatus("idle");
    setPaperNetworkOpen(false);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }, [commit, setActiveExampleId, setEdgeSource, setSelection, setTool]);

  const openSnapshotFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const loaded = parseWorkbenchSnapshotText(await file.text());
    if (!loaded) {
      window.alert("This is not a valid Nudagitty snapshot.");
      return;
    }
    loadSnapshotState(loaded.document, loaded.activeExampleId);
  }, [loadSnapshotState]);

  const downloadSnapshot = useCallback(() => {
    const snapshot = createWorkbenchSnapshot(document, activeExampleId);
    downloadText(snapshotFilename(document), JSON.stringify(snapshot, null, 2), "application/json");
  }, [activeExampleId, document]);

  const copyCompactShareLink = useCallback(async () => {
    const url = compactShareUrlForDocument(document, activeExampleId);
    trackAnalyticsEvent("share_clicked", { kind: "compact" });
    if (url.length > MAX_SHARE_URL_LENGTH) {
      setCompactShareStatus("too-large");
      return;
    }
    try {
      await copyTextToClipboard(url);
      window.history.replaceState(null, "", new URL(url).hash);
      setCompactShareStatus("copied");
    } catch {
      setCompactShareStatus("failed");
    }
  }, [activeExampleId, document]);

  const copyFullShareLink = useCallback(async () => {
    const url = fullShareUrlForDocument(document, activeExampleId);
    trackAnalyticsEvent("share_clicked", { kind: "full" });
    if (url.length > MAX_SHARE_URL_LENGTH) {
      setFullShareStatus("too-large");
      return;
    }
    try {
      await copyTextToClipboard(url);
      window.history.replaceState(null, "", new URL(url).hash);
      setFullShareStatus("copied");
    } catch {
      setFullShareStatus("failed");
    }
  }, [activeExampleId, document]);

  const closePaperNetwork = useCallback(() => {
    setPaperNetworkOpen(false);
    if (hashMatchesPaperNetwork(window.location.hash)) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  // Deep-link: react to #example=<id> changes while the app is already open. loadInitialWorkbenchState
  // only reads the hash once at startup, so before this, navigating to a new #example=… (same tab,
  // a shared link, back/forward) did nothing. loadExample no-ops on unknown ids.
  useEffect(() => {
    const applyHash = () => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const id = params.get(SHARE_EXAMPLE_HASH_KEY);
      if (id && id !== activeExampleId) loadExample(id);
    };
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [activeExampleId, loadExample]);

  useEffect(() => {
    if (compactShareStatus === "idle") return undefined;
    const timer = window.setTimeout(() => setCompactShareStatus("idle"), 2200);
    return () => window.clearTimeout(timer);
  }, [compactShareStatus]);

  useEffect(() => {
    if (fullShareStatus === "idle") return undefined;
    const timer = window.setTimeout(() => setFullShareStatus("idle"), 2200);
    return () => window.clearTimeout(timer);
  }, [fullShareStatus]);

  const updateNodeMechanism = useCallback((nodeId: string, patch: Partial<NodeMechanism>) => {
    trackEditCommitted("node");
    const current = normalizeNodeMechanism(document.simulation.nodes[nodeId]);
    const nextMechanism = normalizeNodeMechanism({ ...current, ...patch });
    const currentNode = findNode(document.graph, nodeId);
    const isRoot = document.graph.edges.every((edge) => edge.kind !== "directed" || edge.target !== nodeId);
    const graph = currentNode && ("distribution" in patch || "noise" in patch || "combiner" in patch)
      ? updateNode(document.graph, nodeId, {
        variable: normalizeVariableModel({
          ...normalizeVariableModel(currentNode.variable),
          valueType: inferValueTypeFromMechanism(isRoot, nextMechanism, normalizeVariableModel(currentNode.variable).valueType)
        })
      })
      : document.graph;
    const overrides = { ...document.simulation.overrides };
    const nextVariable = normalizeVariableModel(findNode(graph, nodeId)?.variable);
    if (nextVariable.valueType === "binary" && Object.hasOwn(overrides, nodeId)) overrides[nodeId] = coerceBinary(overrides[nodeId] ?? 0);
    commit({
      ...withGraph(document, graph),
      simulation: {
        ...document.simulation,
        nodes: {
          ...document.simulation.nodes,
          [nodeId]: nextMechanism
        },
        overrides
      }
    });
  }, [commit, document]);

  const updateVariableModel = useCallback((nodeId: string, variable: VariableModel) => {
    trackEditCommitted("node");
    const currentNode = findNode(document.graph, nodeId);
    const previous = normalizeVariableModel(currentNode?.variable);
    const nextVariable = normalizeVariableModel(variable);
    const graph = updateNode(document.graph, nodeId, { variable: nextVariable });
    const nextDocument = withGraph(document, graph);
    const currentMechanism = normalizeNodeMechanism(nextDocument.simulation.nodes[nodeId]);
    const becameBinary = previous.valueType !== "binary" && nextVariable.valueType === "binary";
    const becameDistributional = previous.valueType !== "distributional" && nextVariable.valueType === "distributional";
    if (!becameBinary && !becameDistributional) {
      commit(nextDocument);
      return;
    }
    const isRoot = graph.edges.every((edge) => edge.kind !== "directed" || edge.target !== nodeId);
    const nextMechanism = becameBinary && isRoot
      ? { ...currentMechanism, distribution: defaultNodeDistribution("bernoulli") }
      : becameBinary
        ? { ...currentMechanism, combiner: "bernoulli_logit" as const }
        : isRoot && currentMechanism.distribution.kind === "constant"
          ? { ...currentMechanism, distribution: defaultNodeDistribution("normal") }
          : currentMechanism;
    const overrides = { ...nextDocument.simulation.overrides };
    if (becameBinary && Object.hasOwn(overrides, nodeId)) overrides[nodeId] = coerceBinary(overrides[nodeId] ?? 0);
    commit({
      ...nextDocument,
      simulation: {
        ...nextDocument.simulation,
        nodes: {
          ...nextDocument.simulation.nodes,
          [nodeId]: nextMechanism
        },
        overrides
      }
    });
  }, [commit, document]);

  const updateEdgeMechanism = useCallback((edge: GraphEdge, patch: Partial<EdgeMechanism>) => {
    trackEditCommitted("edge");
    const current = normalizeEdgeMechanism(document.simulation.edges[edge.id]);
    commit({
      ...document,
      simulation: {
        ...document.simulation,
        edges: {
          ...document.simulation.edges,
          [edge.id]: normalizeEdgeMechanism({ ...current, ...patch })
        }
      }
    });
  }, [commit, document]);

  const updateEdgeCoefficient = useCallback((edge: GraphEdge, coefficient: number) => {
    updateEdgeMechanism(edge, { coefficient, beta1: coefficient, scale: coefficient });
  }, [updateEdgeMechanism]);

  const updateEdgeEnabled = useCallback((edge: GraphEdge, enabled: boolean) => {
    updateEdgeMechanism(edge, { enabled });
  }, [updateEdgeMechanism]);

  const setOverride = useCallback((nodeId: string, value: number | null) => {
    const overrides = { ...document.simulation.overrides };
    if (value === null) delete overrides[nodeId];
    else {
      const variable = normalizeVariableModel(findNode(document.graph, nodeId)?.variable);
      overrides[nodeId] = variable.valueType === "binary" ? coerceBinary(value) : value;
    }
    commit({ ...document, simulation: { ...document.simulation, overrides } });
  }, [commit, document]);

  const resample = useCallback(() => {
    trackAnalyticsEvent("graph_action", { action: "resample" });
    commit({ ...document, simulation: { ...document.simulation, seed: document.simulation.seed + 1 } });
  }, [commit, document]);

  const clearOverrides = useCallback(() => {
    commit({ ...document, simulation: { ...document.simulation, overrides: {} } });
  }, [commit, document]);

  const clearSelections = useCallback(() => {
    commit({ ...document, simulation: { ...document.simulation, selections: {} } });
  }, [commit, document]);

  const updateEmpiricalDraws = useCallback((sampleSize: number) => {
    const nextSampleSize = clampDrawCount(sampleSize);
    commit({
      ...document,
      graph: {
        ...document.graph,
        nodes: document.graph.nodes.map((node) => {
          const variable = normalizeVariableModel(node.variable);
          return {
            ...node,
            variable: {
              ...variable,
              simulation: {
                ...variable.simulation,
                sampleSize: nextSampleSize
              }
            }
          };
        })
      }
    });
  }, [commit, document]);

  const setSelectionCondition = useCallback((nodeId: string, condition: SimulationSelectionCondition | null) => {
    const selections = { ...(document.simulation.selections ?? {}) };
    if (condition === null) delete selections[nodeId];
    else selections[nodeId] = condition;
    commit({ ...document, simulation: { ...document.simulation, selections } });
  }, [commit, document]);

  const setOperation = useCallback((nodeId: string, operation: AnalysisOperation) => {
    trackAnalyticsEvent("graph_action", { action: "set_operation", operation });
    // Pair the operation with the node's structural classification so the funnel can
    // tell "adjust a confounder" (valid) from "adjust a collider" (the teachable bug).
    const classification = operation === "none" || operation === "intervene"
      ? "na"
      : analysis.exposures.length > 0 && analysis.outcomes.length > 0
        ? classifyConditioned(document.graph, nodeId).classification
        : "na";
    trackOperationSet(operation, classification);
    commit(applyOperation(document, nodeId, operation));
  }, [analysis, commit, document]);

  const changeWorkbenchMode = useCallback((mode: WorkbenchMode) => {
    trackAnalyticsEvent("mode_changed", { mode });
    setWorkbenchMode(mode);
  }, [setWorkbenchMode]);

  const createNewDocument = useCallback(() => {
    trackAnalyticsEvent("graph_action", { action: "new_graph" });
    closePaperNetwork();
    commit(emptyDocument());
    setActiveExampleId(null);
    setSelection(null);
  }, [closePaperNetwork, commit, setActiveExampleId, setSelection]);

  const exportGraphSvg = useCallback(() => {
    trackAnalyticsEvent("export_clicked", { format: "svg" });
    exportSvg();
  }, []);

  const exportGraphBitmap = useCallback((format: "png" | "jpeg") => {
    trackAnalyticsEvent("export_clicked", { format });
    exportBitmap(format);
  }, []);

  const renderWorkspaceHandle = (key: string, vertical = compactWorkspace) => (
    <PanelResizeHandle key={key} className={vertical ? "workspace-resize-handle vertical" : "workspace-resize-handle"} />
  );

  const renderEditorPane = (order: number) => (
    <Panel id="editor" defaultSize={compactWorkspace ? 30 : isBasicMode ? 22 : 28} minSize={compactWorkspace ? 22 : 18} className="workspace-panel editor-pane" key="editor">
      <aside className="side-panel module-pane editor-column" aria-label="Editor">
        <ModuleFrame
          tone="edit"
          label="Edit"
          title={selectedNode ? "Node editor" : selectedEdge ? "Connection editor" : "DAG editor"}
          detail={selectedNode ? nodeDisplayName(selectedNode) : selectedEdge ? `${displayNodeName(selectedEdge.source)} → ${displayNodeName(selectedEdge.target)}` : "Select a node or arrow"}
        >
          {isBasicMode && !basicResultsOpen && (
            <button type="button" className="demo-show-result-button" onClick={() => setBasicResultsOpen(true)}>
              Show result
            </button>
          )}
          <SelectionEditor
            mode={workbenchMode}
            node={selectedNode}
            edge={selectedEdge}
            simulation={simulation}
            derived={simulationDerived}
            document={document}
            outputPair={isBasicMode ? defaultOutputPair : activeOutputPair}
            onToggleRole={toggleRole}
            onRename={renameNodeById}
            onDeleteNode={deleteNodeById}
            onNodeMechanism={updateNodeMechanism}
            onVariableChange={updateVariableModel}
            onOverride={setOverride}
            onSelectionCondition={setSelectionCondition}
            onSetOperation={setOperation}
            onCoefficient={updateEdgeCoefficient}
            onEdgeEnabled={updateEdgeEnabled}
            onEdgeMechanism={updateEdgeMechanism}
            onDeleteEdge={deleteEdgeById}
          />
        </ModuleFrame>
      </aside>
    </Panel>
  );

  const renderCanvasPane = (order: number) => (
    <Panel id="canvas" defaultSize={compactWorkspace ? 42 : isBasicMode ? (basicResultsOpen ? 48 : 78) : presentationActive ? 58 : 44} minSize={compactWorkspace ? 32 : 32} className="workspace-panel canvas-panel" key="canvas">
      <FlowGraphCanvas
        mode={workbenchMode}
        graph={visibleGraph}
        sourceGraph={document.graph}
        selection={selection}
        tool={tool}
        edgeSource={edgeSource}
        analysis={analysis}
        simulation={simulation}
        derived={simulationDerived}
        edgeMechanisms={document.simulation.edges}
        disabledEdgeIds={new Set(Object.entries(document.simulation.edges).filter(([, mechanism]) => !mechanism.enabled).map(([id]) => id))}
        highlightedEdges={highlightedEdges}
        ancestorIds={ancestorIds}
        pending={resultsPending}
        onSelect={setSelection}
        onAddNode={addNodeAt}
        onMoveNode={(id, position) => replaceGraph(updateNode(document.graph, id, { position }))}
        onNodeClick={(id) => tool === "edge" ? createOrSelectEdge(id) : selectNode(id)}
        onEdgeClick={selectEdge}
        onEdgeControl={(edge) => replaceGraph(upsertEdge(document.graph, edge))}
        onResample={resample}
      />
    </Panel>
  );

  const renderDemoResultsPane = (order: number) => (
    <Panel id="demo-results" defaultSize={compactWorkspace ? 28 : 30} minSize={compactWorkspace ? 24 : 22} className="workspace-panel results-pane" key="demo-results">
      <aside className="side-panel module-pane basic-results-column" aria-label="Results">
        <ModuleFrame
          tone="output"
          label="Output"
          title="Result"
          detail="Observed association and adjusted estimate"
          pending={resultPendingActive(resultsPending)}
          action={<button type="button" aria-label="Close results" onClick={() => setBasicResultsOpen(false)}><X size={16} /></button>}
        >
          <DemoResultPanel
            graph={document.graph}
            simulation={simulation}
            derived={simulationDerived}
            pair={defaultOutputPair}
            summary={basicRelationSummary}
            context={basicDemoContext}
            pending={resultsPending}
            moduleId={activeExample?.outputModule ?? null}
            computedOutput={completedOutput}
            binaryOutput={demoBinaryAdjustmentOutput}
            unified={demoUnifiedAdjustment}
            recommendedAdjustmentId={basicRecommendedAdjustmentId}
            onPair={setScatterPair}
            onSelectNode={selectNode}
            onAdjustRecommended={(id) => {
              if (!nodeAdjusted(document.graph, id)) toggleRole(id, "adjusted");
              selectNode(id);
            }}
            onClearOverrides={clearOverrides}
            onClearSelections={clearSelections}
          />
        </ModuleFrame>
      </aside>
    </Panel>
  );

  const renderProOutputsPane = (order: number) => (
    <Panel id="outputs" defaultSize={compactWorkspace ? 28 : presentationActive ? 42 : 28} minSize={compactWorkspace ? 24 : 22} className="workspace-panel outputs-panel" key="outputs">
      <PanelGroup orientation="vertical" className="workspace-output-panel-group">
        {showAdjustedOutputColumn && (
          <>
            <Panel id="adjusted" defaultSize={64} minSize={30} className="workspace-panel">
              <aside className="side-panel module-pane adjusted-output-column">
                <ModuleFrame
                  tone="output"
                  label={completedOutputActive ? "Output"
                    : frameOperation === "adjust" ? "Adjusted output"
                      : frameOperation === "condition" ? "Conditioned output"
                        : frameOperation === "select" ? "Selected output"
                          : "Diagnosis"}
                  title={adjustedFrameTitle}
                  detail={adjustedFrameDetail}
                  pending={resultPendingActive(resultsPending)}
                >
                  <AdjustedOutputPanel
                    moduleId={activeExample?.outputModule ?? null}
                    exampleId={activeExample?.id ?? null}
                    computedOutput={completedOutput}
                    binaryOutput={binaryAdjustmentOutput}
                    continuousOutput={binaryContinuousAdjustmentOutput}
                    unified={unifiedAdjustment}
                    basis={covariateBasis}
                    onBasisChange={setCovariateBasis}
                    pending={resultsPending}
                    hideOracle={false}
                  />
                </ModuleFrame>
              </aside>
            </Panel>
            {renderWorkspaceHandle("adjusted-pairwise", true)}
          </>
        )}
        <Panel id="pairwise" defaultSize={showAdjustedOutputColumn ? 36 : 100} minSize={22} className="workspace-panel">
          <aside className="side-panel module-pane pairwise-column">
            <ModuleFrame
              tone="output"
              label="Output"
              title="Observed association"
              detail="The crude, unadjusted comparison — the same view as the adjusted estimate, before adjustment"
              pending={resultPendingActive(pairwisePending)}
              className="compact-pairwise-frame"
            >
              {observedSurvival
                ? <WhatIfStrategySurvivalCurve summary={observedSurvival.summary} survivalTime={observedSurvival.survivalTime} denominatorsOpen={false} methodId="naive" methodLabel="Observed (crude)" />
                : <ScatterplotPanel
                    graph={document.graph}
                    simulation={simulation}
                    derived={simulationDerived}
                    pair={activeOutputPair}
                    pending={pairwisePending}
                    onPair={setScatterPair}
                    onSelectNode={selectNode}
                  />}
            </ModuleFrame>
          </aside>
        </Panel>
      </PanelGroup>
    </Panel>
  );

  const renderPractitionerModulesDrawer = () => (
    <section className="advanced-drawer practitioner-modules-drawer">
      <details onToggle={(event) => { if ((event.currentTarget as HTMLDetailsElement).open) trackDenouementViewed(activeExample?.id ?? "custom"); }}>
        <summary>Practitioner modules</summary>
        <div className="practitioner-modules-grid">
          <DenouementPanel denouement={activeDenouement ?? CUSTOM_DENOUEMENT} title={activeExample?.title ?? document.title} />
          <DesignModulePanel mode={workbenchMode} />
        </div>
      </details>
    </section>
  );

  return (
    <NodeNamesProvider nodes={document.graph.nodes}>
    <div className={`app-shell mode-${workbenchMode} ${basicResultsOpen ? "results-open" : ""}${presentationActive ? " presentation-mode" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <Sigma size={20} />
          <span>Nudagitty</span>
        </div>
        {!paperNetworkOpen && !isBasicMode && !presentationActive && <div className="toolbar" aria-label="Main tools">
          <IconButton label="Select" active={tool === "select"} onClick={() => setTool("select")}><MousePointer2 size={18} /></IconButton>
          <IconButton label="Variable" active={tool === "node"} onClick={() => setTool("node")}><CirclePlus size={18} /></IconButton>
          <IconButton label="Connect" active={tool === "edge"} onClick={() => setTool("edge")}><ArrowRight size={18} /></IconButton>
          <IconButton label="Delete" onClick={deleteSelection} disabled={!selection}><Trash2 size={18} /></IconButton>
          <IconButton label="Undo" onClick={undo} disabled={history.length === 0}><Undo2 size={18} /></IconButton>
          <IconButton label="Redo" onClick={redo} disabled={future.length === 0}><Redo2 size={18} /></IconButton>
        </div>}
        {!paperNetworkOpen && <div className="toolbar" aria-label="Model actions">
          {isBasicMode ? <>
            <BasicExampleTabs activeExampleId={activeExampleId} onSelect={loadExample} />
            <ExampleMenu mode={workbenchMode} activeExampleId={activeExampleId} onSelect={loadExample} />
          </> : <>
            {!presentationActive && <IconButton label="New" onClick={createNewDocument}><FilePlus2 size={18} /></IconButton>}
            <ExampleMenu mode={workbenchMode} activeExampleId={activeExampleId} onSelect={loadExample} />
            <IconButton label="Explain this example" pressed={showExplanation} onClick={() => setShowExplanation((open) => { if (!open) trackInfoOverlayOpened("explanation"); return !open; })}><Info size={18} /></IconButton>
            <IconButton label="Data-generating process" pressed={showDgp} onClick={() => setShowDgp((open) => !open)}><Sigma size={18} /></IconButton>
            <IconButton label="Overlap / positivity" pressed={showOverlap} badge={positivity === "ok" ? null : positivity} onClick={() => setShowOverlap((open) => !open)}><Blend size={18} /></IconButton>
            <input
              ref={snapshotInputRef}
              type="file"
              accept=".nudagitty.json,application/json"
              aria-label="Open Nudagitty snapshot"
              className="screen-reader-only"
              onChange={openSnapshotFile}
            />
            {!presentationActive && <>
              <IconButton label="Open" onClick={() => snapshotInputRef.current?.click()}><Upload size={18} /></IconButton>
              <IconButton label="Download" onClick={downloadSnapshot}><Download size={18} /></IconButton>
              <IconButton label={shareStatusLabel(compactShareStatus, "Compact link")} onClick={copyCompactShareLink}><Share2 size={18} /></IconButton>
              <IconButton label={shareStatusLabel(fullShareStatus, "Full link")} onClick={copyFullShareLink}><Share2 size={18} /></IconButton>
              <IconButton label="SVG" onClick={exportGraphSvg}><Download size={18} /></IconButton>
              <IconButton label="PNG" onClick={() => exportGraphBitmap("png")}><Camera size={18} /></IconButton>
            </>}
            <IconButton label="Presentation" active={presentationActive} pressed={presentationActive} onClick={() => setPresentationMode((active) => !active)}><Presentation size={18} /></IconButton>
          </>}
        </div>}
        {/* Demo/Pro ModeToggle hidden for now — app is pro-only. */}
      </header>
      {showExplanation && (
        <div className="explanation-overlay" role="dialog" aria-modal="true" aria-label="Example explanation" onClick={() => setShowExplanation(false)}>
          <div className="explanation-modal" onClick={(event) => event.stopPropagation()}>
            <div className="explanation-modal-header">
              <strong>{activeExample?.title ?? "Explanation"}</strong>
              <button type="button" aria-label="Close explanation" onClick={() => setShowExplanation(false)}><X size={16} /></button>
            </div>
            <ExampleExplanation
              exampleId={activeExample?.id ?? ""}
              denouement={activeDenouement ?? CUSTOM_DENOUEMENT}
              title={activeExample?.title ?? document.title}
            />
          </div>
        </div>
      )}
      {showDgp && (
        <div className="explanation-overlay" role="dialog" aria-modal="true" aria-label="Data-generating process" onClick={() => setShowDgp(false)}>
          <div className="explanation-modal" onClick={(event) => event.stopPropagation()}>
            <div className="explanation-modal-header">
              <strong>Data-generating process — {activeExample?.title ?? document.title}</strong>
              <button type="button" aria-label="Close data-generating process" onClick={() => setShowDgp(false)}><X size={16} /></button>
            </div>
            <DgpInspector document={document} simulation={simulation} />
          </div>
        </div>
      )}
      {showOverlap && (
        <div className="explanation-overlay" role="dialog" aria-modal="true" aria-label="Overlap / positivity" onClick={() => setShowOverlap(false)}>
          <div className="explanation-modal" onClick={(event) => event.stopPropagation()}>
            <div className="explanation-modal-header">
              <strong>Overlap / positivity — {activeExample?.title ?? document.title}</strong>
              <button type="button" aria-label="Close overlap diagnostic" onClick={() => setShowOverlap(false)}><X size={16} /></button>
            </div>
            <OverlapInspector overlap={overlapDiagnostic} />
          </div>
        </div>
      )}
      {paperNetworkOpen ? (
        <main className="paper-network-app-main">
          <PaperNetworkView study={K562_NETWORK_STUDY} onClose={closePaperNetwork} />
        </main>
      ) : <>
      <AnalysisSampleBanner simulation={simulation} pending={simulationPending} onClearSelections={clearSelections} />

      <main className="workspace">
        <PanelGroup orientation={compactWorkspace ? "vertical" : "horizontal"} className="workspace-panel-group">
          {compactWorkspace ? (
            <>
              {renderCanvasPane(1)}
              {isBasicMode && basicResultsOpen && (
                <>
                  {renderWorkspaceHandle("canvas-results")}
                  {renderDemoResultsPane(2)}
                </>
              )}
              {!isBasicMode && (
                <>
                  {renderWorkspaceHandle("canvas-outputs")}
                  {renderProOutputsPane(2)}
                </>
              )}
              {!presentationActive && (
                <>
                  {renderWorkspaceHandle("before-editor")}
                  {renderEditorPane(3)}
                </>
              )}
            </>
          ) : (
            <>
              {!presentationActive && (
                <>
                  {renderEditorPane(1)}
                  {renderWorkspaceHandle("editor-canvas")}
                </>
              )}
              {renderCanvasPane(2)}
              {isBasicMode && basicResultsOpen && (
                <>
                  {renderWorkspaceHandle("canvas-results")}
                  {renderDemoResultsPane(3)}
                </>
              )}
              {!isBasicMode && (
                <>
                  {renderWorkspaceHandle("canvas-outputs")}
                  {renderProOutputsPane(3)}
                </>
              )}
            </>
          )}
        </PanelGroup>

        {!isBasicMode && !presentationActive && renderPractitionerModulesDrawer()}

        {!isBasicMode && !presentationActive && <section className="advanced-drawer">
          <details>
            <summary>Advanced diagnostics and artifacts</summary>
            <div className="advanced-grid">
              <Section title="Interventions + sample filters" pending={simulationPending}>
                <ScenarioPanel
                  document={document}
                  simulation={simulation}
                  pending={simulationPending}
                  onResample={resample}
                  onClearOverrides={clearOverrides}
                  onClearSelections={clearSelections}
                />
              </Section>
              <Section title="View Mode">
                <RadioGroup value={viewMode} options={[
                  ["normal", "normal"],
                  ["moral", "moral graph"],
                  ["correlation", "correlation graph"],
                  ["equivalence", "equivalence class"]
                ]} onChange={(value) => setViewMode(value as ViewMode)} />
              </Section>
              <Section title="Coloring">
                <Checkbox label="causal paths" checked={showCausal} onChange={setShowCausal} />
                <Checkbox label="biasing paths" checked={showBiasing} onChange={setShowBiasing} />
                <Checkbox label="ancestral structure" checked={showAncestors} onChange={setShowAncestors} />
              </Section>
              <Section title="Simulation Diagnostics" pending={simulationPending}>
                <SimulationDiagnosticsPanel
                  document={document}
                  simulation={simulation}
                  empiricalDraws={empiricalDraws}
                  onEmpiricalDraws={updateEmpiricalDraws}
                />
              </Section>
              <Section title="Causal Effect Identification" pending={analysisPending}>
                <select value={effectKind} onChange={(event) => setEffectKind(event.target.value as EffectKind)}>
                  <option value="total">Adjustment (total effect)</option>
                  <option value="direct">Adjustment (direct effect)</option>
                  <option value="causalOdds">Adjustment (causal odds ratio)</option>
                  <option value="instrument">Instrumental variable</option>
                </select>
                <EffectPanel effectKind={effectKind} analysis={analysis} />
              </Section>
              <Section title="Testable Implications" pending={analysisPending}>
                <ImplicationPanel analysis={analysis} />
              </Section>
              <Section title="Model Code">
                <CodeMirror
                  value={modelText}
                  height="220px"
                  basicSetup={{ lineNumbers: false, foldGutter: false }}
                  onChange={(value) => {
                    setModelText(value);
                    setModelDirty(value !== serializeModel(document));
                  }}
                />
                {modelDirty && <button type="button" onClick={updateModelFromText}><Braces size={15} /> Update DAG</button>}
              </Section>
              <Section title="Summary" pending={analysisPending}>
                <SummaryPanel analysis={analysis} />
              </Section>
              <Section title="Bibliography">
                <BibliographyPanel topic={bibliographyTopic} onTopic={setBibliographyTopic} />
              </Section>
              <Section title="Export">
                <button type="button" onClick={() => downloadText("nudagitty-model.dagitty", serializeModel(document))}><Download size={15} /> model code</button>
                <button type="button" onClick={() => downloadText("nudagitty-model.tex", tikzDocument(document.graph))}><Download size={15} /> TikZ</button>
                <button type="button" onClick={() => exportGraphBitmap("jpeg")}><Camera size={15} /> JPEG</button>
              </Section>
              <Section title="Workbench TODOs">
                <RoadmapTodoPanel />
              </Section>
            </div>
          </details>
        </section>}
      </main>
      </>}
    </div>
    </NodeNamesProvider>
  );
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

const FLOW_NODE_WIDTH = 142;
const FLOW_NODE_HEIGHT = 150;
const FLOW_NODE_CENTER_X = 71;
const FLOW_NODE_CENTER_Y = (42 / 152) * FLOW_NODE_HEIGHT;
const FLOW_NODE_TYPES = { graphNode: FlowGraphNode };
const FLOW_EDGE_TYPES = { graphEdge: FlowGraphEdge };

type FlowGraphNode = FlowNode<FlowGraphNodeData, "graphNode">;
type FlowGraphEdge = FlowEdge<FlowGraphEdgeData, "graphEdge">;

function FlowGraphCanvas(props: React.ComponentProps<typeof GraphCanvas>) {
  return (
    <ReactFlowProvider>
      <FlowGraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function FlowGraphCanvasInner(props: React.ComponentProps<typeof GraphCanvas>) {
  const flow = useReactFlow<FlowGraphNode, FlowGraphEdge>();
  const panZoom = useStore((state) => state.panZoom);
  const touchScrollViewport = useMediaQuery("(max-width: 700px)");
  const frameRef = useRef<HTMLDivElement | null>(null);
  const nodesById = useMemo(() => new Map(props.graph.nodes.map((node) => [node.id, node])), [props.graph.nodes]);
  const denseEdges = props.graph.edges.length > 7;
  const viewportSignature = useMemo(() => graphViewportSignature(props.graph), [props.graph]);
  const computedNodes = useMemo<FlowGraphNode[]>(() => props.graph.nodes.map((node) => {
    const selected = props.selection?.kind === "node" && props.selection.id === node.id;
    return {
      id: node.id,
      type: "graphNode",
      position: graphPointToFlowPoint(node.position),
      width: FLOW_NODE_WIDTH,
      height: FLOW_NODE_HEIGHT,
      initialWidth: FLOW_NODE_WIDTH,
      initialHeight: FLOW_NODE_HEIGHT,
      handles: [
        { id: null, type: "target", position: Position.Left, x: FLOW_NODE_CENTER_X, y: FLOW_NODE_CENTER_Y, width: 1, height: 1 },
        { id: null, type: "source", position: Position.Right, x: FLOW_NODE_CENTER_X, y: FLOW_NODE_CENTER_Y, width: 1, height: 1 }
      ],
      data: {
        node,
        selected,
        edgeSource: props.edgeSource === node.id,
        ancestor: props.ancestorIds.has(node.id),
        changed: props.simulation.changedNodes.includes(node.id),
        value: props.simulation.values[node.id],
        state: props.simulation.nodeStates[node.id],
        summary: props.derived.nodes.get(node.id),
        onNodeClick: props.onNodeClick
      },
      selected,
      draggable: true,
      focusable: true
    };
  }), [props.ancestorIds, props.derived.nodes, props.edgeSource, props.graph.nodes, props.onNodeClick, props.selection, props.simulation.changedNodes, props.simulation.nodeStates, props.simulation.values]);
  const [nodes, setNodes] = useState<FlowGraphNode[]>(computedNodes);
  const [legendOpen, setLegendOpen] = useState(false);

  const liveNodesById = useMemo(() => {
    const live = new Map<string, GraphNode>();
    for (const flowNode of nodes) {
      const graphNode = nodesById.get(flowNode.id) ?? flowNode.data.node;
      live.set(flowNode.id, {
        ...graphNode,
        position: flowNodePositionToGraphPoint(flowNode.position)
      });
    }
    for (const graphNode of props.graph.nodes) {
      if (!live.has(graphNode.id)) live.set(graphNode.id, graphNode);
    }
    return live;
  }, [nodes, nodesById, props.graph.nodes]);

  const computedEdges = useMemo<FlowGraphEdge[]>(() => props.graph.edges.map((edge) => {
    const source = liveNodesById.get(edge.source);
    const target = liveNodesById.get(edge.target);
    const mechanism = normalizeEdgeMechanism(props.edgeMechanisms[edge.id]);
    const enabled = !props.disabledEdgeIds.has(edge.id);
    const edgeStrength = edgeMechanismDisplayStrength(mechanism);
    const width = edgeStrokeWidth(edgeStrength, denseEdges);
    return {
      id: edge.id,
      type: "graphEdge",
      source: edge.source,
      target: edge.target,
      selected: props.selection?.kind === "edge" && props.selection.id === edge.id,
      data: {
        edge,
        source: source ?? createNode(edge.source, { x: 0, y: 0 }),
        target: target ?? createNode(edge.target, { x: 0, y: 0 }),
        mechanism,
        geometry: source && target ? edgeGeometry(edge, source, target, width, props.graph.edges, liveNodesById) : {
          path: `M 0 0 L 0 0`,
          control: { x: 0, y: 0 },
          label: { x: 0, y: 0 },
          start: { x: 0, y: 0 },
          end: { x: 0, y: 0 },
          curved: false
        },
        semantic: props.highlightedEdges.get(edge.id),
        enabled,
        denseEdges,
        onSelect: props.onEdgeClick
      }
    };
  }), [denseEdges, liveNodesById, props.disabledEdgeIds, props.edgeMechanisms, props.graph.edges, props.highlightedEdges, props.onEdgeClick, props.selection]);

  useEffect(() => {
    setNodes(computedNodes);
  }, [computedNodes]);

  useEffect(() => {
    if (!panZoom || !frameRef.current || props.graph.nodes.length === 0) return undefined;
    window.setTimeout(() => {
      const rect = frameRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const positions = props.graph.nodes.map((node) => graphPointToFlowPoint(node.position));
      const minX = Math.min(...positions.map((point) => point.x));
      const minY = Math.min(...positions.map((point) => point.y));
      const maxX = Math.max(...positions.map((point) => point.x + FLOW_NODE_WIDTH));
      const maxY = Math.max(...positions.map((point) => point.y + FLOW_NODE_HEIGHT));
      const graphWidth = Math.max(1, maxX - minX);
      const graphHeight = Math.max(1, maxY - minY);
      const padding = 0.18;
      const zoom = clamp(Math.min(rect.width / (graphWidth * (1 + padding * 2)), rect.height / (graphHeight * (1 + padding * 2))), 0.25, 3);
      const x = (rect.width - graphWidth * zoom) / 2 - minX * zoom;
      const y = (rect.height - graphHeight * zoom) / 2 - minY * zoom;
      const viewport = { x, y, zoom };
      void flow.setViewport(viewport);
    }, 0);
    return undefined;
  }, [flow, panZoom, props.graph.nodes, props.mode, viewportSignature]);

  const onNodesChange = useCallback((changes: NodeChange<FlowGraphNode>[]) => {
    setNodes((items) => applyNodeChanges(changes, items));
  }, []);
  const onCanvasDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest(".react-flow__node, .react-flow__edge")) return;
    const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    props.onAddNode(point);
  }, [flow, props]);

  return (
    <section className="canvas-shell flow-canvas-shell" aria-label="Graph editor">
      <div ref={frameRef} className="flow-canvas-frame" role="application" aria-label="Editable causal graph" onDoubleClick={onCanvasDoubleClick}>
        <ReactFlow<FlowGraphNode, FlowGraphEdge>
          className={`graph-canvas flow-graph-canvas ${denseEdges ? "dense-edges" : ""}`}
          nodes={nodes}
          edges={computedEdges}
          nodeTypes={FLOW_NODE_TYPES}
          edgeTypes={FLOW_EDGE_TYPES}
          minZoom={0.25}
          maxZoom={3}
          nodesDraggable={props.mode !== "basic" && !touchScrollViewport}
          nodesConnectable={false}
          elementsSelectable
          panOnDrag={!touchScrollViewport}
          preventScrolling={!touchScrollViewport}
          selectNodesOnDrag={false}
          zoomOnDoubleClick={!touchScrollViewport}
          zoomOnPinch={!touchScrollViewport}
          zoomOnScroll={!touchScrollViewport}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => props.tool === "edge" ? props.onNodeClick(node.id) : props.onNodeClick(node.id)}
          onNodeDragStop={(_, node) => props.onMoveNode(node.id, flowNodePositionToGraphPoint(node.position))}
          onEdgeClick={(_, edge) => props.onEdgeClick(edge.id)}
          onPaneClick={() => props.onSelect(null)}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.1} />
          {props.mode !== "basic" && <Controls className="canvas-zoom-controls react-flow-controls" showInteractive={false} />}
          <FlowGraphArrowLayer edges={computedEdges} />
        </ReactFlow>
      </div>
      <button
        type="button"
        className={`canvas-legend-toggle ${legendOpen ? "active" : ""}`}
        aria-expanded={legendOpen}
        onClick={() => setLegendOpen((current) => !current)}
      >
        Legend
      </button>
      {legendOpen && <FlowGraphLegend />}
      {props.mode !== "basic" && <div className="canvas-status">
        <span>{props.tool === "edge" ? (props.edgeSource ? `connect from ${props.edgeSource}` : "click a source variable") : "double-click canvas to add variable"}</span>
      </div>}
      {resultPendingActive(props.pending) && (
        <div className="canvas-computation-status" role="status">
          <PendingChip pending label={resultPendingShortLabel(props.pending)} />
        </div>
      )}
    </section>
  );
}

function FlowGraphLegend() {
  return (
    <div className="graph-legend flow-graph-legend" aria-hidden="true">
      <div className="flow-graph-legend-title">Legend</div>
      <div className="flow-graph-legend-row">
        <span className="flow-graph-legend-node adjusted" />
        <span>adjusted</span>
      </div>
      <div className="flow-graph-legend-row">
        <span className="flow-graph-legend-node selected" />
        <span>sample marker</span>
      </div>
    </div>
  );
}

function FlowGraphNode(props: FlowNodeProps<FlowGraphNode>) {
  const { node, selected, edgeSource, ancestor, changed, value, state, summary, onNodeClick } = props.data;
  const variable = normalizeVariableModel(node.variable);
  const labelLines = nodeLabelLines(node.label);
  const labelY = labelLines.length === 1 ? 4 : -((labelLines.length - 1) * 6);
  const className = [
    "flow-graph-node",
    "node",
    selected || props.selected ? "selected" : "",
    node.roles.latent ? "latent" : "",
    ancestor ? "ancestor" : "",
    changed ? "changed" : "",
    edgeSource ? "edge-source" : ""
  ].filter(Boolean).join(" ");
  const handleSelect = (event: React.MouseEvent) => {
    event.stopPropagation();
    onNodeClick(node.id);
  };
  const handleLabelPointerDown = (event: React.PointerEvent<SVGTextElement>) => {
    event.stopPropagation();
    onNodeClick(node.id);
  };
  return (
    <div
      className={className}
      onClick={handleSelect}
    >
      <Handle type="target" position={Position.Left} className="flow-node-handle" />
      <Handle type="source" position={Position.Right} className="flow-node-handle" />
      <svg viewBox="-76 -42 152 152" className="flow-node-svg" aria-hidden="true" onClick={handleSelect}>
        <circle r={node.roles.exposure || node.roles.outcome ? 25 : 21} />
        {node.roles.adjusted && <rect className="adjusted-ring" x="-27" y="-27" width="54" height="54" rx="6" />}
        {node.roles.selected && <path className="selected-mark" d="M -20 24 L 0 34 L 20 24" />}
        <text className="node-label" y={labelY} onClick={handleSelect} onPointerDown={handleLabelPointerDown}>
          {labelLines.map((line, index) => (
            <tspan x="0" dy={index === 0 ? 0 : 12} key={`${line}-${index}`}>
              {line}{index < labelLines.length - 1 ? " " : ""}
            </tspan>
          ))}
        </text>
        <NodeDistributionMiniPlot state={state} variable={variable} summary={summary} />
        <NodeDistributionAnnotation state={state} value={value} variable={variable} />
      </svg>
    </div>
  );
}

function FlowGraphEdge(props: FlowEdgeProps<FlowGraphEdge>) {
  const data = props.data;
  if (!data) return null;
  const { path, control, start, end } = data.geometry;
  const edgeStrength = edgeMechanismDisplayStrength(data.mechanism);
  const width = edgeStrokeWidth(edgeStrength, data.denseEdges);
  const showEndArrow = data.edge.kind === "directed" || data.edge.kind === "bidirected";
  const showStartArrow = data.edge.kind === "bidirected";
  const startReference = control;
  const endReference = control;
  const startArrow = showStartArrow ? arrowHeadGeometry(start, startReference, width) : null;
  const endArrow = showEndArrow ? arrowHeadGeometry(end, endReference, width) : null;
  const visiblePath = edgeVisibleStrokePath(data.geometry, startArrow, endArrow);
  return (
    <g className={flowEdgeClassName(data, props.selected)}>
      <title>{edgeMechanismTitle(data.edge, data.source, data.target, data.mechanism)}</title>
      <path
        d={path}
        className="edge-hit"
        onPointerDown={(event) => {
          event.stopPropagation();
          data.onSelect(props.id);
        }}
      />
      <path
        d={visiblePath}
        className={`edge-line ${data.edge.kind === "directed" || data.edge.kind === "bidirected" ? "with-arrow" : ""}`}
        style={{ strokeWidth: width }}
      />
    </g>
  );
}

function FlowGraphArrowLayer({ edges }: { edges: FlowGraphEdge[] }) {
  return (
    <ViewportPortal>
      <svg className="edge-arrow-layer" aria-hidden="true">
        {edges.map((edge) => {
          const data = edge.data;
          if (!data) return null;
          const edgeStrength = edgeMechanismDisplayStrength(data.mechanism);
          const width = edgeStrokeWidth(edgeStrength, data.denseEdges);
          const showEndArrow = data.edge.kind === "directed" || data.edge.kind === "bidirected";
          const showStartArrow = data.edge.kind === "bidirected";
          const startArrow = showStartArrow ? arrowHeadGeometry(data.geometry.start, data.geometry.control, width) : null;
          const endArrow = showEndArrow ? arrowHeadGeometry(data.geometry.end, data.geometry.control, width) : null;
          const label = data.geometry.label;
          const edgeLabel = edgeMechanismCanvasLabel(data.mechanism);
          const showEdgeLabel = data.enabled && (data.mechanism.kind !== "linear" || Math.abs(edgeStrength) > 0.001);
          if (!startArrow && !endArrow && !showEdgeLabel) return null;
          return (
            <g key={edge.id} className={flowEdgeClassName(data, edge.selected)}>
              {startArrow && <path className="edge-arrow-head" d={startArrow.path} />}
              {endArrow && <path className="edge-arrow-head" d={endArrow.path} />}
              {showEdgeLabel && (
                <text className="edge-value" x={label.x} y={label.y - 12}>
                  <tspan className="edge-value-context" x={label.x}>{edgeLabel.context}</tspan>
                  <tspan className="edge-value-number" x={label.x} dy="10">{edgeLabel.value}</tspan>
                </text>
              )}
              {showEdgeLabel && <EdgeFunctionGlyph kind={data.mechanism.kind} x={label.x} y={label.y} />}
            </g>
          );
        })}
      </svg>
    </ViewportPortal>
  );
}

function flowEdgeClassName(data: FlowGraphEdgeData, selected?: boolean): string {
  const edgeStrength = edgeMechanismDisplayStrength(data.mechanism);
  const coefficientClass = edgeStrength > 0 ? "coefficient-positive" : edgeStrength < 0 ? "coefficient-negative" : "coefficient-zero";
  return `edge ${coefficientClass} ${selected ? "selected" : ""} ${data.semantic ?? ""} ${data.enabled ? "" : "disabled"}`;
}

function graphPointToFlowPoint(point: Point): Point {
  return {
    x: point.x - FLOW_NODE_CENTER_X,
    y: point.y - FLOW_NODE_CENTER_Y
  };
}

function flowNodePositionToGraphPoint(point: Point): Point {
  return {
    x: point.x + FLOW_NODE_CENTER_X,
    y: point.y + FLOW_NODE_CENTER_Y
  };
}

type ArrowHeadGeometry = { path: string; base: Point };

function edgeVisibleStrokePath(geometry: EdgeGeometry, startArrow: ArrowHeadGeometry | null, endArrow: ArrowHeadGeometry | null): string {
  const start = startArrow?.base ?? geometry.start;
  const end = endArrow?.base ?? geometry.end;
  if (geometry.curved) return `M ${start.x} ${start.y} Q ${geometry.control.x} ${geometry.control.y} ${end.x} ${end.y}`;
  return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
}

function arrowHeadGeometry(tip: Point, from: Point, strokeWidth: number): ArrowHeadGeometry {
  const direction = unitVector(from, tip);
  const length = clamp(strokeWidth * 3.1, 7.5, 11);
  const halfWidth = clamp(strokeWidth * 1.55, 3.8, 5.8);
  const base = {
    x: tip.x - direction.x * length,
    y: tip.y - direction.y * length
  };
  const normal = { x: -direction.y, y: direction.x };
  const left = {
    x: base.x + normal.x * halfWidth,
    y: base.y + normal.y * halfWidth
  };
  const right = {
    x: base.x - normal.x * halfWidth,
    y: base.y - normal.y * halfWidth
  };
  return {
    base,
    path: `M ${tip.x} ${tip.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`
  };
}

function GraphCanvas(props: {
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
  disabledEdgeIds: Set<string>;
  highlightedEdges: Map<string, "causal" | "biasing">;
  ancestorIds: Set<string>;
  pending: ResultPendingState;
  onSelect: (selection: Selection) => void;
  onAddNode: (point: Point) => void;
  onMoveNode: (id: string, position: Point) => void;
  onNodeClick: (id: string) => void;
  onEdgeClick: (id: string) => void;
  onEdgeControl: (edge: GraphEdge) => void;
  onResample: () => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const activePointersRef = useRef(new Map<number, PointerScreenPoint>());
  const pinchRef = useRef<{ distance: number; center: PointerScreenPoint } | null>(null);
  const viewportSignature = useMemo(() => graphViewportSignature(props.graph), [props.graph.nodes, props.graph.edges]);
  const fittedViewport = useMemo(() => fitViewportToGraph(props.graph, props.mode), [props.mode, viewportSignature]);
  const [viewport, setViewport] = useState<CanvasViewport>(() => fitViewportToGraph(props.graph, props.mode));
  const viewBoxWidth = BASE_VIEWBOX.width / viewport.zoom;
  const viewBoxHeight = BASE_VIEWBOX.height / viewport.zoom;
  const viewBox = `${viewport.cx - viewBoxWidth / 2} ${viewport.cy - viewBoxHeight / 2} ${viewBoxWidth} ${viewBoxHeight}`;
  const legendWidth = 168;
  const legendHeight = 72;
  const legendX = viewport.cx + viewBoxWidth / 2 - legendWidth - 18;
  const legendY = viewport.cy - viewBoxHeight / 2 + (props.mode === "basic" ? 54 : 96);
  const canvasClassName = [
    "graph-canvas",
    drag?.kind === "pan" ? "panning" : "",
    props.graph.edges.length > 7 ? "dense-edges" : ""
  ].filter(Boolean).join(" ");
  const denseEdges = props.graph.edges.length > 7;

  useEffect(() => {
    setViewport(fittedViewport);
  }, [fittedViewport]);

  const clientPointToSvgPoint = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const mapped = point.matrixTransform(matrix.inverse());
    return { x: mapped.x, y: mapped.y };
  }, []);

  const svgPoint = useCallback((event: React.PointerEvent | React.MouseEvent | React.WheelEvent): Point => (
    clientPointToSvgPoint(event.clientX, event.clientY)
  ), [clientPointToSvgPoint]);

  const zoomBy = useCallback((factor: number, anchor?: Point) => {
    setViewport((current) => {
      const nextZoom = clamp(current.zoom * factor, 0.45, 4);
      const oldWidth = BASE_VIEWBOX.width / current.zoom;
      const oldHeight = BASE_VIEWBOX.height / current.zoom;
      const nextWidth = BASE_VIEWBOX.width / nextZoom;
      const nextHeight = BASE_VIEWBOX.height / nextZoom;
      if (!anchor) return { ...current, zoom: nextZoom };
      const ratioX = (anchor.x - (current.cx - oldWidth / 2)) / oldWidth;
      const ratioY = (anchor.y - (current.cy - oldHeight / 2)) / oldHeight;
      return {
        zoom: nextZoom,
        cx: anchor.x - (ratioX - 0.5) * nextWidth,
        cy: anchor.y - (ratioY - 0.5) * nextHeight
      };
    });
  }, []);

  const panBy = useCallback((dx: number, dy: number) => {
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return;
    setViewport((current) => ({ ...current, cx: current.cx - dx, cy: current.cy - dy }));
  }, []);

  const screenDistance = useCallback((a: PointerScreenPoint, b: PointerScreenPoint): number => (
    Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  ), []);

  const screenCenter = useCallback((a: PointerScreenPoint, b: PointerScreenPoint): PointerScreenPoint => ({
    clientX: (a.clientX + b.clientX) / 2,
    clientY: (a.clientY + b.clientY) / 2
  }), []);

  const resetGesture = useCallback((pointerId?: number) => {
    if (pointerId !== undefined) activePointersRef.current.delete(pointerId);
    if (activePointersRef.current.size < 2) pinchRef.current = null;
    setDrag((current) => {
      if (pointerId === undefined) return null;
      return current?.kind === "pan" && current.pointerId === pointerId ? null : current;
    });
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    }
    if (activePointersRef.current.size >= 2) {
      const [first, second] = Array.from(activePointersRef.current.values());
      if (first && second) {
        const nextCenter = screenCenter(first, second);
        const nextDistance = screenDistance(first, second);
        const previous = pinchRef.current;
        if (previous && previous.distance > 0 && nextDistance > 0) {
          const previousCenterPoint = clientPointToSvgPoint(previous.center.clientX, previous.center.clientY);
          const nextCenterPoint = clientPointToSvgPoint(nextCenter.clientX, nextCenter.clientY);
          panBy(nextCenterPoint.x - previousCenterPoint.x, nextCenterPoint.y - previousCenterPoint.y);
          zoomBy(nextDistance / previous.distance, nextCenterPoint);
        }
        pinchRef.current = { distance: nextDistance, center: nextCenter };
        setDrag(null);
      }
      return;
    }
    if (!drag) return;
    const point = svgPoint(event);
    if (drag.kind === "node") {
      props.onMoveNode(drag.id, { x: point.x - drag.offset.x, y: point.y - drag.offset.y });
    } else if (drag.kind === "edge-control") {
      const edge = props.sourceGraph.edges.find((candidate) => candidate.id === drag.id);
      if (edge) props.onEdgeControl({ ...edge, control: point });
    } else {
      const dx = point.x - drag.lastPoint.x;
      const dy = point.y - drag.lastPoint.y;
      panBy(dx, dy);
      setDrag({ ...drag, lastPoint: point, moved: drag.moved || Math.hypot(dx, dy) > 2 });
    }
  }, [clientPointToSvgPoint, drag, panBy, props, screenCenter, screenDistance, svgPoint, zoomBy]);

  const nodesById = useMemo(() => new Map(props.graph.nodes.map((node) => [node.id, node])), [props.graph.nodes]);

  return (
    <section className="canvas-shell" aria-label="Graph editor">
      <svg
        ref={svgRef}
        className={canvasClassName}
        role="img"
        aria-label="Editable causal graph"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        onWheel={(event) => {
          event.preventDefault();
          zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, svgPoint(event));
        }}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => {
          if (drag?.kind === "pan" && drag.pointerId === event.pointerId && !drag.moved && props.tool === "node") {
            props.onAddNode(svgPoint(event));
          } else if (drag?.kind === "node" || drag?.kind === "edge-control") {
            setDrag(null);
          }
          resetGesture(event.pointerId);
        }}
        onPointerCancel={(event) => resetGesture(event.pointerId)}
        onLostPointerCapture={(event) => resetGesture(event.pointerId)}
        onDoubleClick={(event) => {
          if (props.tool !== "select") return;
          props.onAddNode(svgPoint(event));
        }}
        onPointerDown={(event) => {
          const target = event.target as Element;
          if (event.target === svgRef.current || target.classList.contains("canvas-grid")) {
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // Some synthetic or browser-translated touch events cannot be captured.
            }
            activePointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
            if (activePointersRef.current.size >= 2) {
              const [first, second] = Array.from(activePointersRef.current.values());
              if (first && second) pinchRef.current = { distance: screenDistance(first, second), center: screenCenter(first, second) };
              setDrag(null);
              return;
            }
            props.onSelect(null);
            setDrag({ kind: "pan", pointerId: event.pointerId, lastPoint: svgPoint(event), moved: false });
          }
        }}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="5.6" refY="5" markerWidth="4.8" markerHeight="4.8" orient="auto-start-reverse" markerUnits="strokeWidth">
            <path className="arrow-head" d="M 0.7 0.8 L 9.5 5 L 0.7 9.2 z" />
          </marker>
          <marker id="arrow-bias" viewBox="0 0 10 10" refX="5.6" refY="5" markerWidth="4.8" markerHeight="4.8" orient="auto-start-reverse" markerUnits="strokeWidth">
            <path className="arrow-head" d="M 0.7 0.8 L 9.5 5 L 0.7 9.2 z" />
          </marker>
          <marker id="legend-arrow" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="10" markerHeight="10" orient="auto" markerUnits="userSpaceOnUse">
            <path className="arrow-head" d="M 0.7 0.8 L 9.5 5 L 0.7 9.2 z" />
          </marker>
        </defs>
        <g>
          <rect className="canvas-grid" x="-2400" y="-2400" width="4800" height="4800" />
          {props.graph.edges.map((edge) => {
            const source = nodesById.get(edge.source);
            const target = nodesById.get(edge.target);
            if (!source || !target) return null;
            const selected = props.selection?.kind === "edge" && props.selection.id === edge.id;
            const semantic = props.highlightedEdges.get(edge.id);
            const mechanism = normalizeEdgeMechanism(props.edgeMechanisms[edge.id]);
            const edgeStrength = edgeMechanismDisplayStrength(mechanism);
            const width = edgeStrokeWidth(edgeStrength, denseEdges);
            const geometry = edgeGeometry(edge, source, target, width, props.graph.edges, nodesById);
            const enabled = !props.disabledEdgeIds.has(edge.id);
            const edgeLabel = edgeMechanismCanvasLabel(mechanism);
            const showEdgeLabel = enabled && (mechanism.kind !== "linear" || Math.abs(edgeStrength) > 0.001);
            const coefficientClass = edgeStrength > 0 ? "coefficient-positive" : edgeStrength < 0 ? "coefficient-negative" : "coefficient-zero";
            return (
              <g key={edge.id} className={`edge ${coefficientClass} ${selected ? "selected" : ""} ${semantic ?? ""} ${enabled ? "" : "disabled"}`}>
                <title>{edgeMechanismTitle(edge, source, target, mechanism)}</title>
                <path
                  d={geometry.path}
                  className="edge-hit"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    props.onEdgeClick(edge.id);
                  }}
                />
                <path
                  d={geometry.path}
                  className={`edge-line ${edge.kind === "directed" || edge.kind === "bidirected" ? "with-arrow" : ""}`}
                  style={{ strokeWidth: width }}
                  markerEnd={edge.kind === "directed" || edge.kind === "bidirected" ? "url(#arrow)" : undefined}
                  markerStart={edge.kind === "bidirected" ? "url(#arrow)" : undefined}
                />
                {selected && <circle
                  className="edge-control"
                  cx={geometry.control.x}
                  cy={geometry.control.y}
                  r="7"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setDrag({ kind: "edge-control", id: edge.id });
                  }}
                />}
                {showEdgeLabel && (
                  <text className="edge-value" x={geometry.label.x} y={geometry.label.y - 15}>
                    <tspan className="edge-value-context" x={geometry.label.x}>{edgeLabel.context}</tspan>
                    <tspan className="edge-value-number" x={geometry.label.x} dy="13">{edgeLabel.value}</tspan>
                  </text>
                )}
                {showEdgeLabel && <EdgeFunctionGlyph kind={mechanism.kind} x={geometry.label.x} y={geometry.label.y} />}
              </g>
            );
          })}
          {props.graph.nodes.map((node) => {
            const selected = props.selection?.kind === "node" && props.selection.id === node.id;
            const value = props.simulation.values[node.id];
            const state = props.simulation.nodeStates[node.id];
            const isAncestor = props.ancestorIds.has(node.id);
            const changed = props.simulation.changedNodes.includes(node.id);
            const variable = normalizeVariableModel(node.variable);
            const labelLines = nodeLabelLines(node.label);
            const labelY = labelLines.length === 1 ? 4 : -((labelLines.length - 1) * 6);
            return (
              <g
                key={node.id}
                className={`node ${selected ? "selected" : ""} ${node.roles.latent ? "latent" : ""} ${isAncestor ? "ancestor" : ""} ${changed ? "changed" : ""} ${props.edgeSource === node.id ? "edge-source" : ""}`}
                transform={`translate(${node.position.x}, ${node.position.y})`}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  const point = svgPoint(event);
                  setDrag({ kind: "node", id: node.id, offset: { x: point.x - node.position.x, y: point.y - node.position.y } });
                  props.onNodeClick(node.id);
                }}
              >
                <circle r={node.roles.exposure || node.roles.outcome ? 25 : 21} />
                {node.roles.adjusted && <rect className="adjusted-ring" x="-27" y="-27" width="54" height="54" rx="6" />}
                {node.roles.selected && <path className="selected-mark" d="M -20 24 L 0 34 L 20 24" />}
                <text className="node-label" y={labelY}>
                  {labelLines.map((line, index) => (
                    <tspan x="0" dy={index === 0 ? 0 : 12} key={`${line}-${index}`}>
                      {line}{index < labelLines.length - 1 ? " " : ""}
                    </tspan>
                  ))}
                </text>
                <NodeDistributionMiniPlot state={state} variable={variable} summary={props.derived.nodes.get(node.id)} />
                <NodeDistributionAnnotation state={state} value={value} variable={variable} />
              </g>
            );
          })}
          {legendOpen && <GraphLegend x={legendX} y={legendY} width={legendWidth} height={legendHeight} />}
        </g>
      </svg>
      <button
        type="button"
        className={legendOpen ? "canvas-legend-toggle active" : "canvas-legend-toggle"}
        aria-expanded={legendOpen}
        onClick={() => setLegendOpen((open) => !open)}
      >
        Legend
      </button>
      {props.mode !== "basic" && <div className="canvas-zoom-controls" aria-label="Canvas zoom controls">
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>-</button>
        <span>{Math.round(viewport.zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.2)}>+</button>
        <button type="button" onClick={() => setViewport(fittedViewport)}>reset</button>
      </div>}
      {props.mode !== "basic" && <div className="canvas-status">
        <span>{props.tool === "edge" ? (props.edgeSource ? `connect from ${props.edgeSource}` : "click a source variable") : "double-click canvas to add variable"}</span>
      </div>}
      {resultPendingActive(props.pending) && (
        <div className="canvas-computation-status" role="status">
          <PendingChip pending label={resultPendingShortLabel(props.pending)} />
        </div>
      )}
    </section>
  );
}

function CanvasCoachmark(props: { tool: ToolMode; edgeSource: string | null; selection: Selection; nodeCount: number }) {
  let title = "Choose a variable";
  let body = "Click a variable to set exposure, outcome, adjustment, sample filters, or intervention.";
  if (props.nodeCount === 0) {
    title = "Start with a variable";
    body = "Choose Variable, then click an open spot on the graph.";
  } else if (props.tool === "node") {
    title = "Place a variable";
    body = "Click an open spot to add it to the causal story.";
  } else if (props.tool === "edge" && !props.edgeSource) {
    title = "Start an arrow";
    body = "Choose the variable that causes something else.";
  } else if (props.tool === "edge" && props.edgeSource) {
    title = "Finish the arrow";
    body = `Now choose what ${props.edgeSource} points to.`;
  } else if (props.selection?.kind === "node") {
    title = "Edit the causal role";
    body = "Use the panel on the right for roles, sample filters, interventions, and adjustment.";
  } else if (props.selection?.kind === "edge") {
    title = "Edit the arrow";
    body = "Use the panel on the right to include the link or change its strength.";
  }
  return (
    <div className="canvas-coachmark" role="status">
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function EdgeFunctionGlyph({ kind, x, y }: { kind: EdgeMechanismKind; x: number; y: number }) {
  return (
    <g className="edge-function-glyph" transform={`translate(${x - 11}, ${y + 4})`} aria-hidden="true">
      <rect className="edge-function-glyph-card" x="0" y="0" width="22" height="14" rx="3" />
      <g transform="translate(1 0) scale(0.65 0.68)">
        <path className="edge-function-glyph-axis" d="M 3 17 H 29 M 4 18 V 3" />
        <path className="edge-function-glyph-curve" d={functionGlyphPath(kind)} />
      </g>
    </g>
  );
}

function GraphLegend({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  return (
    <g className="graph-legend" transform={`translate(${x}, ${y})`} aria-hidden="true">
      <rect className="graph-legend-card" x="0" y="0" width={width} height={height} rx="7" />
      <text className="graph-legend-heading" x="12" y="18">Legend</text>
      <circle className="graph-legend-node" cx="24" cy="42" r="8" />
      <rect className="graph-legend-adjusted" x="12" y="30" width="24" height="24" rx="4" />
      <text className="graph-legend-text" x="42" y="46">adjusted</text>
      <circle className="graph-legend-node" cx="24" cy="62" r="8" />
      <path className="graph-legend-selected-mark" d="M 12 70 L 24 76 L 36 70" />
      <text className="graph-legend-text" x="42" y="66">sample marker</text>
    </g>
  );
}

function nodeLabelLines(label: string): string[] {
  const normalized = label.replace(/_/g, " ").trim();
  if (normalized.length <= 11) return [normalized];
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [normalized];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= 11 || current.length === 0) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  if (lines.length <= 3) return lines;
  return [lines[0]!, lines[1]!, lines.slice(2).join(" ")];
}

function edgeMechanismTitle(edge: GraphEdge, source: GraphNode, target: GraphNode, mechanism: EdgeMechanism): string {
  const connector = edge.kind === "bidirected" ? "<->" : edge.kind === "undirected" ? "--" : "->";
  const label = edgeMechanismCanvasLabel(mechanism);
  return `${source.label} ${connector} ${target.label}: ${mechanismLabel(mechanism.kind)} mechanism, ${label.value}. Select the edge to inspect or edit it.`;
}

function edgeMechanismCanvasLabel(mechanism: EdgeMechanism): { context: string; value: string } {
  if (mechanism.kind === "linear") return { context: "linear coef", value: formatSignedValue(mechanism.coefficient) };
  if (mechanism.kind === "absorbing") return { context: "absorbing", value: "deterministic" };
  if (mechanism.kind === "threshold") return { context: "threshold", value: `t ${formatValue(mechanism.threshold)}` };
  if (mechanism.kind === "smooth_threshold") return { context: "smooth thresh", value: `t ${formatValue(mechanism.threshold)}` };
  if (mechanism.kind === "saturating") return { context: "saturating", value: `scale ${formatSignedValue(mechanism.scale)}` };
  if (mechanism.kind === "quadratic") return { context: "quadratic", value: `b2 ${formatSignedValue(mechanism.beta2)}` };
  if (mechanism.kind === "piecewise_linear") return { context: "piecewise", value: `${mechanism.points.length} knots` };
  if (mechanism.kind === "hill_emax") return { context: "Hill / Emax", value: `max ${formatSignedValue(mechanism.maxEffect)}` };
  if (mechanism.kind === "log_linear") return { context: "log-linear", value: `coef ${formatSignedValue(mechanism.coefficient)}` };
  if (mechanism.kind === "power_law") return { context: "power law", value: `pow ${formatValue(mechanism.exponent)}` };
  if (mechanism.kind === "table_lookup") return { context: "data replay", value: mechanism.dataset ?? "real rows" };
  return { context: "spline", value: `${mechanism.points.length} knots` };
}

function edgeMechanismDisplayStrength(mechanism: EdgeMechanism): number {
  if (mechanism.kind === "linear") return mechanism.coefficient;
  if (mechanism.kind === "absorbing") return 1;
  if (mechanism.kind === "threshold") return mechanism.high - mechanism.low;
  if (mechanism.kind === "smooth_threshold" || mechanism.kind === "saturating") return mechanism.scale;
  if (mechanism.kind === "quadratic") return mechanism.beta1 + mechanism.beta2;
  if (mechanism.kind === "piecewise_linear" || mechanism.kind === "monotone_spline") {
    const first = mechanism.points[0];
    const last = mechanism.points.at(-1);
    if (!first || !last) return 0;
    return last.y - first.y;
  }
  if (mechanism.kind === "hill_emax") return mechanism.maxEffect;
  if (mechanism.kind === "log_linear" || mechanism.kind === "power_law") return mechanism.coefficient;
  return 0;
}

function edgeStrokeWidth(edgeStrength: number, denseEdges: boolean): number {
  const strength = Math.abs(edgeStrength);
  return denseEdges
    ? Math.min(5.6, 1.55 + strength * 0.72)
    : Math.min(7.2, 1.8 + strength * 1.05);
}

const NODE_DISTRIBUTION_PLOT_X = -48;
const NODE_DISTRIBUTION_PLOT_Y = 40;
const NODE_DISTRIBUTION_PLOT_WIDTH = 96;
const NODE_DISTRIBUTION_PLOT_HEIGHT = 32;
const NODE_DISTRIBUTION_ANNOTATION_Y = 86;
const NODE_DISTRIBUTION_BOUNDS = {
  left: NODE_DISTRIBUTION_PLOT_X - 5,
  right: NODE_DISTRIBUTION_PLOT_X + NODE_DISTRIBUTION_PLOT_WIDTH + 5,
  top: NODE_DISTRIBUTION_PLOT_Y - 5,
  bottom: NODE_DISTRIBUTION_ANNOTATION_Y + 16
};

function NodeDistributionMiniPlot({ state, variable, summary }: { state?: SimulatedNodeState; variable: VariableModel; summary?: NodeDistributionSummary }) {
  const samples = state?.empirical.samples ?? [];
  if (!state || samples.length < 2) return null;
  if (isBinaryDistributionState(state, variable)) return <BinaryNodeDistributionMiniPlot state={state} />;
  const domain = summary?.domain ?? distributionPlotDomain(state);
  if (!domain) return null;
  const width = NODE_DISTRIBUTION_PLOT_WIDTH;
  const height = NODE_DISTRIBUTION_PLOT_HEIGHT;
  const bins = summary?.histogram20 ?? histogram(samples, domain, 20, state.empirical.weights);
  const maxBin = Math.max(...bins, 1);
  const analyticPath = state.analytic ? analyticDistributionPath(state.analytic, domain, width, height) : null;
  const title = [
    state.analytic ? `analytic ${analyticDistributionLabel(state.analytic)} (${state.analytic.note})` : "analytic unavailable",
    `empirical n=${samples.length}`,
    state.empirical.mean !== null ? `sample mean ${formatValue(state.empirical.mean)}` : ""
  ].filter(Boolean).join("; ");
  return (
    <g className="node-distribution-plot" transform={`translate(${NODE_DISTRIBUTION_PLOT_X} ${NODE_DISTRIBUTION_PLOT_Y})`} aria-hidden="true">
      <title>{title}</title>
      <rect className="distribution-backdrop" x="-5" y="-5" width={width + 10} height={height + 10} rx="7" />
      <rect className="distribution-frame" x="0" y="0" width={width} height={height} rx="4" />
      {bins.map((count, index) => {
        const barWidth = width / bins.length;
        const barHeight = Math.max(1, (count / maxBin) * (height - 5));
        return (
          <rect
            className="distribution-empirical"
            key={index}
            x={index * barWidth + 0.8}
            y={height - 2 - barHeight}
            width={Math.max(1, barWidth - 1.4)}
            height={barHeight}
          />
        );
      })}
      {analyticPath && <path className="distribution-analytic" d={analyticPath} />}
    </g>
  );
}

function BinaryNodeDistributionMiniPlot({ state }: { state: SimulatedNodeState }) {
  const probability = binaryProbabilityFromState(state);
  if (probability === null) return null;
  const width = NODE_DISTRIBUTION_PLOT_WIDTH;
  const height = NODE_DISTRIBUTION_PLOT_HEIGHT;
  const baseline = height - 7;
  const maxBarHeight = height - 11;
  const probabilities = [1 - probability, probability];
  const title = [
    `binary P(1)=${formatPercent(probability)}`,
    `empirical n=${state.empirical.samples.length}`,
    state.analytic ? `analytic ${analyticDistributionLabel(state.analytic)} (${state.analytic.note})` : ""
  ].filter(Boolean).join("; ");
  return (
    <g className="node-distribution-plot binary-node-distribution-plot" transform={`translate(${NODE_DISTRIBUTION_PLOT_X} ${NODE_DISTRIBUTION_PLOT_Y})`} aria-hidden="true">
      <title>{title}</title>
      <rect className="distribution-backdrop" x="-5" y="-5" width={width + 10} height={height + 10} rx="7" />
      <rect className="distribution-frame" x="0" y="0" width={width} height={height} rx="4" />
      <line className="distribution-binary-axis" x1="13" y1={baseline} x2={width - 13} y2={baseline} />
      {probabilities.map((p, index) => {
        const barHeight = Math.max(1, p * maxBarHeight);
        const x = index === 0 ? 25 : 59;
        return (
          <Fragment key={index}>
            <rect
              className={index === 1 ? "distribution-binary-bar positive" : "distribution-binary-bar"}
              x={x}
              y={baseline - barHeight}
              width="16"
              height={barHeight}
              rx="2"
            />
            <text className="distribution-binary-label" x={x + 8} y={height - 1}>{index}</text>
          </Fragment>
        );
      })}
    </g>
  );
}

function NodeDistributionAnnotation({ state, variable }: { state?: SimulatedNodeState; value?: number; variable: VariableModel }) {
  const lines = nodeDistributionAnnotationLines(state, variable);
  if (lines.length === 0) return null;
  const title = nodeDistributionFullSummary(state, variable);
  return (
    <g className="node-distribution-annotation" aria-hidden="true">
      <title>{title}</title>
      {lines.map((line, index) => (
        <text key={line} className={index === 0 ? "node-value" : "node-distribution-label"} y={NODE_DISTRIBUTION_ANNOTATION_Y + (index * 13)}>{line}</text>
      ))}
    </g>
  );
}

function ScatterplotPanel(props: {
  graph: GraphModel;
  simulation: SimulationResult;
  derived: SimulationDerivedCache;
  pair: ScatterPair;
  pending?: ResultPendingState;
  pendingLabel?: string;
  variant?: "default" | "demo";
  onPair: (pair: ScatterPair) => void;
  onSelectNode: (id: string) => void;
}) {
  const nodes = [...props.graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const pair = reconcileScatterPair(props.graph, props.pair);
  const roleOptions = scatterPairOptions(props.graph);
  const exposureOptionIds = new Set(roleOptions.exposures);
  const outcomeOptionIds = new Set(roleOptions.outcomes);
  const exposureOptions = nodes.filter((node) => exposureOptionIds.has(node.id));
  const outcomeOptions = nodes.filter((node) => outcomeOptionIds.has(node.id));
  const hasRolePairOptions = exposureOptions.length > 0 && outcomeOptions.length > 0;
  const xState = props.simulation.nodeStates[pair.x];
  const yState = props.simulation.nodeStates[pair.y];
  const pairSummary = pairDerivedSummary(props.derived, pair.x, pair.y);
  const points = pairSummary.points;
  const xDomain = pairSummary.xDomain;
  const yDomain = pairSummary.yDomain;
  const stats = pairSummary.stats;
  const width = 280;
  const height = 220;
  const scatterFrame = chartFrame({ width, height, x: { ticks: true, title: true }, y: { ticks: true, title: true }, xDomain, yDomain, insetX: 6, insetY: 6 });
  const scatterXTicks = niceTicks(xDomain[0], xDomain[1], 4);
  const scatterYTicks = niceTicks(yDomain[0], yDomain[1], 4);
  const maxWeight = Math.max(...points.map((point) => point.weight), 1);
  const xNode = props.graph.nodes.find((node) => node.id === pair.x);
  const yNode = props.graph.nodes.find((node) => node.id === pair.y);
  const xLabel = xNode ? nodeOutputLabel(xNode) : pair.x;
  const yLabel = yNode ? nodeOutputLabel(yNode) : pair.y;
  const xIsBinary = xNode !== undefined && normalizeVariableModel(xNode.variable).valueType === "binary";
  const yIsBinary = yNode !== undefined && normalizeVariableModel(yNode.variable).valueType === "binary";
  const binaryPair = xIsBinary && yIsBinary;
  const binaryContinuousPair = xIsBinary && !yIsBinary;
  const continuousBinaryPair = !xIsBinary && yIsBinary;
  // When a binary covariate is set to condition/adjust (roles.adjusted), stratify the
  // continuous-exposure risk curve by it instead of showing the single crude curve.
  const stratifyNode = props.graph.nodes.find((node) =>
    node.roles.adjusted && node.id !== pair.x && node.id !== pair.y && normalizeVariableModel(node.variable).valueType === "binary"
  );
  const stratifyOperation: "condition" | "adjust" | null = stratifyNode
    ? (normalizeVariableModel(stratifyNode.variable).adjustment.standardize ? "adjust" : "condition")
    : null;
  const stratifiedContrast = continuousBinaryPair && stratifyNode
    ? stratifyRiskCurves(props.simulation, pair.x, pair.y, stratifyNode.id, 7)
    : null;
  const relationPreposition = "by";
  const detailRows = pairwiseDetailRows({
    summary: pairSummary,
    xLabel,
    yLabel,
    binaryPair,
    binaryContinuousPair,
    effectiveSampleSize: props.simulation.conditioning.effectiveSampleSize
  });
  const toX = scatterFrame.xScale;
  const toY = scatterFrame.yScale;
  const regression = stats && Number.isFinite(stats.slope) && Number.isFinite(stats.intercept)
    ? {
      x1: xDomain[0],
      y1: stats.intercept + stats.slope * xDomain[0],
      x2: xDomain[1],
      y2: stats.intercept + stats.slope * xDomain[1]
    }
    : null;

  if (nodes.length < 2) return <p className="muted">Add at least two variables to compare simulated observations.</p>;
  const demoVariant = props.variant === "demo";

  return (
    <div className={demoVariant ? "scatterplot-panel demo-scatterplot" : "scatterplot-panel"} aria-busy={resultPendingActive(props.pending)}>
      {!demoVariant && <div className="pairwise-relation-header">
        {hasRolePairOptions ? (
          <div className="pairwise-relation-title" aria-label={`${yLabel} ${relationPreposition} ${xLabel}`}>
            <PairVariableSelect
              axis="y"
              nodes={outcomeOptions}
              value={pair.y}
              onChange={(y) => props.onPair({ ...pair, y })}
            />
            <span>{relationPreposition}</span>
            <PairVariableSelect
              axis="x"
              nodes={exposureOptions}
              value={pair.x}
              onChange={(x) => props.onPair({ ...pair, x })}
            />
          </div>
        ) : (
          <p className="pairwise-role-warning muted">Mark at least one exposure and one outcome to choose this output.</p>
        )}
        <details className="pairwise-info" onToggle={(event) => { if ((event.currentTarget as HTMLDetailsElement).open) trackInfoOverlayOpened("pairwise"); }}>
          <summary aria-label="Pairwise details" title="Pairwise details">i</summary>
          <div className="pairwise-info-card">
            {detailRows.map((row) => <span key={row}>{row}</span>)}
          </div>
        </details>
      </div>}
      <ResultsPendingNotice pending={props.pending} label={props.pendingLabel ?? "Updating pairwise output"} />

      {binaryPair ? (
        <BinaryPairView
          summary={pairSummary}
          xLabel={xLabel}
          yLabel={yLabel}
          effectiveSampleSize={props.simulation.conditioning.effectiveSampleSize}
          showStats={demoVariant}
        />
      ) : binaryContinuousPair ? (
        <BinaryContinuousPairView summary={pairSummary} xLabel={xLabel} yLabel={yLabel} showStats={demoVariant} />
      ) : continuousBinaryPair && stratifiedContrast && stratifyOperation ? (
        <StratifiedContrastView contrast={stratifiedContrast} operation={stratifyOperation} xLabel={xLabel} yLabel={yLabel} />
      ) : continuousBinaryPair ? (
        <ContinuousBinaryPairView summary={pairSummary} xLabel={xLabel} yLabel={yLabel} showStats={demoVariant} />
      ) : (
        <>
          <svg
            className="scatterplot-svg"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`Scatterplot of ${xLabel} and ${yLabel}`}
          >
            <rect className="scatter-plot-background" x={scatterFrame.plot.x} y={scatterFrame.plot.y} width={scatterFrame.plot.width} height={scatterFrame.plot.height} />
            <line className="scatter-axis" x1={scatterFrame.plot.x} y1={scatterFrame.plot.bottom} x2={scatterFrame.plot.right} y2={scatterFrame.plot.bottom} />
            <line className="scatter-axis" x1={scatterFrame.plot.x} y1={scatterFrame.plot.y} x2={scatterFrame.plot.x} y2={scatterFrame.plot.bottom} />
            {scatterYTicks.map((tick) => (
              <g key={`sy${tick}`}>
                <line className="scatter-grid" x1={scatterFrame.plot.x} x2={scatterFrame.plot.right} y1={toY(tick)} y2={toY(tick)} />
                <text className="scatter-tick-label end" x={scatterFrame.anchors.ticks.yX} y={toY(tick) + 4}>{formatValue(tick)}</text>
              </g>
            ))}
            {scatterXTicks.map((tick) => (
              <text key={`sx${tick}`} className="scatter-tick-label" x={toX(tick)} y={scatterFrame.anchors.ticks.xY} textAnchor="middle">{formatValue(tick)}</text>
            ))}
            <SvgAxisName className="scatter-axis-label x" label={xLabel} x={scatterFrame.plot.cx} y={scatterFrame.anchors.title.xY} maxChars={28} />
            <SvgAxisName className="scatter-axis-label y" label={yLabel} x={scatterFrame.anchors.title.yX} y={scatterFrame.plot.cy} transform={`rotate(-90 ${scatterFrame.anchors.title.yX} ${scatterFrame.plot.cy})`} maxChars={20} />
            {points.map((point) => {
              const normalizedWeight = Math.sqrt(Math.max(0, point.weight) / maxWeight);
              return (
                <circle
                  className="scatter-point"
                  key={point.index}
                  cx={toX(point.x)}
                  cy={toY(point.y)}
                  r={1.7 + normalizedWeight * 2.4}
                  style={{ opacity: 0.18 + normalizedWeight * 0.58 }}
                />
              );
            })}
            {regression && (
              <line
                className="scatter-regression"
                x1={toX(regression.x1)}
                y1={toY(regression.y1)}
                x2={toX(regression.x2)}
                y2={toY(regression.y2)}
              />
            )}
          </svg>

          {points.length === 0 ? (
            <p className="muted">No finite paired samples are available for this variable pair.</p>
          ) : demoVariant ? (
            <div className="scatter-stats">
              <span>samples {points.length}</span>
              <span>corr {stats?.correlation === null || stats?.correlation === undefined ? "n/a" : formatValue(stats.correlation)}</span>
              <span>x mean {stats ? formatValue(stats.meanX) : "n/a"}</span>
              <span>y mean {stats ? formatValue(stats.meanY) : "n/a"}</span>
              {props.simulation.conditioning.effectiveSampleSize !== null && <span>ESS {formatValue(props.simulation.conditioning.effectiveSampleSize)}</span>}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function PairVariableSelect(props: {
  axis: "x" | "y";
  nodes: GraphNode[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="pair-variable-select">
      <span className="screen-reader-only">{props.axis} variable</span>
      <select
        aria-label={`${props.axis} variable`}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.nodes.map((node) => <option value={node.id} key={node.id}>{displayNodeName(nodeOutputLabel(node))}</option>)}
      </select>
    </label>
  );
}

function pairwiseDetailRows(props: {
  summary: PairDerivedSummary;
  xLabel: string;
  yLabel: string;
  binaryPair: boolean;
  binaryContinuousPair: boolean;
  effectiveSampleSize: number | null;
}): string[] {
  const rows: string[] = [`samples ${props.summary.points.length}`];
  if (props.binaryPair) {
    const cells = props.summary.binaryCells;
    const totalWeight = cells.reduce((sum, cell) => sum + cell.weight, 0);
    const cell = (x: 0 | 1, y: 0 | 1) => cells.find((candidate) => candidate.x === x && candidate.y === y) ?? { x, y, weight: 0, count: 0, percent: 0, columnPercent: 0 };
    const yPositive = cell(1, 1).weight + cell(0, 1).weight;
    const xPositive = cell(1, 1).weight + cell(1, 0).weight;
    const contrast = props.summary.binaryContrast;
    rows.push(`${binaryShortLabel(props.yLabel)} at ${binaryAxisValueLabel(props.xLabel, 0)} ${contrast.yAtX0 === null ? "n/a" : formatPercent(contrast.yAtX0)}`);
    rows.push(`${binaryShortLabel(props.yLabel)} at ${binaryAxisValueLabel(props.xLabel, 1)} ${contrast.yAtX1 === null ? "n/a" : formatPercent(contrast.yAtX1)}`);
    rows.push(`risk diff ${contrast.diff === null ? "n/a" : formatPercentagePoints(contrast.diff)}`);
    if (totalWeight > 0) {
      rows.push(`${binaryAxisValueLabel(props.xLabel, 1)} share ${formatPercent(xPositive / totalWeight)}`);
      rows.push(`${binaryAxisValueLabel(props.yLabel, 1)} share ${formatPercent(yPositive / totalWeight)}`);
    }
  } else if (props.binaryContinuousPair) {
    const groups = props.summary.binaryContinuousGroups;
    const groupZero = groups[0];
    const groupOne = groups[1];
    const gap = groupZero?.mean !== null && groupZero?.mean !== undefined && groupOne?.mean !== null && groupOne?.mean !== undefined
      ? groupOne.mean - groupZero.mean
      : null;
    rows.push(`${binaryAxisValueLabel(props.xLabel, 1)} share ${groupOne ? formatPercent(groupOne.share) : "n/a"}`);
    rows.push(`${binaryAxisValueLabel(props.xLabel, 0)} mean ${groupZero?.mean === null || groupZero?.mean === undefined ? "n/a" : formatValue(groupZero.mean)}`);
    rows.push(`${binaryAxisValueLabel(props.xLabel, 1)} mean ${groupOne?.mean === null || groupOne?.mean === undefined ? "n/a" : formatValue(groupOne.mean)}`);
    rows.push(`${binaryAxisValueLabel(props.xLabel, 0)} n ${groupZero ? formatWeightedCount(groupZero.weight) : "0"}`);
    rows.push(`${binaryAxisValueLabel(props.xLabel, 1)} n ${groupOne ? formatWeightedCount(groupOne.weight) : "0"}`);
    rows.push(`difference 1-0 ${gap === null ? "n/a" : formatSignedValue(gap)}`);
  } else {
    const stats = props.summary.stats;
    rows.push(`corr ${stats?.correlation === null || stats?.correlation === undefined ? "n/a" : formatValue(stats.correlation)}`);
    rows.push(`${props.xLabel} mean ${stats ? formatValue(stats.meanX) : "n/a"}`);
    rows.push(`${props.yLabel} mean ${stats ? formatValue(stats.meanY) : "n/a"}`);
  }
  if (props.effectiveSampleSize !== null) rows.push(`ESS ${formatValue(props.effectiveSampleSize)}`);
  return rows;
}

function BinaryContinuousPairView(props: {
  summary: PairDerivedSummary;
  xLabel: string;
  yLabel: string;
  showStats?: boolean;
}) {
  const points = props.summary.points;
  const groups = props.summary.binaryContinuousGroups;
  const groupZero = groups[0];
  const groupOne = groups[1];
  const totalWeight = groups.reduce((sum, group) => sum + group.weight, 0);
  const gap = groupZero?.mean !== null && groupZero?.mean !== undefined && groupOne?.mean !== null && groupOne?.mean !== undefined
    ? groupOne.mean - groupZero.mean
    : null;
  const summaries = continuousOutcomeSummaries(points, props.xLabel);

  if (points.length === 0 || totalWeight <= 0) {
    return <p className="muted">No finite paired samples are available for this variable pair.</p>;
  }

  return (
    <div className="binary-continuous-pair-view">
      <CategoryOutcomePlot
        points={points}
        summaries={summaries}
        xLabel={props.xLabel}
        yLabel={props.yLabel}
        yDomain={categoryOutcomeDomain(props.summary.ySampleDomain, summaries, false)}
        outcomeKind="continuous"
      />

      {props.showStats !== false && <div className="scatter-stats binary-continuous-stats">
        <span>samples {points.length}</span>
        <span>x=1 share {groupOne ? formatPercent(groupOne.share) : "n/a"}</span>
        <span>x=0 mean {groupZero?.mean === null || groupZero?.mean === undefined ? "n/a" : formatValue(groupZero.mean)}</span>
        <span>x=1 mean {groupOne?.mean === null || groupOne?.mean === undefined ? "n/a" : formatValue(groupOne.mean)}</span>
        <span>x=0 n {groupZero ? formatWeightedCount(groupZero.weight) : "0"}</span>
        <span>x=1 n {groupOne ? formatWeightedCount(groupOne.weight) : "0"}</span>
        <span>difference 1-0 {gap === null ? "n/a" : formatSignedValue(gap)}</span>
      </div>}
    </div>
  );
}

function ContinuousBinaryPairView(props: {
  summary: PairDerivedSummary;
  xLabel: string;
  yLabel: string;
  showStats?: boolean;
}) {
  const points = props.summary.points;
  const bins = binnedBinaryRiskSummaries(points, 7);
  const totalWeight = points.reduce((sum, point) => sum + point.weight, 0);
  const successes = points.reduce((sum, point) => sum + coerceBinary(point.y) * point.weight, 0);
  const overall = totalWeight > 0 ? successes / totalWeight : null;
  const yPositiveLabel = binaryAxisValueLabel(props.yLabel, 1);
  const firstBin: RiskBin | undefined = bins[0];
  const lastBin: RiskBin | undefined = bins[bins.length - 1];
  const tailGap = firstBin && lastBin ? lastBin.mean - firstBin.mean : null;

  if (points.length === 0 || totalWeight <= 0 || bins.length === 0) {
    return <p className="muted">No finite paired samples are available for this variable pair.</p>;
  }

  return (
    <HighlightNames>
    <div className="continuous-binary-pair-view">
      <RiskCurvePlot bins={bins} xLabel={props.xLabel} yLabel={yPositiveLabel} />

      {props.showStats !== false && <div className="scatter-stats">
        <span>samples {points.length}</span>
        <span>{binaryShortLabel(props.yLabel)} overall {overall === null ? "n/a" : formatPercent(overall)}</span>
        <span>lowest band {firstBin ? formatPercent(firstBin.mean) : "n/a"}</span>
        <span>highest band {lastBin ? formatPercent(lastBin.mean) : "n/a"}</span>
        <span>bands {bins.length}</span>
        <span>top-bottom {tailGap === null ? "n/a" : formatPercentagePoints(tailGap)}</span>
      </div>}
    </div>
    </HighlightNames>
  );
}

function StratifiedContrastView(props: {
  contrast: StratifiedRiskContrast;
  operation: "condition" | "adjust";
  xLabel: string;
  yLabel: string;
}) {
  const { contrast, operation } = props;
  const yPositiveLabel = binaryAxisValueLabel(props.yLabel, 1);
  const panels: Array<{ label: string; detail?: string; bins: RiskBin[] }> = operation === "condition"
    ? [
        { label: "all (crude)", detail: `${formatPercent(contrast.crude.outcomeRate)} overall`, bins: contrast.crude.bins },
        ...contrast.strata.map((stratum) => ({
          label: stratum.label,
          detail: `${formatPercent(stratum.outcomeRate)} · ${formatPercent(stratum.share)} of population`,
          bins: stratum.bins
        }))
      ]
    : [
        { label: "all (crude)", detail: "unconditioned — the unbiased causal curve here", bins: contrast.crude.bins },
        { label: `standardized over ${contrast.conditioningId}`, detail: "backdoor-adjusted, re-weighted to the population", bins: contrast.standardized }
      ];
  if (panels.every((panel) => panel.bins.length === 0)) {
    return <p className="muted">No finite paired samples are available to stratify.</p>;
  }
  // One shared, cropped y-domain across panels: tight (no empty 0–50% band) yet
  // comparable, since every small-multiple uses the same axis.
  const rates = panels.flatMap((panel) => panel.bins.flatMap((bin) => [bin.mean, bin.lower, bin.upper]))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const sharedYDomain = rates.length > 0
    ? paddedDomain(Math.min(...rates), Math.max(...rates), { pad: 0.12, clampMin: 0, clampMax: 1 })
    : ([0, 1] as [number, number]);
  return (
    <HighlightNames>
    <div className="stratified-contrast-view">
      <div className="stratified-contrast-grid">
        {panels.map((panel) => (
          <div className="stratified-contrast-panel" key={panel.label}>
            <div className="stratified-contrast-label">
              <strong>{panel.label}</strong>
              {panel.detail && <span>{panel.detail}</span>}
            </div>
            <RiskCurvePlot bins={panel.bins} xLabel={props.xLabel} yLabel={yPositiveLabel} yDomain={sharedYDomain} compact />
          </div>
        ))}
      </div>
      <p className="stratified-contrast-note">
        {operation === "condition"
          ? `Conditioning on ${contrast.conditioningId}: each stratum is shown separately and not combined. Selecting only one is the bias — the strata disagree because it is a collider.`
          : `Adjusting for ${contrast.conditioningId}: the strata are standardized back to the population. Here that re-marginalizes toward the crude curve, so the danger of this collider is selection, not standardization.`}
      </p>
    </div>
    </HighlightNames>
  );
}

function BinaryPairView(props: {
  summary?: PairDerivedSummary;
  points?: ScatterPoint[];
  cells?: BinaryCell[];
  contrast?: BinaryOutcomeContrastSummary;
  xLabel: string;
  yLabel: string;
  effectiveSampleSize: number | null;
  showStats?: boolean;
}) {
  const points = props.summary?.points ?? props.points ?? [];
  const cells = props.summary?.binaryCells ?? props.cells ?? binaryCells(points);
  const totalWeight = cells.reduce((sum, cell) => sum + cell.weight, 0);
  const cell = (x: 0 | 1, y: 0 | 1) => cells.find((candidate) => candidate.x === x && candidate.y === y) ?? { x, y, weight: 0, count: 0, percent: 0, columnPercent: 0 };
  const yPositive = cell(1, 1).weight + cell(0, 1).weight;
  const xPositive = cell(1, 1).weight + cell(1, 0).weight;
  const contrast = props.summary?.binaryContrast ?? props.contrast ?? binaryOutcomeContrastFromCells(cells);
  const yPositiveLabel = binaryAxisValueLabel(props.yLabel, 1);
  const xZeroLabel = binaryAxisValueLabel(props.xLabel, 0);
  const xOneLabel = binaryAxisValueLabel(props.xLabel, 1);
  const xZeroRate = contrast.yAtX0 === null ? "n/a" : formatPercent(contrast.yAtX0);
  const xOneRate = contrast.yAtX1 === null ? "n/a" : formatPercent(contrast.yAtX1);
  const summaries = binaryOutcomeSummaries(points, props.xLabel);

  if (points.length === 0 || totalWeight <= 0) {
    return <p className="muted">No finite paired samples are available for this variable pair.</p>;
  }

  return (
    <div className="binary-pair-view">
      <CategoryOutcomePlot
        points={points}
        summaries={summaries}
        xLabel={props.xLabel}
        yLabel={yPositiveLabel}
        yDomain={[0, 1]}
        outcomeKind="binary"
      />

      {props.showStats !== false && <div className="scatter-stats">
        <span>samples {points.length}</span>
        <span>{binaryShortLabel(props.yLabel)} at {xZeroLabel} {xZeroRate}</span>
        <span>{binaryShortLabel(props.yLabel)} at {xOneLabel} {xOneRate}</span>
        <span>risk diff {contrast.diff === null ? "n/a" : formatPercentagePoints(contrast.diff)}</span>
        <span>{xOneLabel} share {formatPercent(xPositive / totalWeight)}</span>
        <span>{yPositiveLabel} share {formatPercent(yPositive / totalWeight)}</span>
        {props.effectiveSampleSize !== null && <span>ESS {formatValue(props.effectiveSampleSize)}</span>}
      </div>}
    </div>
  );
}

function ScenarioPanel(props: {
  document: GraphDocument;
  simulation: SimulationResult;
  pending: boolean;
  onResample: () => void;
  onClearOverrides: () => void;
  onClearSelections: () => void;
}) {
  const blocked = simulationBlocked(props.simulation);
  const overrides = Object.entries(props.document.simulation.overrides);
  const selections = Object.keys(props.document.simulation.selections ?? {});
  const activeSampleConditions = props.simulation.conditioning.activeConditions;
  const hasActiveScenario = overrides.length > 0 || activeSampleConditions.length > 0;
  return (
    <div className="simulation-panel">
      <div className="scenario-current-state" aria-label="Current analysis scenario">
        {hasActiveScenario ? (
          <>
            {overrides.length > 0 && (
              <div className="scenario-state-card">
                <strong>Fixed values</strong>
                <div className="scenario-state-list">
                  {overrides.map(([id, value]) => {
                    const node = findNode(props.document.graph, id);
                    return <span className="scenario-pill" key={id}>do({node ? shortNodeLabel(node) : id}={formatValue(value)})</span>;
                  })}
                </div>
              </div>
            )}
            {activeSampleConditions.length > 0 && (
              <div className="scenario-state-card">
                <strong>Analysis sample</strong>
                <div className="scenario-state-list">
                  {activeSampleConditions.map((condition) => <span className="scenario-pill" key={condition}>{condition}</span>)}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="scenario-empty-state">
            <strong>Baseline analysis</strong>
            <span>No fixed values or sample filters are active.</span>
          </div>
        )}
      </div>
      <div className="scenario-utility-row">
        <div className="simulation-status" aria-busy={props.pending}>
          <span className={blocked ? "status-dot blocked" : "status-dot active"} />
          <span>{blocked ? "simulation blocked" : "live propagation"}</span>
          <PendingChip pending={props.pending} />
        </div>
        <button type="button" onClick={props.onResample}><RefreshCw size={15} /> resample draws</button>
        {overrides.length > 0 && <button type="button" onClick={props.onClearOverrides}>clear fixed values</button>}
        {selections.length > 0 && <button type="button" onClick={props.onClearSelections}>clear conditions</button>}
      </div>
    </div>
  );
}

function AnalysisSampleBanner(props: {
  simulation: SimulationResult;
  pending: boolean;
  onClearSelections: () => void;
}) {
  const conditioning = props.simulation.conditioning;
  if (conditioning.activeConditions.length === 0) return null;
  return (
    <HighlightNames>
    <div className="analysis-sample-banner" role="status" aria-label="Analysis sample" aria-busy={props.pending}>
      <strong>Analysis sample</strong>
      {props.pending && <PendingChip pending label="updating sample" />}
      {conditioning.activeConditions.map((condition) => (
        <span className="analysis-sample-chip" key={condition}>{condition}</span>
      ))}
      <span>method {inferenceModeLabel(conditioning.primaryMethod)}</span>
      <span>samples {conditioning.acceptedSamples} / {conditioning.totalSamples}</span>
      {conditioning.effectiveSampleSize !== null && <span>ESS {formatValue(conditioning.effectiveSampleSize)}</span>}
      <button type="button" onClick={props.onClearSelections}>clear conditions</button>
    </div>
    </HighlightNames>
  );
}

function BasicExampleTabs(props: { activeExampleId: string | null; onSelect: (id: string) => void }) {
  const examples = FRONTLINE_EXAMPLE_IDS
    .map((id) => EXAMPLES.find((example) => example.id === id))
    .filter((example): example is typeof EXAMPLES[number] => example !== undefined);
  return (
    <div className="basic-example-tabs" aria-label="Start here">
      {examples.map((example, index) => (
        <button
          type="button"
          className={example.id === props.activeExampleId ? "active" : ""}
          onClick={() => props.onSelect(example.id)}
          key={example.id}
        >
          <span>{index + 1}</span>
          <strong>{example.id === "simpson-severity" ? "Simpson" : "Tutoring"}</strong>
        </button>
      ))}
    </div>
  );
}

function DemoResultPanel(props: {
  graph: GraphModel;
  simulation: SimulationResult;
  derived: SimulationDerivedCache;
  pair: ScatterPair;
  summary: BasicRelationSummary | null;
  context: BasicDemoContext;
  pending?: ResultPendingState;
  moduleId: string | null;
  computedOutput: ComputedCompletedOutput | null;
  binaryOutput: BinaryAdjustmentOutput | null;
  unified?: { comparison: GMethodsComparison; outcomeScale: "risk" | "mean"; outcomeUnit: string; points?: ScatterPoint[]; treatmentId?: string } | null;
  recommendedAdjustmentId: string | null;
  onPair: (pair: ScatterPair) => void;
  onSelectNode: (id: string) => void;
  onAdjustRecommended: (id: string) => void;
  onClearOverrides: () => void;
  onClearSelections: () => void;
}) {
  const hasContext = props.context.interventions.length > 0 || props.context.selections.length > 0;
  const recommendedNode = props.recommendedAdjustmentId ? findNode(props.graph, props.recommendedAdjustmentId) : undefined;
  const adjustedActive = props.graph.nodes.some((node) => node.roles.adjusted);
  const showAdjustmentReveal = adjustedActive && (
    props.computedOutput !== null ||
    props.unified != null ||
    (props.binaryOutput !== null && shouldRenderBinaryAdjustmentOutput(props.binaryOutput))
  );

  if (!props.summary) {
    return (
      <section className="demo-result-panel empty" aria-label="Demo result" aria-busy={resultPendingActive(props.pending)}>
        <div className="demo-result-heading">
          <div>
            <span>Result</span>
            <strong>Pick exposure and outcome</strong>
          </div>
          <PendingChip pending={resultPendingActive(props.pending)} />
        </div>
        {hasContext && <BasicDemoContextBar context={props.context} onClearOverrides={props.onClearOverrides} onClearSelections={props.onClearSelections} />}
        <p className="demo-result-note">The main comparison will appear here once the graph has exposure and outcome roles.</p>
      </section>
    );
  }

  const summary = props.summary;
  const status = relationChangeLabel(summary.observed.numericValue, summary.comparison?.numericValue ?? null);
  const ledgerRows = summary.ledgerRows && summary.ledgerRows.length > 0 ? summary.ledgerRows : fallbackLedgerRows(summary);
  const canRecommendAdjustment = recommendedNode !== undefined && !recommendedNode.roles.adjusted;
  const heading = demoResultHeading(summary, adjustedActive, props.context);

  return (
    <section className="demo-result-panel" aria-label="Demo result" aria-busy={resultPendingActive(props.pending)}>
      <div className="demo-result-heading">
        <div>
          <span>{summary.relationLabel}</span>
          <strong>{heading}</strong>
        </div>
        <div className={status === "sign flip" ? "module-badge active punchline-flip" : "module-badge active"}>{status}</div>
      </div>

      {hasContext && <BasicDemoContextBar context={props.context} onClearOverrides={props.onClearOverrides} onClearSelections={props.onClearSelections} />}

      <ScatterplotPanel
        graph={props.graph}
        simulation={props.simulation}
        derived={props.derived}
        pair={props.pair}
        pending={props.pending}
        pendingLabel="Updating result"
        variant="demo"
        onPair={props.onPair}
        onSelectNode={props.onSelectNode}
      />

      {canRecommendAdjustment && (
        <button type="button" className="demo-primary-action" onClick={() => props.onAdjustRecommended(recommendedNode.id)}>
          Adjust for {shortNodeLabel(recommendedNode)}
        </button>
      )}

      {showAdjustmentReveal && (
        <div className="demo-after-visual" aria-label="After adjustment visual">
          <AdjustedOutputPanel
            moduleId={props.moduleId}
            computedOutput={props.computedOutput}
            binaryOutput={props.binaryOutput}
            continuousOutput={null}
            unified={props.unified}
            pending={props.pending}
            hideOracle
          />
        </div>
      )}

      <details className="demo-result-explanation">
        <summary>What changed?</summary>
        {summary.comparison && <BasicComparisonLedgerPlot rows={ledgerRows} />}
        <BasicComparisonLedger rows={ledgerRows} />
        <p>{summary.note}</p>
      </details>
    </section>
  );
}

function demoResultHeading(summary: BasicRelationSummary, adjustedActive: boolean, context: BasicDemoContext): string {
  if (context.interventions.length > 0) return "Intervention";
  if (context.selections.length > 0) return "Selected sample";
  if (adjustedActive) return "Adjusted comparison";
  if (summary.comparison) return "Comparison";
  return "Raw comparison";
}

function BasicDemoContextBar(props: {
  context: BasicDemoContext;
  onClearOverrides: () => void;
  onClearSelections: () => void;
}) {
  return (
    <div className="basic-demo-context-bar" aria-label="Active demo state">
      {props.context.interventions.length > 0 && (
        <div className="basic-demo-context-group">
          <span>intervention</span>
          {props.context.interventions.map((label) => <strong key={label}>{label}</strong>)}
          <button type="button" onClick={props.onClearOverrides}>clear</button>
        </div>
      )}
      {props.context.selections.length > 0 && (
        <div className="basic-demo-context-group">
          <span>selected sample</span>
          {props.context.selections.map((label) => <strong key={label}>{label}</strong>)}
          <button type="button" onClick={props.onClearSelections}>clear</button>
        </div>
      )}
    </div>
  );
}

function BasicComparisonLedger(props: { rows: BasicComparisonLedgerRow[] }) {
  if (props.rows.length === 0) return null;
  return (
    <div className="comparison-ledger" aria-label="Comparison states">
      <div className="module-card-header">
        <strong>Comparison states</strong>
        <span>same exposure/outcome contrast</span>
      </div>
      <div className="comparison-ledger-rows">
        {props.rows.map((row) => (
          <div className={`comparison-ledger-row ${row.status}`} key={row.id}>
            <div>
              <strong>{row.label}</strong>
              <span>{row.sample}</span>
            </div>
            <div>
              <span>{row.adjustment}</span>
              <small>{row.method}</small>
            </div>
            <strong className={metricTone(row.metric.numericValue)}>{row.metric.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function BasicComparisonLedgerPlot(props: { rows: BasicComparisonLedgerRow[] }) {
  const rows = props.rows.filter((row) => row.metric.numericValue !== null);
  if (rows.length < 2) return null;
  const width = 320;
  const rowGap = 24;
  const height = 42 + rows.length * rowGap;
  const plot = { left: 104, right: 24, top: 17 };
  const values = rows.map((row) => row.metric.numericValue).filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  const maxAbs = Math.max(0.1, ...values.map((value) => Math.abs(value)));
  const domain = maxAbs * 1.18;
  const x = (value: number) => plot.left + ((value + domain) / (2 * domain)) * (width - plot.left - plot.right);
  const axisFormatter = rows.some((row) => row.metric.value.includes("pp")) ? formatPercentagePoints : formatSignedValue;
  return (
    <svg className="huh-shift-plot basic comparison-ledger-plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Comparison states plotted on one axis">
      <line className="huh-shift-axis" x1={plot.left} y1={height - 18} x2={width - plot.right} y2={height - 18} />
      <line className="huh-shift-zero" x1={x(0)} y1="10" x2={x(0)} y2={height - 16} />
      <text className="huh-shift-axis-label" x={plot.left} y={height - 3}>{axisFormatter(-domain)}</text>
      <text className="huh-shift-axis-label end" x={width - plot.right} y={height - 3}>{axisFormatter(domain)}</text>
      {rows.map((row, index) => {
        const value = row.metric.numericValue ?? 0;
        const y = plot.top + index * rowGap;
        return (
          <g key={row.id}>
            <text className="huh-shift-row-label" x="8" y={y + 4}>{row.label}</text>
            <circle className={`huh-shift-dot ${row.status} ${metricTone(value)}`} cx={x(value)} cy={y} r="5" />
            <text className="huh-shift-value" x={Math.min(width - 8, x(value) + 9)} y={y + 4}>{row.metric.value}</text>
          </g>
        );
      })}
    </svg>
  );
}

function fallbackLedgerRows(summary: BasicRelationSummary): BasicComparisonLedgerRow[] {
  return [
    {
      id: "observed",
      label: "Observed",
      sample: "current sample",
      adjustment: "as displayed",
      method: "raw contrast",
      status: "raw",
      metric: summary.observed
    },
    ...(summary.comparison ? [{
      id: "comparison",
      label: "Comparison",
      sample: "reference state",
      adjustment: "as displayed",
      method: "comparison contrast",
      status: "adjusted" as const,
      metric: summary.comparison
    }] : [])
  ];
}

function ledgerRowsFromPunchline(
  context: OutputContext & { moduleId: string | null },
  punchline: BasicOutputPunchline
): BasicComparisonLedgerRow[] {
  return [
    rawLedgerRow(context, punchline.observed, "Observed sample"),
    {
      id: "module-comparison",
      label: punchline.comparison.label.toLowerCase().includes("do") ? "DGP do difference" : "Comparison",
      sample: punchline.comparison.label.toLowerCase().includes("do") ? "intervention world" : "reference state",
      adjustment: punchline.comparison.label.toLowerCase().includes("do") ? "DGP intervention" : "module comparison",
      method: punchline.comparison.label.toLowerCase().includes("do") ? "do simulation" : "example-specific estimator",
      status: punchline.comparison.label.toLowerCase().includes("do") ? "dgp" : "adjusted",
      metric: punchline.comparison
    }
  ];
}

function rawLedgerRow(
  context: OutputContext & { moduleId: string | null },
  metric: BasicOutputPunchlineMetric,
  sample: string
): BasicComparisonLedgerRow {
  return {
    id: `raw-${sample.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    label: sample,
    sample,
    adjustment: rawAdjustmentLabel(context),
    method: "raw association",
    status: "raw",
    metric
  };
}

function selectedLedgerRow(
  context: OutputContext & { moduleId: string | null },
  metric: BasicOutputPunchlineMetric
): BasicComparisonLedgerRow {
  return {
    id: "selected-sample",
    label: "Selected sample",
    sample: context.simulation.conditioning.activeConditions.join(", ") || "selected rows",
    adjustment: selectedAdjustmentLabel(context),
    method: "raw contrast within selected rows",
    status: "selected",
    metric
  };
}

function dgpLedgerRowFromCompletedOutput(
  context: OutputContext & { moduleId: string | null },
  completedOutput: ComputedCompletedOutput | null
): BasicComparisonLedgerRow | null {
  if (!completedOutput || completedOutput.moduleId !== context.moduleId) return null;
  const punchline = basicOutputPunchlineFromResult(context.moduleId, completedOutput.result);
  if (!punchline) return null;
  return {
    id: "dgp-do",
    label: "DGP do difference",
    sample: "intervention world",
    adjustment: "DGP intervention",
    method: "do simulation",
    status: "dgp",
    metric: punchline.comparison
  };
}

function rawAdjustmentLabel(context: OutputContext & { moduleId: string | null }): string {
  if (context.moduleId === "simpson-severity") return nodeAdjusted(context.document.graph, "Severity") ? "Adjusted for Severity" : "Raw relation";
  if (context.moduleId === "tutoring-scores") return nodeAdjusted(context.document.graph, "Academic_need") ? "Adjusted for Academic_need" : "Raw relation";
  const adjustedNames = context.document.graph.nodes.filter((node) => node.roles.adjusted).map(shortNodeLabel);
  return adjustedNames.length > 0 ? `Adjusted for ${adjustedNames.join(", ")}` : "Raw relation";
}

function selectedAdjustmentLabel(context: OutputContext & { moduleId: string | null }): string {
  const selectedIds = Object.keys(context.document.simulation.selections ?? {});
  if (context.moduleId === "tutoring-scores" && selectedIds.includes("Academic_need")) return "Academic_need fixed by sample filter";
  if (context.moduleId === "simpson-severity" && selectedIds.includes("Severity")) return "Severity fixed by sample filter";
  const selectedNames = selectedIds.map((id) => {
    const node = findNode(context.document.graph, id);
    return node ? shortNodeLabel(node) : id;
  });
  return selectedNames.length > 0 ? `Conditioned on ${selectedNames.join(", ")}` : "Sample filter";
}

function nodeAdjusted(graph: GraphModel, id: string): boolean {
  return graph.nodes.find((node) => node.id === id)?.roles.adjusted ?? false;
}

function basicDemoRecommendedAdjustmentId(moduleId: string | null, graph: GraphModel): string | null {
  const candidate = moduleId === "tutoring-scores"
    ? "Academic_need"
    : moduleId === "simpson-severity"
      ? "Severity"
      : null;
  if (!candidate) return null;
  return graph.nodes.some((node) => node.id === candidate) ? candidate : null;
}

function binnedOrStratifiedAdjustmentMetric(
  output: BinaryAdjustmentOutput,
  yLabel: string
): { metric: BasicOutputPunchlineMetric; method: string } | null {
  const usable = output.strata.filter((stratum) => stratum.contrast.diff !== null && stratum.weight > 0);
  const totalWeight = usable.reduce((sum, stratum) => sum + stratum.weight, 0);
  if (totalWeight <= 0) return null;
  const diff = usable.reduce((sum, stratum) => sum + (stratum.contrast.diff ?? 0) * stratum.weight, 0) / totalWeight;
  const binned = output.binnedAdjustedNodes.length > 0;
  const adjustmentDetail = binned
    ? output.binnedAdjustedNodes.map((item) => `${shortNodeLabel(item.node)} ${item.cutpoints.length + 1} bins`).join(", ")
    : output.binaryAdjustedNodes.map(shortNodeLabel).join(", ");
  return {
    metric: {
      label: binned ? "Binned adjusted difference" : "Stratified adjusted difference",
      value: formatPercentagePoints(diff),
      detail: `${yLabel} contrast averaged across ${adjustmentDetail}`,
      numericValue: diff
    },
    method: binned ? "binned standardization" : "stratified standardization"
  };
}

function computeBasicRelationSummary(
  context: OutputContext & { moduleId: string | null },
  completedOutput: ComputedCompletedOutput | null,
  derived: SimulationDerivedCache,
  binaryAdjustmentOutput: BinaryAdjustmentOutput | null,
  options: { hideOracle?: boolean } = {}
): BasicRelationSummary | null {
  const activeInterventionSummary = computeInterventionRelationSummary(context);
  if (activeInterventionSummary) return activeInterventionSummary;
  const activeSelectionSummary = computeSelectionRelationSummary(context, derived, completedOutput, options);
  if (activeSelectionSummary) return activeSelectionSummary;
  const activeAdjustmentSummary = computeAdjustmentRelationSummary(context, completedOutput, derived, binaryAdjustmentOutput, options);
  if (activeAdjustmentSummary) return activeAdjustmentSummary;
  const modulePunchline = completedOutput?.moduleId === context.moduleId
    ? basicOutputPunchlineFromResult(context.moduleId, completedOutput.result)
    : null;
  const relationLabel = basicRelationLabel(context.document.graph);
  if (modulePunchline && shouldShowModulePunchlineBeforeUserFix(context.moduleId)) {
    return {
      relationLabel,
      observed: modulePunchline.observed,
      comparison: modulePunchline.comparison,
      ledgerRows: ledgerRowsFromPunchline(context, modulePunchline),
      note: modulePunchline.note
    };
  }
  const observed = computeObservedRelationSummary(context.document.graph, context.simulation, derived);
  return observed ? {
    ...observed,
    ledgerRows: [rawLedgerRow(context, observed.observed, "Full sample")]
  } : null;
}

function shouldShowModulePunchlineBeforeUserFix(moduleId: string | null): boolean {
  return moduleId !== "simpson-severity" && moduleId !== "tutoring-scores";
}

function computeAdjustmentRelationSummary(
  context: OutputContext & { moduleId: string | null },
  completedOutput: ComputedCompletedOutput | null,
  derived: SimulationDerivedCache,
  binaryAdjustmentOutput: BinaryAdjustmentOutput | null,
  options: { hideOracle?: boolean } = {}
): BasicRelationSummary | null {
  if (context.moduleId === "simpson-severity") {
    const ipw = binaryAdjustmentOutput?.stabilizedIpw;
    const rawInterval = binaryAdjustmentOutput ? weightedMeanDifferenceInterval(binaryAdjustmentOutput.rawPoints) : null;
    const xLabel = binaryAdjustmentOutput?.exposure ? shortNodeLabel(binaryAdjustmentOutput.exposure) : "exposure";
    const yLabel = binaryAdjustmentOutput?.outcome ? shortNodeLabel(binaryAdjustmentOutput.outcome) : "outcome";
    const rawDiff = ipw?.rawDiff ?? binaryAdjustmentOutput?.rawContrast.diff ?? null;
    if (rawDiff === null) return null;
    const rawTreated = ipw?.rawTreated ?? binaryAdjustmentOutput?.rawContrast.yAtX1 ?? null;
    const rawUntreated = ipw?.rawUntreated ?? binaryAdjustmentOutput?.rawContrast.yAtX0 ?? null;
    const adjusted = ipw && ipw.weightedDiff !== null
      ? {
          metric: {
            label: ipw.clippedCount > 0 ? "Clipped IPW difference" : "Stabilized IPW difference",
            value: formatPercentagePoints(ipw.weightedDiff),
            detail: `weighted ${yLabel} ${ipw.weightedTreated === null ? "n/a" : formatPercent(ipw.weightedTreated)} vs ${ipw.weightedUntreated === null ? "n/a" : formatPercent(ipw.weightedUntreated)}`,
            numericValue: ipw.weightedDiff,
            lower: weightedMeanDifferenceInterval(ipw.weightedPoints)?.lower,
            upper: weightedMeanDifferenceInterval(ipw.weightedPoints)?.upper
          },
          method: ipw.clippedCount > 0 ? "stabilized IPW, clipped propensities" : "stabilized IPW"
        }
      : binaryAdjustmentOutput && binaryAdjustmentOutput.strata.length > 0
        ? binnedOrStratifiedAdjustmentMetric(binaryAdjustmentOutput, yLabel)
        : null;
    if (!adjusted) return null;
    const rawMetric: BasicOutputPunchlineMetric = {
      label: "Observed association",
      value: formatPercentagePoints(rawDiff),
      detail: `${yLabel} at ${xLabel}=1 ${rawTreated === null ? "n/a" : formatPercent(rawTreated)} vs ${rawUntreated === null ? "n/a" : formatPercent(rawUntreated)}`,
      numericValue: rawDiff,
      lower: rawInterval?.lower,
      upper: rawInterval?.upper
    };
    const dgpRow = options.hideOracle ? null : dgpLedgerRowFromCompletedOutput(context, completedOutput);
    return {
      relationLabel: basicRelationLabel(context.document.graph),
      observed: rawMetric,
      comparison: adjusted.metric,
      ledgerRows: [
        rawLedgerRow(context, rawMetric, "Full sample"),
        {
          id: "adjusted",
          label: "Adjusted estimate",
          sample: "Full sample",
          adjustment: "Severity adjusted",
          method: adjusted.method,
          status: "adjusted",
          metric: adjusted.metric
        },
        ...(dgpRow ? [dgpRow] : [])
      ],
      note: options.hideOracle
        ? "Severity is now marked adjust for. The displayed association changes from the raw treatment comparison to the stabilized-IPW adjusted comparison."
        : "Severity is now marked adjust for. The displayed association changes from the raw treatment comparison to a model-based adjusted comparison; open Results for the DGP do difference and diagnostics."
    };
  }

  if (context.moduleId === "tutoring-scores" && isTutoringCompletedResult(completedOutput?.result)) {
    const output = completedOutput.result;
    if (!output.academicNeedAdjusted || output.adjustedPairGap === null) return null;
    const pair = defaultScatterPair(context.document.graph);
    const rawInterval = weightedMeanDifferenceInterval(pairDerivedSummary(derived, pair.x, pair.y).points);
    const rawMetric: BasicOutputPunchlineMetric = {
      label: "Observed score difference",
      value: formatSignedValue(output.crudeGap),
      detail: `tutored ${formatValue(output.crudeTutoredScore)} vs untutored ${formatValue(output.crudeUntutoredScore)}`,
      numericValue: output.crudeGap,
      lower: rawInterval?.lower,
      upper: rawInterval?.upper
    };
    const adjustedMetric: BasicOutputPunchlineMetric = {
      label: "Stratified adjusted difference",
      value: formatSignedValue(output.adjustedPairGap),
      detail: "weighted within Academic_need strata",
      numericValue: output.adjustedPairGap
    };
    const dgpRow = options.hideOracle ? null : dgpLedgerRowFromCompletedOutput(context, completedOutput);
    return {
      relationLabel: basicRelationLabel(context.document.graph),
      observed: rawMetric,
      comparison: adjustedMetric,
      ledgerRows: [
        rawLedgerRow(context, rawMetric, "Full sample"),
        {
          id: "adjusted",
          label: "Adjusted estimate",
          sample: "Full sample",
          adjustment: "Adjusted for Academic_need",
          method: "stratified standardization",
          status: "adjusted",
          metric: adjustedMetric
        },
        ...(dgpRow ? [dgpRow] : [])
      ],
      note: "Academic_need is now marked adjust for. The adjusted estimate compares tutored and untutored students within comparable need groups instead of mixing the groups together."
    };
  }

  return null;
}

function computeInterventionRelationSummary(context: OutputContext & { moduleId: string | null }): BasicRelationSummary | null {
  const overrideEntries = Object.entries(context.document.simulation.overrides ?? {});
  if (overrideEntries.length === 0) return null;
  const graph = context.document.graph;
  const pair = defaultScatterPair(graph);
  const outcomeNode = graph.nodes.find((node) => node.roles.outcome) ?? graph.nodes.find((node) => node.id === pair.y);
  if (!outcomeNode) return null;
  const outcomeState = context.simulation.nodeStates[outcomeNode.id];
  const currentMean = outcomeState?.empirical.mean;
  if (currentMean === null || currentMean === undefined) return null;
  const baselineSimulation = runSimulation(graph, { ...context.document.simulation, overrides: {}, selections: {} });
  const baselineMean = baselineSimulation.nodeStates[outcomeNode.id]?.empirical.mean;
  if (baselineMean === null || baselineMean === undefined) return null;
  const diff = currentMean - baselineMean;
  const outcomeLabel = shortNodeLabel(outcomeNode);
  const interventionLabels = formatActiveInterventions(context.document);
  const outcomeValue = formatOutcomeMean(outcomeNode, outcomeState, currentMean);
  const baselineValue = formatOutcomeMean(outcomeNode, baselineSimulation.nodeStates[outcomeNode.id], baselineMean);
  const interventionMetric: BasicOutputPunchlineMetric = {
    label: "Intervention result",
    value: outcomeValue,
    detail: `${outcomeLabel} under ${interventionLabels.join(", ")}`,
    numericValue: currentMean
  };
  const changeMetric: BasicOutputPunchlineMetric = {
    label: "Change from baseline",
    value: formatOutcomeDifference(outcomeNode, diff),
    detail: `baseline ${outcomeLabel} ${baselineValue}`,
    numericValue: diff
  };
  return {
    relationLabel: basicRelationLabel(graph),
    observed: interventionMetric,
    comparison: changeMetric,
    ledgerRows: [
      {
        id: "intervention-result",
        label: "Intervention world",
        sample: interventionLabels.join(", "),
        adjustment: "do operator",
        method: "hard intervention",
        status: "intervention",
        metric: interventionMetric
      },
      {
        id: "intervention-change",
        label: "Change",
        sample: "vs baseline simulation",
        adjustment: "baseline held by DGP",
        method: "difference from no intervention",
        status: "dgp",
        metric: changeMetric
      }
    ],
    note: `The graph is now answering an intervention question: what changes downstream after ${interventionLabels.join(", ")}. Clear the intervention to return to the observed association.`
  };
}

function computeSelectionRelationSummary(
  context: OutputContext & { moduleId: string | null },
  derived: SimulationDerivedCache,
  completedOutput: ComputedCompletedOutput | null,
  options: { hideOracle?: boolean } = {}
): BasicRelationSummary | null {
  if (context.simulation.conditioning.activeConditions.length === 0) return null;
  const current = computeObservedRelationSummary(context.document.graph, context.simulation, derived);
  if (!current) return null;
  const baselineSimulation = runSimulation(context.document.graph, { ...context.document.simulation, overrides: {}, selections: {} });
  const baseline = computeObservedRelationSummary(context.document.graph, baselineSimulation, buildSimulationDerivedCache(baselineSimulation));
  const selectedMetric: BasicOutputPunchlineMetric = {
    ...current.observed,
    label: "Selected sample"
  };
  const fullMetric = baseline ? {
    ...baseline.observed,
    label: "Full sample"
  } : null;
  const dgpRow = options.hideOracle ? null : dgpLedgerRowFromCompletedOutput(context, completedOutput);
  return {
    relationLabel: current.relationLabel,
    observed: selectedMetric,
    comparison: fullMetric,
    ledgerRows: [
      ...(fullMetric ? [rawLedgerRow(context, fullMetric, "Full sample")] : []),
      selectedLedgerRow(context, selectedMetric),
      ...(dgpRow ? [dgpRow] : [])
    ],
    note: `The sample filter changed the rows in the analysis sample: ${context.simulation.conditioning.activeConditions.join(", ")}. The DAG is unchanged; the displayed association is now conditional on that filter.`
  };
}

function basicRelationLabel(graph: GraphModel): string {
  const exposure = graph.nodes.find((node) => node.roles.exposure);
  const outcome = graph.nodes.find((node) => node.roles.outcome);
  if (exposure && outcome) return `${shortNodeLabel(exposure)} -> ${shortNodeLabel(outcome)}`;
  const pair = defaultScatterPair(graph);
  const xNode = graph.nodes.find((node) => node.id === pair.x);
  const yNode = graph.nodes.find((node) => node.id === pair.y);
  if (xNode && yNode) return `${shortNodeLabel(xNode)} -> ${shortNodeLabel(yNode)}`;
  return "Exposure -> outcome";
}

function formatActiveInterventions(document: GraphDocument): string[] {
  return Object.entries(document.simulation.overrides ?? {}).map(([id, value]) => {
    const node = findNode(document.graph, id);
    return `do(${node ? shortNodeLabel(node) : id}=${formatValue(value)})`;
  });
}

function formatOutcomeMean(node: GraphNode, state: SimulatedNodeState | undefined, value: number): string {
  return isBinaryGraphNode(node, state) ? formatPercent(value) : formatValue(value);
}

function formatOutcomeDifference(node: GraphNode, value: number): string {
  return normalizeVariableModel(node.variable).valueType === "binary" ? formatPercentagePoints(value) : formatSignedValue(value);
}

function computeObservedRelationSummary(graph: GraphModel, simulation: SimulationResult, derived: SimulationDerivedCache): BasicRelationSummary | null {
  const pair = defaultScatterPair(graph);
  const xNode = graph.nodes.find((node) => node.id === pair.x);
  const yNode = graph.nodes.find((node) => node.id === pair.y);
  if (!xNode || !yNode) return null;
  const xState = simulation.nodeStates[pair.x];
  const yState = simulation.nodeStates[pair.y];
  const pairSummary = pairDerivedSummary(derived, pair.x, pair.y);
  const points = pairSummary.points;
  if (points.length === 0) return null;
  const xLabel = shortNodeLabel(xNode);
  const yLabel = shortNodeLabel(yNode);
  const xIsBinary = isBinaryGraphNode(xNode, xState);
  const yIsBinary = isBinaryGraphNode(yNode, yState);
  const sampleLabel = simulation.conditioning.activeConditions.length > 0 ? "current analysis sample" : "simulated sample";
  if (xIsBinary && yIsBinary) {
    const contrast = pairSummary.binaryContrast;
    if (contrast.diff === null) return null;
    const interval = weightedMeanDifferenceInterval(points);
    return {
      relationLabel: `${xLabel} -> ${yLabel}`,
      observed: {
        label: "Observed risk diff",
        value: formatPercentagePoints(contrast.diff),
        detail: `${yLabel} at ${xLabel}=1 ${contrast.yAtX1 === null ? "n/a" : formatPercent(contrast.yAtX1)} vs ${contrast.yAtX0 === null ? "n/a" : formatPercent(contrast.yAtX0)}`,
        numericValue: contrast.diff,
        lower: interval?.lower,
        upper: interval?.upper
      },
      comparison: null,
      note: `This is the raw exposure/outcome relation in the ${sampleLabel}. Add adjustment, a sample filter, or an intervention to see whether the causal read changes.`
    };
  }
  if (xIsBinary && !yIsBinary) {
    const groups = pairSummary.binaryContinuousGroups;
    const groupZero = groups[0];
    const groupOne = groups[1];
    const groupZeroMean = groupZero?.mean;
    const groupOneMean = groupOne?.mean;
    if (groupZeroMean === null || groupZeroMean === undefined || groupOneMean === null || groupOneMean === undefined) return null;
    const gap = groupOneMean - groupZeroMean;
    const interval = weightedMeanDifferenceInterval(points);
    return {
      relationLabel: `${xLabel} -> ${yLabel}`,
      observed: {
        label: "Observed mean difference",
        value: formatSignedValue(gap),
        detail: `${xLabel}=1 mean ${formatValue(groupOneMean)} vs ${xLabel}=0 mean ${formatValue(groupZeroMean)}`,
        numericValue: gap,
        lower: interval?.lower,
        upper: interval?.upper
      },
      comparison: null,
      note: `This is the raw exposure/outcome relation in the ${sampleLabel}. Open Results for the plot and mark covariates when this is not the causal comparison.`
    };
  }
  const stats = pairSummary.stats;
  if (!stats || stats.correlation === null) return null;
  return {
    relationLabel: `${xLabel} -> ${yLabel}`,
    observed: {
      label: "Observed correlation",
      value: formatSignedValue(stats.correlation),
      detail: `slope ${formatSignedValue(stats.slope)} across ${points.length} samples`,
      numericValue: stats.correlation
    },
    comparison: null,
    note: `This is the raw relation in the ${sampleLabel}. It is a descriptive correlation until the graph says what adjustment, sample filtering, or intervention means.`
  };
}

function relationChangeLabel(observed: number | null, comparison: number | null): string {
  if (comparison === null) return "observed";
  const observedSign = signForPunchline(observed);
  const comparisonSign = signForPunchline(comparison);
  if (observedSign !== 0 && comparisonSign !== 0 && observedSign !== comparisonSign) return "sign flip";
  if (observed !== null && Math.abs(observed - comparison) >= 0.05) return "changes";
  return "same sign";
}

function signForPunchline(value: number | null): -1 | 0 | 1 {
  if (value === null || Math.abs(value) < 0.005) return 0;
  return value < 0 ? -1 : 1;
}

function isTutoringCompletedResult(value: unknown): value is {
  crudeTutoredScore: number;
  crudeUntutoredScore: number;
  crudeGap: number;
  academicNeedAdjusted: boolean;
  adjustedPairGap: number | null;
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.crudeTutoredScore === "number" &&
    typeof candidate.crudeUntutoredScore === "number" &&
    typeof candidate.crudeGap === "number" &&
    typeof candidate.academicNeedAdjusted === "boolean" &&
    (typeof candidate.adjustedPairGap === "number" || candidate.adjustedPairGap === null)
  );
}

function weightedMeanDifferenceInterval(points: ScatterPoint[]): { lower: number; upper: number } | null {
  const group0 = weightedPointMoments(points, 0);
  const group1 = weightedPointMoments(points, 1);
  if (!group0 || !group1 || group0.nEff <= 1 || group1.nEff <= 1) return null;
  const diff = group1.mean - group0.mean;
  const se = Math.sqrt(group1.variance / group1.nEff + group0.variance / group0.nEff);
  if (!Number.isFinite(se)) return null;
  return {
    lower: diff - 1.96 * se,
    upper: diff + 1.96 * se
  };
}

function metricTone(value: number | null): "negative" | "neutral" | "positive" {
  const sign = signForPunchline(value);
  if (sign < 0) return "negative";
  if (sign > 0) return "positive";
  return "neutral";
}

function resultPendingActive(pending?: ResultPendingState): boolean {
  return Boolean(pending?.analysis || pending?.simulation);
}

function resultPendingShortLabel(pending?: ResultPendingState): string {
  if (pending?.analysis && pending.simulation) return "updating model";
  if (pending?.analysis) return "updating paths";
  if (pending?.simulation) return "updating sample";
  return "updating";
}

function resultPendingDetail(pending?: ResultPendingState): string {
  if (pending?.analysis && pending.simulation) return "Graph paths and simulated data are recalculating.";
  if (pending?.analysis) return "Graph paths are recalculating.";
  if (pending?.simulation) return "Simulated data are recalculating.";
  return "Displayed values will refresh shortly.";
}

function PendingChip({ pending, label }: { pending: boolean; label?: string }) {
  if (!pending) return null;
  return (
    <span className="pending-chip">
      <span className="pending-spinner" aria-hidden="true" />
      {label ?? "updating"}
    </span>
  );
}

function ResultsPendingNotice({ pending, label }: { pending?: ResultPendingState; label: string }) {
  if (!resultPendingActive(pending)) return null;
  return (
    <div className="results-pending-notice" role="status">
      <span className="pending-spinner" aria-hidden="true" />
      <span className="results-pending-copy">
        <strong>{label}</strong>
        <span>{resultPendingDetail(pending)}</span>
      </span>
    </div>
  );
}

function shortNodeLabel(node: GraphNode): string {
  return abbreviateLabel(node.label || node.id, 24);
}

type ShowcaseGuide = {
  title: string;
  target: string;
  items: string[];
};

function showcaseGuideForExample(exampleId: string | null | undefined): ShowcaseGuide | null {
  if (exampleId === "what-if-dynamic-g-formula") {
    return {
      title: "Sequential dynamic strategy",
      target: "Look for the rule trace and support by visit.",
      items: [
        "The strategy assigns A0/A1/A2 from current risk history before later nodes are drawn.",
        "Observed match is a support diagnostic, not the estimand."
      ]
    };
  }
  if (exampleId === "what-if-nhefs-mortality-survival") {
    return {
      title: "Strategy survival curves",
      target: "Look for two curves and the final risk difference.",
      items: [
        "Each treatment strategy gets its own simulated follow-up curve.",
        "The absorbing death edges chain the interval death indicators, so death in one interval carries into every later one."
      ]
    };
  }
  if (exampleId === "what-if-hazard-selection") {
    return {
      title: "Survivor denominators",
      target: "Open interval denominators under the curve.",
      items: [
        "Late hazards are conditional on remaining at risk.",
        "At-risk counts prevent reading a late interval as the whole-horizon risk."
      ]
    };
  }
  if (exampleId === "what-if-weight-gain-g-estimation") {
    return {
      title: "G-estimation readout",
      target: "Methods is open; inspect additive g-estimation.",
      items: [
        "The top metric uses the additive g-estimation row.",
        "The diagnostic row reports sequential blip coefficients."
      ]
    };
  }
  if (exampleId === "what-if-censoring-ipcw") {
    return {
      title: "Censoring weights",
      target: "Methods is open; inspect IPW/IPCW.",
      items: [
        "The IPW/IPCW metric weights treatment histories and remaining uncensored.",
        "Support ESS tells whether the weighted contrast is fragile."
      ]
    };
  }
  if (exampleId === "what-if-snaft-survival") {
    return {
      title: "Structural nested survival time",
      target: "Separate failure time from observed death.",
      items: [
        "The main contrast is on failure time, not only an event indicator.",
        "Observed-death survival is a follow-up diagnostic."
      ]
    };
  }
  return null;
}

function ShowcaseGuideCard(props: { guide: ShowcaseGuide }) {
  return (
    <section className="showcase-guide-card" aria-label="Showcase guide">
      <div className="module-card-header">
        <strong>Showcase guide</strong>
        <span>{props.guide.title}</span>
      </div>
      <p>{props.guide.target}</p>
      <ul>
        {props.guide.items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}

function AdjustedOutputPanel(props: {
  moduleId: string | null;
  exampleId?: string | null;
  computedOutput: ComputedCompletedOutput | null;
  binaryOutput: BinaryAdjustmentOutput | null;
  continuousOutput: BinaryContinuousAdjustmentOutput | null;
  unified?: { comparison: GMethodsComparison; outcomeScale: "risk" | "mean"; outcomeUnit: string; points?: ScatterPoint[]; treatmentId?: string } | null;
  basis?: CovariateBasis;
  onBasisChange?: (basis: CovariateBasis) => void;
  pending?: ResultPendingState;
  hideOracle?: boolean;
}) {
  const unifiedPanel = props.unified
    ? <UnifiedAdjustmentReadout comparison={props.unified.comparison} outcomeScale={props.unified.outcomeScale} outcomeUnit={props.unified.outcomeUnit} points={props.unified.points} treatmentId={props.unified.treatmentId} basis={props.basis} onBasisChange={props.onBasisChange} />
    : null;
  const adjustedNodes = props.binaryOutput?.adjustedNodes ?? props.continuousOutput?.adjustedNodes ?? [];
  const binaryOutput = props.binaryOutput;
  const continuousOutput = props.continuousOutput;
  const pendingNotice = <ResultsPendingNotice pending={props.pending} label="Updating adjusted output" />;
  const showcaseGuide = showcaseGuideForExample(props.exampleId);
  // Either an example-specific module, or the generic structural diagnosis fallback
  // (computedOutput.moduleId === "structural-diagnosis") when the example has none.
  const effectiveModuleId = props.moduleId ?? props.computedOutput?.moduleId ?? null;
  const showGenericAdjustmentCards = !effectiveModuleId?.startsWith("what-if-");
  if (effectiveModuleId) {
    return (
      <div className="adjusted-output-stack" aria-busy={resultPendingActive(props.pending)}>
        {pendingNotice}
        {showcaseGuide && <ShowcaseGuideCard guide={showcaseGuide} />}
        <CompletedOutputPanel moduleId={effectiveModuleId} computedOutput={props.computedOutput} hideOracle={props.hideOracle} />
        {showGenericAdjustmentCards && unifiedPanel}
      </div>
    );
  }
  if (unifiedPanel) {
    return (
      <div className="adjusted-output-stack" aria-busy={resultPendingActive(props.pending)}>
        {pendingNotice}
        {unifiedPanel}
      </div>
    );
  }
  if (adjustedNodes.length === 0) {
    return (
      <div className="adjusted-output-stack" aria-busy={resultPendingActive(props.pending)}>
        {pendingNotice}
        <AdjustedOutputEmptyState />
      </div>
    );
  }
  if (!props.moduleId) {
    return (
      <div className="adjusted-output-stack" aria-busy={resultPendingActive(props.pending)}>
        {pendingNotice}
        <div className="adjusted-output-empty">
          <strong>Adjusted variables selected</strong>
          <p>{adjustedNodes.map((node) => node.label).join(", ")} marked adjusted. This custom graph does not have a specialized adjusted-output module yet.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="adjusted-output-stack" aria-busy={resultPendingActive(props.pending)}>
      {pendingNotice}
      <CompletedOutputPanel moduleId={props.moduleId} computedOutput={props.computedOutput} hideOracle={props.hideOracle} />
    </div>
  );
}

function shouldRenderBinaryAdjustmentOutput(output: BinaryAdjustmentOutput): boolean {
  return output.stabilizedIpw !== null || output.strata.length > 0;
}


function shouldShowAdjustedOutputColumn(document: GraphDocument, simulation: SimulationResult, moduleId: string | null, pair: ScatterPair): boolean {
  if (moduleId) return true;
  const exposure = document.graph.nodes.find((node) => node.id === pair.x);
  const outcome = document.graph.nodes.find((node) => node.id === pair.y);
  if (!exposure || !outcome) return false;
  return isBinaryGraphNode(exposure, simulation.nodeStates[exposure.id]);
}


function computeBinaryAdjustmentOutput(context: OutputContext, derived: SimulationDerivedCache, pair: ScatterPair): BinaryAdjustmentOutput | null {
  const exposure = context.document.graph.nodes.find((node) => node.id === pair.x);
  const outcome = context.document.graph.nodes.find((node) => node.id === pair.y);
  if (!exposure || !outcome) return null;
  const exposureState = context.simulation.nodeStates[exposure.id];
  const outcomeState = context.simulation.nodeStates[outcome.id];
  if (!isBinaryGraphNode(exposure, exposureState) || !isBinaryGraphNode(outcome, outcomeState)) return null;
  const rawSummary = pairDerivedSummary(derived, exposure.id, outcome.id);
  const rawPoints = rawSummary.points;
  if (rawPoints.length === 0) return null;
  const adjustedNodes = context.document.graph.nodes.filter((node) => node.roles.adjusted && node.id !== exposure.id && node.id !== outcome.id);
  const binaryAdjustedNodes = adjustedNodes.filter((node) => isBinaryGraphNode(node, context.simulation.nodeStates[node.id]));
  const stabilizedIpwNodes = adjustedNodes.filter(isStabilizedIpwNode);
  const binnedAdjustedNodes = adjustedNodes
    .filter((node) => !isBinaryGraphNode(node, context.simulation.nodeStates[node.id]) && !isStabilizedIpwNode(node))
    .map((node) => binnedAdjustmentNode(node, context.simulation.nodeStates[node.id], derived.nodes.get(node.id), { fallbackBins: 4 }))
    .filter((item): item is BinnedAdjustmentNode => item !== null);
  const binnedIds = new Set(binnedAdjustedNodes.map((item) => item.node.id));
  const unsupportedAdjustedNodes = adjustedNodes.filter((node) => (
    !isBinaryGraphNode(node, context.simulation.nodeStates[node.id]) && !binnedIds.has(node.id) && !isStabilizedIpwNode(node)
  ));
  const stabilizedIpw = stabilizedIpwNodes.length > 0
    ? computeStabilizedIpw(exposure, outcome, stabilizedIpwNodes, context.simulation, derived)
    : null;
  const expanders = [
    ...binaryAdjustedNodes.map((node) => binaryAdjustmentExpander(node, context.simulation.nodeStates[node.id])),
    ...binnedAdjustedNodes.map((item) => binnedAdjustmentExpander(item))
  ].filter((item): item is AdjustmentStratumCondition[] => item.length > 0).slice(0, 3);
  const strataResult = binaryAdjustmentStrata(expanders, exposureState, outcomeState);
  return {
    exposure,
    outcome,
    rawPoints,
    rawCells: rawSummary.binaryCells,
    rawContrast: rawSummary.binaryContrast,
    adjustedNodes,
    binaryAdjustedNodes,
    binnedAdjustedNodes,
    unsupportedAdjustedNodes,
    strata: strataResult.items,
    stabilizedIpw,
    truncated: binaryAdjustedNodes.length + binnedAdjustedNodes.length > expanders.length || strataResult.truncated
  };
}

function computeBinaryContinuousAdjustmentOutput(context: OutputContext, derived: SimulationDerivedCache, pair: ScatterPair): BinaryContinuousAdjustmentOutput | null {
  const exposure = context.document.graph.nodes.find((node) => node.id === pair.x);
  const outcome = context.document.graph.nodes.find((node) => node.id === pair.y);
  if (!exposure || !outcome) return null;
  const exposureState = context.simulation.nodeStates[exposure.id];
  const outcomeState = context.simulation.nodeStates[outcome.id];
  if (!isBinaryGraphNode(exposure, exposureState) || isBinaryGraphNode(outcome, outcomeState)) return null;
  const rawSummary = pairDerivedSummary(derived, exposure.id, outcome.id);
  const rawPoints = rawSummary.points;
  if (rawPoints.length === 0) return null;
  const rawGap = binaryContinuousGap(rawSummary.binaryContinuousGroups);
  const adjustedNodes = context.document.graph.nodes.filter((node) => node.roles.adjusted && node.id !== exposure.id && node.id !== outcome.id);
  const binaryAdjustedNodes = adjustedNodes.filter((node) => isBinaryGraphNode(node, context.simulation.nodeStates[node.id]));
  const stabilizedIpwNodes = adjustedNodes.filter(isStabilizedIpwNode);
  const binnedAdjustedNodes = adjustedNodes
    .filter((node) => !isBinaryGraphNode(node, context.simulation.nodeStates[node.id]) && !isStabilizedIpwNode(node))
    .map((node) => binnedAdjustmentNode(node, context.simulation.nodeStates[node.id], derived.nodes.get(node.id), { fallbackBins: 4 }))
    .filter((item): item is BinnedAdjustmentNode => item !== null);
  const binnedIds = new Set(binnedAdjustedNodes.map((item) => item.node.id));
  const unsupportedAdjustedNodes = adjustedNodes.filter((node) => (
    !isBinaryGraphNode(node, context.simulation.nodeStates[node.id]) && !binnedIds.has(node.id) && !isStabilizedIpwNode(node)
  ));
  const stabilizedIpw = stabilizedIpwNodes.length > 0
    ? computeStabilizedIpw(exposure, outcome, stabilizedIpwNodes, context.simulation, derived)
    : null;
  const expanders = [
    ...binaryAdjustedNodes.map((node) => binaryAdjustmentExpander(node, context.simulation.nodeStates[node.id])),
    ...binnedAdjustedNodes.map((item) => binnedAdjustmentExpander(item))
  ].filter((item): item is AdjustmentStratumCondition[] => item.length > 0).slice(0, 3);
  const strataResult = binaryContinuousAdjustmentStrata(expanders, exposureState, outcomeState);
  return {
    exposure,
    outcome,
    rawPoints,
    rawGroups: rawSummary.binaryContinuousGroups,
    rawGap,
    yDomain: rawSummary.ySampleDomain,
    adjustedNodes,
    binaryAdjustedNodes,
    binnedAdjustedNodes,
    unsupportedAdjustedNodes,
    strata: strataResult.items,
    stabilizedIpw,
    adjustedGap: stabilizedIpw?.weightedDiff ?? standardizedBinaryContinuousGap(strataResult.items),
    truncated: binaryAdjustedNodes.length + binnedAdjustedNodes.length > expanders.length || strataResult.truncated
  };
}

function AdjustedOutputEmptyState() {
  return (
    <div className="adjusted-output-empty">
      <strong>No adjustment yet</strong>
      <p>Select a pre-treatment common cause, mark it adjusted, and this panel will show the adjusted comparison or example-specific reveal.</p>
    </div>
  );
}

function SimulationDiagnosticsPanel(props: {
  document: GraphDocument;
  simulation: SimulationResult;
  empiricalDraws: number;
  onEmpiricalDraws: (sampleSize: number) => void;
}) {
  return (
    <div className="simulation-diagnostics-panel">
      <DrawCountControl value={props.empiricalDraws} onChange={props.onEmpiricalDraws} />
      <ConditioningMethodPanel simulation={props.simulation} />
      <div className="diagnostic-list">
        <strong>Run diagnostics</strong>
        <span>seed {props.document.simulation.seed}</span>
        {props.simulation.diagnostics.length === 0
          ? <span>No active simulation warnings.</span>
          : props.simulation.diagnostics.map((message) => <span className="warning" key={message}>{message}</span>)}
      </div>
    </div>
  );
}

function DrawCountControl(props: { value: number; onChange: (sampleSize: number) => void }) {
  const update = (value: number) => {
    if (Number.isFinite(value)) props.onChange(clampDrawCount(value));
  };
  return (
    <div className="draw-count-control">
      <div className="draw-count-head">
        <strong>Empirical samples</strong>
        <span>{props.value.toLocaleString()} per run</span>
      </div>
      <input
        aria-label="empirical samples"
        type="number"
        min={EMPIRICAL_DRAW_MIN}
        max={EMPIRICAL_DRAW_MAX}
        step={EMPIRICAL_DRAW_STEP}
        value={props.value}
        onChange={(event) => update(Number(event.target.value))}
      />
      <input
        aria-label="empirical samples slider"
        type="range"
        min={EMPIRICAL_DRAW_MIN}
        max={EMPIRICAL_DRAW_MAX}
        step={EMPIRICAL_DRAW_STEP}
        value={clamp(props.value, EMPIRICAL_DRAW_MIN, EMPIRICAL_DRAW_MAX)}
        onChange={(event) => update(Number(event.target.value))}
      />
    </div>
  );
}

function HardDoEditor(props: {
  node: GraphNode;
  document: GraphDocument;
  simulation: SimulationResult;
  onOverride: (id: string, value: number | null) => void;
}) {
  const value = props.simulation.values[props.node.id] ?? 0;
  const binary = normalizeVariableModel(props.node.variable).valueType === "binary";
  const hardDoActive = Object.hasOwn(props.document.simulation.overrides, props.node.id);
  const hardDoValue = props.document.simulation.overrides[props.node.id] ?? value;
  return (
    <div className={`module-card hard-do-editor ${hardDoActive ? "active" : ""}`}>
      <div className="module-card-header">
        <strong>Hard do intervention</strong>
        <span className={hardDoActive ? "module-badge active" : "module-badge"}>{hardDoActive ? "active" : "available"}</span>
      </div>
      <label className="field">
        <span>fixed value</span>
        <input
          aria-label="hard do value"
          type="number"
          value={formatInputNumber(hardDoValue)}
          min={binary ? 0 : undefined}
          max={binary ? 1 : undefined}
          step={binary ? 1 : 0.1}
          onChange={(event) => props.onOverride(props.node.id, binary ? coerceBinary(Number(event.target.value)) : Number(event.target.value))}
        />
      </label>
      <div className="button-row">
        {!hardDoActive && <button type="button" onClick={() => props.onOverride(props.node.id, value)}>fix current value</button>}
        {hardDoActive && <button type="button" onClick={() => props.onOverride(props.node.id, null)}>release hard do</button>}
      </div>
    </div>
  );
}

function ConditioningEditor(props: {
  node: GraphNode;
  document: GraphDocument;
  simulation: SimulationResult;
  onSelectionCondition: (id: string, condition: SimulationSelectionCondition | null) => void;
}) {
  const variable = normalizeVariableModel(props.node.variable);
  const value = props.simulation.values[props.node.id] ?? 0;
  const condition = props.document.simulation.selections[props.node.id];
  const state = props.simulation.nodeStates[props.node.id];
  const discreteOptions = discreteConditionOptions(variable);
  const discreteMode = discreteOptions.length > 0;
  const selectedBinaryNode = props.node.roles.selected && variable.valueType === "binary";
  const [sliderMin, sliderMax] = conditioningSliderBounds(state, condition?.value ?? value);
  const sliderStep = conditioningSliderStep(sliderMin, sliderMax);
  const updateCondition = (patch: Partial<SimulationSelectionCondition>) => {
    props.onSelectionCondition(props.node.id, {
      operator: condition?.operator ?? "at_least",
      value: condition?.value ?? value,
      upper: condition?.upper ?? null,
      valueRef: null,
      upperRef: null,
      sampling: condition?.sampling ?? "auto",
      ...patch
    });
  };
  const updateDiscreteValues = (values: number[]) => {
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    if (sorted.length === discreteOptions.length) {
      props.onSelectionCondition(props.node.id, null);
      return;
    }
    props.onSelectionCondition(props.node.id, {
      operator: "one_of",
      value: sorted[0] ?? Number.NaN,
      upper: null,
      valueRef: null,
      upperRef: null,
      values: sorted,
      sampling: "rejection"
    });
  };
  const selectedDiscreteValues = discreteMode ? selectedDiscreteConditionValues(condition, discreteOptions) : new Set<number>();
  return (
    <div className={`module-card conditioning-editor ${condition ? "active" : ""}`}>
      <div className="module-card-header">
        <strong>Analysis sample filter</strong>
        <span className={condition ? "module-badge active" : "module-badge"}>{condition ? "active" : "available"}</span>
      </div>
      <p className="muted">Filters observed simulated draws; this is not do({props.node.id}).</p>
      {discreteMode ? (
        <div className="discrete-condition-list" role="group" aria-label={`${props.node.id} included categories`}>
          <span>include categories</span>
          {discreteOptions.map((option) => (
            <label className="checkbox-row" key={option.value}>
              <input
                type="checkbox"
                checked={selectedDiscreteValues.has(option.value)}
                onChange={(event) => {
                  const next = new Set(selectedDiscreteValues);
                  if (event.target.checked) next.add(option.value);
                  else next.delete(option.value);
                  updateDiscreteValues([...next]);
                }}
              />
              <span>{option.label}</span>
            </label>
          ))}
          <p className="muted">Discrete filters use category membership, not numeric thresholds.</p>
        </div>
      ) : (
        <>
          <label className="field">
            <span>condition</span>
            <select
              value={condition?.operator === "one_of" ? "at_least" : condition?.operator ?? "at_least"}
              onChange={(event) => updateCondition({
                operator: event.target.value as SimulationSelectionCondition["operator"],
                upper: event.target.value === "between" ? condition?.upper ?? value : null,
                values: null
              })}
            >
              <option value="at_least">at least</option>
              <option value="at_most">at most</option>
              <option value="between">between</option>
            </select>
          </label>
          <label className="field">
            <span>inference method</span>
            <select aria-label="inference method" value={condition?.sampling ?? "auto"} onChange={(event) => updateCondition({ sampling: event.target.value as SimulationSelectionCondition["sampling"] })}>
              <option value="auto">auto</option>
              <option value="analytic">analytic</option>
              <option value="importance">importance sampling</option>
              <option value="rejection">rejection sampling</option>
            </select>
          </label>
          <NumberField
            label={condition?.operator === "between" ? "lower" : "value"}
            value={condition?.value ?? value}
            onChange={(nextValue) => updateCondition({ value: nextValue, upper: condition?.operator === "between" ? condition.upper ?? nextValue : null })}
          />
          <label className="field conditioning-range">
            <span>{condition?.operator === "between" ? "lower slider" : "value slider"}</span>
            <input
              type="range"
              min={sliderMin}
              max={sliderMax}
              step={sliderStep}
              value={clamp(condition?.value ?? value, sliderMin, sliderMax)}
              onChange={(event) => {
                const nextValue = roundToStep(Number(event.target.value), sliderStep);
                updateCondition({ value: nextValue, upper: condition?.operator === "between" ? condition.upper ?? nextValue : null });
              }}
            />
          </label>
          {condition?.operator === "between" && (
            <>
              <NumberField
                label="upper"
                value={condition.upper ?? condition.value}
                onChange={(upper) => updateCondition({ upper })}
              />
              <label className="field conditioning-range">
                <span>upper slider</span>
                <input
                  type="range"
                  min={sliderMin}
                  max={sliderMax}
                  step={sliderStep}
                  value={clamp(condition.upper ?? condition.value, sliderMin, sliderMax)}
                  onChange={(event) => updateCondition({ upper: roundToStep(Number(event.target.value), sliderStep) })}
                />
              </label>
            </>
          )}
        </>
      )}
      <div className="button-row">
        {selectedBinaryNode && !condition && <button type="button" onClick={() => props.onSelectionCondition(props.node.id, { operator: "one_of", value: 1, upper: null, valueRef: null, upperRef: null, values: [1], sampling: "rejection" })}>filter to value 1</button>}
        {!condition && !discreteMode && <button type="button" onClick={() => props.onSelectionCondition(props.node.id, { operator: "at_least", value, upper: null, valueRef: null, upperRef: null, sampling: "auto" })}>condition on current</button>}
        {condition && <button type="button" onClick={() => props.onSelectionCondition(props.node.id, null)}>clear condition</button>}
      </div>
    </div>
  );
}

function discreteConditionOptions(variable: VariableModel): Array<{ value: number; label: string }> {
  if (variable.valueType === "binary") {
    return [
      { value: 0, label: variable.categories[0] || "0" },
      { value: 1, label: variable.categories[1] || "1" }
    ];
  }
  if (variable.valueType === "categorical") {
    const categories = variable.categories.length > 0 ? variable.categories : ["0", "1"];
    return categories.map((label, index) => ({ value: index, label }));
  }
  return [];
}

function selectedDiscreteConditionValues(
  condition: SimulationSelectionCondition | undefined,
  options: Array<{ value: number; label: string }>
): Set<number> {
  if (!condition) return new Set(options.map((option) => option.value));
  if (condition.operator === "one_of") return new Set(condition.values ?? [condition.value]);
  return new Set(options.filter((option) => conditionAllowsValue(condition, option.value)).map((option) => option.value));
}

function conditionAllowsValue(condition: SimulationSelectionCondition, value: number): boolean {
  if (condition.operator === "one_of") return (condition.values ?? [condition.value]).some((candidate) => Math.abs(candidate - value) <= 1e-9);
  if (condition.operator === "at_least") return value >= condition.value;
  if (condition.operator === "at_most") return value <= condition.value;
  const upper = condition.upper ?? condition.value;
  return value >= condition.value && value <= upper;
}

function ConditioningMethodPanel({ simulation }: { simulation: SimulationResult }) {
  const conditioning = simulation.conditioning;
  const active = conditioning.activeConditions.length > 0;
  const analyticActive = conditioning.primaryMethod === "analytic";
  return (
    <div className="conditioning-summary">
      <strong>Inference Methods</strong>
      {active ? (
        <>
          {conditioning.activeConditions.map((condition) => <span key={condition}>condition {condition}</span>)}
          <span>requested {inferenceModeLabel(conditioning.requestedInference)}</span>
          <span>active {inferenceModeLabel(conditioning.primaryMethod)}</span>
          {conditioning.analytic
            ? <span>{analyticActive ? "analytic active" : "analytic available"} {analyticSummaryLabel(conditioning.analytic)}</span>
            : <span>analytic unavailable</span>}
          <span>empirical check {conditioning.empiricalMethod}</span>
          <span>empirical samples {conditioning.acceptedSamples} / {conditioning.totalSamples}</span>
          {conditioning.effectiveSampleSize !== null && <span>ESS {formatValue(conditioning.effectiveSampleSize)}</span>}
        </>
      ) : (
        <>
          <span>requested auto</span>
          <span>active forward</span>
          <span>analytic inactive</span>
        </>
      )}
    </div>
  );
}

function DesignModulePanel({ mode }: { mode: WorkbenchMode }) {
  const modules = designModulesForMode(mode);
  return (
    <div className="design-module-panel">
      <div className="module-card-header">
        <strong>Design modules</strong>
        <span className="module-badge">{MODE_LABELS[mode]}</span>
      </div>
      <p className="muted">{designModuleScopeLabel(mode)}</p>
      <div className="design-module-list">
        {modules.map((module) => (
          <div className={`design-module-card ${module.status}`} key={module.id}>
            <div className="module-card-header">
              <strong>{module.label}</strong>
              <span className={module.status === "usable" ? "module-badge active" : "module-badge planned"}>{module.status}</span>
            </div>
            <p>{module.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoadmapTodoPanel() {
  return (
    <div className="roadmap-todo-panel">
      {ROADMAP_TODOS.map((item) => (
        <div className="roadmap-todo-card" key={item.label}>
          <strong>{item.label}</strong>
          <p>{item.description}</p>
        </div>
      ))}
    </div>
  );
}

function SelectionEditor(props: {
  mode: WorkbenchMode;
  node?: GraphNode;
  edge?: GraphEdge;
  simulation: SimulationResult;
  derived: SimulationDerivedCache;
  document: GraphDocument;
  outputPair: ScatterPair;
  onToggleRole: (id: string, role: keyof NodeRoleFlags) => void;
  onRename: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onNodeMechanism: (id: string, patch: Partial<NodeMechanism>) => void;
  onVariableChange: (nodeId: string, variable: VariableModel) => void;
  onOverride: (id: string, value: number | null) => void;
  onSelectionCondition: (nodeId: string, condition: SimulationSelectionCondition | null) => void;
  onSetOperation: (nodeId: string, operation: AnalysisOperation) => void;
  onCoefficient: (edge: GraphEdge, coefficient: number) => void;
  onEdgeEnabled: (edge: GraphEdge, enabled: boolean) => void;
  onEdgeMechanism: (edge: GraphEdge, patch: Partial<EdgeMechanism>) => void;
  onDeleteEdge: (edgeId: string) => void;
}) {
  if (props.mode === "basic") return <BasicSelectionEditor {...props} />;
  if (props.node) return <VariableEditor
    node={props.node}
    simulation={props.simulation}
    derived={props.derived}
    document={props.document}
    outputPair={props.outputPair}
    onToggleRole={props.onToggleRole}
    onRename={props.onRename}
    onDelete={props.onDeleteNode}
    onMechanism={props.onNodeMechanism}
    onVariableChange={props.onVariableChange}
    onOverride={props.onOverride}
    onSelectionCondition={props.onSelectionCondition}
    onSetOperation={props.onSetOperation}
  />;
  if (props.edge) return <EdgeEditor
    edge={props.edge}
    simulation={props.simulation}
    document={props.document}
    onCoefficient={props.onCoefficient}
    onEnabled={props.onEdgeEnabled}
    onMechanism={props.onEdgeMechanism}
    onDelete={props.onDeleteEdge}
  />;
  return (
    <div className="selection-empty-state">
      <p>Select a node or edge for editing.</p>
    </div>
  );
}

function BasicSelectionEditor(props: Parameters<typeof SelectionEditor>[0]) {
  if (props.node) {
    const node = props.node;
    const activeIntervention = Object.hasOwn(props.document.simulation.overrides ?? {}, node.id);
    const activeSelection = Object.hasOwn(props.document.simulation.selections ?? {}, node.id);
    return (
      <div className="selection-editor basic-selection-editor" aria-label={`Variable ${node.id}`}>
        <div className="selection-editor-header">
          <div>
            <span>Variable</span>
            <strong>{nodeDisplayName(node)}</strong>
          </div>
        </div>
        <div className="selection-editor-body">
          <div className="selection-editor-block basic-causal-roles">
            <strong>Use this variable</strong>
            <p className="muted">Adjusting for the common cause should change the result.</p>
            <div className="role-toggle-grid">
              <RoleToggle label="exposure" checked={node.roles.exposure} onChange={() => props.onToggleRole(node.id, "exposure")} />
              <RoleToggle label="outcome" checked={node.roles.outcome} onChange={() => props.onToggleRole(node.id, "outcome")} />
              <RoleToggle label="adjust for" checked={node.roles.adjusted} onChange={() => props.onToggleRole(node.id, "adjusted")} />
              <RoleToggle label="unobserved" checked={node.roles.latent} onChange={() => props.onToggleRole(node.id, "latent")} />
            </div>
          </div>

          <div className="basic-causal-module-stack">
            <details className="basic-causal-module" open={activeIntervention}>
              <summary>
                <span>Intervene</span>
                {activeIntervention && <strong>active</strong>}
              </summary>
              <HardDoEditor node={node} document={props.document} simulation={props.simulation} onOverride={props.onOverride} />
            </details>
            <details className="basic-causal-module" open={activeSelection || node.roles.selected}>
              <summary>
                <span>Analysis sample filter</span>
                {activeSelection && <strong>active</strong>}
              </summary>
              <ConditioningEditor node={node} document={props.document} simulation={props.simulation} onSelectionCondition={props.onSelectionCondition} />
            </details>
            <details className="basic-causal-module">
              <summary>
                <span>Adjustment method</span>
                {node.roles.adjusted && <strong>used</strong>}
              </summary>
              <AdjustmentMethodEditor
                node={node}
                document={props.document}
                simulation={props.simulation}
                derived={props.derived}
                outputPair={props.outputPair}
                onVariableChange={props.onVariableChange}
              />
            </details>
          </div>
        </div>
      </div>
    );
  }
  if (props.edge) return <BasicEdgeEditor {...props} edge={props.edge} />;
  return <BasicCausalGuide />;
}

function BasicCausalGuide() {
  return (
    <div className="selection-empty-state basic-causal-guide">
      <strong>Try the flip</strong>
      <p>Click the common cause in the graph, then adjust for it. Watch the result change on the right.</p>
    </div>
  );
}

function BasicEdgeEditor(props: Parameters<typeof SelectionEditor>[0] & { edge: GraphEdge }) {
  const mechanism = normalizeEdgeMechanism(props.document.simulation.edges[props.edge.id]);
  const contribution = props.simulation.contributions[props.edge.id] ?? 0;
  return (
    <div className="selection-editor basic-selection-editor connection-editor" aria-label={`Connection ${props.edge.source} to ${props.edge.target}`}>
      <div className="selection-editor-header">
        <div>
          <span>Arrow</span>
          <strong>{props.edge.source} to {props.edge.target}</strong>
        </div>
      </div>
      <div className="selection-editor-body">
        <div className="basic-current-card">
          <span>current contribution</span>
          <strong className={contribution >= 0 ? "positive" : "negative"}>{formatSignedValue(contribution)}</strong>
          <small>{mechanism.enabled ? "included in the simulation" : "shown but disabled"}</small>
        </div>
        <div className="selection-editor-block">
          <strong>Causal link</strong>
          <Checkbox label="included in simulation" checked={mechanism.enabled} onChange={(enabled) => props.onEdgeEnabled(props.edge, enabled)} />
          {mechanism.kind === "linear" && <TactileNumberField
            label="effect strength"
            value={mechanism.coefficient}
            step={0.1}
            nudge={1}
            onChange={(coefficient) => props.onCoefficient(props.edge, coefficient)}
          />}
        </div>
        <details className="selection-editor-details">
          <summary>More arrow settings</summary>
          <EdgePanel
            edge={props.edge}
            mechanism={normalizeEdgeMechanism(props.document.simulation.edges[props.edge.id])}
            onDraft={(mechanism) => props.onEdgeMechanism(props.edge, mechanism)}
          />
        </details>
        <div className="button-row">
          <button type="button" onClick={() => props.onDeleteEdge(props.edge.id)}>delete</button>
        </div>
      </div>
    </div>
  );
}

function VariableMechanismPanel(props: {
  node: GraphNode;
  document: GraphDocument;
  simulation: SimulationResult;
  onMechanism: (id: string, patch: Partial<NodeMechanism>) => void;
  onVariableChange: (nodeId: string, variable: VariableModel) => void;
}) {
  const node = props.node;
  const variable = normalizeVariableModel(node.variable);
  const mechanism = normalizeNodeMechanism(props.document.simulation.nodes[node.id]);
  const state = props.simulation.nodeStates[node.id];
  const parentIds = props.document.graph.edges.filter((edge) => edge.kind === "directed" && edge.target === node.id).map((edge) => edge.source);
  const isRoot = parentIds.length === 0;
  const inferredValueType = inferValueTypeFromMechanism(isRoot, mechanism, variable.valueType);
  const updateVariable = (patch: Partial<VariableModel>) => props.onVariableChange(node.id, normalizeVariableModel({ ...variable, ...patch }));
  return (
    <div className="selection-editor-grid">
      <div className="selection-editor-block">
        <div className="selection-editor-block-title">
          <strong>Distribution</strong>
          <span className="variable-pill">{valueTypeLabel(inferredValueType)}</span>
        </div>
        {isRoot ? (
          <DistributionEditor
            label="root distribution"
            distribution={mechanism.distribution}
            onChange={(distribution) => props.onMechanism(node.id, { distribution })}
          />
        ) : (
          <>
            <label className="field">
              <span>combiner</span>
              <select value={mechanism.combiner} onChange={(event) => props.onMechanism(node.id, { combiner: event.target.value as NodeCombinerKind })}>
                {NODE_COMBINERS.map((item) => <option value={item.kind} key={item.kind}>{item.label}</option>)}
              </select>
            </label>
            <DistributionEditor
              label="noise"
              distribution={mechanism.noise}
              onChange={(noise) => props.onMechanism(node.id, { noise })}
            />
          </>
        )}
        <TactileNumberField
          label="intercept"
          value={mechanism.intercept}
          step={0.1}
          nudge={1}
          onChange={(intercept) => props.onMechanism(node.id, { intercept })}
        />
      </div>
      <div className="selection-editor-block">
        <strong>Notes</strong>
        <textarea aria-label="description" value={variable.description} rows={3} onChange={(event) => updateVariable({ description: event.target.value })} />
        <div className="model-facts">
          <span>parents {parentIds.join(", ") || "none"}</span>
          <span>analytic {state?.analytic ? analyticDistributionLabel(state.analytic) : "unavailable"}</span>
        </div>
      </div>
    </div>
  );
}

function VariableEditor(props: {
  node: GraphNode;
  simulation: SimulationResult;
  derived: SimulationDerivedCache;
  document: GraphDocument;
  outputPair: ScatterPair;
  onToggleRole: (id: string, role: keyof NodeRoleFlags) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onMechanism: (id: string, patch: Partial<NodeMechanism>) => void;
  onVariableChange: (nodeId: string, variable: VariableModel) => void;
  onOverride: (id: string, value: number | null) => void;
  onSelectionCondition: (nodeId: string, condition: SimulationSelectionCondition | null) => void;
  onSetOperation: (nodeId: string, operation: AnalysisOperation) => void;
}) {
  const node = props.node;
  const variable = normalizeVariableModel(node.variable);
  const mechanism = normalizeNodeMechanism(props.document.simulation.nodes[node.id]);
  const value = props.simulation.values[node.id] ?? 0;
  const state = props.simulation.nodeStates[node.id];
  const parentIds = props.document.graph.edges.filter((edge) => edge.kind === "directed" && edge.target === node.id).map((edge) => edge.source);
  const isRoot = parentIds.length === 0;
  const inferredValueType = inferValueTypeFromMechanism(isRoot, mechanism, variable.valueType);
  const updateVariable = (patch: Partial<VariableModel>) => props.onVariableChange(node.id, normalizeVariableModel({ ...variable, ...patch }));

  const currentOperation = deriveOperation(props.document, node.id);
  const exposureNode = props.document.graph.nodes.find((candidate) => candidate.id === props.outputPair.x)
    ?? props.document.graph.nodes.find((candidate) => candidate.roles.exposure);
  const outcomeNode = props.document.graph.nodes.find((candidate) => candidate.id === props.outputPair.y)
    ?? props.document.graph.nodes.find((candidate) => candidate.roles.outcome);
  const isBinaryVariable = variable.valueType === "binary";
  const estimand = describeEstimand({
    operation: currentOperation,
    exposureLabel: exposureNode ? nodeOutputLabel(exposureNode) : props.outputPair.x,
    outcomeLabel: outcomeNode ? nodeOutputLabel(outcomeNode) : props.outputPair.y,
    nodeLabel: node.id,
    value: isBinaryVariable ? 1 : undefined
  });
  const conditionVerdict = currentOperation === "select" || currentOperation === "condition" || currentOperation === "adjust"
    ? classifyConditioned(props.document.graph, node.id)
    : null;
  const badControl = conditionVerdict ? badControlWarning(node.id, conditionVerdict.classification) : null;

  return (
    <div className="selection-editor" aria-label={`Variable ${node.id}`}>
      <div className="selection-editor-header">
        <div>
          <span>Variable</span>
          <strong className="connection-title"><NodeName>{node.id}</NodeName></strong>
        </div>
      </div>

      <div className="selection-editor-body">
        <div className="value-card">
          <strong>current value</strong>
          <span>{formatValue(value)}</span>
        </div>

        <div className="operation-panel">
          <div className="operation-panel-head">
            <strong>Analysis operation</strong>
            <span className="variable-pill">{OPERATION_LABELS[currentOperation]}</span>
          </div>
          <div className="operation-selector" role="group" aria-label="Analysis operation">
            {(["none", "intervene", "select", "condition", "adjust"] as AnalysisOperation[]).map((operation) => (
              <button
                type="button"
                key={operation}
                className={currentOperation === operation ? "active" : ""}
                aria-pressed={currentOperation === operation}
                title={OPERATION_BLURBS[operation]}
                onClick={() => props.onSetOperation(node.id, operation)}
              >{OPERATION_LABELS[operation]}</button>
            ))}
          </div>
          <p className="operation-blurb">{OPERATION_BLURBS[currentOperation]}</p>
          <div className="operation-estimand">
            <EstimandFormula tokens={estimand.formalTokens} />
            <span>{estimand.plain}</span>
          </div>
          {badControl && <p className="operation-bad-control">⚠ {badControl}</p>}
        </div>

        {/* Contextual parameters for the chosen analysis operation. The operation selector
            above is the single control — there is no separate tab strip, and adjusted/selected
            are no longer free-standing role toggles (they are implied by Adjust/Select). */}
        {currentOperation === "intervene" && <div className="variable-op-params intervention-tab-panel">
          <HardDoEditor node={node} document={props.document} simulation={props.simulation} onOverride={props.onOverride} />
          <PlannedModuleSet />
        </div>}

        {currentOperation === "select" && <div className="variable-op-params selection-tab-panel">
          <ConditioningEditor node={node} document={props.document} simulation={props.simulation} onSelectionCondition={props.onSelectionCondition} />
        </div>}

        {(currentOperation === "condition" || currentOperation === "adjust") && <div className="variable-op-params adjustment-tab-panel">
          <AdjustmentMethodEditor
            node={node}
            document={props.document}
            simulation={props.simulation}
            derived={props.derived}
            outputPair={props.outputPair}
            onVariableChange={props.onVariableChange}
          />
        </div>}

        <div className="variable-tab-panel" role="group" aria-label="Model and structure">
          <div className="selection-editor-grid">
            <div className="selection-editor-block">
              <strong>Roles</strong>
              <div className="role-toggle-grid">
                <RoleToggle label="exposure" checked={node.roles.exposure} onChange={() => props.onToggleRole(node.id, "exposure")} />
                <RoleToggle label="outcome" checked={node.roles.outcome} onChange={() => props.onToggleRole(node.id, "outcome")} />
                <RoleToggle label="unobserved" checked={node.roles.latent} onChange={() => props.onToggleRole(node.id, "latent")} />
              </div>
            </div>

            <div className="selection-editor-block">
              <div className="selection-editor-block-title">
                <strong>Distribution</strong>
                <span className="variable-pill">{valueTypeLabel(inferredValueType)}</span>
              </div>
              {isRoot && <DistributionEditor
                label="root distribution"
                distribution={mechanism.distribution}
                onChange={(distribution) => props.onMechanism(node.id, { distribution })}
              />}
              {!isRoot && <>
                <label className="field">
                  <span>combiner</span>
                  <select value={mechanism.combiner} onChange={(event) => props.onMechanism(node.id, { combiner: event.target.value as NodeCombinerKind })}>
                    {NODE_COMBINERS.map((item) => <option value={item.kind} key={item.kind}>{item.label}</option>)}
                  </select>
                </label>
                <DistributionEditor
                  label="noise"
                  distribution={mechanism.noise}
                  onChange={(noise) => props.onMechanism(node.id, { noise })}
                />
              </>}
              <TactileNumberField
                label="intercept"
                value={mechanism.intercept}
                step={0.1}
                nudge={1}
                onChange={(intercept) => props.onMechanism(node.id, { intercept })}
              />
            </div>
          </div>

          {!isRoot && parentIds.length >= 2 && <details className="selection-editor-details">
            <summary>Interactions</summary>
            <InteractionEditor
              nodeId={node.id}
              parentIds={parentIds}
              interactions={mechanism.interactions}
              onChange={(interactions) => props.onMechanism(node.id, { interactions })}
            />
          </details>}

          <details className="selection-editor-details">
            <summary>Description</summary>
            <textarea aria-label="description" value={variable.description} rows={3} onChange={(event) => updateVariable({ description: event.target.value })} />
          </details>
        </div>

        <div className="model-facts">
          <span>parents {parentIds.join(", ") || "none"}</span>
          <span>analytic {state?.analytic ? analyticDistributionLabel(state.analytic) : "unavailable"}</span>
          <span>analytic note {state?.analytic?.note ?? "empirical only"}</span>
          <span>empirical mean {state?.empirical.mean !== null && state?.empirical.mean !== undefined ? formatValue(state.empirical.mean) : "none"}</span>
        </div>

        <div className="button-row">
          <button type="button" onClick={() => props.onRename(node.id)}>rename</button>
          <button type="button" onClick={() => props.onDelete(node.id)}>delete</button>
        </div>
      </div>
    </div>
  );
}

function PlannedModuleSet() {
  return (
    <div className="module-set">
      <strong className="module-set-title">Planned intervention modules</strong>
      <div className="planned-module-list">
        {PLANNED_CAUSAL_MODULES.map((module) => (
          <div className="module-card planned" aria-disabled="true" key={module.id} title="Planned module">
            <span>{module.label}</span>
            <span className="module-badge planned">planned</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdjustmentMethodEditor(props: {
  node: GraphNode;
  document: GraphDocument;
  simulation: SimulationResult;
  derived: SimulationDerivedCache;
  outputPair: ScatterPair;
  onVariableChange: (nodeId: string, variable: VariableModel) => void;
}) {
  const variable = normalizeVariableModel(props.node.variable);
  const state = props.simulation.nodeStates[props.node.id];
  const exposureNode = props.document.graph.nodes.find((node) => node.id === props.outputPair.x)
    ?? props.document.graph.nodes.find((node) => node.roles.exposure);
  const outcomeNode = props.document.graph.nodes.find((node) => node.id === props.outputPair.y)
    ?? props.document.graph.nodes.find((node) => node.roles.outcome);
  const exposureState = exposureNode ? props.simulation.nodeStates[exposureNode.id] : undefined;
  const exposureVariable = normalizeVariableModel(exposureNode?.variable);
  const continuousEnough = variable.valueType !== "binary" && variable.valueType !== "categorical" && variable.valueType !== "text";
  const method = variable.adjustment.method === "propensity_score_todo"
    ? "stabilized_ipw"
    : variable.adjustment.method === "none"
      ? "bins"
      : variable.adjustment.method;
  const updateAdjustment = (patch: Partial<VariableModel["adjustment"]>) => {
    props.onVariableChange(props.node.id, normalizeVariableModel({
      ...variable,
      adjustment: {
        ...variable.adjustment,
        ...patch
      }
    }));
  };
  return (
    <div className="adjustment-method-editor">
      <div className="selection-editor-block">
        <strong>Adjustment methodology</strong>
        <p className="muted">{props.node.roles.adjusted ? "Configure how this adjusted variable will be used in the visible estimand." : "Mark this variable as adjusted to make these settings part of the visible adjustment output."}</p>
        <div className="adjustment-method-choices" role="tablist" aria-label="Adjustment methodology">
          <button type="button" className={method === "bins" ? "active" : ""} onClick={() => updateAdjustment({ method: "bins" })}>Binned standardization</button>
          <button type="button" className={method === "stabilized_ipw" ? "active" : ""} onClick={() => updateAdjustment({ method: "stabilized_ipw" })}>Stabilized IPW</button>
        </div>
      </div>
      {method === "stabilized_ipw" ? (
        <StabilizedIpwEditorPanel
          node={props.node}
          exposureNode={exposureNode}
          outcomeNode={outcomeNode}
          simulation={props.simulation}
          derived={props.derived}
        />
      ) : (
        <BinnedAdjustmentEditor
          node={props.node}
          variable={variable}
          state={state}
          summary={props.derived.nodes.get(props.node.id)}
          exposureNode={exposureNode}
          exposureState={exposureState}
          exposureValueType={exposureVariable.valueType}
          continuousEnough={continuousEnough}
          onCutpoints={(cutpoints) => updateAdjustment({ method: "bins", cutpoints })}
        />
      )}
    </div>
  );
}

function StabilizedIpwEditorPanel(props: {
  node: GraphNode;
  exposureNode: GraphNode | undefined;
  outcomeNode: GraphNode | undefined;
  simulation: SimulationResult;
  derived: SimulationDerivedCache;
}) {
  if (!props.exposureNode) {
    return (
      <div className="selection-editor-block adjustment-todo">
        <strong>Stabilized inverse probability weighting</strong>
        <p className="warning">Choose one binary exposure before IPW can estimate treatment probabilities.</p>
      </div>
    );
  }
  const exposureState = props.simulation.nodeStates[props.exposureNode.id];
  if (!isBinaryGraphNode(props.exposureNode, exposureState)) {
    return (
      <div className="selection-editor-block adjustment-todo">
        <strong>Stabilized inverse probability weighting</strong>
        <p className="warning">Stabilized IPW currently supports binary exposures only.</p>
      </div>
    );
  }
  const ipw = computeStabilizedIpw(props.exposureNode, props.outcomeNode ?? null, [props.node], props.simulation, props.derived);
  return (
    <div className="selection-editor-block stabilized-ipw-editor">
      <div className="selection-editor-block-title">
        <strong>Stabilized inverse probability weighting</strong>
        <span className="variable-pill">logistic propensity</span>
      </div>
      <p className="muted">Estimate P({props.exposureNode.id}=1 | {props.node.id}) with logistic propensity, then use stabilized weights. Propensities are clipped to 0.03-0.97 to avoid one row dominating the comparison.</p>
      {ipw ? (
        <div className="ipw-diagnostics">
          {ipw.weightedDiff !== null && <span>weighted contrast {formatPercentagePoints(ipw.weightedDiff)}</span>}
          <span>treated share {formatPercent(ipw.treatedShare)}</span>
          <span>ESS {ipw.effectiveSampleSize === null ? "n/a" : formatValue(ipw.effectiveSampleSize)}</span>
          <span>max weight {ipw.maxWeight === null ? "n/a" : formatValue(ipw.maxWeight)}</span>
          <span>clipped {ipw.clippedCount}</span>
        </div>
      ) : (
        <p className="warning">Not enough finite samples are available to fit the propensity model.</p>
      )}
    </div>
  );
}

function BinnedAdjustmentEditor(props: {
  node: GraphNode;
  variable: VariableModel;
  state: SimulatedNodeState | undefined;
  summary?: NodeDistributionSummary;
  exposureNode: GraphNode | undefined;
  exposureState: SimulatedNodeState | undefined;
  exposureValueType: VariableModel["valueType"];
  continuousEnough: boolean;
  onCutpoints: (cutpoints: number[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draggingCut, setDraggingCut] = useState<number | null>(null);
  const domain = props.summary?.domain ?? (props.state ? distributionPlotDomain(props.state) : null);
  const samples = props.summary?.finiteSamples ?? props.state?.empirical.samples.filter(Number.isFinite) ?? [];
  const cutpoints = domain ? sanitizeCutpoints(props.variable.adjustment.cutpoints, domain) : [];
  const positivity = domain && props.exposureState && props.exposureValueType === "binary"
    ? positivityRows(props.state, props.exposureState, cutpoints, domain)
    : [];
  const bars = domain ? (props.summary?.histogram18 ?? histogram(samples, domain, 18, props.state?.empirical.weights)) : [];
  const maxBar = Math.max(...bars, 1);
  const width = 320;
  const height = 132;
  const plot = { x: 18, y: 18, width: 284, height: 72 };
  const valueToX = (value: number) => plot.x + ((value - (domain?.[0] ?? 0)) / Math.max((domain?.[1] ?? 1) - (domain?.[0] ?? 0), 1e-9)) * plot.width;
  const xToValue = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || !domain) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / Math.max(rect.width, 1)) * width;
    const t = clamp((x - plot.x) / plot.width, 0, 1);
    return roundToStep(domain[0] + t * (domain[1] - domain[0]), adjustmentCutStep(domain));
  };
  const commitCutpoint = (index: number, value: number) => {
    if (!domain) return;
    const next = [...cutpoints];
    next[index] = clamp(value, domain[0], domain[1]);
    props.onCutpoints(sanitizeCutpoints(next, domain));
  };
  const addCutpoint = (clientX: number) => {
    const value = xToValue(clientX);
    if (value === null || !domain) return;
    props.onCutpoints(sanitizeCutpoints([...cutpoints, value], domain));
  };
  if (!props.continuousEnough) {
    return (
      <div className="selection-editor-block adjustment-todo">
        <strong>Binned standardization</strong>
        <p className="muted">This bin editor is for continuous adjusted variables. Binary variables already have exact strata.</p>
      </div>
    );
  }
  return (
    <div className="selection-editor-block binned-adjustment-editor">
      <div className="selection-editor-block-title">
        <strong>Binned standardization</strong>
        <span className="variable-pill">{cutpoints.length + 1} bins</span>
      </div>
      <p className="muted">Click the histogram to add a split. Drag vertical lines to move bin boundaries.</p>
      {domain ? (
        <svg
          ref={svgRef}
          className="adjustment-bin-histogram"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${props.node.id} adjustment bins`}
          onPointerMove={(event) => {
            if (draggingCut === null) return;
            const value = xToValue(event.clientX);
            if (value !== null) commitCutpoint(draggingCut, value);
          }}
          onPointerUp={() => setDraggingCut(null)}
          onPointerCancel={() => setDraggingCut(null)}
          onClick={(event) => {
            if ((event.target as Element).classList.contains("adjustment-cut-line")) return;
            addCutpoint(event.clientX);
          }}
        >
          <rect className="adjustment-bin-frame" x={plot.x} y={plot.y} width={plot.width} height={plot.height} rx="4" />
          {bars.map((count, index) => {
            const barWidth = plot.width / bars.length;
            const barHeight = Math.max(1, (count / maxBar) * (plot.height - 8));
            return <rect
              className="adjustment-bin-bar"
              key={index}
              x={plot.x + index * barWidth + 1}
              y={plot.y + plot.height - barHeight}
              width={Math.max(1, barWidth - 2)}
              height={barHeight}
            />;
          })}
          {cutpoints.map((cut, index) => (
            <g key={`${cut}-${index}`}>
              <line
                className="adjustment-cut-line"
                x1={valueToX(cut)}
                x2={valueToX(cut)}
                y1={plot.y - 5}
                y2={plot.y + plot.height + 8}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  svgRef.current?.setPointerCapture(event.pointerId);
                  setDraggingCut(index);
                }}
              />
              <text className="adjustment-cut-label" x={valueToX(cut)} y={plot.y + plot.height + 22}>{formatValue(cut)}</text>
            </g>
          ))}
          <text className="adjustment-axis-label" x={plot.x} y={height - 6}>{formatValue(domain[0])}</text>
          <text className="adjustment-axis-label end" x={plot.x + plot.width} y={height - 6}>{formatValue(domain[1])}</text>
        </svg>
      ) : <p className="muted">No empirical distribution available for binning.</p>}
      <div className="button-row">
        <button type="button" disabled={!domain} onClick={() => domain && props.onCutpoints(defaultQuantileCuts(samples, domain, 4))}>quartile splits</button>
        <button type="button" disabled={cutpoints.length === 0} onClick={() => props.onCutpoints(cutpoints.slice(0, -1))}>remove last split</button>
        <button type="button" disabled={cutpoints.length === 0} onClick={() => props.onCutpoints([])}>clear</button>
      </div>
      <PositivityPanel
        exposureNode={props.exposureNode}
        exposureValueType={props.exposureValueType}
        rows={positivity}
      />
    </div>
  );
}

function PositivityPanel(props: { exposureNode: GraphNode | undefined; exposureValueType: VariableModel["valueType"]; rows: PositivityRow[] }) {
  if (!props.exposureNode) return <p className="warning">Choose an exposure before positivity can be checked.</p>;
  if (props.exposureValueType !== "binary") return <p className="warning">Binned positivity currently checks binary exposures. Stabilized IPW also requires a binary exposure.</p>;
  if (props.rows.length === 0) return <p className="muted">Add bin splits to inspect overlap within each bin.</p>;
  return (
    <div className="positivity-panel">
      <strong>Positivity by bin</strong>
      {props.rows.map((row) => (
        <div className={row.warning ? "positivity-row warning" : "positivity-row"} key={`${row.lower}-${row.upper}`}>
          <span>{formatValue(row.lower)} to {formatValue(row.upper)}</span>
          <span>exposed {formatWeightedCount(row.exposed)} / unexposed {formatWeightedCount(row.unexposed)}</span>
          <small>{row.warning ?? "overlap ok"}</small>
        </div>
      ))}
    </div>
  );
}

function EdgeEditor(props: {
  edge: GraphEdge;
  document: GraphDocument;
  simulation: SimulationResult;
  onCoefficient: (edge: GraphEdge, coefficient: number) => void;
  onEnabled: (edge: GraphEdge, enabled: boolean) => void;
  onMechanism: (edge: GraphEdge, patch: Partial<EdgeMechanism>) => void;
  onDelete: (edgeId: string) => void;
}) {
  const committed = useMemo(() => normalizeEdgeMechanism(props.document.simulation.edges[props.edge.id]), [props.document.simulation.edges, props.edge.id]);
  // The edge is edited as a local draft so dragging/typing only repaints the transfer
  // preview; the simulation is only rebuilt when the user commits.
  const [draft, setDraft] = useState<EdgeMechanism>(committed);
  useEffect(() => { setDraft(committed); }, [props.edge.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(committed), [draft, committed]);
  const contribution = props.simulation.contributions[props.edge.id] ?? 0;
  const sourceState = props.simulation.nodeStates[props.edge.source];
  const sourceNode = props.document.graph.nodes.find((node) => node.id === props.edge.source);
  const targetNode = props.document.graph.nodes.find((node) => node.id === props.edge.target);
  const sourceLabel = sourceNode ? nodeOutputLabel(sourceNode) : props.edge.source;
  const targetLabel = targetNode ? nodeOutputLabel(targetNode) : props.edge.target;
  const editablePoints = draft.kind === "piecewise_linear" || draft.kind === "monotone_spline";
  return (
    <div className="selection-editor connection-editor" aria-label={`Connection ${props.edge.source} to ${props.edge.target}`}>
      <div className="selection-editor-header">
        <div>
          <span>Connection</span>
          <strong className="connection-title"><NodeName>{sourceLabel}</NodeName><span className="node-op"> → </span><NodeName>{targetLabel}</NodeName></strong>
        </div>
      </div>
      <div className="selection-editor-body">
        <EdgeTransferPlot
          mechanism={draft}
          state={sourceState}
          sourceLabel={sourceLabel}
          targetLabel={targetLabel}
          onPoints={editablePoints ? (points) => setDraft({ ...draft, points }) : undefined}
        />
        <div className="value-card">
          <strong>current contribution</strong>
          <span className={contribution >= 0 ? "positive" : "negative"}>{formatSignedValue(contribution)}</span>
        </div>
        <EdgePanel edge={props.edge} mechanism={draft} onDraft={setDraft} />
        <div className="edge-commit-row">
          <button type="button" className="primary" disabled={!dirty} onClick={() => props.onMechanism(props.edge, draft)}>
            {dirty ? "Commit & simulate" : "Up to date"}
          </button>
          <button type="button" disabled={!dirty} onClick={() => setDraft(committed)}>Reset</button>
        </div>
        <div className="button-row">
          <button type="button" onClick={() => props.onDelete(props.edge.id)}>delete</button>
        </div>
      </div>
    </div>
  );
}

function EdgePanel(props: {
  edge: GraphEdge;
  mechanism: EdgeMechanism;
  onDraft: (mechanism: EdgeMechanism) => void;
}) {
  const mechanism = props.mechanism;
  return (
    <div className="edge-panel">
      <Checkbox label="enabled in simulation" checked={mechanism.enabled} onChange={(enabled) => props.onDraft({ ...mechanism, enabled })} />
      <div className="field">
        <span>function</span>
        <FunctionPicker
          label={`function ${props.edge.source} to ${props.edge.target}`}
          value={mechanism.kind}
          onOpen={() => undefined}
          onChange={(kind) => props.onDraft(defaultEdgeMechanism(kind))}
        />
      </div>
      <EdgeMechanismFields edge={props.edge} mechanism={mechanism} onMechanism={(_edge, patch) => props.onDraft({ ...mechanism, ...patch })} />
      {mechanism.kind === "linear" && (
        <TactileNumberField
          label="coefficient"
          value={mechanism.coefficient}
          step={0.1}
          nudge={1}
          onChange={(coefficient) => props.onDraft({ ...mechanism, coefficient })}
        />
      )}
    </div>
  );
}

function EdgeTransferPlot(props: {
  mechanism: EdgeMechanism;
  state?: SimulatedNodeState;
  sourceLabel: string;
  targetLabel: string;
  onPoints?: (points: { x: number; y: number }[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const emp = props.state?.empirical;
  const pts = props.mechanism.points ?? [];
  // Domain + sampled curve are computed by a pure helper so the axes auto-fit
  // each function (no forced zero baseline) and the logic is unit-testable.
  const empMin = emp?.min;
  const empMax = emp?.max;
  const model = computeEdgeTransfer(props.mechanism, {
    domain: typeof empMin === "number" && typeof empMax === "number" ? { min: empMin, max: empMax } : null
  });
  const { x0, x1, y0, y1 } = model;
  const W = 320, H = 188;
  const frame = chartFrame({ width: W, height: H, x: { ticks: true, title: true }, y: { ticks: true, title: true }, xDomain: [x0, x1], yDomain: [y0, y1] });
  const { plot, anchors } = frame;
  const sx = frame.xScale;
  const sy = frame.yScale;
  const line = model.samples.filter((point) => point.finite).map((point) => `${sx(point.x).toFixed(1)},${sy(point.y).toFixed(1)}`).join(" ");
  const mean = emp?.mean;

  const toData = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * W;
    const vy = ((clientY - rect.top) / rect.height) * H;
    const dataX = x0 + ((vx - plot.x) / plot.width) * (x1 - x0);
    const dataY = y0 + (1 - (vy - plot.y) / plot.height) * (y1 - y0);
    return { x: dataX, y: dataY };
  };
  const onMove = (event: React.PointerEvent) => {
    if (dragIndex === null || !props.onPoints) return;
    const data = toData(event.clientX, event.clientY);
    if (!data) return;
    // Clamp loosely (one plot-width of slack) rather than to the current axis,
    // so dragging a knot outward lets the axes grow to follow it next render.
    const span = x1 - x0;
    const clampedX = Math.min(Math.max(data.x, x0 - span), x1 + span);
    const next = pts.map((point, index) => index === dragIndex ? { x: clampedX, y: data.y } : point);
    next.sort((a, b) => a.x - b.x);
    props.onPoints(next);
  };

  return (
    <div className="edge-transfer-plot">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="edge-transfer-svg"
        role="img"
        aria-label={`Transfer function from ${props.sourceLabel} to ${props.targetLabel}`}
        onPointerMove={onMove}
        onPointerUp={() => setDragIndex(null)}
        onPointerLeave={() => setDragIndex(null)}
      >
        <rect className="edge-transfer-bg" x={plot.x} y={plot.y} width={plot.width} height={plot.height} rx="5" />
        {model.hasZeroLine && <line className="edge-transfer-zero" x1={plot.x} x2={plot.right} y1={sy(0)} y2={sy(0)} />}
        {mean !== null && mean !== undefined && mean >= x0 && mean <= x1 && (
          <line className="edge-transfer-mean" x1={sx(mean)} x2={sx(mean)} y1={plot.y} y2={plot.bottom} />
        )}
        <polyline className="edge-transfer-line" points={line} />
        {model.xTicks.map((tick, index) => (
          <text
            key={`x${index}`}
            className="edge-transfer-tick"
            x={sx(tick)}
            y={anchors.ticks.xY}
            textAnchor={index === 0 ? "start" : index === model.xTicks.length - 1 ? "end" : "middle"}
          >{formatValue(tick)}</text>
        ))}
        {model.yTicks.map((tick, index) => (
          <text key={`y${index}`} className="edge-transfer-tick" x={anchors.ticks.yX} y={sy(tick) + 4} textAnchor="end">{formatValue(tick)}</text>
        ))}
        <SvgAxisName className="edge-transfer-axis-title" label={props.sourceLabel} x={plot.cx} y={anchors.title.xY} maxChars={26} />
        <text className="edge-transfer-axis-label" x={anchors.title.yX} y={plot.cy} textAnchor="middle" transform={`rotate(-90 ${anchors.title.yX} ${plot.cy})`}>contribution</text>
        {props.onPoints && pts.map((point, index) => (
          <circle
            key={index}
            className={`edge-transfer-handle${dragIndex === index ? " active" : ""}`}
            cx={sx(point.x)}
            cy={sy(point.y)}
            r={5}
            onPointerDown={(event) => {
              setDragIndex(index);
              try { (event.currentTarget as Element).setPointerCapture(event.pointerId); } catch { /* capture is best-effort */ }
            }}
            onPointerMove={(event) => { if (dragIndex === index) onMove(event); }}
            onPointerUp={() => setDragIndex(null)}
          />
        ))}
      </svg>
      <div className="edge-transfer-caption">
        <span>{props.sourceLabel} → contribution to {props.targetLabel}</span>
        {props.onPoints && <span className="muted">drag the points to shape the curve</span>}
      </div>
    </div>
  );
}

function InteractionEditor(props: {
  nodeId: string;
  parentIds: string[];
  interactions: NodeInteraction[];
  onChange: (interactions: NodeInteraction[]) => void;
}) {
  const add = (kind: NodeInteraction["kind"]) => {
    props.onChange([...props.interactions, defaultInteraction(kind, props.parentIds)]);
  };
  const update = (id: string, patch: Partial<NodeInteraction>) => {
    props.onChange(props.interactions.map((interaction) => interaction.id === id ? ({ ...interaction, ...patch } as NodeInteraction) : interaction));
  };
  const remove = (id: string) => props.onChange(props.interactions.filter((interaction) => interaction.id !== id));
  return (
    <div className="interaction-editor">
      <div className="compact-row">
        <strong>Interactions</strong>
        <button type="button" onClick={() => add("product")}>product</button>
        <button type="button" onClick={() => add("smooth_gated")}>smooth gate</button>
      </div>
      {props.interactions.length === 0 && <p className="muted">Add moderation terms between parents of {props.nodeId}.</p>}
      {props.interactions.map((interaction) => (
        <div className="interaction-row" key={interaction.id}>
          <select value={interaction.kind} onChange={(event) => update(interaction.id, defaultInteraction(event.target.value as NodeInteraction["kind"], props.parentIds))}>
            <option value="product">product</option>
            <option value="smooth_gated">smooth gated</option>
          </select>
          {interaction.kind === "product" ? (
            <>
              <ParentSelect value={interaction.left} parentIds={props.parentIds} onChange={(left) => update(interaction.id, { left })} />
              <ParentSelect value={interaction.right} parentIds={props.parentIds} onChange={(right) => update(interaction.id, { right })} />
              <TactileNumberField label="gamma" value={interaction.coefficient} step={0.1} nudge={1} onChange={(coefficient) => update(interaction.id, { coefficient })} />
            </>
          ) : (
            <>
              <ParentSelect value={interaction.source} parentIds={props.parentIds} onChange={(source) => update(interaction.id, { source })} />
              <ParentSelect value={interaction.gate} parentIds={props.parentIds} onChange={(gate) => update(interaction.id, { gate })} />
              <TactileNumberField label="gamma" value={interaction.coefficient} step={0.1} nudge={1} onChange={(coefficient) => update(interaction.id, { coefficient })} />
              <TactileNumberField label="threshold" value={interaction.threshold} step={0.1} nudge={1} onChange={(threshold) => update(interaction.id, { threshold })} />
              <TactileNumberField label="steepness" value={interaction.steepness} min={0.001} step={0.1} nudge={1} onChange={(steepness) => update(interaction.id, { steepness })} />
            </>
          )}
          <button type="button" onClick={() => remove(interaction.id)}>remove</button>
        </div>
      ))}
    </div>
  );
}

function ParentSelect(props: { value: string; parentIds: string[]; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>parent</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {props.parentIds.map((id) => <option value={id} key={id}>{id}</option>)}
      </select>
    </label>
  );
}

function defaultInteraction(kind: NodeInteraction["kind"], parentIds: string[]): NodeInteraction {
  const left = parentIds[0] ?? "";
  const right = parentIds[1] ?? left;
  const id = `interaction-${Math.random().toString(36).slice(2, 9)}`;
  if (kind === "smooth_gated") {
    return { id, kind, source: left, gate: right, coefficient: 1, threshold: 0, steepness: 4 };
  }
  return { id, kind, left, right, coefficient: 1 };
}

function mechanismLabel(kind: EdgeMechanismKind): string {
  return EDGE_MECHANISMS.find((item) => item.kind === kind)?.label ?? kind;
}

function mechanismDescription(kind: EdgeMechanismKind): string {
  return EDGE_MECHANISMS.find((item) => item.kind === kind)?.description ?? mechanismLabel(kind);
}

function FunctionGlyph({ kind }: { kind: EdgeMechanismKind }) {
  return (
    <svg className="function-glyph" viewBox="0 0 32 20" aria-hidden="true" focusable="false">
      <path className="function-glyph-axis" d="M 3 17 H 29 M 4 18 V 3" />
      <path className="function-glyph-curve" d={functionGlyphPath(kind)} />
    </svg>
  );
}

function FunctionPicker(props: { label: string; value: EdgeMechanismKind; onOpen: () => void; onChange: (kind: EdgeMechanismKind) => void }) {
  const [open, setOpen] = useState(false);
  const selected = EDGE_MECHANISMS.find((item) => item.kind === props.value) ?? EDGE_MECHANISMS[0];
  return (
    <div
      className="function-picker"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="function-picker-trigger"
        aria-label={props.label}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selected?.description}
        onClick={() => {
          props.onOpen();
          setOpen((value) => !value);
        }}
      >
        <FunctionGlyph kind={props.value} />
        <span>{selected?.label ?? props.value}</span>
      </button>
      {open && (
        <div className="function-picker-menu" role="listbox" aria-label={`${props.label} options`}>
          {EDGE_MECHANISMS.map((item) => (
            <button
              type="button"
              role="option"
              aria-selected={item.kind === props.value}
              className={item.kind === props.value ? "function-picker-option selected" : "function-picker-option"}
              key={item.kind}
              title={item.description}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                props.onChange(item.kind);
                setOpen(false);
              }}
            >
              <FunctionGlyph kind={item.kind} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function functionGlyphPath(kind: EdgeMechanismKind): string {
  if (kind === "absorbing") return "M 4 16 L 12 16 L 12 7 L 20 7 L 20 16 L 28 16";
  if (kind === "threshold") return "M 4 16 H 15 V 5 H 28";
  if (kind === "smooth_threshold") return "M 4 16 C 10 16 11 5 18 5 C 22 5 24 4 28 4";
  if (kind === "saturating") return "M 4 16 C 9 16 11 10 16 10 C 21 10 23 4 28 4";
  if (kind === "quadratic") return "M 4 5 Q 16 22 28 5";
  if (kind === "piecewise_linear") return "M 4 16 L 11 10 L 18 13 L 28 4";
  if (kind === "hill_emax") return "M 4 16 C 12 16 12 6 20 6 H 28";
  if (kind === "log_linear") return "M 4 16 C 7 9 12 6 28 4";
  if (kind === "power_law") return "M 4 16 C 12 16 20 10 28 4";
  if (kind === "monotone_spline") return "M 4 16 C 10 15 10 11 16 10 S 22 5 28 4";
  return "M 4 16 L 28 4";
}

function EdgeMechanismFields(props: { edge: GraphEdge; mechanism: EdgeMechanism; onMechanism: (edge: GraphEdge, patch: Partial<EdgeMechanism>) => void }) {
  const set = (patch: Partial<EdgeMechanism>) => props.onMechanism(props.edge, patch);
  if (props.mechanism.kind === "threshold") {
    return <>
      <TactileNumberField label="threshold" value={props.mechanism.threshold} step={0.1} nudge={1} onChange={(threshold) => set({ threshold })} />
      <TactileNumberField label="low" value={props.mechanism.low} step={0.1} nudge={1} onChange={(low) => set({ low })} />
      <TactileNumberField label="high" value={props.mechanism.high} step={0.1} nudge={1} onChange={(high) => set({ high })} />
    </>;
  }
  if (props.mechanism.kind === "smooth_threshold") {
    return <>
      <TactileNumberField label="scale" value={props.mechanism.scale} step={0.1} nudge={1} onChange={(scale) => set({ scale })} />
      <TactileNumberField label="threshold" value={props.mechanism.threshold} step={0.1} nudge={1} onChange={(threshold) => set({ threshold })} />
      <TactileNumberField label="steepness" value={props.mechanism.steepness} min={0.001} step={0.1} nudge={1} onChange={(steepness) => set({ steepness })} />
    </>;
  }
  if (props.mechanism.kind === "saturating") {
    return <>
      <TactileNumberField label="scale" value={props.mechanism.scale} step={0.1} nudge={1} onChange={(scale) => set({ scale })} />
      <TactileNumberField label="midpoint" value={props.mechanism.midpoint} step={0.1} nudge={1} onChange={(midpoint) => set({ midpoint })} />
      <TactileNumberField label="steepness" value={props.mechanism.steepness} min={0.001} step={0.1} nudge={1} onChange={(steepness) => set({ steepness })} />
    </>;
  }
  if (props.mechanism.kind === "quadratic") {
    return <>
      <TactileNumberField label="linear term" value={props.mechanism.beta1} step={0.1} nudge={1} onChange={(beta1) => set({ beta1, coefficient: beta1 })} />
      <TactileNumberField label="quadratic term" value={props.mechanism.beta2} step={0.1} nudge={1} onChange={(beta2) => set({ beta2 })} />
    </>;
  }
  if (props.mechanism.kind === "piecewise_linear") {
    return <PointsEditor points={props.mechanism.points} onChange={(points) => set({ points })} />;
  }
  if (props.mechanism.kind === "hill_emax") {
    return <>
      <TactileNumberField label="baseline" value={props.mechanism.baseline} step={0.1} nudge={1} onChange={(baseline) => set({ baseline })} />
      <TactileNumberField label="max effect" value={props.mechanism.maxEffect} step={0.1} nudge={1} onChange={(maxEffect) => set({ maxEffect })} />
      <TactileNumberField label="EC50" value={props.mechanism.ec50} min={0.001} step={0.1} nudge={1} onChange={(ec50) => set({ ec50 })} />
      <TactileNumberField label="Hill slope" value={props.mechanism.exponent} min={0.001} step={0.1} nudge={1} onChange={(exponent) => set({ exponent })} />
    </>;
  }
  if (props.mechanism.kind === "log_linear") {
    return <>
      <TactileNumberField label="coefficient" value={props.mechanism.coefficient} step={0.1} nudge={1} onChange={(coefficient) => set({ coefficient })} />
      <TactileNumberField label="offset" value={props.mechanism.offset} step={0.1} nudge={1} onChange={(offset) => set({ offset })} />
      <TactileNumberField label="baseline" value={props.mechanism.baseline} step={0.1} nudge={1} onChange={(baseline) => set({ baseline })} />
    </>;
  }
  if (props.mechanism.kind === "power_law") {
    return <>
      <TactileNumberField label="coefficient" value={props.mechanism.coefficient} step={0.1} nudge={1} onChange={(coefficient) => set({ coefficient })} />
      <TactileNumberField label="input scale" value={props.mechanism.scale} min={0.001} step={0.1} nudge={1} onChange={(scale) => set({ scale })} />
      <TactileNumberField label="offset" value={props.mechanism.offset} step={0.1} nudge={1} onChange={(offset) => set({ offset })} />
      <TactileNumberField label="exponent" value={props.mechanism.exponent} min={0.001} step={0.1} nudge={1} onChange={(exponent) => set({ exponent })} />
      <TactileNumberField label="baseline" value={props.mechanism.baseline} step={0.1} nudge={1} onChange={(baseline) => set({ baseline })} />
    </>;
  }
  if (props.mechanism.kind === "monotone_spline") {
    return <PointsEditor points={props.mechanism.points} onChange={(points) => set({ points })} />;
  }
  return null;
}

// Add / remove knots for piecewise & spline edges; the heights are dragged on the preview.
function PointsEditor(props: { points: { x: number; y: number }[]; onChange: (points: { x: number; y: number }[]) => void }) {
  const points = props.points;
  const addKnot = () => {
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const last = sorted[sorted.length - 1];
    const first = sorted[0];
    const x = last && first ? (last.x + (last.x - first.x) / Math.max(1, sorted.length - 1)) : 1;
    props.onChange([...sorted, { x: Number(x.toFixed(2)), y: last?.y ?? 0 }]);
  };
  const removeKnot = () => {
    if (points.length <= 2) return;
    const sorted = [...points].sort((a, b) => a.x - b.x);
    props.onChange(sorted.slice(0, -1));
  };
  return (
    <div className="points-editor">
      <span className="muted">{points.length} knots — drag the points on the graph above to shape the curve.</span>
      <div className="compact-row">
        <button type="button" onClick={addKnot}>add knot</button>
        <button type="button" disabled={points.length <= 2} onClick={removeKnot}>remove knot</button>
      </div>
    </div>
  );
}

function DistributionEditor(props: { label: string; distribution: NodeDistribution; onChange: (distribution: NodeDistribution) => void }) {
  const distribution = props.distribution;
  return (
    <div className="distribution-editor">
      <label className="field">
        <span>{props.label}</span>
        <select value={distribution.kind} onChange={(event) => props.onChange(defaultDistribution(event.target.value as NodeDistribution["kind"]))}>
          <option value="constant">constant</option>
          <option value="normal">normal</option>
          <option value="lognormal">lognormal</option>
          <option value="uniform">uniform</option>
          <option value="bernoulli">bernoulli</option>
          <option value="poisson">poisson</option>
          <option value="beta">beta</option>
          <option value="laplace">laplace</option>
          <option value="student_t">Student-t</option>
          <option value="gamma">gamma</option>
          <option value="exponential">exponential</option>
        </select>
      </label>
      {distribution.kind === "constant" && <TactileNumberField
        key="constant-value"
        label="value"
        value={distribution.value}
        min={distribution.value - 10}
        max={distribution.value + 10}
        step={0.1}
        onChange={(value) => props.onChange({ ...distribution, value })}
      />}
      {distribution.kind === "normal" && <>
        <TactileNumberField
          key="normal-mean"
          label="mean"
          value={distribution.mean}
          min={distribution.mean - 10}
          max={distribution.mean + 10}
          step={0.1}
          onChange={(mean) => props.onChange({ ...distribution, mean })}
        />
        <TactileNumberField
          key="normal-sd"
          label="sd"
          value={distribution.sd}
          min={0.001}
          max={Math.max(10, distribution.sd * 3)}
          step={0.1}
          onChange={(sd) => props.onChange({ ...distribution, sd })}
        />
      </>}
      {distribution.kind === "lognormal" && <>
        <TactileNumberField label="log mean" value={distribution.meanLog} step={0.1} nudge={1} onChange={(meanLog) => props.onChange({ ...distribution, meanLog })} />
        <TactileNumberField label="log sd" value={distribution.sdLog} min={0.001} step={0.1} nudge={1} onChange={(sdLog) => props.onChange({ ...distribution, sdLog })} />
      </>}
      {distribution.kind === "uniform" && <>
        <TactileNumberField label="min" value={distribution.min} step={0.1} nudge={1} onChange={(min) => props.onChange({ ...distribution, min })} />
        <TactileNumberField label="max" value={distribution.max} step={0.1} nudge={1} onChange={(max) => props.onChange({ ...distribution, max })} />
      </>}
      {distribution.kind === "bernoulli" && <TactileNumberField key="bernoulli-p" label="p" value={distribution.p} min={0} max={1} step={0.01} nudge={0.01} onChange={(p) => props.onChange({ ...distribution, p })} />}
      {distribution.kind === "poisson" && <TactileNumberField label="lambda" value={distribution.lambda} min={0.001} step={0.1} nudge={1} onChange={(lambda) => props.onChange({ ...distribution, lambda })} />}
      {distribution.kind === "beta" && <>
        <TactileNumberField label="alpha" value={distribution.alpha} min={0.001} step={0.1} nudge={1} onChange={(alpha) => props.onChange({ ...distribution, alpha })} />
        <TactileNumberField label="beta" value={distribution.beta} min={0.001} step={0.1} nudge={1} onChange={(beta) => props.onChange({ ...distribution, beta })} />
      </>}
      {distribution.kind === "laplace" && <>
        <TactileNumberField label="mean" value={distribution.mean} step={0.1} nudge={1} onChange={(mean) => props.onChange({ ...distribution, mean })} />
        <TactileNumberField label="scale" value={distribution.scale} min={0.001} step={0.1} nudge={1} onChange={(scale) => props.onChange({ ...distribution, scale })} />
      </>}
      {distribution.kind === "student_t" && <>
        <TactileNumberField label="mean" value={distribution.mean} step={0.1} nudge={1} onChange={(mean) => props.onChange({ ...distribution, mean })} />
        <TactileNumberField label="scale" value={distribution.scale} min={0.001} step={0.1} nudge={1} onChange={(scale) => props.onChange({ ...distribution, scale })} />
        <TactileNumberField label="df" value={distribution.df} min={0.001} step={0.1} nudge={1} onChange={(df) => props.onChange({ ...distribution, df })} />
      </>}
      {distribution.kind === "gamma" && <>
        <TactileNumberField label="shape" value={distribution.shape} min={0.001} step={0.1} nudge={1} onChange={(shape) => props.onChange({ ...distribution, shape })} />
        <TactileNumberField label="scale" value={distribution.scale} min={0.001} step={0.1} nudge={1} onChange={(scale) => props.onChange({ ...distribution, scale })} />
      </>}
      {distribution.kind === "exponential" && <TactileNumberField label="rate" value={distribution.rate} min={0.001} step={0.1} nudge={1} onChange={(rate) => props.onChange({ ...distribution, rate })} />}
    </div>
  );
}

function EffectPanel({ effectKind, analysis }: { effectKind: EffectKind; analysis: AnalysisReport }) {
  if (effectKind === "instrument") {
    return (
      <div>
        <p>{analysis.instruments.message}</p>
        <List values={analysis.instruments.instruments.map((item) => item.conditionedOn.length ? `${item.instrument} | ${item.conditionedOn.join(", ")}` : item.instrument)} empty="No instruments found." />
      </div>
    );
  }
  const report = effectKind === "direct" ? analysis.directEffect : effectKind === "causalOdds" ? analysis.causalOdds : analysis.totalEffect;
  return (
    <div>
      <p className={report.valid ? "assurance" : "warning"}>{report.message}</p>
      <p>Exposure{analysis.exposures.length === 1 ? "" : "s"}: {analysis.exposures.join(", ") || "not set"}</p>
      <p>Outcome{analysis.outcomes.length === 1 ? "" : "s"}: {analysis.outcomes.join(", ") || "not set"}</p>
      {report.minimalSets.length > 0 && <List values={report.minimalSets.map((set) => set.length ? `{${set.join(", ")}}` : "{}")} empty="" />}
    </div>
  );
}

function ImplicationPanel({ analysis }: { analysis: AnalysisReport }) {
  if (analysis.implications.length === 0) return <p className="muted">No testable conditional independencies found in the current bounded search.</p>;
  return <List values={analysis.implications.map((item) => `${item.left} independent ${item.right}${item.given.length ? ` | ${item.given.join(", ")}` : ""}`)} empty="" />;
}

function SummaryPanel({ analysis }: { analysis: AnalysisReport }) {
  if (analysis.cycle) return <p className="warning">Directed cycle: {analysis.cycle.join(" -> ")}</p>;
  return (
    <table className="summary-table">
      <tbody>
        <tr><td>exposure(s)</td><td>{analysis.exposures.join(", ") || "not set"}</td></tr>
        <tr><td>outcome(s)</td><td>{analysis.outcomes.join(", ") || "not set"}</td></tr>
        <tr><td>adjusted</td><td>{analysis.adjusted.join(", ") || "none"}</td></tr>
        <tr><td>sample markers</td><td>{analysis.selected.join(", ") || "none"}</td></tr>
        <tr><td>covariates</td><td>{analysis.covariateCount}</td></tr>
        <tr><td>causal paths</td><td>{analysis.causalPathCount}</td></tr>
        <tr><td>open biasing paths</td><td>{analysis.openBiasingPathCount}</td></tr>
      </tbody>
    </table>
  );
}

function BibliographyPanel(props: { topic: BibliographyTopic; onTopic: (topic: BibliographyTopic) => void }) {
  const entries = BIBLIOGRAPHY.filter((entry) => entry.topic === props.topic);
  return (
    <div className="bibliography-panel">
      <select value={props.topic} onChange={(event) => props.onTopic(event.target.value as BibliographyTopic)}>
        {BIBLIOGRAPHY_TOPICS.map((topic) => <option value={topic.id} key={topic.id}>{topic.label}</option>)}
      </select>
      <ul className="bibliography-list">
        {entries.map((entry) => (
          <li key={entry.url}>
            <span>{entry.label}</span>
            <a href={entry.url} target="_blank" rel="noreferrer">{entry.citation}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({ title, pending, children }: { title: string; pending?: boolean; children: React.ReactNode }) {
  return (
    <section className="panel-section" aria-busy={pending}>
      <div className="panel-section-title">
        <h2>{title}</h2>
        <PendingChip pending={Boolean(pending)} />
      </div>
      {children}
    </section>
  );
}

type ModuleTone = "edit" | "output" | "scenario";

function ModuleFrame({
  children,
  className,
  ...headerProps
}: {
  tone: ModuleTone;
  label: string;
  title: string;
  detail: string;
  pending?: boolean;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`module-frame ${headerProps.tone}${className ? ` ${className}` : ""}`}>
      <PaneHeader {...headerProps} />
      <div className="module-pane-body">{children}</div>
    </div>
  );
}

function PaneHeader({
  tone,
  label,
  title,
  detail,
  pending,
  action
}: {
  tone: ModuleTone;
  label: string;
  title: string;
  detail: string;
  pending?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className={`module-pane-header ${tone}`}>
      <div className="module-pane-heading">
        <span>{label}</span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <div className="module-pane-header-actions">
        <PendingChip pending={Boolean(pending)} />
        {action}
      </div>
    </div>
  );
}

function IconButton({ label, active, pressed, disabled, onClick, children, badge }: { label: string; active?: boolean; pressed?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; badge?: "warning" | "violated" | null }) {
  return <button type="button" className={active ? "icon-button active" : "icon-button"} title={badge ? `${label} (positivity ${badge === "violated" ? "likely violated" : "looks weak"})` : label} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>{children}{badge ? <span className={`icon-button-badge ${badge}`} aria-hidden="true">!</span> : null}<span className="icon-button-label">{label}</span></button>;
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="check-row"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

function RoleToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className={checked ? "role-toggle active" : "role-toggle"}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function RadioGroup({ value, options, onChange }: { value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <div>{options.map(([id, label]) => <label className="check-row" key={id}><input type="radio" checked={value === id} onChange={() => onChange(id)} /><span>{label}</span></label>)}</div>;
}

function NumberField({ label, value, min, max, step = 0.1, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return <label className="field"><span>{label}</span><input type="number" value={formatInputNumber(value)} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function TactileNumberField({
  label,
  value,
  min,
  max,
  step = 0.1,
  nudge = 1,
  onChange
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  nudge?: number;
  onChange: (value: number) => void;
}) {
  const [range, setRange] = useState(() => tactileSliderRange(min, max, value, nudge));
  useEffect(() => {
    setRange((current) => {
      const next = tactileSliderRange(min, max, value, nudge);
      if (value < current.min || value > current.max) return next;
      if ((min !== undefined && current.min < min) || (max !== undefined && current.max > max)) return next;
      return current;
    });
  }, [max, min, nudge, value]);
  const sliderValue = clamp(value, range.min, range.max);
  const smallNudge = Math.max(Math.abs(nudge), Math.abs(step), Number.EPSILON);
  const smallLabel = trimNumber(smallNudge);
  const commit = (next: number) => {
    if (!Number.isFinite(next)) return;
    onChange(clampNumber(roundToStep(next, step), min, max));
  };
  const nudgeBy = (delta: number) => commit(value + delta);
  const nudgePercent = (direction: -1 | 1) => {
    const rangeFallback = Math.max(Math.abs(range.max - range.min) * 0.1, smallNudge);
    const magnitude = value === 0 ? rangeFallback : Math.abs(value) * 0.1;
    commit(value + direction * magnitude);
  };
  return (
    <div className="tactile-number-field">
      <div className="tactile-number-head">
        <span>{label}</span>
        <input
          aria-label={label}
          type="number"
          value={formatInputNumber(value)}
          min={min}
          max={max}
          step={step}
          onChange={(event) => commit(Number(event.target.value))}
        />
      </div>
      <div className="tactile-number-controls">
        <button type="button" aria-label={`${label} decrease 10 percent`} onClick={() => nudgePercent(-1)}>-10%</button>
        <button type="button" aria-label={`${label} decrease ${smallLabel}`} onClick={() => nudgeBy(-smallNudge)}>-{smallLabel}</button>
        <input
          type="range"
          aria-label={`${label} slider`}
          min={range.min}
          max={range.max}
          step={step}
          value={sliderValue}
          onChange={(event) => commit(Number(event.target.value))}
        />
        <button type="button" aria-label={`${label} increase ${smallLabel}`} onClick={() => nudgeBy(smallNudge)}>+{smallLabel}</button>
        <button type="button" aria-label={`${label} increase 10 percent`} onClick={() => nudgePercent(1)}>+10%</button>
      </div>
    </div>
  );
}

function tactileSliderRange(min: number | undefined, max: number | undefined, value: number, nudge: number): { min: number; max: number } {
  const magnitude = Math.max(Math.abs(value) * 2, Math.abs(nudge) * 100, 100);
  let safeMin = min ?? value - magnitude;
  let safeMax = max ?? value + magnitude;
  if (safeMin > safeMax) {
    const nextMin = safeMax;
    safeMax = safeMin;
    safeMin = nextMin;
  }
  if (!Number.isFinite(safeMin) || !Number.isFinite(safeMax) || Math.abs(safeMax - safeMin) < 1e-9) {
    safeMin = Number.isFinite(value) ? value - 1 : -1;
    safeMax = Number.isFinite(value) ? value + 1 : 1;
  }
  if (Number.isFinite(value)) {
    if (value < safeMin) safeMin = value;
    if (value > safeMax) safeMax = value;
  }
  if (Math.abs(safeMax - safeMin) < 1e-9) {
    safeMin -= 1;
    safeMax += 1;
  }
  return { min: safeMin, max: safeMax };
}

function clampNumber(value: number, min?: number, max?: number): number {
  const lower = min ?? -Infinity;
  const upper = max ?? Infinity;
  return Math.min(upper, Math.max(lower, value));
}

function List({ values, empty }: { values: string[]; empty: string }) {
  if (values.length === 0) return empty ? <p className="muted">{empty}</p> : null;
  return <ul className="plain-list">{values.map((value) => <li key={value}>{value}</li>)}</ul>;
}

function designModulesForMode(mode: WorkbenchMode) {
  if (mode === "pro") return DESIGN_MODULES;
  return DESIGN_MODULES.filter((module) => module.basic);
}

function designModuleScopeLabel(mode: WorkbenchMode): string {
  if (mode === "basic") return "Small set for quick DAG explanations and common internet-argument traps.";
  return "All tools are visible, including TODO modules that still need data and code plumbing.";
}

function nodeDisplayName(node: GraphNode): string {
  // Normalized name (unit + id parenthetical stripped, underscores → spaces) so
  // headings read like the node-name chips instead of exposing raw ids.
  return displayNodeName(node.label || node.id);
}

function nodeOutputLabel(node: GraphNode): string {
  return node.label || node.id;
}

function abbreviateLabel(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3))}...`;
}

function binaryShortLabel(value: string): string {
  return abbreviateLabel(value.replace(/\s+\([^)]*\)$/u, ""), 18);
}

function binaryAxisValueLabel(label: string, value: 0 | 1): string {
  return `${binaryShortLabel(label)}=${value}`;
}

function binaryDisplayValueLabel(node: GraphNode | undefined, fallbackLabel: string, value: 0 | 1): string {
  const unit = node ? normalizeVariableModel(node.variable).unit.trim() : "";
  if (unit && value === 1) return abbreviateLabel(unit, 18);
  if (unit && value === 0) return "none";
  return binaryAxisValueLabel(fallbackLabel, value);
}

function buildSimulationDerivedCache(simulation: SimulationResult): SimulationDerivedCache {
  const nodes = new Map<string, NodeDistributionSummary>();
  for (const [id, state] of Object.entries(simulation.nodeStates)) {
    const domain = distributionPlotDomain(state);
    const finiteSamples = state.empirical.samples.filter(Number.isFinite);
    nodes.set(id, {
      domain,
      finiteSamples,
      histogram18: domain ? histogram(state.empirical.samples, domain, 18, state.empirical.weights) : [],
      histogram20: domain ? histogram(state.empirical.samples, domain, 20, state.empirical.weights) : []
    });
  }
  return {
    simulation,
    nodes,
    pairs: new Map()
  };
}

function pairDerivedSummary(cache: SimulationDerivedCache, xId: string, yId: string): PairDerivedSummary {
  const key = `${xId}\u0000${yId}`;
  const cached = cache.pairs.get(key);
  if (cached) return cached;
  const xState = cache.simulation.nodeStates[xId];
  const yState = cache.simulation.nodeStates[yId];
  const points = scatterPoints(xState, yState);
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const cells = binaryCells(points);
  const summary: PairDerivedSummary = {
    points,
    stats: weightedScatterStats(points),
    binaryCells: cells,
    binaryContrast: binaryOutcomeContrastFromCells(cells),
    binaryContinuousGroups: binaryContinuousGroups(points),
    xDomain: scatterDomain(xValues, xState, cache.nodes.get(xId)),
    yDomain: scatterDomain(yValues, yState, cache.nodes.get(yId)),
    ySampleDomain: scatterSampleDomain(yValues, yState, cache.nodes.get(yId))
  };
  cache.pairs.set(key, summary);
  return summary;
}

function scatterPoints(xState: SimulatedNodeState | undefined, yState: SimulatedNodeState | undefined): ScatterPoint[] {
  const xSamples = xState?.empirical.samples ?? [];
  const ySamples = yState?.empirical.samples ?? [];
  const xWeights = xState?.empirical.weights ?? [];
  const yWeights = yState?.empirical.weights ?? [];
  const length = Math.min(xSamples.length, ySamples.length);
  const points: ScatterPoint[] = [];
  for (let index = 0; index < length; index += 1) {
    const x = xSamples[index];
    const y = ySamples[index];
    if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push({
      x,
      y,
      weight: Math.max(0, xWeights[index] ?? yWeights[index] ?? 1),
      index
    });
  }
  return points;
}

function binaryContinuousGroups(points: ScatterPoint[]): BinaryContinuousGroup[] {
  const groups: BinaryContinuousGroup[] = [
    { value: 0, count: 0, weight: 0, mean: null, share: 0 },
    { value: 1, count: 0, weight: 0, mean: null, share: 0 }
  ];
  const totals: Record<0 | 1, number> = { 0: 0, 1: 0 };
  for (const point of points) {
    const value = coerceBinary(point.x) as 0 | 1;
    const group = groups[value];
    if (!group) continue;
    group.count += 1;
    group.weight += point.weight;
    totals[value] += point.y * point.weight;
  }
  const totalWeight = groups.reduce((sum, group) => sum + group.weight, 0);
  return groups.map((group) => ({
    ...group,
    mean: group.weight > 0 ? totals[group.value] / group.weight : null,
    share: totalWeight > 0 ? group.weight / totalWeight : 0
  }));
}

function binaryCells(points: ScatterPoint[]): BinaryCell[] {
  const cells: BinaryCell[] = [
    { x: 0, y: 0, weight: 0, count: 0, percent: 0, columnPercent: 0 },
    { x: 1, y: 0, weight: 0, count: 0, percent: 0, columnPercent: 0 },
    { x: 0, y: 1, weight: 0, count: 0, percent: 0, columnPercent: 0 },
    { x: 1, y: 1, weight: 0, count: 0, percent: 0, columnPercent: 0 }
  ];
  for (const point of points) {
    const x = coerceBinary(point.x) as 0 | 1;
    const y = coerceBinary(point.y) as 0 | 1;
    const cell = cells.find((candidate) => candidate.x === x && candidate.y === y);
    if (!cell) continue;
    cell.weight += point.weight;
    cell.count += 1;
  }
  const totalWeight = cells.reduce((sum, cell) => sum + cell.weight, 0);
  const xWeights: Record<0 | 1, number> = {
    0: cells.filter((cell) => cell.x === 0).reduce((sum, cell) => sum + cell.weight, 0),
    1: cells.filter((cell) => cell.x === 1).reduce((sum, cell) => sum + cell.weight, 0)
  };
  return cells.map((cell) => ({
    ...cell,
    percent: totalWeight > 0 ? cell.weight / totalWeight : 0,
    columnPercent: xWeights[cell.x] > 0 ? cell.weight / xWeights[cell.x] : 0
  }));
}

function binaryOutcomeContrast(points: ScatterPoint[]): BinaryOutcomeContrastSummary {
  return binaryOutcomeContrastFromCells(binaryCells(points));
}

function binaryOutcomeContrastFromCells(cells: BinaryCell[]): BinaryOutcomeContrastSummary {
  const weightAtX0 = cells.filter((cell) => cell.x === 0).reduce((sum, cell) => sum + cell.weight, 0);
  const weightAtX1 = cells.filter((cell) => cell.x === 1).reduce((sum, cell) => sum + cell.weight, 0);
  const yAtX0Weight = cells.find((cell) => cell.x === 0 && cell.y === 1)?.weight ?? 0;
  const yAtX1Weight = cells.find((cell) => cell.x === 1 && cell.y === 1)?.weight ?? 0;
  const yAtX0 = weightAtX0 > 0 ? yAtX0Weight / weightAtX0 : null;
  const yAtX1 = weightAtX1 > 0 ? yAtX1Weight / weightAtX1 : null;
  return {
    yAtX0,
    yAtX1,
    diff: yAtX0 === null || yAtX1 === null ? null : yAtX1 - yAtX0
  };
}

function isBinaryGraphNode(node: GraphNode, state?: SimulatedNodeState): boolean {
  return normalizeVariableModel(node.variable).valueType === "binary" || state?.analytic?.distribution.kind === "bernoulli";
}

function isStabilizedIpwNode(node: GraphNode): boolean {
  const method = normalizeVariableModel(node.variable).adjustment.method;
  return method === "stabilized_ipw" || method === "propensity_score_todo";
}

function computeStabilizedIpw(
  exposure: GraphNode,
  outcome: GraphNode | null,
  adjustedNodes: GraphNode[],
  simulation: SimulationResult,
  derived?: SimulationDerivedCache
): StabilizedIpwOutput | null {
  const exposureState = simulation.nodeStates[exposure.id];
  const outcomeState = outcome ? simulation.nodeStates[outcome.id] : undefined;
  const adjustedStates = adjustedNodes.map((node) => simulation.nodeStates[node.id]);
  if (!exposureState || adjustedStates.some((state) => !state)) return null;
  if (outcome && !outcomeState) return null;

  const exposureSamples = exposureState.empirical.samples;
  const outcomeSamples = outcomeState?.empirical.samples ?? [];
  const covariateSamples = adjustedStates.map((state) => state?.empirical.samples ?? []);
  const length = Math.min(
    exposureSamples.length,
    outcome ? outcomeSamples.length : exposureSamples.length,
    ...covariateSamples.map((samples) => samples.length)
  );
  const rows: Array<{ treatment: 0 | 1; outcome: number | null; covariates: number[]; baseWeight: number }> = [];
  for (let index = 0; index < length; index += 1) {
    const exposureValue = exposureSamples[index];
    const outcomeValue = outcome ? outcomeSamples[index] : null;
    if (exposureValue === undefined || !Number.isFinite(exposureValue)) continue;
    if (outcome && (outcomeValue === null || outcomeValue === undefined || !Number.isFinite(outcomeValue))) continue;
    const covariates: number[] = [];
    let valid = true;
    for (const samples of covariateSamples) {
      const value = samples[index];
      if (value === undefined || !Number.isFinite(value)) {
        valid = false;
        break;
      }
      covariates.push(value);
    }
    if (!valid) continue;
    rows.push({
      treatment: coerceBinary(exposureValue) as 0 | 1,
      outcome: typeof outcomeValue === "number" ? outcomeValue : null,
      covariates,
      baseWeight: empiricalWeightAt(index, exposureState, outcomeState, ...adjustedStates)
    });
  }
  if (rows.length < Math.max(20, adjustedNodes.length + 3)) return null;

  const weightSum = rows.reduce((sum, row) => sum + row.baseWeight, 0);
  if (weightSum <= 0) return null;
  const treatedShare = rows.reduce((sum, row) => sum + (row.treatment === 1 ? row.baseWeight : 0), 0) / weightSum;
  if (treatedShare <= 0 || treatedShare >= 1) return null;
  const standardized = standardizeCovariates(rows);
  const propensities = fitLogisticPropensity(standardized, rows.map((row) => row.treatment), rows.map((row) => row.baseWeight));
  if (!propensities) return null;

  const clipMin = 0.03;
  const clipMax = 0.97;
  let clippedCount = 0;
  let maxWeight = 0;
  const weightedRows = rows.map((row, index) => {
    const rawPropensity = propensities[index] ?? treatedShare;
    const propensity = clamp(rawPropensity, clipMin, clipMax);
    if (Math.abs(propensity - rawPropensity) > 1e-9) clippedCount += 1;
    const stabilized = row.treatment === 1
      ? treatedShare / propensity
      : (1 - treatedShare) / (1 - propensity);
    const weight = row.baseWeight * stabilized;
    maxWeight = Math.max(maxWeight, weight);
    return { ...row, weight };
  });
  const weightedTreated = outcome ? weightedOutcomeMean(weightedRows, 1, true) : null;
  const weightedUntreated = outcome ? weightedOutcomeMean(weightedRows, 0, true) : null;
  const rawTreated = outcome ? weightedOutcomeMean(weightedRows, 1, false) : null;
  const rawUntreated = outcome ? weightedOutcomeMean(weightedRows, 0, false) : null;
  const weightedPoints: ScatterPoint[] = outcome
    ? weightedRows
      .filter((row) => row.outcome !== null)
      .map((row, index) => ({
        x: row.treatment,
        y: row.outcome ?? 0,
        weight: row.weight,
        index
      }))
    : [];
  const weightedCells = binaryCells(weightedPoints);
  const weights = weightedRows.map((row) => row.weight);
  return {
    exposure,
    outcome,
    adjustedNodes,
    treatedShare,
    rawTreated,
    rawUntreated,
    rawDiff: rawTreated === null || rawUntreated === null ? null : rawTreated - rawUntreated,
    weightedTreated,
    weightedUntreated,
    weightedDiff: weightedTreated === null || weightedUntreated === null ? null : weightedTreated - weightedUntreated,
    effectiveSampleSize: effectiveSampleSize(weights),
    maxWeight: Number.isFinite(maxWeight) ? maxWeight : null,
    clippedCount,
    sampleCount: rows.length,
    weightedPoints,
    weightedCells,
    weightedContrast: binaryOutcomeContrastFromCells(weightedCells),
    balances: computeIpwBalances(weightedRows, adjustedNodes)
  };
}

function computeIpwBalances(rows: StabilizedIpwRow[], adjustedNodes: GraphNode[]): StabilizedIpwBalance[] {
  return adjustedNodes.map((node, covariateIndex) => {
    const rawTreated = weightedCovariateMoment(rows, covariateIndex, 1, false);
    const rawUntreated = weightedCovariateMoment(rows, covariateIndex, 0, false);
    const weightedTreated = weightedCovariateMoment(rows, covariateIndex, 1, true);
    const weightedUntreated = weightedCovariateMoment(rows, covariateIndex, 0, true);
    const values = rows.map((row) => row.covariates[covariateIndex]).filter((value): value is number => value !== undefined && Number.isFinite(value));
    const meanValues = [
      rawTreated.mean,
      rawUntreated.mean,
      weightedTreated.mean,
      weightedUntreated.mean
    ].filter((value): value is number => value !== null && Number.isFinite(value));
    const min = Math.min(...values, ...meanValues);
    const max = Math.max(...values, ...meanValues);
    const padded = padDomain([min, max]);
    return {
      node,
      domain: padded,
      rawTreatedMean: rawTreated.mean,
      rawUntreatedMean: rawUntreated.mean,
      weightedTreatedMean: weightedTreated.mean,
      weightedUntreatedMean: weightedUntreated.mean,
      rawSmd: standardizedMeanDifference(rawTreated, rawUntreated),
      weightedSmd: standardizedMeanDifference(weightedTreated, weightedUntreated)
    };
  });
}

function weightedCovariateMoment(
  rows: StabilizedIpwRow[],
  covariateIndex: number,
  treatment: 0 | 1,
  stabilized: boolean
): { mean: number | null; variance: number | null } {
  let denominator = 0;
  let numerator = 0;
  for (const row of rows) {
    const value = row.covariates[covariateIndex];
    if (row.treatment !== treatment || value === undefined || !Number.isFinite(value)) continue;
    const weight = stabilized ? row.weight : row.baseWeight;
    numerator += value * weight;
    denominator += weight;
  }
  if (denominator <= 0) return { mean: null, variance: null };
  const mean = numerator / denominator;
  const variance = rows.reduce((sum, row) => {
    const value = row.covariates[covariateIndex];
    if (row.treatment !== treatment || value === undefined || !Number.isFinite(value)) return sum;
    const weight = stabilized ? row.weight : row.baseWeight;
    return sum + weight * (value - mean) * (value - mean);
  }, 0) / denominator;
  return { mean, variance };
}

function standardizedMeanDifference(
  treated: { mean: number | null; variance: number | null },
  untreated: { mean: number | null; variance: number | null }
): number | null {
  if (treated.mean === null || untreated.mean === null || treated.variance === null || untreated.variance === null) return null;
  const pooled = Math.sqrt(Math.max((treated.variance + untreated.variance) / 2, 1e-12));
  return (treated.mean - untreated.mean) / pooled;
}

function padDomain(domain: [number, number]): [number, number] {
  const [min, max] = domain;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [-1, 1];
  if (Math.abs(max - min) < 1e-9) return [min - 1, max + 1];
  const pad = (max - min) * 0.08;
  return [min - pad, max + pad];
}

function standardizeCovariates(rows: Array<{ covariates: number[]; baseWeight: number }>): number[][] {
  const width = rows[0]?.covariates.length ?? 0;
  const weightSum = rows.reduce((sum, row) => sum + row.baseWeight, 0);
  const means = Array.from({ length: width }, (_, column) => (
    rows.reduce((sum, row) => sum + (row.covariates[column] ?? 0) * row.baseWeight, 0) / Math.max(weightSum, Number.EPSILON)
  ));
  const sds = means.map((mean, column) => {
    const variance = rows.reduce((sum, row) => {
      const delta = (row.covariates[column] ?? 0) - mean;
      return sum + row.baseWeight * delta * delta;
    }, 0) / Math.max(weightSum, Number.EPSILON);
    return Math.sqrt(Math.max(variance, 1e-12));
  });
  return rows.map((row) => [
    1,
    ...row.covariates.map((value, column) => (value - (means[column] ?? 0)) / Math.max(sds[column] ?? 1, 1e-6))
  ]);
}

function fitLogisticPropensity(x: number[][], treatment: Array<0 | 1>, weights: number[]): number[] | null {
  const width = x[0]?.length ?? 0;
  if (x.length === 0 || width === 0) return null;
  const treatedShare = treatment.reduce<number>((sum, value, index) => sum + value * (weights[index] ?? 1), 0) /
    Math.max(weights.reduce((sum, value) => sum + value, 0), Number.EPSILON);
  let beta = Array.from({ length: width }, (_, index) => index === 0 ? logit(clamp(treatedShare, 1e-4, 1 - 1e-4)) : 0);
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const gradient = Array.from({ length: width }, () => 0);
    const hessian = Array.from({ length: width }, () => Array.from({ length: width }, () => 0));
    for (let rowIndex = 0; rowIndex < x.length; rowIndex += 1) {
      const row = x[rowIndex];
      if (!row) continue;
      const p = logisticSigmoid(row.reduce((sum, value, column) => sum + value * (beta[column] ?? 0), 0));
      const weight = weights[rowIndex] ?? 1;
      const residual = (treatment[rowIndex] ?? 0) - p;
      const curvature = weight * p * (1 - p);
      for (let column = 0; column < width; column += 1) {
        const xColumn = row[column] ?? 0;
        gradient[column] = (gradient[column] ?? 0) + weight * xColumn * residual;
        for (let other = 0; other < width; other += 1) {
          hessian[column]![other] = (hessian[column]![other] ?? 0) + curvature * xColumn * (row[other] ?? 0);
        }
      }
    }
    for (let index = 1; index < width; index += 1) {
      hessian[index]![index] = (hessian[index]![index] ?? 0) + 1e-4;
    }
    const step = solveLinearSystem(hessian, gradient);
    if (!step) return null;
    beta = beta.map((value, index) => value + clamp(step[index] ?? 0, -2, 2));
    if (step.reduce((max, value) => Math.max(max, Math.abs(value)), 0) < 1e-6) break;
  }
  return x.map((row) => logisticSigmoid(row.reduce((sum, value, column) => sum + value * (beta[column] ?? 0), 0)));
}

function weightedOutcomeMean(
  rows: Array<{ treatment: 0 | 1; outcome: number | null; baseWeight: number; weight: number }>,
  treatment: 0 | 1,
  stabilized: boolean
): number | null {
  let numerator = 0;
  let denominator = 0;
  for (const row of rows) {
    if (row.treatment !== treatment || row.outcome === null) continue;
    const weight = stabilized ? row.weight : row.baseWeight;
    numerator += row.outcome * weight;
    denominator += weight;
  }
  return denominator > 0 ? numerator / denominator : null;
}

function effectiveSampleSize(weights: number[]): number | null {
  const sum = weights.reduce((total, weight) => total + weight, 0);
  const sumSquares = weights.reduce((total, weight) => total + weight * weight, 0);
  if (sum <= 0 || sumSquares <= 0) return null;
  return (sum * sum) / sumSquares;
}

function logit(probability: number): number {
  return Math.log(probability / (1 - probability));
}

function logisticSigmoid(value: number): number {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function solveLinearSystem(matrix: number[][], rhs: number[]): number[] | null {
  const size = rhs.length;
  const augmented = matrix.map((row, index) => [...row.map((value) => value), rhs[index] ?? 0]);
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row]?.[pivot] ?? 0) > Math.abs(augmented[best]?.[pivot] ?? 0)) best = row;
    }
    if (Math.abs(augmented[best]?.[pivot] ?? 0) < 1e-10) return null;
    const pivotRow = augmented[pivot];
    const bestRow = augmented[best];
    if (!pivotRow || !bestRow) return null;
    augmented[pivot] = bestRow;
    augmented[best] = pivotRow;
    const divisor = augmented[pivot]?.[pivot] ?? 1;
    for (let column = pivot; column <= size; column += 1) {
      augmented[pivot]![column] = (augmented[pivot]![column] ?? 0) / divisor;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row]?.[pivot] ?? 0;
      for (let column = pivot; column <= size; column += 1) {
        augmented[row]![column] = (augmented[row]![column] ?? 0) - factor * (augmented[pivot]?.[column] ?? 0);
      }
    }
  }
  return augmented.map((row) => row[size] ?? 0);
}

function binnedAdjustmentNode(
  node: GraphNode,
  state?: SimulatedNodeState,
  summary?: NodeDistributionSummary,
  options: { fallbackBins?: number } = {}
): BinnedAdjustmentNode | null {
  if (!state) return null;
  const variable = normalizeVariableModel(node.variable);
  const domain = summary?.domain ?? distributionPlotDomain(state);
  if (!domain) return null;
  const explicitCutpoints = variable.adjustment.method === "bins" ? sanitizeCutpoints(variable.adjustment.cutpoints, domain) : [];
  const fallbackBins = options.fallbackBins ?? 0;
  const automatic = explicitCutpoints.length === 0 && fallbackBins > 1;
  const cutpoints = automatic
    ? sanitizeCutpoints(defaultQuantileCuts(summary?.finiteSamples ?? state.empirical.samples, domain, fallbackBins), domain)
    : explicitCutpoints;
  if (cutpoints.length === 0) return null;
  return { node, state, domain, cutpoints, automatic };
}

function binaryAdjustmentExpander(node: GraphNode, state?: SimulatedNodeState): AdjustmentStratumCondition[] {
  if (!state) return [];
  return [
    { kind: "binary", node, state, value: 0 },
    { kind: "binary", node, state, value: 1 }
  ];
}

function binnedAdjustmentExpander(item: BinnedAdjustmentNode): AdjustmentStratumCondition[] {
  const boundaries = [item.domain[0], ...item.cutpoints, item.domain[1]];
  return boundaries.slice(0, -1).map((lower, index) => ({
    kind: "bin" as const,
    node: item.node,
    state: item.state,
    lower,
    upper: boundaries[index + 1] ?? item.domain[1],
    index,
    last: index === boundaries.length - 2
  }));
}

function binaryAdjustmentStrata(
  expanders: AdjustmentStratumCondition[][],
  xState: SimulatedNodeState | undefined,
  yState: SimulatedNodeState | undefined
): { items: BinaryAdjustmentStratum[]; truncated: boolean } {
  if (expanders.length === 0) return { items: [], truncated: false };
  let combinations: AdjustmentStratumCondition[][] = [[]];
  for (const levels of expanders) {
    combinations = combinations.flatMap((base) => levels.map((level) => [...base, level]));
  }
  const maxStrata = 16;
  const truncated = combinations.length > maxStrata;
  const shownCombinations = combinations.slice(0, maxStrata);
  return { items: shownCombinations.map((conditions) => {
    const points = filteredBinaryScatterPoints(xState, yState, conditions);
    const cells = binaryCells(points);
    return {
      id: conditions.map(stratumConditionId).join("__"),
      label: conditions.map(stratumConditionLabel).join(", "),
      points,
      cells,
      contrast: binaryOutcomeContrastFromCells(cells),
      weight: points.reduce((sum, point) => sum + point.weight, 0)
    };
  }), truncated };
}

function binaryContinuousAdjustmentStrata(
  expanders: AdjustmentStratumCondition[][],
  xState: SimulatedNodeState | undefined,
  yState: SimulatedNodeState | undefined
): { items: BinaryContinuousAdjustmentStratum[]; truncated: boolean } {
  if (expanders.length === 0) return { items: [], truncated: false };
  let combinations: AdjustmentStratumCondition[][] = [[]];
  for (const levels of expanders) {
    combinations = combinations.flatMap((base) => levels.map((level) => [...base, level]));
  }
  const maxStrata = 16;
  const truncated = combinations.length > maxStrata;
  const shownCombinations = combinations.slice(0, maxStrata);
  return { items: shownCombinations.map((conditions) => {
    const points = filteredBinaryScatterPoints(xState, yState, conditions);
    const groups = binaryContinuousGroups(points);
    return {
      id: conditions.map(stratumConditionId).join("__"),
      label: conditions.map(stratumConditionLabel).join(", "),
      displayLabels: conditions.map(stratumConditionDisplayLabel),
      points,
      groups,
      gap: binaryContinuousGap(groups),
      weight: points.reduce((sum, point) => sum + point.weight, 0)
    };
  }), truncated };
}

function binaryContinuousGap(groups: BinaryContinuousGroup[]): number | null {
  const groupZero = groups[0];
  const groupOne = groups[1];
  if (groupZero?.mean === null || groupZero?.mean === undefined || groupOne?.mean === null || groupOne?.mean === undefined) return null;
  return groupOne.mean - groupZero.mean;
}

function standardizedBinaryContinuousGap(strata: BinaryContinuousAdjustmentStratum[]): number | null {
  let numerator = 0;
  let denominator = 0;
  for (const stratum of strata) {
    if (stratum.gap === null || stratum.weight <= 0) continue;
    numerator += stratum.gap * stratum.weight;
    denominator += stratum.weight;
  }
  return denominator > 0 ? numerator / denominator : null;
}

function stratumConditionId(condition: AdjustmentStratumCondition): string {
  if (condition.kind === "binary") return `${condition.node.id}-${condition.value}`;
  return `${condition.node.id}-bin-${condition.index}`;
}

function stratumConditionLabel(condition: AdjustmentStratumCondition): string {
  if (condition.kind === "binary") return `${condition.node.id}=${condition.value}`;
  return `${condition.node.id} bin ${condition.index + 1}: ${formatValue(condition.lower)} to ${formatValue(condition.upper)}`;
}

function stratumConditionDisplayLabel(condition: AdjustmentStratumCondition): string {
  const label = (condition.node.label || condition.node.id).replace(/_/g, " ");
  if (condition.kind === "binary") return `${label}=${condition.value}`;
  return `${label} bin ${condition.index + 1}`;
}

function filteredBinaryScatterPoints(
  xState: SimulatedNodeState | undefined,
  yState: SimulatedNodeState | undefined,
  conditions: AdjustmentStratumCondition[]
): ScatterPoint[] {
  const xSamples = xState?.empirical.samples ?? [];
  const ySamples = yState?.empirical.samples ?? [];
  const conditionSamples = conditions.map((condition) => condition.state.empirical.samples);
  const length = Math.min(xSamples.length, ySamples.length, ...conditionSamples.map((samples) => samples.length));
  const points: ScatterPoint[] = [];
  for (let index = 0; index < length; index += 1) {
    const x = xSamples[index];
    const y = ySamples[index];
    if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const matches = conditions.every((condition) => {
      const sample = condition.state.empirical.samples[index];
      if (sample === undefined || !Number.isFinite(sample)) return false;
      if (condition.kind === "binary") return coerceBinary(sample) === condition.value;
      return condition.last
        ? sample >= condition.lower && sample <= condition.upper
        : sample >= condition.lower && sample < condition.upper;
    });
    if (!matches) continue;
    points.push({
      x,
      y,
      weight: empiricalWeightAt(index, xState, yState, ...conditions.map((condition) => condition.state)),
      index
    });
  }
  return points;
}

function empiricalWeightAt(index: number, ...states: Array<SimulatedNodeState | undefined>): number {
  for (const state of states) {
    const weight = state?.empirical.weights[index];
    if (weight !== undefined && Number.isFinite(weight)) return Math.max(0, weight);
  }
  return 1;
}

function scatterDomain(values: number[], state: SimulatedNodeState | undefined, summary?: NodeDistributionSummary): [number, number] {
  const candidates = values.filter(Number.isFinite);
  const distributionDomain = summary?.domain ?? (state ? distributionPlotDomain(state) : null);
  if (distributionDomain) candidates.push(distributionDomain[0], distributionDomain[1]);
  if (candidates.length === 0) return [-1, 1];
  let min = Math.min(...candidates);
  let max = Math.max(...candidates);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [-1, 1];
  if (Math.abs(max - min) < 1e-6) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.06;
  return [min - pad, max + pad];
}

function scatterSampleDomain(values: number[], state: SimulatedNodeState | undefined, summary?: NodeDistributionSummary): [number, number] {
  const candidates = values.filter(Number.isFinite);
  if (candidates.length === 0) {
    if (state?.empirical.min !== null && state?.empirical.min !== undefined) candidates.push(state.empirical.min);
    if (state?.empirical.max !== null && state?.empirical.max !== undefined) candidates.push(state.empirical.max);
  }
  if (candidates.length === 0 && summary?.domain) candidates.push(summary.domain[0], summary.domain[1]);
  if (candidates.length === 0) return [-1, 1];
  let min = Math.min(...candidates);
  let max = Math.max(...candidates);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [-1, 1];
  if (Math.abs(max - min) < 1e-6) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.08;
  min -= pad;
  max += pad;
  const step = niceTickStep(max - min);
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step];
}

function niceTickStep(span: number): number {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const rough = span / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const scaled = rough / power;
  const factor = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return factor * power;
}

function deterministicJitter(index: number): number {
  const x = Math.sin((index + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

function weightedScatterStats(points: ScatterPoint[]): WeightedScatterSummary | null {
  const sumWeight = points.reduce((sum, point) => sum + point.weight, 0);
  if (points.length === 0 || sumWeight <= 0) return null;
  const meanX = points.reduce((sum, point) => sum + point.x * point.weight, 0) / sumWeight;
  const meanY = points.reduce((sum, point) => sum + point.y * point.weight, 0) / sumWeight;
  const varianceX = points.reduce((sum, point) => sum + point.weight * (point.x - meanX) ** 2, 0) / sumWeight;
  const varianceY = points.reduce((sum, point) => sum + point.weight * (point.y - meanY) ** 2, 0) / sumWeight;
  const covariance = points.reduce((sum, point) => sum + point.weight * (point.x - meanX) * (point.y - meanY), 0) / sumWeight;
  const correlation = varianceX <= Number.EPSILON || varianceY <= Number.EPSILON ? null : covariance / Math.sqrt(varianceX * varianceY);
  const slope = varianceX <= Number.EPSILON ? 0 : covariance / varianceX;
  return { meanX, meanY, correlation, slope, intercept: meanY - slope * meanX };
}

function transformView(graph: GraphModel, mode: ViewMode): GraphModel {
  if (mode === "moral") return moralGraph(graph);
  if (mode === "correlation") return correlationGraph(graph);
  if (mode === "equivalence") return equivalenceGraph(graph);
  return graphWithKind(graph, graph.kind);
}

function computeHighlightedEdges(graph: GraphModel, analysis: AnalysisReport, showCausal: boolean, showBiasing: boolean): Map<string, "causal" | "biasing"> {
  const out = new Map<string, "causal" | "biasing">();
  if (showCausal) addPathEdges(graph, analysis.causalPaths, out, "causal");
  if (showBiasing) addPathEdges(graph, analysis.biasingPaths, out, "biasing");
  return out;
}

function addPathEdges(graph: GraphModel, paths: string[][], out: Map<string, "causal" | "biasing">, kind: "causal" | "biasing") {
  for (const path of paths) {
    for (let index = 0; index < path.length - 1; index += 1) {
      const source = path[index];
      const target = path[index + 1];
      if (!source || !target) continue;
      const edge = graph.edges.find((candidate) => (candidate.source === source && candidate.target === target) || (candidate.source === target && candidate.target === source));
      if (edge) out.set(edge.id, kind);
    }
  }
}

function edgeGeometry(edge: GraphEdge, source: GraphNode, target: GraphNode, strokeWidth: number, edges: GraphEdge[], nodesById: Map<string, GraphNode>): EdgeGeometry {
  const automaticControl = automaticControlPoint(edge, source, target, edges, nodesById);
  const control = edge.control ?? automaticControl.point;
  const curved = !!edge.control || automaticControl.curved;
  const arrowClearance = edgeArrowClearance(strokeWidth);
  const startClearance = edge.kind === "bidirected" ? arrowClearance : EDGE_SOURCE_CLEARANCE;
  const endClearance = edge.kind === "directed" || edge.kind === "bidirected" ? arrowClearance : EDGE_SOURCE_CLEARANCE;
  const sourcePortOffset = crowdedSourcePortOffset(edge, edges, nodesById);
  const targetPortOffset = crowdedTargetPortOffset(edge, edges, nodesById);
  if (!curved) {
    const start = nodeBoundaryPoint(source, endpointPortToward(source.position, target.position, sourcePortOffset), startClearance, { includeDistribution: edge.kind === "bidirected" });
    const end = nodeBoundaryPoint(target, endpointPortToward(target.position, source.position, targetPortOffset), endClearance, { includeDistribution: edge.kind === "bidirected" });
    return { path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`, control, label: control, start, end, curved: false };
  }
  const start = nodeBoundaryPoint(source, endpointPortToward(source.position, control, sourcePortOffset), startClearance, { includeDistribution: edge.kind === "bidirected" });
  const end = nodeBoundaryPoint(target, endpointPortToward(target.position, control, targetPortOffset), endClearance, { includeDistribution: edge.kind === "bidirected" });
  return { path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`, control, label: control, start, end, curved: true };
}

function edgeArrowClearance(strokeWidth: number): number {
  return Math.max(1.25, strokeWidth * EDGE_ARROW_TIP_EXTENSION_FACTOR - EDGE_ARROW_NODE_OVERLAP);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function automaticControlPoint(edge: GraphEdge, source: GraphNode, target: GraphNode, edges: GraphEdge[], nodesById: Map<string, GraphNode>): { point: Point; curved: boolean } {
  const mid = midpoint(source.position, target.position);
  const dx = target.position.x - source.position.x;
  const dy = target.position.y - source.position.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / length, y: dx / length };
  if (hasReciprocalDirectedEdge(edge, edges)) {
    const sign = edge.source < edge.target ? 1 : -1;
    return { point: { x: mid.x + normal.x * 44 * sign, y: mid.y + normal.y * 44 * sign }, curved: true };
  }
  const fanOffset = crowdedEdgeFanOffset(edge, edges, nodesById);
  if (Math.abs(fanOffset) <= 1e-6) return { point: mid, curved: false };
  return { point: { x: mid.x + normal.x * fanOffset, y: mid.y + normal.y * fanOffset }, curved: true };
}

function hasReciprocalDirectedEdge(edge: GraphEdge, edges: GraphEdge[]): boolean {
  if (edge.kind !== "directed") return false;
  return edges.some((candidate) => candidate.kind === "directed" && candidate.source === edge.target && candidate.target === edge.source);
}

function crowdedEdgeFanOffset(edge: GraphEdge, edges: GraphEdge[], nodesById: Map<string, GraphNode>): number {
  if (edge.kind !== "directed" && edge.kind !== "bidirected") return 0;
  const target = nodesById.get(edge.target);
  const source = nodesById.get(edge.source);
  if (!target || !source) return 0;
  const incoming = edges
    .filter((candidate) => (candidate.kind === "directed" || candidate.kind === "bidirected") && candidate.target === edge.target)
    .map((candidate) => {
      const source = nodesById.get(candidate.source);
      if (!source) return null;
      return {
        key: candidate.id,
        angle: positiveAngle(Math.atan2(source.position.y - target.position.y, source.position.x - target.position.x))
      };
    })
    .filter((candidate): candidate is { key: string; angle: number } => candidate !== null);
  const targetOffset = incoming.length >= EDGE_CROWDED_FAN_THRESHOLD
    ? edgeFanOffset(edge.id, incoming, EDGE_CROWDED_FAN_SPACING, EDGE_CROWDED_FAN_MAX_OFFSET)
    : 0;
  const outgoing = edges
    .filter((candidate) => (candidate.kind === "directed" || candidate.kind === "bidirected") && candidate.source === edge.source)
    .map((candidate) => {
      const target = nodesById.get(candidate.target);
      if (!target) return null;
      return {
        key: candidate.id,
        angle: positiveAngle(Math.atan2(target.position.y - source.position.y, target.position.x - source.position.x))
      };
    })
    .filter((candidate): candidate is { key: string; angle: number } => candidate !== null);
  const sourceOffset = outgoing.length >= EDGE_OUTGOING_FAN_THRESHOLD
    ? edgeFanOffset(edge.id, outgoing, EDGE_OUTGOING_FAN_SPACING, EDGE_OUTGOING_FAN_MAX_OFFSET)
    : 0;
  return targetOffset + sourceOffset;
}

function crowdedTargetPortOffset(edge: GraphEdge, edges: GraphEdge[], nodesById: Map<string, GraphNode>): number {
  if (edge.kind !== "directed" && edge.kind !== "bidirected") return 0;
  const target = nodesById.get(edge.target);
  if (!target) return 0;
  const incoming = edges
    .filter((candidate) => (candidate.kind === "directed" || candidate.kind === "bidirected") && candidate.target === edge.target)
    .map((candidate) => {
      const source = nodesById.get(candidate.source);
      if (!source) return null;
      return {
        key: candidate.id,
        angle: positiveAngle(Math.atan2(source.position.y - target.position.y, source.position.x - target.position.x))
      };
    })
    .filter((candidate): candidate is { key: string; angle: number } => candidate !== null);
  return incoming.length >= EDGE_CROWDED_FAN_THRESHOLD
    ? edgeFanOffset(edge.id, incoming, EDGE_ENDPOINT_PORT_SPACING, EDGE_ENDPOINT_PORT_MAX_OFFSET)
    : 0;
}

function crowdedSourcePortOffset(edge: GraphEdge, edges: GraphEdge[], nodesById: Map<string, GraphNode>): number {
  if (edge.kind !== "directed" && edge.kind !== "bidirected") return 0;
  const source = nodesById.get(edge.source);
  if (!source) return 0;
  const outgoing = edges
    .filter((candidate) => (candidate.kind === "directed" || candidate.kind === "bidirected") && candidate.source === edge.source)
    .map((candidate) => {
      const target = nodesById.get(candidate.target);
      if (!target) return null;
      return {
        key: candidate.id,
        angle: positiveAngle(Math.atan2(target.position.y - source.position.y, target.position.x - source.position.x))
      };
    })
    .filter((candidate): candidate is { key: string; angle: number } => candidate !== null);
  return outgoing.length >= EDGE_OUTGOING_FAN_THRESHOLD
    ? edgeFanOffset(edge.id, outgoing, EDGE_ENDPOINT_PORT_SPACING, EDGE_ENDPOINT_PORT_MAX_OFFSET)
    : 0;
}

function edgeFanOffset(edgeId: string, ports: Array<{ key: string; angle: number }>, spacing: number, maxOffset: number): number {
  const ordered = orderCircularArrowPorts(ports);
  const index = ordered.findIndex((candidate) => candidate.key === edgeId);
  if (index < 0) return 0;
  return clamp((index - (ordered.length - 1) / 2) * spacing, -maxOffset, maxOffset);
}

function endpointPortToward(origin: Point, toward: Point, portOffset: number): Point {
  if (Math.abs(portOffset) <= 1e-6) return toward;
  const direction = unitVector(origin, toward);
  const normal = { x: -direction.y, y: direction.x };
  return {
    x: origin.x + direction.x * EDGE_ENDPOINT_PORT_DISTANCE + normal.x * portOffset,
    y: origin.y + direction.y * EDGE_ENDPOINT_PORT_DISTANCE + normal.y * portOffset
  };
}

function nodeRadius(node: GraphNode): number {
  return node.roles.exposure || node.roles.outcome ? 25 : 21;
}

function nodeBoundaryPoint(node: GraphNode, toward: Point, clearance: number, options: { includeDistribution: boolean }): Point {
  const unit = unitVector(node.position, toward);
  const distance = nodeBoundaryDistance(node, unit, clearance, options);
  return {
    x: node.position.x + unit.x * distance,
    y: node.position.y + unit.y * distance
  };
}

function nodeBoundaryDistance(node: GraphNode, unit: Point, clearance: number, options: { includeDistribution: boolean }): number {
  const circleBoundary = nodeRadius(node) + clearance;
  const adjustedBoundary = node.roles.adjusted ? rayCenteredRectDistance(unit, 28 + clearance, 28 + clearance) : 0;
  const selectedBoundary = node.roles.selected ? rayRectExitDistance(unit, { left: -23 - clearance, right: 23 + clearance, top: 22 - clearance, bottom: 36 + clearance }) : 0;
  const distributionBoundary = options.includeDistribution
    ? rayRectExitDistance(unit, {
        left: NODE_DISTRIBUTION_BOUNDS.left - clearance,
        right: NODE_DISTRIBUTION_BOUNDS.right + clearance,
        top: NODE_DISTRIBUTION_BOUNDS.top - clearance,
        bottom: NODE_DISTRIBUTION_BOUNDS.bottom + clearance
      })
    : 0;
  return Math.max(circleBoundary, adjustedBoundary, selectedBoundary, distributionBoundary);
}

function rayCenteredRectDistance(unit: Point, halfWidth: number, halfHeight: number): number {
  const xDistance = Math.abs(unit.x) > 1e-6 ? halfWidth / Math.abs(unit.x) : Number.POSITIVE_INFINITY;
  const yDistance = Math.abs(unit.y) > 1e-6 ? halfHeight / Math.abs(unit.y) : Number.POSITIVE_INFINITY;
  return Math.min(xDistance, yDistance);
}

function rayRectExitDistance(unit: Point, rect: { left: number; right: number; top: number; bottom: number }): number {
  let enter = 0;
  let exit = Number.POSITIVE_INFINITY;
  if (Math.abs(unit.x) < 1e-6) {
    if (rect.left > 0 || rect.right < 0) return 0;
  } else {
    const t1 = rect.left / unit.x;
    const t2 = rect.right / unit.x;
    enter = Math.max(enter, Math.min(t1, t2));
    exit = Math.min(exit, Math.max(t1, t2));
  }
  if (Math.abs(unit.y) < 1e-6) {
    if (rect.top > 0 || rect.bottom < 0) return 0;
  } else {
    const t1 = rect.top / unit.y;
    const t2 = rect.bottom / unit.y;
    enter = Math.max(enter, Math.min(t1, t2));
    exit = Math.min(exit, Math.max(t1, t2));
  }
  return exit >= enter && exit > 0 ? exit : 0;
}

function orderCircularArrowPorts<T extends { angle: number; key: string }>(ports: T[]): T[] {
  const ordered = [...ports].sort((a, b) => {
    const angleDelta = a.angle - b.angle;
    return Math.abs(angleDelta) > 1e-6 ? angleDelta : a.key.localeCompare(b.key);
  });
  if (ordered.length <= 2) return ordered;
  let largestGap = -1;
  let startIndex = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index]!;
    const next = ordered[(index + 1) % ordered.length]!;
    const gap = (next.angle - current.angle + Math.PI * 2) % (Math.PI * 2);
    if (gap > largestGap) {
      largestGap = gap;
      startIndex = (index + 1) % ordered.length;
    }
  }
  return [...ordered.slice(startIndex), ...ordered.slice(0, startIndex)];
}

function positiveAngle(angle: number): number {
  return angle < 0 ? angle + Math.PI * 2 : angle;
}

function unitVector(from: Point, toward: Point): Point {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

function conditioningSliderBounds(state: SimulatedNodeState | undefined, value: number): [number, number] {
  const candidates = [value].filter(Number.isFinite);
  if (state?.empirical.min !== null && state?.empirical.min !== undefined) candidates.push(state.empirical.min);
  if (state?.empirical.max !== null && state?.empirical.max !== undefined) candidates.push(state.empirical.max);
  if (state?.analytic?.mean !== null && state?.analytic?.mean !== undefined && state.analytic.variance !== null && Number.isFinite(state.analytic.variance)) {
    const sd = Math.sqrt(Math.max(0, state.analytic.variance));
    candidates.push(state.analytic.mean - 4 * sd, state.analytic.mean + 4 * sd);
  }
  if (candidates.length === 0) return [-10, 10];
  let min = Math.min(...candidates);
  let max = Math.max(...candidates);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [-10, 10];
  if (Math.abs(max - min) < 1e-6) {
    min -= 10;
    max += 10;
  }
  const pad = (max - min) * 0.05;
  return [min - pad, max + pad];
}

function conditioningSliderStep(min: number, max: number): number {
  const span = Math.abs(max - min);
  if (span <= 2) return 0.01;
  if (span <= 20) return 0.1;
  return 1;
}

function adjustmentCutStep(domain: [number, number]): number {
  const span = Math.abs(domain[1] - domain[0]);
  if (span <= 2) return 0.01;
  if (span <= 20) return 0.1;
  return 1;
}

function sanitizeCutpoints(cutpoints: number[], domain: [number, number]): number[] {
  const [min, max] = domain;
  const epsilon = Math.max((max - min) * 0.005, Number.EPSILON);
  return [...new Set(cutpoints
    .filter((value) => Number.isFinite(value) && value > min + epsilon && value < max - epsilon)
    .map((value) => roundToStep(value, adjustmentCutStep(domain))))]
    .sort((a, b) => a - b);
}

function defaultQuantileCuts(samples: number[], domain: [number, number], bins: number): number[] {
  const sorted = samples.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length < bins) {
    const [min, max] = domain;
    return Array.from({ length: bins - 1 }, (_, index) => min + ((index + 1) / bins) * (max - min));
  }
  return Array.from({ length: bins - 1 }, (_, index) => {
    const sampleIndex = Math.min(sorted.length - 1, Math.max(0, Math.round(((index + 1) / bins) * (sorted.length - 1))));
    return sorted[sampleIndex] ?? domain[0];
  });
}

function positivityRows(confounderState: SimulatedNodeState | undefined, exposureState: SimulatedNodeState, cutpoints: number[], domain: [number, number]): PositivityRow[] {
  const confounderSamples = confounderState?.empirical.samples ?? [];
  const exposureSamples = exposureState.empirical.samples;
  const weights = confounderState?.empirical.weights.length ? confounderState.empirical.weights : exposureState.empirical.weights;
  const boundaries = [domain[0], ...cutpoints, domain[1]];
  return boundaries.slice(0, -1).map((lower, index) => {
    const upper = boundaries[index + 1] ?? domain[1];
    let exposed = 0;
    let unexposed = 0;
    for (let sampleIndex = 0; sampleIndex < Math.min(confounderSamples.length, exposureSamples.length); sampleIndex += 1) {
      const confounder = confounderSamples[sampleIndex];
      const exposure = exposureSamples[sampleIndex];
      if (confounder === undefined || exposure === undefined || !Number.isFinite(confounder) || !Number.isFinite(exposure)) continue;
      const inBin = index === boundaries.length - 2 ? confounder >= lower && confounder <= upper : confounder >= lower && confounder < upper;
      if (!inBin) continue;
      const weight = Math.max(0, weights[sampleIndex] ?? 1);
      if (coerceBinary(exposure) === 1) exposed += weight;
      else unexposed += weight;
    }
    const total = exposed + unexposed;
    const minArm = Math.min(exposed, unexposed);
    const warning = total <= 0
      ? "empty bin"
      : minArm <= 0
        ? "no support"
        : minArm < 8 || minArm / total < 0.08
          ? "weak support"
          : null;
    return { lower, upper, exposed, unexposed, total, warning };
  });
}

function graphEmpiricalDraws(graph: GraphModel): number {
  if (graph.nodes.length === 0) return EMPIRICAL_DRAW_DEFAULT;
  const requested = graph.nodes.reduce((max, node) => {
    const variable = normalizeVariableModel(node.variable);
    return Math.max(max, variable.simulation.sampleSize);
  }, EMPIRICAL_DRAW_MIN);
  return clampDrawCount(requested);
}

function clampDrawCount(value: number): number {
  if (!Number.isFinite(value)) return EMPIRICAL_DRAW_DEFAULT;
  const stepped = Math.round(value / EMPIRICAL_DRAW_STEP) * EMPIRICAL_DRAW_STEP;
  return Math.min(EMPIRICAL_DRAW_MAX, Math.max(EMPIRICAL_DRAW_MIN, stepped));
}

function roundToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
  const decimals = step >= 1 ? 0 : Math.min(6, Math.ceil(Math.abs(Math.log10(step))));
  return Number(value.toFixed(decimals));
}

function distributionPlotDomain(state: SimulatedNodeState): [number, number] | null {
  const candidates = state.empirical.samples.filter(Number.isFinite);
  if (state.empirical.min !== null) candidates.push(state.empirical.min);
  if (state.empirical.max !== null) candidates.push(state.empirical.max);
  const analytic = state.analytic;
  if (analytic) {
    const bounds = analyticDistributionBounds(analytic);
    if (bounds) candidates.push(bounds[0], bounds[1]);
  }
  if (candidates.length === 0) return null;
  let min = Math.min(...candidates);
  let max = Math.max(...candidates);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (Math.abs(max - min) < 1e-6) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.08;
  return [min - pad, max + pad];
}

function analyticDistributionBounds(analytic: SimulatedAnalyticDistribution): [number, number] | null {
  if (analytic.density?.kind === "truncated_normal") {
    const lower = analytic.density.lower ?? analytic.density.mean - 3.5 * analytic.density.sd;
    const upper = analytic.density.upper ?? analytic.density.mean + 3.5 * analytic.density.sd;
    return [lower, upper];
  }
  const distribution = analytic.distribution;
  const mean = analytic.mean;
  const variance = analytic.variance;
  if (distribution.kind === "constant") return [distribution.value - 1, distribution.value + 1];
  if (distribution.kind === "uniform") return [distribution.min, distribution.max];
  if (distribution.kind === "bernoulli" || distribution.kind === "beta") return [0, 1];
  if (distribution.kind === "poisson") return [0, distribution.lambda + 4 * Math.sqrt(distribution.lambda)];
  if (distribution.kind === "exponential") return [0, 5 / distribution.rate];
  if (distribution.kind === "lognormal") {
    const m = Math.exp(distribution.meanLog + (distribution.sdLog * distribution.sdLog / 2));
    const sd = Math.sqrt((Math.exp(distribution.sdLog * distribution.sdLog) - 1) * Math.exp((2 * distribution.meanLog) + (distribution.sdLog * distribution.sdLog)));
    return [Math.max(0, m - 3 * sd), m + 4 * sd];
  }
  if (distribution.kind === "gamma") return [0, distribution.shape * distribution.scale + 4 * Math.sqrt(distribution.shape * distribution.scale * distribution.scale)];
  const center = mean ?? ("mean" in distribution ? distribution.mean : 0);
  const sd = variance !== null && Number.isFinite(variance) ? Math.sqrt(Math.max(variance, 0)) : ("sd" in distribution ? distribution.sd : "scale" in distribution ? distribution.scale : 1);
  return [center - 3.5 * sd, center + 3.5 * sd];
}

function histogram(samples: number[], domain: [number, number], binCount: number, weights: number[] = []): number[] {
  const [min, max] = domain;
  const span = max - min || 1;
  const bins = Array.from({ length: binCount }, () => 0);
  for (const [sampleIndex, sample] of samples.entries()) {
    if (!Number.isFinite(sample)) continue;
    const index = Math.min(binCount - 1, Math.max(0, Math.floor(((sample - min) / span) * binCount)));
    bins[index] = (bins[index] ?? 0) + (weights[sampleIndex] ?? 1);
  }
  return bins;
}

function analyticDistributionPath(analytic: SimulatedAnalyticDistribution, domain: [number, number], width: number, height: number): string | null {
  const distribution = analytic.distribution;
  const [min, max] = domain;
  const span = max - min || 1;
  if (distribution.kind === "constant") {
    const x = ((distribution.value - min) / span) * width;
    return `M ${trimNumber(x)} ${height - 2} L ${trimNumber(x)} 3`;
  }
  if (distribution.kind === "uniform") {
    const x0 = ((distribution.min - min) / span) * width;
    const x1 = ((distribution.max - min) / span) * width;
    return `M ${trimNumber(Math.max(0, x0))} ${height - 5} L ${trimNumber(Math.min(width, x1))} ${height - 5}`;
  }
  const density = analyticDensity(analytic);
  if (!density) return null;
  const points = Array.from({ length: 36 }, (_, index) => {
    const t = index / 35;
    const xValue = min + t * span;
    return { x: t * width, density: density(xValue) };
  }).filter((point) => Number.isFinite(point.density) && point.density >= 0);
  if (points.length < 2) return null;
  const maxDensity = Math.max(...points.map((point) => point.density), Number.EPSILON);
  return points.map((point, index) => {
    const y = height - 2 - Math.min(height - 5, (point.density / maxDensity) * (height - 5));
    return `${index === 0 ? "M" : "L"} ${trimNumber(point.x)} ${trimNumber(y)}`;
  }).join(" ");
}

function analyticDensity(analytic: SimulatedAnalyticDistribution): ((value: number) => number) | null {
  const density = analytic.density;
  if (density?.kind === "truncated_normal") {
    return (value) => {
      if (density.lower !== null && value < density.lower) return 0;
      if (density.upper !== null && value > density.upper) return 0;
      return normalDensity(value, density.mean, density.sd);
    };
  }
  const distribution = analytic.distribution;
  if (distribution.kind === "normal") return (value) => normalDensity(value, distribution.mean, distribution.sd);
  if (distribution.kind === "lognormal") return (value) => value <= 0 ? 0 : normalDensity(Math.log(value), distribution.meanLog, distribution.sdLog) / value;
  if (distribution.kind === "laplace") return (value) => Math.exp(-Math.abs(value - distribution.mean) / distribution.scale) / (2 * distribution.scale);
  if (distribution.kind === "exponential") return (value) => value < 0 ? 0 : distribution.rate * Math.exp(-distribution.rate * value);
  if (distribution.kind === "student_t") return (value) => normalDensity(value, distribution.mean, distribution.scale * Math.sqrt(distribution.df / Math.max(1, distribution.df - 2)));
  if (distribution.kind === "gamma") {
    const mean = distribution.shape * distribution.scale;
    const sd = Math.sqrt(distribution.shape * distribution.scale * distribution.scale);
    return (value) => value < 0 ? 0 : normalDensity(value, mean, sd);
  }
  return null;
}

function normalDensity(value: number, mean: number, sd: number): number {
  const cleanSd = Math.max(sd, Number.EPSILON);
  const z = (value - mean) / cleanSd;
  return Math.exp(-0.5 * z * z) / (cleanSd * Math.sqrt(2 * Math.PI));
}

function nodeDistributionAnnotationLines(state: SimulatedNodeState | undefined, variable: VariableModel): string[] {
  if (isBinaryDistributionState(state, variable)) {
    const lines: string[] = [];
    const probability = binaryProbabilityFromState(state);
    if (probability !== null) lines.push(`P(1) ${formatPercent(probability)}`);
    return lines.map((line) => compactSvgText(line, 28)).slice(0, 1);
  }
  const lines: string[] = [];
  const moment = nodeMomentLabel(state);
  if (moment) lines.push(moment);
  return lines.map((line) => compactSvgText(line, 28)).slice(0, 2);
}

function nodeDistributionFullSummary(state: SimulatedNodeState | undefined, variable: VariableModel): string {
  const binary = isBinaryDistributionState(state, variable);
  return [
    binary ? binaryProbabilitySummary(state) : nodeMomentLabel(state),
    state?.analytic ? distributionParameterLabel(state.analytic.distribution) : "",
    state?.analytic ? `analytic ${analyticDistributionLabel(state.analytic)}` : "",
    state?.empirical.effectiveSampleSize !== null && state?.empirical.effectiveSampleSize !== undefined ? `ESS ${formatValue(state.empirical.effectiveSampleSize)}` : ""
  ].filter(Boolean).join("; ");
}

function isBinaryDistributionState(state: SimulatedNodeState | undefined, variable: VariableModel): boolean {
  return variable.valueType === "binary" || state?.analytic?.distribution.kind === "bernoulli";
}

function binaryProbabilitySummary(state: SimulatedNodeState | undefined): string {
  const probability = binaryProbabilityFromState(state);
  return probability === null ? "" : `P(1) ${formatPercent(probability)}`;
}

function binaryProbabilityFromState(state: SimulatedNodeState | undefined): number | null {
  if (!state) return null;
  const analytic = state.analytic;
  if (analytic?.distribution.kind === "bernoulli") return clamp(analytic.distribution.p, 0, 1);
  if (analytic?.mean !== null && analytic?.mean !== undefined && Number.isFinite(analytic.mean)) return clamp(analytic.mean, 0, 1);
  if (state.empirical.mean !== null && Number.isFinite(state.empirical.mean)) return clamp(state.empirical.mean, 0, 1);
  return null;
}

function nodeMomentLabel(state: SimulatedNodeState | undefined): string {
  const mean = state?.analytic?.mean ?? state?.empirical.mean;
  const variance = state?.analytic?.variance ?? state?.empirical.variance;
  if (mean === null || mean === undefined || !Number.isFinite(mean)) return "";
  const sd = variance !== null && variance !== undefined && Number.isFinite(variance) ? Math.sqrt(Math.max(0, variance)) : null;
  return sd === null ? `mean ${formatValue(mean)}` : `mean ${formatValue(mean)} sd ${formatValue(sd)}`;
}

function distributionParameterLabel(distribution: NodeDistribution): string {
  if (distribution.kind === "constant") return `Constant value=${formatValue(distribution.value)}`;
  if (distribution.kind === "normal") return `Normal mean=${formatValue(distribution.mean)} sd=${formatValue(distribution.sd)}`;
  if (distribution.kind === "lognormal") return `Lognormal logmean=${formatValue(distribution.meanLog)} logsd=${formatValue(distribution.sdLog)}`;
  if (distribution.kind === "uniform") return `Uniform min=${formatValue(distribution.min)} max=${formatValue(distribution.max)}`;
  if (distribution.kind === "bernoulli") return `Bernoulli p=${formatValue(distribution.p)}`;
  if (distribution.kind === "poisson") return `Poisson lambda=${formatValue(distribution.lambda)}`;
  if (distribution.kind === "beta") return `Beta alpha=${formatValue(distribution.alpha)} beta=${formatValue(distribution.beta)}`;
  if (distribution.kind === "laplace") return `Laplace mean=${formatValue(distribution.mean)} scale=${formatValue(distribution.scale)}`;
  if (distribution.kind === "student_t") return `Student-t mean=${formatValue(distribution.mean)} scale=${formatValue(distribution.scale)} df=${formatValue(distribution.df)}`;
  if (distribution.kind === "gamma") return `Gamma shape=${formatValue(distribution.shape)} scale=${formatValue(distribution.scale)}`;
  return `Exponential rate=${formatValue(distribution.rate)}`;
}

function compactSvgText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function distributionLabel(distribution: NodeDistribution): string {
  if (distribution.kind === "constant") return `constant ${formatValue(distribution.value)}`;
  if (distribution.kind === "normal") return `Normal(${formatValue(distribution.mean)}, ${formatValue(distribution.sd)})`;
  if (distribution.kind === "lognormal") return `Lognormal(${formatValue(distribution.meanLog)}, ${formatValue(distribution.sdLog)})`;
  if (distribution.kind === "uniform") return `Uniform(${formatValue(distribution.min)}, ${formatValue(distribution.max)})`;
  if (distribution.kind === "bernoulli") return `Bernoulli(${formatValue(distribution.p)})`;
  if (distribution.kind === "poisson") return `Poisson(${formatValue(distribution.lambda)})`;
  if (distribution.kind === "beta") return `Beta(${formatValue(distribution.alpha)}, ${formatValue(distribution.beta)})`;
  if (distribution.kind === "laplace") return `Laplace(${formatValue(distribution.mean)}, ${formatValue(distribution.scale)})`;
  if (distribution.kind === "student_t") return `Student-t(${formatValue(distribution.mean)}, ${formatValue(distribution.scale)}, ${formatValue(distribution.df)})`;
  if (distribution.kind === "gamma") return `Gamma(${formatValue(distribution.shape)}, ${formatValue(distribution.scale)})`;
  return `Exponential(${formatValue(distribution.rate)})`;
}

function analyticDistributionLabel(analytic: SimulatedAnalyticDistribution): string {
  if (analytic.density?.kind === "truncated_normal") {
    const lower = analytic.density.lower === null ? "-inf" : formatValue(analytic.density.lower);
    const upper = analytic.density.upper === null ? "inf" : formatValue(analytic.density.upper);
    return `truncated Normal(${formatValue(analytic.density.mean)}, ${formatValue(analytic.density.sd)}, ${lower}..${upper})`;
  }
  return distributionLabel(analytic.distribution);
}

function inferValueTypeFromMechanism(isRoot: boolean, mechanism: NodeMechanism, fallback: VariableModel["valueType"]): VariableModel["valueType"] {
  if (!isRoot) {
    if (mechanism.combiner === "bernoulli_logit" || mechanism.combiner === "noisy_or") return "binary";
    if (mechanism.combiner === "poisson_log") return "count";
    if (mechanism.combiner === "gamma_log" || mechanism.combiner === "positive_softplus") return "positive";
    if (mechanism.combiner === "bounded_logistic") return "proportion";
  }
  return valueTypeFromDistribution(isRoot ? mechanism.distribution : mechanism.noise, fallback);
}

function valueTypeFromDistribution(distribution: NodeDistribution, fallback: VariableModel["valueType"]): VariableModel["valueType"] {
  if (distribution.kind === "bernoulli") return "binary";
  if (distribution.kind === "poisson") return "count";
  if (distribution.kind === "beta") return "proportion";
  if (distribution.kind === "gamma" || distribution.kind === "exponential" || distribution.kind === "lognormal") return "positive";
  if (distribution.kind === "normal" || distribution.kind === "uniform" || distribution.kind === "laplace" || distribution.kind === "student_t") return "continuous";
  return fallback;
}

function valueTypeLabel(valueType: VariableModel["valueType"]): string {
  return VARIABLE_TYPES.find(([id]) => id === valueType)?.[1] ?? valueType;
}

function defaultDistribution(kind: NodeDistribution["kind"]): NodeDistribution {
  if (kind === "normal") return { kind, mean: 0, sd: 1 };
  if (kind === "lognormal") return { kind, meanLog: 0, sdLog: 1 };
  if (kind === "uniform") return { kind, min: 0, max: 1 };
  if (kind === "bernoulli") return { kind, p: 0.5 };
  if (kind === "poisson") return { kind, lambda: 1 };
  if (kind === "beta") return { kind, alpha: 2, beta: 2 };
  if (kind === "laplace") return { kind, mean: 0, scale: 1 };
  if (kind === "student_t") return { kind, mean: 0, scale: 1, df: 5 };
  if (kind === "gamma") return { kind, shape: 2, scale: 1 };
  if (kind === "exponential") return { kind, rate: 1 };
  return { kind: "constant", value: 0 };
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function compactShareUrlForDocument(document: GraphDocument, activeExampleId: string | null): string {
  const url = new URL(window.location.href);
  const exampleId = canonicalShareExampleId(document, activeExampleId);
  if (exampleId) {
    url.hash = `${SHARE_EXAMPLE_HASH_KEY}=${encodeURIComponent(exampleId)}`;
    return url.toString();
  }
  const encoded = encodeCompactShareDocument(document, activeExampleId);
  url.hash = `${SHARE_COMPACT_HASH_KEY}=${encoded}`;
  return url.toString();
}

function fullShareUrlForDocument(document: GraphDocument, activeExampleId: string | null): string {
  const url = new URL(window.location.href);
  const encoded = encodeWorkbenchSnapshot(createWorkbenchSnapshot(document, activeExampleId));
  url.hash = `${SHARE_DOCUMENT_HASH_KEY}=${encoded}`;
  return url.toString();
}

function hashMatchesPaperNetwork(hash: string): boolean {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  return params.get("paper") === "k562";
}

function canonicalShareExampleId(document: GraphDocument, activeExampleId: string | null): string | null {
  if (!activeExampleId) return null;
  const example = exampleDocument(activeExampleId);
  if (!example) return null;
  const current = JSON.stringify({ graph: document.graph, simulation: document.simulation });
  const canonical = JSON.stringify({ graph: example.graph, simulation: example.simulation });
  return current === canonical ? activeExampleId : null;
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy failed");
}

function shareStatusLabel(status: ShareStatus, idleLabel: string) {
  if (status === "copied") return "Copied";
  if (status === "too-large") return "Link too big";
  if (status === "failed") return "Copy failed";
  return idleLabel;
}

function exportSvg() {
  const svg = document.querySelector(".graph-canvas");
  if (!(svg instanceof SVGSVGElement)) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  downloadText("nudagitty-model.svg", new XMLSerializer().serializeToString(clone), "image/svg+xml");
}

function exportBitmap(format: "png" | "jpeg") {
  const svg = document.querySelector(".graph-canvas");
  if (!(svg instanceof SVGSVGElement)) return;
  const rect = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", `${rect.width}`);
  clone.setAttribute("height", `${rect.height}`);
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    const canvas = window.document.createElement("canvas");
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const ext = format === "jpeg" ? "jpg" : "png";
    downloadUrl(`nudagitty-model.${ext}`, canvas.toDataURL(`image/${format}`));
  };
  image.src = url;
}

function downloadText(filename: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  downloadUrl(filename, url);
  URL.revokeObjectURL(url);
}

function downloadUrl(filename: string, url: string) {
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
}

function tikzDocument(graph: GraphModel): string {
  return `% This code uses the tikz package
\\begin{tikzpicture}
${serializeTikz(graph)}
\\end{tikzpicture}
`;
}

function inferenceModeLabel(mode: SimulationInferenceMode | "forward"): string {
  if (mode === "importance") return "importance sampling";
  if (mode === "rejection") return "rejection sampling";
  return mode;
}

function analyticSummaryLabel(note: string): string {
  return note.replace(/^analytic\s+/i, "");
}

function simulationBlocked(result: SimulationResult): boolean {
  return result.diagnostics.some((message) => message.startsWith("Simulation disabled") || message.startsWith("Simulation is only enabled"));
}
