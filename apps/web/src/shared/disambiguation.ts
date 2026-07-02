// Glossary registry (the in-app "Glossary", formerly "term disambiguation"): the cross-field /
// cross-author vocabulary for the phenomena the app teaches. Consumed by (a) the per-example reference
// card and (b) the standalone glossary map. Reference content, not simulation — kept here so both
// surfaces speak the same, sourced vocabulary.
//
// Sources distilled from the project's terminology research: Baron & Kenny (1986) moderator/mediator;
// VanderWeele (2009) effect modification vs interaction + VanderWeele & Robins (2007) four types of
// effect modifier; Gail & Simon (1985) qualitative interaction; Preacher, Rucker & Hayes (2007)
// moderated mediation; Muller, Judd & Yzerbyt (2005) mediated moderation; Pearl (identification,
// backdoor/front-door); Hernán & Robins (assumptions, g-methods); Cinelli/Forney/Pearl (good & bad
// controls).

export type DisambiguationField =
  | "psych" // psychology / social science
  | "epi" // epidemiology / public health
  | "biostat" // biostatistics / clinical trials
  | "econ" // econometrics / causal ML
  | "stats" // general statistics / DAGs
  | "genetics"; // genetics

export const FIELD_LABELS: Record<DisambiguationField, string> = {
  psych: "psychology",
  epi: "epidemiology",
  biostat: "biostatistics",
  econ: "econometrics / ML",
  stats: "statistics / DAGs",
  genetics: "genetics"
};

// The sections of the glossary. A term's category places it under one heading in the map.
export type DisambiguationCategory =
  | "role" // what a third variable IS
  | "path" // structural identification: how confounding travels and how you block it
  | "interaction" // flavours of moderation
  | "assumption" // the conditions that make an effect identifiable
  | "estimand" // which effect you're actually estimating
  | "method" // how you compute the adjusted effect
  | "trap"; // adjustments that ADD bias

export const CATEGORY_ORDER: DisambiguationCategory[] = [
  "role",
  "path",
  "interaction",
  "assumption",
  "estimand",
  "method",
  "trap"
];

export const CATEGORY_LABELS: Record<DisambiguationCategory, string> = {
  role: "Roles — what a third variable does",
  path: "Paths & identification — how confounding travels and how you block it",
  interaction: "Interaction — how a moderator bends the effect",
  assumption: "Assumptions — the conditions that make an effect identifiable",
  estimand: "Estimands — which effect you're actually estimating",
  method: "Methods — how you compute the adjusted effect",
  trap: "Bad controls & pitfalls — adjustments that add bias"
};

export interface DisambiguationTerm {
  id: string;
  category: DisambiguationCategory;
  exampleId?: string; // the live example that instantiates this phenomenon, if any
  term: string;
  oneLiner: string;
  structure: string; // compact structural signature, e.g. "W → [A→Y]"
  alsoCalled: Array<{ name: string; field: DisambiguationField }>;
  distinctFrom: Array<{ term: string; because: string }>;
  anchors: Array<{ cite: string; note?: string }>;
  note?: string; // a sharp caveat worth surfacing
}

