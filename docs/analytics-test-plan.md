# Analytics — test plan

How to validate the granular, cookieless analytics: the **privacy contract** (no
banner ever), the **event wiring** (right event fires on the right interaction with
the right enum value), and the **live pipeline** (events reach the Umami dashboard).
See [`analytics.md`](analytics.md) for the taxonomy and [`infra/umami/README.md`](../infra/umami/README.md) for infra.

## 0. Pre-flight

- `npx vitest run` and `cd apps/web && npx tsc -b` green.
- Note the slow `examples.test.ts > "loads and simulates every example"` can time out
  (5s) under load — re-run it isolated before treating a failure as real.

## 1. Privacy contract (automated — the no-banner guarantee)

Run `apps/web/src/analytics.test.ts`. It must assert:

| Check | Why |
|---|---|
| every typed helper emits an event whose name + props are in `ANALYTICS_SCHEMA` | no undeclared event / prop can ship |
| every prop value is an enum member / `int` / slug (no free text) | structural-only payloads |
| `sanitizeAnalyticsProps` drops a label-like string (`"Brought to vet …"`) and `"P(Y \| X, S=1)"` | runtime backstop against leaks |
| every event carries a `client` ∈ {human, automated, bot, test} | human-vs-automation split |
| `clientClass()`: webdriver→automated, bot UA→bot, `?nu_client=test`→test (over detection) | correct labeling |
| `edit_committed` throttles repeated calls | slider drags don't flood |

Add-an-event regression guard: a new `trackX` helper with an off-schema prop should
fail this suite (or fail `tsc` via its literal-union param). If neither catches it,
the guard has a hole.

## 2. Structural role classification (automated)

`packages/core/src/structural-role.test.ts` — `structuralRoleOf` must return:
`Brought_to_vet → collider`, `Injury_severity → mediator`, `Fall_height → exposure`,
`Survival → outcome` (cats); `Severity → confounder` (Simpson). These feed
`node_selected.role` and `operation_set.classification`, so a wrong role silently
mislabels the funnel.

## 3. End-to-end event wiring (manual / Playwright drive)

Drive the **real app** with a stubbed `window.umami` and assert the captured events.
The tracker is gated on build-time `VITE_UMAMI_*`, so enable it locally first:

```bash
# apps/web/.env.local  (gitignored; delete after)
VITE_UMAMI_SRC=http://127.0.0.1:9/script.js
VITE_UMAMI_WEBSITE_ID=verify-local
VITE_UMAMI_DOMAINS=localhost
```

Then a throwaway spec under `apps/web/tests/` that `addInitScript`s
`window.umami = { track: (n,p) => window.__ev.push({n,p}) }`, drives the flow, and
reads `window.__ev`. **Node 26 + Playwright <1.60 can't extract the browser** (issue
microsoft/playwright#41000) — if `playwright install` hangs at 100%, `curl` the
build zip and `unzip` it into `~/.cache/ms-playwright/chromium-1217/`, then run the
spec with `test.use({ channel: "chromium" })`.

### Scenarios and expected events

| # | Flow | Must fire (props) | Group |
|---|---|---|---|
| A | Load Falling-cats, Pro | `example_loaded`; `sim_state{ok}`; `chart_rendered{risk_curve\|category_*}` | C/D |
| B | Select `Brought_to_vet` | `node_selected{role:collider}` | A |
| C | Select `Fall_height` / `Survival` / `Injury_severity` | `node_selected{exposure\|outcome\|mediator}` | A |
| D | Apply **Adjust** to the collider | `operation_set{adjust,collider}`; `bad_control_shown{collider}`; `output_viewed{standardized}` | A/B |
| E | Apply **Condition** | `operation_set{condition,…}`; `output_viewed{stratified}`; if rejection-sampled: `sampling_fallback{rejection}`, `analysis_sample_small{…}` | A/D |
| F | Load **Simpson**, Adjust `Severity` | `operation_set{adjust,backdoor}`; **no** `bad_control_shown` | A/B |
| G | Drag an edge coefficient slider repeatedly | `edit_committed{edge}` **at most once / 4s** | D |
| H | Open "Explain this example"; open a pairwise "i"; open the Practitioner drawer | `info_overlay_opened{explanation}`, `{pairwise}`; `denouement_viewed` | C |
| I | Mark an exposure with no outcome (or empty graph) | `output_empty{no_exposure_outcome\|needs_roles}` | D |
| J | Stay on a view > 10s | `example_dwell{…,10}` | C |

### Client tagging (in any drive)
Because Playwright sets `navigator.webdriver`, **every event from a drive is tagged
`client: "automated"`** — assert this, and assert that loading with `?nu_client=test`
flips them all to `client: "test"`. This is what keeps harness traffic out of the
human metrics (in addition to `data-domains` excluding non-prod hosts entirely).

### The invariant that protects the no-banner promise
Across **every** scenario: no captured event may carry a string value containing a
space or sentence punctuation. The drive asserts
`__ev.filter(e => Object.values(e.p).some(v => typeof v === "string" && /\s/.test(v))) === []`.
This is the single most important assertion — if it ever fails, we've leaked content
and would need a consent banner.

Cleanup: delete `.env.local`, the throwaway spec, and `apps/web/test-results/`.

## 4. Build / deploy gate

- `cd apps/web && npm run build` green (analytics is inlined at build time).
- Analytics changes only take effect on a `main` redeploy. After deploy, confirm the
  new code shipped: `curl -s https://nudag.joeha.kim/` → find `/assets/main-*.js` →
  `grep` for a new event name (e.g. `bad_control_shown`). Public health = `200`.

## 5. Live pipeline (post-deploy, manual in Umami)

At `https://analytics.joeha.kim/websites` (Nudagitty site):

1. In a browser with Do-Not-Track **off**, perform scenarios A–F on the live site.
2. Within ~1 min, confirm the custom events appear under the site's **Events** tab
   with the expected names and property breakdowns.
3. Build the reports from `analytics.md`: the funnel (`example_loaded → node_selected
   → operation_set → output_viewed`) and the friction overlay (`output_empty`,
   `sim_state=empty/failed`, `sampling_fallback`, `analysis_sample_small`).
4. Segment by **`client`**: confirm your own session shows up as `human` (or `test`
   if you appended `?nu_client=test`), and that filtering `client = human` is the
   default for usage analysis. (For non-JS scrapers, check **Cloudflare** bot
   analytics on the tunnel hostname — they never reach Umami.)
5. Privacy spot-check in the dashboard: open several event property values and
   confirm they're all enums/slugs — **no node names, no graph text, no link payloads**.
6. Confirm **no cookie is set** (DevTools → Application → Cookies is empty for the
   origin) and no `localStorage` visitor id — the basis for shipping without a banner.

## Regression triggers (re-run this plan when…)

- adding/renaming an event or prop, or a new `trackX` helper;
- changing `structuralRoleOf`, `classifyConditioned`, or the operation model
  (role/classification accuracy);
- touching the output-kind / chart-kind / empty-reason derivations in `App.tsx`;
- upgrading Umami or rotating `VITE_UMAMI_*` (re-verify the live pipeline + no-cookie).
