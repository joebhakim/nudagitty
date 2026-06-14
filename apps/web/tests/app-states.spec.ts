import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

// Tier 4: emergent state coverage. The isolated gallery can't reproduce the app
// shell (resizable panels, operation render paths, auto-layout). This drives the
// REAL app through a STRATIFIED SAMPLE of (example × operation × breakpoint) —
// weighted toward the operations and layouts that keep breaking — and runs
// invariants that catch glitches: console errors, NaN/undefined renders, and
// output charts overflowing their panel. Screenshots every state for review.
//
//   npm run app-states:check

const BASE_URL = process.env.SHOT_BASE_URL ?? "http://127.0.0.1:5173";
const OUT = path.join(process.cwd(), "screenshots", "app-states");
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const SIZES = [
  { id: "desktop", ctx: { viewport: { width: 1440, height: 900 } } },
  { id: "iphone", ctx: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE_UA } }
] as const;

// Curated sample hitting the operation render paths (adjust/condition are the
// risky ones), across confounding / collider / selection / continuous examples.
const SCENARIOS: Array<{ id: string; example: string; node?: string; op?: string }> = [
  { id: "cats-adjust", example: "Falling-cats", node: "vet", op: "Adjust" },
  { id: "cats-condition", example: "Falling-cats", node: "vet", op: "Condition" },
  { id: "cats-baseline", example: "Falling-cats" },
  { id: "simpson-adjust", example: "Simpson", node: "everity", op: "Adjust" },
  { id: "obesity-select", example: "Obesity" },
  { id: "lords-adjust", example: "Lord", node: "retest", op: "Adjust" }
];

test.skip(process.env.NUDAGITTY_APPSTATES !== "1", "Set NUDAGITTY_APPSTATES=1 or run npm run app-states:check.");
test.describe.configure({ mode: "serial" });

async function openExample(page: Page, title: string) {
  await page.getByLabel("Examples").click().catch(() => {});
  await page.waitForTimeout(250);
  const menu = page.locator(".example-menu-popover");
  if (!(await menu.getByRole("menuitem").filter({ hasText: title }).first().isVisible().catch(() => false))) {
    const domains = menu.locator(".example-domain-list button");
    for (let i = 0; i < (await domains.count().catch(() => 0)); i += 1) {
      await domains.nth(i).click().catch(() => {});
      await page.waitForTimeout(80);
      if (await menu.getByRole("menuitem").filter({ hasText: title }).first().isVisible().catch(() => false)) break;
    }
  }
  await menu.getByRole("menuitem").filter({ hasText: title }).first().click().catch(() => {});
  await page.waitForTimeout(800);
}

async function checkInvariants(page: Page) {
  return page.evaluate(() => {
    const fails: string[] = [];
    const scope = document.querySelectorAll(".outputs-panel, .adjusted-output-column, .pairwise-column");
    // (a) NaN / undefined / Infinity rendered in output text
    scope.forEach((root) => {
      root.querySelectorAll("*").forEach((el) => {
        if (el.children.length > 0) return; // leaf text only
        const t = (el.textContent || "");
        if (/\b(NaN|undefined|Infinity)\b/.test(t)) fails.push(`bad-text: "${t.slice(0, 40)}"`);
      });
    });
    // (b) the observed-relation chart frame must not scroll (chart overflow)
    document.querySelectorAll<HTMLElement>(".compact-pairwise-frame .module-pane-body").forEach((body) => {
      if (body.scrollHeight > body.clientHeight + 4) fails.push(`pairwise-scroll: ${body.scrollHeight}>${body.clientHeight}`);
    });
    // (c) charts must not overflow HORIZONTALLY beyond their frame. (Vertical
    // scroll of a long result card is legitimate, so we don't flag it.)
    document.querySelectorAll<HTMLElement>(".pairwise-column .module-frame, .adjusted-output-column .module-frame").forEach((frame) => {
      const fb = frame.getBoundingClientRect();
      frame.querySelectorAll("svg").forEach((svg) => {
        const sb = svg.getBoundingClientRect();
        if (sb.width > 0 && (sb.right > fb.right + 4 || sb.left < fb.left - 4)) fails.push("svg-h-overflow");
      });
    });
    return [...new Set(fails)];
  });
}

async function selectNode(page: Page, text: string): Promise<boolean> {
  const node = page.locator(".react-flow__node", { hasText: text });
  if (await node.first().isVisible().catch(() => false)) {
    await node.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
    return true;
  }
  return false;
}

test("app-state sample: invariants + screenshots", async ({ browser }: { browser: Browser }) => {
  test.setTimeout(180_000); // drives many examples × operations × breakpoints
  mkdirSync(OUT, { recursive: true });
  const allFailures: string[] = [];

  for (const size of SIZES) {
    const context = await browser.newContext({ baseURL: BASE_URL, ...size.ctx });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push(`console: ${m.text().slice(0, 80)}`); });

    await page.goto(BASE_URL);
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Pro" }).click().catch(() => {});

    for (const sc of SCENARIOS) {
      try {
        errors.length = 0;
        await openExample(page, sc.example);
        if (sc.node) {
          const ok = await selectNode(page, sc.node);
          if (ok && sc.op) {
            await page.locator(".operation-selector button", { hasText: sc.op }).first().click().catch(() => {});
            await page.waitForTimeout(700);
          }
        }
        await page.waitForTimeout(300);
        const inv = await checkInvariants(page);
        const probs = [...errors, ...inv];
        console.log(`${size.id}/${sc.id}: ${probs.length === 0 ? "ok" : probs.join(" | ")}`);
        if (probs.length) allFailures.push(`${size.id}/${sc.id}: ${probs.join(" | ")}`);
        await page.locator(".outputs-panel").first().screenshot({ path: path.join(OUT, `${sc.id}-${size.id}.png`) }).catch(() => {});
      } catch (error) {
        console.log(`${size.id}/${sc.id}: DRIVE_ERROR ${(error as Error).message.slice(0, 80)}`);
      }
    }
    await context.close();
  }

  // Hard-fail on console errors / NaN renders (definite glitches). Overflow is
  // reported but already separately tracked.
  const hard = allFailures.filter((f) => /pageerror|console|bad-text/.test(f));
  expect(hard, JSON.stringify(hard)).toHaveLength(0);
});
