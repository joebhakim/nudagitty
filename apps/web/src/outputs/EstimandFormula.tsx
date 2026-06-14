import { displayNodeName, type EstimandToken } from "./estimand";

// A single node name rendered as a chip (the structured visual language: chip =
// variable). Normalizes id underscores to spaces for display.
export function NodeName({ children }: { children: string }) {
  return <span className="node-name">{displayNodeName(children)}</span>;
}

// Renders a structured estimand formula: node names as chips, values plain,
// operators muted. Operator tokens carry their own spacing.
export function EstimandFormula({ tokens, className }: { tokens: EstimandToken[]; className?: string }) {
  return (
    <span className={className ? `estimand-formula ${className}` : "estimand-formula"}>
      {tokens.map((token, index) => {
        const cls = token.kind === "name" ? "node-name" : token.kind === "val" ? "node-val" : "node-op";
        return <span key={index} className={cls}>{token.text}</span>;
      })}
    </span>
  );
}
