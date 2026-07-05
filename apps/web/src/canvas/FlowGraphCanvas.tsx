import type React from "react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  applyNodeChanges,
  useReactFlow,
  useStore
} from "@xyflow/react";
import type { Edge as FlowEdge, EdgeProps as FlowEdgeProps, Node as FlowNode, NodeChange, NodeProps as FlowNodeProps } from "@xyflow/react";
import {
  candidateInstruments,
  createNode,
  normalizeEdgeMechanism,
  normalizeVariableModel
} from "@nudagitty/core";
import type {
  EdgeMechanism,
  EdgeMechanismKind,
  GraphEdge,
  GraphNode,
  SimulatedNodeState,
  VariableModel
} from "@nudagitty/core";
import { clamp, formatPercent, formatSignedValue, formatValue } from "../shared/formatting";
import {
  FLOW_NODE_CENTER_X,
  FLOW_NODE_CENTER_Y,
  FLOW_NODE_HEIGHT,
  FLOW_NODE_WIDTH,
  NODE_DISTRIBUTION_ANNOTATION_Y,
  NODE_DISTRIBUTION_PLOT_HEIGHT,
  NODE_DISTRIBUTION_PLOT_WIDTH,
  NODE_DISTRIBUTION_PLOT_X,
  NODE_DISTRIBUTION_PLOT_Y,
  PENTAGON_POINTS
} from "../app/constants";
import type { FlowGraphEdgeData, FlowGraphNodeData, ModulationLink, NodeDistributionSummary } from "../app/types";
import {
  arrowHeadGeometry,
  edgeGeometry,
  edgeMechanismDisplayStrength,
  edgeVisibleStrokePath,
  flowEdgeClassName,
  flowNodePositionToGraphPoint,
  graphPointToFlowPoint,
  nodeBoundaryPoint,
  unitVector
} from "./edgeGeometry";
import { graphViewportSignature } from "../compute/graphSignatures";
import { functionGlyphPath, mechanismLabel } from "../compute/format";
import {
  analyticDistributionLabel,
  analyticDistributionPath,
  binaryProbabilityFromState,
  distributionPlotDomain,
  histogram,
  isBinaryDistributionState,
  nodeDistributionAnnotationLines,
  nodeDistributionFullSummary
} from "../compute/distributionPlot";
import { resultPendingActive, resultPendingShortLabel } from "../compute/relationSummary";
import { PendingChip } from "../controls";
import { useMediaQuery } from "../app/useMediaQuery";
import type { CopulaCoupling, GraphCanvasProps } from "./types";

const FLOW_NODE_TYPES = { graphNode: FlowGraphNode };
const FLOW_EDGE_TYPES = { graphEdge: FlowGraphEdge };

type FlowGraphNode = FlowNode<FlowGraphNodeData, "graphNode">;
type FlowGraphEdge = FlowEdge<FlowGraphEdgeData, "graphEdge">;

export function FlowGraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowGraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function FlowGraphCanvasInner(props: GraphCanvasProps) {
  const flow = useReactFlow<FlowGraphNode, FlowGraphEdge>();
  const panZoom = useStore((state) => state.panZoom);
  const touchScrollViewport = useMediaQuery("(max-width: 700px)");
  const frameRef = useRef<HTMLDivElement | null>(null);
  const nodesById = useMemo(() => new Map(props.graph.nodes.map((node) => [node.id, node])), [props.graph.nodes]);
  const denseEdges = props.graph.edges.length > 7;
  const viewportSignature = useMemo(() => graphViewportSignature(props.graph), [props.graph]);
  // Structural "this could be an IV!" hint — advisory; never assigns the role.
  const candidateInstrumentIds = useMemo(() => new Set(candidateInstruments(props.graph)), [props.graph]);
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
        candidateInstrument: candidateInstrumentIds.has(node.id),
        showNoise: props.showNoiseNodes,
        onNodeClick: props.onNodeClick
      },
      selected,
      draggable: true,
      focusable: true
    };
  }), [candidateInstrumentIds, props.ancestorIds, props.derived.nodes, props.edgeSource, props.graph.nodes, props.onNodeClick, props.selection, props.simulation.changedNodes, props.simulation.nodeStates, props.simulation.values, props.showNoiseNodes]);
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
          onPaneClick={(event) => {
            // With the "Variable" tool active, a single click on the canvas drops a new node (the
            // toolbar button was otherwise inert on the React-Flow canvas — only double-click added).
            if (props.tool === "node") props.onAddNode(flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
            else props.onSelect(null);
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.1} />
          {props.mode !== "basic" && <Controls className="canvas-zoom-controls react-flow-controls" showInteractive={false} />}
          <FlowGraphArrowLayer edges={computedEdges} />
          <FlowModulationLayer modulations={props.modulations} edges={computedEdges} nodesById={liveNodesById} />
          <FlowCopulaLayer couplings={props.copulaCouplings} nodesById={liveNodesById} onEdit={props.onOpenJointLab} onSelect={props.onSelectCoupling} selectedId={props.selection?.kind === "coupling" ? props.selection.id : null} interactive={props.tool === "select"} />
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
      {legendOpen && <FlowGraphLegend showNoise={props.showNoiseNodes} />}
      {props.mode !== "basic" && <div className="canvas-status">
        <span>{props.tool === "edge" ? (props.edgeSource ? `connect from ${props.edgeSource}` : "click a source variable")
          : props.tool === "couple" ? (props.edgeSource ? `couple from ${props.edgeSource} — click another confounder` : "click two confounders to couple")
          : "double-click canvas to add variable"}</span>
      </div>}
      {resultPendingActive(props.pending) && (
        <div className="canvas-computation-status" role="status">
          <PendingChip pending label={resultPendingShortLabel(props.pending)} />
        </div>
      )}
    </section>
  );
}

