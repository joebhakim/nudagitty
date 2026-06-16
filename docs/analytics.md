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
