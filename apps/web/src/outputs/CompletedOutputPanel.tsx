import { renderCompletedOutput } from "./modules";
import type { ComputedCompletedOutput } from "./modules";

export function CompletedOutputPanel(props: { moduleId: string | null; computedOutput: ComputedCompletedOutput | null }) {
  if (!props.computedOutput || props.computedOutput.moduleId !== props.moduleId) return null;
  return renderCompletedOutput(props.computedOutput);
}
