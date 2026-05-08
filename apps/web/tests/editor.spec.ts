import { expect, test } from "@playwright/test";

test("loads the editor and creates a variable with the node tool", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Nudagitty")).toBeVisible();
  await expect(page.getByLabel("Editable causal graph")).toBeVisible();

  await page.getByRole("button", { name: "Variable" }).click();
  await page.locator(".graph-canvas").click({ position: { x: 520, y: 500 } });

  await expect(page.locator("text.node-label").filter({ hasText: "V" }).first()).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("V");
});

test("connection function table stays in sync with the selected connection inspector", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("function Severity to Treatment").click();
  await page.getByRole("option", { name: /Hill \/ Emax/ }).click();

  await expect(page.locator(".edge-panel")).toContainText("Severity to Treatment");
  await expect(page.locator(".edge-panel")).toContainText("Function: Hill / Emax");
  await expect(page.locator(".edge-panel")).toContainText("EC50");
  await expect(page.locator(".mechanism-row.selected")).toContainText("Severity to Treatment");
});

test("selected variables expose a fuller variable model row", async ({ page }) => {
  await page.goto("/");
  await page.locator("text.node-label").filter({ hasText: "Severity" }).click({ force: true });
  const row = page.locator(".variable-model-row");
  const panel = page.locator(".variable-panel");

  await row.getByLabel("description").fill("Baseline confounder");
  await row.getByLabel("type").selectOption("count");
  await row.getByLabel("model").selectOption("noisy_proxy");

  await expect(row.getByLabel("description")).toHaveValue("Baseline confounder");
  await expect(row.getByLabel("type")).toHaveValue("count");
  await expect(row.getByLabel("model")).toHaveValue("noisy_proxy");
  await expect(row).not.toContainText("Domain");
  await expect(row).not.toContainText("Intervention");
  await expect(panel).toContainText("Causal Modules");
  await expect(panel).toContainText("Conditioning filter");
  await expect(panel.locator(".planned-module-list")).toContainText("Hard do");
  await expect(panel.locator(".planned-module-list")).toContainText("planned");
});

test("binary variables update simulation defaults", async ({ page }) => {
  await page.goto("/");
  await page.locator("text.node-label").filter({ hasText: "Severity" }).click({ force: true });
  const row = page.locator(".variable-model-row");

  await row.getByLabel("type").selectOption("binary");
  await expect(page.getByLabel("root distribution")).toHaveValue("bernoulli");

  await page.getByLabel("Examples").selectOption("mediation-direct-total");
  await page.locator("text.node-label").filter({ hasText: "Biomarker" }).click({ force: true });
  await row.getByLabel("type").selectOption("binary");
  await expect(page.getByLabel("combiner")).toHaveValue("bernoulli_logit");
});

test("Galton example renders analytic and empirical node distributions", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Examples").selectOption("galton-regression");

  await expect(page.locator("text.node-label").filter({ hasText: "father height" })).toBeVisible();
  await expect(page.locator(".node-distribution-plot")).toHaveCount(6);
  await page.locator("text.node-label").filter({ hasText: "father height" }).click({ force: true });
  await expect(page.locator(".variable-model-row")).toContainText("linear Gaussian SEM");
  await expect(page.locator(".variable-model-row")).toContainText("Normal(69.0, 2.80)");
});

test("binary variable pairs render a table and colored confusion matrix", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Examples").selectOption("simpson-severity");

  const panel = page.locator(".scatterplot-panel");
  await expect(panel.getByLabel("x variable")).toHaveValue("Treatment");
  await expect(panel.getByLabel("y variable")).toHaveValue("Recovery");
  await expect(panel.locator(".binary-summary-table")).toBeVisible();
  await expect(panel.locator(".confusion-matrix")).toBeVisible();
  await expect(panel.locator(".matrix-cell.agreement").first()).toBeVisible();
  await expect(panel).toContainText("positive x");
  await expect(panel.locator(".scatter-point")).toHaveCount(0);
});

