# Plan: author the ESTIMAND, derive the coefficients

Branch `feat/imposed-estimand` (worktree `/home/joe/skunks/nudagitty-estimand`, cut from `refactor/decompose`).

## The problem

A user tried to rebuild `lalonde-fit-recover-2part` from a CSV and got completely different results. The
post-mortem found three things, and they all trace to one root cause: **we store a coefficient where we
mean an estimand.**

1. **The document lies.** We store γ (gate) and δ (intensive) as raw numbers, plus `imposedEffect: 1794`
   as a *separate badge*. Change the fit — new data, a different DAG, a refit — and those coefficients no
   longer produce $1,794. **The badge still claims they do.**
2. **The example is not a fixed point.** The configurator fits the confounders with δ authored at 0, then
   sets δ *without re-reconciling*. The app's own commit pipeline (`reconcilePins(syncGenerativeState(doc))`)
   refits on load and silently drifts every coefficient. Side-effect: the doc no longer byte-matches
   `exampleDocument(id)`, so it **falls off the short `#example=<id>` share link** and serializes a ~9.8 KB
   `#c=` payload. (This is why share links are enormous.)
3. **It cannot be reproduced by hand.** γ has *no UI at all* (it lives in `mechanism.gate.coefficients`,
   not on an edge), and δ was found by a numeric root-find. Nothing said so.

## The insight

**With a two-part outcome, "the effect" is not a number — it's a one-parameter family of causal stories.**

Treatment acts on two margins, so there are two coefficients: **γ** on the gate
(`P(Y>0) = σ(ηg + γ·T)`, log-odds) and **δ** on the amount (`E[Y|Y>0] = exp(ηa + δ·T + h)`, log-dollars,
`h = σ²/2`). Neither is in dollars. "ATE = A" is *one* equation in *two* unknowns.

In the ADDITIVE model `do(1) − do(0) = β` for every unit, so β **is** the ATE — you type 1794 and you're
done (which is why `lalonde-fit-recover` *is* hand-reproducible). In two-part the per-unit effect is
heterogeneous, so **no coefficient equals the ATE**.

### The closed form

δ factors out of the intensive term (`exp(ηa + δ + h) = e^δ · exp(ηa + h)`), so:

```
ATE(γ, δ) = e^δ · S(γ) − C₀        S(γ) = mean[ σ(ηg + γ) · exp(ηa + h) ]
                                   C₀   = S(0) = mean earnings under do(T=0)

  ⇒   δ(γ) = ln( (C₀ + A) / S(γ) )      ← the entire iso-ATE contour, in one line
```

### The feasibility wall (measured, lalonde-obs, A = $1,794)

| | |
|---|---|
| `C₀` (do(T=0) mean) | **$20,614** |
| `Amax = S(∞)` (everyone works) | **$22,087** |
| **max extensive-only effect** = `Amax − C₀` | **$1,473** |

**$1,794 > $1,473.** Even pushing participation to 100% cannot deliver the target. Since `S(γ) ≤ Amax`
always, this is *provable*:

> **δ ≥ ln((C₀ + A) / Amax) = 0.0144** — pay MUST rise ≥ 1.5%, whatever γ does.
> Max extensive share ≈ **82%**, never 100%. The "training just gets people jobs" story is *impossible*.

The example sits at γ=1.7542, δ=0.0309 (62% extensive: participation 87.6% → 96.8%, pay +3.1%;
$1,112 extensive + $682 intensive = $1,794 exactly).

---

## (a) Core — the authored intent

### Data model (`types.ts`, `graph/normalize.ts`)

```ts
export interface ImposedEffect {
  exposure: string;
  outcome: string;
  target: number;            // the ATE, in outcome units
  extensiveShare?: number;   // two-part only: fraction of the effect via the gate; clamped to feasible
}
metadata.imposedEffect?: ImposedEffect | null   // replaces the bare number; normalize accepts both
```

### Solver (`fitDgp.ts` → `solveImposedEffect`), run at the END of `reconcilePins`

Family-dispatched, so this generalizes *every* "impose an effect" example:

| outcome family | derivation |
|---|---|
| `continuous` (additive) | `β = target` — the identity. This folds #95 into the same machinery. |
| `positive` (log link) | `δ = ln(1 + target/Ā)` — closed form |
| `semicontinuous` (two-part) | bisect **γ** so `extensive(γ) = share·target`; then **`δ = ln((C₀+target)/S(γ))`** |
| binary / other | 1-D bisection on the link shift (monotone ⇒ safe) |

