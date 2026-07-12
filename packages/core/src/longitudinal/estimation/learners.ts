import type { CovariateBasis, LongitudinalCohort } from "../types";
import { fitOutcomeModel, fitPpmlOutcomeModel, fitTwoPartOutcomeModel } from "./fit";

/**
 * The OUTCOME-MODEL LADDER.
 *
 * Every model-based estimator (outcome regression, AIPW, the parametric g-formula, g-estimation) needs the
 * same one thing: mu(t, l) = E[Y | T=t, L=l], evaluable at a COUNTERFACTUAL row. That is the entire contract,
 * so an outcome model is a LEARNER, not a family — and the estimators should be agnostic to which one is in
 * the slot. Before this, `fitOutcomeModel` (linear/identity, or logistic for binary outcomes) was hardcoded
 * into all of them, so the ledger had exactly one hypothesis class and never said so.
 *
 * WHY IT IS A LADDER, ORDERED BY HYPOTHESIS CLASS, AND WHY THE DEFAULT IS THE SMALLEST ONE.
 *
 * Climbing the ladder does not reduce lying — it changes the KIND of lie:
 *
 *   a RIGID class lies by EXTRAPOLATING. On lalonde-fit-recover-2part the linear model imputes a
 *   counterfactual Y(0) of −$10,101 for the treated — negative earnings — and beta_T (+$18,088 against a
 *   true +$1,794) is exactly the arithmetic needed to drag them back: beta_T = mean(Y|T=1) − imputed Y(0)
 *   = 7,987 − (−10,101). Absurd, traceable, CATCHABLE. It fails LOUDLY.
 *
 *   a FLEXIBLE class lies by INTERPOLATING confidently where there is no data. A forest cannot produce
 *   −$10,101 — its predictions are averages of observed Y, inside the convex hull — so it emits something
 *   PLAUSIBLE instead. It fails QUIETLY.
 *
 * Neither repairs a positivity violation. So the default is the smallest class NOT because small models are
 * more correct, but because their wrongness is LEGIBLE: you start where the tool can still catch you, and
 * you relax only when a diagnostic has earned it (see `unlockedBy`). Choosing a hypothesis class IS a prior
 * — a hard one, zero mass outside it — and under a positivity violation the answer is nearly all prior. That
 * is not a pathology; it is the honest situation, and it is why this must be the USER's choice, made explicit,
 * rather than a default that quietly matches the DGP.
 *
 * WHAT THIS LADDER IS NOT. It is the RESPONSE-FAMILY / SUPPORT axis. It is orthogonal to `CovariateBasis`
 * (linear | quadratic | cubic), which is flexibility IN L — and that axis demonstrably does NOT ladder toward
 * truth. Same family, same data, only the basis changed:
 *     linear +18,088   quadratic −5,347   cubic +5,083     (truth +1,794)
 * It thrashes, sign-flipping across a $23k range. More flexibility in L just changes WHICH wrong answer you
 * get — a researcher degree of freedom to fish in. Hence the UI should offer the basis as a SENSITIVITY
 * DISPLAY (show all three at once), never as a picker that invites you to choose one and believe it.
 *
 * NOT AN ANSWER SHEET. A learner must never be selected from the DGP's imposed effect or its true
 * coefficients — that is the circularity this whole benchmark exists to avoid. The FAMILY, by contrast, is
 * fair game: "earnings are non-negative with a mass at zero" is a prior about the OUTCOME, not about the
 * EFFECT, and a real analyst brings exactly that. The sin would be silently DEFAULTING to the family that
 * happens to match the DGP — which is why the default is `ols` and stays `ols`.
 */
export type OutcomeLearnerId =
  | "ols"               // rung 1 — the naive baseline, and the default. Never change this default.
  | "ols_interactions"  // rung 2
  | "two_part"          // rung 3
  | "ppml"              // rung 3
  | "gamma_log"         // rung 3
  | "mincer"            // rung 4
  | "gam"               // rung 5
  | "forest";           // rung 6

/** The whole contract: fit on the cohort, return mu(row, counterfactual assignment). */
export type OutcomeModelFit = (
  cohort: LongitudinalCohort,
  outcome: string,
  treatments: string[],
  covariates: string[],
  binary: boolean,
  basis: CovariateBasis
) => ((row: Record<string, number>, assignment: Map<string, number> | null) => number) | null;

