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
  Share2,
  Sigma,
  Spline,
  Waypoints,
  Table,
  FileUp,
  GraduationCap,
  Palette,
  Blend,
  BookOpen,
  Trash2,
  Undo2,
  Upload,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EXAMPLES,
  addEdge,
  addNode,
  setCopulaCorrelation,
  setCopulaBlock,
  orphanDataColumns,
  plasmodeSources,
  setPlasmodeJointMode,
  fitDgpFromData,
  fittableDgp,
  nodeProvenance,
  nodeGenerates,
  residualDiagnostics,
  edgeProvenance,
  pinKeyElement,
  pinKeys,
  setNodeDataMode,
  authorNumber,
  unlearnNumber,
  pinNumber,
  unpinKey,
  withCoupling,
  withoutCoupling,
  simpleEdge,
  directedParents,
  analyzeGraph,
  classifyConditioned,
  createNewNodeId,
  createNode,
  defaultNodeDistribution,
  deleteEdge,
  deleteNode,
  edgeId,
  emptyDocument,
  exampleDenouement,
  exampleDocument,
  findEdge,
  findNode,
  normalizeVariableModel,
  parseModel,
  reconcileSimulationSpec,
  renameNode,
  normalizeEdgeMechanism,
  normalizeNodeMechanism,
  runSimulation,
  serializeModel,
  setNodeRole,
  updateNode,
  upsertEdge,
  withGraph
} from "@nudagitty/core";
import type {
  AnalysisOperation,
  AnalysisReport,
  EdgeMechanism,
  EffectKind,
  CovariateBasis,
  GraphDocument,
  GraphEdge,
  GraphModel,
  NodeMechanism,
  NodeRoleFlags,
  Point,
  SimulationResult,
  SimulationSelectionCondition,
  VariableModel,
  ViewMode
} from "@nudagitty/core";
import {
  coerceBinary
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
import { chartFrame, niceTicks, paddedDomain } from "./charts/chartFrame";
import { startEngagementMilestones, trackAnalyticsEvent, trackDenouementViewed, trackEditCommitted, trackInfoOverlayOpened, trackOperationSet } from "./analytics";
import { applyOperation, deriveOperation } from "./shared/operations";
import { DataTablePanel } from "./data/DataTablePanel";
import { PlasmodeSourcePanel } from "./data/PlasmodeSourcePanel";
import { ImportDataModal } from "./data/ImportDataModal";
import { TutorialController } from "./tutorial/TutorialController";
import { LALONDE_TUTORIAL, LALONDE_CONFOUNDERS, LALONDE_TREATMENT, LALONDE_OUTCOME } from "./tutorial/lalondeTutorial";
import { displayNodeName } from "./outputs/estimand";
import { EstimandFormula, NodeName } from "./outputs/EstimandFormula";
import { NodeNamesProvider } from "./shared/NodeNames";
import { WhatIfStrategySurvivalCurve } from "./outputs/modules";
import type { BasicOutputPunchline, BasicOutputPunchlineMetric, ComputedCompletedOutput } from "./outputs/modules";
import { DisambiguationMap } from "./outputs/DisambiguationMap";
import { DgpInspector } from "./outputs/DgpInspector";
import { CopulaBlockEditor } from "./copula/CopulaBlockEditor";
import { OverlapInspector } from "./outputs/OverlapInspector";
import type { OutputContext } from "./outputs/types";
import { DenouementPanel } from "./outputs/DenouementPanel";
import { ExampleExplanation } from "./examples/ExampleExplanation";
import { ExampleMenu } from "./examples/ExampleMenu";
import { PaperNetworkView } from "./papers/PaperNetworkView";
import { K562_NETWORK_STUDY } from "./papers/k562Study";
import type { WorkbenchMode } from "./shared/workbench";
import {
  SHARE_EXAMPLE_HASH_KEY,
  STORAGE_KEY,
  createWorkbenchSnapshot,
  missingDatasets,
  parseWorkbenchSnapshotText,
  shareDropsImportedData,
  snapshotFilename
} from "./shared/appState";
import type { BibliographyTopic, Selection, ToolMode } from "./shared/appState";
import { reconcileScatterPair } from "./shared/pairs";
import { useWorkbenchStore } from "./store/workbenchStore";
import type {
  ShareStatus
} from "./app/types";
import {
  CUSTOM_DENOUEMENT,
  EMPIRICAL_DRAW_DEFAULT,
  EMPIRICAL_DRAW_MIN,
  MAX_SHARE_URL_LENGTH
} from "./app/constants";
import {
  arrowHeadGeometry,
  edgeGeometry,
  edgeMechanismDisplayStrength,
  edgeVisibleStrokePath,
  flowEdgeClassName,
  flowNodePositionToGraphPoint,
  graphPointToFlowPoint,
  midpoint,
  nodeBoundaryPoint,
  unitVector
} from "./canvas/edgeGeometry";
import { useDerivedGraphs } from "./hooks/useDerivedGraphs";
import { useCanvasOverlays } from "./hooks/useCanvasOverlays";
import { useOutputComputations } from "./hooks/useOutputComputations";
import { useAppTelemetry } from "./hooks/useAppTelemetry";
import { useComputationWorkers } from "./hooks/useComputationWorkers";
import { useUnifiedAdjustment } from "./hooks/useUnifiedAdjustment";
import { useContinuousEffect } from "./hooks/useContinuousEffect";
import { useBasicOutputs } from "./hooks/useBasicOutputs";
import { useOverlapDiagnostic } from "./hooks/useOverlapDiagnostic";
import {
  adjustmentCutStep,
  conditioningSliderBounds,
  conditioningSliderStep,
  defaultQuantileCuts,
  positivityRows,
  roundToStep,
  sanitizeCutpoints
} from "./compute/conditioning";
import {
  compactShareUrlForDocument,
  downloadText,
  exportBitmap,
  exportSvg,
  fullShareUrlForDocument,
  hashMatchesPaperNetwork,
  shareStatusLabel,
  tikzDocument
} from "./share/exportDocument";
import {
  buildSimulationDerivedCache
} from "./compute/scatterStats";
import {
  inferValueTypeFromMechanism
} from "./compute/distributionPlot";
import {
  nodeDisplayName
} from "./compute/format";
import {
  binaryAdjustmentExpander,
  binaryAdjustmentStrata,
  binaryContinuousAdjustmentStrata,
  binaryContinuousGap,
  binnedAdjustmentExpander,
  binnedAdjustmentNode,
  standardizedBinaryContinuousGap
} from "./compute/stratification";
import {
  shouldShowAdjustedOutputColumn
} from "./compute/adjustmentOutput";
import {
  basicDemoRecommendedAdjustmentId,
  nodeAdjusted,
  resultPendingActive
} from "./compute/relationSummary";
import { Checkbox, IconButton, ModuleFrame, RadioGroup, Section } from "./controls";
import { FlowGraphCanvas } from "./canvas/FlowGraphCanvas";
import type { JointSourceCloud, CopulaCoupling } from "./canvas/types";
import { SelectionEditor } from "./editors/VariableEditor";
import { useMediaQuery } from "./app/useMediaQuery";
import { BibliographyPanel, EffectPanel, ImplicationPanel, SummaryPanel } from "./panels/analysis";
import { AnalysisSampleBanner, DesignModulePanel, RoadmapTodoPanel, ScenarioPanel, SimulationDiagnosticsPanel, clampDrawCount } from "./panels/diagnostics";
import { ScatterplotPanel } from "./panels/ScatterplotPanel";
import { ChecksPanel } from "./panels/ChecksPanel";
import { AdjustedOutputPanel } from "./panels/output";
import { BasicExampleTabs, DemoResultPanel } from "./panels/demo";




// Order-independent id for a coupling arc, so canvas selection matches regardless of vine direction.
function couplingId(blockId: string, a: string, b: string): string {
  return `${blockId}:${[a, b].sort().join("~")}`;
}

export function App() {
  const document = useWorkbenchStore((state) => state.document);
  const history = useWorkbenchStore((state) => state.history);
  const future = useWorkbenchStore((state) => state.future);
  const selection = useWorkbenchStore((state) => state.selection);
  const tool = useWorkbenchStore((state) => state.tool);
  const edgeSource = useWorkbenchStore((state) => state.edgeSource);
  const viewMode = useWorkbenchStore((state) => state.viewMode);
  const effectKind = useWorkbenchStore((state) => state.effectKind);
  const showProvenance = useWorkbenchStore((state) => state.showProvenance);
  const toggleProvenance = useWorkbenchStore((state) => state.toggleProvenance);
  const changedPins = useWorkbenchStore((state) => state.changedPins);
  const bibliographyTopic = useWorkbenchStore((state) => state.bibliographyTopic);
  const showCausal = useWorkbenchStore((state) => state.showCausal);
  const showBiasing = useWorkbenchStore((state) => state.showBiasing);
  const showAncestors = useWorkbenchStore((state) => state.showAncestors);
  const showNoiseNodes = useWorkbenchStore((state) => state.showNoiseNodes);
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
  const focusResidualPanel = useWorkbenchStore((state) => state.focusResidualPanel);
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
  const [showJointLab, setShowJointLab] = useState(false);
  const [jointLabTab, setJointLabTab] = useState<"copula" | "plasmode">("copula");
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const [couplingHint, setCouplingHint] = useState<string | null>(null);
  // When you wire an edge INTO a data variable, its dependence lands "not learned" — offer to fit it.
  const [wirePrompt, setWirePrompt] = useState<string | null>(null);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showOverlap, setShowOverlap] = useState(false);
  const [showData, setShowData] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const {
    visibleGraph,
    analysisSignature,
    analysisGraph,
    setAnalysisResultSignature,
    simulationGraph,
    simulationSignature,
    setSimulationResultSignature,
    outputSimulation,
    analysisPending,
    simulationPending,
    resultsPending,
    pairwisePending,
    computationDocument
  } = useDerivedGraphs(document, viewMode);
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
  const { highlightedEdges, ancestorIds, modulations } = useCanvasOverlays(analysisGraph, analysis, showCausal, showBiasing, showAncestors, document);
  const {
    completedOutput,
    structuralAux,
    auxEstimandTrustworthy,
    observedSurvival,
    activeOutputPair,
    defaultOutputPair,
    binaryAdjustmentOutput,
    binaryContinuousAdjustmentOutput,
    completedOutputActive,
    frameOperation
  } = useOutputComputations(outputContext, simulationDerived, activeExample, computationDocument, scatterPair, document);

  useEffect(() => startEngagementMilestones(), []);
  const adjustedFrameTitle = completedOutputActive ? "Effect estimate"
    : frameOperation === "adjust" ? "Effect estimate"
      : frameOperation === "condition" ? "Conditioned (stratified) output"
        : frameOperation === "select" ? "Selected-sample output"
          : "Structural diagnosis";
  const adjustedFrameDetail = completedOutputActive ? "What the methods estimate after adjusting for the confounders"
    : frameOperation === "adjust" ? "Stratify on every level of the adjustment set, then standardize to the population"
      : frameOperation === "condition" ? "Each stratum shown separately — not combined or standardized"
        : frameOperation === "select" ? "Restricted to the selected sub-population; the complement is unobserved"
          : "Derived from the DAG structure — set an operation on a variable to refine the estimand";
  const { demoBinaryAdjustmentOutput, basicRelationSummary, basicDemoContext } = useBasicOutputs(outputContext, simulationDerived, defaultOutputPair, activeExample, completedOutput, isBasicMode, document, simulation);
  const showAdjustedOutputColumn = shouldShowAdjustedOutputColumn(computationDocument, simulation, activeExample?.outputModule ?? null, activeOutputPair);
  // Keep the raw scatter visible for continuous exposures (the cloud IS the teaching view, e.g. the
  // collider examples) even when the adjusted column also shows its estimand/structure; hide it only
  // for binary adjustment, where it would just duplicate the adjusted estimate.
  const exposureNodeForLayout = computationDocument.graph.nodes.find((node) => node.id === activeOutputPair.x);
  const exposureBinaryForLayout = exposureNodeForLayout ? normalizeVariableModel(exposureNodeForLayout.variable).valueType === "binary" : true;
  const showPairwiseScatter = !showAdjustedOutputColumn || !exposureBinaryForLayout;

  const { unifiedAdjustment, demoUnifiedAdjustment } = useUnifiedAdjustment(activeExample, computationDocument, covariateBasis, simulationDerived, activeOutputPair, defaultOutputPair);
  const { continuousEffect, categoricalEffect } = useContinuousEffect(activeExample, document.graph, document.simulation, simulation, activeOutputPair);
  // Copula couplings (Tree-1 direct pairs) surfaced as bidirected arcs on the canvas.
  const copulaCouplings = useMemo<CopulaCoupling[]>(() => {
    const out: CopulaCoupling[] = [];
    for (const block of document.simulation.copulaBlocks ?? []) {
      const t1 = block.edges[0] ?? [];
      for (let e = 0; e < t1.length; e += 1) {
        const c0 = t1[e]?.components[0];
        if (!c0 || c0.family === "independence") continue;
        const moderated = c0.tau.by !== null;
        const tau = moderated ? null : c0.tau.constant;
        if (tau !== null && Math.abs(tau) < 0.03) continue;
        const aId = block.nodes[block.order[e]!]!, bId = block.nodes[block.order[e + 1]!]!;
        out.push({ id: couplingId(block.id, aId, bId), aId, bId, short: moderated ? "τ~" : (tau! >= 0 ? "+" : "") + tau!.toFixed(2), label: `copula ${c0.family}${moderated ? " (moderated)" : ` · τ ${tau!.toFixed(2)}`}` });
      }
    }
    return out;
  }, [document.simulation.copulaBlocks]);

  // The document's "joint sources" as clouds — one unified visual for however the covariates' shared
  // dependence is generated. Two mechanisms today: a COPULA block (parametric — the latent projection
  // of the coupling; coupled nodes are children, a moderated edge's conditioner feeds INTO the cloud)
  // and a PLASMODE row-source (empirical — a latent node fanning table_lookup edges to the covariates).
  // Both render as the same cloud; plasmode's real source node + edges are hidden by the canvas.
  const jointSources = useMemo<JointSourceCloud[]>(() => {
    const clouds: JointSourceCloud[] = [];
    for (const block of document.simulation.copulaBlocks ?? []) {
      const coupled = new Set<string>();
      const moderators = new Set<string>();
      for (let t = 0; t < block.edges.length; t += 1) {
        const tree = block.edges[t] ?? [];
        for (let e = 0; e < tree.length; e += 1) {
          const c0 = tree[e]?.components[0];
          if (!c0 || c0.family === "independence") continue;
          const a = block.nodes[block.order[e]!], b = block.nodes[block.order[e + t + 1]!];
          if (a) coupled.add(a);
          if (b) coupled.add(b);
          for (let m = e + 1; m <= e + t; m += 1) { const mid = block.nodes[block.order[m]!]; if (mid) moderators.add(mid); }
          if (c0.tau.by !== null) { const mid = block.nodes[block.order[c0.tau.by]!]; if (mid) moderators.add(mid); }
        }
      }
      if (coupled.size > 0) clouds.push({ id: block.id, kind: "copula", nodeIds: [...coupled], moderatorIds: [...moderators].filter((m) => !coupled.has(m)), label: "shared hidden causes", sublabel: "copula" });
    }
    for (const source of plasmodeSources(document)) {
      // A cloud represents a SHARED joint — needs ≥2 coupled covariates. A single-target source (e.g. the
      // independent variant's per-covariate `Src_*` nodes) has no joint to show, so it stays a plain node.
      if (source.covariates.length < 2) continue;
      clouds.push({ id: `plasmode:${source.sourceId}`, kind: "plasmode", nodeIds: source.covariates.map((c) => c.nodeId), moderatorIds: [], label: "shared hidden causes", sublabel: "real rows", sourceId: source.sourceId });
    }
    return clouds;
  }, [document]);
  const hasCopulaSource = jointSources.some((cloud) => cloud.kind === "copula");
  // Any plasmode wiring — true even when the joint is BROKEN (independent per-covariate sources, no cloud),
  // so the Plasmode tab stays reachable to restore the shared joint.
  const hasPlasmodeSource = useMemo(() => plasmodeSources(document).length > 0, [document]);
  // Open the Joint / DGM editor. A clicked cloud routes to its mechanism tab; otherwise default to the
  // mechanism actually present (so a plasmode-only model doesn't land on an empty Copula tab).
  const openJointLab = useCallback((mechanism?: "copula" | "plasmode") => {
    setJointLabTab(mechanism ?? (hasCopulaSource ? "copula" : hasPlasmodeSource ? "plasmode" : "copula"));
    setShowJointLab(true);
  }, [hasCopulaSource, hasPlasmodeSource]);

  // Tutorial per-step helper: the "wire the confounders" one-click (16 edges by hand is the tour's
  // roughest step). Adds each confounder → treatment and → outcome, then commits once.
  const runTutorialAction = useCallback((stepId: string) => {
    if (stepId !== "wire") return;
    let graph = document.graph;
    const has = (id: string) => graph.nodes.some((node) => node.id === id);
    for (const confounder of LALONDE_CONFOUNDERS) {
      if (!has(confounder)) continue;
      for (const target of [LALONDE_TREATMENT, LALONDE_OUTCOME]) {
        if (has(target)) graph = upsertEdge(graph, { id: edgeId(confounder, target, "directed"), source: confounder, target, kind: "directed" });
      }
    }
    replaceGraph(graph);
  }, [document.graph, replaceGraph]);

  // Root covariates (confounders) — the nodes a copula block may couple: roots that aren't the
  // exposure/outcome/latent. Mirrors CopulaBlockEditor.rootCovariates so canvas + Joint Lab agree.
  const rootCovariateIds = useMemo(() => document.graph.nodes
    .filter((node) => directedParents(document.graph, node.id).length === 0 && !node.roles.exposure && !node.roles.outcome && !node.roles.latent)
    .map((node) => node.id), [document.graph]);

  const createOrSelectCoupling = useCallback((target: string) => {
    if (!rootCovariateIds.includes(target)) {
      setCouplingHint("Couplings connect two root covariates (confounders). Pick one of those.");
      setEdgeSource(null);
      return;
    }
    if (!edgeSource) { setEdgeSource(target); setCouplingHint(null); return; }
    if (edgeSource === target) { setEdgeSource(null); return; }
    const block = document.simulation.copulaBlocks?.[0] ?? null;
    const result = withCoupling(block, rootCovariateIds, edgeSource, target, simpleEdge("gaussian", 0.4));
    setEdgeSource(null);
    if (!result.ok) { setCouplingHint(result.reason); return; }
    setCouplingHint(null);
    trackAnalyticsEvent("graph_action", { action: "add_coupling" });
    commit(setCopulaBlock(document, result.block));
    setSelection({ kind: "coupling", id: couplingId(result.block.id, edgeSource, target) });
  }, [commit, document, edgeSource, rootCovariateIds, setEdgeSource, setSelection]);

  const selectCoupling = useCallback((id: string) => setSelection({ kind: "coupling", id }), [setSelection]);
  const deleteCouplingById = useCallback((id: string) => {
    const block = document.simulation.copulaBlocks?.[0];
    const coupling = copulaCouplings.find((c) => c.id === id);
    if (!block || !coupling) return;
    commit(setCopulaBlock(document, withoutCoupling(block, rootCovariateIds, coupling.aId, coupling.bId)));
    setSelection(null);
  }, [commit, copulaCouplings, document, rootCovariateIds, setSelection]);
  // Multi-select group actions (from the canvas action bar). Each folds into ONE commit.
  const wireManyToTarget = useCallback((sourceIds: string[], targetId: string) => {
    let graph = document.graph;
    for (const source of sourceIds) {
      if (source === targetId || !graph.nodes.some((node) => node.id === source)) continue;
      graph = upsertEdge(graph, { id: edgeId(source, targetId, "directed"), source, target: targetId, kind: "directed" });
    }
    replaceGraph(graph);
  }, [document.graph, replaceGraph]);
  const adjustMany = useCallback((ids: string[]) => {
    let graph = document.graph;
    for (const id of ids) {
      const node = graph.nodes.find((candidate) => candidate.id === id);
      if (node && !node.roles.adjusted) graph = setNodeRole(graph, id, "adjusted", true);
    }
    replaceGraph(graph);
  }, [document.graph, replaceGraph]);
  const deleteMany = useCallback((ids: string[]) => {
    let graph = document.graph;
    for (const id of ids) graph = deleteNode(graph, id);
    replaceGraph(graph);
  }, [document.graph, replaceGraph]);
  const coupleMany = useCallback((ids: string[]) => {
    const couplable = ids.filter((id) => rootCovariateIds.includes(id));
    if (couplable.length < 2) { setCouplingHint("Grouping into a shared cloud needs ≥2 root covariates (not the exposure/outcome)."); return; }
    let block = document.simulation.copulaBlocks?.[0] ?? null;
    for (let i = 0; i < couplable.length - 1; i += 1) {
      const result = withCoupling(block, rootCovariateIds, couplable[i]!, couplable[i + 1]!, simpleEdge("gaussian", 0.4));
      if (result.ok) block = result.block;
    }
    if (block) commit(setCopulaBlock(document, block));
  }, [commit, document, rootCovariateIds, setCouplingHint]);

  // Provenance overlay: each node/edge's origin (authored / read-from-data / pinned-by-fit) + the
  // elements whose pinned numbers just moved (for the change flash).
  const provenance = useMemo(() => {
    const nodes = new Map<string, ReturnType<typeof nodeProvenance>>();
    const edges = new Map<string, ReturnType<typeof edgeProvenance>>();
    for (const node of document.graph.nodes) nodes.set(node.id, nodeProvenance(document, node.id));
    for (const edge of document.graph.edges) edges.set(edge.id, edgeProvenance(document, edge.id));
    return { nodes, edges };
  }, [document]);
  const changedElements = useMemo(() => {
    const nodeIds = new Set<string>(); const edgeIds = new Set<string>();
    for (const key of changedPins) { const el = pinKeyElement(key); if (el?.kind === "node") nodeIds.add(el.id); else if (el?.kind === "edge") edgeIds.add(el.id); }
    return { nodeIds, edgeIds };
  }, [changedPins]);
  // The residual IS the estimated disturbance ε, so its check verdict lives on the always-shown ε satellites.
  // residualDiagnostics caches by fit signature, so recomputing every commit is cheap (only changed fits re-run).
  const [diagnosticsRunNonce, setDiagnosticsRunNonce] = useState(0);
  const residualDiagnosticsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof residualDiagnostics>>();
    for (const node of document.graph.nodes) {
      const d = residualDiagnostics(document, node.id, undefined, undefined, diagnosticsRunNonce);
      if (d.available) map.set(node.id, d);
    }
    return map;
  }, [document, diagnosticsRunNonce]);
  const residualVerdicts = useMemo(() => {
    const map = new Map<string, "ok" | "weak" | "violated">();
    for (const [id, d] of residualDiagnosticsMap) map.set(id, d.severity);
    return map;
  }, [residualDiagnosticsMap]);
  const diagnosticsEntries = useMemo(() => {
    const labelOf = new Map(document.graph.nodes.map((n) => [n.id, n.label]));
    return [...residualDiagnosticsMap.entries()].map(([id, d]) => ({ id, label: labelOf.get(id) ?? id, d }));
  }, [residualDiagnosticsMap, document.graph.nodes]);
  const dataOrphans = useMemo(() => orphanDataColumns(document), [document]);
  const { overlapDiagnostic, positivity } = useOverlapDiagnostic(computationDocument);
  const basicRecommendedAdjustmentId = basicDemoRecommendedAdjustmentId(activeExample?.outputModule ?? null, document.graph);

  useAppTelemetry(activeExample, analysis, completedOutput, document, selection, simulation, activeOutputPair);

  useComputationWorkers({
    analysisSignature,
    analysisGraph,
    setAnalysis,
    setAnalysisResultSignature,
    simulationSignature,
    simulationGraph,
    outputSimulation,
    setSimulation,
    setSimulationResultSignature
  });

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
        setEdgeSource(null);
        setCouplingHint(null);
      } else if (event.key === "Delete" || event.key.toLowerCase() === "d") {
        event.preventDefault();
        deleteSelection();
      } else if (selection?.kind === "node") {
        const roleMap: Record<string, keyof NodeRoleFlags> = { e: "exposure", o: "outcome", a: "adjusted", s: "selected", u: "latent", i: "instrument" };
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
    if (selection.kind === "coupling") {
      deleteCouplingById(selection.id);
      return;
    }
    deleteEdgeById(selection.id);
  }, [deleteCouplingById, deleteEdgeById, deleteNodeById, selection]);

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

  // Clicking a disturbance (ε) satellite selects the node AND scrolls its residual-test panel into view.
  const selectNoiseNode = useCallback((id: string) => {
    setSelection({ kind: "node", id });
    focusResidualPanel(id);
  }, [focusResidualPanel]);

  const selectEdge = useCallback((id: string) => {
    setSelection({ kind: "edge", id });
  }, []);

  const createOrSelectEdge = useCallback((target: string) => {
    if (!edgeSource) {
      setEdgeSource(target);
      setWirePrompt(null);
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
    // Wiring into a still-reading data variable adds a NOT-LEARNED dependence — pause and offer to fit it.
    setWirePrompt(nodeProvenance(document, target) === "data" && !nodeGenerates(document, target) ? target : null);
  }, [document, edgeSource, replaceGraph, selectEdge]);

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
    const url = await compactShareUrlForDocument(document, activeExampleId);
    trackAnalyticsEvent("share_clicked", { kind: "compact" });
    if (url.length > MAX_SHARE_URL_LENGTH) {
      setCompactShareStatus("too-large");
      return;
    }
    try {
      await copyTextToClipboard(url);
      window.history.replaceState(null, "", new URL(url).hash);
      // A compact link cannot carry an imported table (it would blow the URL cap), so say so rather than
      // handing over a model whose data columns silently resolve to nothing.
      setCompactShareStatus(shareDropsImportedData(document) ? "copied-no-data" : "copied");
    } catch {
      setCompactShareStatus("failed");
    }
  }, [activeExampleId, document]);

  const copyFullShareLink = useCallback(async () => {
    const url = await fullShareUrlForDocument(document, activeExampleId);
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
    let nextDoc: GraphDocument = {
      ...withGraph(document, graph),
      simulation: {
        ...document.simulation,
        nodes: {
          ...document.simulation.nodes,
          [nodeId]: nextMechanism
        },
        overrides
      }
    };
    // Editing a number AUTHORS just that number (so the edit sticks and it stops being fitted/not-learned).
    if ("intercept" in patch) nextDoc = authorNumber(nextDoc, pinKeys.intercept(nodeId));
    if ("noise" in patch) nextDoc = authorNumber(nextDoc, pinKeys.noise(nodeId));
    commit(nextDoc);
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
    // Editing the coefficient/form AUTHORS the edge (so it sticks and leaves not-learned/fitted);
    // a pure enable-toggle leaves its provenance alone.
    const onlyEnabled = Object.keys(patch).length === 1 && "enabled" in patch;
    let nextDoc: GraphDocument = {
      ...document,
      simulation: {
        ...document.simulation,
        edges: {
          ...document.simulation.edges,
          [edge.id]: normalizeEdgeMechanism({ ...current, ...patch })
        }
      }
    };
    if (!onlyEnabled) nextDoc = authorNumber(nextDoc, pinKeys.edge(edge.id));
    commit(nextDoc);
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

  const setSeed = useCallback((seed: number) => {
    if (!Number.isFinite(seed) || seed === document.simulation.seed) return;
    commit({ ...document, simulation: { ...document.simulation, seed: Math.max(0, Math.trunc(seed)) } });
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

  const importDataDocument = useCallback((nextDocument: GraphDocument) => {
    trackAnalyticsEvent("graph_action", { action: "import_csv" });
    closePaperNetwork();
    commit(nextDocument);
    setActiveExampleId(null);
    setSelection(null);
    setShowImport(false);
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
      <aside className={`side-panel module-pane editor-column${diagnosticsEntries.length > 0 ? " with-diagnostics" : ""}`} aria-label="Editor">
        {diagnosticsEntries.length > 0 && (
          <ChecksPanel entries={diagnosticsEntries} onRun={() => setDiagnosticsRunNonce((n) => n + 1)} onOpen={selectNoiseNode} />
        )}
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
            onSetDataMode={(id, mode) => commit(setNodeDataMode(document, id, mode))}
            onPinNumber={(key) => commit(pinNumber(document, key))}
            onUnpinKey={(key) => commit(unpinKey(document, key))}
            onUnlearnNumber={(key) => commit(unlearnNumber(document, key))}
          />
        </ModuleFrame>
      </aside>
    </Panel>
  );

  // A shared link cannot carry an imported table, so a doc arriving this way has table_lookup columns that
  // resolve to nothing. Previously that was silent (empty columns, a broken fit); now we say it and offer
  // the fix.
  const missingData = useMemo(() => missingDatasets(document), [document]);

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
        modulations={modulations}
        copulaCouplings={copulaCouplings}
        jointSources={jointSources}
        showProvenance={showProvenance}
        nodeProvenanceById={provenance.nodes}
        edgeProvenanceById={provenance.edges}
        residualVerdicts={residualVerdicts}
        changedElements={changedElements}
        disabledEdgeIds={new Set(Object.entries(document.simulation.edges).filter(([, mechanism]) => !mechanism.enabled).map(([id]) => id))}
        highlightedEdges={highlightedEdges}
        ancestorIds={ancestorIds}
        showNoiseNodes={showNoiseNodes}
        pending={resultsPending}
        onSelect={setSelection}
        onAddNode={addNodeAt}
        onMoveNode={(id, position) => replaceGraph(updateNode(document.graph, id, { position }))}
        onNodeClick={(id) => tool === "edge" ? createOrSelectEdge(id) : tool === "couple" ? createOrSelectCoupling(id) : selectNode(id)}
        onNoiseClick={selectNoiseNode}
        onEdgeClick={selectEdge}
        onEdgeControl={(edge) => replaceGraph(upsertEdge(document.graph, edge))}
        onResample={resample}
        onOpenJointLab={(source) => openJointLab(source?.kind)}
        onSelectCoupling={selectCoupling}
        onWireMany={wireManyToTarget}
        onAdjustMany={adjustMany}
        onCoupleMany={coupleMany}
        onDeleteMany={deleteMany}
      />
      {couplingHint && <div className="couple-hint error" role="status">{couplingHint}</div>}
      {wirePrompt && (() => {
        const wired = document.graph.nodes.find((n) => n.id === wirePrompt);
        if (!wired) return null;
        const model = normalizeVariableModel(wired.variable).valueType === "binary" ? "logistic" : "linear (OLS)";
        return (
          <div className="wire-prompt" role="status">
            <span><b>{wired.label}</b> is a data variable — its new arrow is <b>not learned</b> yet.</span>
            <div className="wire-prompt-actions">
              <button type="button" className="wp-fit" onClick={() => { commit(setNodeDataMode(document, wirePrompt, "fit")); setWirePrompt(null); }}>Fit {wired.label} from data ({model}) →</button>
              <button type="button" className="wp-leave" onClick={() => setWirePrompt(null)}>Leave not learned</button>
            </div>
          </div>
        );
      })()}
      {missingData.length > 0 && (
        <div className="wire-prompt data-missing" role="status">
          <span>
            This model reads from imported data (<b>{missingData.join(", ")}</b>) that a share link can&rsquo;t carry —
            those columns are <b>empty</b>, so the fit and the results are not real. Re-upload the CSV to restore it.
          </span>
          <div className="wire-prompt-actions">
            <button type="button" className="wp-fit" onClick={() => setShowImport(true)}>Re-upload CSV →</button>
          </div>
        </div>
      )}
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
          <Panel id="adjusted" defaultSize={showPairwiseScatter ? 58 : 100} minSize={30} className="workspace-panel">
              <aside className="side-panel module-pane adjusted-output-column">
                <ModuleFrame
                  tone="output"
                  label={completedOutputActive ? "Output"
                    : frameOperation === "adjust" ? "Output"
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
                    auxDiagnosis={auxEstimandTrustworthy ? structuralAux : null}
                    binaryOutput={binaryAdjustmentOutput}
                    continuousOutput={binaryContinuousAdjustmentOutput}
                    unified={unifiedAdjustment}
                    continuousEffect={continuousEffect ? {
                      comparison: continuousEffect,
                      xLabel: document.graph.nodes.find((node) => node.id === continuousEffect.xId)?.label ?? continuousEffect.xId,
                      yLabel: document.graph.nodes.find((node) => node.id === continuousEffect.yId)?.label ?? continuousEffect.yId
                    } : null}
                    categoricalEffect={categoricalEffect ? {
                      comparison: categoricalEffect,
                      xLabel: document.graph.nodes.find((node) => node.id === categoricalEffect.xId)?.label ?? categoricalEffect.xId,
                      yLabel: document.graph.nodes.find((node) => node.id === categoricalEffect.yId)?.label ?? categoricalEffect.yId
                    } : null}
                    basis={covariateBasis}
                    onBasisChange={setCovariateBasis}
                    pending={resultsPending}
                    hideOracle={false}
                  />
                </ModuleFrame>
              </aside>
          </Panel>
        )}
        {showAdjustedOutputColumn && showPairwiseScatter && renderWorkspaceHandle("adjusted-pairwise", true)}
        {showPairwiseScatter && (
          <Panel id="pairwise" defaultSize={showAdjustedOutputColumn ? 42 : 100} minSize={22} className="workspace-panel">
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
                    simulationSpec={document.simulation}
                    onPair={setScatterPair}
                    onSelectNode={selectNode}
                  />}
            </ModuleFrame>
          </aside>
          </Panel>
        )}
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
          <IconButton label="Couple (confounder dependence)" active={tool === "couple"} onClick={() => { setTool(tool === "couple" ? "select" : "couple"); setEdgeSource(null); setCouplingHint(null); }}><Waypoints size={18} /></IconButton>
          <IconButton label="Delete" onClick={deleteSelection} disabled={!selection}><Trash2 size={18} /></IconButton>
          <IconButton label="Undo" onClick={undo} disabled={history.length === 0}><Undo2 size={18} /></IconButton>
          <IconButton label="Redo" onClick={redo} disabled={future.length === 0}><Redo2 size={18} /></IconButton>
        </div>}
        {!paperNetworkOpen && <div className="toolbar" aria-label="Model actions">
          {isBasicMode ? <>
            <BasicExampleTabs activeExampleId={activeExampleId} onSelect={loadExample} />
            <ExampleMenu mode={workbenchMode} activeExampleId={activeExampleId} onSelect={loadExample} onOpenGlossary={() => setShowGlossary(true)} />
          </> : <>
            {!presentationActive && <IconButton label="New" onClick={createNewDocument}><FilePlus2 size={18} /></IconButton>}
            {!presentationActive && <IconButton label="Import data (CSV → nodes)" onClick={() => setShowImport(true)}><FileUp size={18} /></IconButton>}
            {!presentationActive && <IconButton label="Take the tour" pressed={tutorialStep !== null} onClick={() => setTutorialStep((step) => (step === null ? 0 : null))}><GraduationCap size={18} /></IconButton>}
            <ExampleMenu mode={workbenchMode} activeExampleId={activeExampleId} onSelect={loadExample} onOpenGlossary={() => setShowGlossary(true)} />
            <IconButton label="Explain this example" pressed={showExplanation} onClick={() => setShowExplanation((open) => { if (!open) trackInfoOverlayOpened("explanation"); return !open; })}><Info size={18} /></IconButton>
            <IconButton label="Data-generating process" pressed={showDgp} onClick={() => setShowDgp((open) => !open)}><Sigma size={18} /></IconButton>
            <IconButton label="Glossary" pressed={showGlossary} onClick={() => setShowGlossary((open) => !open)}><BookOpen size={18} /></IconButton>
            <IconButton label="Overlap / positivity" pressed={showOverlap} badge={positivity === "ok" ? null : positivity} onClick={() => setShowOverlap((open) => !open)}><Blend size={18} /></IconButton>
            <IconButton label="Data — the current sample" pressed={showData} badge={dataOrphans.length > 0 ? "warning" : null} onClick={() => setShowData((open) => !open)}><Table size={18} /></IconButton>
            <IconButton label="Joint / DGM — the confounder joint" pressed={showJointLab} onClick={() => showJointLab ? setShowJointLab(false) : openJointLab()}><Spline size={18} /></IconButton>
            <IconButton label="Provenance — colour each number by origin (authored / data / fitted)" pressed={showProvenance} onClick={toggleProvenance}><Palette size={18} /></IconButton>
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
      {showGlossary && (
        <div className="explanation-overlay" role="dialog" aria-modal="true" aria-label="Glossary" onClick={() => setShowGlossary(false)}>
          <div className="explanation-modal disambiguation-map-modal" onClick={(event) => event.stopPropagation()}>
            <div className="explanation-modal-header">
              <strong>Glossary — the vocabulary, mapped to structure</strong>
              <button type="button" aria-label="Close glossary" onClick={() => setShowGlossary(false)}><X size={16} /></button>
            </div>
            <DisambiguationMap onOpenExample={(id) => { loadExample(id); setShowGlossary(false); }} />
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
            <DgpInspector document={document} simulation={simulation} onCorrelationChange={(rho) => commit(setCopulaCorrelation(document, rho))} />
            <button className="dgp-jointlab-open" onClick={() => { setShowDgp(false); openJointLab(); }}>⚭ Open the Joint / DGM editor — author the confounder joint →</button>
          </div>
        </div>
      )}
      {showJointLab && (
        <div className="explanation-overlay" role="dialog" aria-modal="true" aria-label="Joint / DGM editor" onClick={() => setShowJointLab(false)}>
          <div className="explanation-modal wide" onClick={(event) => event.stopPropagation()}>
            <div className="explanation-modal-header">
              <strong>Joint / DGM — the confounder joint · {activeExample?.title ?? document.title}</strong>
              <button type="button" aria-label="Close Joint / DGM editor" onClick={() => setShowJointLab(false)}><X size={16} /></button>
            </div>
            <div className="jointdgm-tabs" role="tablist" aria-label="Joint mechanism">
              <button type="button" role="tab" aria-selected={jointLabTab === "copula"} className={`jointdgm-tab${jointLabTab === "copula" ? " active" : ""}`} onClick={() => setJointLabTab("copula")}>
                Copula{hasCopulaSource ? <span className="jointdgm-dot" aria-hidden="true" /> : null}
              </button>
              <button type="button" role="tab" aria-selected={jointLabTab === "plasmode"} className={`jointdgm-tab${jointLabTab === "plasmode" ? " active" : ""}`} onClick={() => setJointLabTab("plasmode")}>
                Plasmode{hasPlasmodeSource ? <span className="jointdgm-dot jointdgm-dot--plasmode" aria-hidden="true" /> : null}
              </button>
            </div>
            {jointLabTab === "copula"
              ? <CopulaBlockEditor key={activeExample?.id ?? "custom"} document={document} onCommit={commit} />
              : <PlasmodeSourcePanel document={document} onSetJointMode={(dataset, mode) => commit(setPlasmodeJointMode(document, dataset, mode))} fittable={fittableDgp(document)} onFitDgp={() => commit(fitDgpFromData(document))} />}
          </div>
        </div>
      )}
      {tutorialStep !== null && (
        <TutorialController
          steps={LALONDE_TUTORIAL}
          step={tutorialStep}
          ctx={{ document, showJointLab, jointSources }}
          onGoto={(index) => setTutorialStep(index)}
          onExit={() => setTutorialStep(null)}
          onAction={runTutorialAction}
        />
      )}
      {showImport && (
        <div className="explanation-overlay" role="dialog" aria-modal="true" aria-label="Import data" onClick={() => setShowImport(false)}>
          <div className="explanation-modal" onClick={(event) => event.stopPropagation()}>
            <div className="explanation-modal-header">
              <strong>Import data — CSV → nodes</strong>
              <button type="button" aria-label="Close import" onClick={() => setShowImport(false)}><X size={16} /></button>
            </div>
            <ImportDataModal onImport={importDataDocument} onClose={() => setShowImport(false)} />
          </div>
        </div>
      )}
      {showData && (
        <div className="explanation-overlay" role="dialog" aria-modal="true" aria-label="Data table" onClick={() => setShowData(false)}>
          <div className="explanation-modal wide" onClick={(event) => event.stopPropagation()}>
            <div className="explanation-modal-header">
              <strong>Data — the current sample · {activeExample?.title ?? document.title}</strong>
              <button type="button" aria-label="Close data table" onClick={() => setShowData(false)}><X size={16} /></button>
            </div>
            <DataTablePanel graph={document.graph} simulation={simulation} title={activeExample?.title ?? document.title} orphanColumns={dataOrphans} />
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
                  onSeed={setSeed}
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

function graphEmpiricalDraws(graph: GraphModel): number {
  if (graph.nodes.length === 0) return EMPIRICAL_DRAW_DEFAULT;
  const requested = graph.nodes.reduce((max, node) => {
    const variable = normalizeVariableModel(node.variable);
    return Math.max(max, variable.simulation.sampleSize);
  }, EMPIRICAL_DRAW_MIN);
  return clampDrawCount(requested);
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
