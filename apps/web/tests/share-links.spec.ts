import { test, expect } from "@playwright/test";

// Guards the share path end-to-end: the async bootstrap (the store is seeded empty and hydrated BEFORE the
// first render), the ~60-char #example= link for a pristine example, and back-compat with the UNCOMPRESSED
// links shared before deflate was added. A broken bootstrap boots to an empty canvas; a broken sniff kills
// every link anyone ever shared.

test.setTimeout(120000);

// Verifies the S4 async bootstrap end-to-end: the store is now seeded empty and hydrated BEFORE first
// render, so if hydration were broken the app would boot to an empty canvas (or not at all).
test("app boots and hydrates a deep link (async hydration)", async ({ page }) => {
  await page.goto("/#example=simpson-severity");
  await page.waitForTimeout(1500);
  const nodes = page.locator(".react-flow__node");
  const count = await nodes.count();
  const text = (await page.locator("body").textContent())?.replace(/\s+/g, " ") ?? "";
  console.log("BOOT: react-flow nodes =", count);
  console.log("BOOT: has Severity node =", text.includes("Severity"));
  expect(count).toBeGreaterThan(0);          // hydration ran: the example is on the canvas
  expect(text).toContain("Severity");
});

// The share handler does history.replaceState(url.hash) on success, so the produced link lands in the URL.
test("a pristine example shares as a ~60-char #example= link", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/#example=lalonde-fit-recover-2part");
  await page.waitForTimeout(2500); // the two-part configurator iterates a fit to a fixed point

  await page.getByRole("button", { name: "Compact link" }).click();
  await page.waitForTimeout(600);
  const url = page.url();
  const hash = url.slice(url.indexOf("#"));
  console.log("SHARE: hash =", hash, "| length =", hash.length);
  expect(hash).toContain("#example=lalonde-fit-recover-2part");
  expect(hash.length).toBeLessThan(80); // was a ~9,800-char #c= payload before the fixed-point fix
});

test("legacy UNCOMPRESSED #c= link still opens", async ({ page }) => {
  // A v2, plain-JSON payload exactly as links shared before compression looked.
  const legacy = {
    v: 2,
    t: "Legacy model",
    n: [{ i: "Alpha", x: 0, y: 0, r: "e" }, { i: "Beta", x: 160, y: 0, r: "o" }],
    e: [{ s: "Alpha", t: "Beta" }]
  };
  const b64 = Buffer.from(JSON.stringify(legacy), "utf8")
    .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  await page.goto(`/#c=${b64}`);
  await page.waitForTimeout(1500);
  const text = (await page.locator("body").textContent())?.replace(/\s+/g, " ") ?? "";
  console.log("LEGACY: has Alpha =", text.includes("Alpha"), "| has Beta =", text.includes("Beta"));
  expect(text).toContain("Alpha");
  expect(text).toContain("Beta");
});
