import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import fs from "node:fs/promises";
import { EXAMPLES, EXAMPLE_DOMAINS } from "@nudagitty/core";

async function loadExample(page: Page, title: string) {
  await page.getByLabel("Examples").click();
  const menu = page.locator(".example-menu-popover");
  await expect(menu).toBeVisible();
  const example = EXAMPLES.find((candidate) => candidate.title === title) ?? EXAMPLES.find((candidate) => candidate.title.includes(title));
  const targetTitle = example?.title ?? title;
  const visibleItem = menu.getByRole("menuitem").filter({ hasText: targetTitle });
  if (!(await visibleItem.first().isVisible())) {
    const domain = example ? EXAMPLE_DOMAINS.find((candidate) => candidate.id === example.domain) : null;
    const domainButton = domain ? menu.locator(".example-domain-list").getByRole("button", { name: domain.label }) : null;
    if (domainButton && await domainButton.isVisible()) await domainButton.click();
  }
  await menu.getByRole("menuitem").filter({ hasText: targetTitle }).first().click();
}

async function flowViewportTransform(page: Page) {
  return await page.locator(".react-flow__viewport").getAttribute("style") ?? "";
}

async function touchDrag(page: Page, selector: string, deltaY: number) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`missing touch target ${selector}`);
  const viewport = page.viewportSize() ?? { width: 390, height: 844 };
  const client = await page.context().newCDPSession(page);
  const x = Math.round(box.x + box.width / 2);
  const startY = Math.round(Math.min(box.y + box.height - 24, viewport.height - 24));
  const endY = Math.round(Math.max(40, Math.min(viewport.height - 24, startY + deltaY)));

  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: startY }] });
  for (let step = 1; step <= 8; step += 1) {
    const y = Math.round(startY + (endY - startY) * (step / 8));
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("loads the desktop guided basic shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Nudagitty")).toBeVisible();
  await expect(page.getByLabel("Editable causal graph")).toBeVisible();
  await expect(page.getByRole("button", { name: "Demo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Demo" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Pro" })).toBeVisible();
  await expect(page.locator(".mode-toggle button")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Select" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Variable" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "1 Tutoring" })).toBeVisible();
  await expect(page.getByRole("button", { name: "2 Simpson" })).toBeVisible();
  await expect(page.getByLabel("Examples")).toBeVisible();
  await expect(page.getByRole("button", { name: "K562 paper network" })).toHaveCount(0);
  await expect(page.locator(".graph-legend")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Legend" })).toBeVisible();
  await page.getByRole("button", { name: "Legend" }).click();
  await expect(page.locator(".graph-legend")).toBeVisible();
  await expect(page.locator(".graph-legend")).toContainText("adjusted");
  await expect(page.locator(".graph-legend")).toContainText("sample marker");
  await expect(page.locator(".graph-legend")).not.toContainText("Exposure");
  await expect(page.locator(".graph-legend")).not.toContainText("Outcome");
  await expect(page.locator(".graph-legend")).not.toContainText("arrow");
  await page.getByRole("button", { name: "Legend" }).click();
  await expect(page.locator(".graph-legend")).toHaveCount(0);
  await expect(page.locator(".canvas-zoom-controls")).toHaveCount(0);
  await expect(page.locator(".edge-function-glyph").first()).toBeHidden();
  await expect(page.getByLabel("Demo result")).toContainText("Tutoring -> test score");
  await expect(page.locator(".demo-result-callout")).toHaveCount(0);
  await expect(page.getByLabel("Demo result")).not.toContainText("95% CI");
  await expect(page.getByLabel("Demo result")).not.toContainText("Stabilized IPW difference");
  await expect(page.locator(".editor-column")).toContainText("Try the flip");
  await expect(page.locator(".basic-results-column")).toBeVisible();
  await expect(page.locator(".basic-results-column")).toContainText("Raw comparison");
  await expect(page.locator(".basic-results-column .category-outcome-plot").first()).toBeVisible();
  await expect(page.locator(".basic-results-column .category-outcome-observation").first()).toBeVisible();
  await expect(page.locator(".basic-results-column .category-outcome-ci").first()).toBeVisible();
  await expect(page.locator(".binary-continuous-vertical-svg")).toHaveCount(0);
  await expect(page.locator(".binary-rate-bar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Close results" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Live Node Values");
});

test("opens the K562 intervention mechanics explorer", async ({ page }) => {
  await page.goto("/#paper=k562");

  const view = page.locator(".paper-network-view");
  await expect(page.getByRole("heading", { name: "Intervention mechanics from Perturb-seq" })).toBeVisible();
  await expect(view).toContainText("RPS3");
  await expect(view).toContainText("535");
  await expect(view).toContainText("416");
  await expect(view).toContainText("172");
  await expect(view).toContainText("13");
  await expect(view).toContainText("131,943");
  await expect(view).toContainText("Mediated total effect");
  await expect(view).toContainText("MED10");
  await expect(view).toContainText("Signs disagree");
  await expect(view).toContainText("ACTB");
  await expect(view).toContainText("Path exceeds total");

  const canvas = page.getByLabel("K562 intervention graph canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(async () => canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    const context = canvasElement.getContext("2d");
    if (!context || canvasElement.width === 0 || canvasElement.height === 0) return 0;
    const sampleWidth = canvasElement.width;
    const sampleHeight = canvasElement.height;
    const image = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    let nonBackgroundPixels = 0;
    for (let index = 0; index < image.length; index += 4 * 5) {
      const red = image[index] ?? 255;
      const green = image[index + 1] ?? 255;
      const blue = image[index + 2] ?? 255;
      const alpha = image[index + 3] ?? 0;
      if (alpha > 0 && (Math.abs(red - 247) > 8 || Math.abs(green - 249) > 8 || Math.abs(blue - 250) > 8)) nonBackgroundPixels += 1;
    }
    return nonBackgroundPixels;
  })).toBeGreaterThan(5);

  await expect(view).toContainText("Top total-effect forecast");
  await page.getByRole("button", { name: "Direct edges", exact: true }).click();
  await expect(view).toContainText("Top direct G_hat edges");
  await page.getByRole("button", { name: "Full graph", exact: true }).click();
  await expect(view).toContainText("All released nonzero G_hat edges");
  await page.getByRole("button", { name: "Total effects", exact: true }).click();

  await page.getByLabel("Search gene").fill("HSPA9");
  await page.getByLabel("Gene search results").getByRole("button").filter({ hasText: "HSPA9" }).first().click();
  await expect(page.getByLabel("Selected gene")).toContainText("HSPA9");
  await expect(view).toContainText("610");
  await page.getByLabel("Intervention delta in standard deviations").fill("-1");
  await expect(view).toContainText("do(HSPA9 += -1.0 SD)");

  await page.getByRole("button", { name: "Back to workbench" }).click();
  await expect(page.getByLabel("Editable causal graph")).toBeVisible();
});