export const DISAMBIGUATION_TERMS: DisambiguationTerm[] = [
  // ── Roles: the noun — what a third variable IS relative to A and Y ──────────────────────────────
  {
    id: "confounder",
    category: "role",
    exampleId: "simpson-severity",
    term: "Confounder",
    oneLiner: "A common cause of both treatment and outcome — it opens a non-causal (backdoor) path you must block.",
    structure: "C → A, C → Y (fork)",
    alsoCalled: [
      { name: "common cause", field: "stats" },
      { name: "backdoor variable", field: "stats" },
      { name: "lurking variable", field: "psych" }
    ],
    distinctFrom: [
      { term: "Mediator", because: "a mediator is an effect of treatment (A → M), a confounder is a cause of it (C → A)" },
      { term: "Collider", because: "you must adjust for a confounder, but adjusting for a collider opens bias" }
    ],
    anchors: [{ cite: "Pearl, Causality" }, { cite: "Greenland, Pearl & Robins 1999" }],
    note: "Adjust to remove its bias. The crude vs adjusted contrast is the whole story."
  },
  {
    id: "mediator",
    category: "role",
    exampleId: "mediation-direct-total",
    term: "Mediator",
    oneLiner: "The mechanism on the causal path — treatment changes it, and it changes the outcome.",
    structure: "A → M → Y (chain)",
    alsoCalled: [
      { name: "intermediate variable", field: "epi" },
      { name: "surrogate / intermediary", field: "biostat" },
      { name: "intervening variable", field: "psych" }
    ],
    distinctFrom: [
      { term: "Moderator", because: "a mediator transmits the effect (chain); a moderator changes its size/sign (interaction)" },
      { term: "Confounder", because: "a mediator is endogenous — both an effect of A and a cause of Y; a confounder is exogenous" }
    ],
    anchors: [
      { cite: "Baron & Kenny 1986" },
      { cite: "Robins & Greenland 1992; VanderWeele", note: "natural direct / indirect effects" }
    ],
    note: "Decompose into direct vs indirect — do NOT adjust for it if you want the total effect."
  },
  {
    id: "moderator",
    category: "role",
    exampleId: "effect-modification-crossover",
    term: "Moderator",
    oneLiner: "A variable that changes the size — or sign — of treatment's effect. A node acting upon an edge.",
    structure: "W → [A→Y] (node-on-edge)",
    alsoCalled: [
      { name: "effect modifier", field: "epi" },
      { name: "heterogeneous treatment effect / CATE-varies", field: "econ" },
      { name: "interaction (W×A)", field: "stats" }
    ],
    distinctFrom: [
      { term: "Mediator", because: "the moderator is exogenous and interacts; the mediator is on the path and transmits" },
      { term: "Confounder", because: "a confounder biases the average effect; a moderator splits it into subgroups" }
    ],
    anchors: [
      { cite: "Baron & Kenny 1986" },
      { cite: "VanderWeele 2009", note: "effect modification ≠ interaction" }
    ],
    note: "Moderation = ANY interaction. The sign-flip is the special (crossover) case below."
  },
  {
    id: "collider",
    category: "role",
    exampleId: "berkson-hospital",
    term: "Collider",
    oneLiner: "A common effect of treatment and outcome. Conditioning on it INDUCES a spurious association.",
    structure: "A → S ← Y (inverted fork)",
    alsoCalled: [
      { name: "selection / Berkson bias", field: "epi" },
      { name: "explaining-away", field: "stats" }
    ],
    distinctFrom: [
      { term: "Confounder", because: "opposite remedies — leave a collider alone; adjust a confounder" }
    ],
    anchors: [{ cite: "Berkson 1946" }, { cite: "Hernán, Hernández-Díaz & Robins 2004" }],
    note: "The bias appears only when you condition / select on it."
  },
  {
    id: "instrument",
    category: "role",
    exampleId: "john-snow-cholera",
    term: "Instrument",
    oneLiner: "A cause of treatment that affects the outcome only through treatment — recovers effects under unmeasured confounding.",
    structure: "Z → A → Y, Z ⫫ U",
    alsoCalled: [
      { name: "instrumental variable (IV)", field: "econ" },
      { name: "natural experiment", field: "epi" },
      { name: "encouragement", field: "psych" }
    ],
    distinctFrom: [
      { term: "Confounder", because: "an instrument must NOT affect Y directly (exclusion restriction); a confounder does" }
    ],
    anchors: [
      { cite: "Snow 1855", note: "cholera & water companies — the first instrument" },
      { cite: "Angrist, Imbens & Rubin 1996" },
      { cite: "Deaton & Cartwright 2018", note: "natural experiments" }
    ],
    note: "2SLS estimates a LATE under exclusion + independence — the effect among those the instrument moves, not the same estimand as adjustment."
  },

  // ── Paths & identification: the verbs — how confounding travels and how you shut it off ──────────
  {
    id: "backdoor-path",
    category: "path",
    term: "Backdoor path",
    oneLiner: "A non-causal path from treatment to outcome that starts with an arrow INTO treatment — the route confounding travels. Block it and the bias is gone.",
    structure: "A ← C → Y (arrow into A)",
    alsoCalled: [
      { name: "confounding path", field: "epi" },
      { name: "spurious / non-causal path", field: "stats" }
    ],
    distinctFrom: [
      { term: "Causal (directed) path", because: "a backdoor starts with an arrow INTO A; the effect itself flows along paths OUT of A (A → … → Y)" },
      { term: "Collider path", because: "a path through a collider is already CLOSED — conditioning on the collider OPENS it, the reverse of a confounding fork" }
    ],
    anchors: [{ cite: "Pearl 1993; Pearl, Causality", note: "the backdoor criterion" }],
    note: "Backdoor CRITERION: a variable set is a valid adjustment set if it blocks every backdoor path and contains no descendant of A."
  },
  {
    id: "adjustment-set",
    category: "path",
    exampleId: "flexible-adjustment",
    term: "Adjustment set",
    oneLiner: "The variables you condition on to block every backdoor path — what 'controlling for confounders' actually means.",
    structure: "a set that blocks all A ← … → Y",
    alsoCalled: [
      { name: "sufficient / conditioning set", field: "stats" },
      { name: "controls / covariate set", field: "econ" },
      { name: "confounder set", field: "epi" }
    ],
    distinctFrom: [
      { term: "Every available covariate", because: "more is not safer — adjusting for a mediator or a collider ADDS bias; a valid set blocks backdoors and touches no descendant of A" }
    ],
    anchors: [{ cite: "Pearl, Causality", note: "backdoor criterion" }, { cite: "VanderWeele 2019", note: "disjunctive-cause rule for choosing one" }],
    note: "Rarely unique — several sets satisfy the criterion, and the minimal one isn't always the most efficient."
  },
  {
    id: "front-door",
    category: "path",
    exampleId: "front-door-smoking",
    term: "Front-door adjustment",
    oneLiner: "Identify the effect through a fully-mediating mechanism when the confounder is UNMEASURED — chain two clean adjustments along A → M → Y.",
    structure: "A → M → Y with unobserved U → A, U → Y",
    alsoCalled: [
      { name: "front-door criterion", field: "stats" },
      { name: "mechanism-based identification", field: "epi" }
    ],
    distinctFrom: [
      { term: "Backdoor adjustment", because: "backdoor blocks confounding by conditioning on common causes; front-door routes AROUND an unmeasured one through a clean mediator" },
      { term: "Instrument", because: "an IV sits UPSTREAM of A with an exclusion restriction; the front-door mediator sits BETWEEN A and Y and must carry the whole effect" }
    ],
    anchors: [{ cite: "Pearl 1995", note: "front-door criterion — smoking → tar → cancer" }],
    note: "Needs a mediator with no unblocked backdoor of its own that fully transmits A's effect — rare in practice, elegant in principle."
  },
  {
    id: "d-separation",
    category: "path",
    term: "d-separation (blocking a path)",
    oneLiner: "The graphical rule for when a path carries no association: it's BLOCKED at a chain/fork you condition on, or at a collider you do NOT condition on.",
    structure: "chain/fork: block by conditioning · collider: block by NOT conditioning",
    alsoCalled: [
      { name: "directional separation", field: "stats" },
      { name: "conditional independence in the DAG", field: "econ" }
    ],
    distinctFrom: [
      { term: "Marginal independence", because: "d-separation is independence GIVEN a conditioning set — the same path is open or closed depending on what you condition on" }
    ],
    anchors: [{ cite: "Pearl 1988", note: "d-separation" }, { cite: "Verma & Pearl 1988" }],
    note: "The engine under everything else: 'adjust for a confounder' = close a fork; 'don't touch a collider' = keep it closed."
  },

  // ── Interaction: how a moderator bends the effect ────────────────────────────────────────────────
  {
    id: "crossover",
    category: "interaction",
    exampleId: "effect-modification-crossover",
    term: "Crossover (disordinal) interaction",
    oneLiner: "Moderation that flips the SIGN: treatment helps in one regime and hurts in the other.",
    structure: "W → [A→Y], strong enough to cross",
    alsoCalled: [
      { name: "qualitative interaction", field: "biostat" },
      { name: "sign-reversing effect modification", field: "epi" }
    ],
    distinctFrom: [
      { term: "Ordinal interaction", because: "ordinal keeps the sign; disordinal reverses it within the observed range" }
    ],
    anchors: [{ cite: "Gail & Simon 1985", note: "test for qualitative interaction" }],
    note: "Scale-INVARIANT — no monotone re-scaling removes a sign flip. The marginal effect can hide it entirely."
  },
  {
    id: "ordinal",
    category: "interaction",
    exampleId: "effect-modification-ordinal",
    term: "Ordinal interaction",
    oneLiner: "Moderation that changes the SIZE but not the sign — the lines fan out but don't cross.",
    structure: "W → [A→Y], magnitude only",
    alsoCalled: [
      { name: "quantitative interaction", field: "biostat" },
      { name: "non-crossover interaction", field: "epi" }
    ],
    distinctFrom: [
      { term: "Crossover interaction", because: "the sign never reverses, so the marginal effect still points the right way" }
    ],
    anchors: [{ cite: "Widaman et al. 2023", note: "ordinal vs disordinal; Johnson–Neyman region" }],
    note: "Scale-DEPENDENT — can appear on the additive scale but vanish on the multiplicative, or vice versa."
  },
  {
    id: "moderated-mediation",
    category: "interaction",
    exampleId: "moderated-mediation",
    term: "Moderated mediation",
    oneLiner: "Treatment moves a single behavior; a moderator decides whether more of it helps or hurts — it gates the mediator's edge.",
    structure: "A → M → Y, W → [M→Y]",
    alsoCalled: [
      { name: "conditional indirect effect", field: "psych" },
      { name: "second-stage moderation", field: "stats" }
    ],
    distinctFrom: [
      { term: "Mediated moderation", because: "here a moderator acts on a mediated path; there a mediator carries a moderation effect" },
      { term: "Moderator", because: "the gate sits on the M→Y edge, not the A→Y edge — the indirect effect is what flips" }
    ],
    anchors: [{ cite: "Preacher, Rucker & Hayes 2007" }],
    note: "The cleanest generator of a crossover: one mediating behavior whose valence the regime sets."
  },
  {
    id: "mediated-moderation",
    category: "interaction",
    term: "Mediated moderation",
    oneLiner: "An interaction (W×A) whose effect is itself transmitted through a mediator — the moderation is mediated.",
    structure: "W×A → M → Y",
    alsoCalled: [{ name: "indirect interaction effect", field: "psych" }],
    distinctFrom: [
      { term: "Moderated mediation", because: "swap what's nested: a mediator carrying a moderation vs a moderator on a mediation" }
    ],
    anchors: [{ cite: "Muller, Judd & Yzerbyt 2005" }],
    note: "Easily confused with moderated mediation — they are formally distinct nestings."
  },
  {
    id: "epistasis",
    category: "interaction",
    exampleId: "epistasis-coat-color",
    term: "Epistasis",
    oneLiner: "Gene–gene interaction: one locus changes the effect of another on a trait.",
    structure: "Gene B → [Gene A → trait]",
    alsoCalled: [
      { name: "gene–gene interaction", field: "genetics" },
      { name: "effect modification by genotype", field: "epi" },
      { name: "statistical interaction", field: "stats" }
    ],
    distinctFrom: [
      { term: "Moderator", because: "epistasis IS moderation, named for genetics — two loci, one moderating the other's effect" },
      { term: "Additive effects", because: "additivity = the loci act independently; epistasis is the departure from it (Fisher)" }
    ],
    anchors: [
      { cite: "Bateson 1909", note: "biological epistasis (masking)" },
      { cite: "Fisher 1918", note: "statistical epistasis (non-additivity)" }
    ],
    note: "Epistatic gene = the masker; hypostatic = the masked. Recessive epistasis: ee masks the other locus."
  },

  // ── Assumptions: the conditions that make an effect identifiable ─────────────────────────────────
  {
    id: "positivity",
    category: "assumption",
    exampleId: "positivity-correlated-confounders",
    term: "Positivity (overlap)",
    oneLiner: "Every kind of person has a non-zero chance of each treatment — so there's something to compare. Where it fails, no method adjusts; it can only extrapolate.",
    structure: "0 < P(A = a | L) < 1 for all L",
    alsoCalled: [
      { name: "overlap / common support", field: "econ" },
      { name: "experimental treatment assignment", field: "biostat" }
    ],
    distinctFrom: [
      { term: "Exchangeability", because: "exchangeability is about WHICH confounders you measured; positivity is whether each treatment is actually observed within their strata" }
    ],
    anchors: [{ cite: "Hernán & Robins, Causal Inference" }, { cite: "Petersen et al. 2012", note: "positivity violations" }],
    note: "The one assumption you can partly CHECK from data — thin overlap shows as extreme propensity scores and exploding IP weights."
  },
  {
    id: "exchangeability",
    category: "assumption",
    term: "Exchangeability (no unmeasured confounding)",
    oneLiner: "Given the measured confounders, treated and untreated are comparable — treatment is 'as good as random' within strata of L.",
    structure: "Y(a) ⫫ A | L",
    alsoCalled: [
      { name: "ignorability / no unmeasured confounding", field: "biostat" },
      { name: "conditional independence / selection on observables", field: "econ" },
      { name: "no omitted-variable bias", field: "econ" }
    ],
    distinctFrom: [
      { term: "Positivity", because: "exchangeability = you measured the right confounders; positivity = each treatment actually occurs within their strata. Adjustment needs both" },
      { term: "Consistency", because: "consistency links the observed outcome to the potential outcome under the treatment received; exchangeability is about confounding" }
    ],
    anchors: [{ cite: "Rosenbaum & Rubin 1983" }, { cite: "Hernán & Robins" }],
    note: "The UNTESTABLE assumption — why observational causal claims always rest on a substantive argument, not just the data."
  },
  {
    id: "consistency-sutva",
    category: "assumption",
    term: "Consistency & SUTVA",
    oneLiner: "The treatment is well-defined and one person's treatment doesn't affect another's outcome — so do(A=a) means the same thing for everyone.",
    structure: "Y = Y(a) when A = a ; no interference",
    alsoCalled: [
      { name: "stable unit treatment value assumption (SUTVA)", field: "stats" },
      { name: "no interference / no spillover", field: "econ" },
      { name: "well-defined intervention", field: "epi" }
    ],
    distinctFrom: [
      { term: "Exchangeability", because: "consistency is about the treatment being well-defined and non-interfering; exchangeability is about confounding" }
    ],
    anchors: [{ cite: "Rubin 1980", note: "SUTVA" }, { cite: "VanderWeele 2009", note: "consistency & well-defined exposures" }],
    note: "Vague exposures ('obesity', 'race') strain consistency — the effect of WHICH intervention? Interference breaks it in networks/vaccines."
  },

  // ── Estimands: which effect you're actually estimating ───────────────────────────────────────────
  {
    id: "ate",
    category: "estimand",
    term: "ATE — average treatment effect",
    oneLiner: "The effect if you treated EVERYONE vs no one — the population-average contrast of potential outcomes.",
    structure: "E[Y(1) − Y(0)]",
    alsoCalled: [
      { name: "average causal effect", field: "epi" },
      { name: "marginal / population effect", field: "biostat" }
    ],
    distinctFrom: [
      { term: "ATT", because: "the ATE averages over the whole population; the ATT averages only over the treated (who may differ)" },
      { term: "LATE", because: "the ATE is for everyone; the LATE is only for those an instrument moves (compliers)" }
    ],
    anchors: [{ cite: "Rubin 1974" }, { cite: "Imbens & Rubin 2015" }],
    note: "The default target of adjustment / g-formula / IPW. It's a CONTRAST of two do() worlds, not a conditional mean."
  },
  {
    id: "att",
    category: "estimand",
    term: "ATT / ATC — effect on the treated / untreated",
    oneLiner: "The effect among the people who actually got treated (ATT) — or who didn't (ATC). The policy-relevant one when treatment isn't for everyone.",
    structure: "E[Y(1) − Y(0) | A = 1]",
    alsoCalled: [
      { name: "effect of treatment on the treated (ETT)", field: "econ" },
      { name: "treatment effect on the treated", field: "biostat" }
    ],
    distinctFrom: [
      { term: "ATE", because: "the ATT conditions on the treated subpopulation; the ATE averages over everyone. They differ when the treated aren't representative" }
    ],
    anchors: [{ cite: "Heckman, Ichimura & Todd 1997" }, { cite: "Imbens 2004" }],
    note: "Matching (matching to the treated) targets the ATT, not the ATE — the estimand shifts with the method."
  },
  {
    id: "late",
    category: "estimand",
    term: "LATE — local (complier) average effect",
    oneLiner: "The IV estimand: the effect only among those the instrument actually moves into treatment (the compliers) — not the whole population.",
    structure: "E[Y(1) − Y(0) | complier]",
    alsoCalled: [
      { name: "complier average causal effect (CACE)", field: "biostat" },
      { name: "local average treatment effect", field: "econ" }
    ],
    distinctFrom: [
      { term: "ATE", because: "the LATE is defined on a subgroup you can't identify by name (compliers), so it need not equal the population ATE" },
      { term: "Instrument", because: "the instrument is the variable; the LATE is the estimand it identifies" }
    ],
    anchors: [{ cite: "Imbens & Angrist 1994" }, { cite: "Angrist, Imbens & Rubin 1996" }],
    note: "Different instruments move different compliers → different LATEs. Monotonicity (no defiers) is what makes it a clean subgroup."
  },
  {
    id: "cate",
    category: "estimand",
    term: "CATE — conditional average effect",
    oneLiner: "The treatment effect at a given covariate value — the effect FOR a subgroup, the object heterogeneity / moderation is about.",
    structure: "E[Y(1) − Y(0) | X = x]",
    alsoCalled: [
      { name: "heterogeneous treatment effect (HTE)", field: "econ" },
      { name: "subgroup / stratum-specific effect", field: "biostat" },
      { name: "individualized treatment effect (≈)", field: "stats" }
    ],
    distinctFrom: [
      { term: "Moderator", because: "the moderator is the VARIABLE whose value changes the effect; the CATE is the resulting effect at each value" },
      { term: "ATE", because: "the ATE averages the CATE over the population; a flat CATE means no effect modification" }
    ],
    anchors: [{ cite: "Athey & Imbens 2016", note: "causal trees / forests" }, { cite: "Künzel et al. 2019", note: "meta-learners" }],
    note: "A fitted CATE can be locally wrong yet average to the right ATE, or vice versa — check both."
  },
  {
    id: "effect-scale",
    category: "estimand",
    term: "Effect scale — difference vs. ratio vs. odds",
    oneLiner: "The SAME effect looks different on the risk-difference, risk-ratio, and odds-ratio scales — and whether an interaction 'exists' can flip between them.",
    structure: "RD = p1 − p0 · RR = p1 / p0 · OR = odds1 / odds0",
    alsoCalled: [
      { name: "additive vs multiplicative scale", field: "epi" },
      { name: "absolute vs relative effect", field: "biostat" }
    ],
    distinctFrom: [
      { term: "Crossover interaction", because: "a sign flip (crossover) is scale-invariant; an ordinal interaction can appear on one scale and vanish on another" }
    ],
    anchors: [{ cite: "VanderWeele & Knol 2014" }, { cite: "Greenland 1979", note: "non-collapsibility of the OR" }],
    note: "The odds ratio is NON-COLLAPSIBLE — it can change when you add a covariate even with no confounding. The risk difference/ratio are collapsible."
  },

  // ── Methods: how you compute the adjusted effect ─────────────────────────────────────────────────
  {
    id: "do-operator",
    category: "method",
    term: "do-operator — do(A = a)",
    oneLiner: "The mathematical 'force everyone to A = a': it deletes A's incoming arrows and reads off the outcome. Intervening, not observing.",
    structure: "P(Y | do(A = a)) ≠ P(Y | A = a)",
    alsoCalled: [
      { name: "intervention / graph surgery", field: "stats" },
      { name: "potential outcome Y(a)", field: "biostat" }
    ],
    distinctFrom: [
      { term: "Conditioning P(Y | A = a)", because: "conditioning SELECTS the subgroup who chose A = a (confounded); do() FORCES A on everyone (unconfounded) — the whole point" }
    ],
    anchors: [{ cite: "Pearl 1995; Pearl, Causality" }],
    note: "The oracle re-runs the true model under each do(); every estimator tries to recover P(Y | do(A)) from observational P(Y | A, L)."
  },
  {
    id: "g-formula",
    category: "method",
    term: "Standardization (g-formula)",
    oneLiner: "Model the outcome given treatment and confounders, predict everyone under each treatment, then average — 'plug in do(A=a) and marginalize over L.'",
    structure: "Σ_l E[Y | A = a, L = l] · P(L = l)",
    alsoCalled: [
      { name: "g-computation / parametric g-formula", field: "epi" },
      { name: "regression standardization / marginal effects", field: "biostat" },
      { name: "outcome regression + averaging", field: "econ" }
    ],
    distinctFrom: [
      { term: "IPW", because: "standardization models the OUTCOME (Y | A, L); IPW models the TREATMENT (A | L). Doubly-robust methods use both" },
      { term: "Regression coefficient", because: "the g-formula MARGINALIZES the prediction; a single coefficient is conditional and (for the OR) non-collapsible" }
    ],
    anchors: [{ cite: "Robins 1986" }, { cite: "Hernán & Robins" }],
    note: "With the TRUE model this is the oracle. From data, it's only as good as the fitted outcome model."
  },
  {
    id: "ipw",
    category: "method",
    term: "Propensity score & IPW",
    oneLiner: "The propensity is P(treatment | confounders); re-weighting by its inverse builds a pseudo-population where treatment is unconfounded.",
    structure: "e(L) = P(A = 1 | L) ; weight = 1 / P(A | L)",
    alsoCalled: [
      { name: "inverse-probability weighting / MSM", field: "epi" },
      { name: "propensity-score weighting", field: "biostat" }
    ],
    distinctFrom: [
      { term: "Standardization", because: "IPW models the TREATMENT; standardization models the OUTCOME" },
      { term: "Matching", because: "matching pairs/discards units on the propensity; IPW keeps all units and re-weights them" }
    ],
    anchors: [{ cite: "Rosenbaum & Rubin 1983", note: "propensity score" }, { cite: "Robins, Hernán & Brumback 2000", note: "marginal structural models" }],
    note: "The propensity is a BALANCING score — conditioning on it alone suffices. Thin overlap makes weights explode (see positivity)."
  },
  {
    id: "matching",
    category: "method",
    term: "Matching",
    oneLiner: "Pair each treated unit with untreated look-alikes (on covariates or the propensity), then compare within pairs — approximating a randomized comparison.",
    structure: "match on L or e(L), then contrast",
    alsoCalled: [
      { name: "propensity-score matching", field: "biostat" },
      { name: "nearest-neighbour / caliper matching", field: "econ" }
    ],
    distinctFrom: [
      { term: "IPW", because: "matching prunes to a comparable subset (usually the ATT); IPW re-weights the full sample" },
      { term: "Adjustment set", because: "matching still needs the RIGHT covariates (a valid adjustment set) to remove confounding; matching is just how you use them" }
    ],
    anchors: [{ cite: "Rubin 1973" }, { cite: "Stuart 2010", note: "matching methods review" }],
    note: "Targets the ATT by default (matches to the treated). Discarded unmatched units change the estimand's population."
  },
  {
    id: "aipw",
    category: "method",
    term: "Doubly-robust (AIPW)",
    oneLiner: "Combine an outcome model and a treatment model so the estimate is right if EITHER one is correct — two chances to be unbiased.",
    structure: "IPW estimate + outcome-model correction",
    alsoCalled: [
      { name: "augmented IPW (AIPW)", field: "biostat" },
      { name: "double / debiased ML (TMLE, DML)", field: "econ" }
    ],
    distinctFrom: [
      { term: "Standardization", because: "standardization needs the OUTCOME model right; AIPW also survives a wrong outcome model if the treatment model is right (and vice versa)" }
    ],
    anchors: [{ cite: "Robins, Rotnitzky & Zhao 1994" }, { cite: "Chernozhukov et al. 2018", note: "double ML" }],
    note: "Double robustness is about BIAS, not a free lunch — both models wrong still biases it, and it needs positivity like IPW."
  },

  // ── Bad controls & pitfalls: adjustments that ADD bias ───────────────────────────────────────────
  {
    id: "bad-control",
    category: "trap",
    term: "Bad control (overadjustment)",
    oneLiner: "Adding a variable that isn't a confounder — a mediator, a collider, or a descendant of treatment — and making the estimate WORSE, not better.",
    structure: "adjusting a mediator / collider / descendant of A",
    alsoCalled: [
      { name: "overadjustment bias", field: "epi" },
      { name: "controlling away the effect", field: "econ" }
    ],
    distinctFrom: [
      { term: "Adjustment set", because: "a valid set blocks backdoors and touches no descendant of A; a bad control breaks one of those rules" },
      { term: "Confounder", because: "adjusting a confounder REMOVES bias; adjusting a mediator/collider ADDS it — 'more controls' is not safer" }
    ],
    anchors: [{ cite: "Cinelli, Forney & Pearl 2022", note: "a crash course in good and bad controls" }, { cite: "Schisterman et al. 2009", note: "overadjustment" }],
    note: "Adjusting a MEDIATOR removes part of the real effect; adjusting a COLLIDER invents a fake one."
  },
  {
    id: "m-bias",
    category: "trap",
    exampleId: "m-bias-adjustment",
    term: "M-bias",
    oneLiner: "A pre-treatment variable can still be a bad control: adjusting for a collider between two hidden causes OPENS a path that was closed.",
    structure: "A ← U1 → C ← U2 → Y (adjusting C opens it)",
    alsoCalled: [
      { name: "collider-stratification bias (pre-treatment)", field: "epi" },
      { name: "butterfly / M-structure bias", field: "stats" }
    ],
    distinctFrom: [
      { term: "Confounder", because: "C is NOT a common cause of A and Y — it's a collider. Adjusting it (the reflex 'control for baseline covariates') creates bias" }
    ],
    anchors: [{ cite: "Greenland 2003" }, { cite: "Ding & Miratrix 2015", note: "to adjust or not for M-bias" }],
    note: "The counterexample to 'always adjust for pre-treatment covariates' — being pre-treatment doesn't make a variable safe."
  },
  {
    id: "selection-bias",
    category: "trap",
    term: "Selection bias",
    oneLiner: "Conditioning on how the SAMPLE was selected — a common effect of treatment and outcome — induces an association that isn't causal.",
    structure: "A → S ← Y, analysis restricted to S",
    alsoCalled: [
      { name: "collider / Berkson bias", field: "epi" },
      { name: "sample-selection bias", field: "econ" }
    ],
    distinctFrom: [
      { term: "Confounding", because: "confounding is a common CAUSE (fix by adjusting); selection bias is a common EFFECT you conditioned on (fix by not selecting, or re-weighting)" },
      { term: "Collider", because: "same structure — selection bias is what collider-conditioning looks like at the level of who's in your data" }
    ],
    anchors: [{ cite: "Hernán, Hernández-Díaz & Robins 2004", note: "a structural approach to selection bias" }, { cite: "Heckman 1979", note: "sample selection" }],
    note: "Survivorship, healthy-worker, loss-to-follow-up, case-control on a collider — all the same M-shaped mistake."
  },
  {
    id: "table-2-fallacy",
    category: "trap",
    term: "Table-2 fallacy",
    oneLiner: "Reading EVERY coefficient in one adjusted regression as its own causal effect. Only the exposure's is (maybe) causal — the controls' are usually still confounded.",
    structure: "one model, many coefficients ≠ many effects",
    alsoCalled: [
      { name: "mutual-adjustment fallacy", field: "epi" },
      { name: "interpreting control coefficients causally", field: "stats" }
    ],
    distinctFrom: [
      { term: "Adjustment set", because: "a set chosen to identify A→Y does NOT simultaneously identify each covariate→Y; every effect needs its own adjustment set" }
    ],
    anchors: [{ cite: "Westreich & Greenland 2013", note: "the Table 2 fallacy" }],
    note: "A model that de-confounds A→Y typically leaves the confounders' own effects confounded (by each other, by A, by mediators)."
  }
];

