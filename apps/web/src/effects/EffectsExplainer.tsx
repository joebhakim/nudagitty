/**
 * The long-form companion to the ⓘ dots. Everything here was learned the hard way — mostly from one user's
 * failed replication — and would otherwise live only in a docs/ file nobody opens. Numbers are real:
 * measured on the embedded LaLonde observational rows.
 */
export function EffectsExplainer() {
  return (
    <div className="fx-page">
      <header className="fx-header">
        <h1>What <em>is</em> the effect, when the outcome can be zero?</h1>
        <p className="fx-lede">
          Earnings can be <b>$0</b>. Roughly 12% of the LaLonde rows are. That single fact quietly breaks the
          idea that a treatment effect is <i>a number</i> — and it is the reason this tool asks you a question
          most tools silently answer for you.
        </p>
        <nav><a href="/">← back to nudagitty</a></nav>
      </header>

      <section id="two-margins">
        <h2>1. A zero is a different <em>kind</em> of change</h2>
        <p>
          Treatment can do two quite different things to earnings. It can move someone from <b>not working</b>
          to <b>working</b> — the <b>extensive margin</b>. Or it can raise the pay of someone who was already
          working — the <b>intensive margin</b>. These are not the same event, and no single number describes
          both.
        </p>
        <p>So a two-part outcome has <b>two</b> treatment coefficients:</p>
        <pre className="fx-math">{`P(Y > 0)   = σ(η_gate + γ·T)      γ  —  log-ODDS   (who works)
E[Y | Y>0] = exp(η_amt + δ·T + h)  δ  —  log-DOLLARS (how much, if you do)`}</pre>
        <p>
          <b>Neither is in dollars.</b> And because σ and exp are curved, each person's dollar gain is
          different. So <b>no coefficient equals the ATE.</b>
        </p>
        <aside className="fx-aside">
          With a plain <b>additive</b> outcome none of this arises: <code>do(1) − do(0) = β</code> for every
          single unit, so β <i>is</i> the ATE. You type 1794 and you are done. That is exactly why the additive
          example can be rebuilt by hand and the two-part one could not.
        </aside>
      </section>

      <section id="family">
        <h2>2. One equation, two unknowns ⇒ a <em>family</em> of stories</h2>
        <p>
          "The ATE is $1,794" is <b>one</b> equation. γ and δ are <b>two</b> unknowns. So it does not pick an
          answer — it picks a <b>curve</b>. Every point on that curve is a different causal story that delivers
          the same dollar effect:
        </p>
        <ul className="fx-list">
          <li><b>All pay:</b> employment unchanged, wages up <b>8.7%</b>.</li>
          <li><b>Mixed:</b> employment 88% → 97%, wages up 3.1%. ($1,112 from working + $682 from pay.)</li>
          <li><b>Mostly employment:</b> as far as the data will let you go — see §3.</li>
        </ul>
        <p>Happily, δ factors out of the exponential, so the whole curve is available in closed form:</p>
        <pre className="fx-math">{`ATE(γ,δ) = e^δ · S(γ) − C₀     S(γ) = mean[ σ(η_gate+γ) · exp(η_amt+h) ],  C₀ = S(0)

  ⇒   δ(γ) = ln( (C₀ + A) / S(γ) )        ← the entire iso-ATE contour, in one line`}</pre>
        <p>
          That contour <i>is</i> the manifold pad in the editor. You slide along it; the dollar total never
          moves.
        </p>
      </section>

      <section id="wall">
        <h2>3. The wall: some stories are <em>impossible</em></h2>
        <p>
          The gate can, at most, put <b>everyone</b> into work. So the extensive margin has a hard ceiling —
          and on this data it is <b>lower than the target</b>:
        </p>
        <table className="fx-table">
          <tbody>
            <tr><td>mean earnings under <code>do(T=0)</code></td><td><b>$20,614</b></td></tr>
            <tr><td>mean if <i>everyone</i> worked</td><td><b>$22,087</b></td></tr>
            <tr><td>⇒ most employment can <i>ever</i> deliver</td><td><b>$1,473</b></td></tr>
            <tr className="fx-row-strong"><td>the imposed target</td><td><b>$1,794</b></td></tr>
          </tbody>
        </table>
        <p className="fx-punch">
          $1,794 &gt; $1,473. <b>"Training just gets people jobs" is mathematically impossible here.</b> Pay
          must rise by at least <b>1.5%</b>, no matter what, and the employment share can never exceed{" "}
          <b>~82%</b>.
        </p>
        <p>
          This is a proof, not a preference (<code>S(γ) ≤ S(∞)</code> always). The pad greys that region out.
          Ask for 100% and it will <b>clamp your story — and still hit your number exactly.</b> We bend the
          story; never the truth.
        </p>
      </section>

      <section id="estimand">
        <h2>4. Author the <em>estimand</em>. Derive the coefficient.</h2>
        <p>
          If no coefficient equals the ATE, then storing a coefficient and calling it "the imposed effect" is a{" "}
          <b>lie waiting to happen</b>. Refit the confounders, change the data, redraw the DAG — the stored
          numbers no longer produce $1,794, but the badge saying "$1,794" is still sitting there.
        </p>
        <p>So the tool stores what you actually meant:</p>
        <pre className="fx-math">{`imposedEffect: { target: 1794, extensiveShare: 0.62 }     ← what you AUTHOR

γ = 1.769,  δ = 0.0309                                    ← DERIVED, every reconcile`}</pre>
        <p>
          The coefficients are re-solved from the estimand on every fit. The truth is exact by construction and{" "}
          <b>self-healing</b>: change anything, and it re-lands on $1,794.
        </p>
        <aside className="fx-aside">
          A knock-on: this made every example a <b>fixed point</b> of the app's own commit pipeline. Before, a
          curated example silently mutated the moment you opened it — and, because it no longer matched its
          canonical form, its share link ballooned from ~60 characters to ~10 KB of inlined document. The drift
          bug and the giant-links bug were the same bug.
        </aside>
      </section>

      <section id="trap">
        <h2>5. The trap: never <em>fit</em> the exposure → outcome edge</h2>
        <p>
          Fitting an edge means learning it from data. For a confounder → outcome edge, that is exactly right.
          For the <b>exposure → outcome</b> edge it is a catastrophe: what the data holds there is the{" "}
          <b>confounded association</b> — the very thing you are trying to correct.
        </p>
        <p>
          Fit it and you learn the bias, then hand it to the simulator as the causal mechanism. On the LaLonde
          PSID controls this gives a <b>−34%</b> "effect" of job training. <code>do()</code> will faithfully
          report your own confounding back to you, and there is no imposed truth left to recover.
        </p>
        <p>The editor now warns, and offers the one-click fix: <b>author it instead</b>.</p>
      </section>

      <section id="honesty">
        <h2>6. Fixing a marginal: improve the model, don't force it</h2>
        <p>
          Fitted earnings come out wrong-shaped (negative values, no zero spike). There is more than one way to
          fix that, and they are <b>not equally honest</b>:
        </p>
        <table className="fx-table fx-table-wide">
          <thead><tr><th>approach</th><th>what's forced</th><th>what stays testable</th><th>falsifiable?</th></tr></thead>
          <tbody>
            <tr>
              <td><b>Better model</b><br /><small>link, noise family, two-part</small></td>
              <td>the noise <i>shape</i>, via a family you can reject</td>
              <td>additive structure <b>and</b> ε ⊥ X</td>
              <td className="fx-yes">Yes</td>
            </tr>
            <tr>
              <td><b>Residual bootstrap</b></td>
              <td>the noise shape, exactly</td>
              <td>structure; ε ⊥ X still <i>reported</i></td>
              <td className="fx-part">Partly</td>
            </tr>
            <tr>
              <td><b>Copula / NORTA</b></td>
              <td>the <b>entire marginal</b></td>
              <td><i>nothing</i> — no residual left to test</td>
              <td className="fx-no">No</td>
            </tr>
          </tbody>
        </table>
        <p>
          Each row buys a better-looking marginal by <b>spending a diagnostic</b>. We refuse the last one. An
          un-falsifiable model that also buries the endogeneity warning is the worst possible trade for a
          teaching tool: it looks perfect and teaches nothing. So the two-part model exists, and the residual
          check still <b>fails honestly</b> on the intensive margin — because log-normal earnings on dollar
          predictors really is misspecified.
        </p>
      </section>

      <section id="bias">
        <h2>7. More data will not save you</h2>
        <p>
          A tempting fix: simulate 1000× more rows. It is worth being precise about what that buys.
        </p>
        <ul className="fx-list">
          <li>
            <b>Variance — yes.</b> Estimator recovery sharpens, and the residual test gains <i>power</i>, so a
            misspecification becomes <b>more</b> visible, not less.
          </li>
          <li>
            <b>Bias — no.</b> If the family is wrong, the generated marginal converges to the <i>wrong shape</i>.
            More samples just draw the wrong distribution more sharply. <b>n = 4 million gives you a beautifully
            smooth picture of the wrong thing.</b>
          </li>
        </ul>
        <p className="fx-punch">
          Bias ← a better (still-falsifiable) model. Variance ← more n. Different currencies; you cannot spend
          one to buy the other.
        </p>
        <p>
          And the only way "more n" <i>does</i> fix a marginal is by also letting model flexibility grow without
          bound — at which point the model can no longer be <b>wrong</b>, and the residual check can no longer
          reject it. That is the copula's un-falsifiability wearing a bigger hat.
        </p>
      </section>

      <section id="econ">
        <h2>8. What economists do to earnings — and where it breaks</h2>
        <dl className="fx-defs">
          <dt>log(Y) — the Mincer equation <small>(Mincer 1974)</small></dt>
          <dd>The reflexive choice. Undefined at $0, and earnings have real zeros.</dd>

          <dt>log(Y + c), asinh(Y) <small>(Chen &amp; Roth 2024, QJE; Bellemare &amp; Wichman 2020)</small></dt>
          <dd>
            <b>A footgun.</b> With a mass at zero, the "percentage" effect is <b>not unit-invariant</b> and can
            be driven to <i>any value</i> by choice of the arbitrary constant <code>c</code>. Rescale dollars to
            cents and your headline changes. The reason is structural: the extensive margin has{" "}
            <b>no natural units on a log scale</b>. <b>There is no scale-free percent-change estimand when some
            outcomes are zero.</b> asinh is not a free lunch — it is the same transform in disguise.
          </dd>

          <dt>Retransformation <small>(Duan 1983; Manning 1998)</small></dt>
          <dd>
            Fit on logs, report on levels, and <code>exp(Xβ̂)</code> gives you the <i>geometric</i> mean — biased
            low. Duan's smearing corrects it nonparametrically; under heteroskedasticity even that bends.
          </dd>

          <dt>PPML <small>(Santos Silva &amp; Tenreyro 2006)</small></dt>
          <dd>
            By Jensen, <code>E[log Y|X] ≠ log E[Y|X]</code> — log-OLS estimates the mean of the log, not the log
            of the mean. PPML estimates <code>E[Y|X] = exp(Xβ)</code> directly, is scale-invariant, and handles
            zeros natively.
          </dd>

          <dt>Two-part / hurdle <small>(Cragg 1971)</small>; Tobit <small>(Tobin 1958)</small></dt>
          <dd>
            Model the two margins <b>separately and on purpose</b>. This is the one we implemented — and it is
            the constructive answer to Chen–Roth.
          </dd>
        </dl>
        <p className="fx-punch">
          Chen–Roth say: <i>with an extensive margin you must decide what you mean.</i> That is not a limitation
          of the tool — it is the shape of the question. <code>log(Y+c)</code> pretends the decision does not
          exist and makes it for you, badly, and differently depending on <code>c</code>. The manifold pad makes
          you make it <b>on purpose</b>.
        </p>
      </section>

      <footer className="fx-footer">
        <p>
          Deeper: <code>docs/fitting-outcome-marginals.md</code> (with a full bibliography) and{" "}
          <code>docs/plan-imposed-estimand.md</code>.
        </p>
        <nav><a href="/">← back to nudagitty</a></nav>
      </footer>
    </div>
  );
}
