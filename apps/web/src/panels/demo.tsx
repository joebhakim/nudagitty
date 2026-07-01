import { EXAMPLES, findNode } from "@nudagitty/core";
import type { GMethodsComparison, GraphModel, SimulationResult } from "@nudagitty/core";
import type { ScatterPoint } from "../charts/CategoryOutcomePlot";
import { PendingChip } from "../controls";
import { formatPercentagePoints, formatSignedValue } from "../shared/formatting";
import { metricTone } from "../compute/format";
import { demoResultHeading, fallbackLedgerRows, relationChangeLabel, resultPendingActive, shortNodeLabel } from "../compute/relationSummary";
import { shouldRenderBinaryAdjustmentOutput } from "../compute/adjustmentOutput";
import { FRONTLINE_EXAMPLE_IDS } from "../app/constants";
import type { ScatterPair } from "../shared/pairs";
import type { BasicComparisonLedgerRow, BasicDemoContext, BasicRelationSummary, BinaryAdjustmentOutput, ResultPendingState, SimulationDerivedCache } from "../app/types";
import type { ComputedCompletedOutput } from "../outputs/modules";
import { ScatterplotPanel } from "./ScatterplotPanel";
import { AdjustedOutputPanel } from "./output";

export function BasicExampleTabs(props: { activeExampleId: string | null; onSelect: (id: string) => void }) {
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

export function DemoResultPanel(props: {
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

export function BasicComparisonLedgerPlot(props: { rows: BasicComparisonLedgerRow[] }) {
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