// Reference-only distinctions that aren't a single DGP — the gotchas behind the vocabulary. These power
// the glossary map's 'pitfalls' section.
export interface DisambiguationDistinction {
  id: string;
  title: string;
  body: string;
  anchor: string;
}

export const DISAMBIGUATION_DISTINCTIONS: DisambiguationDistinction[] = [
  {
    id: "synonymy",
    title: "Same thing, three names",
    body: "Moderation (psychology) = effect modification (epidemiology) = heterogeneous treatment effects / CATE-varies (econometrics, causal ML). One phenomenon, different vocabularies — the source of most cross-field confusion.",
    anchor: "Baron & Kenny 1986; VanderWeele; Athey & Imbens"
  },
  {
    id: "em-vs-interaction",
    title: "Effect modification ≠ interaction",
    body: "Effect modification asks how ONE intervention's effect varies across strata of a factor (the modifier need not be manipulable). Interaction concerns intervening on TWO exposures jointly. You can have one without the other.",
    anchor: "VanderWeele 2009"
  },
  {
    id: "four-types",
    title: "Four types of effect modifier",
    body: "A variable that statistically modifies an effect can be a causal modifier (direct), or a mere marker: indirect, by proxy, or by a common cause. A 'moderator' you discover may not be a causal one.",
    anchor: "VanderWeele & Robins 2007"
  },
  {
    id: "scale",
    title: "Scale dependence",
    body: "Whether an ordinal interaction exists depends on the scale (additive vs multiplicative / risk difference vs ratio). A crossover (qualitative interaction) is the exception — a sign flip is scale-invariant.",
    anchor: "VanderWeele & Knol 2014; Gail & Simon 1985"
  },
  {
    id: "relational",
    title: "Roles are relational, not intrinsic",
    body: "Confounder / mediator / moderator / collider are roles a variable plays relative to a DAG and an estimand — not fixed properties. The same variable can be a moderator of A→Y and, on another path, a mediator.",
    anchor: "Pearl; VanderWeele"
  }
];

export function disambiguationTermForExample(exampleId: string | null | undefined): DisambiguationTerm | null {
  if (!exampleId) return null;
  return DISAMBIGUATION_TERMS.find((term) => term.exampleId === exampleId) ?? null;
}
