import { useEffect, useMemo, useRef } from "react";
import { useWorkbenchStore } from "../store/workbenchStore";
import { candidateInstruments, classifyConditioned, nodeGenerates, nodeProvenance, normalizeEdgeMechanism, normalizeNodeMechanism, normalizeVariableModel, pinKeys, residualDiagnostics } from "@nudagitty/core";
import type { ResidualDiagnostic } from "@nudagitty/core";
import type {
  AnalysisOperation,
  EdgeMechanism,
  GraphDocument,
  GraphEdge,
  ImposedEffect,
  GraphNode,
  NodeCombinerKind,
  NodeDistribution,
  NodeInteraction,
  NodeMechanism,
  NodeRoleFlags,
  SimulationResult,
  SimulationSelectionCondition,
  VariableModel
} from "@nudagitty/core";
import type { SimulationDerivedCache } from "../app/types";
import { NODE_COMBINERS, PLANNED_CAUSAL_MODULES, VARIABLE_TYPES } from "../app/constants";
import type { ScatterPair } from "../shared/pairs";
import type { WorkbenchMode } from "../shared/workbench";
import { OPERATION_BLURBS, OPERATION_LABELS, deriveOperation } from "../shared/operations";
import { clamp, coerceBinary, formatInputNumber, formatSignedValue, formatValue } from "../shared/formatting";
import { badControlWarning, describeEstimand } from "../outputs/estimand";
import type { ImposeSpec } from "./ImposedEffectPad";
import { FamilyGuardrail } from "./FamilyGuardrail";
import { EstimandFormula, NodeName } from "../outputs/EstimandFormula";
import { nodeDisplayName, nodeOutputLabel } from "../compute/format";
import { analyticDistributionLabel, defaultDistribution, valueTypeFromDistribution, valueTypeLabel } from "../compute/distributionPlot";
import { conditioningSliderBounds, conditioningSliderStep, roundToStep } from "../compute/conditioning";
import { Checkbox, InfoDot, NumberField, RoleToggle, TactileNumberField } from "../controls";
import { EquationBlock } from "./EquationBlock";
import { EdgeEditor, EdgePanel } from "./EdgeEditor";
import { DistributionEditor } from "./DistributionEditor";
import { AdjustmentMethodEditor } from "./adjustment";

