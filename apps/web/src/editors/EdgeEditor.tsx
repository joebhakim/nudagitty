import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { defaultEdgeMechanism, imposableEffect, imposedEffectEdge, normalizeEdgeMechanism } from "@nudagitty/core";
import type { EdgeMechanism, EdgeMechanismKind, GraphDocument, GraphEdge, ImposedEffect, SimulatedNodeState, SimulationResult, VariableModel } from "@nudagitty/core";
import { Checkbox, TactileNumberField } from "../controls";
import { functionGlyphPath, nodeOutputLabel } from "../compute/format";
import { formatSignedValue, formatValue } from "../shared/formatting";
import { SvgAxisName } from "../shared/NodeNames";
import { NodeName } from "../outputs/EstimandFormula";
import { computeEdgeTransfer } from "../charts/edgeTransfer";
import { chartFrame } from "../charts/chartFrame";
import { EDGE_MECHANISMS } from "../app/constants";
import { EffectEdgeFitWarning, ImposeEffectCard, ImposedEffectPad } from "./ImposedEffectPad";
import type { ImposeSpec } from "./ImposedEffectPad";
import { FamilyGuardrail } from "./FamilyGuardrail";

export function EdgeEditor(props: {
  edge: GraphEdge;
  document: GraphDocument;
  simulation: SimulationResult;
  onCoefficient: (edge: GraphEdge, coefficient: number) => void;
  onEnabled: (edge: GraphEdge, enabled: boolean) => void;
  onMechanism: (edge: GraphEdge, patch: Partial<EdgeMechanism>) => void;
  onDelete: (edgeId: string) => void;
  onImposedEffect: (patch: Partial<ImposedEffect>) => void;
  onImposeEffect: (spec: ImposeSpec) => void;
  onClearImposedEffect: () => void;
  onChangeFamily: (nodeId: string, kind: VariableModel["valueType"]) => void;
  onAuthorNumber: (key: string) => void;
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
        {/* When this edge carries an IMPOSED effect, its coefficient is DERIVED from the estimand — so the
            control is the estimand's story (the extensive/intensive split), not the raw number below. */}
        <EffectEdgeFitWarning document={props.document} edge={props.edge} onAuthor={props.onAuthorNumber} />
        {/* On the EFFECT edge only: a positive control whose outcome family cannot generate its own outcome
            is worse than no benchmark at all, so say it before the target is ever typed. */}
        {(imposableEffect(props.document, props.edge.id) || imposedEffectEdge(props.document)?.edgeId === props.edge.id) && (
          <FamilyGuardrail
            document={props.document}
            nodeId={props.edge.target}
            samples={props.simulation.nodeStates[props.edge.target]?.empirical.samples}
            onChangeFamily={props.onChangeFamily}
          />
        )}
        <ImposeEffectCard document={props.document} edgeId={props.edge.id} onImpose={props.onImposeEffect} />
        <ImposedEffectPad document={props.document} edgeId={props.edge.id} onChange={props.onImposedEffect} onClear={props.onClearImposedEffect} />
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

export function EdgePanel(props: {
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

export function EdgeTransferPlot(props: {
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

export function FunctionGlyph({ kind }: { kind: EdgeMechanismKind }) {
  return (
    <svg className="function-glyph" viewBox="0 0 32 20" aria-hidden="true" focusable="false">
      <path className="function-glyph-axis" d="M 3 17 H 29 M 4 18 V 3" />
      <path className="function-glyph-curve" d={functionGlyphPath(kind)} />
    </svg>
  );
}

export function FunctionPicker(props: { label: string; value: EdgeMechanismKind; onOpen: () => void; onChange: (kind: EdgeMechanismKind) => void }) {
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

export function EdgeMechanismFields(props: { edge: GraphEdge; mechanism: EdgeMechanism; onMechanism: (edge: GraphEdge, patch: Partial<EdgeMechanism>) => void }) {
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
export function PointsEditor(props: { points: { x: number; y: number }[]; onChange: (points: { x: number; y: number }[]) => void }) {
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
