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

// ================= the OTHER primitive: categorical dummies =================
//
// Same admission rule (docs/scope-boundary.md): a linear mechanism cannot consume an UNORDERED CATEGORY at
// all. There is no coefficient you can put on "red / green / blue" — the arithmetic is not defined. So this
// too is a missing WORD in the vocabulary, not a missing shortcut.
//
// k levels ⇒ k−1 indicators. The omitted level is the REFERENCE, and every other coefficient is read
// against it. We drop the most common level by default, which is the convention and also the most stable
// choice (the reference gets the most data).

/** k−1 indicator columns for an unordered categorical column. Returns the new dataset + the level map. */
export function withCategoryDummies(
  dataset: CovariateDataset,
  from: string,
  options: { reference?: number; labels?: Record<number, string> } = {}
): { dataset: CovariateDataset; reference: number; levels: Array<{ value: number; column: string }> } | null {
  const source = dataset.columns.indexOf(from);
  if (source < 0 || dataset.rows.length === 0) return null;

  const counts = new Map<number, number>();
  for (const row of dataset.rows) {
    const v = row[source];
    if (v === undefined || !Number.isFinite(v)) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const values = [...counts.keys()].sort((a, b) => a - b);
  // 2 levels is already an indicator; >20 is an id, not a category — refuse rather than emit 500 columns.
  if (values.length < 3 || values.length > 20) return null;

  // The reference level is the MOST COMMON one unless told otherwise: it gets the most data, so every other
  // coefficient — which is read AGAINST it — is estimated most precisely.
  const reference = options.reference ?? [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const levels = values
    .filter((v) => v !== reference)
    .map((v) => ({ value: v, column: `${from}_${options.labels?.[v] ?? v}` }))
    .filter((l) => !dataset.columns.includes(l.column));
  if (levels.length === 0) return null;

  return {
    dataset: {
      ...dataset,
      columns: [...dataset.columns, ...levels.map((l) => l.column)],
      rows: dataset.rows.map((row) => [...row, ...levels.map((l) => (row[source] === l.value ? 1 : 0))])
    },
    reference,
    levels
  };
}

/** Is this column an unordered category worth dummying? (3..20 distinct values, all integers.) */
export function categoryCandidate(dataset: CovariateDataset, column: string): { levels: number[] } | null {
  const source = dataset.columns.indexOf(column);
  if (source < 0 || dataset.rows.length === 0) return null;
  const values = new Set<number>();
  for (const row of dataset.rows) {
    const v = row[source];
    if (v === undefined || !Number.isFinite(v)) continue;
    if (!Number.isInteger(v)) return null;              // a continuous column is not a category
    values.add(v);
    if (values.size > 20) return null;                  // an id, not a category
  }
  return values.size >= 3 ? { levels: [...values].sort((a, b) => a - b) } : null;
}
