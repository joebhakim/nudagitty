import type { Selection, ToolMode } from "../shared/appState";

export function CanvasCoachmark(props: { tool: ToolMode; edgeSource: string | null; selection: Selection; nodeCount: number }) {
  let title = "Choose a variable";
  let body = "Click a variable to set exposure, outcome, adjustment, sample filters, or intervention.";
  if (props.nodeCount === 0) {
    title = "Start with a variable";
    body = "Choose Variable, then click an open spot on the graph.";
  } else if (props.tool === "node") {
    title = "Place a variable";
    body = "Click an open spot to add it to the causal story.";
  } else if (props.tool === "edge" && !props.edgeSource) {
    title = "Start an arrow";
    body = "Choose the variable that causes something else.";
  } else if (props.tool === "edge" && props.edgeSource) {
    title = "Finish the arrow";
    body = `Now choose what ${props.edgeSource} points to.`;
  } else if (props.selection?.kind === "node") {
    title = "Edit the causal role";
    body = "Use the panel on the right for roles, sample filters, interventions, and adjustment.";
  } else if (props.selection?.kind === "edge") {
    title = "Edit the arrow";
    body = "Use the panel on the right to include the link or change its strength.";
  }
  return (
    <div className="canvas-coachmark" role="status">
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}
