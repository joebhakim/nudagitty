import { expect, test } from "@playwright/test";

// Tier 1–3 of the chart harness: opens the standalone gallery (every chart ×
// data-boundary × container-size), runs layout INVARIANTS over all cells, and
// can baseline a snapshot. Gated so it doesn't run in a bare `playwright test`.
//
//   npm run gallery:check          # invariants + per-section logs
//   open http://localhost:5173/gallery.html   # manual inspection

test.skip(process.env.NUDAGITTY_GALLERY !== "1", "Set NUDAGITTY_GALLERY=1 or run npm run gallery:check.");

test("chart gallery layout invariants", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1200 });
  await page.goto("/gallery.html");
  await page.waitForTimeout(900);

  const failures = await page.evaluate(() => {
    const tol = 1.5;
    const out: Array<{ cell: string; size: string; kind: string }> = [];
    document.querySelectorAll<HTMLElement>(".g-cell").forEach((cell) => {
      const fixture = cell.getAttribute("data-fixture") ?? "?";
      const size = cell.getAttribute("data-size") ?? "?";
      const id = `${fixture}`;
      const chart = cell.querySelector<HTMLElement>(".g-chart");
      const svg = cell.querySelector("svg");
      if (!chart || !svg) { out.push({ cell: id, size, kind: "no-svg" }); return; }
      const box = chart.getBoundingClientRect();

      // (a) content overflow: any drawn element clipped by the chart box.
      svg.querySelectorAll("text, circle, polyline").forEach((el) => {
        const b = (el as SVGGraphicsElement).getBoundingClientRect();
        if (b.width === 0 && b.height === 0) return;
        if (b.bottom > box.bottom + tol || b.top < box.top - tol || b.left < box.left - tol || b.right > box.right + tol) {
          out.push({ cell: id, size, kind: "overflow" });
        }
      });

      // (b) y-axis tick labels must not vertically overlap.
      const yLabels = [...svg.querySelectorAll(".category-outcome-axis-label")]
        .map((el) => (el as SVGGraphicsElement).getBoundingClientRect())
        .filter((b) => b.height > 0)
        .sort((a, b) => a.top - b.top);
      for (let i = 1; i < yLabels.length; i += 1) {
        if (yLabels[i]!.top < yLabels[i - 1]!.bottom - tol) { out.push({ cell: id, size, kind: "y-tick-overlap" }); break; }
      }

      // (c) value labels must not horizontally overlap.
      const values = [...svg.querySelectorAll(".category-outcome-summary-value")]
        .map((el) => (el as SVGGraphicsElement).getBoundingClientRect())
        .filter((b) => b.width > 0)
        .sort((a, b) => a.left - b.left);
      for (let i = 1; i < values.length; i += 1) {
        if (values[i]!.left < values[i - 1]!.right - tol) { out.push({ cell: id, size, kind: "value-overlap" }); break; }
      }
    });
    // dedupe per (cell,size,kind)
    return [...new Map(out.map((f) => [`${f.kind}|${f.cell}|${f.size}`, f])).values()];
  });

  for (const f of failures) console.log(`  ${f.kind.padEnd(15)} ${f.cell} @ ${f.size}`);
  console.log(`INVARIANT_FAILURES ${failures.length}`);

  // Hard-fail only on overflow at REALISTIC panel sizes (>=150px tall). The
  // 118px "short" and 96px "tiny" boxes are deliberate below-floor stress cases,
  // and overlap findings are reported but not gated yet — both are the harness's
  // current punch-list, visible in `npm run gallery:check` output.
  const blocking = failures.filter((f) => f.kind === "overflow" && /(panel|wide)/.test(f.size));
  expect(blocking, JSON.stringify(blocking.map((f) => `${f.cell} @ ${f.size}`))).toHaveLength(0);
});
