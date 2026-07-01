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
import { SelectionEditor } from "./editors/VariableEditor";
import { useMediaQuery } from "./app/useMediaQuery";
import { BibliographyPanel, EffectPanel, ImplicationPanel, SummaryPanel } from "./panels/analysis";
import { AnalysisSampleBanner, ConditioningMethodPanel, DesignModulePanel, DrawCountControl, RoadmapTodoPanel, ScenarioPanel, SimulationDiagnosticsPanel, clampDrawCount } from "./panels/diagnostics";
import { ScatterplotPanel } from "./panels/ScatterplotPanel";
import { AdjustedOutputPanel } from "./panels/output";
import { BasicExampleTabs, DemoResultPanel } from "./panels/demo";




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
