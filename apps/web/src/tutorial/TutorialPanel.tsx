import type { TutorialStep } from "./types";

// The persistent step card. Always offers Back / Next / Exit so the tour is never a dead end; the
// optional per-step action button (e.g. "wire the confounders") is the one-click helper for tedious steps.
export function TutorialPanel(props: {
  step: TutorialStep;
  index: number;
  total: number;
  requiresAction: boolean;
  onNext: () => void;
  onBack: () => void;
  onExit: () => void;
  onAction: (stepId: string) => void;
}) {
  const isLast = props.index === props.total - 1;
  // A step with a completion predicate must be DONE to advance (the controller auto-advances the moment
  // it is) — so Next is blocked until then. Informational steps keep a free Next.
  const gated = props.requiresAction && !isLast;
  return (
    <div className="tutorial-panel" role="dialog" aria-label="Tutorial">
      <div className="tutorial-panel-head">
        <span className="tutorial-progress">Step {props.index + 1} of {props.total}</span>
        <button type="button" className="tutorial-exit" onClick={props.onExit}>Exit tour</button>
      </div>
      <strong className="tutorial-title">{props.step.title}</strong>
      <p className="tutorial-instruction">{props.step.instruction}</p>
      {props.step.actionLabel && (
        <button type="button" className="tutorial-action" onClick={() => props.onAction(props.step.id)}>{props.step.actionLabel}</button>
      )}
      {gated && <p className="tutorial-gate-hint">Do this step to continue.</p>}
      <div className="tutorial-nav">
        <button type="button" className="tutorial-back" disabled={props.index === 0} onClick={props.onBack}>← Back</button>
        <div className="tutorial-dots" aria-hidden="true">
          {Array.from({ length: props.total }, (_, i) => <span key={i} className={i === props.index ? "on" : ""} />)}
        </div>
        <button type="button" className="tutorial-next" disabled={gated} onClick={isLast ? props.onExit : props.onNext}>{isLast ? "Finish ✓" : "Next →"}</button>
      </div>
    </div>
  );
}
