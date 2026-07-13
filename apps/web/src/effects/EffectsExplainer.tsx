/**
 * The long-form companion to the ⓘ dots. Everything here was learned the hard way — mostly from one user's
 * failed replication — and would otherwise live only in a docs/ file nobody opens.
 *
 * EVERY NUMBER HERE IS MEASURED ON THE LIVE DGP, and `effectsExplainer.test.ts` re-derives them from the
 * engine and fails if they drift. That guard exists because this page went stale once and it was ugly: after
 * the amount link moved from LOG to IDENTITY, the page still taught δ as "log-DOLLARS", still printed the old
 * coefficients, and — worst — still ran a bolded PROOF that "training just gets people jobs is mathematically
 * impossible here", which the corrected DGP had quietly made FALSE. A prose page that asserts numbers is a
 * cache, and this is its invalidation.
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
        <pre className="fx-math">{`P(Y > 0)   = σ(η_gate + γ·T)        γ — log-ODDS  (who works)

E[Y | Y>0] = softplus(η_amt + δ·T)  δ — DOLLARS per worker   ← this DGP
           = exp(η_amt + δ·T + h)   δ — log-DOLLARS          ← the other link`}</pre>
        <p>
          The amount margin has a <b>choice of link</b>, and it changes what δ <i>means</i>. Under the identity
          link — the one the earnings literature actually fits, and the one this example uses — δ is an honest
          number of dollars. Under the log link it is a percentage.
        </p>
        <p>
          <b>But neither is the ATE, under either link.</b> γ is log-odds. δ is dollars{" "}
          <i>per worker, among people who work</i> — while the ATE is dollars <i>per person</i>, averaged over
          a population that includes people who earn nothing at all. And because σ (and, under the log link,
          exp) are curved, each person's dollar gain is different anyway. So <b>no coefficient equals the
          ATE</b> — which is the whole problem.
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
        <table className="fx-table fx-table-wide">
          <thead>
            <tr><th>story</th><th>γ</th><th>δ</th><th>from working</th><th>from pay</th><th>ATE</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><b>All pay</b><br /><small>employment unchanged</small></td>
              <td>0</td><td>+$2,047<small>/worker</small></td>
              <td>$0</td><td><b>$1,794</b></td><td>$1,794</td>
            </tr>
            <tr className="fx-row-strong">
              <td><b>Mixed</b><br /><small>the imposed default — 62% extensive</small></td>
              <td>1.315</td><td>+$719<small>/worker</small></td>
              <td><b>$1,112</b></td><td><b>$682</b></td><td>$1,794</td>
            </tr>
            <tr>
              <td><b>All employment</b><br /><small>nobody's pay changes at all</small></td>
              <td>4.493</td><td>$0</td>
              <td><b>$1,794</b></td><td>$0</td><td>$1,794</td>
            </tr>
          </tbody>
        </table>
        <p>
          Every row is the same $1,794 and a completely different claim about the world. The middle one moves
          employment from <b>86.7% → 94.7%</b> and adds <b>$719</b> to each worker's pay (about <b>3%</b>).
          The last one is <i>pure</i> job-finding: the program puts people into work and not one person gets a
          raise. Nothing in "the ATE is $1,794" chooses between them. <b>You do.</b>
        </p>
        <p>Solving the curve is easy under either amount link, for the same reason: δ never interacts with γ.</p>
        <pre className="fx-math">{`extensive(γ)   = mean[ (σ(η_gate+γ) − σ(η_gate)) · a₀ ]   WHO works
intensive(γ,δ) = mean[ σ(η_gate+γ) · (a₁ − a₀) ]          HOW MUCH they earn
ATE            = extensive + intensive                    ← telescopes exactly

LOG link       δ factors out of exp() ⇒ closed form, no search:
                 δ(γ) = ln( (C₀ + A) / S(γ) )

IDENTITY link  δ is DOLLARS inside softplus, so it does NOT factor out.
                 But the ATE is monotone in δ ⇒ one bisection lands it
                 exactly. Cheaper than being clever.`}</pre>
        <p>
          That contour <i>is</i> the manifold pad in the editor. You slide along it; the dollar total never
          moves.
        </p>
      </section>

      <section id="wall">
        <h2>3. The wall: some stories are <em>impossible</em> — but check which ones</h2>
        <p>
          The gate can, at most, put <b>everyone</b> into work. So the extensive margin has a hard ceiling
          (<code>S(γ) ≤ S(∞)</code> always). On this data:
        </p>
        <table className="fx-table">
          <tbody>
            <tr><td>mean earnings under <code>do(T=0)</code></td><td><b>$20,465</b></td></tr>
            <tr><td>mean if <i>everyone</i> worked</td><td><b>$22,299</b></td></tr>
            <tr><td>⇒ most employment can <i>ever</i> deliver</td><td><b>$1,835</b></td></tr>
            <tr className="fx-row-strong"><td>the imposed target</td><td><b>$1,794</b></td></tr>
          </tbody>
        </table>
        <p className="fx-punch">
          $1,835 &gt; $1,794 — by $41. <b>The wall does not bind here.</b> "Training just gets people jobs" is,
          barely, a story this data can tell: the third row of the table above. Ask for <b>$4,000</b> instead
          and it bites hard — employment alone can supply only <b>46%</b> of it, and pay <i>must</i> rise.
        </p>
        <aside className="fx-aside">
          <b>This page used to claim the opposite</b>, in bold: a $1,473 ceiling, a hard 82% cap, pay that{" "}
          <i>must</i> rise by 1.5%. It was a real theorem applied to a <b>broken DGP</b> — a log link fed
          dollar-valued regressors, which is exponential <i>in dollars</i> and manufactured $1.6M earners.
          Fixing the specification moved the ceiling to $1,835 and the impossibility evaporated. The wall is a
          proof about a model; <b>a proof about the wrong model is just a confident mistake</b>, and it is worth
          knowing that this is what a modelling error looks like from the inside: not an error message, a
          <i>result</i>. See <code>docs/lalonde-specification.md</code>.
        </aside>
        <p>
          The machinery is unchanged and still right: the pad greys out whatever region is genuinely
          unreachable, and if you ask for more than the data can deliver it will <b>clamp your story — and
          still hit your number exactly.</b> We bend the story; never the truth.
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

γ = 1.315,  δ = $719 per worker                           ← DERIVED, every reconcile`}</pre>
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
          PSID controls the fit puts <b>δ = −$5,259</b> on that edge, and the simulated world then reports:
        </p>
        <table className="fx-table">
          <tbody>
            <tr><td>the imposed truth</td><td><b>+$1,794</b></td></tr>
            <tr className="fx-row-strong"><td><code>do(1) − do(0)</code> after fitting the effect edge</td><td><b>−$3,553</b></td></tr>
          </tbody>
        </table>
        <p className="fx-punch">
          Job training now <b>destroys</b> $3,553 of earnings — in a world you built to contain a +$1,794
          benefit. <code>do()</code> faithfully reports your own confounding back to you, and there is no
          imposed truth left to recover.
        </p>
        <p>
          The trap has <b>three doors</b>, and the third was the nastiest: fit the edge by hand; hit "fit
          everything"; or — the one that bit a real replication — click <b>"Fit all from data"</b> a second
          time <i>after</i> imposing, which silently re-pinned the effect edge. All three now refuse to touch
          it, and the editor offers the one-click fix: <b>author it instead</b>.
        </p>
        <aside className="fx-aside">
          <b>The diagnostic to keep:</b> if the <code>do()</code>-oracle is not ≈ your target, the truth is not
          in your DGP — whatever the badge says. The imposed effect is metadata; only <code>do()</code> is
          evidence.
        </aside>
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
          teaching tool: it looks perfect and teaches nothing.
        </p>
        <p>
          So we took the first row, twice. The intensive margin is now <b>identity + gamma noise</b>, not
          log + log-normal — because <code>log(Y)</code> among earners on these rows is <b>left</b>-skewed
          (−1.79, excess kurtosis 5.34). It is not log-normal, and exponentiating a normal was wrong in{" "}
          <i>shape</i>, not just in scale. And the earnings history enters in <b>levels plus a zero-indicator</b>,
          which is what every paper in this literature does.
        </p>
        <p>
          The residual check still <b>fails honestly</b> — exogeneity ε ⊥ X comes back dCor 0.31. That is the
          point. The model got better and the diagnostic still refuses to sign off, because a better model is
          not the same thing as a true one, and <b>we did not spend the test to buy the picture</b>.
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
            the constructive answer to Chen–Roth. Note the amount margin is fitted in <b>levels</b>: Mincer's
            log-normality is a claim about the <i>wages of the employed</i>, and this is <i>annual earnings</i>{" "}
            including part-year workers, which is why its log has a long <b>left</b> tail instead.
          </dd>

          <dt>Zero-indicators <small>(Dehejia &amp; Wahba 1999/2002; Smith &amp; Todd 2005)</small></dt>
          <dd>
            <b>Not optional.</b> In Smith–Todd's table the coefficient on <code>1(re74 == 0)</code> is{" "}
            <b>1.94–3.26</b>; the coefficient on re74 <i>in dollars</i> is <b>−0.00007</b>. The step at zero
            carries essentially all of the selection signal and the amount carries none — and{" "}
            <b>no smooth transform of a column can represent a discontinuity at a point.</b> That single fact
            rules out log, sqrt, asinh and every other reparameterisation, on principle rather than on a fit
            statistic.
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
          Deeper: <code>docs/lalonde-specification.md</code> — how this outcome has to be modelled, with
          citations, and an autopsy of the four things we got wrong first by guessing instead of reading.
          Also <code>docs/plan-imposed-estimand.md</code>, and{" "}
          <code>docs/fitting-outcome-marginals.md</code> for the philosophy (its earnings model is superseded
          by the first).
        </p>
        <nav><a href="/">← back to nudagitty</a></nav>
      </footer>
    </div>
  );
}
