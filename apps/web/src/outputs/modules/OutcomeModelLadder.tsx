import { OUTCOME_LEARNERS, specificationMatch } from "@nudagitty/core";
import type { GraphDocument, OutcomeLearnerId } from "@nudagitty/core";
import { InfoDot } from "../../controls";

const MATCH_TIP =
  "You have chosen the model that GENERATED this data. It recovers the imposed truth — and that is not evidence the model is good, it is a tautology. Correct specification is what buys correct extrapolation across a support gap, and on real data nobody hands you the generating model. This is exactly why LaLonde is famous: Smith & Todd (2005) showed no observational method reliably recovers the experimental benchmark, and every rung that does NOT match here misses by $1,600–$4,600. Read this as the ceiling of what perfect knowledge would buy you, not as a recommendation.";

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
  document?: GraphDocument;
}) {
  const current = props.value ?? "ols";
  // A WARNING, never a recommendation. See specificationMatch() — the ladder is dangerously flattering
  // without it, because the rung that matches the DGP recovers the truth by tautology.
  const match = props.document ? specificationMatch(props.document, current) : null;
  return (
    <div className="outcome-ladder">
      <div className="outcome-ladder-head">
        <span>Estimator setting — outcome model{<InfoDot tip={LADDER_TIP} href="/effects.html#honesty" />}</span>
        <span className="outcome-ladder-axis">smallest hypothesis class → largest</span>
      </div>

      {match === "exact" && (
        <div className="outcome-specmatch">
          <b>⚠ This is the model that GENERATED the data{<InfoDot tip={MATCH_TIP} href="/effects.html#honesty" />}</b>
          <span>
            So of course it recovers the truth — that is a tautology, not a result. <b>Real data will never
            hand you the generating model</b>, which is the entire reason LaLonde is a hard problem. Treat this
            as the <i>ceiling</i> of what perfect knowledge would buy, and read the other rungs to see what
            being wrong actually costs.
          </span>
        </div>
      )}
      {match === "family" && (
        <div className="outcome-specmatch soft">
          <b>Right family, wrong link</b>
          <span>
            The DGP is two-part, and so is this — but its amount margin uses the other link, so the
            misspecification is in the <i>shape</i> of the amount, not the family.
          </span>
        </div>
      )}

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