function FlowGraphLegend(props: { showNoise: boolean }) {
  return (
    <div className="graph-legend flow-graph-legend" aria-hidden="true">
      <div className="flow-graph-legend-title">Legend</div>
      <div className="flow-graph-legend-row">
        <span className="flow-graph-legend-node exposure" />
        <span><strong>intervention</strong> — the cause you do()</span>
      </div>
      <div className="flow-graph-legend-row">
        <span className="flow-graph-legend-node outcome" />
        <span><strong>outcome</strong> — the effect measured</span>
      </div>
      <div className="flow-graph-legend-row">
        <span className="flow-graph-legend-node adjusted" />
        <span><strong>adjusted</strong> — conditioned on</span>
      </div>
      <div className="flow-graph-legend-row">
        <span className="flow-graph-legend-node selected" />
        <span><strong>sample marker</strong> — selected sub-population</span>
      </div>
      <div className="flow-graph-legend-row">
        <span className="flow-graph-legend-node latent" />
        <span><strong>latent</strong> — unobserved</span>
      </div>
      <div className="flow-graph-legend-row">
        <span className="flow-graph-legend-node instrument" />
        <span><strong>instrument</strong> — an IV</span>
      </div>
      {props.showNoise && <div className="flow-graph-legend-row">
        <span className="flow-graph-legend-node noise" />
        <span><strong>disturbance (ε)</strong> — a node's own unmodeled causes</span>
      </div>}
    </div>
  );
}

// Pentagon (intervention) circumradius 25, vertex up — distinguishes do()-able exposures from
// square outcomes and circular covariates by SHAPE rather than colour.

