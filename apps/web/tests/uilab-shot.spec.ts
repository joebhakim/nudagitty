import { test, expect } from "@playwright/test";

test.use({ launchOptions: { executablePath: "/usr/bin/chromium" }, viewport: { width: 2100, height: 1150 } });
test.setTimeout(120000);

// Dark is emulated via the REAL prefers-color-scheme signal, so the component dark rules actually fire.
for (const scheme of ["light", "dark"] as const) {
  test(`ui-lab renders (${scheme})`, async ({ browser }) => {
    const page = await browser.newPage({ colorScheme: scheme, viewport: { width: 2100, height: 1150 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("http://127.0.0.1:5173/ui-lab.html");
    await expect(page.locator(".uilab-grid").first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(500);
    console.log(`[${scheme}] COLUMNS:`, await page.locator(".uilab-col").count(), "| ERRORS:", errors.length ? errors.join(" | ") : "none");
    await page.screenshot({ path: `screenshots/uilab-${scheme}.png`, fullPage: true });
    expect(errors.length).toBe(0);
    await page.close();
  });
}
