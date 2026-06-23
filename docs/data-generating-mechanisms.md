# Data-generating mechanisms (DGM toolbox)

Status: in progress on branch `dgm-toolbox`. Phase 1 (DGP transparency) shipped; copula /
plasmode / generative are staged behind it.

## Why

Our examples generate the confounder vector **L** as a set of **independent univariate root
nodes**, each feeding both treatment and outcome. Two problems we turn into features:

1. **Fidelity.** Real covariates are jointly *dependent*. Edgeless roots encode mutual
   independence, which makes the joint unrealistic, gives artificially perfect overlap /
   positivity (adjustment looks easier than reality), and well-conditions the nuisance models.
   Independence does **not** bias the estimand (you adjust for the whole vector L) — it
   misrepresents the data.
2. **Transparency.** The DGP was opaque — coefficients/distributions were scattered across the
   per-node/edge editors with no holistic view. Building richer DGMs forces us to make it explicit.

The methods literature moved past independent-parametric covariates long ago:
parametric-with-specified-dependence (Gaussian copula / NORTA, Cario & Nelson 1997),
semi-synthetic / **plasmode** (real covariates + simulated A,Y with known truth; Franklin et al.
2014; ACIC / Dorie et al. 2019; IHDP / Hill 2011), and **generative** (learned joint; Athey et
al. WGAN). This toolbox brings those in as first-class, **visible, inspectable** machinery.

## The DGM families

| Family | How L is generated | Data needed | Status |
|---|---|---|---|
| **Independent parametric** | each `L_i` an independent univariate draw | none | shipped (the baseline) |
| **Confounder DAG** | edges *among* the covariates (sequential factorization) | none | planned (no engine work) |
| **Gaussian copula / NORTA** | shared latent-Gaussian source → per-covariate inverse-CDF to its marginal; correlation via factor loadings | none (or fit) | planned (Phase 2) |
| **Plasmode** | shared row-index source → each covariate reads its column from embedded real rows | real data | planned (Phase 3) |
| **Generative** | resample an offline-synthesized dataset (stand-in); later: in-browser learned joint | trained generator | stand-in planned; real version deferred |

In every family the treatment and outcome stay as ordinary structural equations on L
(`A|L`, `Y|A,L`), so the **true effect is known** (we set it) — only L's joint changes.

## Engine approach: a visible "covariate source" inside the existing SEM

Rather than a parallel subsystem, correlated covariates come from a **shared, visible source
node** feeding each covariate. Two new primitives (shipped):

- **`copula_marginal`** — a NODE COMBINER (`NodeCombinerKind`). A covariate's latent-Gaussian
  linear predictor η (latent-source loadings + residual, so η ~ N(0,1)) is mapped
  `L = F⁻¹(Φ(η))` to its target marginal `F` (the node's `distribution`). One-factor copula:
  pairwise corr ≈ loadingᵢ·loadingⱼ. The transform wraps the *whole* η, so it is a combiner, not
  an edge mechanism. Interpreted path applies it; compiled + analytic-joint bail.
- **`table_lookup`** — an EDGE MECHANISM (plasmode / generative): a shared integer row-index
  source → `dataTable[row][col]`, resolved from the `datasets.ts` registry by `dataset` /
  `dataColumn`. The real (or offline-synthetic) joint is reproduced exactly because every
  covariate reads the *same* drawn row. Compiled path handles it via its default edge fn.

Both are pure functions of a shared parent, so they fit the topological forward pass,
intervention overrides, and the compiled fast path (which falls back to interpreted for these).
The analytic linear-Gaussian joint declines them (empirical fallback), which is correct.

Source nodes are rendered **visibly and styled distinctly** ("show the plumbing"), and excluded
from estimand/adjustment logic.

## DGP inspector (shipped)

A read-only "Data-generating process" panel (Σ button in the toolbar → modal), in
`apps/web/src/outputs/DgpInspector.tsx`. Derived live from `document.simulation` (the mechanism
spec) and the realized `SimulationResult`:

1. **Data-generating mechanism** — auto-detected family + a plain-language note.
2. **Structural equations** — each node in topological order, e.g.
   `Weight_gain = 11.5 + 0.60·Sex + −0.13·Age + … + 3.50·Quit_smoking + ε, ε ~ Normal(0, 7.5)`.
3. **Covariate joint** — the **empirical correlation matrix** (heatmap) of the confounders. For
   independent covariates the off-diagonals are ≈0 (visible proof); copula/plasmode light it up.
4. **Marginals** table, **Link-coefficient** table.
5. **Imposed truth** — the structural `A→Y` effect, explicitly labeled *our construction, not a
   published estimate*.

It immediately surfaced two latent bugs in `what-if-nhefs-weight-gain`: `Sex` set via
`setLogitNode` on a *root* (so it sampled its constant distribution → everyone male, inert), and
`Sex→Weight_gain` defaulting to coefficient 1.0. Both fixed.

## Examples

- **Paired contrast** on smoking → weight gain (same +3.5 kg truth; only L's joint differs):
  independent (the relabeled `what-if-nhefs-weight-gain`), confounder-DAG, copula, plasmode
  (NHEFS), generative (stand-in). Flipping between them shows how positivity/overlap and
  estimator stability change while the truth is fixed.
- **Standalone showcases** dramatizing each DGM's distinctive lesson.

Honesty note: `what-if-nhefs-weight-gain` is a **synthetic example calibrated to** the book's
published numbers (crude ~+2.5 kg, adjusted ~+3.0–3.5 kg, true +3.5 kg), **not** a replica of the
book's real-data analysis. The infobox + DGP panel make this explicit.

## Deferred (see ROLLING_TODOS.md)

- **Generative, for real:** in-browser learned-joint generation via a dispatched worker /
  **WebGPU** (train or run a GAN/VAE/flow client-side). Runtime CART/synthpop is the lighter fallback.
- **General data import:** bring-your-own-data — paste/upload CSV → a plasmode covariate source
  for any dataset.

## Key files

- `packages/core/src/types.ts` — `EdgeMechanismKind` / `EdgeMechanism` extensions; source flag.
- `packages/core/src/simulation.ts` — `edgeContribution`, `compileEdgeFn`, row-index source.
- `packages/core/src/examples.ts` — `addCopulaCovariates` / `addPlasmodeCovariates` helpers,
  the variants, the `EXAMPLE_DOMAINS` entry.
- `packages/core/src/data/` — embedded NHEFS covariates (+ loader/registry).
- `apps/web/src/outputs/DgpInspector.tsx` — the inspector.
