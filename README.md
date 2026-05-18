# Nudagitty

Clean-room TypeScript causal graph workbench inspired by DAGitty's public behavior, without copying DAGitty source, assets, examples, parser grammar, or UI styling.

## What Works

- DAGitty-compatible model-code import/export for common DAG syntax.
- Custom SVG graph editor: add, drag, rename, delete variables; create/delete/bend edges; keyboard role toggles.
- Variable roles: exposure, outcome, adjusted, selected, latent.
- Views: normal, moral graph, correlation graph, equivalence class.
- Zoomable SVG graph canvas.
- Causal diagnostics: cycles, causal/biasing paths, adjustment reports, instruments, testable implications.
- Browser-worker analysis and SEM simulation.
- Form-based SEM controls: node distributions, intercepts, edge coefficients, manual value overrides, live propagation.
- Separate hard/manual overrides from conditioning filters, with analytic linear-Gaussian conditioning for simple cases and importance sampling for noisy continuous evidence.
- Per-node distribution mini-plots with analytic curves when available and empirical simulation histograms.
- Built-in Galton regression-to-the-mean SEM example.
- Local autosave, encoded share URLs, SVG/PNG/JPEG/TikZ/model-code export.

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## Web Deployment

The public site at `https://nudag.joeha.kim/` is served from this checkout by
the `joesite-status` control plane in `/home/joe/skunks/joesite-status`, not by
Cloudflare Pages or a per-push hosted build.

Deployment shape:

- `joesite-status/apps.toml` maps the `nudagitty` app to this repo, branch
  `main`, local port `8502`, and systemd service `joesite-nudagitty.service`.
- `joesite-nudagitty.service` runs `vite preview` against
  `apps/web/vite.config.ts` on `127.0.0.1:8502`.
- Cloudflare Tunnel maps `nudag.joeha.kim` to `http://127.0.0.1:8502/`.
- GitHub push webhooks to `https://status.joeha.kim/github` trigger
  `joesitectl.py deploy nudagitty`, which fetches, fast-forwards, verifies,
  builds, restarts the service, and checks local/public health.

Useful status command:

```bash
/home/joe/skunks/joesite-status/joesitectl.py status nudagitty
```

Normal deploys refuse to run from a dirty checkout. If the status reports
`attention` with a dirty git state, commit, stash, or otherwise clean local
changes before expecting the webhook deploy to advance.

## Planning Docs

- [Variable types simulation plan](docs/variable-types-plan.md)

## Clean-Room Boundary

This project may use DAGitty's public UI behavior and documented model format as an interoperability target. Do not vendor, translate, or adapt DAGitty implementation files, images, examples, CSS, parser grammar, or generated bundles.
