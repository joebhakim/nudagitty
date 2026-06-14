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
