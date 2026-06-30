# Chart layout invariants

How the chart primitives keep labels, ticks, and margins from clipping — and how
to verify a layout change actually renders, not just that a label string updated.

## The layout primitive: `chartFrame`

`apps/web/src/charts/chartFrame.ts` is a margin-convention layout helper. Instead
of hand-computing pixel offsets (`plot.left = 54`, `height = axisY + 34`), a chart
**declares** what each edge needs and gets back the inner plot rect, anchor
positions for ticks/titles, and linear scales:

```ts
const { plot, margin, anchors, xScale, yScale } = chartFrame({
  width, height,
  y: { ticks: true, title: true },
  x: shortChart ? { ticks: true } : { ticks: true, title: true },
  yDomain, insetY: shortChart ? 7 : 12,
});
```

The only tunable constants live in one place: `TICK_COLUMN = 30`, `TICK_ROW = 14`,
`TITLE_BAND = 16`. Bottom margin = `pad + (ticks ? TICK_ROW : 0) + (title ? TITLE_BAND : 0)`.
Tick labels anchor at `plot.bottom + 13`; the bottom axis title sits below that at
`plot.bottom + (ticks ? TICK_ROW : 0) + 12`.

Helpers: `niceTicks(min, max, target)` (1/2/5 × 10ⁿ steps), `paddedDomain(min, max,
{ pad, clampMin, clampMax })` (data headroom that never shows negative / >100% on a
rate axis), and `insetX`/`insetY` (inset the scale range so edge values breathe).

## Always show the individuals, not just summary stats

Output charts must show the **raw individual observations**, not a bare mean/CI. A summary on its own
hides sample size, spread, skew, and gaps; the points are the evidence.

- **Continuous outcome** → a **swarm**: jittered points, radius/alpha scaled by weight
  (`opacity = 0.05 + …`), under the mean dot + CI. ALWAYS pass real points to `CategoryOutcomePlot` —
  never `points={[]}` when you have them. A heavy tail is clipped to a shared, outlier-robust domain
  (1st–99th pct) rather than dropped silently.
- **Binary outcome** → a **0/1 swarm + dual y-axis**: when points are supplied, `CategoryOutcomePlot`
  jitters each observation into a top (=1) / bottom (=0) band with alpha. It's a **dual-axis** chart
  because the empirical and the estimate carry different units: the **left axis is the proportion
  estimate** — titled `rate (%)`, 0–100%, where the rate marker + Wilson CI live — and the **right axis
  is the empirical outcome** — titled `outcome (0/1)`, where the individual points live — same vertical
  range, two labellings (the variable name lives in the chart/box title). This
  avoids the dishonest "100% for one person" reading. Without points (an estimate-only facet, e.g. a
  method's predicted means) it falls back to the single-axis cropped proportion+CI band. (`chartFrame`
  gained a `right` axis spec for this.)
- The swarm is gated on `summaries[].points` being non-empty, so estimate-only facets stay clean.

**Overplotting → a user opacity slider (not an auto heuristic).** Showing the individuals only helps if
they don't merge into one flat blob. We tried density-adaptive alpha (auto-fading dense regions) and
backed it out — a heuristic can't know what the user wants to see. Instead the scatter
(`ScatterplotPanel`) renders points at a fixed radius and exposes an **opacity slider** in its header,
persisted to `localStorage["nudagitty.pointAlpha"]` (default 0.4); opacity = `pointAlpha` lightly
modulated by importance weight. The category swarms (`CategoryOutcomePlot`) use a plain fixed alpha. So
the user dials in their own overplotting rather than us guessing.

When you add a new output chart, the default is points-on. If you find yourself passing `points={[]}`,
that's a smell — build the per-row points (from the simulation samples, like `computeInstrumentOutput`
or the moderator-CATE module) and pass them.

## Short charts (`height < 132`)

`CategoryOutcomePlot` adapts when the container is short:

- **Drop the x-axis title chip**, keeping only the category tick labels
  (`x: { ticks: true }`). Keeping the title chip at <132px is what caused real
  bottom overflow — the category labels ("Obesity=0/=1") already carry the
  variable name, so the axis stays self-explanatory.
- **Keep at least 2 y-ticks**: `niceTicks(yMin, yMax, shortChart || compact ? 2 : 3)`.
  Targeting 1 tick collapses some domains to a single value (e.g. just "50%"),
  which reads as a broken/clipped chart even though nothing is actually clipped.
- Tighter `insetY` (7 vs 12) to reclaim plot height.

The risk plot (`RiskCurvePlot`) keeps its x-title at all sizes — its numeric x-axis
needs the label, and it isn't subject to the same vertical crunch.

## Verifying a layout change

Per `CLAUDE.md`: confirm the **actual rendered output**, not that a string updated.
Two complementary loops, both throwaway and deleted afterward:

- **The gallery** (`apps/web/gallery.html`, hosted at the gallery subdomain) renders
  every chart × data boundary × container size, each subplot tagged with a stable
  two-letter code (AA, AB, …) for quick referencing.
- **Invariant check** (`npm run gallery:check`, `tests/gallery.spec.ts`) walks every
  `.g-cell` and flags text/circle/polyline geometry that overflows the chart box,
  y-tick overlap, and value-label overlap. It hard-fails overflow only at realistic
  (`panel`/`wide`) sizes; the `tiny 150x96` floor is below any real panel and is
  reported but not failed.

Measure, don't eyeball: a label can sit 9px inside the box (no clip) yet still look
cramped because of an unrelated problem (too few ticks). Read the geometry —
`getBoundingClientRect()` of the text vs the `.g-chart` box — before concluding.

## TODO

- [ ] **Set up mathematical auto-checks for layout health.** Today `gallery:check`
      only catches hard geometry overflow. We should add invariants for: clipping
      (any glyph/mark past its frame), minimum padding/margins, whitespace ratios
      (chart shouldn't be mostly empty band), and **resolution/legibility ratios**
      (font size vs container, mark size vs container — flag anything too small to
      read). These would run across the full gallery variation space and the app
      sample, turning "looks off" into a failing assertion. Later.

## Color vocabulary (one meaning per color)

A swatch must mean the same thing in every outcome panel — otherwise ochre reads as "truth" in the
effect-by-treatment graph and as "moderator level 1" in the effect-by-moderator graph (the bug that
prompted this). `charts/chartColors.ts` is the single source, split into two axes:

- **Method axis** — *which estimate*. RESERVED, never reused for groups:
  `SERIES_COLORS.observed` = gray (`--chart-muted`, crude/naive), `.truth` = ochre (`--chart-series-2`,
  oracle/`do()`), `.chosen` = blue (`--causal`, the chosen causal estimate).
- **Subgroup axis** — *which group*. `MARGINAL_COLOR` (`--chart-marginal`, a dark slate) for the
  pooled/standardized reference — its own neutral, **not** observed-gray — and `subgroupColor(i, n)`, a
  sequential violet ramp (light→dark) for ordered levels/strata, visually separate from the method colors.

So: effect-by-treatment uses the method axis (gray/ochre/blue); effect-by-moderator uses the subgroup
axis (slate marginal + violet ramp). Stratified small-multiples carry no series color. Add new groups via
`subgroupColor`, never by reaching back into the reserved method tokens.
