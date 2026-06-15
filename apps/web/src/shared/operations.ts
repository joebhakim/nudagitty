import type { AnalysisOperation, GraphDocument } from "@nudagitty/core";
import { normalizeSelectionCondition, normalizeVariableModel } from "@nudagitty/core";

// Derive the estimand operation currently applied to a node from the scattered state
// (overrides = intervene, selected role + a selection = select, adjusted role + the
// standardize flag = adjust vs condition). See docs/causal-operations.md.
export function deriveOperation(document: GraphDocument, nodeId: string): AnalysisOperation {
  const node = document.graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return "none";
  if (document.simulation.overrides[nodeId] !== undefined) return "intervene";
  if (node.roles.selected && document.simulation.selections[nodeId]) return "select";
  if (node.roles.adjusted) {
    return normalizeVariableModel(node.variable).adjustment.standardize ? "adjust" : "condition";
  }
  return "none";
}

// Apply an operation to a node, returning a new document with the underlying state
// (overrides / selections / roles / adjustment.standardize) set consistently and the other
// operations cleared. The four conditioning/intervention operations are mutually exclusive.
export function applyOperation(document: GraphDocument, nodeId: string, operation: AnalysisOperation): GraphDocument {
  const node = document.graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return document;
  const variable = normalizeVariableModel(node.variable);
  const isBinary = variable.valueType === "binary";

  const overrides = { ...document.simulation.overrides };
  const selections = { ...document.simulation.selections };
  delete overrides[nodeId];
  delete selections[nodeId];

  let roles = { ...node.roles, selected: false, adjusted: false };
  let nextVariable = variable;

  if (operation === "intervene") {
    overrides[nodeId] = isBinary ? 1 : 0;
  } else if (operation === "select") {
    roles = { ...roles, selected: true };
    selections[nodeId] = normalizeSelectionCondition(
      isBinary
        ? { operator: "one_of", value: 1, values: [1], sampling: "rejection" }
        : { operator: "at_least", value: 0, sampling: "auto" }
    );
  } else if (operation === "condition") {
    roles = { ...roles, adjusted: true };
    nextVariable = normalizeVariableModel({ ...variable, adjustment: { ...variable.adjustment, standardize: false } });
  } else if (operation === "adjust") {
    roles = { ...roles, adjusted: true };
    nextVariable = normalizeVariableModel({ ...variable, adjustment: { ...variable.adjustment, standardize: true } });
  }
  // operation === "none": roles cleared, overrides/selections removed above.

  const nodes = document.graph.nodes.map((candidate) =>
    candidate.id === nodeId ? { ...candidate, roles, variable: nextVariable } : candidate
  );
  return {
    ...document,
    graph: { ...document.graph, nodes },
    simulation: { ...document.simulation, overrides, selections }
  };
}

export const OPERATION_LABELS: Record<AnalysisOperation, string> = {
  none: "None",
  intervene: "Intervene",
  select: "Select",
  condition: "Condition",
  adjust: "Adjust"
};

export const OPERATION_BLURBS: Record<AnalysisOperation, string> = {
  none: "Leave the variable free — read the crude, unconditioned relationship.",
  intervene: "do(): set the value, cutting its incoming causes.",
  select: "Keep only one stratum (sample inclusion); the complement is unobserved.",
  condition: "Stratify on every level and show each stratum separately, without combining.",
  adjust: "Stratify on every level and standardize back to the population (backdoor adjustment)."
};
