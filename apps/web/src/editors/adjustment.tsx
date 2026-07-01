import { useRef, useState } from "react";
import { normalizeVariableModel } from "@nudagitty/core";
import type { GraphDocument, GraphNode, SimulatedNodeState, SimulationResult, VariableModel } from "@nudagitty/core";
import type { NodeDistributionSummary, PositivityRow, SimulationDerivedCache } from "../app/types";
import type { ScatterPair } from "../shared/pairs";
import { clamp, formatPercent, formatPercentagePoints, formatValue, formatWeightedCount } from "../shared/formatting";
import { isBinaryGraphNode } from "../compute/scatterStats";
import { computeStabilizedIpw } from "../compute/ipw";
import { distributionPlotDomain, histogram } from "../compute/distributionPlot";
import { adjustmentCutStep, defaultQuantileCuts, positivityRows, roundToStep, sanitizeCutpoints } from "../compute/conditioning";

export function AdjustmentMethodEditor(props: {
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

export function StabilizedIpwEditorPanel(props: {
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

export function BinnedAdjustmentEditor(props: {
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

export function PositivityPanel(props: { exposureNode: GraphNode | undefined; exposureValueType: VariableModel["valueType"]; rows: PositivityRow[] }) {
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
