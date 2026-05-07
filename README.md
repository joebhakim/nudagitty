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

## Planning Docs

- [Variable types simulation plan](docs/variable-types-plan.md)

## Clean-Room Boundary

This project may use DAGitty's public UI behavior and documented model format as an interoperability target. Do not vendor, translate, or adapt DAGitty implementation files, images, examples, CSS, parser grammar, or generated bundles.
