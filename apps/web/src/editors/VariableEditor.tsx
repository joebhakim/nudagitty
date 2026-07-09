import { useMemo } from "react";
import { candidateInstruments, classifyConditioned, nodeDataMode, normalizeEdgeMechanism, normalizeNodeMechanism, normalizeVariableModel } from "@nudagitty/core";
import type {
  AnalysisOperation,
  EdgeMechanism,
  GraphDocument,
  GraphEdge,
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
import { EstimandFormula, NodeName } from "../outputs/EstimandFormula";
import { nodeDisplayName, nodeOutputLabel } from "../compute/format";
import { analyticDistributionLabel, defaultDistribution, valueTypeFromDistribution, valueTypeLabel } from "../compute/distributionPlot";
import { conditioningSliderBounds, conditioningSliderStep, roundToStep } from "../compute/conditioning";
import { Checkbox, NumberField, RoleToggle, TactileNumberField } from "../controls";
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
  onDeleteEdge: (edgeId: string) => void;
  onSetDataMode: (nodeId: string, mode: "read" | "fit" | "author") => void;
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
}) {
  const node = props.node;
  const variable = normalizeVariableModel(node.variable);
  const mechanism = normalizeNodeMechanism(props.document.simulation.nodes[node.id]);
  const state = props.simulation.nodeStates[node.id];
  const parentIds = props.document.graph.edges.filter((edge) => edge.kind === "directed" && edge.target === node.id).map((edge) => edge.source);
  const isRoot = parentIds.length === 0;
  // The instrument role is contextual: offerable only on a structural candidate (or to un-assign one).
  const isInstrumentCandidate = useMemo(() => candidateInstruments(props.document.graph).includes(node.id), [props.document.graph, node.id]);
  const updateVariable = (patch: Partial<VariableModel>) => props.onVariableChange(node.id, normalizeVariableModel({ ...variable, ...patch }));
  // R5: the response FAMILY is directly selectable and canonical (valueType is its synced mirror).
  // Picking a family sets the family's canonical link (non-root) or root distribution so it generates
  // correctly — no more picking a distribution and hoping the inferred type agrees.
  const FAMILY_LINK: Partial<Record<VariableModel["valueType"], NodeCombinerKind>> = { continuous: "additive", binary: "bernoulli_logit", count: "poisson_log", ordinal: "additive", categorical: "additive", positive: "gamma_log", proportion: "bounded_logistic" };
  const FAMILY_ROOT_DISTRIBUTION: Partial<Record<VariableModel["valueType"], NodeDistribution["kind"]>> = { continuous: "normal", binary: "bernoulli", count: "poisson", positive: "gamma", proportion: "beta", categorical: "categorical", ordinal: "categorical" };
  const REALIZED_FAMILIES = new Set<VariableModel["valueType"]>(["continuous", "binary", "count", "ordinal", "categorical"]);
  const changeFamily = (kind: VariableModel["valueType"]) => {
    const patch: Partial<VariableModel> = { valueType: kind };
    if ((kind === "ordinal" || kind === "categorical") && variable.categories.length < 2) patch.categories = ["level 1", "level 2", "level 3"];
    updateVariable(patch);
    if (isRoot) { const dist = FAMILY_ROOT_DISTRIBUTION[kind]; if (dist) props.onMechanism(node.id, { distribution: defaultDistribution(dist) }); }
    else { const combiner = FAMILY_LINK[kind]; if (combiner) props.onMechanism(node.id, { combiner }); }
  };
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
        {(() => {
          const dataMode = nodeDataMode(props.document, node.id);
          if (!dataMode) return null;
          const canFit = props.document.graph.edges.some((e) => e.target === node.id && e.kind === "directed" && props.document.simulation.edges[e.id]?.kind !== "table_lookup");
          const blurb = dataMode === "read" ? "Replays this variable's real column — its equation is inert, so edits below are ignored." : dataMode === "fit" ? "Generated from a fit to the data (live — recomputes as you change the DAG)." : "Generated from an equation you author below.";
          return (
            <div className="selection-editor-block node-data-mode">
              <strong>Values</strong>
              <div className="data-mode-seg" role="group" aria-label="Value source">
                <button type="button" className={dataMode === "read" ? "active" : ""} onClick={() => props.onSetDataMode(node.id, "read")}>From data</button>
                {canFit && <button type="button" className={dataMode === "fit" ? "active" : ""} onClick={() => props.onSetDataMode(node.id, "fit")}>Fit</button>}
                <button type="button" className={dataMode === "author" ? "active" : ""} onClick={() => props.onSetDataMode(node.id, "author")}>Author</button>
              </div>
              <p className="muted">{blurb}</p>
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

          <details className="output-box editor-section">
            <summary><strong>Distribution</strong><span>{valueTypeLabel(variable.valueType)}</span></summary>
            <div className="editor-section-body">
              <label className="field">
                <span>type</span>
                <select value={variable.valueType} onChange={(event) => changeFamily(event.target.value as VariableModel["valueType"])}>
                  {VARIABLE_TYPES.map(([kind, label]) => (
                    <option value={kind} key={kind} disabled={!REALIZED_FAMILIES.has(kind) && kind !== variable.valueType}>{label}{REALIZED_FAMILIES.has(kind) ? "" : " (planned)"}</option>
                  ))}
                </select>
              </label>
              {isRoot && <DistributionEditor
                label="root distribution"
                distribution={mechanism.distribution}
                allowedKinds={FAMILY_DISTRIBUTIONS[variable.valueType]}
                onChange={onRootDistributionChange}
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
