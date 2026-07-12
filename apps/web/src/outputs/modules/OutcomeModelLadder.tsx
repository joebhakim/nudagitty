import { OUTCOME_LEARNERS } from "@nudagitty/core";
import type { OutcomeLearnerId } from "@nudagitty/core";
import { InfoDot } from "../../controls";

const LADDER_TIP =
  "Every model-based estimator (outcome regression, AIPW, the parametric g-formula) needs the same thing: E[Y | T, L], evaluated at a COUNTERFACTUAL row. Which model fills that slot is a choice — and it was previously made for you, silently, as 'linear'. This is a LADDER ordered by hypothesis class, and the default is the SMALLEST one on purpose. Climbing it does not reduce lying; it changes the KIND of lie. A rigid model lies by EXTRAPOLATING — on the LaLonde two-part DGP the linear model imputes a counterfactual of −$10,101 for the treated (negative earnings), and its +$18,088 'effect' against a true +$1,794 is exactly the arithmetic needed to drag them back. Absurd, traceable, CATCHABLE. A flexible model lies by INTERPOLATING confidently where there is no data: it cannot produce −$10,101, so it emits something PLAUSIBLE instead, and you never notice. Neither repairs a positivity violation. Start where a wrong answer is still legible, and relax only when a diagnostic has earned it.";

const REQUEST_URL =
  "https://github.com/joebhakim/nudagitty/issues/new?title=" +
  encodeURIComponent("Outcome model request: <name>") +
  "&body=" +
  encodeURIComponent(
    "**Which outcome model do you want?**\n\n\n" +
      "**What does it assume — its hypothesis class in one line?**\n\n\n" +
      "**What diagnostic should tell a user to reach for it?**\n\n\n" +
      "**A citation, if there is one:**\n\n\n" +
      "---\n_Requested from the outcome-model ladder in the methods panel._\n"
  );

/**
 * The ladder — including the rungs that DO NOT EXIST YET, greyed out.
 *
 * That is deliberate, and it is the point. A dropdown of three working models tells a user "these are the
 * models". A ladder that also shows `Gamma GLM`, `Mincer transforms`, `GAM` and `Forest (DML)` greyed, each
 * with the diagnostic that would license it, tells them where the ceiling is — and invites the response we
 * actually want: "my model isn't here, add it." Hence the Request link at the bottom. Adding a learner
 * downstream is one entry in OUTCOME_LEARNERS plus a `fit`; the UI needs no change at all.
 */
export function OutcomeModelLadder(props: {
  value?: OutcomeLearnerId;
  onChange: (id: OutcomeLearnerId) => void;
}) {
  const current = props.value ?? "ols";
  return (
    <div className="outcome-ladder">
      <div className="outcome-ladder-head">
        <span>Estimator setting — outcome model{<InfoDot tip={LADDER_TIP} href="/effects.html#honesty" />}</span>
        <span className="outcome-ladder-axis">smallest hypothesis class → largest</span>
      </div>

      {OUTCOME_LEARNERS.map((learner) => {
        const usable = learner.status === "usable";
        const selected = usable && learner.id === current;
        return (
          <button
            key={learner.id}
            type="button"
            className={`outcome-rung${selected ? " selected" : ""}${usable ? "" : " planned"}`}
            disabled={!usable}
            aria-pressed={selected}
            onClick={() => usable && props.onChange(learner.id)}
          >
            <span className="outcome-rung-dot" aria-hidden="true">{selected ? "●" : usable ? "○" : "◌"}</span>
            <span className="outcome-rung-body">
              <b>
                {learner.label}
                {!usable && <em className="outcome-rung-planned"> planned</em>}
                {learner.needsCrossFitting && <em className="outcome-rung-planned"> · needs cross-fitting</em>}
              </b>
              <span className="outcome-rung-class">{learner.hypothesisClass}</span>
              {/* The REASON to move, not just the option to. */}
              {!selected && <span className="outcome-rung-unlock">unlocked by: {learner.unlockedBy}</span>}
            </span>
          </button>
        );
      })}

      <a className="outcome-ladder-request" href={REQUEST_URL} target="_blank" rel="noreferrer">
        Your model isn’t here? Request it →
      </a>
    </div>
  );
}
