# Causal operations: intervene, select, condition, adjust

Nudagitty distinguishes four operations you can apply to a variable `V` when reading a
relationship between an exposure `X` and an outcome `Y`. They are technically distinct in
causal inference, and the app keeps them distinct on **two orthogonal axes**.

## The two axes

- **Axis A — graphical conditioning membership.** Does `V` enter the conditioning set used
  for d-separation? `select`, `condition`, and `adjust` all do; `intervene` does not
  (it mutates the graph instead). On this axis the three conditioning operations are
  *identical* — they block non-colliders and **open colliders** exactly alike. This is why
  `analysis.ts` historically lumped them into one `conditioned` set.

- **Axis B — estimand operation.** *What number* the operation produces, and over what
  population. Here the three conditioning operations diverge sharply.

| Operation | Estimand (formal) | Strata of V used | Re-marginalize over V? | Population | Intent |
|---|---|---|---|---|---|
| **Intervene** `do(V=v)` | `P(Y \| do(V=v))` | — | — | counterfactual | manipulate the system |
| **Select** on `V=v` | `P(Y \| X, V=v)` | one (`v`); complement **unobservable** | No | the selected sub-population | sampling / a bias to expose |
| **Condition** on `V` | `{ P(Y \| X, V=v) }` for each `v`, shown **separately** | all, kept apart | No | each stratum | a diagnostic |
| **Adjust** for `V` | `Σ_v P(Y \| X, v) · P(v)` | all, **combined** | **Yes** | the whole population | backdoor identification |

### Precise relationships

- **Conditioning** is the primitive: hold/stratify `V`. Selection and adjustment are
  *specific uses* of conditioning.
- **Selection** is conditioning on **one** level as a *sample-inclusion* criterion. You keep
  only `V=v`; the complement is not merely ignored, it is **unobserved** (it never entered
  the data). You stay inside the sub-population — no re-marginalization.
- **Adjustment** is conditioning on **all** levels **and then standardizing** — re-weighting
  the strata by `P(V)` back to the population. This is the only operation that re-marginalizes,
  and the only one whose intent is to *identify a causal effect* (the backdoor adjustment
  formula).
- Adjustment requires you to **observe every stratum**. Selection means you cannot — so for a
  selection-biased dataset you literally cannot adjust your way out; only the unconditioned
  ("crude") view or an external population is unbiased.

## Why the distinction matters: confounder vs collider

The same operation has *opposite* value depending on the variable's graphical role.

- **Confounder** (e.g. Simpson's `Severity`, a common cause of `X` and `Y`): the crude
  estimate is **biased**; **adjusting** for it **removes** the bias. Selecting/conditioning on
  one stratum gives the within-stratum truth but not the population effect.
- **Collider** (e.g. the cats `Brought_to_vet`, a common effect of `Survival` and `Injury`):
  the crude/unconditioned estimate is **unbiased**; **any** conditioning operation
  (select, condition, *or* adjust) **introduces** bias by opening the collider path —
  adjustment included. "Adjust for everything" is wrong; the DAG says which variables to leave
  alone.

So the app refuses to treat "adjust" as universally good. Each conditioning operation on a
variable is classified against the target estimand as one of:

- **backdoor** — a valid adjuster (blocks a backdoor path, opens none),
- **neutral** — conditioning neither helps nor hurts identification,
- **collider** — conditioning opens a biasing path (a *bad control*); the operation's estimand
  is biased and the banner names the specific path it opens.

## How this maps onto the data model

- `intervene` → `SimulationSpec.overrides` (the value, with incoming edges cut).
- `select` → `SimulationSpec.selections` (a `SimulationSelectionCondition`; one stratum).
- `condition` / `adjust` → the variable's `adjustment` bins/cutpoints; `condition` shows the
  strata, `adjust` standardizes them.
- The single source of truth is `VariableModel.analysisOperation`
  (`"none" | "intervene" | "select" | "condition" | "adjust"`). The legacy
  `roles.adjusted` / `roles.selected` booleans are derived from it for compatibility.
- `exposure` / `outcome` / `latent` remain **structural roles**, orthogonal to the operation.

## Reading the output

Every result frame states its estimand **formally and in plain language**, e.g.:

- Select: `P(Survival | Fall, Brought_to_vet = 1)` — "association among recorded cats only;
  the unrecorded cats are not in the data."
- Condition: `{ P(Survival | Fall, Brought_to_vet = s) }` — "the relationship within each
  stratum, shown side by side; not combined."
- Adjust: `Σ_s P(Survival | Fall, s) · P(s)` — "standardized over Brought_to_vet; valid only
  if it blocks all backdoor paths and opens none."

When the chosen variable is a collider for `X → Y`, the frame shows a **bad-control** warning
naming the opened path and pointing to the unbiased alternative (the unconditioned estimate).