test("loads the Ota gene-program-trait reconstruction from the pro catalog", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pro" }).click();
  await loadExample(page, "Gene programs to traits");

  await expect(page.getByLabel("Examples")).toContainText("Gene programs to traits");
  await expect(page.locator("text.node-label").filter({ hasText: "CRISPRi" })).toBeVisible();
  await expect(page.locator("text.node-label").filter({ hasText: "heme" })).toBeVisible();
  await expect(page.locator("text.node-label").filter({ hasText: "MCH" })).toBeVisible();
  await expect(page.locator("text.node-label").filter({ hasText: "LoF gamma" })).toBeVisible();
  await expect(page.locator("text.node-label").filter({ hasText: "concordant" })).toBeVisible();

  const drawer = page.locator(".practitioner-modules-drawer");
  await drawer.locator("> details > summary").click();
  await expect(drawer).toContainText("Paper-derived reconstruction");
  await expect(drawer).toContainText("MCH, RDW, and IRF");
  await expect(drawer).toContainText("gene-trait association is a direct mechanism");
});

test("loads the What If treatment feedback g-method output", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pro" }).click();
  await loadExample(page, "treatment-confounder feedback");

  await expect(page.getByLabel("Examples")).toContainText("treatment-confounder feedback");
  await expect(page.locator("text.node-label").filter({ hasText: "treatment A0" })).toBeVisible();
  await expect(page.locator("text.node-label").filter({ hasText: "risk L1" })).toBeVisible();
  const output = page.locator(".adjusted-output-column");
  await expect(output).toContainText("G-method comparison");
  await expect(output).toContainText("Methods");
  await expect(output).toContainText("always treat");
  await expect(output).toContainText("never treat");
  await expect(output).toContainText("Parametric g-formula");
  await expect(output).toContainText("Additive g-estimation");
});

test("loads advanced What If examples with shared outputs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pro" }).click();

  await loadExample(page, "censoring as a time-varying treatment");
  let output = page.locator(".adjusted-output-column");
  await expect(output).toContainText("Treatment and censoring weights");
  await expect(output).toContainText("Stabilized IPW/IPCW");
  await expect(output).toContainText("always treat");

  await loadExample(page, "dynamic strategies and the g-formula");
  output = page.locator(".adjusted-output-column");
  await expect(output).toContainText("Dynamic g-formula");
  await expect(output).toContainText("treat when risk is high");
  await expect(output).toContainText("Sequential strategy g-formula");
  await expect(output).toContainText("Rule support by visit");

  await loadExample(page, "NHEFS smoking cessation and mortality");
  output = page.locator(".adjusted-output-column");
  await expect(output).toContainText("Mortality survival contrast");
  await expect(output).toContainText("Survival curves by strategy");
  await expect(output).toContainText("Final risk difference");

  await loadExample(page, "What If: structural nested survival time");
  output = page.locator(".adjusted-output-column");
  await expect(output).toContainText("Structural nested survival time");
  await expect(output).toContainText("Failure-time contrast");
  await expect(output).toContainText("Observed-death survival by strategy");
});

test("pro catalog exposes What If feature showcase examples", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pro" }).click();
  await page.getByLabel("Examples").click();
  const menu = page.locator(".example-menu-popover");
  await expect(menu).toBeVisible();
  await menu.locator(".example-domain-list").getByRole("button", { name: "Epidemiology / public health" }).click();
  for (const title of [
    "Showcase: sequential dynamic g-formula",
    "Showcase: strategy-specific survival curves",
    "Showcase: survivor denominators",
    "Showcase: g-estimation blip coefficients",
    "Showcase: censoring weights (IPCW)",
    "Showcase: structural nested survival time"
  ]) {
    await expect(menu.getByRole("menuitem").filter({ hasText: title })).toBeVisible();
  }
  await menu.getByRole("menuitem").filter({ hasText: "Showcase: sequential dynamic g-formula" }).click();

  const output = page.locator(".adjusted-output-column");
  await expect(page.getByLabel("Examples")).toContainText("Showcase: sequential dynamic g-formula");
  await expect(output).toContainText("Showcase guide");
  await expect(output).toContainText("Sequential dynamic strategy");
  await expect(output).toContainText("Sequential strategy g-formula");
  await expect(output).toContainText("Rule support by visit");
});

test("What If dynamic output stays stable while dragging nodes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pro" }).click();
  await loadExample(page, "dynamic strategies and the g-formula");

  const output = page.locator(".adjusted-output-column");
  await expect(output).toContainText("Sequential strategy g-formula");
  await expect(output).toContainText("Rule support by visit");
  const metricText = await output.locator(".completed-metric-grid").textContent();
  const node = page.locator(".react-flow__node").filter({ hasText: "risk L1" }).first();
  await expect(node).toBeVisible();
  const box = await node.boundingBox();
  if (!box) throw new Error("missing draggable dynamic node");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 72, box.y + box.height / 2 + 44, { steps: 8 });
  await page.mouse.up();

  await expect(output).toContainText("Sequential strategy g-formula");
  await expect(output).toContainText("Rule support by visit");
  expect(await output.locator(".completed-metric-grid").textContent()).toBe(metricText);
});

test("ignores legacy saved documents when opening the demo", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("nudagitty.document.v1", JSON.stringify({ schemaVersion: 1, title: "Legacy saved DAG" }));
  });
  await page.goto("/");

  await expect(page.getByRole("button", { name: "1 Tutoring" })).toBeVisible();
  await expect(page.getByLabel("Demo result")).toContainText("Tutoring -> test score");
  await expect(page.locator("body")).not.toContainText("Legacy saved DAG");
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("nudagitty.document.v1"))).toBeNull();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("nudagitty.document.v2"))).not.toBeNull();
});

test("demo layout keeps guidance left and expanded results right", async ({ page }) => {
  await page.goto("/");
  const editorBox = await page.locator(".editor-column").boundingBox();
  const canvasBox = await page.locator(".canvas-shell").boundingBox();
  const resultsBox = await page.locator(".basic-results-column").boundingBox();
  if (!editorBox || !canvasBox || !resultsBox) throw new Error("missing demo layout bounds");
  expect(editorBox.x + editorBox.width).toBeLessThanOrEqual(canvasBox.x + 1);
  expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(resultsBox.x + 1);

  await page.getByRole("button", { name: "Close results" }).click();
  await expect(page.locator(".basic-results-column")).toHaveCount(0);
  const closedEditorBox = await page.locator(".editor-column").boundingBox();
  const closedCanvasBox = await page.locator(".canvas-shell").boundingBox();
  if (!closedEditorBox || !closedCanvasBox) throw new Error("missing closed demo layout bounds");
  expect(closedEditorBox.x + closedEditorBox.width).toBeLessThanOrEqual(closedCanvasBox.x + 1);
});

test("pro layout keeps editors left and outputs right", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pro" }).click();
  const editorBox = await page.locator(".editor-column").boundingBox();
  const canvasBox = await page.locator(".canvas-shell").boundingBox();
  const scenarioBox = await page.locator(".scenario-column").boundingBox();
  const pairwiseBox = await page.locator(".pairwise-column").boundingBox();
  const adjustedBox = await page.locator(".adjusted-output-column").boundingBox();
  if (!editorBox || !canvasBox || !scenarioBox || !pairwiseBox || !adjustedBox) throw new Error("missing pro layout bounds");
  expect(editorBox.x + editorBox.width).toBeLessThanOrEqual(canvasBox.x + 1);
  expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(scenarioBox.x + 1);
  expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(pairwiseBox.x + 1);
  expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(adjustedBox.x + 1);
});

