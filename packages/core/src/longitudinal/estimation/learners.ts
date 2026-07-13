import type { CovariateBasis, LongitudinalCohort } from "../types";
import type { GraphDocument } from "../../types";
import { normalizeNodeMechanism, normalizeVariableModel } from "../../graph";
import { fitGammaLogOutcomeModel, fitInteractionOutcomeModel, fitOutcomeModel, fitPpmlOutcomeModel, fitTwoPartIdentityInteractionOutcomeModel, fitTwoPartIdentityOutcomeModel, fitTwoPartOutcomeModel } from "./fit";

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
  | "two_part"          // rung 3 — LOG amount
  | "two_part_identity" // rung 3 — LEVELS amount
  | "ppml"              // rung 3
  | "gamma_log"         // rung 3
  | "two_part_identity_interactions" // rung 4 — LEVELS amount, heterogeneous effect
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
  /** What the learner needs of the outcome. Shown when it REFUSES to fit, so a refusal explains itself
   *  instead of surfacing as a generic "not enough data". A model declining to describe your outcome is an
   *  informative answer, not an error. */
  requires?: string;
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
    status: "usable",
    extrapolates: true,
    needsCrossFitting: false,
    unlockedBy: "evidence of effect heterogeneity across L — rung 1 does not merely mis-estimate the effect, it assumes there is only one",
    fit: fitInteractionOutcomeModel
  },
  {
    id: "two_part_identity",
    label: "Two-part, amount in LEVELS",
    rung: 3,
    hypothesisClass: "P(Y>0) gate × E[Y | Y>0] = x'β — no log, no exponential, no retransformation",
    status: "usable",
    extrapolates: true,
    needsCrossFitting: false,
    unlockedBy: "a zero spike AND an amount that is linear in its predictors — what the earnings literature fits (nobody logs re78)",
    requires: "Y ≥ 0 — a negative value would be silently relabelled as “it never happened” by the gate",
    fit: fitTwoPartIdentityOutcomeModel
  },
  {
    id: "two_part",
    label: "Two-part (Cragg), amount in LOGS",
    rung: 3,
    hypothesisClass: "P(Y>0) gate × E[Y | Y>0] = exp(x'β) — the textbook Cragg model",
    status: "usable",
    extrapolates: true,   // parametric — it CAN extrapolate, but only within the outcome's support
    needsCrossFitting: false,
    unlockedBy: "the outcome model imputes impossible values (e.g. negative earnings)",
    requires: "Y ≥ 0 — a negative value would be silently relabelled as “it never happened” by the gate",
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
    requires: "Y ≥ 0 — exp(x'b) is strictly positive",
    fit: fitPpmlOutcomeModel
  },
  {
    id: "gamma_log",
    label: "Gamma GLM (log link)",
    rung: 3,
    hypothesisClass: "log link, gamma variance — the positive-skew workhorse",
    status: "usable",
    extrapolates: true,
    needsCrossFitting: false,
    unlockedBy: "a strictly positive skewed outcome",
    requires: "Y > 0 for every row — the gamma density has no mass at zero, so an outcome with a zero spike cannot be described by it",
    fit: fitGammaLogOutcomeModel
  },
  {
    id: "two_part_identity_interactions",
    label: "Two-part in LEVELS + treatment interactions",
    rung: 4,
    hypothesisClass: "gate × amount in levels, both carrying T × L — a heterogeneous effect, still LINEAR in the modifier",
    status: "usable",
    extrapolates: true,
    needsCrossFitting: false,
    unlockedBy: "a two-part outcome AND evidence the effect differs across L — rung 3 has the right family but still assumes ONE effect for everybody",
    requires: "Y ≥ 0 — a negative value would be silently relabelled as “it never happened” by the gate",
    fit: fitTwoPartIdentityInteractionOutcomeModel
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

/**
 * DOES THE CHOSEN OUTCOME MODEL MATCH THE DGP'S OWN?
 *
 * This is a WARNING, not an aid. It reads the DGP's FORM (family + link) — never its effect, which would be
 * the answer sheet — and it exists because the ladder is otherwise dangerously flattering.
 *
 * On lalonde-fit-recover-2part the `two_part_identity` rung recovers the imposed +$1,794 to within $20,
 * while every other rung misses by $1.6k–$4.6k. Read naively that says "two-part-levels is the right
 * estimator". It says nothing of the kind. It recovers the truth BECAUSE IT IS THE GENERATING MODEL —
 * correct specification is what buys correct extrapolation across a support gap, and on real data nobody
 * hands you the generating model. That is precisely why LaLonde is famous: Smith & Todd showed no
 * observational method reliably recovers the experimental benchmark, and a tool that quietly taught
 * "match the family and win" would be teaching the opposite of its own literature.
 *
 * Returns null when there is no imposed effect — i.e. when this is not a benchmark and the question is moot.
 */
export type SpecificationMatch = "exact" | "family" | "none";

export function specificationMatch(document: GraphDocument, outcomeModel?: OutcomeLearnerId): SpecificationMatch | null {
  if (!document.metadata.imposedEffect) return null;          // not a benchmark ⇒ nothing to be smug about
  const outcomeId = document.metadata.imposedEffect.outcome ?? document.graph.nodes.find((n) => n.roles?.outcome)?.id;
  const node = document.graph.nodes.find((n) => n.id === outcomeId);
  if (!node) return null;

  const family = normalizeVariableModel(node.variable).valueType;
  const mech = normalizeNodeMechanism(document.simulation.nodes[node.id]);
  const combiner = mech.combiner;
  const chosen = outcomeLearner(outcomeModel).id;

  // Does the DGP carry an EFFECT MODIFIER — an authored interaction that moves with the exposure? Then a
  // model with one constant effect is misspecified in SHAPE however right its family is, and the model that
  // matches is the one carrying T × L. This is still reading the DGP's FORM, not its effect: "the effect
  // depends on schooling" is a structural claim, the same kind as "earnings have a mass at zero". Its SIZE
  // stays hidden.
  const exposure = document.metadata.imposedEffect.exposure ?? document.graph.nodes.find((n) => n.roles?.exposure)?.id;
  const modified = exposure !== undefined && mech.interactions.some((i) =>
    i.kind === "product" ? i.left === exposure || i.right === exposure : i.source === exposure);

  const twoPartFamily = chosen === "two_part" || chosen === "two_part_identity" || chosen === "two_part_identity_interactions";
  if (family === "semicontinuous") {
    const dgp = combiner === "positive_softplus"
      ? (modified ? "two_part_identity_interactions" : "two_part_identity")
      : "two_part";
    if (chosen === dgp) return "exact";              // same family, same amount link, same effect shape
    if (twoPartFamily) return "family";              // right family — wrong link, or wrong effect shape
    return "none";
  }
  if (family === "continuous") {
    const dgp = modified ? "ols_interactions" : "ols";
    return chosen === dgp ? "exact" : "none";
  }
  if (family === "positive") return chosen === "gamma_log" || chosen === "ppml" ? "family" : "none";
  return "none";
}
