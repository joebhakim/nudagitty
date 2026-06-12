import type { AnalysisOperation, ConditionedClassification } from "@nudagitty/core";

export type EstimandDescriptor = {
  formal: string;
  plain: string;
};

export type EstimandInputs = {
  operation: AnalysisOperation;
  exposureLabel: string;
  outcomeLabel: string;
  // the variable the operation is applied to (for select/condition/adjust/intervene)
  nodeLabel?: string;
  // the fixed value for intervene / select, if any
  value?: number | string;
};

// Formal + plain-language estimand for a (exposure, outcome) relationship under the chosen
// operation on a variable. See docs/causal-operations.md.
export function describeEstimand(inputs: EstimandInputs): EstimandDescriptor {
  const { operation, exposureLabel: x, outcomeLabel: y, nodeLabel: v, value } = inputs;
  const vAtValue = v !== undefined && value !== undefined ? `${v} = ${value}` : v ?? "V";
  switch (operation) {
    case "intervene":
      return {
        formal: `P(${y} | do(${vAtValue}))`,
        plain: `Interventional: the value of ${v ?? "the variable"} is set by do(), cutting its incoming causes.`
      };
    case "select":
      return {
        formal: `P(${y} | ${x}, ${vAtValue})`,
        plain: `Associational, restricted to the selected sub-population where ${vAtValue}. The complement is unobserved, so this cannot be re-marginalized to the full population.`
      };
    case "condition":
      return {
        formal: `{ P(${y} | ${x}, ${v ?? "V"} = s) }ₛ`,
        plain: `The ${x}–${y} relationship within each stratum of ${v ?? "the variable"}, shown side by side and not combined.`
      };
    case "adjust":
      return {
        formal: `Σₛ P(${y} | ${x}, ${v ?? "V"} = s) · P(${v ?? "V"} = s)`,
        plain: `Backdoor-standardized over ${v ?? "the variable"}: stratify on every level, then re-weight to the population. Valid only if ${v ?? "it"} blocks all backdoor paths and opens none.`
      };
    default:
      return {
        formal: `P(${y} | ${x})`,
        plain: `The crude, unconditioned ${x}–${y} association over the whole population.`
      };
  }
}

// A precise bad-control warning when conditioning on `node` opens a biasing path.
export function badControlWarning(nodeLabel: string, classification: ConditionedClassification): string | null {
  if (classification !== "collider") return null;
  return `${nodeLabel} is a collider for this exposure–outcome pair: conditioning on it (whether by selecting, stratifying, or adjusting) OPENS a biasing path. The unconditioned (crude) estimate is the unbiased one here — do not control for ${nodeLabel}.`;
}