test("pro practitioner modules live in a bottom drawer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pro" }).click();
  const drawer = page.locator(".practitioner-modules-drawer");

  await expect(drawer.locator("> details > summary")).toContainText("Practitioner modules");
  await expect(page.locator(".scenario-column")).not.toContainText("Practitioner modules");
  await drawer.locator("> details > summary").click();
  await expect(drawer).toContainText("Design modules");
  await expect(drawer).toContainText("Claim packet");
});

test("pro snapshot actions download open and share documents", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { __nudagittyCopiedText: string }).__nudagittyCopiedText = text;
        }
      }
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Pro" }).click();
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Compact link" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Full link" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.nudagitty\.json$/);
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("missing snapshot download path");
  const snapshot = JSON.parse(await fs.readFile(downloadPath, "utf8")) as { kind?: string; document?: { graph?: { nodes?: unknown[] } } };
  expect(snapshot.kind).toBe("nudagitty.snapshot");
  expect(snapshot.document?.graph?.nodes?.length ?? 0).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Compact link" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const exampleLink = await page.evaluate(() => (window as unknown as { __nudagittyCopiedText: string }).__nudagittyCopiedText);
  expect(exampleLink).toContain("#example=tutoring-scores");

  const document = await page.evaluate(() => JSON.parse(window.localStorage.getItem("nudagitty.document.v2") ?? "{}"));
  document.title = "Opened snapshot";
  document.graph.nodes[0].label = "opened need";
  await page.setInputFiles("input[aria-label='Open Nudagitty snapshot']", {
    name: "opened.nudagitty.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      kind: "nudagitty.snapshot",
      version: 1,
      savedAt: new Date().toISOString(),
      activeExampleId: null,
      document
    }))
  });
  await expect.poll(async () => page.evaluate(() => {
    const stored = JSON.parse(window.localStorage.getItem("nudagitty.document.v2") ?? "{}");
    return stored.title;
  })).toBe("Opened snapshot");
  await expect(page.getByLabel("Examples")).toContainText("Choose one");

  await page.getByRole("button", { name: "Compact link" }).click();
  const compactLink = await page.evaluate(() => (window as unknown as { __nudagittyCopiedText: string }).__nudagittyCopiedText);
  expect(compactLink).toContain("#c=");
  await page.getByRole("button", { name: "Full link" }).click();
  const fullLink = await page.evaluate(() => (window as unknown as { __nudagittyCopiedText: string }).__nudagittyCopiedText);
  expect(fullLink).toContain("#doc=");
  expect(fullLink.length).toBeGreaterThan(compactLink.length);

  await page.evaluate(() => window.localStorage.setItem("nudagitty.document.v2", JSON.stringify({
    schemaVersion: 2,
    id: "local-draft",
    title: "Wrong local draft",
    updatedAt: new Date().toISOString(),
    graph: { nodes: [], edges: [] },
    simulation: { seed: 1, sampleSize: 100, nodes: {}, edges: {}, overrides: {}, selections: {} },
    metadata: { longitudinal: { timePoints: [], variables: {}, treatmentStrategies: [], estimands: [], censoring: [], survivalOutputs: [] }, sources: [] }
  })));
  await page.goto(compactLink);
  await expect(page.locator("text.node-label").filter({ hasText: "opened need" })).toBeVisible();
  await expect(page.getByLabel("Examples")).toContainText("Choose one");
  await page.evaluate(() => window.localStorage.setItem("nudagitty.document.v2", JSON.stringify({
    schemaVersion: 2,
    id: "local-draft",
    title: "Wrong local draft",
    updatedAt: new Date().toISOString(),
    graph: { nodes: [], edges: [] },
    simulation: { seed: 1, sampleSize: 100, nodes: {}, edges: {}, overrides: {}, selections: {} },
    metadata: { longitudinal: { timePoints: [], variables: {}, treatmentStrategies: [], estimands: [], censoring: [], survivalOutputs: [] }, sources: [] }
  })));
  await page.goto(fullLink);
  await expect(page.locator("text.node-label").filter({ hasText: "opened need" })).toBeVisible();
  await expect(page.getByLabel("Examples")).toContainText("Choose one");
});

test("pro presentation mode hides editing and export chrome", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pro" }).click();

  await page.getByRole("button", { name: "Presentation" }).click();

  await expect(page.locator(".app-shell")).toHaveClass(/presentation-mode/);
  await expect(page.getByRole("button", { name: "Variable" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Compact link" })).toHaveCount(0);
  await expect(page.locator(".editor-column")).toHaveCount(0);
  await expect(page.locator(".advanced-drawer")).toHaveCount(0);
  await expect(page.locator(".pairwise-column")).toBeVisible();
  await expect(page.locator(".scenario-column")).toBeVisible();
  await expect(page.getByLabel("Examples")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pro" })).toBeVisible();

  await page.getByRole("button", { name: "Presentation" }).click();
  await expect(page.locator(".app-shell")).not.toHaveClass(/presentation-mode/);
  await expect(page.locator(".editor-column")).toBeVisible();
});

test("basic examples surface the observed versus causal punchline", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Examples").click();
  const basicItems = page.locator(".example-choice-list").getByRole("menuitem");
  await expect(basicItems.nth(0)).toContainText("Does tutoring hurt test scores");
  await expect(basicItems.nth(1)).toContainText("Simpson's paradox");
  await page.getByRole("menuitem").filter({ hasText: "Birthweight paradox" }).click();

  const relation = page.getByLabel("Demo result");
  await expect(relation).toContainText("Smoking -> infant mortality");
  await expect(relation).toContainText(/sign flip/i);
  await expect(relation).toContainText(/selected sample/i);
  await expect(relation).toContainText(/Full sample/i);
  await expect(relation).toContainText(/Birthweight <= 2500/i);
  await relation.locator("summary").filter({ hasText: "What changed?" }).click();
  await expect(relation.locator(".huh-shift-plot")).toBeVisible();
  await expect(page.locator(".basic-results-column")).toBeVisible();
  await page.getByRole("button", { name: "Close results" }).click();
  await expect(page.locator(".basic-results-column")).toHaveCount(0);

  await page.getByLabel("Examples").click();
  await page.getByRole("menuitem").filter({ hasText: "Simpson's paradox" }).click();
  await page.getByRole("button", { name: "Show result" }).click();
  await expect(page.locator(".basic-results-column")).toBeVisible();
  await expect(relation).toContainText("risk diff");
  await expect(relation).not.toContainText("Stabilized IPW difference");
  await page.locator("text.node-label").filter({ hasText: "Severity" }).click({ force: true });
  await page.locator(".editor-column").getByLabel("adjust for").click();
  await expect(relation).toContainText("Adjusted comparison: clipped IPW");
  await expect(relation).not.toContainText("DGP do difference");
  await relation.locator("summary").filter({ hasText: "What changed?" }).click();
  await expect(relation.locator(".huh-shift-plot")).toBeVisible();
  const results = page.locator(".basic-results-column");
  await expect(results).toContainText("Weighted relation");
  await expect(results).toContainText("Stabilized IPW");
  await expect(results.locator(".category-outcome-plot").first()).toBeVisible();
  await expect(results.locator(".category-outcome-observation").first()).toBeVisible();
  await expect(results.locator(".category-outcome-ci").first()).toBeVisible();
  await expect(results.locator(".binary-rate-bar")).toHaveCount(0);
  await expect(results).not.toContainText("DGP do difference");
  await expect(results).not.toContainText("do(Treatment=1)");
});

test("demo comparison states track adjustment and selection choices", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "1 Tutoring" }).click();
  const relation = page.getByLabel("Demo result");

  await expect(relation).toContainText("Raw comparison");
  await expect(relation.locator(".demo-result-callout")).toHaveCount(0);
  await expect(relation).toContainText("Adjust for academic need");

  await page.locator("text.node-label").filter({ hasText: "academic need" }).click({ force: true });
  const editor = page.locator(".editor-column");
  await editor.getByLabel("adjust for").click();
  await expect(relation).toContainText("Adjusted estimate");
  await expect(relation).toContainText("Adjusted for Academic_need");
  await expect(relation).not.toContainText("DGP do difference");

  await editor.getByLabel("adjust for").click();
  await editor.locator("summary").filter({ hasText: "Analysis sample filter" }).click();
  const categories = editor.getByLabel("Academic_need included categories");
  await categories.getByLabel("0").uncheck();
  await expect(relation).toContainText("Selected sample");
  await expect(relation).toContainText("Academic_need in {1}");
  await expect(relation).toContainText("Academic_need fixed by sample filter");
});

