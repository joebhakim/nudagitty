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
  VariableMeasurementModel,
  VariableModel,
  VariableSimulationView,
  ViewMode
} from "@nudagitty/core";

type ToolMode = "select" | "node" | "edge";
type Selection = { kind: "node"; id: string } | { kind: "edge"; id: string } | null;
type BibliographyTopic = "sem" | "nonlinear" | "probability" | "deep";
type CanvasViewport = { cx: number; cy: number; zoom: number };
type ScatterPair = { x: string; y: string };
type ScatterPoint = { x: number; y: number; weight: number; index: number };
type BinaryCell = { x: 0 | 1; y: 0 | 1; weight: number; count: number; percent: number };
type DragState =
  | { kind: "node"; id: string; offset: Point }
  | { kind: "edge-control"; id: string }
  | null;

const STORAGE_KEY = "nudagitty.document.v1";
const BASE_VIEWBOX = { width: 1000, height: 700 };
const DEFAULT_VIEWPORT: CanvasViewport = { cx: 0, cy: 0, zoom: 1 };
const NODE_VIEW_MARGIN = { x: 100, top: 110, bottom: 130 };

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

const MEASUREMENT_MODELS: Array<[VariableMeasurementModel["kind"], string]> = [
  ["observed", "observed"],
  ["noisy_proxy", "noisy proxy"],
  ["latent_construct", "latent construct"],
  ["censored", "censored"],
  ["rounded", "rounded"],
  ["missing_prone", "missing-prone"]
];

const SIMULATION_VIEW_MODES: Array<[VariableSimulationView["mode"], string]> = [
  ["single_draw", "single draw"],
  ["expected_value", "expected value"],
  ["population_mean", "population mean"],
  ["uncertainty_band", "uncertainty band"],
  ["causal_contrast", "causal contrast"]
];