function FlowGraphNode(props: FlowNodeProps<FlowGraphNode>) {
  const { node, selected, edgeSource, ancestor, changed, value, state, summary, candidateInstrument, showNoise, onNodeClick } = props.data;
  const showInstrumentHint = candidateInstrument && !node.roles.instrument;
  const variable = normalizeVariableModel(node.variable);
  // Discrete / atomic marginals carry point masses — Sklar's copula is unidentified across the
  // value gaps, so an authored τ on such a node is a latent knob the atoms compress. Flag it.
  const hasPointMass = variable.valueType === "binary" || variable.valueType === "categorical" || variable.valueType === "ordinal" || variable.valueType === "count";
  const labelLines = nodeLabelLines(node.label);
  const labelY = labelLines.length === 1 ? 4 : -((labelLines.length - 1) * 6);
  const className = [
    "flow-graph-node",
    "node",
    selected || props.selected ? "selected" : "",
    node.roles.exposure ? "exposure" : "",
    node.roles.outcome ? "outcome" : "",
    node.roles.latent ? "latent" : "",
    node.roles.instrument ? "instrument" : "",
    ancestor ? "ancestor" : "",
    changed ? "changed" : "",
    edgeSource ? "edge-source" : ""
  ].filter(Boolean).join(" ");
  const handleSelect = (event: React.MouseEvent) => {
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
        {showNoise && (
          <g className="noise-satellite">
            <title>Implicit disturbance (U) — every variable has one: all the unmodeled causes that make it stochastic. DAGs conventionally omit them, assuming they're independent (the Markovian / causal-sufficiency assumption); a shared one would be latent confounding.</title>
            <line x1={-29} y1={-23} x2={-16} y2={-14} />
            <circle cx={-37} cy={-30} r={6} />
            <text x={-37} y={-27.5}>&epsilon;</text>
          </g>
        )}
        {node.roles.exposure ? (
          <polygon className="node-base" points={PENTAGON_POINTS}><title>Intervention — the cause you do()</title></polygon>
        ) : node.roles.outcome ? (
          <rect className="node-base" x={-22} y={-22} width={44} height={44} rx={4}><title>Outcome — the effect measured</title></rect>
        ) : (
          <circle className="node-base" r={21} />
        )}
        {showInstrumentHint && (
          <g className="instrument-candidate-flag">
            <title>This could be an instrument (IV) — it feeds the exposure with no other path to the outcome. Assign the instrument role to estimate via 2SLS.</title>
            <rect x="11" y="-36" width="30" height="16" rx="8" />
            <text x="26" y="-24">IV?</text>
          </g>
        )}
        {node.roles.adjusted && <rect className="adjusted-ring" x="-27" y="-27" width="54" height="54" rx="6" />}
        {node.roles.selected && <path className="selected-mark" d="M -20 24 L 0 34 L 20 24" />}
        {hasPointMass && (
          <g className="pointmass-badge" transform="translate(30,-30)">
            <title>Has point mass (atoms) — a discrete/atomic marginal ({variable.valueType}). Sklar's copula is unidentified across the value gaps, so an authored τ here is a latent knob the atoms compress (see the Joint Lab confession).</title>
            <rect x={-9} y={-8} width={18} height={16} rx={4} />
            <line x1={-5} y1={5} x2={-5} y2={-1} />
            <line x1={0} y1={5} x2={0} y2={-5} />
            <line x1={5} y1={5} x2={5} y2={1} />
          </g>
        )}
        <text className="node-label" y={labelY} onClick={handleSelect}>
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

// A moderator/effect-modifier rendered structurally: the `gate` node acts upon the `source → target`
// edge. Drawn as a dashed arrow from the gate to a small junction marker sitting on that edge — the
// visual primitive that distinguishes moderation from confounding (fork) and mediation (chain).

// How a gate reshapes the edge it sits on, judged against that edge's own baseline strength.
// Opposite-sign gates that roughly cancel the edge "mask" it (recessive epistasis); a stronger
// opposite gate "flips" the sign (crossover interaction); a same-sign gate "amplifies".
function modulationVerb(baseline: number, gateCoefficient: number): string {
  if (gateCoefficient === 0) return "gates";
  if (baseline === 0) return "gates"; // no main effect — the gate IS the whole effect
  const sameSign = Math.sign(baseline) === Math.sign(gateCoefficient);
  if (sameSign) return "amplifies";
  const ratio = Math.abs(gateCoefficient) / Math.abs(baseline);
  if (ratio > 1.25) return "flips";
  if (ratio < 0.75) return "dampens";
  return "masks";
}

// Copula couplings: dashed bidirected arcs between covariates that share a copula block, labelled τ.
// Makes the authored dependence a visible part of the DAG rather than a hidden simulation setting.
function FlowCopulaLayer({ couplings, nodesById, onEdit, onSelect, selectedId, interactive: interactiveMode = true }: { couplings: CopulaCoupling[]; nodesById: Map<string, GraphNode>; onEdit?: () => void; onSelect?: (id: string) => void; selectedId?: string | null; interactive?: boolean }) {
  if (!couplings || couplings.length === 0) return null;
  // Arcs take pointer events only in select mode, so node clicks pass through while drawing couplings.
  const interactive = interactiveMode && Boolean(onEdit || onSelect);
  return (
    <ViewportPortal>
      <svg className={`copula-coupling-layer${interactive ? " editable" : ""}`} aria-hidden={interactive ? undefined : "true"}>
        {couplings.map((c) => {
          const a = nodesById.get(c.aId), b = nodesById.get(c.bId);
          if (!a || !b) return null;
          const pa = nodeBoundaryPoint(a, b.position, 6, { includeDistribution: false });
          const pb = nodeBoundaryPoint(b, a.position, 6, { includeDistribution: false });
          const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
          const dx = pb.x - pa.x, dy = pb.y - pa.y, len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len, ny = dx / len, bow = Math.min(30, len * 0.2);
          const cx = mid.x + nx * bow, cy = mid.y + ny * bow;
          const d = `M ${pa.x} ${pa.y} Q ${cx} ${cy} ${pb.x} ${pb.y}`;
          const selected = selectedId === c.id;
          return (
            <g key={c.id} className={`copula-coupling${selected ? " selected" : ""}`}
              onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(c.id); } : undefined}
              onDoubleClick={onEdit ? (e) => { e.stopPropagation(); onEdit(); } : undefined}>
              <title>{interactive ? `${c.label} — click to select, double-click to edit in the Joint Lab` : c.label}</title>
              {/* wide transparent hit-target so the thin dashed arc is easy to click */}
              {interactive && <path className="copula-coupling-hit" d={d} />}
              <path className="copula-coupling-line" d={d} />
              <text className="copula-coupling-label" x={cx + nx * 7} y={cy + ny * 7} textAnchor="middle">{c.short}</text>
            </g>
          );
        })}
      </svg>
    </ViewportPortal>
  );
}