test("results panes mark output as updating while analysis recomputes", async ({ page }) => {
  await page.route(/analysis\.worker/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  await page.goto("/");
  await page.locator("text.node-label").filter({ hasText: "academic need" }).click({ force: true });
  await page.locator(".editor-column").getByLabel("adjust for").click();

  await expect(page.locator(".basic-results-column")).toContainText("Updating result");
  await expect(page.locator(".basic-results-column")).toContainText("Updating adjusted output");
  await expect(page.locator(".canvas-computation-status")).toContainText("updating paths");
});

test("worker fallback clears pending output if a worker never replies", async ({ page }) => {
  await page.route(/(?:analysis|sim)\.worker/, async (route) => {
    await route.fulfill({
      contentType: "text/javascript",
      body: "self.onmessage = () => {};"
    });
  });
  await page.goto("/");
  const results = page.locator(".basic-results-column");
  const editor = page.locator(".editor-column");

  await page.locator("text.node-label").filter({ hasText: "academic need" }).click({ force: true });
  await editor.getByLabel("adjust for").click();
  await expect(results).toContainText("Updating result");
  await expect.poll(async () => results.textContent(), { timeout: 5000 }).not.toMatch(/Updating|updating/);

  await editor.locator("summary").filter({ hasText: "Analysis sample filter" }).click();
  await editor.getByLabel("Academic_need included categories").getByLabel("0").uncheck();
  await expect(results).toContainText("Updating result");
  await expect.poll(async () => results.textContent(), { timeout: 5000 }).not.toMatch(/Updating|updating/);
});

test("example menu stays open while moving from trigger into choices", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByLabel("Examples");
  await trigger.click();
  const choice = page.locator(".example-menu-popover").getByRole("menuitem").first();
  await expect(choice).toBeVisible();

  const triggerBox = await trigger.boundingBox();
  const choiceBox = await choice.boundingBox();
  if (!triggerBox || !choiceBox) throw new Error("missing example menu bounds");
  await page.mouse.move(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2);
  await page.mouse.move(choiceBox.x + 24, choiceBox.y + choiceBox.height / 2, { steps: 16 });

  await expect(choice).toBeVisible();
});

test("selected connections populate the editor column", async ({ page }) => {
  await page.goto("/");
  await page.locator(".edge-hit").first().dispatchEvent("pointerdown");
  const editor = page.locator(".editor-column");

  await expect(editor).toContainText("Arrow");
  await expect(editor).toContainText("Academic_need to Tutoring");
  await expect(editor.getByRole("button", { name: "effect strength decrease 10 percent" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "effect strength increase 1", exact: true })).toBeVisible();
  await editor.locator("summary").filter({ hasText: "More arrow settings" }).click();
  await editor.getByLabel("function Academic_need to Tutoring").click();
  await page.getByRole("option", { name: /Hill \/ Emax/ }).click();

  await expect(editor.locator(".edge-panel")).toContainText("EC50");
  await expect(editor.getByRole("button", { name: "max effect increase 1", exact: true })).toBeVisible();
  await expect(editor.getByLabel("EC50 slider")).toBeVisible();
  await expect(editor.getByLabel("function Academic_need to Tutoring")).toContainText("Hill / Emax");
  await expect(page.locator(".edge-value").filter({ hasText: "Hill / Emax" })).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText("Connection Functions");
  await expect(page.locator("body")).not.toContainText("Connection Detail");
});

test.skip("paper-shaped chess example exposes nonlinear practice and a non-flipping elite sample", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pro" }).click();
  await loadExample(page, "selection fails to flip");

  await expect(page.getByLabel("Examples")).toContainText("selection fails to flip");
  await expect(page.getByLabel("Analysis sample")).toContainText("Elite_sample in {1}");
  await expect(page.locator("text.node-label").filter({ hasText: "chess Elo" })).toBeVisible();
  await expect(page.locator("text.node-label").filter({ hasText: "elite sample" })).toBeVisible();
  await expect(page.locator(".edge-value").filter({ hasText: "Hill / Emax" })).toBeVisible();
  await expect(page.locator(".edge-value").filter({ hasText: "saturating" })).toBeVisible();
  await expect(page.locator(".edge-value").filter({ hasText: "smooth thresh" })).toHaveCount(1);

  const editor = page.locator(".editor-column");
  await page.locator(".edge-hit").nth(9).dispatchEvent("pointerdown");
  await expect(editor).toContainText("Practice_hours to Chess_Elo");
  await expect(editor.getByLabel("function Practice_hours to Chess_Elo")).toContainText("Hill / Emax");

  await page.locator(".edge-hit").nth(10).dispatchEvent("pointerdown");
  await expect(editor).toContainText("Chess_Elo to Elite_sample");
  await expect(editor.getByLabel("function Chess_Elo to Elite_sample")).toContainText("smooth threshold");
});

test("manual chess sign-flip example surfaces elite selection as analysis sample", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Examples").click();
  await page.getByRole("menuitem").filter({ hasText: "manual sign flip" }).evaluate((element) => {
    if (!(element instanceof HTMLElement)) throw new Error("expected menu item");
    element.click();
  });

  const banner = page.getByLabel("Analysis sample");
  await expect(banner).toContainText("Analysis sample");
  await expect(banner).toContainText("Elite_sample in {1}");
  await expect(banner).toContainText("method rejection sampling");
  await expect(banner).toContainText(/samples \d+ \/ \d+/);
  await expect(page.getByLabel("Active demo state")).toContainText("selected sample");
  await expect(page.getByLabel("Demo result")).toContainText("Selected sample");
  await expect(page.locator(".adjusted-output-column")).toHaveCount(0);

  await page.locator("text.node-label").filter({ hasText: "rated / elite sample" }).click({ force: true });
  const editor = page.locator(".editor-column");
  await expect(editor.locator(".conditioning-editor")).toContainText("active");
  await expect(editor.locator(".conditioning-editor")).toContainText("not do(Elite_sample)");
  await expect(editor.locator(".conditioning-editor")).toContainText("Discrete filters use category membership");
  await expect(editor.locator(".conditioning-editor").getByLabel("Elite_sample included categories").getByLabel("1")).toBeChecked();

  await editor.locator(".conditioning-editor").getByRole("button", { name: "clear condition" }).click();
  await expect(page.getByLabel("Analysis sample")).toHaveCount(0);
  await expect(page.locator(".adjusted-output-column")).toHaveCount(0);
  await expect(editor.locator(".conditioning-editor").getByRole("button", { name: "filter to value 1" })).toBeVisible();
});

