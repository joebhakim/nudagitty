// Real fitted numbers from the `lalonde-fit-recover` example (Earnings_78's generation block), so the
// prototypes are judged against the actual magnitudes/name-lengths the editor has to cope with — not
// tidy fake data. `no degree` is forced to not-learned to exercise that state.
export type DepState = "not-learned" | "fitted" | "authored";

export interface Term {
  id: string;
  name: string;            // as rendered ("age ×")
  value: number | null;    // null ⇒ nothing learned yet
  state: DepState;
  kind: "intercept" | "coef" | "noise";
  display?: string;        // override for non-numeric rendering (noise)
}

export const OUTCOME_LABEL = "earnings '78";

export const TERMS: Term[] = [
  { id: "intercept", name: "intercept", value: -797.10, state: "fitted", kind: "intercept" },
  { id: "age", name: "age ×", value: -79.63, state: "fitted", kind: "coef" },
  { id: "education", name: "education ×", value: 593.73, state: "fitted", kind: "coef" },
  { id: "married", name: "married ×", value: 1626.90, state: "fitted", kind: "coef" },
  { id: "re74", name: "earnings '74 ×", value: 0.282, state: "fitted", kind: "coef" },
  { id: "re75", name: "earnings '75 ×", value: 0.569, state: "fitted", kind: "coef" },
  { id: "nodegree", name: "no degree ×", value: null, state: "not-learned", kind: "coef" },
  { id: "in_program", name: "in program ×", value: 1794.0, state: "authored", kind: "coef" },
  { id: "noise", name: "noise", value: 6500, state: "fitted", kind: "noise", display: "normal σ 6500" }
];

export const COMBINERS = ["additive", "bernoulli logit", "gamma log", "bounded logistic"];

export const STATE_GLYPH: Record<DepState, string> = { "not-learned": "∅", fitted: "📌", authored: "✎" };
export const STATE_LABEL: Record<DepState, string> = { "not-learned": "not learned", fitted: "fitted", authored: "authored" };
// The provenance language used by the marginal row's badges — "from data" (teal/green) vs "you set it"
// (ochre). The prototypes reuse it so one concept has ONE colour across the whole panel.
export const STATE_SHORT: Record<DepState, string> = { "not-learned": "—", fitted: "data", authored: "you" };

export function fmt(value: number | null): string {
  if (value === null) return "—";
  const a = Math.abs(value);
  return a >= 1000 ? value.toFixed(2) : a >= 1 ? value.toFixed(2) : value.toFixed(3);
}

export function cycle(state: DepState): DepState {
  return state === "not-learned" ? "fitted" : state === "fitted" ? "authored" : "not-learned";
}
