import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { EXAMPLES, EXAMPLE_DOMAINS } from "@nudagitty/core";
import type { ExampleModel } from "@nudagitty/core";

const OUTPUT_ROOT = path.join(process.cwd(), "screenshots", "examples");
const VIEWPORTS = [
  { id: "desktop-modal", width: 1280, height: 800 },
  { id: "desktop-generous", width: 1728, height: 1050 },
  { id: "mobile", width: 390, height: 844 }
] as const;

test.skip(process.env.NUDAGITTY_SCREENSHOTS !== "1", "Set NUDAGITTY_SCREENSHOTS=1 or run npm run screenshots:examples.");
test.describe.configure({ mode: "serial" });

for (const viewport of VIEWPORTS) {
  test.describe(`example screenshots: ${viewport.id}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1
    });

    for (const [index, example] of EXAMPLES.entries()) {
      test(`${viewport.id} ${example.id}`, async ({ page }) => {
        await loadExample(page, example);
        await settleLayout(page);
        const directory = path.join(OUTPUT_ROOT, viewport.id);
        mkdirSync(directory, { recursive: true });
        await page.screenshot({
          path: path.join(directory, `${String(index + 1).padStart(2, "0")}-${slug(example.title)}.png`),
          fullPage: false,
          animations: "disabled"
        });
      });
    }
  });
}

async function loadExample(page: Page, example: ExampleModel) {
  await page.goto("/");
  await expect(page.getByText("Nudagitty")).toBeVisible();
  await page.getByRole("button", { name: "Domain" }).click();
  await page.getByLabel("Examples").click();
  const domain = EXAMPLE_DOMAINS.find((candidate) => candidate.id === example.domain);
  if (domain) {
    await page.locator(".example-domain-list button").filter({ hasText: domain.label }).hover();
  }
  await page.getByRole("menuitem").filter({ hasText: example.title }).click();
  await expect(page.getByLabel("Examples")).toContainText(example.title);
  await expect(page.getByLabel("Editable causal graph")).toBeVisible();
}

async function settleLayout(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(150);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