test("selected variables populate the editor column", async ({ page }) => {
  await page.goto("/");
  await page.locator("text.node-label").filter({ hasText: "academic need" }).click({ force: true });
  const variableEditor = page.locator(".editor-column");
  const scenario = page.locator(".scenario-column");

  await expect(variableEditor).toContainText("Variable");
  await expect(variableEditor).toContainText("academic need");
  await expect(variableEditor).toContainText("Use this variable");
  await expect(variableEditor).toContainText("Intervene");
  await expect(variableEditor).toContainText("Analysis sample filter");
  await expect(variableEditor).toContainText("Adjustment method");
  await expect(variableEditor.getByLabel("type")).toHaveCount(0);
  await expect(variableEditor.getByLabel("unit")).toHaveCount(0);
  await variableEditor.locator("summary").filter({ hasText: "Intervene" }).click();
  await expect(variableEditor.locator(".hard-do-editor")).toContainText("Hard do intervention");
  await expect(page.locator("body")).not.toContainText("Model Inspector");
  await expect(page.locator("body")).not.toContainText("Connection Functions");
  await expect(variableEditor).not.toContainText("Measurement");
  await variableEditor.locator("summary").filter({ hasText: "Analysis sample filter" }).click();
  await expect(variableEditor.locator(".conditioning-editor")).toContainText("Analysis sample filter");
  await expect(scenario.locator(".hard-do-editor")).toHaveCount(0);
  await expect(scenario.locator(".conditioning-editor")).toHaveCount(0);
  await expect(scenario.locator(".planned-module-list")).toHaveCount(0);
});

test("hard do controls share one override state", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "2 Simpson" }).click();
  await page.locator("text.node-label").filter({ hasText: "Severity" }).click({ force: true });

  const editor = page.locator(".editor-column");
  await editor.locator("summary").filter({ hasText: "Intervene" }).click();
  const hardDo = editor.locator(".hard-do-editor");
  await expect(hardDo).toContainText("available");
  await hardDo.getByLabel("hard do value").fill("2");

  await expect(hardDo).toContainText("active");
  await expect(hardDo.getByLabel("hard do value")).toHaveValue("2");
  await expect(page.getByLabel("Active demo state")).toContainText("intervention");
  await expect(page.getByLabel("Demo result")).toContainText("Intervention");
  await expect(page.getByLabel("Demo result")).toContainText("difference from no intervention");
  await hardDo.getByRole("button", { name: "release hard do" }).click();
  await expect(hardDo).toContainText("available");
  await expect(page.getByLabel("Active demo state")).toHaveCount(0);
});

test.skip("binary variables update simulation defaults", async ({ page }) => {
  await page.goto("/");
  await page.locator("text.node-label").filter({ hasText: "Severity" }).click({ force: true });
  const variableEditor = page.locator(".editor-column");

  await variableEditor.locator("summary").filter({ hasText: "More variable settings" }).click();
  await variableEditor.getByLabel("root distribution").selectOption("bernoulli");
  await expect(variableEditor.getByLabel("root distribution")).toHaveValue("bernoulli");
  await expect(variableEditor).toContainText("binary");
  await expect(variableEditor.getByLabel("p slider")).toBeVisible();
  await expect(page.locator(".binary-adjustment-output")).toContainText("Severity=0");
  await expect(page.locator(".binary-adjustment-output")).toContainText("Severity=1");
  expect(await page.locator(".binary-adjustment-output .binary-output-matrix-card").count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator(".node.selected .binary-node-distribution-plot")).toBeVisible();
  const binaryLabels = page.locator(".node.selected .node-distribution-annotation text");
  await expect(binaryLabels).toHaveCount(1);
  await expect(binaryLabels.nth(0)).toContainText("P(1)");
  expect((await binaryLabels.allTextContents()).join(" ")).not.toContain("draw");
  expect((await binaryLabels.allTextContents()).join(" ")).not.toContain("value");
  expect((await binaryLabels.allTextContents()).join(" ")).not.toContain("Bernoulli");

});

test.skip("Galton example renders analytic and empirical node distributions", async ({ page }) => {
  await page.goto("/");
  await loadExample(page, "Galton regression to the mean");

  await expect(page.locator("text.node-label").filter({ hasText: "father height" })).toBeVisible();
  await expect(page.locator(".node-distribution-plot")).toHaveCount(6);
  await expect(page.locator(".node-distribution-annotation").first()).toContainText("mean");
  await expect(page.locator(".node-distribution-annotation").first()).toContainText("sd");
  await expect(page.locator(".node-distribution-annotation").first()).not.toContainText("draw");
  const galtonAnnotationLabels = page.locator(".node-distribution-annotation").first().locator("text");
  await expect(galtonAnnotationLabels).toHaveCount(1);
  expect((await galtonAnnotationLabels.allTextContents()).join(" ")).not.toContain("Normal");
  await page.locator("text.node-label").filter({ hasText: "father height" }).click({ force: true });
  await expect(page.locator(".editor-column")).toContainText("linear Gaussian SEM");
  await expect(page.locator(".editor-column")).toContainText("Normal(69.0, 2.80)");
});

test("Simpson example reports neutral raw and adjusted output grammar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pro" }).click();
  await loadExample(page, "Simpson's paradox: treatment by severity");
  await page.locator("text.node-label").filter({ hasText: "Severity" }).click({ force: true });
  await page.locator(".editor-column").getByLabel("adjusted").click();
  const adjustedOutput = page.locator(".adjusted-output-column");
  const output = adjustedOutput.locator(".completed-output-card");
  const binaryOutput = adjustedOutput.locator(".binary-adjustment-output");

  await expect(binaryOutput).toContainText("Adjusted estimate");
  await expect(binaryOutput).toContainText("Raw comparison");
  await expect(binaryOutput.locator(".category-outcome-plot").first()).toBeVisible();
  await expect(binaryOutput.locator(".category-outcome-observation").first()).toBeVisible();
  await expect(binaryOutput.locator(".category-outcome-ci").first()).toBeVisible();
  await expect(binaryOutput.locator(".binary-rate-bar")).toHaveCount(0);
  await expect(binaryOutput).not.toContainText("looks harmful");
  await expect(binaryOutput).not.toContainText("Unadjusted harms");
  await expect(binaryOutput).not.toContainText("Raw matrix");
  await expect(binaryOutput).not.toContainText("Needs a different adjustment display");
  await expect(output).toContainText("Simpson ready");
  await expect(output).toContainText("Interpretation");
  await expect(output).toContainText("Raw recovery difference");
  await expect(output).toContainText("DGP do difference");
  await expect(output).toContainText("Fast visual read");
  await expect(output).toContainText("Treatment <- Severity -> Recovery");
  await expect(output).toContainText("do(Treatment=1)");
  await expect(output).toContainText(/Sign reversal|No sign reversal/);
  await expect(page.locator(".edge-value").first()).toContainText("linear coef");
});

