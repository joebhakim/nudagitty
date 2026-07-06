import { useEffect } from "react";
import type { TutorialCtx, TutorialStep } from "./types";
import { TutorialPanel } from "./TutorialPanel";
import { TutorialSpotlight } from "./TutorialSpotlight";
import "./tutorial.css";

// Drives the tour: renders the step card + spotlight, and auto-advances when the current step's
// predicate turns true (observing app state via `ctx`). Manual Next/Back always work regardless.
export function TutorialController(props: {
  steps: TutorialStep[];
  step: number;
  ctx: TutorialCtx;
  onGoto: (index: number) => void;
  onExit: () => void;
  onAction: (stepId: string) => void;
}) {
  const current = props.steps[props.step];
  const atLast = props.step >= props.steps.length - 1;

  useEffect(() => {
    if (!current?.advanceOn || atLast) return;
    if (current.advanceOn(props.ctx)) props.onGoto(props.step + 1);
  });

  if (!current) return null;
  return (
    <>
      <TutorialSpotlight target={current.target} />
      <TutorialPanel
        step={current}
        index={props.step}
        total={props.steps.length}
        requiresAction={Boolean(current.advanceOn)}
        onNext={() => props.onGoto(Math.min(props.step + 1, props.steps.length - 1))}
        onBack={() => props.onGoto(Math.max(props.step - 1, 0))}
        onExit={props.onExit}
        onAction={props.onAction}
      />
    </>
  );
}
