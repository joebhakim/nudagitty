import { RefreshCw } from "lucide-react";
import { findNode } from "@nudagitty/core";
import type { GraphDocument, SimulationResult } from "@nudagitty/core";
import { clamp, formatValue } from "../shared/formatting";
import { PendingChip } from "../controls";
import { HighlightNames } from "../shared/NodeNames";
import { analyticSummaryLabel, designModulesForMode, inferenceModeLabel } from "../compute/format";
import { shortNodeLabel } from "../compute/relationSummary";
import { MODE_LABELS } from "../shared/workbench";
import type { WorkbenchMode } from "../shared/workbench";
import {
  EMPIRICAL_DRAW_DEFAULT,
  EMPIRICAL_DRAW_MAX,
  EMPIRICAL_DRAW_MIN,
  EMPIRICAL_DRAW_STEP,
  ROADMAP_TODOS
} from "../app/constants";

export function ScenarioPanel(props: {
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

export function AnalysisSampleBanner(props: {
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

export function SimulationDiagnosticsPanel(props: {
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

export function DrawCountControl(props: { value: number; onChange: (sampleSize: number) => void }) {
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

export function ConditioningMethodPanel({ simulation }: { simulation: SimulationResult }) {
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

export function DesignModulePanel({ mode }: { mode: WorkbenchMode }) {
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

export function RoadmapTodoPanel() {
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

function designModuleScopeLabel(mode: WorkbenchMode): string {
  if (mode === "basic") return "Small set for quick DAG explanations and common internet-argument traps.";
  return "All tools are visible, including TODO modules that still need data and code plumbing.";
}

export function clampDrawCount(value: number): number {
  if (!Number.isFinite(value)) return EMPIRICAL_DRAW_DEFAULT;
  const stepped = Math.round(value / EMPIRICAL_DRAW_STEP) * EMPIRICAL_DRAW_STEP;
  return Math.min(EMPIRICAL_DRAW_MAX, Math.max(EMPIRICAL_DRAW_MIN, stepped));
}

function simulationBlocked(result: SimulationResult): boolean {
  return result.diagnostics.some((message) => message.startsWith("Simulation disabled") || message.startsWith("Simulation is only enabled"));
}
