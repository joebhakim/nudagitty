# CLAUDE.md

Guidance for working in this repo. See `README.md` for commands and deployment.

## Verifying changes

Confirm a change by observing the **actual output**, not that a string or label updated.
A label reading `P(Y | X, S=1)` is not evidence the simulation conditioned on `S` — check the
rendered chart, the simulated numbers, and the analysis-sample banner. (Concretely: the
operation selector once updated its estimand text correctly while Condition/Adjust still
rendered the crude curve; only driving the app surfaced that gap.)

Two complementary loops:

- **Numbers** — a throwaway vitest file that `console.log`s the values, run with
  `npx vitest run <file> --disable-console-intercept`, then delete it.
- **UI** — a throwaway Playwright spec that drives the running app and reads/screenshots
  specific selectors (see below).

Always finish with `npx vitest run` and `npx tsc -b` green before claiming a change is done,
and remove any throwaway probe files (and `apps/web/test-results/`) afterward.

## Driving the web app for visual verification

`apps/web/playwright.config.ts` starts its own dev server on :5173 with `reuseExistingServer`,
so a throwaway spec under `apps/web/tests/*.spec.ts` run via
`npx playwright test tests/<file>.spec.ts --project=chromium` just works. Pattern:

1. `page.goto("/")`, then click the **Pro** mode button (the toggle is Demo / Pro) — the rich
   output (ScatterplotPanel, the operation panel) only renders in Pro.
2. Open an example: `getByLabel("Examples")` → `getByRole("menuitem")` filtered by exact title.
   Non-basic examples appear only in Pro (`BASIC_EXAMPLE_IDS` gates the Demo menu).
3. Select a node: `page.locator(".react-flow__node", { hasText: "<label>" })`.
4. **Read state, don't just screenshot**: `.textContent()` of `.scatterplot-panel` exposes the
   simulated means / correlation; the inference banner shows the active conditions and sampling
   method (e.g. rejection vs forward).

Gotchas:

- Scope ambiguous buttons to a container (e.g. `.operation-selector` — there are two "Select"
  buttons otherwise, which trips Playwright strict mode).
- `console.log` inside a spec prints to stdout; the `--disable-console-intercept` flag is
  **vitest-only**, not Playwright.
- `apps/web/screenshots/` is gitignored, so probes don't dirty the tree. Still delete the temp
  spec and `apps/web/test-results/` when finished.

## Responsive check for major UI changes

For any significant UI/visual change, sanity-check it across screen sizes with the reusable
tool `apps/web/tests/responsive-screenshots.spec.ts` (gated, so normal runs skip it):

```
cd apps/web && npm run screenshots:responsive
```

It drives the app to a target view and shoots it at three sizes — desktop (1440×900), tablet
(834×1112), and a mainline iPhone (393×852, real mobile emulation) — into
`apps/web/screenshots/responsive/`. Parameterize via env without editing the file:
`SHOT_EXAMPLE` (title filter, `""` to skip), `SHOT_MODE` (`pro`|`demo`), `SHOT_SELECT_NODE=0`,
`SHOT_SELECTOR` (shoot one element), `SHOT_FULLPAGE=1`, `SHOT_NAME` (file prefix). E.g.
`SHOT_NAME=edge SHOT_SELECTOR=".connection-editor" npm run screenshots:responsive`.

## Reporting generated artifacts

When a screenshot, log, or other file is produced for the user to open, always print its
**absolute path** (so it's clickable / copy-pasteable without digging around), and use brace
expansion to enumerate related files compactly. Examples:

- `/home/joe/skunks/nudagitty/apps/web/screenshots/verify/namestyle-{gallery,card-0,card-1}.png`
- `/home/joe/skunks/nudagitty/apps/web/screenshots/verify/edge-{editor,axes}.png`
- one card per candidate: `…/verify/namestyle-card-{0..3}.png`
