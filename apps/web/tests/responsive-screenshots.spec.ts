import { mkdirSync } from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Reusable responsive-screenshot tool. Drives the running app to a target view
// and captures it at four representative screen sizes — a current mainline
// iPhone (real mobile emulation), a 1440 laptop, 1080p, and native 4K — so a
// major change can be eyeballed across the layout spectrum in one command.
//
//   npm run screenshots:responsive            # cats Pro view, default
//   SHOT_EXAMPLE="Simpson" SHOT_MODE=demo npm run screenshots:responsive
//   SHOT_NAME=edge-editor SHOT_SELECTOR=".connection-editor" npm run screenshots:responsive
//
// Env knobs: SHOT_NAME (file prefix), SHOT_EXAMPLE ("" to skip), SHOT_MODE
// (pro|demo), SHOT_SELECT_NODE (0 to skip), SHOT_SELECTOR (one element instead
// of the viewport), SHOT_FULLPAGE (1), SHOT_BASE_URL.

const BASE_URL = process.env.SHOT_BASE_URL ?? "http://127.0.0.1:5173";
const OUTPUT_ROOT = path.join(process.cwd(), "screenshots", "responsive");
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const SIZES = [
  {
    id: "iphone15-393x852",
    context: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE_UA }
  },
  { id: "laptop-1440x900", context: { viewport: { width: 1440, height: 900 } } },
  { id: "fhd-1920x1080", context: { viewport: { width: 1920, height: 1080 } } },
  // Native 4K (100% scaling); a 4K display at 200% scaling is layout-identical to 1080p.
  { id: "uhd4k-3840x2160", context: { viewport: { width: 3840, height: 2160 } } }
] as const;

const SHOT = {
  name: process.env.SHOT_NAME ?? "responsive",
  example: process.env.SHOT_EXAMPLE ?? "Falling-cats",
  mode: (process.env.SHOT_MODE ?? "pro").toLowerCase(),
  selectNode: process.env.SHOT_SELECT_NODE !== "0",
  selector: process.env.SHOT_SELECTOR ?? "",
  fullPage: process.env.SHOT_FULLPAGE === "1"
};

test.skip(process.env.NUDAGITTY_RESPONSIVE !== "1", "Set NUDAGITTY_RESPONSIVE=1 or run npm run screenshots:responsive.");
test.describe.configure({ mode: "serial" });

async function prepare(page: Page) {
  await page.goto(BASE_URL);
  await page.waitForTimeout(300);

  if (SHOT.mode === "pro") {
    const pro = page.getByRole("button", { name: "Pro" });
    if (await pro.isVisible().catch(() => false)) {
      await pro.click().catch(() => {});
      await page.waitForTimeout(200);
    }
  }

  if (SHOT.example) {
    await page.getByLabel("Examples").click().catch(() => {});
    await page.waitForTimeout(200);
    await page.locator(".example-menu-popover").getByRole("menuitem").filter({ hasText: SHOT.example }).first().click().catch(() => {});
    await page.waitForTimeout(500);
  }

  if (SHOT.selectNode) {
    const nodes = page.locator(".react-flow__node");
    const count = await nodes.count().catch(() => 0);
    for (let i = 0; i < count; i += 1) {
      await nodes.nth(i).click({ force: true }).catch(() => {});
      await page.waitForTimeout(120);
      if (await page.locator(".operation-estimand, .completed-output-card").first().isVisible().catch(() => false)) break;
    }
    await page.waitForTimeout(300);
  }
}

test("responsive screenshots across screen sizes", async ({ browser }) => {
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  for (const size of SIZES) {
    const context = await browser.newContext({ baseURL: BASE_URL, ...size.context });
    const page = await context.newPage();
    await prepare(page);
    const file = path.join(OUTPUT_ROOT, `${SHOT.name}-${size.id}.png`);
    if (SHOT.selector) {
      await page.locator(SHOT.selector).first().screenshot({ path: file });
    } else {
      await page.screenshot({ path: file, fullPage: SHOT.fullPage });
    }
    // eslint-disable-next-line no-console
    console.log(`saved ${file}`);
    await context.close();
  }
});
