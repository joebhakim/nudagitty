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
  BookOpen,
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
  setCopulaCorrelation,
  adjusted,
  analyzeGraph,
  analyzeAdjustment,
  adjustmentOverlap,
  positivityStatus,
  deriveAdjustmentSpec,
  classifyConditioned,
  candidateInstruments,
  structuralRoleOf,
  correlationGraph,
  computeDoseResponseCurves,
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
  DoseResponseCurves,
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
  SimulationSpec,
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
import { AuxEstimandStructure, MethodsComparisonPanel, UnifiedAdjustmentReadout, WhatIfStrategySurvivalCurve, basicOutputPunchlineFromResult, computeCompletedOutput, computeStructuralDiagnosis, observedSurvivalView } from "./outputs/modules";
import type { BasicOutputPunchline, BasicOutputPunchlineMetric, ComputedCompletedOutput } from "./outputs/modules";
import { CompletedOutputPanel } from "./outputs/CompletedOutputPanel";
import { DisambiguationCard } from "./outputs/DisambiguationCard";
import { DisambiguationMap } from "./outputs/DisambiguationMap";
import { disambiguationTermForExample } from "./shared/disambiguation";
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
import type {
  AdjustmentStratumCondition,
  ArrowHeadGeometry,
  BasicComparisonLedgerRow,
  BasicDemoContext,
  BasicRelationSummary,
  BinaryAdjustmentOutput,
  BinaryAdjustmentStratum,
  BinaryCell,
  BinaryContinuousAdjustmentOutput,
  BinaryContinuousAdjustmentStratum,
  BinaryContinuousGroup,
  BinaryOutcomeContrastSummary,
  BinnedAdjustmentNode,
  CanvasViewport,
  DesignModuleStatus,
  DragState,
  EdgeGeometry,
  FlowGraphEdgeData,
  FlowGraphNodeData,
  ModulationLink,
  ModuleTone,
  NodeDistributionSummary,
  PairDerivedSummary,
  PointerScreenPoint,
  PositivityRow,
  ResultPendingState,
  ShareStatus,
  ShowcaseGuide,
  SimulationDerivedCache,
  StabilizedIpwBalance,
  StabilizedIpwOutput,
  StabilizedIpwRow,
  WeightedScatterSummary
} from "./app/types";
import {
  BASE_VIEWBOX,
  BASIC_NODE_VIEW_MARGIN,
  BASIC_VIEWPORT_ZOOM_BONUS,
  BIBLIOGRAPHY,
  BIBLIOGRAPHY_TOPICS,
  CUSTOM_DENOUEMENT,
  DEFAULT_VIEWPORT,
  DESIGN_MODULES,
  EDGE_ARROW_NODE_OVERLAP,
  EDGE_ARROW_TIP_EXTENSION_FACTOR,
  EDGE_CROWDED_FAN_MAX_OFFSET,
  EDGE_CROWDED_FAN_SPACING,
  EDGE_CROWDED_FAN_THRESHOLD,
  EDGE_ENDPOINT_PORT_DISTANCE,
  EDGE_ENDPOINT_PORT_MAX_OFFSET,
  EDGE_ENDPOINT_PORT_SPACING,
  EDGE_MECHANISMS,
  EDGE_OUTGOING_FAN_MAX_OFFSET,
  EDGE_OUTGOING_FAN_SPACING,
  EDGE_OUTGOING_FAN_THRESHOLD,
  EDGE_SOURCE_CLEARANCE,
  EMPIRICAL_DRAW_DEFAULT,
  EMPIRICAL_DRAW_MAX,
  EMPIRICAL_DRAW_MIN,
  EMPIRICAL_DRAW_STEP,
  FLOW_NODE_CENTER_X,
  FLOW_NODE_CENTER_Y,
  FLOW_NODE_HEIGHT,
  FLOW_NODE_WIDTH,
  FRONTLINE_EXAMPLE_IDS,
  MAX_SHARE_URL_LENGTH,
  NODE_COMBINERS,
  NODE_DISTRIBUTION_ANNOTATION_Y,
  NODE_DISTRIBUTION_BOUNDS,
  NODE_DISTRIBUTION_PLOT_HEIGHT,
  NODE_DISTRIBUTION_PLOT_WIDTH,
  NODE_DISTRIBUTION_PLOT_X,
  NODE_DISTRIBUTION_PLOT_Y,
  NODE_VIEW_MARGIN,
  PAPER_NETWORK_HASH,
  PENTAGON_POINTS,
  PLANNED_CAUSAL_MODULES,
  ROADMAP_TODOS,
  VARIABLE_TYPES,
  WORKER_FALLBACK_MS
} from "./app/constants";
import {
  fitViewportToGraph,
  graphAnalysisSignature,
  graphOutputSignature,
  graphSimulationSignature,
  graphViewportSignature
} from "./compute/graphSignatures";
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
import { computeHighlightedEdges, transformView } from "./compute/viewTransforms";
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
  binaryCells,
  binaryContinuousGroups,
  binaryOutcomeContrastFromCells,
  buildSimulationDerivedCache,
  empiricalWeightAt,
  isBinaryGraphNode,
  isStabilizedIpwNode,
  padDomain,
  pairDerivedSummary
} from "./compute/scatterStats";
import {
  analyticDistributionLabel,
  analyticDistributionPath,
  binaryProbabilityFromState,
  defaultDistribution,
  distributionPlotDomain,
  histogram,
  inferValueTypeFromMechanism,
  isBinaryDistributionState,
  nodeDistributionAnnotationLines,
  nodeDistributionFullSummary,
  valueTypeLabel
} from "./compute/distributionPlot";
import {
  abbreviateLabel,
  analyticSummaryLabel,
  binaryAxisValueLabel,
  binaryShortLabel,
  designModulesForMode,
  formatOutcomeDifference,
  formatOutcomeMean,
  functionGlyphPath,
  inferenceModeLabel,
  mechanismLabel,
  metricTone,
  nodeDisplayName,
  nodeOutputLabel,
  signForPunchline,
  trimNumber
} from "./compute/format";
import { computeStabilizedIpw } from "./compute/ipw";
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
  computeBinaryAdjustmentOutput,
  computeBinaryContinuousAdjustmentOutput,
  shouldRenderBinaryAdjustmentOutput,
  shouldShowAdjustedOutputColumn
} from "./compute/adjustmentOutput";
import {
  basicDemoRecommendedAdjustmentId,
  computeBasicRelationSummary,
  demoResultHeading,
  fallbackLedgerRows,
  formatActiveInterventions,
  nodeAdjusted,
  relationChangeLabel,
  resultPendingActive,
  resultPendingDetail,
  resultPendingShortLabel,
  shortNodeLabel
} from "./compute/relationSummary";
import { Checkbox, IconButton, List, ModuleFrame, NumberField, PendingChip, RadioGroup, RoleToggle, Section, TactileNumberField } from "./controls";
import { FlowGraphCanvas } from "./canvas/FlowGraphCanvas";
import { DistributionEditor } from "./editors/DistributionEditor";
import { EdgeEditor, EdgePanel } from "./editors/EdgeEditor";
import { useMediaQuery } from "./app/useMediaQuery";




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
  const [showGlossary, setShowGlossary] = useState(false);
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
  const completedOutput = useMemo(() => computeCompletedOutput(outputContext, activeExample?.outputModule ?? null), [activeExample?.outputModule, outputContext]);
  // The generic structural diagnosis, computed for EVERY example so its Estimand/Structure cards can be
  // shown alongside a dedicated module too (consistency: the target estimand shouldn't depend on whether
  // the example happens to have a bespoke output module).
  const structuralAux = useMemo(() => computeStructuralDiagnosis(outputContext), [outputContext]);
  // Only surface the auto-estimand alongside a dedicated module when it's TRUSTWORTHY: a descriptive
  // selection/stratification estimand is always fine, but a "backdoor-standardized" estimand is only
  // valid when the adjustment actually identifies the effect — otherwise (front-door's mediator, M-bias's
  // collider) it would assert a wrong target, so we suppress it there rather than mislead.
  const auxEstimandTrustworthy = useMemo(() => {
    const primary = outputContext.analysis.conditioningRoles[0];
    if (!primary) return false;
    if (primary.operation !== "adjust") return true;
    return outputContext.analysis.totalEffect.valid;
  }, [outputContext]);
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
  // Keep the raw scatter visible for continuous exposures (the cloud IS the teaching view, e.g. the
  // collider examples) even when the adjusted column also shows its estimand/structure; hide it only
  // for binary adjustment, where it would just duplicate the adjusted estimate.
  const exposureNodeForLayout = computationDocument.graph.nodes.find((node) => node.id === activeOutputPair.x);
  const exposureBinaryForLayout = exposureNodeForLayout ? normalizeVariableModel(exposureNodeForLayout.variable).valueType === "binary" : true;
  const showPairwiseScatter = !showAdjustedOutputColumn || !exposureBinaryForLayout;

  // Classic examples (no what-if module) get the SAME canonical g-method panel as the
  // longitudinal ones, derived from the current adjust/condition operations + the pair —
  // so the same operation renders the same output everywhere (Pro and Demo alike).
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
        modulations={modulations}
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
            <ExampleMenu mode={workbenchMode} activeExampleId={activeExampleId} onSelect={loadExample} onOpenGlossary={() => setShowGlossary(true)} />
            <IconButton label="Explain this example" pressed={showExplanation} onClick={() => setShowExplanation((open) => { if (!open) trackInfoOverlayOpened("explanation"); return !open; })}><Info size={18} /></IconButton>
            <IconButton label="Data-generating process" pressed={showDgp} onClick={() => setShowDgp((open) => !open)}><Sigma size={18} /></IconButton>
            <IconButton label="Term disambiguation" pressed={showGlossary} onClick={() => setShowGlossary((open) => !open)}><BookOpen size={18} /></IconButton>
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
      {showGlossary && (
        <div className="explanation-overlay" role="dialog" aria-modal="true" aria-label="Term disambiguation" onClick={() => setShowGlossary(false)}>
          <div className="explanation-modal disambiguation-map-modal" onClick={(event) => event.stopPropagation()}>
            <div className="explanation-modal-header">
              <strong>Term disambiguation — the vocabulary, mapped to structure</strong>
              <button type="button" aria-label="Close term disambiguation" onClick={() => setShowGlossary(false)}><X size={16} /></button>
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

function ScatterplotPanel(props: {
  graph: GraphModel;
  simulation: SimulationResult;
  derived: SimulationDerivedCache;
  pair: ScatterPair;
  pending?: ResultPendingState;
  pendingLabel?: string;
  variant?: "default" | "demo";
  simulationSpec?: SimulationSpec;
  onPair: (pair: ScatterPair) => void;
  onSelectNode: (id: string) => void;
}) {
  const nodes = [...props.graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const pair = reconcileScatterPair(props.graph, props.pair);
  // User-tunable point opacity (persisted) — replaces the auto/adaptive alpha. Lets the user dial in
  // overplotting for their own data instead of guessing a heuristic.
  const [pointAlpha, setPointAlpha] = useState<number>(() => {
    try { const v = parseFloat(localStorage.getItem("nudagitty.pointAlpha") ?? ""); return Number.isFinite(v) ? v : 0.4; } catch { return 0.4; }
  });
  useEffect(() => { try { localStorage.setItem("nudagitty.pointAlpha", String(pointAlpha)); } catch { /* ignore */ } }, [pointAlpha]);
  // Polynomial degree of the dose term for the adjusted dose-response curve (1 = straight, 2 = curved).
  const [doseDegree, setDoseDegree] = useState<1 | 2>(1);
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
  // For a continuous exposure we intervene on, overlay the dose-response curves
  // (crude vs re-simulated oracle vs from-data adjusted). Returns null for any
  // other pairing, falling back to the ordinary crude scatter. Skipped in demo.
  const doseResponse = useMemo<DoseResponseCurves | null>(() => {
    if (props.variant === "demo" || !props.simulationSpec) return null;
    return computeDoseResponseCurves(props.graph, props.simulationSpec, props.simulation, { x: pair.x, y: pair.y }, { doseDegree });
  }, [props.variant, props.simulationSpec, props.graph, props.simulation, pair.x, pair.y, doseDegree]);

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
        {points.length > 0 && (
          <label className="scatter-alpha-control" title="Point opacity">
            <span aria-hidden="true">α</span>
            <input type="range" min="0.03" max="1" step="0.01" value={pointAlpha} aria-label="Point opacity" onChange={(event) => setPointAlpha(parseFloat(event.target.value))} />
          </label>
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
              // Fixed radius; opacity is the user's slider value, modulated mildly by importance weight.
              const opacity = clamp(pointAlpha * (0.5 + 0.5 * normalizedWeight), 0.02, 1);
                return (
                  <circle
                    className="scatter-point"
                    key={point.index}
                    cx={toX(point.x)}
                    cy={toY(point.y)}
                    r={2 + normalizedWeight * 1.4}
                    style={{ opacity }}
                  />
                );
              })}
            {doseResponse ? (
              <DoseResponseOverlay curves={doseResponse} toX={toX} toY={toY} />
            ) : regression ? (
              <line
                className="scatter-regression"
                x1={toX(regression.x1)}
                y1={toY(regression.y1)}
                x2={toX(regression.x2)}
                y2={toY(regression.y2)}
              />
            ) : null}
          </svg>
          {doseResponse && (
            <DoseResponseLegend
              graph={props.graph}
              curves={doseResponse}
              doseDegree={doseDegree}
              onDoseDegree={setDoseDegree}
            />
          )}

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

// Builds an SVG path through (grid[i], values[i]), lifting the pen across non-finite points.
function doseCurvePath(grid: number[], values: number[], toX: (v: number) => number, toY: (v: number) => number): string {
  let d = "";
  let pen = false;
  for (let i = 0; i < grid.length; i += 1) {
    const value = values[i];
    if (value === undefined || !Number.isFinite(value)) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${toX(grid[i]!).toFixed(2)},${toY(value).toFixed(2)} `;
    pen = true;
  }
  return d.trim();
}

function doseBandPath(grid: number[], lower: number[], upper: number[], toX: (v: number) => number, toY: (v: number) => number): string {
  const pts: Array<{ x: number; lo: number; hi: number }> = [];
  for (let i = 0; i < grid.length; i += 1) {
    if (Number.isFinite(lower[i]) && Number.isFinite(upper[i])) pts.push({ x: toX(grid[i]!), lo: toY(lower[i]!), hi: toY(upper[i]!) });
  }
  if (pts.length < 2) return "";
  let d = `M${pts[0]!.x.toFixed(2)},${pts[0]!.hi.toFixed(2)} `;
  for (let i = 1; i < pts.length; i += 1) d += `L${pts[i]!.x.toFixed(2)},${pts[i]!.hi.toFixed(2)} `;
  for (let i = pts.length - 1; i >= 0; i -= 1) d += `L${pts[i]!.x.toFixed(2)},${pts[i]!.lo.toFixed(2)} `;
  return `${d}Z`;
}

// Overlays the three dose-response curves on the continuous-exposure scatter:
// crude (gray) vs re-simulated oracle (ochre) vs from-data adjusted (blue, with
// a confidence band that widens where the dose is sparsely observed).
function DoseResponseOverlay(props: { curves: DoseResponseCurves; toX: (v: number) => number; toY: (v: number) => number }) {
  const { curves, toX, toY } = props;
  const hasAdjusted = curves.adjusted !== null;
  return (
    <g className="dose-response-overlay" aria-hidden="true">
      {hasAdjusted && curves.adjustedLower && curves.adjustedUpper && (
        <path className="dose-band" d={doseBandPath(curves.grid, curves.adjustedLower, curves.adjustedUpper, toX, toY)} />
      )}
      <path className="dose-curve crude" d={doseCurvePath(curves.grid, curves.observed, toX, toY)} />
      <path className="dose-curve oracle" d={doseCurvePath(curves.grid, curves.oracle, toX, toY)} />
      {hasAdjusted && curves.adjusted && (
        <path className="dose-curve adjusted" d={doseCurvePath(curves.grid, curves.adjusted, toX, toY)} />
      )}
      {curves.grid.map((x, index) => {
        const value = curves.oracle[index];
        if (value === undefined || !Number.isFinite(value)) return null;
        return <circle key={`do${index}`} className="dose-dot" cx={toX(x)} cy={toY(value)} r={1.9} />;
      })}
    </g>
  );
}

function DoseResponseLegend(props: {
  graph: GraphModel;
  curves: DoseResponseCurves;
  doseDegree: 1 | 2;
  onDoseDegree: (degree: 1 | 2) => void;
}) {
  const adjustForLabel = props.curves.covariates
    .map((id) => { const node = props.graph.nodes.find((candidate) => candidate.id === id); return node ? shortNodeLabel(node) : id; })
    .join(", ");
  const hasAdjusted = props.curves.adjusted !== null;
  return (
    <div className="dose-response-legend">
      <div className="dose-legend-keys">
        <span className="dose-key"><span className="dose-swatch crude" />observed <span className="dose-key-formula">E[Y | X]</span></span>
        <span className="dose-key"><span className="dose-swatch oracle" />re-simulated oracle <span className="dose-key-formula">E[Y | do(X)]</span></span>
        {hasAdjusted && <span className="dose-key"><span className="dose-swatch adjusted" />adjusted for {adjustForLabel}</span>}
      </div>
      {hasAdjusted && (
        <div className="dose-fit-toggle" role="group" aria-label="Adjusted dose-response fit">
          <span className="dose-fit-label">fit</span>
          <button type="button" className={props.doseDegree === 1 ? "active" : ""} aria-pressed={props.doseDegree === 1} onClick={() => props.onDoseDegree(1)}>straight</button>
          <button type="button" className={props.doseDegree === 2 ? "active" : ""} aria-pressed={props.doseDegree === 2} onClick={() => props.onDoseDegree(2)}>curved</button>
        </div>
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
  auxDiagnosis?: ReturnType<typeof computeStructuralDiagnosis>;
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
  // Term-disambiguation reference card: shows whenever the active example instantiates a catalogued
  // phenomenon (its cross-field names, what it's confused with, anchoring papers).
  const disambiguationTerm = disambiguationTermForExample(props.exampleId);
  const disambiguationCard = disambiguationTerm ? <DisambiguationCard term={disambiguationTerm} /> : null;
  // Either an example-specific module, or the generic structural diagnosis fallback
  // (computedOutput.moduleId === "structural-diagnosis") when the example has none.
  const effectiveModuleId = props.moduleId ?? props.computedOutput?.moduleId ?? null;
  const showGenericAdjustmentCards = !effectiveModuleId?.startsWith("what-if-");
  if (effectiveModuleId) {
    return (
      <div className="adjusted-output-stack" aria-busy={resultPendingActive(props.pending)}>
        {pendingNotice}
        {showcaseGuide && <ShowcaseGuideCard guide={showcaseGuide} />}
        {disambiguationCard}
        {showGenericAdjustmentCards && unifiedPanel}
        <CompletedOutputPanel moduleId={effectiveModuleId} computedOutput={props.computedOutput} hideOracle={props.hideOracle} />
        {showGenericAdjustmentCards && effectiveModuleId !== "structural-diagnosis" && <AuxEstimandStructure diagnosis={props.auxDiagnosis ?? null} />}
      </div>
    );
  }
  if (unifiedPanel) {
    return (
      <div className="adjusted-output-stack" aria-busy={resultPendingActive(props.pending)}>
        {pendingNotice}
        {disambiguationCard}
        {unifiedPanel}
      </div>
    );
  }
  if (adjustedNodes.length === 0) {
    return (
      <div className="adjusted-output-stack" aria-busy={resultPendingActive(props.pending)}>
        {pendingNotice}
        {disambiguationCard ?? <AdjustedOutputEmptyState />}
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
      {disambiguationCard}
      <CompletedOutputPanel moduleId={props.moduleId} computedOutput={props.computedOutput} hideOracle={props.hideOracle} />
    </div>
  );
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
    const isInstrumentCandidate = candidateInstruments(props.document.graph).includes(node.id);
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
              <RoleToggle label="instrument" checked={node.roles.instrument} disabled={!isInstrumentCandidate && !node.roles.instrument} onChange={() => props.onToggleRole(node.id, "instrument")} />
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
  // The instrument role is contextual: offerable only on a structural candidate (or to un-assign one).
  const isInstrumentCandidate = useMemo(() => candidateInstruments(props.document.graph).includes(node.id), [props.document.graph, node.id]);
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
  const state = props.simulation.nodeStates[node.id];
  const parentIds = props.document.graph.edges.filter((edge) => edge.kind === "directed" && edge.target === node.id).map((edge) => edge.source);
  const isRoot = parentIds.length === 0;
  // The instrument role is contextual: offerable only on a structural candidate (or to un-assign one).
  const isInstrumentCandidate = useMemo(() => candidateInstruments(props.document.graph).includes(node.id), [props.document.graph, node.id]);
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
          <div className="selection-editor-block">
            <strong>Roles</strong>
            <div className="role-toggle-row">
              <RoleToggle label="exposure" checked={node.roles.exposure} onChange={() => props.onToggleRole(node.id, "exposure")} />
              <RoleToggle label="outcome" checked={node.roles.outcome} onChange={() => props.onToggleRole(node.id, "outcome")} />
              <RoleToggle label="unobserved" checked={node.roles.latent} onChange={() => props.onToggleRole(node.id, "latent")} />
              <RoleToggle label="instrument" checked={node.roles.instrument} disabled={!isInstrumentCandidate && !node.roles.instrument} onChange={() => props.onToggleRole(node.id, "instrument")} />
            </div>
          </div>

          <details className="output-box editor-section">
            <summary><strong>Distribution</strong><span>{valueTypeLabel(inferredValueType)}</span></summary>
            <div className="editor-section-body">
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
          </details>

          {!isRoot && parentIds.length >= 2 && <details className="output-box editor-section">
            <summary><strong>Interactions</strong></summary>
            <div className="editor-section-body">
              <InteractionEditor
                nodeId={node.id}
                parentIds={parentIds}
                interactions={mechanism.interactions}
                onChange={(interactions) => props.onMechanism(node.id, { interactions })}
              />
            </div>
          </details>}

          <details className="output-box editor-section">
            <summary><strong>Description</strong></summary>
            <div className="editor-section-body">
              <textarea aria-label="description" value={variable.description} rows={3} onChange={(event) => updateVariable({ description: event.target.value })} />
            </div>
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

function designModuleScopeLabel(mode: WorkbenchMode): string {
  if (mode === "basic") return "Small set for quick DAG explanations and common internet-argument traps.";
  return "All tools are visible, including TODO modules that still need data and code plumbing.";
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


function simulationBlocked(result: SimulationResult): boolean {
  return result.diagnostics.some((message) => message.startsWith("Simulation disabled") || message.startsWith("Simulation is only enabled"));
}
