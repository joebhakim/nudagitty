// The chart color VOCABULARY — one meaning per color, app-wide, split into two axes so a swatch never
// changes meaning between panels (see docs/chart-layout-invariants.md).

// Method axis — "which estimate". RESERVED: never reused for groups/strata.
export const SERIES_COLORS = {
  observed: "var(--chart-muted)", // gray — the crude / naive / observed view
  truth: "var(--chart-series-2)", // ochre — the oracle / do() truth
  chosen: "var(--causal)"         // blue  — the chosen causal estimate
} as const;

// The pooled / standardized reference across subgroups — its OWN neutral, distinct from observed-gray,
// so "marginal" and "observed" never share a swatch.
export const MARGINAL_COLOR = "var(--chart-marginal)";

// Subgroup / stratum axis — "which group". A sequential VIOLET ramp (light → dark) so ordered levels
// read as ordered, and visually separate from the method colors (gray / ochre / blue).
const RAMP_LIGHT = [201, 179, 236]; // #c9b3ec
const RAMP_DARK = [67, 38, 115];    // #432673

export function subgroupColor(index: number, total: number): string {
  const t = total <= 1 ? 0.5 : Math.min(1, Math.max(0, index / (total - 1)));
  const channel = (lo: number, hi: number) => Math.round(lo + (hi - lo) * t);
  return `rgb(${channel(RAMP_LIGHT[0]!, RAMP_DARK[0]!)}, ${channel(RAMP_LIGHT[1]!, RAMP_DARK[1]!)}, ${channel(RAMP_LIGHT[2]!, RAMP_DARK[2]!)})`;
}