**Feasibility is enforced, not assumed:** compute `C₀`, `Amax`, `maxShare = (Amax − C₀)/target`; clamp the
request and record why.

**No circularity:** the confounders are fit holding the effect as an offset; the solve then uses the *final*
η's (which exclude the exposure). So the do-contrast is **exactly** the target by construction, regardless of
whether the confounder coefficients are the exact OLS solution for the new δ.

**Fixed point for free:** because the solve lives *inside* reconcile, `reconcile(reconcile(d)) == reconcile(d)`
by construction. No iterate-to-convergence hack, and the example stays on the short `#example=` share link.

### Provenance

The effect edge stays `authored` (the fit must not overwrite it), but its *value* is **derived**. The editor
says *"solved to hit +$1,794"* — because the raw number was never the thing you meant.

### Tests
- imposed truth is **exactly** the target after reconcile
- **self-healing**: change the DAG/sample → re-derive → *still exactly the target* (today this silently fails)
- **fixed point**: every example is unchanged by `reconcilePins(syncGenerativeState(doc))`
  *(invariant test — credit: found during the share-link investigation)*
- feasibility clamp: request 100% extensive → clamps to ~82%, still hits target
- additive: `β == target` (#95 unchanged)
- golden byte-identical except the two-part example, which legitimately moves (reviewed)

---

## (b) The manifold pad

`ImposedEffectPad` in the edge editor for the exposure→outcome edge.

- **Axes are human, not Greek.** x = *employment effect* (participation 87.6% → __%), y = *pay effect* (+__%).
  γ/δ are secondary readouts, never the primary control.
- **Background:** live ATE field from the closed form (`S(γ)` cached on a ~60-point grid, one O(n) pass each).
- **Highlighted iso-ATE contour** at the target; **greyed infeasible band** `δ < 0.0144`, labelled
  *"even 100% employment yields only $1,473 — pay must rise ≥1.5%."*
- **Modes:** *Locked* (default) — the handle is constrained to the contour, a 1-DOF drag = the extensive-share
  slider (0–82%), ATE guaranteed. *Free* — drag anywhere, you author (γ,δ) and the ATE is derived.
- **Readout:** participation X→Y%, pay +Z%, and `$1,112 extensive + $682 intensive = $1,794`.

---

## (c) The explainer layer

The nuance currently sits in a doc nobody opens. Surface it *at the point of confusion*:

- **ⓘ dots** (2 sentences each, deep-linking): on the pad (*why two coefficients; why the effect is a family,
  not a number*), on the feasibility band (*why it's provably unreachable*), on the fit-vs-author choice
  (*fitting the exposure→outcome edge destroys the imposed truth*).
- **`/effects.html` explainer page** (precedent: the copula explainer pages) hosting the long form — the
  honesty spectrum, bias-vs-variance, **Chen–Roth `log(Y+c)`**, PPML/Jensen, Cragg/Tobit/Duan/Mincer, and the
  γ/δ manifold. Source: `docs/fitting-outcome-marginals.md`.
- ~~The `log(Y+c)` refutation widget~~ — **SPURRED OUT** to its own example: `docs/spur-chen-roth-refutation.md`.
  It is the one piece of nuance best taught by *doing*, and it deserves a whole example (with a dollars/cents
  toggle that moves the entire curve), not a widget bolted onto the pad. Note the pad is already the
  CONSTRUCTIVE answer to Chen–Roth: with zeros, "the effect" is a one-parameter family, and the pad makes
  you pick a member on purpose instead of letting an arbitrary `c` pick one for you.

---

## Sequencing

1. **(a1)** data model + normalize round-trip
2. **(a2)** `solveImposedEffect` + wire into `reconcilePins` (family-dispatched, feasibility clamp)
3. **(a3)** configurator collapses to declaring the intent; golden reviewed; fixed-point invariant test
4. **(b1)** the pad (locked mode) + closed-form contour + infeasible band
5. **(b2)** free mode
6. **(c1)** ⓘ dots
7. **(c2)** `/effects.html`
8. ~~**(c3)** `log(Y+c)` refutation widget~~ → **spur**: `docs/spur-chen-roth-refutation.md`

Each step: `tsc -b` + `vitest run` green, golden reviewed, then commit.
