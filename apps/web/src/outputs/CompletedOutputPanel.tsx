import { memo } from "react";
import { renderCompletedOutput } from "./modules";
import type { ComputedCompletedOutput } from "./modules";

// Memoized: its props (moduleId, computedOutput, hideOracle) are stable while only node
// positions change, so dragging a node skips re-rendering the whole completed-output
// subtree (survival curves, methods table, metric tiles).
export const CompletedOutputPanel = memo(function CompletedOutputPanel(props: { moduleId: string | null; computedOutput: ComputedCompletedOutput | null; hideOracle?: boolean }) {
  if (!props.computedOutput || props.computedOutput.moduleId !== props.moduleId) return null;
  return renderCompletedOutput(props.computedOutput, { hideOracle: props.hideOracle });
});