export function HardDoEditor(props: {
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

export function ConditioningEditor(props: {
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

export function discreteConditionOptions(variable: VariableModel): Array<{ value: number; label: string }> {
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

export function selectedDiscreteConditionValues(
  condition: SimulationSelectionCondition | undefined,
  options: Array<{ value: number; label: string }>
): Set<number> {
  if (!condition) return new Set(options.map((option) => option.value));
  if (condition.operator === "one_of") return new Set(condition.values ?? [condition.value]);
  return new Set(options.filter((option) => conditionAllowsValue(condition, option.value)).map((option) => option.value));
}

export function conditionAllowsValue(condition: SimulationSelectionCondition, value: number): boolean {
  if (condition.operator === "one_of") return (condition.values ?? [condition.value]).some((candidate) => Math.abs(candidate - value) <= 1e-9);
  if (condition.operator === "at_least") return value >= condition.value;
  if (condition.operator === "at_most") return value <= condition.value;
  const upper = condition.upper ?? condition.value;
  return value >= condition.value && value <= upper;
}

export function SelectionEditor(props: {
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
  onImposedEffect: (patch: Partial<ImposedEffect>) => void;
  onImposeEffect: (spec: ImposeSpec) => void;
  onClearImposedEffect: () => void;
  onChangeFamily: (nodeId: string, kind: VariableModel["valueType"]) => void;
  onAddIndicator: (nodeId: string) => void;
  onAuthorNumber: (key: string) => void;
  onSelectEdge: (edgeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onSetDataMode: (nodeId: string, mode: "read" | "fit" | "author") => void;
  onPinNumber: (key: string) => void;
  onUnpinKey: (key: string) => void;
  onUnlearnNumber: (key: string) => void;
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
    onSetDataMode={props.onSetDataMode}
    onCoefficient={props.onCoefficient}
    onPinNumber={props.onPinNumber}
    onUnpinKey={props.onUnpinKey}
    onUnlearnNumber={props.onUnlearnNumber}
    onSelectEdge={props.onSelectEdge}
    onChangeFamily={props.onChangeFamily}
    onAddIndicator={props.onAddIndicator}
  />;
  if (props.edge) return <EdgeEditor
    edge={props.edge}
    simulation={props.simulation}
    document={props.document}
    onCoefficient={props.onCoefficient}
    onEnabled={props.onEdgeEnabled}
    onMechanism={props.onEdgeMechanism}
    onDelete={props.onDeleteEdge}
    onImposedEffect={props.onImposedEffect}
    onImposeEffect={props.onImposeEffect}
    onClearImposedEffect={props.onClearImposedEffect}
    onChangeFamily={props.onChangeFamily}
    onAuthorNumber={props.onAuthorNumber}
  />;
  return (
    <div className="selection-empty-state">
      <p>Select a node or edge for editing.</p>
    </div>
  );
}

export function BasicSelectionEditor(props: Parameters<typeof SelectionEditor>[0]) {
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

export function BasicCausalGuide() {
  return (
    <div className="selection-empty-state basic-causal-guide">
      <strong>Try the flip</strong>
      <p>Click the common cause in the graph, then adjust for it. Watch the result change on the right.</p>
    </div>
  );
}

export function BasicEdgeEditor(props: Parameters<typeof SelectionEditor>[0] & { edge: GraphEdge }) {
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

type DepState = "not-learned" | "fitted" | "authored";
function depStateOf(document: GraphDocument, keyStr: string): DepState {
  if (document.metadata.pins.includes(keyStr)) return "fitted";
  if (document.metadata.authored.includes(keyStr)) return "authored";
  return "not-learned";
}

// A per-number dependence control for a DATA node: not-learned (∅, structural only) / fitted (📌, from data) /
// authored (✎, you set it). For a from-scratch node numbers are always authored — a static chip.
function DepControl(props: {
  state: DepState; keyStr: string; isData: boolean;
  onFit: (k: string) => void; onAuthor: (k: string) => void; onUnlearn: (k: string) => void;
}) {
  if (!props.isData) return <span className="prov-chip authored" title="authored value">✎</span>;
  return (
    <div className="dep-control" role="group" aria-label="dependence provenance">
      <button type="button" className={props.state === "not-learned" ? "active" : ""} title="not learned — structural only, no number" onClick={() => props.onUnlearn(props.keyStr)}>∅</button>
      <button type="button" className={props.state === "fitted" ? "active" : ""} title="fitted from data" onClick={() => props.onFit(props.keyStr)}>📌</button>
      <button type="button" className={props.state === "authored" ? "active" : ""} title="authored — you set this number" onClick={() => props.onAuthor(props.keyStr)}>✎</button>
    </div>
  );
}

// RESIT (Peters et al. 2014) residual diagnostics on a fitted continuous node. Distance correlation ≡ HSIC
// (Sejdinovic 2013), significance by permutation. Three tests: exogeneity ε⊥X, homoskedasticity via
// dCor(ε²,X), and residual non-Gaussianity (Jarque–Bera). Refutations, not confirmations.
const TWO_PART_FAMILY_TIP =
  "Two-part (semicontinuous): the outcome is a participation gate P(Y>0)=σ(η_gate) times a positive amount exp(η+ε). The fit learns them separately — logistic on 1(Y>0) for the gate, log-linear on Y>0 for the amount — so the marginal can reproduce a spike at $0 plus a skewed positive tail. A coefficient on the amount is on the LOG scale (e.g. +0.03 ≈ +3% among workers), NOT dollars; the dollar effect is the do-contrast in the output.";
const TWO_PART_RESID_TIP =
  "Two-part diagnostics. The scatter + exogeneity/homoskedasticity/Gaussian tests are the INTENSIVE margin (amount | Y>0), on the LOG scale it is fit on — 'fitted' is η = log-earnings, so a $2M earner sits at the far right. The participation-gate row is the EXTENSIVE margin, P(Y>0). The log-normal amount is retransformation-corrected so its mean matches the data; the tests still flag that log-normal earnings on dollar predictors is misspecified (the heavy tail).";

// Marginal distribution of a node's simulated samples: a labelled histogram that shows a point mass
// at 0 (the two-part zero spike) as a distinct bar and clips the heavy tail at ~p98 so the body stays
// legible (the clipped max is noted). General — renders for any node with samples.
function MarginalPlot({ samples, unit }: { samples: number[]; unit?: string }) {
  const n = samples.length;
  if (n < 2) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const max = sorted[n - 1]!;
  const zeros = samples.reduce((c, x) => c + (x === 0 ? 1 : 0), 0);
  const zeroFrac = zeros / n;
  const spike = zeroFrac >= 0.01;
  const body = spike ? samples.filter((x) => x !== 0) : samples;
  const bs = [...body].sort((a, b) => a - b);
  const bAt = (p: number) => bs.length ? bs[Math.min(bs.length - 1, Math.max(0, Math.round(p * (bs.length - 1))))]! : 0;
  const lo = spike ? (bs[0] ?? 0) : bAt(0.01);
  const hi = Math.max(lo + 1e-9, bAt(0.98));
  const BINS = 28;
  const w = (hi - lo) / BINS || 1;
  const counts = new Array(BINS).fill(0);
  let tail = 0;
  for (const x of body) {
    if (x > hi) { tail += 1; continue; }
    let b = Math.floor((x - lo) / w);
    if (b < 0) b = 0; else if (b >= BINS) b = BINS - 1;
    counts[b] += 1;
  }
  const maxFrac = Math.max(zeroFrac, ...counts.map((c) => c / n), 1e-9);
  const W = 250, H = 122, mL = 30, mR = 8, mT = 8, mB = 26;
  const plotBot = H - mB, plotTop = mT, plotHt = plotBot - plotTop;
  const spikeW = spike ? 16 : 0, gap = spike ? 5 : 0;
  const hx0 = mL + spikeW + gap, hw = W - mR - hx0, bw = hw / BINS;
  const yOf = (frac: number) => plotBot - (frac / maxFrac) * plotHt;
  const fmt = (v: number) => { const a = Math.abs(v); return a >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : a >= 1e3 ? `${Math.round(v / 1e3)}k` : a >= 10 ? v.toFixed(0) : v.toFixed(1); };
  return (
    <svg className="marginal-plot" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="marginal distribution">
      <line x1={mL} y1={plotTop} x2={mL} y2={plotBot} className="resid-axis" />
      <line x1={mL} y1={plotBot} x2={W - mR} y2={plotBot} className="resid-axis" />
      {spike && (
        <g>
          <rect x={mL + 1} y={yOf(zeroFrac)} width={spikeW - 2} height={Math.max(0, plotBot - yOf(zeroFrac))} className="marg-spike" />
          <text x={mL + spikeW / 2} y={plotBot + 9} className="resid-tick" textAnchor="middle">0</text>
          <text x={mL + spikeW / 2} y={Math.max(plotTop + 6, yOf(zeroFrac) - 2)} className="resid-tick" textAnchor="middle">{Math.round(zeroFrac * 100)}%</text>
        </g>
      )}
      {counts.map((c, i) => {
        const y = yOf(c / n);
        return <rect key={i} x={hx0 + i * bw} y={y} width={Math.max(0.5, bw - 0.6)} height={Math.max(0, plotBot - y)} className="marg-bar" />;
      })}
      <text x={hx0} y={plotBot + 9} className="resid-tick">{fmt(lo)}</text>
      <text x={W - mR} y={plotBot + 9} className="resid-tick" textAnchor="end">{fmt(hi)}</text>
      <text x={hx0 + hw / 2} y={H - 3} className="resid-axlabel" textAnchor="middle">value{unit ? ` (${unit})` : ""}{tail > 0 ? `  ·  tail→${fmt(max)}` : ""}</text>
      <text transform={`translate(8 ${plotTop + plotHt / 2}) rotate(-90)`} className="resid-axlabel" textAnchor="middle">fraction</text>
    </svg>
  );
}

function ResidualCheck({ d }: { d: ResidualDiagnostic }) {
  if (!d.available) return null;
  const pFloor = 1 / (d.perms + 1);
  const fmtP = (p: number) => (p <= pFloor + 1e-9 ? `<${pFloor.toFixed(3)}` : `=${p.toFixed(3)}`);
  const pct = (v: number) => `${Math.min(100, Math.round((v / 0.35) * 100))}%`;
  const flagged = (p: number) => p < 0.05;
  const verdictLabel = d.verdict === "ok" ? "exogenous ✓" : d.verdict === "weak" ? "borderline" : "endogenous ⚠";
  const lead = d.verdict === "ok"
    ? <>Residuals look <b>independent</b> of the parents (dCor {d.independence.dcor.toFixed(2)}, p&nbsp;{fmtP(d.independence.pValue)}) — the additive-noise assumption ε ⊥ X holds, as far as this test can tell.</>
    : d.verdict === "weak"
      ? <>Residuals show <b>borderline dependence</b> on the parents (dCor {d.independence.dcor.toFixed(2)}, p&nbsp;{fmtP(d.independence.pValue)}); worst&nbsp;= <b>{d.worst?.label}</b>. The additive-noise fit is a rough approximation.</>
      : <>Residuals <b>depend on the parents</b> (dCor {d.independence.dcor.toFixed(2)}, p&nbsp;{fmtP(d.independence.pValue)}); worst&nbsp;= <b>{d.worst?.label}</b>. The exogenous-noise assumption <b>ε ⊥ X looks violated</b> — enrich the functional form, or suspect an unmeasured confounder.</>;
  // Plot area with margins for axis labels (mL left for the y-axis, mB bottom for the x-axis).
  const W = 250, H = 120, mL = 34, mR = 8, mT = 6, mB = 24;
  const plotW = W - mL - mR, plotBot = H - mB, midY = mT + (plotBot - mT) / 2;
  const fx = d.points.map((p) => p.fitted);
  const fmin = Math.min(...fx), fmax = Math.max(...fx);
  const rabs = Math.max(1e-9, ...d.points.map((p) => Math.abs(p.residual)));
  const sx = (f: number) => mL + ((f - fmin) / Math.max(1e-9, fmax - fmin)) * plotW;
  const sy = (r: number) => midY - (r / rabs) * ((plotBot - mT) / 2 - 2);
  // Axis ticks: on the log scale, show the DOLLAR equivalent (exp η) so the heavy tail is legible.
  const money = (v: number) => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}k` : `$${Math.round(v)}`;
  const axFmt = (v: number) => d.scale === "log" ? money(Math.exp(v)) : d.scale === "logit" ? (1 / (1 + Math.exp(-v))).toFixed(2) : (Math.abs(v) >= 1000 ? money(v) : v.toFixed(1));
  const xLabel = d.scale === "log" ? "fitted earnings (log scale)" : d.scale === "logit" ? "fitted P (logit scale)" : "fitted";
  return (
    <div className={`residual-check verdict-${d.verdict}`}>
      <div className="residual-head">
        <strong>Residual check{d.gate && <InfoDot tip={TWO_PART_RESID_TIP} href="/effects.html#honesty" />}</strong>
        <span className="residual-verdict">{verdictLabel}</span>
      </div>
      <p className="muted">{lead}</p>
      {d.identifiabilityWarning && (
        <p className="residual-identif">⚠ Linear fit + roughly <b>Gaussian</b> residuals — the causal direction is <b>not identifiable</b> here (both directions fit equally). This test only has power under nonlinearity or non-Gaussian noise.</p>
      )}
      <div className="residual-tests">
        <div className={`rtest ${flagged(d.independence.pValue) ? "fail" : "pass"}`}>
          <span className="rt-name">exogeneity (ε ⊥ X)</span>
          <span className="rt-stat">dCor {d.independence.dcor.toFixed(2)}, p&nbsp;{fmtP(d.independence.pValue)}</span>
        </div>
        <div className={`rtest ${flagged(d.heteroskedasticity.pValue) ? "fail" : "pass"}`}>
          <span className="rt-name">homoskedasticity (ε² ⊥ X)</span>
          <span className="rt-stat">dCor {d.heteroskedasticity.dcor.toFixed(2)}, p&nbsp;{fmtP(d.heteroskedasticity.pValue)}</span>
        </div>
        <div className={`rtest ${flagged(d.normality.pValue) ? "warn" : "pass"}`}>
          <span className="rt-name">Gaussian noise (Jarque–Bera)</span>
          <span className="rt-stat">skew {d.normality.skewness.toFixed(1)}, exk {d.normality.excessKurtosis.toFixed(1)}, p&nbsp;{d.normality.pValue < 0.001 ? "<0.001" : `=${d.normality.pValue.toFixed(3)}`}</span>
        </div>
        {d.gate && (
          <div className={`rtest ${flagged(d.gate.independence.pValue) ? "fail" : "pass"}`}>
            <span className="rt-name">participation gate (P(Y&gt;0))</span>
            <span className="rt-stat">{(d.gate.rate * 100).toFixed(0)}% obs / {(d.gate.predictedRate * 100).toFixed(0)}% pred, ε⊥X dCor {d.gate.independence.dcor.toFixed(2)}, p&nbsp;{fmtP(d.gate.independence.pValue)}</span>
          </div>
        )}
      </div>
      <svg className="residual-scatter" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`residuals vs ${xLabel}`}>
        {/* axes */}
        <line x1={mL} y1={mT} x2={mL} y2={plotBot} className="resid-axis" />
        <line x1={mL} y1={plotBot} x2={W - mR} y2={plotBot} className="resid-axis" />
        <line x1={mL} y1={midY} x2={W - mR} y2={midY} className="resid-zero" />
        {/* x ticks (min / max) — dollars on the log scale so a $2M outlier is legible */}
        <text x={mL} y={plotBot + 10} className="resid-tick">{axFmt(fmin)}</text>
        <text x={W - mR} y={plotBot + 10} className="resid-tick" textAnchor="end">{axFmt(fmax)}</text>
        <text x={mL + plotW / 2} y={H - 2} className="resid-axlabel" textAnchor="middle">{xLabel}</text>
        {/* y ticks (±max residual) + label */}
        <text x={mL - 3} y={mT + 6} className="resid-tick" textAnchor="end">+{rabs.toFixed(1)}</text>
        <text x={mL - 3} y={plotBot} className="resid-tick" textAnchor="end">−{rabs.toFixed(1)}</text>
        <text transform={`translate(9 ${midY}) rotate(-90)`} className="resid-axlabel" textAnchor="middle">residual</text>
        {d.points.map((p, i) => <circle key={i} cx={sx(p.fitted)} cy={sy(p.residual)} r={1.4} className="resid-dot" />)}
      </svg>
      <div className="residual-bars">
        {d.parents.map((p) => (
          <div className="residual-bar-row" key={p.nodeId}>
            <span className="rb-label">{p.label}</span>
            <span className="rb-track"><i style={{ width: pct(p.distanceCorr) }} /></span>
            <span className="rb-val">{p.distanceCorr.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <p className="muted residual-foot">{d.scale !== "identity" && <><b>Residuals on the {d.scale} scale</b> (the family's link). </>}{d.gate && <>Two-part: the scatter/tests below are the <b>intensive</b> margin (amount | Y&gt;0); the gate row above is the <b>extensive</b> margin (whether Y&gt;0). </>}Distance correlation (≡ HSIC), permutation p over {d.perms} shuffles, n&nbsp;=&nbsp;{d.n}. OLS forces residuals <i>linearly</i> orthogonal to X, so this <b>nonlinear</b> test (RESIT) is what still catches a mis-specified mechanism.</p>
    </div>
  );
}

export function VariableEditor(props: {
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
  onSetDataMode: (nodeId: string, mode: "read" | "fit" | "author") => void;
  onCoefficient: (edge: GraphEdge, coefficient: number) => void;
  onPinNumber: (key: string) => void;
  onUnpinKey: (key: string) => void;
  onUnlearnNumber: (key: string) => void;
  onSelectEdge: (edgeId: string) => void;
  onChangeFamily: (nodeId: string, kind: VariableModel["valueType"]) => void;
  onAddIndicator: (nodeId: string) => void;
}) {
  const node = props.node;
  const variable = normalizeVariableModel(node.variable);
  const mechanism = normalizeNodeMechanism(props.document.simulation.nodes[node.id]);
  const state = props.simulation.nodeStates[node.id];
  const parentIds = props.document.graph.edges.filter((edge) => edge.kind === "directed" && edge.target === node.id).map((edge) => edge.source);
  const isRoot = parentIds.length === 0;
  // The instrument role is contextual: offerable only on a structural candidate (or to un-assign one).
  const isInstrumentCandidate = useMemo(() => candidateInstruments(props.document.graph).includes(node.id), [props.document.graph, node.id]);
  const residual = useMemo(() => residualDiagnostics(props.document, node.id), [props.document, node.id]);
  // Clicking a node's ε satellite requests a jump to its residual-test panel (nonce re-fires on re-click).
  const residualRef = useRef<HTMLDivElement | null>(null);
  const focusResidual = useWorkbenchStore((state) => state.focusResidual);
  useEffect(() => {
    if (focusResidual?.id !== node.id || !residual.available || !residualRef.current) return;
    const el = residualRef.current;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("residual-flash");
    const timer = setTimeout(() => el.classList.remove("residual-flash"), 1500);
    return () => clearTimeout(timer);
  }, [focusResidual?.nonce, focusResidual?.id, node.id, residual.available]);
  const updateVariable = (patch: Partial<VariableModel>) => props.onVariableChange(node.id, normalizeVariableModel({ ...variable, ...patch }));
  // R5: the response FAMILY is directly selectable and canonical (valueType is its synced mirror).
  // Picking a family sets the family's canonical link (non-root) or root distribution so it generates
  // correctly — no more picking a distribution and hoping the inferred type agrees.
  const REALIZED_FAMILIES = new Set<VariableModel["valueType"]>(["continuous", "binary", "count", "ordinal", "categorical", "positive", "semicontinuous", "proportion"]);
  // Family + its canonical link move together, in ONE commit — see applyFamilyChange. Sharing that path with
  // the guardrail's one-click fix is the point: a picker that set the type but not the link is precisely the
  // silent mismatch the guardrail exists to catch.
  const changeFamily = (kind: VariableModel["valueType"]) => props.onChangeFamily(node.id, kind);
  // The root-distribution picker only offers distributions that match the family, and picking one
  // syncs the family back — so the two pickers inform each other (choose poisson ⇒ type becomes count).
  const FAMILY_DISTRIBUTIONS: Partial<Record<VariableModel["valueType"], NodeDistribution["kind"][]>> = {
    continuous: ["normal", "lognormal", "uniform", "laplace", "student_t", "constant"],
    binary: ["bernoulli"],
    count: ["poisson"],
    positive: ["gamma", "exponential", "lognormal"],
    proportion: ["beta"],
    categorical: ["categorical"],
    ordinal: ["categorical"]
  };
  const onRootDistributionChange = (distribution: NodeDistribution) => {
    props.onMechanism(node.id, { distribution });
    const family = distribution.kind === "categorical"
      ? (variable.valueType === "ordinal" ? "ordinal" : "categorical")
      : valueTypeFromDistribution(distribution, variable.valueType);
    if (family !== variable.valueType) {
      const patch: Partial<VariableModel> = { valueType: family };
      if ((family === "categorical" || family === "ordinal") && variable.categories.length < 2) patch.categories = ["level 1", "level 2", "level 3"];
      updateVariable(patch);
    }
  };

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
        <FamilyGuardrail
          document={props.document}
          nodeId={node.id}
          samples={state?.empirical.samples}
          onChangeFamily={props.onChangeFamily}
          onAddIndicator={props.onAddIndicator}
        />
        {(() => {
          const isData = nodeProvenance(props.document, node.id) === "data"; // marginal comes from the data column
          const generates = nodeGenerates(props.document, node.id);
          const parentEdges = props.document.graph.edges
            .filter((e) => e.target === node.id && e.kind === "directed" && normalizeEdgeMechanism(props.document.simulation.edges[e.id]).kind !== "table_lookup")
            .map((e) => {
              const em = normalizeEdgeMechanism(props.document.simulation.edges[e.id]);
              const parent = props.document.graph.nodes.find((n) => n.id === e.source);
              return { edge: e, label: parent?.label ?? e.source, coef: em.kind === "linear" ? em.coefficient : null, kind: em.kind, key: pinKeys.edge(e.id) };
            });
          const isBinary = variable.valueType === "binary";
          const dep = (k: string) => depStateOf(props.document, k);
          const depProps = { isData, onFit: props.onPinNumber, onAuthor: props.onUnpinKey, onUnlearn: props.onUnlearnNumber };
          const learnedKeys = [pinKeys.intercept(node.id), ...(isBinary ? [] : [pinKeys.noise(node.id)]), ...parentEdges.map((p) => p.key)];
          const allFitted = learnedKeys.every((k) => dep(k) === "fitted");
          const interceptState = dep(pinKeys.intercept(node.id));
          const noiseState = dep(pinKeys.noise(node.id));
          return (
            <div className="selection-editor-block generation-block">
              <div className="generation-head"><strong>How it&rsquo;s generated</strong></div>
              {/* MARGINAL — terse; the full caveat lives in the tooltip. */}
              {isData && (() => {
                const marginalFromData = !generates || isBinary;
                return marginalFromData ? (
                  <div className="marginal-row" title={`${node.label}'s marginal is the observed data column${generates ? " — its rate is preserved by the fit" : ", not authored"}.`}>
                    <span className="prov-badge data">from data</span>
                    <span className="muted">marginal = observed column</span>
                  </div>
                ) : (
                  <div className="marginal-row" title={`${node.label} is generated from the fit — its mean matches the data, but the full marginal shape is approximate (exact-shape preservation is planned).`}>
                    <span className="prov-badge modeled">modeled</span>
                    <span className="muted">mean matches data · shape approx.</span>
                  </div>
                );
              })()}
              {(() => {
                const samples = props.simulation.nodeStates[node.id]?.empirical.samples ?? [];
                if (samples.length < 2) return null;
                return (
                  <details className="marginal-dist">
                    <summary>marginal distribution</summary>
                    <MarginalPlot samples={samples} unit={variable.unit} />
                  </details>
                );
              })()}
              {!isRoot && (
                <label className="field">
                  <span>{isData ? "fit family (link)" : "type"}{variable.valueType === "semicontinuous" && <InfoDot tip={TWO_PART_FAMILY_TIP} href="/effects.html#two-margins" />}</span>
                  <select value={variable.valueType} onChange={(event) => changeFamily(event.target.value as VariableModel["valueType"])}>
                    {VARIABLE_TYPES.map(([kind, label]) => (<option value={kind} key={kind} disabled={!REALIZED_FAMILIES.has(kind) && kind !== variable.valueType}>{label}{REALIZED_FAMILIES.has(kind) ? "" : " (planned)"}</option>))}
                  </select>
                </label>
              )}
              {isRoot ? (
                // A root has no parents → no dependence. A data root simply IS its column; a from-scratch root is authored.
                isData ? null : (
                  <DistributionEditor label="distribution" distribution={mechanism.distribution} allowedKinds={FAMILY_DISTRIBUTIONS[variable.valueType]} onChange={onRootDistributionChange} />
                )
              ) : (
                <div className="dependence-block">
                  <div className="dependence-head">
                    <strong>Dependence</strong>
                    {isData && <span className="muted">{generates ? "modeled on parents" : "not learned"}</span>}
                  </div>
                  {isData && !generates && (
                    <p className="muted generation-read">Arrows are <b>structural only</b> — fit (📌) or author (✎) a number to make {node.label} depend on its parents.</p>
                  )}
                  <EquationBlock
                    onSelectEdge={props.onSelectEdge}
                    node={node}
                    document={props.document}
                    mechanism={mechanism}
                    isData={isData}
                    parents={parentEdges}
                    onMechanism={props.onMechanism}
                    onCoefficient={props.onCoefficient}
                    onPinNumber={props.onPinNumber}
                    onUnpinKey={props.onUnpinKey}
                    onUnlearnNumber={props.onUnlearnNumber}
                  />
                  {isData && parentEdges.length > 0 && !allFitted && <button type="button" className="generation-fit" onClick={() => props.onSetDataMode(node.id, "fit")}>Fit all from data →</button>}
                  {generates && <div ref={residualRef}><ResidualCheck d={residual} /></div>}
                </div>
              )}
            </div>
          );
        })()}
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

export function PlannedModuleSet() {
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

export function InteractionEditor(props: {
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

export function ParentSelect(props: { value: string; parentIds: string[]; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>parent</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {props.parentIds.map((id) => <option value={id} key={id}>{id}</option>)}
      </select>
    </label>
  );
}

export function defaultInteraction(kind: NodeInteraction["kind"], parentIds: string[]): NodeInteraction {
  const left = parentIds[0] ?? "";
  const right = parentIds[1] ?? left;
  const id = `interaction-${Math.random().toString(36).slice(2, 9)}`;
  if (kind === "smooth_gated") {
    return { id, kind, source: left, gate: right, coefficient: 1, threshold: 0, steepness: 4 };
  }
  return { id, kind, left, right, coefficient: 1 };
}
