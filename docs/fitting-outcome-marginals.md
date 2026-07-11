# Fitting outcome marginals: the honest-fit philosophy, the earnings problem, and the econ literature

This note records the design thinking behind Nudagitty's **family-aware fit** (tasks #93/#94/#95)
and the econometrics literature it should eventually surface in-app. It is the reference for *why*
we fit outcomes the way we do — improve the model, keep the diagnostics falsifiable — and *what*
economists already do to the same distributions, so the tool can speak their language.

Machine-readable references: `docs/references/outcome-marginals-earnings.bib`. Sibling notes:
`docs/data-generating-mechanisms.md`, `docs/track-b-benchmark-mode.md`,
`docs/lalonde-recover-rct.md`.

---

## 1. The setup: what "fit a DGP to data" actually asks of us

When a user imports a dataset, marks roles, and hits **fit**, Nudagitty learns a generating
mechanism `Y = g⁻¹(η + ε)` for each data node, where `η = Xβ` is the linear predictor over the
node's parents, `g` is a link, and `ε` is noise. Two things can then be judged against the data:

- the **structure** — is `Y` really additive in `X` on the link scale, with noise independent of
  `X`? (the RESIT / residual-independence test, task #90, already shipped);
- the **marginal** — does the *simulated* distribution of `Y` look like the *observed* one
  (support, skew, zero-mass, tails)?

The central tension of this whole thread: **there is more than one way to make the simulated
marginal match the data, and they are not equally honest.** You can improve the *model* (a better
link, a better noise family, a two-part structure) so the marginal comes out right *and stays
checkable* — or you can *force* the marginal through a copula (NORTA) so it matches *by
construction*, at the cost of destroying everything you could have checked. Nudagitty is a teaching
tool; we prefer the falsifiable route even when it fits slightly worse.

## 2. The running example: why earnings break additive-normal noise

LaLonde's 1978 earnings (`re78`) is the stress test. Real earnings are:

- **non-negative** — there is a hard floor at `$0`;
- **zero-inflated** — a spike of literal zeros (people who did not work that year);
- **right-skewed with a heavy tail** — a long upper tail of high earners.

An identity link with normal noise, `Y = Xβ + ε, ε ~ N(0, σ²)`, cannot represent any of these. On
the LaLonde rows it generates **8.4% negative earnings** — impossible values — and no zero spike.
A **log link** (`positive` / gamma-log family, shipped in #93) fixes the negativity (min ≈ `$840`)
and absorbs much of the skew, but earnings are **not lognormal**: the residual-independence check
*still* fails on the log scale (worst parent `education`, dCor ≈ 0.19; the `re74`/`re75` earnings
histories elevated). That failure is not a bug in the diagnostic — it is the tool **honestly
reporting that the model is still wrong**. The real fix is a two-part model (#94 P4; §7).

This is the whole point: a better link got us from "impossible" to "wrong in a smaller, named way,"
and the diagnostic told us so. We did not paper over it.

## 3. The honesty spectrum

Three ways to make the simulated marginal match the data, ordered by how much stays falsifiable:

| Approach | What's forced to match | What stays testable | Falsifiable? |
|---|---|---|---|
| **Parametric noise family** (link + a fitted family, GoF-checked) | noise *shape*, via a chosen family you can reject | additive structure on the link scale **and** ε ⊥ X (RESIT) | **Yes** — goodness-of-fit *and* residual test both live |
| **IID residual bootstrap** (resample empirical residuals) | noise *shape* matches the empirical residual distribution exactly, no family assumed | additive structure; RESIT still runs on the *real* residuals | **Partly** — GoF is moot (shape matched by construction); the ε⊥X test survives but the *generator* bakes in independence |
| **NORTA / `copula_marginal` fit** (latent-Gaussian → Φ → marginal⁻¹) | the **entire marginal**, exactly | *nothing* — additive structure is gone, there is no residual object to test | **No** — un-falsifiable; the coefficient becomes an uninterpretable latent loading |

Reading the table top to bottom, each row buys a better marginal fit by spending a diagnostic. The
parametric family keeps both a goodness-of-fit test (you can reject the family) and the
residual-independence test (you can catch un-modeled endogeneity). The bootstrap gives up the GoF
test (the shape is copied, so "does it fit?" is trivially yes) but keeps additive structure and
still *reports* an ε⊥X violation on the true residuals — though its generator assumes the
independence away. NORTA spends everything: the marginal is exact, but there is no residual, no
structure, and a "coefficient" that is a latent loading rather than a slope you can read.

**This is exactly why we rejected NORTA fit-from-data** (task #92, decided SKIP; #94 P5 retires the
wiring). In a teaching tool, an un-falsifiable exact-marginal that also **buries the endogeneity
warning** is the worst trade: it looks perfect and teaches nothing. The additive-noise fit plus the
live residual test is the honest, falsifiable alternative — and it is already shipped.

## 4. Bias vs. variance: why "just crank up n" does not fix the marginal

A tempting idea: heavy-tailed / skewed / zero-inflated outcomes might be tamed by simulating with
**1000× more n** (and a much faster engine). It is worth being precise about what more `n` buys.

- **More `n` reduces *variance*** — the sampling noise in any estimate — and this buys **two** real
  wins. (a) **Estimator recovery:** the AIPW `+$1,576` vs. the truth `+$1,794` gap is finite-sample,
  driven by only ~260 treated units (rate 0.065 × 4,000). Cranking `n` even **25×** (not 1000×) →
  ~6,500 treated → the adjusted estimates converge onto `+$1,794` and the "it recovers the truth"
  story gets crisp. (b) **Diagnostic power:** more data gives the residual test more power to
  *detect* the misspecification — so more `n` makes the marginal problem **more visible, not less**.
  Both are worth a faster engine (roadmap, §8) — as **variance** wins.
- **More `n` does *not* reduce *bias*** — the systematic gap between the simulated marginal and the
  data marginal when the model family is wrong. Additive-normal noise for zero-inflated earnings is
  *misspecified*; the generated marginal is drifted no matter how large `n` is. More `n` just makes
  the **wrong marginal more precisely wrong** (its own mean/skew converge, to the wrong numbers).

So "marginal drift" is a **bias** problem, and bias is fixed by a **better model** (link, noise
family, two-part), not by more data. The only way more `n` "fixes the marginal" is if you *also*
let model flexibility grow without bound (a fully nonparametric conditional) so it can match any
shape — but **unbounded flexibility to match any marginal is NORTA in disguise**: you hit the exact
marginal by construction, un-falsifiably, back at the bottom row of §3.

The honest sweet spot is therefore **the richest parametric family you can still goodness-of-fit
test**: more parameters reduce drift while a rejectable family keeps it falsifiable. Push flexibility
past the point where GoF has power and you have traded honesty for fidelity. In one line:

> **Bias ← a better (still-falsifiable) model. Variance ← more n (and a faster sim).** They are
> different axes; do not spend one currency expecting to buy the other.

## 5. What's shipped: family-aware fit v1 (#93)

`reconcilePins` (in `packages/core/src/fitDgp.ts`) fits OLS **on the link scale the node's
`valueType` implies**:

- `continuous` → **identity** link (unchanged additive-normal fit);
- `positive` → **log** link (gamma-log flavour) — kills negative draws;
- `proportion` → **logit** link — keeps draws in `(0,1)`;
- binary stays Bernoulli-logit (the logistic MLE already preserves the marginal rate — see #92).

Noise is normal *on that scale*. For the log link we add a **retransformation-bias correction** so
the generated *mean* still matches the data: naive `exp(η̂)` targets the median (geometric mean),
biased low, so we shift the intercept by `log(target_sum / Σ exp(η̂ + σ²/2))` — the lognormal
`E[exp(η+ε)] = exp(η + σ²/2)` identity. This is the parametric special case of **Duan's smearing
estimate** (`duan1983smearing`); the nonparametric upgrade (average the *actual* exponentiated
residuals instead of assuming normal ε) is the natural #94 improvement and dovetails with the
residual-bootstrap row of §3.

`residualDiagnostics` computes ε **on the link scale** (a `scale` field, surfaced in the node
editor footer), so the RESIT test judges the model actually used. The family select is exposed for
data nodes as "fit family (link)". Golden net byte-identical throughout.

## 6. Building a noise family (#94 P3) — and the log-link ∞ guardrail

Mechanically a noise family is small, because generation already draws ε from a mean-0
`NodeDistribution`, and the engine already ships `normal` / `laplace` / `student-t` / `gamma` kinds
with samplers. "Add a noise family" is therefore two pieces:

1. **Fit its parameters to the link-scale residuals** (the new work, inside `reconcilePins`):
   - `normal` → `sd = √var(ε)` (current).
   - `laplace` → scale `b = mean(|ε|)` (the Laplace MLE).
   - `student-t` → method of moments: `df ≈ 4 + 6/exkurt` from the excess kurtosis, then scale so the
     variance matches (`var_t = s²·df/(df−2)`); an EM/MLE upgrade if we want to be fancy.
   - a genuinely new family (skew-normal, skew-t) is the only case that touches the engine: add the
     `kind` to the union + normalize + defaults + a sampler + the fitter.
2. **Adapt the diagnostic.** The "Gaussian ε (Jarque–Bera)" row becomes "noise ε (family GoF)":
   compare the residual skew/kurtosis to what the *chosen* family predicts (normal → excess kurt 0,
   laplace → +3, `t(df)` → `6/(df−4)`), or run a KS / Anderson–Darling test against the fitted
   family. Still falsifiable — the whole point.

**The load-bearing guardrail: heavy noise on a log link diverges.** On a log link the generated mean
is `E[exp(η + ε)]`, and `E[exp(ε)] = ∞` for heavy-tailed ε (a Student-t has no moment-generating
function at all; a Laplace needs scale `b < 1`). So the fitter **must forbid heavy families on the
log link** — otherwise a "better" noise fit silently blows the marginal mean up to infinity. This is
the same Jensen / retransformation trap the econ literature warns about (§7), surfacing in our engine
as a literal `∞`. Noise-family fit is thus a **narrow** tool: it is the right lever for heavy-tailed
*symmetric* outcomes on the **identity** link, and orthogonal to the earnings problem — which is an
extensive-margin (zeros) problem that wants a two-part model (§8), not a fatter ε.

## 7. The literature: what economists do to earnings (and where it goes wrong)

Economists have massaged earnings and other non-negative, skewed, zero-spiked outcomes for decades.
The point of cataloguing it here is twofold: it validates that our "improve the model" instinct is
the mainstream one, and it is the **menu we should mechanically offer** so an economist recognizes
their own toolkit (§8).

**The log tradition.**
- **Mincer (1974)** `mincer1974schooling` — the canonical *log-earnings* equation (log wage linear
  in schooling + experience + experience²). This is *why* log is the reflexive earnings transform.
- Plain `log Y` is undefined at `Y = 0`, and earnings have real zeros (unemployment) — so people
  reach for `log(Y + c)` with an arbitrary small `c`. **This is a footgun**, see below.

**The retransformation problem** (fit on log, report on levels).
- **Duan (1983)** `duan1983smearing` — you cannot report `E[Y|X]` as `exp(Xβ̂)`; that is the
  geometric mean, biased low. Duan's **smearing** multiplies by `(1/n) Σ exp(e_i)` — a
  *nonparametric* retransformation robust to non-normal ε. (Our #93 log-link correction is the
  parametric, lognormal special case of this.)
- **Manning (1998)** `manning1998logged` — under **heteroskedastic** ε even smearing is biased (the
  smearing factor varies with `X`); recommends a direct GLM (gamma / log link) over log-OLS.
- **Manning & Mullahy (2001)** `manning2001estimating` — the decision guide, "to transform or not to
  transform?": GLM (gamma/Poisson log-link) vs. log-OLS + smearing, chosen by tail heaviness and
  heteroskedasticity. A practical playbook we can encode.

**The mean-scale answer: PPML.**
- **Santos Silva & Tenreyro (2006)** `santossilva2006log`, "The Log of Gravity" — by **Jensen's
  inequality** `E[log Y|X] ≠ log E[Y|X]`, so log-OLS estimates the mean of the log, not the log of
  the mean, and under heteroskedasticity is *inconsistent* for the elasticity of the conditional
  mean. **PPML** (Poisson pseudo-MLE) estimates `E[Y|X] = exp(Xβ)` directly, is consistent under
  weak assumptions, and **handles zeros natively** (`Y = 0` is fine in a Poisson likelihood).
  Increasingly the recommended default for non-negative skewed outcomes with zeros.

**The zero problem, done right: two-part models.**
- **Cragg (1971)** `cragg1971some` — the **two-part / hurdle** model: one part for the *extensive*
  margin (`P(Y>0)`, a probit/logit), a second for the *intensive* margin (`E[Y | Y>0]`, often
  log-normal or gamma). The natural model for zero-inflated earnings — one equation decides
  employed/not, the other how much *if* employed. **This is the honest earnings fix (#94 P4).**
- **Tobin (1958)** `tobin1958estimation` — **Tobit**, a single-index censored-normal model treating
  the zeros as censored latent negatives. Ties both margins to one latent index; Cragg's two-part
  frees them (usually a better fit for earnings). Historically first; a useful *contrast* to teach
  why two-part is preferred.

**The refutation — why the popular zero-fixes are not estimands.**
- **Chen & Roth (2024, QJE)** `chen2024logs`, "Logs with Zeros?" — the big result the user recalled.
  When `Y` has zeros and you use `log(Y + c)` (or *any* `m(Y)` that behaves like log for large `Y`
  but is finite at 0), the estimated "percentage" treatment effect is **unit-dependent** and can be
  driven to *any value* by the choice of `c`. The effect mixes an intensive margin (how much
  earnings move) with an extensive margin (0 → positive), and the latter has arbitrary units. **There
  is no average-percentage effect when some outcomes are zero.** The fix is to target an explicit,
  unit-invariant estimand — a level effect, an effect on `1(Y>0)`, or a proportional (Poisson-type)
  effect — *not* `log(Y+c)`.
- **Bellemare & Wichman (2020)** `bellemare2020elasticities` — the **inverse hyperbolic sine**,
  `asinh(Y) = log(Y + √(Y²+1))`, is defined at 0 and log-like in the tail, and is widely adopted as
  "a log that handles zeros." **But Chen–Roth's critique applies to asinh too** — it is a
  `log(Y+c)`-type transform in disguise, so its "elasticity" is likewise unit-dependent when zeros
  are present. asinh is *not* a free lunch, and teaching that is a feature.

**The LaLonde benchmark itself** (why `lalonde-recover-rct` exists at all).
- **LaLonde (1986)** `lalonde1986evaluating` — the original: observational estimators fail to
  recover the experimental training-program benchmark.
- **Dehejia & Wahba (1999, 2002)** `dehejia1999causal`, `dehejia2002propensity` — propensity-score
  matching *partly* recovers the benchmark on a subsample; sparked PS-methods optimism.
- **Smith & Todd (2005)** `smith2005does` — that recovery is **fragile** to subsample/specification;
  matching does *not* robustly overcome LaLonde's critique. This is precisely the measured finding in
  `docs/lalonde-recover-rct.md`: *nothing fully recovers, and overlap is the tell.*

## 8. Roadmap — the "mechanically include for economists" menu

The vision: an economist opens Nudagitty, selects an earnings outcome, and finds the transforms and
estimators they already trust — each with its diagnostic and its citation rendered inline. Concretely,
cross-linked to the task backlog:

- **#93 (done)** — link-scale fit (identity / log / logit) + parametric (lognormal) retransformation
  correction + scale-aware RESIT.
- **#94 P3 — noise-family fit.** Replace `N(0, σ²)` with a *fitted, rejectable* family (Laplace /
  Student-t / skew-normal) chosen by GoF, **or** the IID **residual bootstrap** (nonparametric noise
  = the Duan-smearing analogue, `duan1983smearing`), keeping the ε⊥X test live. The §3 middle row;
  build mechanics + the log-link ∞ guardrail in §6. A narrow tool (heavy-tailed *symmetric*
  outcomes), orthogonal to the earnings-zeros problem — not the earnings fix.
- **#94 P4 — two-part / hurdle (Cragg). SHIPPED.** `cragg1971some` — a new `semicontinuous` family:
  a `P(Y>0)` logistic **gate** × an `E[Y|Y>0]` log-link **intensive** model, generating the real
  earnings zero spike. Example `lalonde-fit-recover-2part` recovers the imposed +$1,794 split
  extensive-led (γ solved for ~62% via the gate, δ solved so the analytic two-part `do()` = exactly
  $1,794); the residual panel checks both margins (intensive RESIT + gate calibration/exogeneity).
  Two honest limitations surfaced, both flagged not hidden:
  1. **Heavy intensive tail** — the log-link amplifies the *dollar-valued* earnings histories
     exponentially (skew ~30, a $2M tail), which the diagnostic points straight at (dCor on `re74`).
     The fix is the **Mincer lesson**: log/scale the intensive regressors (needs a per-predictor
     transform in the fit — deferred, tracked below).
  2. **Monte-Carlo `do()`-oracle** — a two-part effect is nonlinear, so unlike #95's exact additive
     shift the simulated `do()` wobbles (~$1,794 ± a few hundred). The *imposed* truth is exactly
     $1,794 (analytic); surfacing that analytic benchmark in the output card (vs the noisy simulated
     oracle) is a polish follow-up.
  Still TODO: **Tobit** `tobin1958estimation` as the single-index contrast (show why two-part wins);
  and the two limitation fixes above (Mincer predictor transforms; analytic-truth display).
- **#94 P5 — retire NORTA fit-from-data** (#92): keep `copula_marginal` only for the copula/joint
  tool's *authored* correlations, never as a fit target.
- **New — PPML / gamma-log GLM outcome model.** `santossilva2006log` + `manning2001estimating`: the
  mean-scale default for non-negative skewed outcomes with zeros, with a Jensen's-inequality
  explainer next to it.
- **New — the `log(Y+c)` / asinh refutation widget.** `chen2024logs`, `bellemare2020elasticities`:
  a slider on `c` that shows the estimated "percentage effect" swinging with the arbitrary constant —
  teaching, by demonstration, that it is not a real estimand. High pedagogical value, low build cost.
- **New — ship the `.bib` into the app.** Render these citations wherever the corresponding
  transform/estimator is offered, so the literature is one click from the knob.
- **Deferred — faster large-`n` sim.** A *variance* win (tighter estimator recovery of the imposed
  effect), explicitly **not** a bias fix for marginal drift (§4). Worth doing, honestly labelled.
  Complexity is favourable: the sim is `O(n)` (vectorize / worker it) and the estimators are `O(n)`;
  only the dCor diagnostic is `O(n²)`, so it stays **subsampled** — which is fine and consistent
  (the diagnostic is about *detecting* bias, not needing every point).

The through-line: every item **improves the model or exposes a diagnostic**; none forces the
marginal behind the user's back. That is the honest-fit philosophy, and it is what makes Nudagitty a
tool an economist can trust to *show them where their own defaults break*.
