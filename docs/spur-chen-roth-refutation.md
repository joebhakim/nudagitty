# SPUR — Chen–Roth: `log(Y+c)` is not an estimand (a standalone example)

> **Spur** = a deliberate branch-off, parked with enough design that it can be picked up cold. Not part of
> `feat/imposed-estimand`; it wants to be its **own example**, not a widget bolted onto the pad.

Cut out of the (c) explainer layer on 2026-07-11. The (c) work ships the ⓘ dots and `/effects.html`;
this — the one piece of nuance best taught by **doing** rather than reading — becomes its own thing.

## The result

**Chen & Roth (2024, QJE), "Logs with Zeros? Some Problems and Solutions"** (`chen2024logs` in
`docs/references/outcome-marginals-earnings.bib`).

When the outcome has a **point mass at zero** (unemployment ⇒ `$0` earnings) and you regress on
`log(Y + c)` — or `asinh(Y)`, or any `m(Y)` that is log-like in the tail but finite at 0 — the estimated
"percentage" treatment effect is **not invariant to the units of Y**. Rescale dollars → cents and the
answer changes. Worse: **you can drive the estimate to essentially any value by choice of `c`.**

The reason is structural, not numerical. The effect mixes an **intensive** margin (how much earnings move
among earners) with an **extensive** margin (moving someone from `0` to positive). The extensive part has
**no natural units on a log scale** — `log(0 + c) → log(c)` is whatever you decided `c` should be. So there
is **no scale-invariant percent-change estimand when some outcomes are zero.** The number you report is an
artifact of an arbitrary constant.

**Bellemare & Wichman (2020)** `bellemare2020elasticities` — `asinh` is *not* a free lunch: it is a
`log(Y+c)`-type transform in disguise, and the same critique applies. Teaching that is a feature.

## Why this belongs as an EXAMPLE, not a tooltip

You cannot argue someone out of `log(Y+1)`; they have used it for years and it "works". But you can hand
them a slider, let them move an arbitrary constant, and let them watch **their own headline number swing**.
That is a thing the tool can do that a paper cannot.

## The build

**Data.** LaLonde `re78` is already perfect: **12.4% exact zeros**, real dollars, a real treatment. No new
dataset needed. (`lalonde-obs`, already embedded.)

**The example.** A `refutation`-flavoured example whose output is a single chart:

- **x-axis:** the arbitrary constant `c` (log scale, say `$1 → $10,000`).
- **y-axis:** the estimated treatment effect on `log(Y + c)`, i.e. the coefficient from regressing
  `log(re78 + c)` on treatment + confounders — reported the way people actually report it, as a
  **"% effect"** (`e^β − 1`).
- **The line swings.** As `c → 0` the zeros dominate and `|β|` blows up; as `c → ∞` the transform becomes
  linear in `Y` and `β → 0`. Everything in between is "a result".
- **Annotate the folk defaults:** a tick at `c = 1` ("log(Y+1)"), and one at the `c` implied by `asinh`.
  Two respectable choices, two different answers, from the same data.
- **The kicker:** a **units toggle** (dollars ↔ cents). The whole curve *moves*, because `c = 1` means a
  different thing in cents. Same data, same model, same code — different answer. That is the unit-dependence
  in one click.

**The honest alternatives, shown alongside** (each a stable horizontal line — they do not move with `c`):
1. **Level effect** `E[Y|do(1)] − E[Y|do(0)]` — in dollars. Unit-equivariant, well-defined with zeros.
2. **Extensive margin** — the effect on `1(Y>0)`, in percentage points.
3. **Intensive margin** — the effect among earners.
4. **PPML / proportional** (`santossilva2006log`) — `E[Y|X] = exp(Xβ)`, handles zeros natively, scale-invariant.

> **The punchline:** the thing that moves is the thing that isn't an estimand.

## The constructive answer — which we have already built

This is the part that makes the example *ours* rather than a restatement of the paper.

Chen–Roth's prescription is: **with an extensive margin you must DECIDE what you mean** — level, extensive,
intensive, or proportional. That is not a limitation of the tool; it is the structure of the question.

And that is exactly what the **two-part outcome** (`semicontinuous`) and the **(γ, δ) manifold pad** already
force you to do. The pad *is* the constructive answer to the critique: it shows you, concretely, that
"the effect" with zeros is a **one-parameter family** (how much from *more people working* vs *higher pay*),
makes you pick a member, and then guarantees the dollar total. `log(Y+c)` pretends that choice does not
exist and silently makes it for you — badly, and differently depending on `c`.

So the example should **end by linking to the two-part example**: *"here is the question `log(Y+c)` was
hiding from you — now go answer it on purpose."*

## Pieces needed

- [ ] A `log(Y+c)`-on-`c` estimator sweep (cheap: OLS per `c`, ~40 values, on the plasmode rows).
- [ ] A units toggle (dollars/cents) — a pure rescale of the outcome column.
- [ ] The chart: swinging curve + the stable reference lines + the `c=1` / `asinh` ticks.
- [ ] Example entry + denouement; domain `refutation` (or reuse `dgm`).
- [ ] Copy that names the paper and states the theorem in one sentence.
- [ ] Links: the two-part example (the constructive answer), `docs/fitting-outcome-marginals.md` §7,
      and `/effects.html` once it exists.

## Related, already done

- `docs/fitting-outcome-marginals.md` §6–8 — the full econ literature (Mincer, Duan, Manning,
  Santos Silva–Tenreyro PPML/Jensen, Cragg two-part, Tobit, Chen–Roth, Bellemare–Wichman).
- The `semicontinuous` two-part family + `lalonde-fit-recover-2part`.
- The imposed-estimand work (`docs/plan-imposed-estimand.md`) — author the estimand, derive the coefficient;
  the γ/δ manifold and its feasibility wall.
