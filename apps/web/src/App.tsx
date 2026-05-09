import CodeMirror from "@uiw/react-codemirror";
import {
  ArrowRight,
  Braces,
  Camera,
  CirclePlus,
  Download,
  FilePlus2,
  MousePointer2,
  Redo2,
  RefreshCw,
  Save,
  Share2,
  Sigma,
  Trash2,
  Undo2
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EXAMPLES,
  EXAMPLE_DOMAINS,
  addEdge,
  addNode,
  adjusted,
  analyzeGraph,
  cloneDocument,
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
  initialDocument,
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
  AnalysisReport,
  EdgeMechanism,
  EdgeMechanismKind,
  EdgeKind,
  ExampleDenouement,
  ExampleDomain,
  EffectKind,
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
  formatSignedValue,
  formatValue,
  formatWeightedCount
} from "./shared/formatting";
import { CompletedOutputPanel } from "./outputs/CompletedOutputPanel";
import { DenouementPanel } from "./outputs/DenouementPanel";
import { ExampleMenu } from "./examples/ExampleMenu";
import { ModeToggle } from "./examples/ModeToggle";
import { MODE_LABELS } from "./shared/workbench";
import type { WorkbenchMode } from "./shared/workbench";

type ToolMode = "select" | "node" | "edge";
type Selection = { kind: "node"; id: string } | { kind: "edge"; id: string } | null;
type BibliographyTopic = "sem" | "nonlinear" | "probability" | "deep";
type CanvasViewport = { cx: number; cy: number; zoom: number };
type ScatterPair = { x: string; y: string };
type ScatterPoint = { x: number; y: number; weight: number; index: number };
type BinaryCell = { x: 0 | 1; y: 0 | 1; weight: number; count: number; percent: number };
type BinaryContinuousGroup = { value: 0 | 1; count: number; weight: number; mean: number | null; share: number };
type PositivityRow = { lower: number; upper: number; exposed: number; unexposed: number; total: number; warning: string | null };
type VariableEditorTab = "model" | "interventions" | "adjustment";
type DesignModuleStatus = "usable" | "todo";
type DragState =
  | { kind: "node"; id: string; offset: Point }
  | { kind: "edge-control"; id: string }
  | { kind: "pan"; pointerId: number; lastPoint: Point; moved: boolean }
  | null;
type PointerScreenPoint = { clientX: number; clientY: number };

const STORAGE_KEY = "nudagitty.document.v1";
const BASE_VIEWBOX = { width: 1000, height: 700 };
const DEFAULT_VIEWPORT: CanvasViewport = { cx: 0, cy: 0, zoom: 1 };
const NODE_VIEW_MARGIN = { x: 100, top: 110, bottom: 130 };
const EMPIRICAL_DRAW_MIN = 80;
const EMPIRICAL_DRAW_DEFAULT = 320;
const EMPIRICAL_DRAW_MAX = 5000;
const EMPIRICAL_DRAW_STEP = 80;

function graphViewportSignature(graph: GraphModel): string {
  const nodes = graph.nodes.map((node) => `${node.id}:${node.label}`).join("|");
  const edges = graph.edges.map((edge) => `${edge.source}:${edge.kind}:${edge.target}`).join("|");
  return `${nodes}::${edges}`;
}

function fitViewportToGraph(graph: GraphModel): CanvasViewport {
  if (graph.nodes.length === 0) return DEFAULT_VIEWPORT;
  const minX = Math.min(...graph.nodes.map((node) => node.position.x)) - NODE_VIEW_MARGIN.x;
  const maxX = Math.max(...graph.nodes.map((node) => node.position.x)) + NODE_VIEW_MARGIN.x;
  const minY = Math.min(...graph.nodes.map((node) => node.position.y)) - NODE_VIEW_MARGIN.top;
  const maxY = Math.max(...graph.nodes.map((node) => node.position.y)) + NODE_VIEW_MARGIN.bottom;
  const width = Math.max(240, maxX - minX);
  const height = Math.max(220, maxY - minY);
  const zoom = clamp(Math.min(BASE_VIEWBOX.width / width, BASE_VIEWBOX.height / height), 0.55, 1.85);
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    zoom
  };
}