test("pro adjusted output follows the selected binary continuous pair", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pro" }).click();
  await loadExample(page, "M-bias: adjustment can create bias");
  const adjustedOutput = page.locator(".adjusted-output-column");
  const pairwiseOutput = page.locator(".pairwise-column");
  await expect(adjustedOutput).toContainText("Adjusted estimate");
  await expect(adjustedOutput).toContainText("Raw mean difference");
  await expect(adjustedOutput).toContainText("Stratified mean difference");
  await expect(adjustedOutput).toContainText("Auto bins active");
  await expect(pairwiseOutput.locator(".category-outcome-plot").first()).toBeVisible();
  await expect(pairwiseOutput.locator(".category-outcome-observation").first()).toBeVisible();
  await expect(adjustedOutput.locator(".category-outcome-facet-grid")).toBeVisible();
  await expect(adjustedOutput.locator(".category-outcome-ci").first()).toBeVisible();
  await expect(adjustedOutput.locator(".binary-rate-bar")).toHaveCount(0);

  await page.locator("text.node-label").filter({ hasText: "collider score" }).click({ force: true });
  await page.locator(".editor-column").getByLabel("adjusted").click();
  await expect(adjustedOutput).not.toContainText("Raw mean difference");
  await expect(adjustedOutput).not.toContainText("Auto bins active");
});

test("three-variable adjusted strata labels stay readable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pro" }).click();
  await loadExample(page, "Policy evaluation: DiD and synthetic control");
  const facets = page.locator(".adjusted-output-column .category-outcome-facet");
  const labels = facets.locator(".continuous-strata-label");

  await expect(labels.first()).toContainText("region baseline bin 1");
  await expect(labels.first()).toContainText("pre-trend bin 1");
  await expect(labels.first()).toContainText("donor pool quality bin 1");
  await expect(labels.first()).not.toContainText("RB");
  await expect(labels.first()).not.toContainText("...");
  await expect(page.locator(".pairwise-column .continuous-strata-ci-bar")).toHaveCount(0);
  await expect(page.locator(".adjusted-output-column .category-outcome-observation").first()).toBeVisible();
  await expect(page.locator(".adjusted-output-column .category-outcome-ci").first()).toBeVisible();
  await expect(page.locator(".adjusted-output-column .continuous-strata-ci-bar")).toHaveCount(0);
  await expect(page.locator(".adjusted-output-column .continuous-strata-violin")).toHaveCount(0);
  const metrics = await facets.evaluateAll((items) => {
    return items.map((facet) => {
      const facetRect = facet.getBoundingClientRect();
      const labelRect = facet.querySelector(".continuous-strata-label")?.getBoundingClientRect();
      return {
        left: labelRect ? labelRect.left - facetRect.left : -Infinity,
        rightOverflow: labelRect ? labelRect.right - facetRect.right : Infinity,
        height: labelRect?.height ?? 0
      };
    });
  });
  expect(Math.min(...metrics.map((metric) => metric.left))).toBeGreaterThanOrEqual(-1);
  expect(Math.max(...metrics.map((metric) => metric.rightOverflow))).toBeLessThanOrEqual(1);
  expect(Math.min(...metrics.map((metric) => metric.height))).toBeGreaterThan(0);
});

test("adjusted continuous variables expose draggable bin methodology and positivity warnings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "2 Simpson" }).click();
  await page.locator("text.node-label").filter({ hasText: "Severity" }).click({ force: true });
  const editor = page.locator(".editor-column");
  await editor.getByLabel("adjust for").click();

  await editor.locator("summary").filter({ hasText: "Adjustment method" }).click();
  await expect(editor).toContainText("Adjustment methodology");
  await expect(editor).toContainText("Binned standardization");
  await editor.getByRole("button", { name: "Binned standardization" }).click();
  await expect(editor.locator(".adjustment-bin-histogram")).toBeVisible();
  await expect(editor).toContainText("Click the histogram to add a split");

  await editor.getByRole("button", { name: "quartile splits" }).click();
  await expect(editor.locator(".adjustment-cut-line")).toHaveCount(3);
  const binaryOutput = page.locator(".binary-adjustment-output");
  await expect(binaryOutput).toContainText("Severity: 4 bins");
  await expect(binaryOutput).toContainText("Severity bin 1");
  await expect(binaryOutput).not.toContainText("Needs a different adjustment display");
  await expect(binaryOutput.locator(".binary-output-matrix-card")).toHaveCount(4);
  await expect(editor).toContainText("Positivity by bin");
  await expect(editor).toContainText("exposed");
  await expect(editor).toContainText("unexposed");

  await editor.getByRole("button", { name: "Stabilized IPW" }).click();
  await expect(editor).toContainText("Stabilized inverse probability weighting");
  await expect(editor).toContainText("logistic propensity");
  await expect(editor).toContainText("weighted contrast");
  await expect(binaryOutput).toContainText("Stabilized IPW");
  await expect(binaryOutput).toContainText("Adjusted comparison: clipped IPW");
  await expect(binaryOutput).toContainText("Severity balance");
  await expect(binaryOutput).not.toContainText("Needs a different adjustment display");
});

test.skip("ICU example reports severity confounding and triage collider warning", async ({ page }) => {
  await page.goto("/");
  await loadExample(page, "Does the ICU make patients die?");
  const output = page.locator(".completed-output-card");

  await expect(page.locator("text.node-label").filter({ hasText: "ICU admission" })).toBeVisible();
  await expect(page.locator("text.node-label").filter({ hasText: "triage score" })).toBeVisible();
  await expect(output).toContainText("ICU ready");
  await expect(output).toContainText("Raw mortality difference");
  await expect(output).toContainText("DGP do difference");
  await expect(output).toContainText("Severity imbalance");
  await expect(output).toContainText("Triage imbalance");
  await expect(output).toContainText("ICU_admission <- Severity -> Death");
  await expect(output).toContainText("ICU_admission -> Triage_score <- Severity");
});

test.skip("college example reports a raw versus do earnings premium", async ({ page }) => {
  await page.goto("/");
  await loadExample(page, "Does college raise earnings?");
  const output = page.locator(".completed-output-card");

  await expect(page.locator("text.node-label").filter({ hasText: "family log income" })).toBeVisible();
  await expect(page.locator("text.node-label").filter({ hasText: "College" })).toBeVisible();
  await expect(page.locator("text.node-label").filter({ hasText: "Earnings" })).toBeVisible();
  await expect(output).toContainText("college ready");
  await expect(output).toContainText("Raw earnings difference");
  await expect(output).toContainText("DGP do difference");
  await expect(output).toContainText("Income imbalance");
  await expect(output).toContainText("College <- Family_log_income -> Earnings");
  await expect(output).toContainText("do(College=1)");
  await page.locator("text.node-label").filter({ hasText: "family log income" }).click({ force: true });
  await page.locator(".editor-column").getByRole("tab", { name: "adjustment" }).click();
  await expect(page.locator(".editor-column")).toContainText("Binned standardization");
  await expect(page.locator(".editor-column").locator(".adjustment-bin-histogram")).toBeVisible();
  await expect(page.locator(".binned-adjustment-graph-card")).toHaveCount(0);
  await page.locator(".editor-column").getByRole("button", { name: "quartile splits" }).click();
  const binnedGraph = page.locator(".binned-adjustment-graph-card");
  await expect(binnedGraph).toBeVisible();
  await expect(binnedGraph).toContainText("Binned earnings adjustment");
  await expect(binnedGraph).toContainText("binned adjusted premium");
  await expect(binnedGraph).toContainText("Weak support metric");
  expect(await binnedGraph.locator(".binned-strip-point").count()).toBeGreaterThan(20);
});

