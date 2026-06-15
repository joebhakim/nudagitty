import type { AnalysisOperation, ConditionedClassification } from "@nudagitty/core";

// A token in a rendered estimand formula. `name` tokens are node names (rendered
// as chips), `val` tokens are values / levels (plain), `op` tokens are operators
// and function words (muted). See apps/web/src/outputs/EstimandFormula.tsx.
export type EstimandToken = { kind: "name" | "val" | "op"; text: string };

export type EstimandDescriptor = {
  /** Flat string form (for aria-labels, copy, and string-only consumers). */
  formal: string;
  /** Structured token form for chip rendering. */
  formalTokens: EstimandToken[];
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

/**
 * Canonical display form for a node name: drop the trailing "(unit)" annotation
 * and turn id underscores into spaces, so a name chip reads as the variable
 * itself ("fall height", "Brought to vet") rather than carrying units or ids.
 */
export function displayNodeName(raw: string): string {
  return raw
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/_/g, " ")
    .trim();
}

const nm = (text: string): EstimandToken => ({ kind: "name", text: displayNodeName(text) });
const vl = (text: string | number): EstimandToken => ({ kind: "val", text: String(text) });
const op = (text: string): EstimandToken => ({ kind: "op", text });

function tokensToString(tokens: EstimandToken[]): string {
  return tokens.map((token) => token.text).join("");
}

// Formal + plain-language estimand for a (exposure, outcome) relationship under the chosen
// operation on a variable. See docs/causal-operations.md.
export function describeEstimand(inputs: EstimandInputs): EstimandDescriptor {
  const { operation, exposureLabel, outcomeLabel, nodeLabel, value } = inputs;
  const x = displayNodeName(exposureLabel);
  const y = displayNodeName(outcomeLabel);
  const v = nodeLabel !== undefined ? displayNodeName(nodeLabel) : "V";
  const vName = nodeLabel ?? "V";
  const eqValue: EstimandToken[] = value !== undefined ? [op(" = "), vl(value)] : [];

  let formalTokens: EstimandToken[];
  let plain: string;
  switch (operation) {
    case "intervene":
      formalTokens = [op("P( "), nm(outcomeLabel), op(" | do( "), nm(vName), ...eqValue, op(" ) )")];
      plain = `Interventional: the value of ${v} is set by do(), cutting its incoming causes.`;
      break;
    case "select":
      formalTokens = [op("P( "), nm(outcomeLabel), op(" | "), nm(exposureLabel), op(", "), nm(vName), ...eqValue, op(" )")];
      plain = `Associational, restricted to the selected sub-population where ${v}${value !== undefined ? ` = ${value}` : ""}. The complement is unobserved, so this cannot be re-marginalized to the full population.`;
      break;
    case "condition":
      formalTokens = [op("{ P( "), nm(outcomeLabel), op(" | "), nm(exposureLabel), op(", "), nm(vName), op(" = "), vl("s"), op(" ) }ₛ")];
      plain = `The ${x}–${y} relationship within each stratum of ${v}, shown side by side and not combined.`;
      break;
    case "adjust":
      formalTokens = [
        op("Σₛ P( "), nm(outcomeLabel), op(" | "), nm(exposureLabel), op(", "), nm(vName), op(" = "), vl("s"),
        op(" ) · P( "), nm(vName), op(" = "), vl("s"), op(" )")
      ];
      plain = `Backdoor-standardized over ${v}: stratify on every level, then re-weight to the population. Valid only if ${v} blocks all backdoor paths and opens none.`;
      break;
    default:
      formalTokens = [op("P( "), nm(outcomeLabel), op(" | "), nm(exposureLabel), op(" )")];
      plain = `The crude, unconditioned ${x}–${y} association over the whole population.`;
      break;
  }
  return { formal: tokensToString(formalTokens), formalTokens, plain };
}

// A precise bad-control warning when conditioning on `node` opens a biasing path.
export function badControlWarning(nodeLabel: string, classification: ConditionedClassification): string | null {
  if (classification !== "collider") return null;
  const v = displayNodeName(nodeLabel);
  return `${v} is a collider for this exposure–outcome pair: conditioning on it (whether by selecting, stratifying, or adjusting) OPENS a biasing path. The unconditioned (crude) estimate is the unbiased one here — do not control for ${v}.`;
}