const EDGE_MECHANISMS: Array<{ kind: EdgeMechanismKind; label: string; description: string }> = [
  { kind: "linear", label: "linear", description: "Straight proportional effect." },
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

const DESIGN_MODULES: Array<{
  id: string;
  label: string;
  status: DesignModuleStatus;
  domains: ExampleDomain[];
  basic?: boolean;
  description: string;
}> = [
  {
    id: "adjustment",
    label: "Adjustment / backdoor",
    status: "usable",
    basic: true,
    domains: ["classic", "epidemiology", "social", "ml"],
    description: "Use roles, biasing paths, and minimal adjustment sets to decide what belongs in the estimating equation."
  },
  {
    id: "target-trial",
    label: "Target trial",
    status: "todo",
    domains: ["epidemiology"],
    description: "TODO: specify eligibility, time zero, treatment strategies, follow-up, censoring, estimand, and analysis plan."
  },
  {
    id: "negative-controls",
    label: "Negative controls",
    status: "todo",
    domains: ["epidemiology", "ml"],
    description: "TODO: mark exposure/outcome controls that should have no effect and use violations as residual-bias warnings."
  },
  {
    id: "iv",
    label: "Instrumental variables",
    status: "usable",
    domains: ["classic", "econometrics"],
    description: "Check relevance paths, exclusion restrictions, and unblocked backdoors from candidate instruments to outcomes."
  },
  {
    id: "did",
    label: "DiD / event study",
    status: "todo",
    domains: ["econometrics"],
    description: "TODO: track policy timing, panel unit/time structure, pre-trends, staggered adoption, and placebo endpoints."
  },
  {
    id: "rd",
    label: "Regression discontinuity",
    status: "todo",
    domains: ["econometrics"],
    description: "TODO: mark running variable, cutoff, manipulation risks, bandwidth choices, and continuity assumptions."
  },
  {
    id: "synthetic-control",
    label: "Synthetic control / CausalImpact",
    status: "todo",
    domains: ["econometrics", "product"],
    description: "TODO: define treated unit, donor pool, pre-period fit, unaffected control series, and placebo permutations."
  },
  {
    id: "experiment-uplift",
    label: "Experiment / uplift",
    status: "todo",
    domains: ["product"],
    description: "TODO: represent randomization, holdouts, geolift, guardrails, spillovers, and heterogeneous treatment effects."
  },
  {
    id: "mediation",
    label: "Mediation",
    status: "usable",
    basic: true,
    domains: ["classic", "epidemiology", "social"],
    description: "Separate direct and indirect paths, then make post-treatment adjustment risks visible."
  },
  {
    id: "graph-refutation",
    label: "Graph refutation",
    status: "todo",
    domains: ["ml"],
    description: "TODO: run conditional-independence checks implied by the graph and flag assumptions contradicted by data."
  },
  {
    id: "causal-discovery",
    label: "Discovery hypotheses",
    status: "todo",
    domains: ["ml"],
    description: "TODO: import candidate structures from discovery tools as hypotheses, not automatic truth."
  },
  {
    id: "root-cause",
    label: "Root cause",
    status: "todo",
    domains: ["operations"],
    description: "TODO: compare old/new mechanism behavior and attribute observed changes to upstream nodes."
  },
  {
    id: "distribution-change",
    label: "Distribution change",
    status: "todo",
    domains: ["operations", "ml"],
    description: "TODO: attribute target distribution shifts to changed causal mechanisms, not only changed marginal correlations."
  },
  {
    id: "latent-measurement",
    label: "Latent measurement",
    status: "todo",
    domains: ["social", "epidemiology"],
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
  validity: "Credible only after the graph declares time order, treatment/exposure status, outcome, adjustment choices, selection nodes, latent nodes, and post-treatment variables.",
  nextAction: "Pick a domain example closest to the current problem or mark exposure/outcome roles and use the identification panel to start the packet.",
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
        "Mark adjusted, selected, and unobserved nodes.",
        "Inspect causal and biasing paths.",
        "Choose the identification mode in Advanced diagnostics.",
        "Document any TODO design module that is relevant but not implemented yet."
      ]
    },
    {
      title: "Threats",
      items: [
        "Post-treatment adjustment can change the estimand or introduce bias.",
        "Selection nodes can make the analysis population differ from the target population.",
        "Latent variables mean the DAG is an assumption statement, not a complete control strategy.",
        "Poor overlap, interference, and measurement error usually require domain-specific modules."
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
  const [document, setDocument] = useState<GraphDocument>(() => loadInitialDocument());
  const [history, setHistory] = useState<GraphDocument[]>([]);
  const [future, setFuture] = useState<GraphDocument[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [tool, setTool] = useState<ToolMode>("select");
  const [edgeSource, setEdgeSource] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("normal");
  const [effectKind, setEffectKind] = useState<EffectKind>("total");
  const [bibliographyTopic, setBibliographyTopic] = useState<BibliographyTopic>("sem");
  const [showCausal, setShowCausal] = useState(true);
  const [showBiasing, setShowBiasing] = useState(true);
  const [showAncestors, setShowAncestors] = useState(true);
  const [workbenchMode, setWorkbenchMode] = useState<WorkbenchMode>("basic");
  const [activeExampleId, setActiveExampleId] = useState<string | null>(EXAMPLES[0]?.id ?? null);
  const [modelText, setModelText] = useState(() => serializeModel(document));
  const [modelDirty, setModelDirty] = useState(false);
  const [simulation, setSimulation] = useState<SimulationResult>(() => runSimulation(document.graph, document.simulation));
  const [scatterPair, setScatterPair] = useState<ScatterPair>(() => defaultScatterPair(document.graph));

  const [analysis, setAnalysis] = useState<AnalysisReport>(() => analyzeGraph(document.graph));
  const visibleGraph = useMemo(() => transformView(document.graph, viewMode), [document.graph, viewMode]);
  const selectedNode = selection?.kind === "node" ? findNode(document.graph, selection.id) : undefined;
  const selectedEdge = selection?.kind === "edge" ? findEdge(document.graph, selection.id) : undefined;
  const activeExample = EXAMPLES.find((example) => example.id === activeExampleId) ?? null;
  const activeDomain = activeExample?.domain ?? "classic";
  const activeDenouement = activeExample ? exampleDenouement(activeExample.id) : null;
  const empiricalDraws = graphEmpiricalDraws(document.graph);
  const highlightedEdges = useMemo(() => computeHighlightedEdges(document.graph, analysis, showCausal, showBiasing), [analysis, document.graph, showBiasing, showCausal]);
  const ancestorIds = useMemo(() => showAncestors ? new Set(analysis.causalPaths.flat()) : new Set<string>(), [analysis.causalPaths, showAncestors]);

  useEffect(() => {
    const worker = new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<AnalysisReport>) => setAnalysis(event.data);
    worker.postMessage(document.graph);
    return () => worker.terminate();
  }, [document.graph]);

  useEffect(() => {
    const worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<SimulationResult>) => setSimulation(event.data);
    worker.postMessage({ graph: document.graph, spec: document.simulation });
    return () => worker.terminate();
  }, [document.graph, document.simulation]);

  useEffect(() => {
    setScatterPair((pair) => reconcileScatterPair(document.graph, pair));
  }, [document.graph]);

  const commit = useCallback((next: GraphDocument) => {
    setHistory((items) => [...items.slice(-80), cloneDocument(document)]);
    setFuture([]);
    setDocument(next);
    setModelText(serializeModel(next));
    setModelDirty(false);
    setSimulation((previous) => runSimulation(next.graph, next.simulation, previous));
  }, [document]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
  }, [document]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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

  const undo = useCallback(() => {
    setHistory((items) => {
      const previous = items.at(-1);
      if (!previous) return items;
      setFuture((futureItems) => [cloneDocument(document), ...futureItems]);
      setDocument(previous);
      setModelText(serializeModel(previous));
      setModelDirty(false);
      setSimulation(runSimulation(previous.graph, previous.simulation));
      return items.slice(0, -1);
    });
  }, [document]);

  const redo = useCallback(() => {
    setFuture((items) => {
      const next = items[0];
      if (!next) return items;
      setHistory((historyItems) => [...historyItems, cloneDocument(document)]);
      setDocument(next);
      setModelText(serializeModel(next));
      setModelDirty(false);
      setSimulation(runSimulation(next.graph, next.simulation));
      return items.slice(1);
    });
  }, [document]);

  const replaceGraph = useCallback((graph: GraphModel) => {
    commit(withGraph(document, graph));
  }, [commit, document]);

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
    commit(document);
    setActiveExampleId(id);
    setSelection(null);
  }, [commit]);

  const updateNodeMechanism = useCallback((nodeId: string, patch: Partial<NodeMechanism>) => {
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Sigma size={20} />
          <span>Nudagitty</span>
        </div>
        <div className="toolbar" aria-label="Main tools">
          <IconButton label="Select" active={tool === "select"} onClick={() => setTool("select")}><MousePointer2 size={18} /></IconButton>
          <IconButton label="Variable" active={tool === "node"} onClick={() => setTool("node")}><CirclePlus size={18} /></IconButton>
          <IconButton label="Connect" active={tool === "edge"} onClick={() => setTool("edge")}><ArrowRight size={18} /></IconButton>
          <IconButton label="Delete" onClick={deleteSelection} disabled={!selection}><Trash2 size={18} /></IconButton>
          <IconButton label="Undo" onClick={undo} disabled={history.length === 0}><Undo2 size={18} /></IconButton>
          <IconButton label="Redo" onClick={redo} disabled={future.length === 0}><Redo2 size={18} /></IconButton>
        </div>
        <div className="toolbar" aria-label="Model actions">
          <IconButton label="New" onClick={() => {
            commit(emptyDocument());
            setActiveExampleId(null);
            setSelection(null);
          }}><FilePlus2 size={18} /></IconButton>
          <ExampleMenu mode={workbenchMode} activeExampleId={activeExampleId} onSelect={loadExample} />
          <IconButton label="Save" onClick={() => window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document))}><Save size={18} /></IconButton>
          <IconButton label="Share" onClick={() => copyShareUrl(document)}><Share2 size={18} /></IconButton>
          <IconButton label="SVG" onClick={() => exportSvg()}><Download size={18} /></IconButton>
          <IconButton label="PNG" onClick={() => exportBitmap("png")}><Camera size={18} /></IconButton>
        </div>
        <ModeToggle value={workbenchMode} onChange={setWorkbenchMode} />
      </header>

      <main className="workspace">
        <aside className="side-panel scenario-column">
          <Section title="Scenario Builder">
            <ScenarioPanel
              document={document}
              completedOutputModuleId={activeExample?.outputModule ?? null}
              analysis={analysis}
              simulation={simulation}
              onResample={resample}
              onClearOverrides={clearOverrides}
              onClearSelections={clearSelections}
              mode={workbenchMode}
              domain={activeDomain}
              denouement={activeDenouement ?? CUSTOM_DENOUEMENT}
              denouementTitle={activeExample?.title ?? document.title}
            />
          </Section>
          <Section title="Pairwise Output">
            <ScatterplotPanel
              graph={document.graph}
              simulation={simulation}
              pair={scatterPair}
              onPair={setScatterPair}
              onSelectNode={selectNode}
            />
          </Section>
        </aside>

        <GraphCanvas
          graph={visibleGraph}
          sourceGraph={document.graph}
          selection={selection}
          tool={tool}
          edgeSource={edgeSource}
          analysis={analysis}
          simulation={simulation}
          edgeMechanisms={document.simulation.edges}
          disabledEdgeIds={new Set(Object.entries(document.simulation.edges).filter(([, mechanism]) => !mechanism.enabled).map(([id]) => id))}
          highlightedEdges={highlightedEdges}
          ancestorIds={ancestorIds}
          onSelect={setSelection}
          onAddNode={addNodeAt}
          onMoveNode={(id, position) => replaceGraph(updateNode(document.graph, id, { position }))}
          onNodeClick={(id) => tool === "edge" ? createOrSelectEdge(id) : selectNode(id)}
          onEdgeClick={selectEdge}
          onEdgeControl={(edge) => replaceGraph(upsertEdge(document.graph, edge))}
        />

        <aside className="side-panel editor-column" aria-label="Selection editor">
          <SelectionEditor
            node={selectedNode}
            edge={selectedEdge}
            simulation={simulation}
            document={document}
            onToggleRole={toggleRole}
            onRename={renameNodeById}
            onDeleteNode={deleteNodeById}
            onNodeMechanism={updateNodeMechanism}
            onVariableChange={updateVariableModel}
            onOverride={setOverride}
            onSelectionCondition={setSelectionCondition}
            onCoefficient={updateEdgeCoefficient}
            onEdgeEnabled={updateEdgeEnabled}
            onEdgeMechanism={updateEdgeMechanism}
            onDeleteEdge={deleteEdgeById}
          />
        </aside>

        <section className="advanced-drawer">
          <details>
            <summary>Advanced diagnostics and artifacts</summary>
            <div className="advanced-grid">
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
              <Section title="Simulation Diagnostics">
                <SimulationDiagnosticsPanel
                  document={document}
                  simulation={simulation}
                  empiricalDraws={empiricalDraws}
                  onEmpiricalDraws={updateEmpiricalDraws}
                />
              </Section>
              <Section title="Causal Effect Identification">
                <select value={effectKind} onChange={(event) => setEffectKind(event.target.value as EffectKind)}>
                  <option value="total">Adjustment (total effect)</option>
                  <option value="direct">Adjustment (direct effect)</option>
                  <option value="causalOdds">Adjustment (causal odds ratio)</option>
                  <option value="instrument">Instrumental variable</option>
                </select>
                <EffectPanel effectKind={effectKind} analysis={analysis} />
              </Section>
              <Section title="Testable Implications">
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
              <Section title="Summary">
                <SummaryPanel analysis={analysis} />
              </Section>
              <Section title="Bibliography">
                <BibliographyPanel topic={bibliographyTopic} onTopic={setBibliographyTopic} />
              </Section>
              <Section title="Export">
                <button type="button" onClick={() => downloadText("nudagitty-model.dagitty", serializeModel(document))}><Download size={15} /> model code</button>
                <button type="button" onClick={() => downloadText("nudagitty-model.tex", tikzDocument(document.graph))}><Download size={15} /> TikZ</button>
                <button type="button" onClick={() => exportBitmap("jpeg")}><Camera size={15} /> JPEG</button>
              </Section>
              <Section title="Workbench TODOs">
                <RoadmapTodoPanel />
              </Section>
            </div>
          </details>
        </section>
      </main>
    </div>
  );
}

