import type { CategoricalEffectComparison } from "@nudagitty/core";

// Per-level readout for a categorical (unordered) exposure — the multi-arm analog of
// the binary/continuous effect panels. Rows are treatment levels; each shows the
// crude mean, the g-computation-adjusted E[Y|do], and the re-simulated truth, with
// contrasts against the reference level in the headline.
const signed = (value: number, digits = 2): string => (Number.isFinite(value) ? (value >= 0 ? "+" : "") + value.toFixed(digits) : "n/a");
const plain = (value: number, digits = 2): string => (Number.isFinite(value) ? value.toFixed(digits) : "n/a");

export function CategoricalEffectReadout(props: { comparison: CategoricalEffectComparison; xLabel: string; yLabel: string }) {
  const { comparison, xLabel, yLabel } = props;
  const yUnit = comparison.yUnit || "units";
  const ref = comparison.levels.find((level) => level.level === comparison.reference) ?? comparison.levels[0]!;
  const contrasts = comparison.levels.filter((level) => level.level !== ref.level);

  return (
    <>
      <div className="continuous-effect-headline">
        <div className="methods-primary-select-row">
          <label>Adjusted effect of {xLabel} on {yLabel}</label>
        </div>
        <div className="methods-primary-headline">
          <strong>{contrasts.map((level) => `${level.label} ${signed(level.adjusted - ref.adjusted, 1)}`).join(" · ")}</strong>
          <span>vs {ref.label} (reference) · g-computation, in {yUnit}</span>
        </div>
        <p className="methods-primary-plain">
          Each level&rsquo;s do()-effect standardized over the confounders, contrasted against {ref.label}. The crude column is dragged off by {comparison.covariates.join(", ") || "the confounders"}; g-computation and the oracle agree on the truth.
        </p>
      </div>

      <details className="output-box what-if-method-table-card nested-method-table" open>
        <summary>
          <strong>Effect by level</strong>
          <span>crude vs adjusted vs truth · adjusting for {comparison.covariates.join(", ") || "nothing"}</span>
        </summary>
        <table className="what-if-method-table">
          <thead>
            <tr>
              <th>Level</th>
              <th>n</th>
              <th>crude {yUnit}</th>
              <th>adjusted {yUnit}</th>
              <th>truth {yUnit}</th>
            </tr>
          </thead>
          <tbody>
            {comparison.levels.map((level) => {
              const isRef = level.level === ref.level;
              return (
                <tr key={level.level} className={isRef ? "method-row-primary what-if-method-row" : "what-if-method-row"}>
                  <td><strong>{level.label}{isRef ? " (ref)" : ""}</strong></td>
                  <td>{level.n}</td>
                  <td>{plain(level.crude, 1)}</td>
                  <td>{plain(level.adjusted, 1)}</td>
                  <td className="method-row-oracle-cell">{plain(level.oracle, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </>
  );
}