function FlowModulationLayer({ modulations, edges, nodesById }: { modulations: ModulationLink[]; edges: FlowGraphEdge[]; nodesById: Map<string, GraphNode> }) {
  if (modulations.length === 0) return null;
  return (
    <ViewportPortal>
      <svg className="modulation-arrow-layer" aria-hidden="true">
        {modulations.map((modulation) => {
          const edge = edges.find((candidate) => candidate.data?.edge.source === modulation.sourceId && candidate.data?.edge.target === modulation.targetId);
          const gate = nodesById.get(modulation.gateId);
          if (!edge?.data || !gate) return null;
          // The junction sits at the edge's control point (its visual midpoint); the arrow runs from
          // the gate's perimeter to just short of the junction so the head reads cleanly.
          const junction = edge.data.geometry.control;
          const start = nodeBoundaryPoint(gate, junction, 4, { includeDistribution: false });
          // Stop the cap just outside the junction marker so it stays visible, not buried.
          const toward = unitVector(start, junction);
          const tip = { x: junction.x - toward.x * 7, y: junction.y - toward.y * 7 };
          const baseline = edgeMechanismDisplayStrength(edge.data.mechanism);
          const verb = modulationVerb(baseline, modulation.coefficient);
          const suppresses = verb !== "amplifies"; // masks / flips / dampens / gates all read as suppression
          const signClass = modulation.sign > 0 ? "mod-positive" : modulation.sign < 0 ? "mod-negative" : "mod-zero";
          // A blunt ⊣ cap (universal "inhibits/blocks" notation) when the gate suppresses the edge;
          // a normal arrowhead when it reinforces it.
          const normal = { x: -toward.y, y: toward.x };
          const barHalf = 6.2;
          const capBase = suppresses
            ? { x: tip.x - toward.x * 2, y: tip.y - toward.y * 2 }
            : null;
          const head = suppresses ? null : arrowHeadGeometry(tip, start, 2.2);
          const lineEnd = head ? head.base : capBase!;
          // Label sits at the line midpoint, nudged off the line so it doesn't sit on the dashes.
          const mid = { x: (start.x + junction.x) / 2 + normal.x * 11, y: (start.y + junction.y) / 2 + normal.y * 11 };
          return (
            <g key={modulation.id} className={`modulation ${signClass} ${suppresses ? "modulation-suppress" : "modulation-boost"}`}>
              <title>{`${gate.label} ${verb} the ${nodesById.get(edge.data.edge.source)?.label ?? edge.data.edge.source} → ${nodesById.get(edge.data.edge.target)?.label ?? edge.data.edge.target} effect`}</title>
              <path className="modulation-line" d={`M ${start.x} ${start.y} L ${lineEnd.x} ${lineEnd.y}`} />
              {head ? <path className="modulation-arrow-head" d={head.path} /> : (
                <path className="modulation-cap-bar" d={`M ${tip.x + normal.x * barHalf} ${tip.y + normal.y * barHalf} L ${tip.x - normal.x * barHalf} ${tip.y - normal.y * barHalf}`} />
              )}
              <circle className="modulation-junction" cx={junction.x} cy={junction.y} r={5.5} />
              <text className="modulation-label" x={mid.x} y={mid.y} textAnchor="middle">{verb}</text>
            </g>
          );
        })}
      </svg>
    </ViewportPortal>
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


function edgeStrokeWidth(edgeStrength: number, denseEdges: boolean): number {
  const strength = Math.abs(edgeStrength);
  return denseEdges
    ? Math.min(5.6, 1.55 + strength * 0.72)
    : Math.min(7.2, 1.8 + strength * 1.05);
}


export function NodeDistributionMiniPlot({ state, variable, summary }: { state?: SimulatedNodeState; variable: VariableModel; summary?: NodeDistributionSummary }) {
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

export function BinaryNodeDistributionMiniPlot({ state }: { state: SimulatedNodeState }) {
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
