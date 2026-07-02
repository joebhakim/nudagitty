// Term-disambiguation registry: the cross-field / cross-author vocabulary for the phenomena the app
// teaches. Consumed by (a) the per-example reference card and (b) the standalone glossary map. This is
// reference content, not simulation — kept here so both surfaces speak the same, sourced vocabulary.
//
// Sources distilled from the project's terminology research: Baron & Kenny (1986) moderator/mediator;
// VanderWeele (2009) effect modification vs interaction + VanderWeele & Robins (2007) four types of
// effect modifier; Gail & Simon (1985) qualitative interaction; Preacher, Rucker & Hayes (2007)
// moderated mediation; Muller, Judd & Yzerbyt (2005) mediated moderation.

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

export interface DisambiguationTerm {
  id: string;
  exampleId?: string; // the live example that instantiates this phenomenon, if any
  term: string;
  oneLiner: string;
  structure: string; // compact structural signature, e.g. "W → [A→Y]"
  alsoCalled: Array<{ name: string; field: DisambiguationField }>;
  distinctFrom: Array<{ term: string; because: string }>;
  anchors: Array<{ cite: string; note?: string }>;
  note?: string; // a sharp caveat worth surfacing
}

// The four causal roles a third variable can play, plus the interaction sub-distinctions. Order is the
// teaching order: the roles first (what people confuse), then the interaction flavours.
export const DISAMBIGUATION_TERMS: DisambiguationTerm[] = [
  {
    id: "confounder",
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
  // Paths & identification — the procedural vocabulary (used throughout but previously unexplained):
  // how confounding travels and how you shut it off. The roles above are the NOUNS; these are the VERBS.
  {
    id: "backdoor-path",
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
  {
    id: "crossover",
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