export interface OutcomeLearner {
  id: OutcomeLearnerId;
  label: string;
  /** Position on the ladder. Bigger = larger hypothesis class. Ties are allowed (siblings). */
  rung: number;
  /** The hypothesis class, in one human line. This is what the UI shows next to the label. */
  hypothesisClass: string;
  /** `planned` rungs are RENDERED, greyed, so a user can see the ceiling and ask for what is missing. */
  status: "usable" | "planned";
  /** Can it emit values outside the observed support? OLS: yes (hence −$10,101). Forest: no. */
  extrapolates: boolean;
  /** ML nuisances converge slower than √n ⇒ plug-in is INVALID. Must live inside an orthogonal score (DML). */
  needsCrossFitting: boolean;
  /** The diagnostic that licenses relaxing to this rung — the UI shows it as the REASON to move. */
  unlockedBy: string;
  /** Present iff status === "usable". */
  fit?: OutcomeModelFit;
}

export const OUTCOME_LEARNERS: readonly OutcomeLearner[] = [
  {
    id: "ols",
    label: "Linear / logistic, additive",
    rung: 1,
    hypothesisClass: "linear in L; one constant treatment effect",
    status: "usable",
    extrapolates: true,
    needsCrossFitting: false,
    unlockedBy: "the default — start where a wrong answer is still legible",
    fit: fitOutcomeModel
  },
  {
    id: "ols_interactions",
    label: "+ treatment interactions",
    rung: 2,
    hypothesisClass: "linear in L, but a separate surface per arm (heterogeneous effect)",
    status: "planned",
    extrapolates: true,
    needsCrossFitting: false,
    unlockedBy: "evidence of effect heterogeneity across L"
  },
  {
    id: "two_part",
    label: "Two-part (Cragg)",
    rung: 3,
    hypothesisClass: "P(Y>0) gate × E[Y | Y>0] log-amount — respects Y ≥ 0 and the zero spike",
    status: "usable",
    extrapolates: true,   // parametric — it CAN extrapolate, but only within the outcome's support
    needsCrossFitting: false,
    unlockedBy: "the outcome model imputes impossible values (e.g. negative earnings)",
    fit: fitTwoPartOutcomeModel
  },
  {
    id: "ppml",
    label: "PPML (Poisson pseudo-ML)",
    rung: 3,
    hypothesisClass: "log link on the MEAN, zeros kept — Jensen-safe, no retransformation bias",
    status: "usable",
    extrapolates: true,
    needsCrossFitting: false,
    unlockedBy: "a non-negative skewed outcome with zeros (log-OLS would silently drop them)",
    fit: fitPpmlOutcomeModel
  },
  {
    id: "gamma_log",
    label: "Gamma GLM (log link)",
    rung: 3,
    hypothesisClass: "log link, gamma variance — the positive-skew workhorse",
    status: "planned",
    extrapolates: true,
    needsCrossFitting: false,
    unlockedBy: "a strictly positive skewed outcome"
  },
  {
    id: "mincer",
    label: "Mincer predictor transforms",
    rung: 4,
    hypothesisClass: "family-aware, plus logged/splined regressors (log your dollar covariates)",
    status: "planned",
    extrapolates: true,
    needsCrossFitting: false,
    unlockedBy: "the residual still depends on a predictor (the dCor / RESIT test on earnings history)"
  },
  {
    id: "gam",
    label: "Generalised additive model",
    rung: 5,
    hypothesisClass: "smooth arbitrary function of each predictor, additive",
    status: "planned",
    extrapolates: false,
    needsCrossFitting: false,
    unlockedBy: "residual structure a parametric form cannot absorb — and enough overlap to fit it"
  },
  {
    id: "forest",
    label: "Random forest / boosting (DML)",
    rung: 6,
    hypothesisClass: "fully nonparametric — cannot leave the convex hull of the data",
    status: "planned",
    extrapolates: false,
    // The honest constraint, encoded rather than footnoted: a plug-in forest is not valid inference. It is
    // only offerable as a NUISANCE learner inside a Neyman-orthogonal score with cross-fitting.
    needsCrossFitting: true,
    unlockedBy: "enough overlap/ESS to support nonparametrics — and it fails QUIETLY where OLS fails loudly"
  }
] as const;

/** Resolve a learner. Unknown or absent ⇒ the smallest hypothesis class. Never silently upgrade. */
export function outcomeLearner(id?: OutcomeLearnerId): OutcomeLearner {
  const found = OUTCOME_LEARNERS.find((l) => l.id === id && l.status === "usable");
  return found ?? OUTCOME_LEARNERS[0]!;
}
