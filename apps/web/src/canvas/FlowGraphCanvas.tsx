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
import type { JointSourceCloud, CopulaCoupling, GraphCanvasProps } from "./types";
import { MultiSelectBar } from "./MultiSelectBar";

const FLOW_NODE_TYPES = { graphNode: FlowGraphNode, copulaCloud: FlowCopulaCloudNode };
const FLOW_EDGE_TYPES = { graphEdge: FlowGraphEdge };

type FlowGraphNode = FlowNode<FlowGraphNodeData, "graphNode">;
type FlowCloudNode = FlowNode<{ label: string; sublabel?: string; kind: "copula" | "plasmode"; onEdit?: () => void; nodeCount: number }, "copulaCloud">;
type AnyFlowNode = FlowGraphNode | FlowCloudNode;
type FlowGraphEdge = FlowEdge<FlowGraphEdgeData, "graphEdge">;

const CLOUD_NODE_W = 168;
const CLOUD_NODE_H = 112;

// A "joint source" rendered as a real (synthetic) node via the node engine: a cloud shape instead of a
// circle/square, ~3× a normal node. It's a VIEW (id "cloud:…", not in the model graph, non-draggable);
// its position tracks the coupled covariates. Both mechanisms use it — a COPULA block (parametric) or a
// PLASMODE row-source (empirical, the real latent node hidden behind it). Click → the Joint / DGM editor.
function FlowCopulaCloudNode(props: FlowNodeProps<FlowCloudNode>) {
  const { label, sublabel, kind, onEdit } = props.data;
  const title = kind === "plasmode"
    ? `${label} — these variables come from the same real rows (a plasmode source), so their joint is exact. Click to edit it in the Joint / DGM editor.`
    : `${label} — the latent common cause these variables share (a copula block, the ↔ / bidirected structure). Click to edit it in the Joint / DGM editor.`;
  return (
    <div className={`copula-cloud-node copula-cloud-node--${kind}`} onClick={onEdit ? (event) => { event.stopPropagation(); onEdit(); } : undefined} title={title}>
      <svg viewBox="0 0 640 512" className="copula-cloud-node-svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <path className="copula-cloud-shape" d="M537.6 226.6c4.1-10.7 6.4-22.4 6.4-34.6 0-53-43-96-96-96-19.7 0-38.1 6-53.3 16.2C367 64.2 315.3 32 256 32c-88.4 0-160 71.6-160 160 0 2.7 .1 5.4 .2 8.1C40.2 219.8 0 273.2 0 336c0 79.5 64.5 144 144 144h368c70.7 0 128-57.3 128-128 0-61.9-44-113.6-102.4-125.4z" />
      </svg>
      <span className="copula-cloud-node-label">{label}</span>
      {sublabel ? <span className="copula-cloud-node-sublabel">{sublabel}</span> : null}
    </div>
  );
}

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
  // Selection is a SINGLE source of truth: `selectedIds`, fed by react-flow's node-change events
  // (single-click, shift-click, marquee) and read straight into each node's `selected`. No fighting
  // between react-flow's own selection and the model-data sync. `wireArmed` = the pick-a-target step.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [wireArmed, setWireArmed] = useState(false);
  // Transparency flash: briefly highlight the node/edge numbers a live re-fit just moved.
  const [flashing, setFlashing] = useState<{ nodeIds: Set<string>; edgeIds: Set<string> }>({ nodeIds: new Set(), edgeIds: new Set() });
  useEffect(() => {
    if (props.changedElements.nodeIds.size === 0 && props.changedElements.edgeIds.size === 0) return undefined;
    setFlashing(props.changedElements);
    const timer = window.setTimeout(() => setFlashing({ nodeIds: new Set(), edgeIds: new Set() }), 1200);
    return () => window.clearTimeout(timer);
  }, [props.changedElements]);
  const selectedRef = useRef<Set<string>>(selectedIds);
  selectedRef.current = selectedIds;
  const wireArmedRef = useRef(false);
  wireArmedRef.current = wireArmed;
  const clearMulti = useCallback(() => { setWireArmed(false); setSelectedIds(new Set()); props.onSelect(null); }, [props.onSelect]);
  // The node's own click handler (below) routes here with the modifier state — react-flow's own
  // onNodeClick never fires because the node stops propagation. Plain click = single; shift/⌘ = toggle;
  // while wire-armed, a click picks the target and wires all selected into it.
  const handleNodeSelect = useCallback((id: string, event: React.MouseEvent) => {
    if (wireArmedRef.current) { props.onWireMany?.([...selectedRef.current], id); clearMulti(); return; }
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
      return;
    }
    setSelectedIds(new Set([id]));
    props.onNodeClick(id);
  }, [clearMulti, props.onWireMany, props.onNodeClick]);
  const computedNodes = useMemo<FlowGraphNode[]>(() => props.graph.nodes.map((node) => {
    const selected = selectedIds.has(node.id);
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
        showProvenance: props.showProvenance,
        provenance: props.nodeProvenanceById.get(node.id) ?? "authored",
        noiseVerdict: props.residualVerdicts.get(node.id),
        onNodeClick: handleNodeSelect,
        onNoiseClick: props.onNoiseClick
      },
      className: `prov-${props.nodeProvenanceById.get(node.id) ?? "authored"}${flashing.nodeIds.has(node.id) ? " prov-flash" : ""}`,
      selected,
      draggable: true,
      focusable: true
    };
  }), [candidateInstrumentIds, handleNodeSelect, selectedIds, flashing, props.nodeProvenanceById, props.showProvenance, props.residualVerdicts, props.onNoiseClick, props.ancestorIds, props.derived.nodes, props.edgeSource, props.graph.nodes, props.selection, props.simulation.changedNodes, props.simulation.nodeStates, props.simulation.values, props.showNoiseNodes]);
  const [nodes, setNodes] = useState<FlowGraphNode[]>(computedNodes);
  const [legendOpen, setLegendOpen] = useState(false);
  const [cloudPositions, setCloudPositions] = useState<Record<string, { x: number; y: number }>>({});
  // Forget manual cloud placements when the graph structure changes (e.g. a new example loads).
  useEffect(() => { setCloudPositions({}); }, [viewportSignature]);

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

  // Plasmode joint sources hide their REAL latent node + its table_lookup edges — the cloud stands in
  // for them (so copula and plasmode read as the same object). Copula sources have no node to hide.
  const hiddenNodeIds = useMemo(() => {
    const hidden = new Set<string>();
    for (const cloud of props.jointSources) if (cloud.kind === "plasmode" && cloud.sourceId) hidden.add(cloud.sourceId);
    return hidden;
  }, [props.jointSources]);

  // Synthetic cloud nodes (one per joint source), floating above their coupled covariates by default but
  // freely DRAGGABLE (aesthetic only) — a manual drag position (kept in `cloudPositions`) overrides the
  // computed one. Appended to the render prop only (not the model `nodes` state), so model sync is untouched.
  const cloudLayout = useMemo(() => {
    if (!props.jointSources || props.jointSources.length === 0) return [] as Array<{ cloud: JointSourceCloud; position: { x: number; y: number }; center: { x: number; y: number } }>;
    const centerOf = (id: string) => { const n = nodes.find((item) => item.id === id); return n ? { x: n.position.x + FLOW_NODE_CENTER_X, y: n.position.y + FLOW_NODE_CENTER_Y } : null; };
    const out: Array<{ cloud: JointSourceCloud; position: { x: number; y: number }; center: { x: number; y: number } }> = [];
    for (const cloud of props.jointSources) {
      const centers = cloud.nodeIds.map(centerOf).filter((c): c is { x: number; y: number } => Boolean(c));
      if (centers.length === 0) continue;
      const cx = centers.reduce((sum, c) => sum + c.x, 0) / centers.length;
      const topY = Math.min(...centers.map((c) => c.y));
      const position = cloudPositions[`cloud:${cloud.id}`] ?? { x: cx - CLOUD_NODE_W / 2, y: topY - 100 - CLOUD_NODE_H / 2 };
      out.push({ cloud, position, center: { x: position.x + CLOUD_NODE_W / 2, y: position.y + CLOUD_NODE_H / 2 } });
    }
    return out;
  }, [props.jointSources, nodes, cloudPositions]);
  const cloudNodes = useMemo<FlowCloudNode[]>(() => cloudLayout.map(({ cloud, position }) => ({
    id: `cloud:${cloud.id}`,
    type: "copulaCloud",
    position,
    width: CLOUD_NODE_W, height: CLOUD_NODE_H,
    data: {
      label: cloud.label, sublabel: cloud.sublabel, kind: cloud.kind, nodeCount: cloud.nodeIds.length,
      onEdit: props.onOpenJointLab ? () => props.onOpenJointLab!({ id: cloud.id, kind: cloud.kind }) : undefined
    },
    draggable: true, selectable: false, connectable: false, deletable: false, focusable: false
  })), [cloudLayout, props.onOpenJointLab]);
  const allNodes = useMemo<AnyFlowNode[]>(() => {
    const visible = hiddenNodeIds.size > 0 ? nodes.filter((node) => !hiddenNodeIds.has(node.id)) : nodes;
    return cloudNodes.length > 0 ? [...cloudNodes, ...visible] : visible;
  }, [cloudNodes, nodes, hiddenNodeIds]);

  const computedEdges = useMemo<FlowGraphEdge[]>(() => props.graph.edges.filter((edge) => !hiddenNodeIds.has(edge.source) && !hiddenNodeIds.has(edge.target)).map((edge) => {
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
        pinned: props.edgeProvenanceById.get(edge.id) === "fitted",
        onSelect: props.onEdgeClick
      },
      className: `prov-${props.edgeProvenanceById.get(edge.id) ?? "authored"}${flashing.edgeIds.has(edge.id) ? " prov-flash" : ""}`
    };
  }), [denseEdges, flashing, hiddenNodeIds, liveNodesById, props.disabledEdgeIds, props.edgeMechanisms, props.edgeProvenanceById, props.graph.edges, props.highlightedEdges, props.onEdgeClick, props.selection]);

  useEffect(() => {
    setNodes(computedNodes); // computedNodes.selected already reflects selectedIds — no merge needed
  }, [computedNodes]);

  // With ≥2 selected, the multi-select bar owns the stage — clear the single-node editor.
  useEffect(() => { if (selectedIds.size >= 2) props.onSelect(null); }, [selectedIds, props.onSelect]);

  useEffect(() => {
    if (!panZoom || !frameRef.current || props.graph.nodes.length === 0) return undefined;
    window.setTimeout(() => {
      const rect = frameRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const positions = props.graph.nodes.map((node) => graphPointToFlowPoint(node.position));
      const minX = Math.min(...positions.map((point) => point.x));
      // Joint-source clouds float above their covariates — reserve room so the fit frames them too.
      const cloudPad = (props.jointSources?.length ?? 0) > 0 ? 132 : 0;
      const minY = Math.min(...positions.map((point) => point.y)) - cloudPad;
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
  }, [flow, panZoom, props.graph.nodes, props.mode, viewportSignature, props.jointSources]);

  const onNodesChange = useCallback((changes: NodeChange<AnyFlowNode>[]) => {
    // Cloud drags update their own aesthetic position; selection is driven explicitly by onNodeClick
    // (this app manages selection itself — react-flow's own select events aren't emitted here), so
    // SELECT changes are dropped and everything else drives the model node state.
    const cloudMoves: Record<string, { x: number; y: number }> = {};
    for (const change of changes) {
      if (change.type === "position" && change.id.startsWith("cloud:") && change.position) cloudMoves[change.id] = change.position;
    }
    if (Object.keys(cloudMoves).length > 0) setCloudPositions((prev) => ({ ...prev, ...cloudMoves }));
    setNodes((items) => {
      const ids = new Set(items.map((item) => item.id));
      const modelChanges = changes.filter((change) => change.type !== "select" && (!("id" in change) || ids.has(change.id))) as NodeChange<FlowGraphNode>[];
      return applyNodeChanges(modelChanges, items);
    });
  }, []);
  const onCanvasDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest(".react-flow__node, .react-flow__edge")) return;
    const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    props.onAddNode(point);
  }, [flow, props]);

  // Ctrl+drag on empty canvas = rubber-band multi-select (screen-space hit test — no react-flow
  // selection dependency). Ctrl held ⇒ we stop the pane's pointerdown so react-flow doesn't pan.
  const [marquee, setMarquee] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const marqueeRef = useRef(marquee);
  marqueeRef.current = marquee;
  const onFramePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.ctrlKey || event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest(".react-flow__node, .react-flow__edge, .react-flow__controls, .multiselect-bar, button, .canvas-legend-toggle, input, select, .react-flow__handle")) return;
    event.stopPropagation();
    setMarquee({ sx: event.clientX, sy: event.clientY, cx: event.clientX, cy: event.clientY });
  }, []);
  useEffect(() => {
    if (!marquee) return undefined;
    const move = (e: PointerEvent) => setMarquee((m) => (m ? { ...m, cx: e.clientX, cy: e.clientY } : m));
    const up = () => {
      const m = marqueeRef.current;
      setMarquee(null);
      if (!m) return;
      const left = Math.min(m.sx, m.cx), right = Math.max(m.sx, m.cx), top = Math.min(m.sy, m.cy), bottom = Math.max(m.sy, m.cy);
      if (right - left < 4 && bottom - top < 4) return;
      const ids: string[] = [];
      frameRef.current?.querySelectorAll(".react-flow__node").forEach((el) => {
        const id = el.getAttribute("data-id");
        if (!id || id.startsWith("cloud:")) return;
        const b = el.getBoundingClientRect();
        const x = b.left + b.width / 2, y = b.top + b.height / 2;
        if (x >= left && x <= right && y >= top && y <= bottom) ids.push(id);
      });
      setSelectedIds(new Set(ids));
      if (ids.length === 1) props.onNodeClick(ids[0]!);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [marquee, props.onNodeClick]);
  const marqueeBox = marquee && frameRef.current ? (() => {
    const r = frameRef.current.getBoundingClientRect();
    return { left: Math.min(marquee.sx, marquee.cx) - r.left, top: Math.min(marquee.sy, marquee.cy) - r.top, width: Math.abs(marquee.cx - marquee.sx), height: Math.abs(marquee.cy - marquee.sy) };
  })() : null;

  return (
    <section className="canvas-shell flow-canvas-shell" aria-label="Graph editor">
      <div ref={frameRef} className="flow-canvas-frame" role="application" aria-label="Editable causal graph" onDoubleClick={onCanvasDoubleClick} onPointerDownCapture={onFramePointerDown}>
        {marqueeBox && <div className="canvas-marquee" style={{ left: marqueeBox.left, top: marqueeBox.top, width: marqueeBox.width, height: marqueeBox.height }} />}
        {props.showProvenance && (
          <div className="provenance-legend" aria-label="Provenance">
            <span className="prov-legend-group">nodes</span>
            <span>
              <svg className="prov-nodemark" viewBox="-11 -11 22 22" aria-hidden="true"><circle r="9" fill="#1f8a6d" /><g><rect x="-5" y="-4.5" width="10" height="9" rx="1.2" fill="none" stroke="#fff" strokeWidth="1.1" /><line x1="-5" y1="-0.5" x2="5" y2="-0.5" stroke="#fff" strokeWidth="0.9" /><line x1="0" y1="-4.5" x2="0" y2="4.5" stroke="#fff" strokeWidth="0.9" /></g></svg>
              data-derived
            </span>
            <span>
              <svg className="prov-nodemark" viewBox="-11 -11 22 22" aria-hidden="true"><circle r="9" fill="#c08a2e" /><text x="0" y="4" textAnchor="middle" fontSize="13" fontStyle="italic" fontWeight="700" fill="#fff">&fnof;</text></svg>
              model-defined
            </span>
            <span className="prov-legend-sep" aria-hidden="true" />
            <span className="prov-legend-group">edges</span>
            <span><i className="prov-swatch prov-fitted" />fitted 📌</span>
            <span><i className="prov-swatch prov-authored" />authored ✎</span>
            <span><i className="prov-swatch prov-not-learned" />not learned</span>
          </div>
        )}
        <ReactFlow<AnyFlowNode, FlowGraphEdge>
          className={`graph-canvas flow-graph-canvas ${denseEdges ? "dense-edges" : ""} ${props.showProvenance ? "show-provenance" : ""}`}
          nodes={allNodes}
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
          selectionKeyCode={null}
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
          <FlowCopulaCloudLinks layout={cloudLayout} nodesById={liveNodesById} />
          <FlowGraphArrowLayer edges={computedEdges} />
          <FlowModulationLayer modulations={props.modulations} edges={computedEdges} nodesById={liveNodesById} />
          <FlowCopulaLayer couplings={props.copulaCouplings} nodesById={liveNodesById} onEdit={props.onOpenJointLab} onSelect={props.onSelectCoupling} selectedId={props.selection?.kind === "coupling" ? props.selection.id : null} interactive={props.tool === "select"} />
        </ReactFlow>
        {selectedIds.size >= 2 && (
          <MultiSelectBar
            count={selectedIds.size}
            wireArmed={wireArmed}
            onWire={() => setWireArmed(true)}
            onAdjust={() => { props.onAdjustMany?.([...selectedRef.current]); clearMulti(); }}
            onCouple={() => { props.onCoupleMany?.([...selectedRef.current]); clearMulti(); }}
            onDelete={() => { props.onDeleteMany?.([...selectedRef.current]); clearMulti(); }}
            onClear={clearMulti}
          />
        )}
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
  const { node, selected, edgeSource, ancestor, changed, value, state, summary, candidateInstrument, showNoise, showProvenance, provenance, noiseVerdict, onNodeClick, onNoiseClick } = props.data;
  const showInstrumentHint = candidateInstrument && !node.roles.instrument;
  const variable = normalizeVariableModel(node.variable);
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
    onNodeClick(node.id, event);
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
          <g
            className={`noise-satellite${noiseVerdict ? ` resid-${noiseVerdict} clickable` : ""}`}
            onClick={noiseVerdict ? (event) => { event.stopPropagation(); onNoiseClick?.(node.id); } : undefined}
          >
            {noiseVerdict && <circle className="noise-hit" cx={-37} cy={-30} r={12} />}
            <title>{noiseVerdict
              ? `Estimated disturbance ε for this fit. Residual-independence test (ε ⊥ parents): ${noiseVerdict === "ok" ? "INDEPENDENT ✓ — the exogenous-noise (causal-sufficiency) assumption holds." : noiseVerdict === "weak" ? "BORDERLINE — mild dependence; the additive-noise fit is approximate." : "VIOLATED ⚠ — ε depends on the parents; suspect an unmeasured confounder or a mis-specified form."} Select the node for the full RESIT diagnostics.`
              : "Implicit disturbance (U) — every variable has one: all the unmodeled causes that make it stochastic. DAGs conventionally omit them, assuming they're independent (the Markovian / causal-sufficiency assumption); a shared one would be latent confounding. Fit a continuous data node to test this."}</title>
            <line x1={-29} y1={-23} x2={-16} y2={-14} />
            {noiseVerdict === "weak" || noiseVerdict === "violated" ? (
              // A failing residual check reads as a warning ⚠, not a quiet ε.
              <>
                <path className="noise-tri" d="M -37 -38.5 L -30 -25.5 L -44 -25.5 Z" />
                <text className="noise-bang" x={-37} y={-27.5}>!</text>
              </>
            ) : (
              <>
                <circle cx={-37} cy={-30} r={6} />
                <text x={-37} y={-27.5}>&epsilon;</text>
              </>
            )}
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
        {showProvenance && (provenance === "data" || provenance === "authored") && (
          <g className={`prov-node-badge prov-${provenance}`} transform="translate(-30,-30)">
            <title>{provenance === "data"
              ? "Data-derived — this variable's marginal is a real data column."
              : "Model-defined (ex nihilo) — authored from scratch, no data column behind it."}</title>
            <circle r="9" />
            {provenance === "data" ? (
              // a mini data table (rows + a divider) → "from a real column"
              <g className="prov-badge-icon">
                <rect x="-5" y="-4.5" width="10" height="9" rx="1.2" />
                <line x1="-5" y1="-0.5" x2="5" y2="-0.5" />
                <line x1="0" y1="-4.5" x2="0" y2="4.5" />
              </g>
            ) : (
              // an ƒ → "defined by a formula/model"
              <text className="prov-badge-glyph" x="0" y="3.4">&fnof;</text>
            )}
          </g>
        )}
        {node.roles.adjusted && <rect className="adjusted-ring" x="-27" y="-27" width="54" height="54" rx="6" />}
        {node.roles.selected && <path className="selected-mark" d="M -20 24 L 0 34 L 20 24" />}
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

// Dotted "latent projection" links from a copula-block cloud NODE down to each coupled covariate
// (U → Cᵢ), plus a moderator of a non-simplified edge feeding INTO the cloud. The cloud centre matches
// the FlowCopulaCloudNode's position (centroid-x of the coupled nodes, min-y − 100). The inter-node
// coupling itself is the dashed τ arc drawn by FlowCopulaLayer.
function FlowCopulaCloudLinks({ layout, nodesById }: { layout: Array<{ cloud: JointSourceCloud; center: { x: number; y: number } }>; nodesById: Map<string, GraphNode> }) {
  if (!layout || layout.length === 0) return null;
  return (
    <ViewportPortal>
      <svg className="copula-cloud-links" aria-hidden="true">
        {layout.map(({ cloud, center }) => {
          const coupled = cloud.nodeIds.map((id) => nodesById.get(id)).filter((n): n is GraphNode => Boolean(n));
          if (coupled.length === 0) return null;
          return (
            <g key={cloud.id}>
              {coupled.map((n) => { const p = nodeBoundaryPoint(n, center, 6, { includeDistribution: false }); return <line key={`c-${n.id}`} className="copula-cloud-link" x1={center.x} y1={center.y + 30} x2={p.x} y2={p.y} />; })}
              {cloud.moderatorIds.map((mid) => { const m = nodesById.get(mid); if (!m) return null; const p = nodeBoundaryPoint(m, center, 6, { includeDistribution: false }); return <line key={`m-${mid}`} className="copula-cloud-mod" x1={p.x} y1={p.y} x2={center.x} y2={center.y + 14} />; })}
            </g>
          );
        })}
      </svg>
    </ViewportPortal>
  );
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