function GraphCanvas(props: {
  graph: GraphModel;
  sourceGraph: GraphModel;
  selection: Selection;
  tool: ToolMode;
  edgeSource: string | null;
  analysis: AnalysisReport;
  simulation: SimulationResult;
  edgeMechanisms: Record<string, EdgeMechanism>;
  disabledEdgeIds: Set<string>;
  highlightedEdges: Map<string, "causal" | "biasing">;
  ancestorIds: Set<string>;
  onSelect: (selection: Selection) => void;
  onAddNode: (point: Point) => void;
  onMoveNode: (id: string, position: Point) => void;
  onNodeClick: (id: string) => void;
  onEdgeClick: (id: string) => void;
  onEdgeControl: (edge: GraphEdge) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const activePointersRef = useRef(new Map<number, PointerScreenPoint>());
  const pinchRef = useRef<{ distance: number; center: PointerScreenPoint } | null>(null);
  const viewportSignature = useMemo(() => graphViewportSignature(props.graph), [props.graph.nodes, props.graph.edges]);
  const fittedViewport = useMemo(() => fitViewportToGraph(props.graph), [viewportSignature]);
  const [viewport, setViewport] = useState<CanvasViewport>(() => fitViewportToGraph(props.graph));
  const viewBoxWidth = BASE_VIEWBOX.width / viewport.zoom;
  const viewBoxHeight = BASE_VIEWBOX.height / viewport.zoom;
  const viewBox = `${viewport.cx - viewBoxWidth / 2} ${viewport.cy - viewBoxHeight / 2} ${viewBoxWidth} ${viewBoxHeight}`;
  const legendWidth = 168;
  const legendHeight = 112;
  const legendX = viewport.cx + viewBoxWidth / 2 - legendWidth - 18;
  const legendY = viewport.cy + viewBoxHeight / 2 - legendHeight - 18;

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
        className={drag?.kind === "pan" ? "graph-canvas panning" : "graph-canvas"}
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
          <marker id="arrow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
            <path d="M 0 0 L 12 6 L 0 12 z" />
          </marker>
          <marker id="arrow-bias" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
            <path d="M 0 0 L 12 6 L 0 12 z" />
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
            const width = Math.min(8, 1.8 + Math.abs(edgeStrength) * 1.2);
            const geometry = edgeGeometry(edge, source, target, props.graph.edges);
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
                  className="edge-line"
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
                  <text className="edge-value" x={geometry.control.x} y={geometry.control.y - 15}>
                    <tspan className="edge-value-context" x={geometry.control.x}>{edgeLabel.context}</tspan>
                    <tspan className="edge-value-number" x={geometry.control.x} dy="13">{edgeLabel.value}</tspan>
                  </text>
                )}
                <EdgeFunctionGlyph kind={mechanism.kind} x={geometry.control.x} y={geometry.control.y} />
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
                <NodeDistributionMiniPlot state={state} variable={variable} />
                <NodeDistributionAnnotation state={state} value={value} variable={variable} />
              </g>
            );
          })}
          <GraphLegend x={legendX} y={legendY} width={legendWidth} height={legendHeight} />
        </g>
      </svg>
      <div className="canvas-zoom-controls" aria-label="Canvas zoom controls">
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>-</button>
        <span>{Math.round(viewport.zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.2)}>+</button>
        <button type="button" onClick={() => setViewport(fittedViewport)}>reset</button>
      </div>
      <div className="canvas-status">
        <span>{props.tool === "edge" ? (props.edgeSource ? `connect from ${props.edgeSource}` : "click a source variable") : "double-click canvas to add variable"}</span>
      </div>
    </section>
  );
}

