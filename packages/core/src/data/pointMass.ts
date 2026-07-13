import type { CovariateDataset } from "./dataset";

/**
 * THE POINT-MASS INDICATOR — `1(x == v)`, almost always `1(x == 0)`.
 *
 * This is one of only two derived-column primitives the app builds (the other is categorical dummies).
 * `docs/scope-boundary.md` has the rule that admits it:
 *
 *     Add a derived-column primitive only when the existing modelling vocabulary is STRUCTURALLY INCAPABLE
 *     of expressing the thing — not when it is merely convenient.
 *
 * A point mass is a DISCONTINUITY. No smooth basis function — no polynomial, log, sqrt, spline or asinh —
 * can represent one, so no edge mechanism we have or could add will ever do this job. Everything else
 * (log, sqrt, x², standardize, bin, winsorize, lag, ratio) is a re-expression of the same variable and
 * belongs either on an edge (functional form) or in the user's spreadsheet. We are a causal-structure tool,
 * not a data-preparation tool.
 *
 * WHY IT IS NOT A NICETY, in one table. Smith & Todd (2005) Table 3, Dehejia–Wahba logit on LaLonde:
 *
 *     regressor                CPS controls    PSID controls
 *     1(re74 == 0)               1.9368           3.2583        <- the step at zero: 7x to 26x in the odds
 *     re74, in dollars          -0.00007         -0.00002        <- the slope in dollars: nil
 *
 * The indicator carries essentially all of the selection signal; the dollar amount carries none. We spent a
 * long time trying to recover that signal with smooth transforms of `re74` (log, then sqrt) and it cannot be
 * done, on principle. See docs/lalonde-specification.md for the full autopsy.
 *
 * It is also a genuinely DIFFERENT CAUSAL CONSTRUCT, not a rescaling: "was this person employed in 1974?"
 * can have different parents and different children from "how much did they earn in 1974?" — a recession
 * moves employment without moving wages among the employed. That is why it earns a NODE of its own rather
 * than a bend in an existing arrow.
 */
export function withPointMassIndicator(
  dataset: CovariateDataset,
  from: string,
  options: { at?: number; name?: string } = {}
): CovariateDataset {
  const at = options.at ?? 0;
  const source = dataset.columns.indexOf(from);
  if (source < 0) return dataset;
  const name = options.name ?? pointMassColumnName(from, at);
  if (dataset.columns.includes(name)) return dataset;   // idempotent — safe to apply twice
  return {
    ...dataset,
    columns: [...dataset.columns, name],
    rows: dataset.rows.map((row) => [...row, (row[source] ?? Number.NaN) === at ? 1 : 0])
  };
}

/** The conventional name. `u74` in the LaLonde literature is exactly `1(re74 == 0)`. */
export function pointMassColumnName(from: string, at = 0): string {
  return at === 0 ? `${from}_is_zero` : `${from}_is_${at}`;
}

/**
 * Find an existing column that IS the indicator of `from`, matched by VALUE rather than by name — the
 * canonical LaLonde column is called `u74`, not `re74_is_zero`, and a user's CSV may call it anything.
 * Naming conventions are not a reliable key; the data is.
 */
export function findPointMassColumn(dataset: CovariateDataset, from: string, at = 0): string | null {
  const source = dataset.columns.indexOf(from);
  if (source < 0 || dataset.rows.length === 0) return null;
  for (let c = 0; c < dataset.columns.length; c += 1) {
    if (c === source) continue;
    let matches = true;
    for (const row of dataset.rows) {
      const want = (row[source] ?? Number.NaN) === at ? 1 : 0;
      if ((row[c] ?? Number.NaN) !== want) { matches = false; break; }
    }
    if (matches) return dataset.columns[c]!;
  }
  return null;
}

/** Does this column carry a point mass worth indicating? (Used to OFFER the indicator, never to force it.) */
export function pointMassShare(dataset: CovariateDataset, column: string, at = 0): number {
  const index = dataset.columns.indexOf(column);
  if (index < 0 || dataset.rows.length === 0) return 0;
  let hits = 0;
  for (const row of dataset.rows) if ((row[index] ?? Number.NaN) === at) hits += 1;
  return hits / dataset.rows.length;
}