const PLANNED_CAUSAL_MODULES = [
  { id: "soft_shift", label: "Soft intervention" },
  { id: "stochastic", label: "Stochastic assignment" },
  { id: "policy", label: "Policy rule" }
] as const;

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
  const [modelText, setModelText] = useState(() => serializeModel(document));
  const [modelDirty, setModelDirty] = useState(false);
  const [simulation, setSimulation] = useState<SimulationResult>(() => runSimulation(document.graph, document.simulation));
  const [scatterPair, setScatterPair] = useState<ScatterPair>(() => defaultScatterPair(document.graph));

  const [analysis, setAnalysis] = useState<AnalysisReport>(() => analyzeGraph(document.graph));
  const visibleGraph = useMemo(() => transformView(document.graph, viewMode), [document.graph, viewMode]);
  const selectedNode = selection?.kind === "node" ? findNode(document.graph, selection.id) : undefined;
  const selectedEdge = selection?.kind === "edge" ? findEdge(document.graph, selection.id) : undefined;
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

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    const graph = selection.kind === "node" ? deleteNode(document.graph, selection.id) : deleteEdge(document.graph, selection.id);
    setSelection(null);
    replaceGraph(graph);
  }, [document.graph, replaceGraph, selection]);

  const toggleRole = useCallback((nodeId: string, role: keyof NodeRoleFlags) => {
    const node = findNode(document.graph, nodeId);
    if (!node) return;
    replaceGraph(setNodeRole(document.graph, nodeId, role, !node.roles[role]));
  }, [document.graph, replaceGraph]);

  const renameSelectedNode = useCallback(() => {
    if (selection?.kind !== "node") return;
    const nextId = window.prompt("Rename variable", selection.id);
    if (!nextId) return;
    const graph = renameNode(document.graph, selection.id, nextId);
    const renamed = graph.nodes.find((node) => node.label === nextId || node.id === nextId);
    setSelection(renamed ? { kind: "node", id: renamed.id } : null);
    replaceGraph(graph);
  }, [document.graph, replaceGraph, selection]);

  const addNodeAt = useCallback((point: Point) => {
    const id = createNewNodeId(document.graph);
    const graph = addNode(document.graph, createNode(id, point));
    setSelection({ kind: "node", id });
    replaceGraph(graph);
  }, [document.graph, replaceGraph]);

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
    setSelection({ kind: "edge", id });
    setEdgeSource(null);
    replaceGraph(graph);
  }, [document.graph, edgeSource, replaceGraph]);

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
    setSelection(null);
  }, [commit]);

  const updateNodeMechanism = useCallback((nodeId: string, patch: Partial<NodeMechanism>) => {
    const current = normalizeNodeMechanism(document.simulation.nodes[nodeId]);
    commit({
      ...document,
      simulation: {
        ...document.simulation,
        nodes: {
          ...document.simulation.nodes,
          [nodeId]: { ...current, ...patch }
        }
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
          <IconButton label="New" onClick={() => commit(emptyDocument())}><FilePlus2 size={18} /></IconButton>
          <select aria-label="Examples" onChange={(event) => loadExample(event.target.value)} defaultValue="">
            <option value="" disabled>Examples</option>
            {EXAMPLES.map((example) => <option key={example.id} value={example.id}>{example.title}</option>)}
          </select>
          <IconButton label="Save" onClick={() => window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document))}><Save size={18} /></IconButton>
          <IconButton label="Share" onClick={() => copyShareUrl(document)}><Share2 size={18} /></IconButton>
          <IconButton label="SVG" onClick={() => exportSvg()}><Download size={18} /></IconButton>
          <IconButton label="PNG" onClick={() => exportBitmap("png")}><Camera size={18} /></IconButton>
        </div>
      </header>

      <main className="workspace">
        <aside className="side-panel model-panel">
          <Section title="Model Inspector">
            <VariablePanel
              node={selectedNode}
              simulation={simulation}
              document={document}
              onToggleRole={toggleRole}
              onRename={renameSelectedNode}
              onDelete={deleteSelection}
              onMechanism={updateNodeMechanism}
            />
          </Section>
          <Section title="Structural Model">
            <VariableModelPanel
              node={selectedNode}
              simulation={simulation}
              graph={document.graph}
              showMeasurement={false}
              onChange={updateVariableModel}
            />
          </Section>
          <Section title="Connection Functions">
            <ConnectionListPanel
              document={document}
              simulation={simulation}
              selectedEdgeId={selection?.kind === "edge" ? selection.id : null}
              onSelectEdge={(id) => setSelection({ kind: "edge", id })}
              onEnabled={updateEdgeEnabled}
              onMechanism={updateEdgeMechanism}
            />
          </Section>
          <Section title="Connection Detail">
            {selectedEdge
              ? <EdgePanel edge={selectedEdge} document={document} onCoefficient={updateEdgeCoefficient} onEnabled={updateEdgeEnabled} onMechanism={updateEdgeMechanism} simulation={simulation} />
              : <p className="muted">Select a connection to edit its simulation function.</p>}
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
          disabledEdgeIds={new Set(Object.entries(document.simulation.edges).filter(([, mechanism]) => !mechanism.enabled).map(([id]) => id))}
          highlightedEdges={highlightedEdges}
          ancestorIds={ancestorIds}
          onSelect={setSelection}
          onAddNode={addNodeAt}
          onMoveNode={(id, position) => replaceGraph(updateNode(document.graph, id, { position }))}
          onNodeClick={(id) => tool === "edge" ? createOrSelectEdge(id) : setSelection({ kind: "node", id })}
          onEdgeControl={(edge) => replaceGraph(upsertEdge(document.graph, edge))}
        />

        <aside className="side-panel scenario-column">
          <Section title="Scenario Builder">
            <ScenarioPanel
              node={selectedNode}
              document={document}
              simulation={simulation}
              onResample={resample}
              onClearOverrides={clearOverrides}
              onClearSelections={clearSelections}
              onOverride={setOverride}
              onSelectionCondition={setSelectionCondition}
              onSelectNode={(id) => setSelection({ kind: "node", id })}
            />
          </Section>
        </aside>

        <section className="results-dock">
          <Section title="Results">
            <div className="results-grid">
              <div className="results-block">
                <h3>Live Node Values</h3>
                <LiveValuesPanel
                  graph={document.graph}
                  simulation={simulation}
                  overrides={document.simulation.overrides}
                  selections={document.simulation.selections}
                  onSelectNode={(id) => setSelection({ kind: "node", id })}
                />
              </div>
              <div className="results-block">
                <h3>Pairwise Output</h3>
                <ScatterplotPanel
                  graph={document.graph}
                  simulation={simulation}
                  pair={scatterPair}
                  onPair={setScatterPair}
                  onSelectNode={(id) => setSelection({ kind: "node", id })}
                />
              </div>
            </div>
          </Section>
        </section>

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
  disabledEdgeIds: Set<string>;
  highlightedEdges: Map<string, "causal" | "biasing">;
  ancestorIds: Set<string>;
  onSelect: (selection: Selection) => void;
  onAddNode: (point: Point) => void;
  onMoveNode: (id: string, position: Point) => void;
  onNodeClick: (id: string) => void;
  onEdgeControl: (edge: GraphEdge) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const viewportSignature = useMemo(() => graphViewportSignature(props.graph), [props.graph.nodes, props.graph.edges]);
  const fittedViewport = useMemo(() => fitViewportToGraph(props.graph), [viewportSignature]);
  const [viewport, setViewport] = useState<CanvasViewport>(() => fitViewportToGraph(props.graph));
  const viewBoxWidth = BASE_VIEWBOX.width / viewport.zoom;
  const viewBoxHeight = BASE_VIEWBOX.height / viewport.zoom;
  const viewBox = `${viewport.cx - viewBoxWidth / 2} ${viewport.cy - viewBoxHeight / 2} ${viewBoxWidth} ${viewBoxHeight}`;

  useEffect(() => {
    setViewport(fittedViewport);
  }, [fittedViewport]);

  const svgPoint = useCallback((event: React.PointerEvent | React.MouseEvent | React.WheelEvent): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const mapped = point.matrixTransform(matrix.inverse());
    return { x: mapped.x, y: mapped.y };
  }, []);

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

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (!drag) return;
    const point = svgPoint(event);
    if (drag.kind === "node") {
      props.onMoveNode(drag.id, { x: point.x - drag.offset.x, y: point.y - drag.offset.y });
    } else {
      const edge = props.sourceGraph.edges.find((candidate) => candidate.id === drag.id);
      if (edge) props.onEdgeControl({ ...edge, control: point });
    }
  }, [drag, props, svgPoint]);

  const nodesById = useMemo(() => new Map(props.graph.nodes.map((node) => [node.id, node])), [props.graph.nodes]);

  return (
    <section className="canvas-shell" aria-label="Graph editor">
      <svg
        ref={svgRef}
        className="graph-canvas"
        role="img"
        aria-label="Editable causal graph"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        onWheel={(event) => {
          event.preventDefault();
          zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, svgPoint(event));
        }}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDrag(null)}
        onDoubleClick={(event) => {
          if (props.tool === "edge") return;
          props.onAddNode(svgPoint(event));
        }}
        onPointerDown={(event) => {
          const target = event.target as Element;
          if (event.target === svgRef.current || target.classList.contains("canvas-grid")) {
            props.onSelect(null);
            if (props.tool === "node") props.onAddNode(svgPoint(event));
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
            const contribution = props.simulation.contributions[edge.id] ?? 0;
            const width = Math.min(8, 1.8 + Math.abs(contribution) * 1.2);
            const geometry = edgeGeometry(edge, source, target, props.graph.edges);
            const enabled = !props.disabledEdgeIds.has(edge.id);
            return (
              <g key={edge.id} className={`edge ${selected ? "selected" : ""} ${semantic ?? ""} ${enabled ? "" : "disabled"}`}>
                <path
                  d={geometry.path}
                  className="edge-hit"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    props.onSelect({ kind: "edge", id: edge.id });
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
                {typeof contribution === "number" && Math.abs(contribution) > 0.001 && (
                  <text className={`edge-value ${contribution >= 0 ? "positive" : "negative"}`} x={geometry.control.x} y={geometry.control.y - 8}>
                    {formatSignedValue(contribution)}
                  </text>
                )}
              </g>
            );
          })}
          {props.graph.nodes.map((node) => {
            const selected = props.selection?.kind === "node" && props.selection.id === node.id;
            const value = props.simulation.values[node.id];
            const state = props.simulation.nodeStates[node.id];
            const isAncestor = props.ancestorIds.has(node.id);
            const changed = props.simulation.changedNodes.includes(node.id);
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
                <text className="node-label" y="4">{node.label}</text>
                <NodeDistributionMiniPlot state={state} />
                {typeof value === "number" && Number.isFinite(value) && <text className="node-value" y="74">{formatValue(value)}</text>}
              </g>
            );
          })}
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

