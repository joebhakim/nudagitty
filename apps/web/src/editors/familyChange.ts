import { cloneDocument, normalizeNodeMechanism, normalizeVariableModel } from "@nudagitty/core";
import type { GraphDocument, NodeCombinerKind, NodeDistribution, VariableModel } from "@nudagitty/core";
import { defaultDistribution } from "../compute/distributionPlot";

type Family = VariableModel["valueType"];

// Picking a family must also set the family's canonical LINK (or, for a root, its distribution) — otherwise
// you get a `semicontinuous` variable still generating through an additive combiner, which is exactly the
// silent mismatch the guardrail exists to catch. One function so the node editor's picker and the
// guardrail's one-click fix can never drift apart.
const FAMILY_LINK: Partial<Record<Family, NodeCombinerKind>> = {
  continuous: "additive", binary: "bernoulli_logit", count: "poisson_log", ordinal: "additive",
  categorical: "additive", positive: "gamma_log", semicontinuous: "gamma_log", proportion: "bounded_logistic"
};
const FAMILY_ROOT_DISTRIBUTION: Partial<Record<Family, NodeDistribution["kind"]>> = {
  continuous: "normal", binary: "bernoulli", count: "poisson", positive: "gamma",
  proportion: "beta", categorical: "categorical", ordinal: "categorical"
};

export function applyFamilyChange(document: GraphDocument, nodeId: string, kind: Family): GraphDocument {
  const node = document.graph.nodes.find((n) => n.id === nodeId);
  if (!node) return document;
  const next = cloneDocument(document);
  const target = next.graph.nodes.find((n) => n.id === nodeId)!;
  const variable = normalizeVariableModel(target.variable);

  const patch: Partial<VariableModel> = { valueType: kind };
  if ((kind === "ordinal" || kind === "categorical") && variable.categories.length < 2) {
    patch.categories = ["level 1", "level 2", "level 3"];
  }
  target.variable = normalizeVariableModel({ ...variable, ...patch });

  const isRoot = !document.graph.edges.some((e) => e.kind === "directed" && e.target === nodeId);
  const mech = normalizeNodeMechanism(next.simulation.nodes[nodeId]);
  if (isRoot) {
    const dist = FAMILY_ROOT_DISTRIBUTION[kind];
    if (dist) next.simulation.nodes[nodeId] = { ...mech, distribution: defaultDistribution(dist) };
  } else {
    const combiner = FAMILY_LINK[kind];
    if (combiner) next.simulation.nodes[nodeId] = { ...mech, combiner };
  }
  return next;
}
