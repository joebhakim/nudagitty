import { useState } from "react";

type Tool = "stata" | "r" | "python";

const TOOLS: Array<{ id: Tool; label: string; who: string }> = [
  // Economists — the LaLonde audience — are overwhelmingly Stata. Causal inference proper (MatchIt,
  // Matching, cobalt, grf) is heavily R. The ML-adjacent crowd is Python. We do not pick a side.
  { id: "stata", label: "Stata", who: "econ" },
  { id: "r", label: "R", who: "stats / causal" },
  { id: "python", label: "Python", who: "ML" }
];

/** One row per thing we deliberately DO NOT build. The snippets are the whole argument. */
const RECIPES: Array<{ what: string; why: string; stata: string; r: string; python: string }> = [
  {
    what: "bin / discretise",
    why: "infinite variants (how many bins, where) — a researcher degree of freedom that buys nothing a spline can't do",
    stata: "egen band = cut(age), group(5)",
    r: "df |> mutate(band = ntile(age, 5))",
    python: 'df["band"] = pd.qcut(df.age, 5, labels=False)'
  },
  {
    what: "winsorise / trim",
    why: "and it breaks the plasmode contract — your covariates must be the REAL rows, or the DGP is no longer built on your data",
    stata: "winsor2 re74, cuts(1 99) replace",
    r: "df |> mutate(re74 = pmin(pmax(re74, q01), q99))",
    python: "df.re74 = df.re74.clip(*df.re74.quantile([.01, .99]))"
  },
  {
    what: "lag / lead",
    why: "needs a panel structure we deliberately don't model — bring us a wide table",
    stata: "tsset id year\ngen lag_earn = L.earn",
    r: "df |> group_by(id) |> mutate(lag_earn = lag(earn))",
    python: 'df["lag_earn"] = df.groupby("id").earn.shift(1)'
  },
  {
    what: "ratios / differences",
    why: "one line there; a whole formula language here",
    stata: "gen growth = (re78 - re75) / re75",
    r: "df |> mutate(growth = (re78 - re75) / re75)",
    python: 'df["growth"] = (df.re78 - df.re75) / df.re75'
  },
  {
    what: "impute missing",
    why: "a whole subsystem, with its own literature and its own failure modes. (A missingness INDICATOR is a different matter — that we will build.)",
    stata: "mi impute chained (regress) re74 = age educ, add(5)",
    r: "mice::mice(df, m = 5)",
    python: "IterativeImputer().fit_transform(df)"
  },
  {
    what: "reshape long ↔ wide",
    why: "we take a wide table. Reshaping is upstream, by definition",
    stata: "reshape wide earn, i(id) j(year)",
    r: "df |> pivot_wider(names_from = year, values_from = earn)",
    python: 'df.pivot(index="id", columns="year", values="earn")'
  }
];

/**
 * The "go do it upstream" note.
 *
 * This is not an apology for a missing feature — it is a stated boundary (docs/scope-boundary.md).
 * Nudagitty is a causal-structure tool, not a data-preparation tool: every one of these is one line in a
 * tool the user already has, and a bottomless well of surface area in ours. Saying so plainly, with the
 * actual one-liner, is more useful than a half-built formula editor would ever be.
 *
 * The two things we DO build are the two the modelling vocabulary cannot otherwise express: a point-mass
 * indicator, and categorical dummies. Both are called out below so the boundary reads as a decision rather
 * than an omission.
 */
export function DataPrepNote() {
  const [tool, setTool] = useState<Tool>("stata");
  const [open, setOpen] = useState(false);

  return (
    <details className="dataprep" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        Need to transform a column? <b>Do it upstream</b> — here's how
      </summary>

      <p className="dataprep-lede">
        Nudagitty is a <b>causal-structure</b> tool, not a data-preparation tool. Columns come from your data.
        Every operation below is <i>one line</i> in a tool you already have, and a bottomless well of surface
        area in ours — so we don't build them, on purpose.
      </p>

      <div className="dataprep-tools" role="tablist" aria-label="Data tool">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tool === t.id}
            className={tool === t.id ? "selected" : ""}
            onClick={() => setTool(t.id)}
          >
            {t.label} <span>{t.who}</span>
          </button>
        ))}
      </div>

      <div className="dataprep-list">
        {RECIPES.map((r) => (
          <div className="dataprep-row" key={r.what}>
            <div>
              <b>{r.what}</b>
              <span>{r.why}</span>
            </div>
            <pre>{r[tool]}</pre>
          </div>
        ))}
      </div>

      <p className="dataprep-foot">
        <b>Two exceptions</b>, and they are the only two: a <b>point-mass indicator</b> (<code>1(x == 0)</code>)
        and <b>categorical dummies</b>. We build those because the modelling vocabulary <i>structurally cannot</i>
        express them — a point mass is a discontinuity that no curve can represent, and a linear term cannot
        consume an unordered category at all. Everything else is a re-expression of the same variable, and
        belongs either on an <b>edge</b> (its functional form — that picker is right there) or in the tool above.
      </p>
    </details>
  );
}