function NodeDistributionMiniPlot({ state }: { state?: SimulatedNodeState }) {
  const samples = state?.empirical.samples ?? [];
  if (!state || samples.length < 2) return null;
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
  const binaryPair = xNode !== undefined
    && yNode !== undefined
    && normalizeVariableModel(xNode.variable).valueType === "binary"
    && normalizeVariableModel(yNode.variable).valueType === "binary";
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

function BinaryPairView(props: { points: ScatterPoint[]; xLabel: string; yLabel: string; effectiveSampleSize: number | null }) {
  const cells = binaryCells(props.points);
  const totalWeight = cells.reduce((sum, cell) => sum + cell.weight, 0);
  const maxWeight = Math.max(...cells.map((cell) => cell.weight), 1);
  const cell = (x: 0 | 1, y: 0 | 1) => cells.find((candidate) => candidate.x === x && candidate.y === y) ?? { x, y, weight: 0, count: 0, percent: 0 };
  const yPositive = cell(1, 1).weight + cell(0, 1).weight;
  const yNegative = cell(1, 0).weight + cell(0, 0).weight;
  const xPositive = cell(1, 1).weight + cell(1, 0).weight;
  const xNegative = cell(0, 1).weight + cell(0, 0).weight;

  if (props.points.length === 0 || totalWeight <= 0) {
    return <p className="muted">No finite paired samples are available for this variable pair.</p>;
  }

  return (
    <div className="binary-pair-view">
      <div className="binary-summary-table" role="table" aria-label={`Binary table of ${props.xLabel} and ${props.yLabel}`}>
        <div className="binary-table-row header" role="row">
          <span role="columnheader">{abbreviateLabel(props.yLabel, 16)} \\ {abbreviateLabel(props.xLabel, 16)}</span>
          <span role="columnheader">x=0</span>
          <span role="columnheader">x=1</span>
          <span role="columnheader">total</span>
        </div>
        {[1, 0].map((y) => (
          <div className="binary-table-row" role="row" key={y}>
            <span role="rowheader">y={y}</span>
            {[0, 1].map((x) => {
              const current = cell(x as 0 | 1, y as 0 | 1);
              return <span role="cell" key={x}>{formatWeightedCount(current.weight)} <small>{formatPercent(current.percent)}</small></span>;
            })}
            <span role="cell">{formatWeightedCount(y === 1 ? yPositive : yNegative)}</span>
          </div>
        ))}
        <div className="binary-table-row total" role="row">
          <span role="rowheader">total</span>
          <span role="cell">{formatWeightedCount(xNegative)}</span>
          <span role="cell">{formatWeightedCount(xPositive)}</span>
          <span role="cell">{formatWeightedCount(totalWeight)}</span>
        </div>
      </div>

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
  node?: GraphNode;
  document: GraphDocument;
  simulation: SimulationResult;
  onResample: () => void;
  onClearOverrides: () => void;
  onClearSelections: () => void;
  onOverride: (id: string, value: number | null) => void;
  onSelectionCondition: (id: string, condition: SimulationSelectionCondition | null) => void;
  onSelectNode: (id: string) => void;
}) {
  const blocked = simulationBlocked(props.simulation);
  const overrides = Object.keys(props.document.simulation.overrides);
  const selections = Object.keys(props.document.simulation.selections ?? {});
  const nodes = [...props.document.graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  return (
    <div className="simulation-panel">
      <div className="simulation-status">
        <span className={blocked ? "status-dot blocked" : "status-dot active"} />
        <span>{blocked ? "blocked" : "live propagation"}</span>
        <span className="muted">seed {props.document.simulation.seed}</span>
      </div>
      <div className="button-row">
        <button type="button" onClick={props.onResample}><RefreshCw size={15} /> resample</button>
        <button type="button" onClick={props.onClearOverrides} disabled={overrides.length === 0}>clear hard do</button>
        <button type="button" onClick={props.onClearSelections} disabled={selections.length === 0}>clear conditions</button>
      </div>
      <ConditioningMethodPanel simulation={props.simulation} />
      {props.simulation.diagnostics.map((message) => <p className="warning" key={message}>{message}</p>)}
      <div className="scenario-group">
        <strong>Interventions</strong>
        {props.node
          ? <HardDoEditor node={props.node} document={props.document} simulation={props.simulation} onOverride={props.onOverride} />
          : <p className="muted">Select a variable to configure a hard-do intervention.</p>}
        <div className="planned-module-list">
          {PLANNED_CAUSAL_MODULES.map((module) => (
            <div className="module-card planned" aria-disabled="true" key={module.id} title="Planned module">
              <span>{module.label}</span>
              <span className="module-badge planned">planned</span>
            </div>
          ))}
        </div>
      </div>
      <div className="scenario-group">
        <strong>Conditioning / Selection</strong>
        {props.node
          ? <ConditioningEditor node={props.node} document={props.document} simulation={props.simulation} onSelectionCondition={props.onSelectionCondition} />
          : <p className="muted">Select a variable to condition or select observations.</p>}
      </div>
      <div className="value-list">
        <strong>Hard do quick controls</strong>
        {nodes.map((node) => {
          const value = props.simulation.values[node.id] ?? 0;
          const state = props.simulation.nodeStates[node.id];
          const overridden = Object.hasOwn(props.document.simulation.overrides, node.id);
          const conditioned = Object.hasOwn(props.document.simulation.selections ?? {}, node.id);
          const changed = props.simulation.changedNodes.includes(node.id);
          const binary = normalizeVariableModel(node.variable).valueType === "binary";
          const [sliderMin, sliderMax] = binary ? [0, 1] : conditioningSliderBounds(state, value);
          const sliderStep = binary ? 1 : conditioningSliderStep(sliderMin, sliderMax);
          return (
            <div className={`value-row ${changed ? "changed" : ""} ${conditioned ? "conditioned" : ""} ${overridden ? "intervened" : ""}`} key={node.id}>
              <button type="button" className="value-name" onClick={() => props.onSelectNode(node.id)}>{node.id}</button>
              <input
                type="range"
                aria-label={`hard do ${node.id}`}
                min={sliderMin}
                max={sliderMax}
                step={sliderStep}
                value={binary ? coerceBinary(value) : clamp(value, sliderMin, sliderMax)}
                onChange={(event) => props.onOverride(node.id, binary ? coerceBinary(Number(event.target.value)) : roundToStep(Number(event.target.value), sliderStep))}
              />
              <span className={overridden ? "value-number overridden" : "value-number"}>{formatValue(value)}</span>
              {overridden && <button type="button" className="mini-button" onClick={() => props.onOverride(node.id, null)}>release</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConnectionListPanel(props: {
  document: GraphDocument;
  simulation: SimulationResult;
  selectedEdgeId: string | null;
  onSelectEdge: (id: string) => void;
  onEnabled: (edge: GraphEdge, enabled: boolean) => void;
  onMechanism: (edge: GraphEdge, patch: Partial<EdgeMechanism>) => void;
}) {
  const directedEdges = props.document.graph.edges.filter((edge) => edge.kind === "directed");
  if (directedEdges.length === 0) return <p className="muted">Add directed connections to configure structural functions.</p>;
  return (
      <div className="mechanism-list">
        <div className="mechanism-header" aria-hidden="true">
          <span>on</span>
          <span>connection</span>
          <span>function</span>
          <span>value</span>
        </div>
        {directedEdges.map((edge) => {
          const mechanism = normalizeEdgeMechanism(props.document.simulation.edges[edge.id]);
          const contribution = props.simulation.contributions[edge.id] ?? 0;
          const selected = props.selectedEdgeId === edge.id;
          return (
            <div className={`mechanism-row ${selected ? "selected" : ""}`} key={edge.id}>
              <label className="edge-enabled" title="Enable this edge in simulation">
                <input
                  type="checkbox"
                  checked={mechanism.enabled}
                  onChange={(event) => {
                    props.onSelectEdge(edge.id);
                    props.onEnabled(edge, event.target.checked);
                  }}
                />
              </label>
              <button type="button" className="mechanism-name" onClick={() => props.onSelectEdge(edge.id)}>{edge.source} to {edge.target}</button>
              <FunctionPicker
                label={`function ${edge.source} to ${edge.target}`}
                value={mechanism.kind}
                onOpen={() => props.onSelectEdge(edge.id)}
                onChange={(kind) => {
                  props.onSelectEdge(edge.id);
                  props.onMechanism(edge, defaultEdgeMechanism(kind));
                }}
              />
              <span className={contribution >= 0 ? "mechanism-contribution positive" : "mechanism-contribution negative"}>{formatSignedValue(contribution)}</span>
            </div>
          );
        })}
      </div>
  );
}

function LiveValuesPanel(props: {
  graph: GraphModel;
  simulation: SimulationResult;
  overrides: Record<string, number>;
  selections: Record<string, SimulationSelectionCondition>;
  onSelectNode: (id: string) => void;
}) {
  const nodes = [...props.graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  if (nodes.length === 0) return <p className="muted">No variables yet.</p>;
  return (
    <table className="summary-table live-values-table">
      <tbody>
        {nodes.map((node) => {
          const hardDo = Object.hasOwn(props.overrides, node.id);
          const conditioned = Object.hasOwn(props.selections, node.id);
          return (
            <tr key={node.id}>
              <td><button type="button" className="inline-link-button" onClick={() => props.onSelectNode(node.id)}>{node.id}</button></td>
              <td>{formatValue(props.simulation.values[node.id] ?? 0)}</td>
              <td>{hardDo ? "hard do" : conditioned ? "conditioned" : ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
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
          value={hardDoValue}
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

function VariablePanel(props: {
  node?: GraphNode;
  simulation: SimulationResult;
  document: GraphDocument;
  onToggleRole: (id: string, role: keyof NodeRoleFlags) => void;
  onRename: () => void;
  onDelete: () => void;
  onMechanism: (id: string, patch: Partial<NodeMechanism>) => void;
}) {
  if (!props.node) return <p className="muted">Select a variable to edit roles, value, and simulation settings.</p>;
  const node = props.node;
  const mechanism = normalizeNodeMechanism(props.document.simulation.nodes[node.id]);
  const value = props.simulation.values[node.id] ?? 0;
  const parentIds = props.document.graph.edges.filter((edge) => edge.kind === "directed" && edge.target === node.id).map((edge) => edge.source);
  const isRoot = parentIds.length === 0;
  return (
    <div className="variable-panel">
      <div className="value-card">
        <strong>{node.id}</strong>
        <span>{formatValue(value)}</span>
      </div>
      <Checkbox label="exposure" checked={node.roles.exposure} onChange={() => props.onToggleRole(node.id, "exposure")} />
      <Checkbox label="outcome" checked={node.roles.outcome} onChange={() => props.onToggleRole(node.id, "outcome")} />
      <Checkbox label="adjusted" checked={node.roles.adjusted} onChange={() => props.onToggleRole(node.id, "adjusted")} />
      <Checkbox label="selected" checked={node.roles.selected} onChange={() => props.onToggleRole(node.id, "selected")} />
      <Checkbox label="unobserved" checked={node.roles.latent} onChange={() => props.onToggleRole(node.id, "latent")} />
      <div className="button-row">
        <button type="button" onClick={props.onRename}>rename</button>
        <button type="button" onClick={props.onDelete}>delete</button>
      </div>
      {isRoot && <DistributionEditor
        label="root distribution"
        distribution={mechanism.distribution}
        onChange={(distribution) => props.onMechanism(node.id, { distribution })}
      />}
      {!isRoot && <label className="field">
        <span>combiner</span>
        <select value={mechanism.combiner} onChange={(event) => props.onMechanism(node.id, { combiner: event.target.value as NodeCombinerKind })}>
          {NODE_COMBINERS.map((item) => <option value={item.kind} key={item.kind}>{item.label}</option>)}
        </select>
      </label>}
      <label className="field">
        <span>intercept</span>
        <input type="number" value={mechanism.intercept} step="0.1" onChange={(event) => props.onMechanism(node.id, { intercept: Number(event.target.value) })} />
      </label>
      {!isRoot && <DistributionEditor
        label="noise"
        distribution={mechanism.noise}
        onChange={(noise) => props.onMechanism(node.id, { noise })}
      />}
      {!isRoot && parentIds.length >= 2 && <InteractionEditor
        nodeId={node.id}
        parentIds={parentIds}
        interactions={mechanism.interactions}
        onChange={(interactions) => props.onMechanism(node.id, { interactions })}
      />}
      {!isRoot && <p className="muted">Parents: {parentIds.join(", ")}</p>}
    </div>
  );
}

function VariableModelPanel(props: {
  node?: GraphNode;
  simulation: SimulationResult;
  graph: GraphModel;
  showMeasurement?: boolean;
  onChange: (nodeId: string, variable: VariableModel) => void;
}) {
  if (!props.node) return <p className="muted">Select a variable.</p>;
  const node = props.node;
  const variable = normalizeVariableModel(node.variable);
  const value = props.simulation.values[node.id] ?? 0;
  const state = props.simulation.nodeStates[node.id];
  const parents = props.graph.edges.filter((edge) => edge.kind === "directed" && edge.target === node.id).map((edge) => edge.source);
  const update = (patch: Partial<VariableModel>) => props.onChange(node.id, normalizeVariableModel({ ...variable, ...patch }));
  const updateMeasurement = (patch: Partial<VariableMeasurementModel>) => update({ measurement: { ...variable.measurement, ...patch } });
  const updateSimulation = (patch: Partial<VariableSimulationView>) => update({ simulation: { ...variable.simulation, ...patch } });
  return (
    <div className="variable-model-panel">
      <div className="variable-model-block identity-block">
        <div className="value-card">
          <strong>{node.id}</strong>
          <span>{formatValue(value)}</span>
        </div>
        <label className="field">
          <span>description</span>
          <textarea value={variable.description} rows={3} onChange={(event) => update({ description: event.target.value })} />
        </label>
        <div className="two-field-grid">
          <label className="field">
            <span>type</span>
            <select value={variable.valueType} onChange={(event) => update({ valueType: event.target.value as VariableModel["valueType"] })}>
              {VARIABLE_TYPES.map(([id, label]) => <option value={id} key={id}>{label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>unit</span>
            <input value={variable.unit} onChange={(event) => update({ unit: event.target.value })} />
          </label>
        </div>
        <div className="model-facts">
          <span>parents {parents.join(", ") || "none"}</span>
        </div>
      </div>

      {props.showMeasurement !== false && <div className="variable-model-block">
        <strong>Measurement</strong>
        <label className="field">
          <span>model</span>
          <select value={variable.measurement.kind} onChange={(event) => updateMeasurement({ kind: event.target.value as VariableMeasurementModel["kind"] })}>
            {MEASUREMENT_MODELS.map(([id, label]) => <option value={id} key={id}>{label}</option>)}
          </select>
        </label>
        <div className="two-field-grid">
          <NumberField label="error sd" value={variable.measurement.errorSd} min={0} onChange={(errorSd) => updateMeasurement({ errorSd })} />
          <NumberField label="missing" value={variable.measurement.missingRate} min={0} max={1} step={0.05} onChange={(missingRate) => updateMeasurement({ missingRate })} />
        </div>
        <div className="two-field-grid">
          <NullableNumberField label="lower" value={variable.measurement.lowerLimit} onChange={(lowerLimit) => updateMeasurement({ lowerLimit })} />
          <NullableNumberField label="upper" value={variable.measurement.upperLimit} onChange={(upperLimit) => updateMeasurement({ upperLimit })} />
        </div>
      </div>}

      <div className="variable-model-block">
        <strong>Simulation View</strong>
        <label className="field">
          <span>mode</span>
          <select value={variable.simulation.mode} onChange={(event) => updateSimulation({ mode: event.target.value as VariableSimulationView["mode"] })}>
            {SIMULATION_VIEW_MODES.map(([id, label]) => <option value={id} key={id}>{label}</option>)}
          </select>
        </label>
        <NumberField label="sample size" value={variable.simulation.sampleSize} min={1} step={100} onChange={(sampleSize) => updateSimulation({ sampleSize })} />
        <div className="model-facts">
          <span>roles {roleSummary(node.roles)}</span>
          <span>mechanism {parents.length === 0 ? "root distribution" : "structural equation"}</span>
          <span>analytic {state?.analytic ? analyticDistributionLabel(state.analytic) : "unavailable"}</span>
          <span>analytic note {state?.analytic?.note ?? "empirical only"}</span>
          <span>empirical mean {state?.empirical.mean !== null && state?.empirical.mean !== undefined ? formatValue(state.empirical.mean) : "none"}</span>
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
      <p><strong>{props.edge.source}</strong> to <strong>{props.edge.target}</strong></p>
      <Checkbox label="enabled in simulation" checked={mechanism.enabled} onChange={(enabled) => props.onEnabled(props.edge, enabled)} />
      <div className="connection-function-summary" title={mechanismDescription(mechanism.kind)}>
        <FunctionGlyph kind={mechanism.kind} />
        <span>Function: {mechanismLabel(mechanism.kind)}</span>
      </div>
      <EdgeMechanismFields edge={props.edge} mechanism={mechanism} onMechanism={props.onMechanism} />
      {mechanism.kind === "linear" && (
        <>
          <label className="field">
            <span>coefficient</span>
            <input type="number" value={mechanism.coefficient} step="0.1" onChange={(event) => props.onCoefficient(props.edge, Number(event.target.value))} />
          </label>
          <input
            type="range"
            min="-5"
            max="5"
            step="0.1"
            value={clamp(mechanism.coefficient, -5, 5)}
            onChange={(event) => props.onCoefficient(props.edge, Number(event.target.value))}
          />
        </>
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
              <NumberField label="gamma" value={interaction.coefficient} onChange={(coefficient) => update(interaction.id, { coefficient })} />
            </>
          ) : (
            <>
              <ParentSelect value={interaction.source} parentIds={props.parentIds} onChange={(source) => update(interaction.id, { source })} />
              <ParentSelect value={interaction.gate} parentIds={props.parentIds} onChange={(gate) => update(interaction.id, { gate })} />
              <NumberField label="gamma" value={interaction.coefficient} onChange={(coefficient) => update(interaction.id, { coefficient })} />
              <NumberField label="threshold" value={interaction.threshold} onChange={(threshold) => update(interaction.id, { threshold })} />
              <NumberField label="steepness" value={interaction.steepness} onChange={(steepness) => update(interaction.id, { steepness })} />
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
      <NumberField label="threshold" value={props.mechanism.threshold} onChange={(threshold) => set({ threshold })} />
      <NumberField label="low" value={props.mechanism.low} onChange={(low) => set({ low })} />
      <NumberField label="high" value={props.mechanism.high} onChange={(high) => set({ high })} />
    </>;
  }
  if (props.mechanism.kind === "smooth_threshold") {
    return <>
      <NumberField label="scale" value={props.mechanism.scale} onChange={(scale) => set({ scale })} />
      <NumberField label="threshold" value={props.mechanism.threshold} onChange={(threshold) => set({ threshold })} />
      <NumberField label="steepness" value={props.mechanism.steepness} onChange={(steepness) => set({ steepness })} />
    </>;
  }
  if (props.mechanism.kind === "saturating") {
    return <>
      <NumberField label="scale" value={props.mechanism.scale} onChange={(scale) => set({ scale })} />
      <NumberField label="midpoint" value={props.mechanism.midpoint} onChange={(midpoint) => set({ midpoint })} />
      <NumberField label="steepness" value={props.mechanism.steepness} onChange={(steepness) => set({ steepness })} />
    </>;
  }
  if (props.mechanism.kind === "quadratic") {
    return <>
      <NumberField label="linear term" value={props.mechanism.beta1} onChange={(beta1) => set({ beta1, coefficient: beta1 })} />
      <NumberField label="quadratic term" value={props.mechanism.beta2} onChange={(beta2) => set({ beta2 })} />
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
      <NumberField label="baseline" value={props.mechanism.baseline} onChange={(baseline) => set({ baseline })} />
      <NumberField label="max effect" value={props.mechanism.maxEffect} onChange={(maxEffect) => set({ maxEffect })} />
      <NumberField label="EC50" value={props.mechanism.ec50} min={0.001} onChange={(ec50) => set({ ec50 })} />
      <NumberField label="Hill slope" value={props.mechanism.exponent} min={0.001} onChange={(exponent) => set({ exponent })} />
    </>;
  }
  if (props.mechanism.kind === "log_linear") {
    return <>
      <NumberField label="coefficient" value={props.mechanism.coefficient} onChange={(coefficient) => set({ coefficient })} />
      <NumberField label="offset" value={props.mechanism.offset} onChange={(offset) => set({ offset })} />
      <NumberField label="baseline" value={props.mechanism.baseline} onChange={(baseline) => set({ baseline })} />
    </>;
  }
  if (props.mechanism.kind === "power_law") {
    return <>
      <NumberField label="coefficient" value={props.mechanism.coefficient} onChange={(coefficient) => set({ coefficient })} />
      <NumberField label="input scale" value={props.mechanism.scale} min={0.001} onChange={(scale) => set({ scale })} />
      <NumberField label="offset" value={props.mechanism.offset} onChange={(offset) => set({ offset })} />
      <NumberField label="exponent" value={props.mechanism.exponent} min={0.001} onChange={(exponent) => set({ exponent })} />
      <NumberField label="baseline" value={props.mechanism.baseline} onChange={(baseline) => set({ baseline })} />
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
      {distribution.kind === "constant" && <NumberField label="value" value={distribution.value} onChange={(value) => props.onChange({ ...distribution, value })} />}
      {distribution.kind === "normal" && <>
        <NumberField label="mean" value={distribution.mean} onChange={(mean) => props.onChange({ ...distribution, mean })} />
        <NumberField label="sd" value={distribution.sd} min={0} onChange={(sd) => props.onChange({ ...distribution, sd })} />
      </>}
      {distribution.kind === "lognormal" && <>
        <NumberField label="log mean" value={distribution.meanLog} onChange={(meanLog) => props.onChange({ ...distribution, meanLog })} />
        <NumberField label="log sd" value={distribution.sdLog} min={0.001} onChange={(sdLog) => props.onChange({ ...distribution, sdLog })} />
      </>}
      {distribution.kind === "uniform" && <>
        <NumberField label="min" value={distribution.min} onChange={(min) => props.onChange({ ...distribution, min })} />
        <NumberField label="max" value={distribution.max} onChange={(max) => props.onChange({ ...distribution, max })} />
      </>}
      {distribution.kind === "bernoulli" && <NumberField label="p" value={distribution.p} min={0} max={1} step={0.05} onChange={(p) => props.onChange({ ...distribution, p })} />}
      {distribution.kind === "poisson" && <NumberField label="lambda" value={distribution.lambda} min={0.001} onChange={(lambda) => props.onChange({ ...distribution, lambda })} />}
      {distribution.kind === "beta" && <>
        <NumberField label="alpha" value={distribution.alpha} min={0.001} onChange={(alpha) => props.onChange({ ...distribution, alpha })} />
        <NumberField label="beta" value={distribution.beta} min={0.001} onChange={(beta) => props.onChange({ ...distribution, beta })} />
      </>}
      {distribution.kind === "laplace" && <>
        <NumberField label="mean" value={distribution.mean} onChange={(mean) => props.onChange({ ...distribution, mean })} />
        <NumberField label="scale" value={distribution.scale} min={0.001} onChange={(scale) => props.onChange({ ...distribution, scale })} />
      </>}
      {distribution.kind === "student_t" && <>
        <NumberField label="mean" value={distribution.mean} onChange={(mean) => props.onChange({ ...distribution, mean })} />
        <NumberField label="scale" value={distribution.scale} min={0.001} onChange={(scale) => props.onChange({ ...distribution, scale })} />
        <NumberField label="df" value={distribution.df} min={0.001} onChange={(df) => props.onChange({ ...distribution, df })} />
      </>}
      {distribution.kind === "gamma" && <>
        <NumberField label="shape" value={distribution.shape} min={0.001} onChange={(shape) => props.onChange({ ...distribution, shape })} />
        <NumberField label="scale" value={distribution.scale} min={0.001} onChange={(scale) => props.onChange({ ...distribution, scale })} />
      </>}
      {distribution.kind === "exponential" && <NumberField label="rate" value={distribution.rate} min={0.001} onChange={(rate) => props.onChange({ ...distribution, rate })} />}
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

function RadioGroup({ value, options, onChange }: { value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <div>{options.map(([id, label]) => <label className="check-row" key={id}><input type="radio" checked={value === id} onChange={() => onChange(id)} /><span>{label}</span></label>)}</div>;
}

function NumberField({ label, value, min, max, step = 0.1, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return <label className="field"><span>{label}</span><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function NullableNumberField({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value.trim() === "" ? null : Number(event.target.value))}
      />
    </label>
  );
}

function List({ values, empty }: { values: string[]; empty: string }) {
  if (values.length === 0) return empty ? <p className="muted">{empty}</p> : null;
  return <ul className="plain-list">{values.map((value) => <li key={value}>{value}</li>)}</ul>;
}

function roleSummary(roles: NodeRoleFlags): string {
  const labels = [
    roles.exposure ? "exposure" : "",
    roles.outcome ? "outcome" : "",
    roles.adjusted ? "adjusted" : "",
    roles.selected ? "selected" : "",
    roles.latent ? "latent" : ""
  ].filter(Boolean);
  return labels.join(", ") || "none";
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

function formatValue(value: number): string {
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatSignedValue(value: number): string {
  const formatted = formatValue(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${formatted}`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}

function inferenceModeLabel(mode: SimulationInferenceMode | "forward"): string {
  if (mode === "importance") return "importance sampling";
  if (mode === "rejection") return "rejection sampling";
  return mode;
}

function analyticSummaryLabel(note: string): string {
  return note.replace(/^analytic\s+/i, "");
}

function formatWeightedCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Math.abs(value - Math.round(value)) < 1e-6 ? String(Math.round(value)) : formatValue(value);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

function coerceBinary(value: number): number {
  return value >= 0.5 ? 1 : 0;
}

function simulationBlocked(result: SimulationResult): boolean {
  return result.diagnostics.some((message) => message.startsWith("Simulation disabled") || message.startsWith("Simulation is only enabled"));
}
