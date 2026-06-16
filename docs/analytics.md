# Analytics

Granular, **cookieless, banner-free** product analytics via self-hosted Umami. The
infra (where Umami runs, the build-time env, the public route) is documented in
[`infra/umami/README.md`](../infra/umami/README.md); this file is the **event
taxonomy and the privacy contract**.

## The privacy contract (why there's no consent banner)

Umami is cookieless and stores no persistent client identifier, so no consent
banner is legally required — **as long as we never send anything that re-identifies
a session or carries user content.** That invariant is enforced in code, not by
convention:

- **Enum-only props.** Every event goes through a typed helper in
  `apps/web/src/analytics.ts` whose params are literal unions. Passing a node label
  or free-form string is a *compile error*.
- **`ANALYTICS_SCHEMA`** is the single source of truth (event → allowed prop keys +
  enum values / `"slug"` / `"int"`). `apps/web/src/analytics.test.ts` asserts every
  helper conforms and that `sanitizeAnalyticsProps` strips free-form text.
- **Runtime sanitizer.** `sanitizeAnalyticsProps` drops any key/value off the
  allowed patterns (strings must match `[a-zA-Z0-9_.:-]{1,80}` — i.e. no spaces /
  sentences), rounds numbers, and whitelists keys. Belt and suspenders.
- The tracker script is loaded with `data-do-not-track`, `data-exclude-hash`,
  `data-exclude-search`, and a domain allowlist.

The hard rule for anyone adding an event: **props are structural categories only**
— roles, operations, classifications, chart kinds, the example *slug* (a fixed app
constant), booleans, bucketed integers. Never labels, graph text, link payloads, or
input.

## Client classification (human vs automated vs bot vs test)

Every event carries a global **`client`** prop so the dashboard can separate real
usage from automation, bots, and our own test drives. It's computed once per event
in `clientClass()` (`apps/web/src/analytics.ts`) from coarse, non-identifying signals
(banner-safe — a boolean + a UA word-match + an opt-in flag, no cookie / id):

| `client` | How it's decided |
|---|---|
| `test` | explicit opt-in: `?nu_client=test` in the URL (persisted to **sessionStorage** for the tab), for deliberate QA/scripted runs against a real browser |
| `automated` | `navigator.webdriver === true` — Playwright / Selenium / Puppeteer set this |
| `bot` | `navigator.userAgent` matches a crawler/headless pattern |
| `human` | none of the above |

It's sent two ways: as a prop on **every event**, and as **session data**
(`umami.identify`) so pageview/visitor metrics filter by it too. The session
payload is richer — `{ client, client_reason, app_version }` — so a session is
self-describing (e.g. `client=test, client_reason=override, app_version=9b1ea4c`
rather than a bare `client=test`). `client_reason` ∈ `human | override | webdriver
| bot_ua` explains *how* it was classified; `app_version` is the build commit.

> Session data is **last-write-wins** per key: if one session emits more than one
> class (only really happens when testing from a single IP/UA), the session shows
> the last `identify`'d value, while the **per-event** `client` keeps every value.
> So segment **events** by `client` for accuracy; the session tag is for coarse
> visitor/pageview filtering.

In the dashboard, **filter `client = human`** for real usage, or break down by
`client` to see automated/test traffic. Two existing safeguards mean this mostly
catches *automation that reaches the live domain*: (1) `data-domains=nudag.joeha.kim`
already stops localhost/dev drives from reporting at all, and (2) Umami drops known
UA bots server-side.

> **Scrapers without JS** (curl, wget, most crawlers) never run the tracker, so they
> never appear here at all. For that traffic, use **Cloudflare** edge analytics /
> bot classification on the tunnel hostname — it sees every request. The `client`
> dimension only classifies the JS-capable subset.

Mark a scripted run as test by loading `https://nudag.joeha.kim/?nu_client=test`
(our Playwright harness can `goto` that URL); the tag sticks for the tab session.

## Event taxonomy

Friction-first: the funnel (A) shows *where* users stall; the dead-end events (D)
show *why*. Emission is centralized in `apps/web/src/analyticsTelemetry.ts`
(`useAnalyticsTelemetry`), an effect hook that fires on state transitions and dedups
per `(example, …)`; a few interaction events are wired at their handlers.

### A. Funnel progression
| Event | Props | Fires when |
|---|---|---|
| `node_selected` | `role`: exposure¦outcome¦latent¦mediator¦collider¦confounder¦other | a node is selected (role = its structural position, **not** its name) |
| `operation_set` | `operation`: none¦intervene¦select¦condition¦adjust, `classification`: backdoor¦collider¦neutral¦na | an operation is applied (in `setOperation`) |
| `output_viewed` | `kind`: crude¦stratified¦standardized¦completed¦diagnosis | a result renders for the active pair |

### B. Operation discovery
| `bad_control_shown` | `classification`: collider | a conditioned collider opens a biasing path (the teachable mistake) |

### C. Per-example engagement
| Event | Props | Fires when |
|---|---|---|
| `chart_rendered` | `chart_kind`: scatter¦category_binary¦category_continuous¦risk_curve | a chart of that kind is shown |
| `info_overlay_opened` | `source`: explanation¦pairwise | the "Explain this example" modal or a pairwise "i" opens |
| `denouement_viewed` | `example` (slug) | the Practitioner-modules / denouement drawer is opened |
| `example_dwell` | `example` (slug), `seconds`: 10¦30¦90¦300 | visible-time milestones per example |

### D. Friction / dead-ends (the primary signal)
| Event | Props | Fires when |
|---|---|---|
| `output_empty` | `reason`: needs_roles¦no_exposure_outcome¦no_data | a fallback/empty card renders instead of a result |
| `sim_state` | `status`: ok¦empty¦failed | simulation status transitions (empty = conditioning rejected all draws) |
| `sampling_fallback` | `method`: forward¦rejection¦importance | conditioning forces a non-forward sampler |
| `analysis_sample_small` | `bucket`: 25¦50¦100¦200 | conditioning shrinks accepted draws below the bucket |
| `edit_committed` | `target`: node¦edge | a node/edge mechanism is edited (throttled 4s so sliders don't flood) |

Pre-existing coarse events kept as-is: `example_loaded`, `graph_action`,
`mode_changed`, `share_clicked`, `export_clicked`, `engagement_milestone`.

## Building the friction view in Umami

These are custom events, so in the dashboard (`https://analytics.joeha.kim`):

1. **Funnel report:** `example_loaded` → `node_selected` → `operation_set` →
   `output_viewed`. Drop-off between steps = friction.
2. **Dead-end overlay:** chart `output_empty`, `sim_state` (status=empty/failed),
   `sampling_fallback`, `analysis_sample_small` over the same window; spikes that
   line up with a funnel drop-off name the cause.
3. **Operation discovery:** break `operation_set` down by `classification` to see
   how often users adjust a collider vs a confounder.

## Build-time note

Vite inlines `VITE_UMAMI_*` at build, so **analytics changes only ship on a
redeploy** (push to `main`). Locally, analytics is off unless an `.env.local` sets
the vars.