test.skip("tutoring example reports a raw versus do sign flip", async ({ page }) => {
  await page.goto("/");
  await loadExample(page, "Does tutoring hurt test scores (unadjusted)");
  const adjustedOutput = page.locator(".adjusted-output-column");

  await expect(page.locator("text.node-label").filter({ hasText: "academic need" })).toBeVisible();
  await expect(page.locator("text.node-label").filter({ hasText: "Tutoring" })).toBeVisible();
  await expect(page.locator("text.node-label").filter({ hasText: "test score" })).toBeVisible();
  await expect(adjustedOutput).toContainText("No adjustment yet");
  await expect(adjustedOutput).toContainText("mark it adjusted");
  await expect(adjustedOutput.locator(".completed-output-card")).toHaveCount(0);
  await expect(page.locator(".adjusted-pair-graph-card")).toHaveCount(0);

  await page.locator("text.node-label").filter({ hasText: "academic need" }).click({ force: true });
  await page.locator(".editor-column").getByLabel("adjusted").click();
  const output = adjustedOutput.locator(".completed-output-card");
  await expect(output).toContainText("adjusted");
  await output.locator("summary").click();
  await expect(output.locator(".completed-output-body")).toBeVisible();
  await expect(output).toContainText("Adjustment active");
  await expect(output).toContainText("Raw score difference");
  await expect(output).toContainText("DGP do difference");
  await expect(output).toContainText("Need imbalance");
  await expect(output).toContainText("Tutoring <- Academic_need -> Test_score");
  await expect(output).toContainText("Sign reversal");
  await expect(output).toContainText("do(Tutoring=1)");
  await expect(output).toContainText("Adjusted reveal plan");
  const adjustedGraph = page.locator(".adjusted-pair-graph-card");
  await expect(adjustedGraph).toBeVisible();
  await expect(adjustedGraph).toContainText("Stratified adjustment");
  await expect(adjustedGraph).toContainText("Low need");
  await expect(adjustedGraph).toContainText("High need");
  await expect(adjustedGraph).toContainText("weighted adjusted difference");
  await expect(adjustedGraph).toContainText("Continuous confounders need bins");
  expect(await adjustedGraph.locator(".adjusted-strip-point").count()).toBeGreaterThan(20);
  await expect(adjustedGraph.locator(".adjusted-strip-treatment-label").filter({ hasText: "tutored" }).first()).toBeVisible();
  const pairwise = page.locator(".scatterplot-panel");
  await expect(pairwise).toContainText("x=0 mean");
  await expect(pairwise).toContainText("x=1 mean");
  await expect(pairwise).toContainText("difference 1-0");
  await expect(pairwise).not.toContainText("corr");
});

test.skip("denouement panel switches by example and expands checklists", async ({ page }) => {
  await page.goto("/");
  await page.locator(".scenario-column").getByText("Practitioner modules").click();
  const denouement = page.locator(".denouement-panel");

  await expect(denouement).toContainText("Adjustment / backdoor");
  await expect(denouement).toContainText("The treatment looks worse in the crude comparison");

  await page.getByRole("button", { name: "Pro" }).click();
  await loadExample(page, "Policy evaluation: DiD and synthetic control");
  await expect(denouement).toContainText("DiD / event study / synthetic control");
  await expect(denouement).toContainText("treated units' post-policy change");
  await expect(denouement).toContainText("event-time effects");

  await denouement.getByText("Assumption checklist").click();
  await expect(denouement).toContainText("Parallel trends");
  await expect(denouement).toContainText("No anticipation");
});

test("binary variable pairs render jittered points with confidence intervals", async ({ page }) => {
  await page.goto("/");
  await loadExample(page, "Simpson's paradox: treatment by severity");
  await page.getByRole("button", { name: "Pro" }).click();

  await expect(page.locator(".scenario-column")).toContainText("Baseline analysis");
  await expect(page.locator(".scenario-column").getByRole("button", { name: "resample draws" })).toBeVisible();
  const pairwiseColumn = page.locator(".pairwise-column");
  await expect(pairwiseColumn.locator(".module-pane-heading")).toContainText("Observed relation");
  await expect(page.locator(".adjusted-output-column .module-pane-heading")).toContainText("Adjustment target");
  const panel = pairwiseColumn.locator(".scatterplot-panel");
  await expect(panel.getByLabel("x variable")).toHaveValue("Treatment");
  await expect(panel.getByLabel("y variable")).toHaveValue("Recovery");
  await expect(panel.getByLabel("x variable").locator("option")).toHaveText(["Treatment"]);
  await expect(panel.getByLabel("y variable").locator("option")).toHaveText(["Recovery"]);
  await expect(panel.locator(".pairwise-relation-title")).toContainText("Recovery");
  await expect(panel.locator(".pairwise-relation-title")).toContainText("by");
  await expect(panel.locator(".pairwise-relation-title")).toContainText("Treatment");
  await expect(panel).not.toContainText("Gap");
  await expect(panel.locator(".category-outcome-plot")).toBeVisible();
  await expect(panel.locator(".category-outcome-observation").first()).toBeVisible();
  await expect(panel.locator(".category-outcome-ci")).toHaveCount(2);
  await expect(panel.locator(".binary-rate-bar")).toHaveCount(0);
  await panel.getByLabel("Pairwise details").click();
  await expect(panel.locator(".pairwise-info-card")).toBeVisible();
  await expect(panel.locator(".pairwise-info-card")).toContainText("risk diff -47.2 pp");
  await expect(panel.locator(".pairwise-info-card")).toContainText("samples 320");
  await expect(panel.locator(".confusion-matrix")).toHaveCount(0);
  await expect(panel).toContainText("Treatment=1");
  await expect(panel).toContainText("Recovery=1");
  await expect(panel.locator(".scatter-point")).toHaveCount(0);
});

test.skip("Galton example plots observed father and son height samples", async ({ page }) => {
  await page.goto("/");
  await loadExample(page, "Galton regression to the mean");

  const scatter = page.locator(".scatterplot-panel");
  await expect(scatter.getByLabel("x variable")).toHaveValue("Father_height");
  await expect(scatter.getByLabel("y variable")).toHaveValue("Son_height");
  await expect(scatter.locator(".scatter-point").first()).toBeVisible();
  await expect(scatter).toContainText("corr");

  await scatter.getByLabel("x variable").selectOption("G_shared");
  await expect(scatter.getByLabel("x variable")).toHaveValue("G_shared");
});

test.skip("conditioning a Galton variable is separate from overriding it", async ({ page }) => {
  await page.goto("/");
  await loadExample(page, "Galton regression to the mean");
  await page.locator("text.node-label").filter({ hasText: "father height" }).click({ force: true });

  await page.locator(".editor-column").getByRole("tab", { name: "sample" }).click();
  const conditioning = page.locator(".editor-column").locator(".conditioning-editor");
  await conditioning.getByRole("button", { name: "condition on current" }).click();
  await conditioning.getByLabel("inference method").selectOption("analytic");
  await conditioning.getByRole("spinbutton", { name: "value" }).fill("72");
  await conditioning.getByLabel("value slider").evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) throw new Error("expected range input");
    element.value = "72";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await page.locator(".advanced-drawer summary").click();
  await expect(page.getByLabel("Analysis sample")).toContainText("Father_height >= 72");
  await expect(conditioning.getByLabel("inference method")).toHaveValue("analytic");
  await expect(page.locator(".conditioning-summary")).toContainText("Inference Methods");
  await expect(page.locator(".conditioning-summary")).toContainText("Father_height >= 72");
  await expect(page.locator(".conditioning-summary")).toContainText("requested analytic");
  await expect(page.locator(".conditioning-summary")).toContainText("active analytic");
  await expect(page.locator(".conditioning-summary")).toContainText("linear Gaussian");
  await expect(page.locator(".conditioning-summary")).toContainText(/\/ \d+/);
  await expect(page.locator(".editor-column")).toContainText("linear Gaussian moment match conditioned on Father_height >= 72");
});