test("Galton example plots observed father and son height samples", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Examples").selectOption("galton-regression");

  const scatter = page.locator(".scatterplot-panel");
  await expect(scatter.getByLabel("x variable")).toHaveValue("Father_height");
  await expect(scatter.getByLabel("y variable")).toHaveValue("Son_height");
  await expect(scatter.locator(".scatter-point").first()).toBeVisible();
  await expect(scatter).toContainText("corr");

  await scatter.getByLabel("x variable").selectOption("G_shared");
  await expect(scatter.getByLabel("x variable")).toHaveValue("G_shared");
});

test("conditioning a Galton variable is separate from overriding it", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Examples").selectOption("galton-regression");
  await page.locator("text.node-label").filter({ hasText: "father height" }).click({ force: true });

  const conditioning = page.locator(".conditioning-editor");
  await conditioning.getByRole("button", { name: "condition on current" }).click();
  await conditioning.getByLabel("inference method").selectOption("analytic");
  await conditioning.getByRole("spinbutton", { name: "value" }).fill("72");
  await conditioning.getByLabel("value slider").evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) throw new Error("expected range input");
    element.value = "72";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await expect(conditioning.getByLabel("inference method")).toHaveValue("analytic");
  await expect(page.locator(".conditioning-summary")).toContainText("Inference Methods");
  await expect(page.locator(".conditioning-summary")).toContainText("Father_height >= 72");
  await expect(page.locator(".conditioning-summary")).toContainText("selected analytic");
  await expect(page.locator(".conditioning-summary")).toContainText("active analytic");
  await expect(page.locator(".conditioning-summary")).toContainText("linear Gaussian");
  await expect(page.locator(".conditioning-summary")).toContainText(/\/ \d+/);
  await expect(page.locator(".variable-model-row")).toContainText("linear Gaussian moment match conditioned on Father_height >= 72");
});

test("inference selector switches Galton conditioning between rejection and importance", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Examples").selectOption("galton-regression");
  await page.locator("text.node-label").filter({ hasText: "father height" }).click({ force: true });

  const conditioning = page.locator(".conditioning-editor");
  await conditioning.getByRole("button", { name: "condition on current" }).click();
  await conditioning.getByRole("spinbutton", { name: "value" }).fill("72");
  await conditioning.getByLabel("inference method").selectOption("rejection");
  await expect(page.locator(".conditioning-summary")).toContainText("selected rejection sampling");
  await expect(page.locator(".conditioning-summary")).toContainText("active rejection sampling");

  await conditioning.getByLabel("inference method").selectOption("importance");
  await expect(page.locator(".conditioning-summary")).toContainText("selected importance sampling");
  await expect(page.locator(".conditioning-summary")).toContainText("active importance sampling");
  await expect(page.locator(".conditioning-summary")).toContainText("320 / 320");
});

test("canvas zoom controls keep distribution plots visible", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Examples").selectOption("galton-regression");

  await expect(page.locator(".node-distribution-plot")).toHaveCount(6);
  const initialZoom = Number((await page.locator(".canvas-zoom-controls span").textContent())?.replace("%", ""));
  await page.getByLabel("Zoom in").click();
  const nextZoom = Number((await page.locator(".canvas-zoom-controls span").textContent())?.replace("%", ""));
  expect(nextZoom).toBeGreaterThan(initialZoom);
  const firstPlot = await page.locator(".node-distribution-plot").first().boundingBox();
  expect(firstPlot?.width ?? 0).toBeGreaterThan(20);
  expect(firstPlot?.height ?? 0).toBeGreaterThan(8);
});

test("mobile layout avoids horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Select" })).toBeVisible();
  await expect(page.getByLabel("Examples")).toBeVisible();

  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    canvasHeight: document.querySelector(".canvas-shell")?.getBoundingClientRect().height ?? 0,
    topbarHeight: document.querySelector(".topbar")?.getBoundingClientRect().height ?? 0
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
  expect(metrics.canvasHeight).toBeLessThanOrEqual(430);
  expect(metrics.topbarHeight).toBeLessThanOrEqual(170);
});
