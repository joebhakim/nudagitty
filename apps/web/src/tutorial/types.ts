import type { GraphDocument } from "@nudagitty/core";
import type { JointSourceCloud } from "../canvas/types";

// The slice of app state the step predicates read to auto-advance. Kept small on purpose — a step
// advances on an observable fact about the model, not on internal UI plumbing.
export interface TutorialCtx {
  document: GraphDocument;
  showJointLab: boolean;
  jointSources: JointSourceCloud[];
}

export interface TutorialStep {
  id: string;
  title: string;
  instruction: string;
  /** CSS selector for the control to spotlight (a stable top-bar button, usually). Optional. */
  target?: string;
  /** Auto-advance when this becomes true. Manual "Next" is always available regardless. */
  advanceOn?: (ctx: TutorialCtx) => boolean;
  /** An optional one-click helper for tedious steps (e.g. wiring confounders). App owns the action. */
  actionLabel?: string;
}