test.skip("inference selector switches Galton conditioning between rejection and importance", async ({ page }) => {
  await page.goto("/");
  await loadExample(page, "Galton regression to the mean");
  await page.locator("text.node-label").filter({ hasText: "father height" }).click({ force: true });

  await page.locator(".editor-column").getByRole("tab", { name: "sample" }).click();
  const conditioning = page.locator(".editor-column").locator(".conditioning-editor");
  await conditioning.getByRole("button", { name: "condition on current" }).click();
  await conditioning.getByRole("spinbutton", { name: "value" }).fill("72");
  await page.locator(".advanced-drawer summary").click();
  await conditioning.getByLabel("inference method").selectOption("rejection");
  await expect(page.locator(".conditioning-summary")).toContainText("requested rejection sampling");
  await expect(page.locator(".conditioning-summary")).toContainText("active rejection sampling");

  await conditioning.getByLabel("inference method").selectOption("importance");
  await expect(page.locator(".conditioning-summary")).toContainText("requested importance sampling");
  await expect(page.locator(".conditioning-summary")).toContainText("active importance sampling");
  await expect(page.locator(".conditioning-summary")).toContainText("320 / 320");
});

test("minimal desktop shell keeps distribution plots visible", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".node-distribution-plot").first()).toBeVisible();
  await expect(page.locator(".canvas-zoom-controls")).toHaveCount(0);
  const firstPlot = await page.locator(".node-distribution-plot").first().boundingBox();
  expect(firstPlot?.width ?? 0).toBeGreaterThan(20);
  expect(firstPlot?.height ?? 0).toBeGreaterThan(8);
});

test("canvas background drag pans the desktop viewport", async ({ page }) => {
  await page.goto("/");

  const canvas = page.locator(".graph-canvas");
  const before = await flowViewportTransform(page);
  const nodeCount = await page.locator(".node").count();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + box.width - 72, box.y + box.height - 72);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 152, box.y + box.height - 122, { steps: 6 });
  await page.mouse.up();

  await expect.poll(() => flowViewportTransform(page)).not.toBe(before);
  await expect(page.locator(".node")).toHaveCount(nodeCount);
});

test("edges follow a node while it is being dragged", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pro" }).click();

  const node = page.locator(".react-flow__node").filter({ hasText: "academic need" }).first();
  const edgePaths = page.locator(".edge-line");
  await expect(node).toBeVisible();
  await expect(edgePaths.first()).toHaveAttribute("d", /./);
  const before = await edgePaths.evaluateAll((paths) => paths.map((path) => path.getAttribute("d") ?? ""));
  const box = await node.boundingBox();
  if (!box) throw new Error("missing draggable node");

  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + 58, { steps: 8 });

  await expect.poll(async () => {
    const current = await edgePaths.evaluateAll((paths) => paths.map((path) => path.getAttribute("d") ?? ""));
    return current.some((path, index) => path !== before[index]);
  }).toBe(true);
  await page.mouse.up();
});

test("mobile touch drag over the canvas scrolls the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await touchDrag(page, ".graph-canvas", -320);

  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
});

test("mobile touch drag over output modules scrolls the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await touchDrag(page, ".basic-results-column", -320);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

  await page.getByRole("button", { name: "Pro" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await touchDrag(page, ".pairwise-column", -360);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(150);
});

test("mobile layout avoids horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("button", { name: "1 Tutoring" })).toBeVisible();
  await expect(page.getByLabel("Examples")).toBeVisible();

  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    canvasHeight: document.querySelector(".canvas-shell")?.getBoundingClientRect().height ?? 0,
    topbarHeight: document.querySelector(".topbar")?.getBoundingClientRect().height ?? 0,
    canvasTop: document.querySelector(".canvas-shell")?.getBoundingClientRect().top ?? 0,
    resultsTop: document.querySelector(".basic-results-column")?.getBoundingClientRect().top ?? 0,
    editorTop: document.querySelector(".editor-column")?.getBoundingClientRect().top ?? 0
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
  expect(metrics.canvasHeight).toBeLessThanOrEqual(430);
  expect(metrics.topbarHeight).toBeLessThanOrEqual(170);
  expect(metrics.resultsTop).toBeGreaterThanOrEqual(metrics.canvasTop);
  expect(metrics.editorTop).toBeGreaterThanOrEqual(metrics.resultsTop);
  await expect(page.locator(".basic-results-column")).toBeVisible();
  await expect(page.locator(".scenario-column")).toHaveCount(0);
  await expect(page.locator(".advanced-drawer")).toHaveCount(0);
});

test("mobile examples menu opens as a selectable sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByLabel("Examples").click();
  const menu = page.locator(".example-menu-popover");
  await expect(menu).toBeVisible();
  await expect(menu.locator(".example-domain-list")).toHaveCount(0);
  const bounds = await menu.boundingBox();
  if (!bounds) throw new Error("missing mobile examples menu bounds");
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(391);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(845);

  await page.getByRole("menuitem").filter({ hasText: "Birthweight paradox" }).click();
  await expect(page.getByLabel("Examples")).toContainText("Birthweight paradox");
  await expect(page.getByLabel("Demo result")).toContainText("Smoking -> infant mortality");
});

test("mobile pro examples menu uses categorized catalog", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page.getByRole("button", { name: "Pro" }).click();

  await page.getByLabel("Examples").click();
  const menu = page.locator(".example-menu-popover");
  await expect(menu).toBeVisible();
  const domains = menu.locator(".example-domain-list");
  await expect(domains).toBeVisible();
  await expect(domains.getByRole("button", { name: "Classic DAG patterns" })).toHaveClass(/active/);
  await expect(menu.getByRole("menuitem").filter({ hasText: "Does the ICU make patients die?" })).toBeVisible();
  const beforeScroll = await menu.locator(".example-choice-list").evaluate((element) => ({
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight
  }));
  expect(beforeScroll.scrollHeight).toBeGreaterThan(beforeScroll.clientHeight + 200);
  await touchDrag(page, ".example-choice-list", -360);
  await expect.poll(() => menu.locator(".example-choice-list").evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  await domains.getByRole("button", { name: "ML / data science" }).click();
  await expect(domains.getByRole("button", { name: "ML / data science" })).toHaveClass(/active/);
  await expect(menu).toContainText("Assumption declaration, graph refutation, discovery hypotheses, and treatment heterogeneity.");
  await expect(menu.getByRole("menuitem").filter({ hasText: "Gene programs to traits" })).toBeVisible();

  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    scrollY: window.scrollY
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
  expect(metrics.scrollY).toBe(0);
});