function EdgeFunctionGlyph({ kind, x, y }: { kind: EdgeMechanismKind; x: number; y: number }) {
  return (
    <g className="edge-function-glyph" transform={`translate(${x - 14}, ${y + 5})`} aria-hidden="true">
      <rect className="edge-function-glyph-card" x="0" y="0" width="28" height="18" rx="4" />
      <g transform="translate(0 -1) scale(0.875 0.9)">
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
      <line className="graph-legend-line causal" x1="14" y1="34" x2="44" y2="34" />
      <text className="graph-legend-text" x="54" y="38">positive / causal</text>
      <line className="graph-legend-line biasing" x1="14" y1="52" x2="44" y2="52" />
      <text className="graph-legend-text" x="54" y="56">negative / biasing</text>
      <circle className="graph-legend-node" cx="29" cy="73" r="11" />
      <rect className="graph-legend-adjusted" x="15" y="59" width="28" height="28" rx="4" />
      <text className="graph-legend-text" x="54" y="77">adjusted variable</text>
      <g transform="translate(14 89)">
        <rect className="edge-function-glyph-card" x="0" y="0" width="28" height="18" rx="4" />
        <g transform="translate(0 -1) scale(0.875 0.9)">
          <path className="edge-function-glyph-axis" d="M 3 17 H 29 M 4 18 V 3" />
          <path className="edge-function-glyph-curve" d={functionGlyphPath("smooth_threshold")} />
        </g>
      </g>
      <text className="graph-legend-text" x="54" y="102">edge mechanism</text>
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
  if (mechanism.kind === "threshold") return { context: "threshold", value: `t ${formatValue(mechanism.threshold)}` };
  if (mechanism.kind === "smooth_threshold") return { context: "smooth thresh", value: `t ${formatValue(mechanism.threshold)}` };
  if (mechanism.kind === "saturating") return { context: "saturating", value: `scale ${formatSignedValue(mechanism.scale)}` };
  if (mechanism.kind === "quadratic") return { context: "quadratic", value: `b2 ${formatSignedValue(mechanism.beta2)}` };
  if (mechanism.kind === "piecewise_linear") return { context: "piecewise", value: `${mechanism.points.length} knots` };
  if (mechanism.kind === "hill_emax") return { context: "Hill / Emax", value: `max ${formatSignedValue(mechanism.maxEffect)}` };
  if (mechanism.kind === "log_linear") return { context: "log-linear", value: `coef ${formatSignedValue(mechanism.coefficient)}` };
  if (mechanism.kind === "power_law") return { context: "power law", value: `pow ${formatValue(mechanism.exponent)}` };
  return { context: "spline", value: `${mechanism.points.length} knots` };
}

function edgeMechanismDisplayStrength(mechanism: EdgeMechanism): number {
  if (mechanism.kind === "linear") return mechanism.coefficient;
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

function NodeDistributionMiniPlot({ state, variable }: { state?: SimulatedNodeState; variable: VariableModel }) {
  const samples = state?.empirical.samples ?? [];
  if (!state || samples.length < 2) return null;
  if (isBinaryDistributionState(state, variable)) return <BinaryNodeDistributionMiniPlot state={state} />;
  const domain = distributionPlotDomain(state);
  if (!domain) return null;
  const width = 96;
  const height = 32;
  const bins = histogram(samples, domain, 20, state.empirical.weights);
  const maxBin = Math.max(...bins, 1);
  const analyticPath = state.analytic ? analyticDistributionPath(state.analytic, domain, width, height) : null;
  const title = [
    state.analytic ? `analytic ${analyticDistributionLabel(state.analytic)} (${state.analytic.note})` : "analytic unavailable",
    `empirical n=${samples.length}`,
    state.empirical.mean !== null ? `sample mean ${formatValue(state.empirical.mean)}` : ""
  ].filter(Boolean).join("; ");
  return (
    <g className="node-distribution-plot" transform="translate(-48 28)" aria-hidden="true">
      <title>{title}</title>
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
  const width = 96;
  const height = 32;
  const baseline = height - 7;
  const maxBarHeight = height - 11;
  const probabilities = [1 - probability, probability];
  const title = [
    `binary P(1)=${formatPercent(probability)}`,
    `empirical n=${state.empirical.samples.length}`,
    state.analytic ? `analytic ${analyticDistributionLabel(state.analytic)} (${state.analytic.note})` : ""
  ].filter(Boolean).join("; ");
  return (
    <g className="node-distribution-plot binary-node-distribution-plot" transform="translate(-48 28)" aria-hidden="true">
      <title>{title}</title>
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

function NodeDistributionAnnotation({ state, value, variable }: { state?: SimulatedNodeState; value: number | undefined; variable: VariableModel }) {
  const lines = nodeDistributionAnnotationLines(state, value, variable);
  if (lines.length === 0) return null;
  const title = nodeDistributionFullSummary(state, value, variable);
  return (
    <g className="node-distribution-annotation" aria-hidden="true">
      <title>{title}</title>
      {lines.map((line, index) => (
        <text key={line} className={index === 0 ? "node-value" : "node-distribution-label"} y={74 + (index * 13)}>{line}</text>
      ))}
    </g>
  );
}

function ScatterplotPanel(props: {
  graph: GraphModel;
  simulation: SimulationResult;
  pair: ScatterPair;
  onPair: (pair: ScatterPair) => void;
  onSelectNode: (id: string) => void;
}) {
  const nodes = [...props.graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const pair = reconcileScatterPair(props.graph, props.pair);
  const xState = props.simulation.nodeStates[pair.x];
  const yState = props.simulation.nodeStates[pair.y];
  const points = useMemo(() => scatterPoints(xState, yState), [xState, yState]);
  const xDomain = scatterDomain(points.map((point) => point.x), xState);
  const yDomain = scatterDomain(points.map((point) => point.y), yState);
  const stats = weightedScatterStats(points);
  const width = 280;
  const height = 220;
  const margin = { left: 38, right: 12, top: 14, bottom: 34 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxWeight = Math.max(...points.map((point) => point.weight), 1);
  const xNode = props.graph.nodes.find((node) => node.id === pair.x);
  const yNode = props.graph.nodes.find((node) => node.id === pair.y);
  const xLabel = xNode ? nodeDisplayName(xNode) : pair.x;
  const yLabel = yNode ? nodeDisplayName(yNode) : pair.y;
  const xIsBinary = xNode !== undefined && normalizeVariableModel(xNode.variable).valueType === "binary";
  const yIsBinary = yNode !== undefined && normalizeVariableModel(yNode.variable).valueType === "binary";
  const binaryPair = xIsBinary && yIsBinary;
  const binaryContinuousPair = xIsBinary && !yIsBinary;
  const toX = (value: number) => margin.left + ((value - xDomain[0]) / (xDomain[1] - xDomain[0] || 1)) * plotWidth;
  const toY = (value: number) => margin.top + plotHeight - ((value - yDomain[0]) / (yDomain[1] - yDomain[0] || 1)) * plotHeight;
  const regression = stats && Number.isFinite(stats.slope) && Number.isFinite(stats.intercept)
    ? {
      x1: xDomain[0],
      y1: stats.intercept + stats.slope * xDomain[0],
      x2: xDomain[1],
      y2: stats.intercept + stats.slope * xDomain[1]
    }
    : null;

  if (nodes.length < 2) return <p className="muted">Add at least two variables to compare simulated observations.</p>;

  return (
    <div className="scatterplot-panel">
      <div className="scatter-controls">
        <label className="field">
          <span>x variable</span>
          <select
            aria-label="x variable"
            value={pair.x}
            onChange={(event) => props.onPair({ ...pair, x: event.target.value })}
          >
            {nodes.map((node) => <option value={node.id} key={node.id}>{nodeDisplayName(node)}</option>)}
          </select>
        </label>
        <label className="field">
          <span>y variable</span>
          <select
            aria-label="y variable"
            value={pair.y}
            onChange={(event) => props.onPair({ ...pair, y: event.target.value })}
          >
            {nodes.map((node) => <option value={node.id} key={node.id}>{nodeDisplayName(node)}</option>)}
          </select>
        </label>
      </div>

      {binaryPair ? (
        <BinaryPairView
          points={points}
          xLabel={xLabel}
          yLabel={yLabel}
          effectiveSampleSize={props.simulation.conditioning.effectiveSampleSize}
        />
      ) : binaryContinuousPair ? (
        <BinaryContinuousPairView points={points} xLabel={xLabel} yLabel={yLabel} yState={yState} />
      ) : (
        <>
          <svg
            className="scatterplot-svg"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`Scatterplot of ${xLabel} and ${yLabel}`}
          >
            <rect className="scatter-plot-background" x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} />
            <line className="scatter-axis" x1={margin.left} y1={margin.top + plotHeight} x2={margin.left + plotWidth} y2={margin.top + plotHeight} />
            <line className="scatter-axis" x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + plotHeight} />
            <text className="scatter-tick-label" x={margin.left} y={height - 17}>{formatValue(xDomain[0])}</text>
            <text className="scatter-tick-label end" x={margin.left + plotWidth} y={height - 17}>{formatValue(xDomain[1])}</text>
            <text className="scatter-tick-label y-start" x={margin.left - 7} y={margin.top + plotHeight}>{formatValue(yDomain[0])}</text>
            <text className="scatter-tick-label y-end" x={margin.left - 7} y={margin.top + 4}>{formatValue(yDomain[1])}</text>
            <text className="scatter-axis-label x" x={margin.left + plotWidth / 2} y={height - 3}>{abbreviateLabel(xLabel, 28)}</text>
            <text className="scatter-axis-label y" x={12} y={margin.top + plotHeight / 2} transform={`rotate(-90 12 ${margin.top + plotHeight / 2})`}>{abbreviateLabel(yLabel, 24)}</text>
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
          ) : (
            <div className="scatter-stats">
              <span>draws {points.length}</span>
              <span>corr {stats?.correlation === null || stats?.correlation === undefined ? "n/a" : formatValue(stats.correlation)}</span>
              <span>x mean {stats ? formatValue(stats.meanX) : "n/a"}</span>
              <span>y mean {stats ? formatValue(stats.meanY) : "n/a"}</span>
              {props.simulation.conditioning.effectiveSampleSize !== null && <span>ESS {formatValue(props.simulation.conditioning.effectiveSampleSize)}</span>}
            </div>
          )}
        </>
      )}

      <div className="button-row">
        <button type="button" className="mini-button" onClick={() => props.onSelectNode(pair.x)}>edit x</button>
        <button type="button" className="mini-button" onClick={() => props.onSelectNode(pair.y)}>edit y</button>
      </div>
    </div>
  );
}

function BinaryContinuousPairView(props: { points: ScatterPoint[]; xLabel: string; yLabel: string; yState: SimulatedNodeState | undefined }) {
  const groups = binaryContinuousGroups(props.points);
  const groupZero = groups[0];
  const groupOne = groups[1];
  const totalWeight = groups.reduce((sum, group) => sum + group.weight, 0);
  const gap = groupZero?.mean !== null && groupZero?.mean !== undefined && groupOne?.mean !== null && groupOne?.mean !== undefined
    ? groupOne.mean - groupZero.mean
    : null;
  const width = 280;
  const height = 220;
  const margin = { left: 38, right: 12, top: 14, bottom: 40 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const yDomain = scatterSampleDomain(props.points.map((point) => point.y), props.yState);
  const maxWeight = Math.max(...props.points.map((point) => point.weight), 1);
  const toX = (value: 0 | 1, index: number) => {
    const center = value === 0 ? margin.left + plotWidth * 0.25 : margin.left + plotWidth * 0.75;
    return center + deterministicJitter(index) * 20;
  };
  const groupCenter = (value: 0 | 1) => value === 0 ? margin.left + plotWidth * 0.25 : margin.left + plotWidth * 0.75;
  const toY = (value: number) => margin.top + plotHeight - ((value - yDomain[0]) / (yDomain[1] - yDomain[0] || 1)) * plotHeight;

  if (props.points.length === 0 || totalWeight <= 0) {
    return <p className="muted">No finite paired samples are available for this variable pair.</p>;
  }

  return (
    <div className="binary-continuous-pair-view">
      <svg
        className="scatterplot-svg binary-continuous-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Two-group plot of ${props.yLabel} by ${props.xLabel}`}
      >
        <rect className="scatter-plot-background" x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} />
        <line className="scatter-axis" x1={margin.left} y1={margin.top + plotHeight} x2={margin.left + plotWidth} y2={margin.top + plotHeight} />
        <line className="scatter-axis" x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + plotHeight} />
        <text className="scatter-tick-label y-start" x={margin.left - 7} y={margin.top + plotHeight}>{formatValue(yDomain[0])}</text>
        <text className="scatter-tick-label y-end" x={margin.left - 7} y={margin.top + 4}>{formatValue(yDomain[1])}</text>
        <text className="binary-group-label" x={groupCenter(0)} y={height - 22}>0</text>
        <text className="binary-group-label" x={groupCenter(1)} y={height - 22}>1</text>
        <text className="scatter-axis-label x" x={margin.left + plotWidth / 2} y={height - 3}>{abbreviateLabel(props.xLabel, 28)}</text>
        <text className="scatter-axis-label y" x={12} y={margin.top + plotHeight / 2} transform={`rotate(-90 12 ${margin.top + plotHeight / 2})`}>{abbreviateLabel(props.yLabel, 24)}</text>
        {props.points.map((point) => {
          const x = coerceBinary(point.x) as 0 | 1;
          const normalizedWeight = Math.sqrt(Math.max(0, point.weight) / maxWeight);
          return (
            <circle
              className="scatter-point binary-continuous-point"
              key={point.index}
              cx={toX(x, point.index)}
              cy={toY(point.y)}
              r={1.6 + normalizedWeight * 2.2}
              style={{ opacity: 0.18 + normalizedWeight * 0.58 }}
            />
          );
        })}
        {groups.map((group) => group.mean !== null && (
          <g className="binary-group-mean" key={group.value}>
            <line
              x1={groupCenter(group.value) - 33}
              y1={toY(group.mean)}
              x2={groupCenter(group.value) + 33}
              y2={toY(group.mean)}
            />
            <text x={groupCenter(group.value)} y={toY(group.mean) - 5}>mean {formatValue(group.mean)}</text>
          </g>
        ))}
      </svg>

      <div className="scatter-stats binary-continuous-stats">
        <span>draws {props.points.length}</span>
        <span>x=1 share {groupOne ? formatPercent(groupOne.share) : "n/a"}</span>
        <span>x=0 mean {groupZero?.mean === null || groupZero?.mean === undefined ? "n/a" : formatValue(groupZero.mean)}</span>
        <span>x=1 mean {groupOne?.mean === null || groupOne?.mean === undefined ? "n/a" : formatValue(groupOne.mean)}</span>
        <span>x=0 n {groupZero ? formatWeightedCount(groupZero.weight) : "0"}</span>
        <span>x=1 n {groupOne ? formatWeightedCount(groupOne.weight) : "0"}</span>
        <span>gap 1-0 {gap === null ? "n/a" : formatSignedValue(gap)}</span>
      </div>
    </div>
  );
}

function BinaryPairView(props: { points: ScatterPoint[]; xLabel: string; yLabel: string; effectiveSampleSize: number | null }) {
  const cells = binaryCells(props.points);
  const totalWeight = cells.reduce((sum, cell) => sum + cell.weight, 0);
  const maxWeight = Math.max(...cells.map((cell) => cell.weight), 1);
  const cell = (x: 0 | 1, y: 0 | 1) => cells.find((candidate) => candidate.x === x && candidate.y === y) ?? { x, y, weight: 0, count: 0, percent: 0 };
  const yPositive = cell(1, 1).weight + cell(0, 1).weight;
  const xPositive = cell(1, 1).weight + cell(1, 0).weight;

  if (props.points.length === 0 || totalWeight <= 0) {
    return <p className="muted">No finite paired samples are available for this variable pair.</p>;
  }

  return (
    <div className="binary-pair-view">
      <div className="confusion-matrix" role="img" aria-label={`Confusion matrix of ${props.xLabel} and ${props.yLabel}`}>
        <div className="matrix-corner" />
        <div className="matrix-axis-label">x=0</div>
        <div className="matrix-axis-label">x=1</div>
        {[1, 0].map((y) => (
          <Fragment key={y}>
            <div className="matrix-axis-label row">y={y}</div>
            {[0, 1].map((x) => {
              const current = cell(x as 0 | 1, y as 0 | 1);
              const intensity = current.weight / maxWeight;
              const agreement = x === y;
              return (
                <div
                  className={agreement ? "matrix-cell agreement" : "matrix-cell disagreement"}
                  key={x}
                  title={`${props.yLabel}=${y}, ${props.xLabel}=${x}: ${formatWeightedCount(current.weight)} (${formatPercent(current.percent)})`}
                  style={{
                    backgroundColor: agreement
                      ? `rgba(35, 113, 111, ${0.12 + intensity * 0.68})`
                      : `rgba(178, 69, 103, ${0.1 + intensity * 0.6})`
                  }}
                >
                  <strong>{formatPercent(current.percent)}</strong>
                  <span>{formatWeightedCount(current.weight)}</span>
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="scatter-stats">
        <span>draws {props.points.length}</span>
        <span>positive x {formatPercent(xPositive / totalWeight)}</span>
        <span>positive y {formatPercent(yPositive / totalWeight)}</span>
        {props.effectiveSampleSize !== null && <span>ESS {formatValue(props.effectiveSampleSize)}</span>}
      </div>
    </div>
  );
}

function ScenarioPanel(props: {
  document: GraphDocument;
  completedOutputModuleId: string | null;
  analysis: AnalysisReport;
  simulation: SimulationResult;
  onResample: () => void;
  onClearOverrides: () => void;
  onClearSelections: () => void;
  mode: WorkbenchMode;
  domain: ExampleDomain;
  denouement: ExampleDenouement;
  denouementTitle: string;
}) {
  const blocked = simulationBlocked(props.simulation);
  const overrides = Object.keys(props.document.simulation.overrides);
  const selections = Object.keys(props.document.simulation.selections ?? {});
  return (
    <div className="simulation-panel">
      <div className="simulation-status">
        <span className={blocked ? "status-dot blocked" : "status-dot active"} />
        <span>{blocked ? "blocked" : "live propagation"}</span>
      </div>
      <div className="button-row">
        <button type="button" onClick={props.onResample}><RefreshCw size={15} /> resample</button>
        {overrides.length > 0 && <button type="button" onClick={props.onClearOverrides}>clear fixed values</button>}
        {selections.length > 0 && <button type="button" onClick={props.onClearSelections}>clear conditions</button>}
      </div>
      <CompletedOutputPanel
        moduleId={props.completedOutputModuleId}
        analysis={props.analysis}
        document={props.document}
        simulation={props.simulation}
      />
      <PractitionerModulesDisclosure
        mode={props.mode}
        domain={props.domain}
        denouement={props.denouement}
        denouementTitle={props.denouementTitle}
      />
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

function PractitionerModulesDisclosure(props: {
  mode: WorkbenchMode;
  domain: ExampleDomain;
  denouement: ExampleDenouement;
  denouementTitle: string;
}) {
  return (
    <details className="scenario-disclosure practitioner-modules">
      <summary>
        <span>Practitioner modules</span>
        <small>claim packet, denouement, design modules</small>
      </summary>
      <div className="scenario-disclosure-body">
        <DenouementPanel denouement={props.denouement} title={props.denouementTitle} />
        <DesignModulePanel mode={props.mode} domain={props.domain} />
      </div>
    </details>
  );
}

function DrawCountControl(props: { value: number; onChange: (sampleSize: number) => void }) {
  const update = (value: number) => {
    if (Number.isFinite(value)) props.onChange(clampDrawCount(value));
  };
  return (
    <div className="draw-count-control">
      <div className="draw-count-head">
        <strong>Empirical draws</strong>
        <span>{props.value.toLocaleString()} per run</span>
      </div>
      <input
        aria-label="empirical draws"
        type="number"
        min={EMPIRICAL_DRAW_MIN}
        max={EMPIRICAL_DRAW_MAX}
        step={EMPIRICAL_DRAW_STEP}
        value={props.value}
        onChange={(event) => update(Number(event.target.value))}
      />
      <input
        aria-label="empirical draws slider"
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
  const value = props.simulation.values[props.node.id] ?? 0;
  const condition = props.document.simulation.selections[props.node.id];
  const state = props.simulation.nodeStates[props.node.id];
  const [sliderMin, sliderMax] = conditioningSliderBounds(state, condition?.value ?? value);
  const sliderStep = conditioningSliderStep(sliderMin, sliderMax);
  const updateCondition = (patch: Partial<SimulationSelectionCondition>) => {
    props.onSelectionCondition(props.node.id, {
      operator: condition?.operator ?? "at_least",
      value: condition?.value ?? value,
      upper: condition?.upper ?? null,
      sampling: condition?.sampling ?? "auto",
      ...patch
    });
  };
  return (
    <div className={`module-card conditioning-editor ${condition ? "active" : ""}`}>
      <div className="module-card-header">
        <strong>Conditioning filter</strong>
        <span className={condition ? "module-badge active" : "module-badge"}>{condition ? "active" : "available"}</span>
      </div>
      <p className="muted">Observational selection, not a structural intervention.</p>
      <label className="field">
        <span>condition</span>
        <select
          value={condition?.operator ?? "at_least"}
          onChange={(event) => updateCondition({
            operator: event.target.value as SimulationSelectionCondition["operator"],
            upper: event.target.value === "between" ? condition?.upper ?? value : null
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
      <div className="two-field-grid">
        <NumberField
          label={condition?.operator === "between" ? "lower" : "value"}
          value={condition?.value ?? value}
          onChange={(nextValue) => updateCondition({ value: nextValue, upper: condition?.operator === "between" ? condition.upper ?? nextValue : null })}
        />
        {condition?.operator === "between" && (
          <NumberField
            label="upper"
            value={condition.upper ?? condition.value}
            onChange={(upper) => updateCondition({ upper })}
          />
        )}
      </div>
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
      )}
      <div className="button-row">
        {!condition && <button type="button" onClick={() => props.onSelectionCondition(props.node.id, { operator: "at_least", value, upper: null, sampling: "auto" })}>condition on current</button>}
        {condition && <button type="button" onClick={() => props.onSelectionCondition(props.node.id, null)}>clear condition</button>}
      </div>
    </div>
  );
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
          <span>selected {inferenceModeLabel(conditioning.requestedInference)}</span>
          <span>active {inferenceModeLabel(conditioning.primaryMethod)}</span>
          {conditioning.analytic
            ? <span>{analyticActive ? "analytic active" : "analytic available"} {analyticSummaryLabel(conditioning.analytic)}</span>
            : <span>analytic unavailable</span>}
          <span>empirical check {conditioning.empiricalMethod}</span>
          <span>empirical draws {conditioning.acceptedSamples} / {conditioning.totalSamples}</span>
          {conditioning.effectiveSampleSize !== null && <span>ESS {formatValue(conditioning.effectiveSampleSize)}</span>}
        </>
      ) : (
        <>
          <span>selected auto</span>
          <span>active forward</span>
          <span>analytic inactive</span>
        </>
      )}
    </div>
  );
}

function DesignModulePanel({ mode, domain }: { mode: WorkbenchMode; domain: ExampleDomain }) {
  const modules = designModulesForMode(mode, domain);
  return (
    <div className="design-module-panel">
      <div className="module-card-header">
        <strong>Design modules</strong>
        <span className="module-badge">{MODE_LABELS[mode]}</span>
      </div>
      <p className="muted">{designModuleScopeLabel(mode, domain)}</p>
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
  node?: GraphNode;
  edge?: GraphEdge;
  simulation: SimulationResult;
  document: GraphDocument;
  onToggleRole: (id: string, role: keyof NodeRoleFlags) => void;
  onRename: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onNodeMechanism: (id: string, patch: Partial<NodeMechanism>) => void;
  onVariableChange: (nodeId: string, variable: VariableModel) => void;
  onOverride: (id: string, value: number | null) => void;
  onSelectionCondition: (nodeId: string, condition: SimulationSelectionCondition | null) => void;
  onCoefficient: (edge: GraphEdge, coefficient: number) => void;
  onEdgeEnabled: (edge: GraphEdge, enabled: boolean) => void;
  onEdgeMechanism: (edge: GraphEdge, patch: Partial<EdgeMechanism>) => void;
  onDeleteEdge: (edgeId: string) => void;
}) {
  if (props.node) return <VariableEditor
    node={props.node}
    simulation={props.simulation}
    document={props.document}
    onToggleRole={props.onToggleRole}
    onRename={props.onRename}
    onDelete={props.onDeleteNode}
    onMechanism={props.onNodeMechanism}
    onVariableChange={props.onVariableChange}
    onOverride={props.onOverride}
    onSelectionCondition={props.onSelectionCondition}
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

function VariableEditor(props: {
  node: GraphNode;
  simulation: SimulationResult;
  document: GraphDocument;
  onToggleRole: (id: string, role: keyof NodeRoleFlags) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onMechanism: (id: string, patch: Partial<NodeMechanism>) => void;
  onVariableChange: (nodeId: string, variable: VariableModel) => void;
  onOverride: (id: string, value: number | null) => void;
  onSelectionCondition: (nodeId: string, condition: SimulationSelectionCondition | null) => void;
}) {
  const [tab, setTab] = useState<VariableEditorTab>("model");
  const node = props.node;
  const variable = normalizeVariableModel(node.variable);
  const mechanism = normalizeNodeMechanism(props.document.simulation.nodes[node.id]);
  const value = props.simulation.values[node.id] ?? 0;
  const state = props.simulation.nodeStates[node.id];
  const parentIds = props.document.graph.edges.filter((edge) => edge.kind === "directed" && edge.target === node.id).map((edge) => edge.source);
  const isRoot = parentIds.length === 0;
  const inferredValueType = inferValueTypeFromMechanism(isRoot, mechanism, variable.valueType);
  const updateVariable = (patch: Partial<VariableModel>) => props.onVariableChange(node.id, normalizeVariableModel({ ...variable, ...patch }));

  useEffect(() => {
    setTab("model");
  }, [node.id]);

  return (
    <div className="selection-editor" aria-label={`Variable ${node.id}`}>
      <div className="selection-editor-header">
        <div>
          <span>Variable</span>
          <strong>{node.id}</strong>
        </div>
      </div>

      <div className="selection-editor-body">
        <div className="value-card">
          <strong>current value</strong>
          <span>{formatValue(value)}</span>
        </div>

        <div className="variable-tabs" role="tablist" aria-label="Variable sections">
          <button type="button" role="tab" aria-selected={tab === "model"} className={tab === "model" ? "active" : ""} onClick={() => setTab("model")}>model</button>
          <button type="button" role="tab" aria-selected={tab === "interventions"} className={tab === "interventions" ? "active" : ""} onClick={() => setTab("interventions")}>interventions</button>
          <button type="button" role="tab" aria-selected={tab === "adjustment"} className={tab === "adjustment" ? "active" : ""} onClick={() => setTab("adjustment")}>adjustment</button>
        </div>

        {tab === "model" && <div className="variable-tab-panel" role="tabpanel">
          <div className="selection-editor-grid">
            <div className="selection-editor-block">
              <strong>Roles</strong>
              <div className="role-toggle-grid">
                <RoleToggle label="exposure" checked={node.roles.exposure} onChange={() => props.onToggleRole(node.id, "exposure")} />
                <RoleToggle label="outcome" checked={node.roles.outcome} onChange={() => props.onToggleRole(node.id, "outcome")} />
                <RoleToggle label="adjusted" checked={node.roles.adjusted} onChange={() => props.onToggleRole(node.id, "adjusted")} />
                <RoleToggle label="selected" checked={node.roles.selected} onChange={() => props.onToggleRole(node.id, "selected")} />
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
        </div>}

        {tab === "interventions" && <div className="variable-tab-panel intervention-tab-panel" role="tabpanel">
          <HardDoEditor node={node} document={props.document} simulation={props.simulation} onOverride={props.onOverride} />
          <ConditioningEditor node={node} document={props.document} simulation={props.simulation} onSelectionCondition={props.onSelectionCondition} />
          <PlannedModuleSet />
        </div>}

        {tab === "adjustment" && <div className="variable-tab-panel adjustment-tab-panel" role="tabpanel">
          <AdjustmentMethodEditor
            node={node}
            document={props.document}
            simulation={props.simulation}
            onVariableChange={props.onVariableChange}
          />
        </div>}

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
  onVariableChange: (nodeId: string, variable: VariableModel) => void;
}) {
  const variable = normalizeVariableModel(props.node.variable);
  const state = props.simulation.nodeStates[props.node.id];
  const exposureNode = props.document.graph.nodes.find((node) => node.roles.exposure);
  const exposureState = exposureNode ? props.simulation.nodeStates[exposureNode.id] : undefined;
  const exposureVariable = normalizeVariableModel(exposureNode?.variable);
  const continuousEnough = variable.valueType !== "binary" && variable.valueType !== "categorical" && variable.valueType !== "text";
  const method = variable.adjustment.method === "none" ? "bins" : variable.adjustment.method;
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
          <button type="button" className={method === "propensity_score_todo" ? "active planned" : "planned"} onClick={() => updateAdjustment({ method: "propensity_score_todo" })}>Propensity weighting <span>todo</span></button>
        </div>
      </div>
      {method === "propensity_score_todo" ? (
        <div className="selection-editor-block adjustment-todo">
          <strong>Propensity score weighting</strong>
          <p className="muted">Planned: estimate treatment probability from adjusted variables, show overlap, trim unsupported regions, and weight the raw comparison. Bins come first because they make positivity visible.</p>
        </div>
      ) : (
        <BinnedAdjustmentEditor
          node={props.node}
          variable={variable}
          state={state}
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

function BinnedAdjustmentEditor(props: {
  node: GraphNode;
  variable: VariableModel;
  state: SimulatedNodeState | undefined;
  exposureNode: GraphNode | undefined;
  exposureState: SimulatedNodeState | undefined;
  exposureValueType: VariableModel["valueType"];
  continuousEnough: boolean;
  onCutpoints: (cutpoints: number[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draggingCut, setDraggingCut] = useState<number | null>(null);
  const domain = props.state ? distributionPlotDomain(props.state) : null;
  const samples = props.state?.empirical.samples.filter(Number.isFinite) ?? [];
  const cutpoints = domain ? sanitizeCutpoints(props.variable.adjustment.cutpoints, domain) : [];
  const positivity = domain && props.exposureState && props.exposureValueType === "binary"
    ? positivityRows(props.state, props.exposureState, cutpoints, domain)
    : [];
  const bars = domain ? histogram(samples, domain, 18, props.state?.empirical.weights) : [];
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
  if (props.exposureValueType !== "binary") return <p className="warning">Binned positivity currently checks binary exposures; propensity and continuous exposure methods are still planned.</p>;
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
  const contribution = props.simulation.contributions[props.edge.id] ?? 0;
  return (
    <div className="selection-editor connection-editor" aria-label={`Connection ${props.edge.source} to ${props.edge.target}`}>
      <div className="selection-editor-header">
        <div>
          <span>Connection</span>
          <strong>{props.edge.source} to {props.edge.target}</strong>
        </div>
      </div>
      <div className="selection-editor-body">
        <div className="value-card">
          <strong>current contribution</strong>
          <span className={contribution >= 0 ? "positive" : "negative"}>{formatSignedValue(contribution)}</span>
        </div>
        <EdgePanel
          edge={props.edge}
          document={props.document}
          simulation={props.simulation}
          onCoefficient={props.onCoefficient}
          onEnabled={props.onEnabled}
          onMechanism={props.onMechanism}
        />
        <div className="button-row">
          <button type="button" onClick={() => props.onDelete(props.edge.id)}>delete</button>
        </div>
      </div>
    </div>
  );
}

function EdgePanel(props: {
  edge: GraphEdge;
  document: GraphDocument;
  simulation: SimulationResult;
  onCoefficient: (edge: GraphEdge, coefficient: number) => void;
  onEnabled: (edge: GraphEdge, enabled: boolean) => void;
  onMechanism: (edge: GraphEdge, patch: Partial<EdgeMechanism>) => void;
}) {
  const mechanism = normalizeEdgeMechanism(props.document.simulation.edges[props.edge.id]);
  const contribution = props.simulation.contributions[props.edge.id] ?? 0;
  return (
    <div className="edge-panel">
      <Checkbox label="enabled in simulation" checked={mechanism.enabled} onChange={(enabled) => props.onEnabled(props.edge, enabled)} />
      <div className="field">
        <span>function</span>
        <FunctionPicker
          label={`function ${props.edge.source} to ${props.edge.target}`}
          value={mechanism.kind}
          onOpen={() => undefined}
          onChange={(kind) => props.onMechanism(props.edge, defaultEdgeMechanism(kind))}
        />
      </div>
      <EdgeMechanismFields edge={props.edge} mechanism={mechanism} onMechanism={props.onMechanism} />
      {mechanism.kind === "linear" && (
        <TactileNumberField
          label="coefficient"
          value={mechanism.coefficient}
          min={-5}
          max={5}
          step={0.1}
          nudge={1}
          onChange={(coefficient) => props.onCoefficient(props.edge, coefficient)}
        />
      )}
      <p className={contribution >= 0 ? "assurance" : "warning"}>contribution {formatSignedValue(contribution)}</p>
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
    return <label className="field">
      <span>points</span>
      <input
        value={pointsToText(props.mechanism.points)}
        onChange={(event) => set({ points: parsePoints(event.target.value) })}
      />
    </label>;
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
    return <label className="field">
      <span>knots</span>
      <input
        value={pointsToText(props.mechanism.points)}
        onChange={(event) => set({ points: parsePoints(event.target.value) })}
      />
    </label>;
  }
  return null;
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
        <tr><td>selected</td><td>{analysis.selected.join(", ") || "none"}</td></tr>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="panel-section"><h2>{title}</h2>{children}</section>;
}

function IconButton({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className={active ? "icon-button active" : "icon-button"} title={label} aria-label={label} disabled={disabled} onClick={onClick}>{children}<span className="icon-button-label">{label}</span></button>;
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
  const magnitude = Math.max(Math.abs(value), Math.abs(nudge) * 10, 10);
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

function designModulesForMode(mode: WorkbenchMode, domain: ExampleDomain) {
  if (mode === "pro") return DESIGN_MODULES;
  if (mode === "basic") return DESIGN_MODULES.filter((module) => module.basic);
  return DESIGN_MODULES.filter((module) => module.basic || module.domains.includes(domain));
}

function designModuleScopeLabel(mode: WorkbenchMode, domain: ExampleDomain): string {
  if (mode === "basic") return "Small set for quick DAG explanations and common internet-argument traps.";
  if (mode === "pro") return "All tools are visible, including TODO modules that still need data and code plumbing.";
  const meta = EXAMPLE_DOMAINS.find((item) => item.id === domain);
  return `Recommended for ${meta?.label ?? "the selected domain"}. Switch to Pro to see everything.`;
}

function defaultScatterPair(graph: GraphModel): ScatterPair {
  const ids = graph.nodes.map((node) => node.id);
  if (ids.includes("Father_height") && ids.includes("Son_height")) return { x: "Father_height", y: "Son_height" };
  const exposure = graph.nodes.find((node) => node.roles.exposure)?.id;
  const outcome = graph.nodes.find((node) => node.roles.outcome)?.id;
  if (exposure && outcome) return { x: exposure, y: outcome };
  return { x: ids[0] ?? "", y: ids[1] ?? ids[0] ?? "" };
}

function reconcileScatterPair(graph: GraphModel, pair: ScatterPair): ScatterPair {
  const ids = new Set(graph.nodes.map((node) => node.id));
  if (ids.has(pair.x) && ids.has(pair.y)) return pair;
  return defaultScatterPair(graph);
}

function nodeDisplayName(node: GraphNode): string {
  return node.label && node.label !== node.id ? `${node.label} (${node.id})` : node.id;
}

function abbreviateLabel(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3))}...`;
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
    { x: 0, y: 0, weight: 0, count: 0, percent: 0 },
    { x: 1, y: 0, weight: 0, count: 0, percent: 0 },
    { x: 0, y: 1, weight: 0, count: 0, percent: 0 },
    { x: 1, y: 1, weight: 0, count: 0, percent: 0 }
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
  return cells.map((cell) => ({ ...cell, percent: totalWeight > 0 ? cell.weight / totalWeight : 0 }));
}

function scatterDomain(values: number[], state: SimulatedNodeState | undefined): [number, number] {
  const candidates = values.filter(Number.isFinite);
  const distributionDomain = state ? distributionPlotDomain(state) : null;
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

function scatterSampleDomain(values: number[], state: SimulatedNodeState | undefined): [number, number] {
  const candidates = values.filter(Number.isFinite);
  if (candidates.length === 0) {
    if (state?.empirical.min !== null && state?.empirical.min !== undefined) candidates.push(state.empirical.min);
    if (state?.empirical.max !== null && state?.empirical.max !== undefined) candidates.push(state.empirical.max);
  }
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

function weightedScatterStats(points: ScatterPoint[]): {
  meanX: number;
  meanY: number;
  correlation: number | null;
  slope: number;
  intercept: number;
} | null {
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

function edgeGeometry(edge: GraphEdge, source: GraphNode, target: GraphNode, edges: GraphEdge[]): { path: string; control: Point } {
  const control = edge.control ?? automaticControlPoint(edge, source.position, target.position, edges);
  const curved = !!edge.control || hasReciprocalDirectedEdge(edge, edges);
  const startRadius = nodeRadius(source) + 6;
  const endRadius = nodeRadius(target) + (edge.kind === "directed" || edge.kind === "bidirected" ? 12 : 6);
  if (!curved) {
    const start = moveToward(source.position, target.position, startRadius);
    const end = moveToward(target.position, source.position, endRadius);
    return { path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`, control };
  }
  const start = moveToward(source.position, control, startRadius);
  const end = moveToward(target.position, control, endRadius);
  return { path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`, control };
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function automaticControlPoint(edge: GraphEdge, source: Point, target: Point, edges: GraphEdge[]): Point {
  const mid = midpoint(source, target);
  if (!hasReciprocalDirectedEdge(edge, edges)) return mid;
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / length, y: dx / length };
  const sign = edge.source < edge.target ? 1 : -1;
  return { x: mid.x + normal.x * 44 * sign, y: mid.y + normal.y * 44 * sign };
}

function hasReciprocalDirectedEdge(edge: GraphEdge, edges: GraphEdge[]): boolean {
  if (edge.kind !== "directed") return false;
  return edges.some((candidate) => candidate.kind === "directed" && candidate.source === edge.target && candidate.target === edge.source);
}

function nodeRadius(node: GraphNode): number {
  return node.roles.exposure || node.roles.outcome ? 25 : 21;
}

function moveToward(from: Point, toward: Point, distance: number): Point {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / length) * distance, y: from.y + (dy / length) * distance };
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

function nodeDistributionAnnotationLines(state: SimulatedNodeState | undefined, value: number | undefined, variable: VariableModel): string[] {
  if (isBinaryDistributionState(state, variable)) {
    const lines: string[] = [];
    if (typeof value === "number" && Number.isFinite(value)) lines.push(binaryNodeValueLabel(value));
    const probability = binaryProbabilityFromState(state);
    if (probability !== null) lines.push(`P(1) ${formatPercent(probability)}`);
    return lines.map((line) => compactSvgText(line, 28)).slice(0, 2);
  }
  const lines: string[] = [];
  if (typeof value === "number" && Number.isFinite(value)) lines.push(`draw ${formatValue(value)}`);
  const moment = nodeMomentLabel(state);
  if (moment) lines.push(moment);
  return lines.map((line) => compactSvgText(line, 28)).slice(0, 2);
}

function nodeDistributionFullSummary(state: SimulatedNodeState | undefined, value: number | undefined, variable: VariableModel): string {
  const binary = isBinaryDistributionState(state, variable);
  return [
    typeof value === "number" && Number.isFinite(value) ? (binary ? binaryNodeValueLabel(value) : `chosen draw ${formatValue(value)}`) : "",
    binary ? binaryProbabilitySummary(state) : nodeMomentLabel(state),
    state?.analytic ? distributionParameterLabel(state.analytic.distribution) : "",
    state?.analytic ? `analytic ${analyticDistributionLabel(state.analytic)}` : "",
    state?.empirical.effectiveSampleSize !== null && state?.empirical.effectiveSampleSize !== undefined ? `ESS ${formatValue(state.empirical.effectiveSampleSize)}` : ""
  ].filter(Boolean).join("; ");
}

function isBinaryDistributionState(state: SimulatedNodeState | undefined, variable: VariableModel): boolean {
  return variable.valueType === "binary" || state?.analytic?.distribution.kind === "bernoulli";
}

function binaryNodeValueLabel(value: number): string {
  if (Math.abs(value - 0) < 1e-6 || Math.abs(value - 1) < 1e-6) return `draw ${coerceBinary(value)}`;
  return `value ${formatPercent(clamp(value, 0, 1))}`;
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

function pointsToText(points: EdgeMechanism["points"]): string {
  return points.map((point) => `${trimNumber(point.x)}:${trimNumber(point.y)}`).join(", ");
}

function parsePoints(value: string): EdgeMechanism["points"] {
  const parsed = value.split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [xRaw, yRaw] = part.split(":");
      return { x: Number(xRaw), y: Number(yRaw) };
    })
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  return parsed.length >= 2 ? parsed : defaultEdgeMechanism("piecewise_linear").points;
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function loadInitialDocument(): GraphDocument {
  const hash = window.location.hash.startsWith("#model=") ? window.location.hash.slice("#model=".length) : "";
  if (hash) {
    try {
      const decoded = JSON.parse(decodeURIComponent(atob(hash))) as GraphDocument;
      if (decoded.schemaVersion === 1) return { ...decoded, simulation: reconcileSimulationSpec(decoded.graph, decoded.simulation) };
    } catch {
      // Ignore malformed links and fall back to local state.
    }
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as GraphDocument;
      if (parsed.schemaVersion === 1) return { ...parsed, simulation: reconcileSimulationSpec(parsed.graph, parsed.simulation) };
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }
  return initialDocument();
}

function copyShareUrl(document: GraphDocument) {
  const encoded = btoa(encodeURIComponent(JSON.stringify(document)));
  const url = `${window.location.origin}${window.location.pathname}#model=${encoded}`;
  void navigator.clipboard?.writeText(url);
  window.history.replaceState(null, "", `#model=${encoded}`);
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
