import { expect, test } from "@playwright/test";

test("loads the editor and creates a variable with the node tool", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Nudagitty")).toBeVisible();
  await expect(page.getByLabel("Editable causal graph")).toBeVisible();

  await page.getByRole("button", { name: "Variable" }).click();
  await page.locator(".graph-canvas").click({ position: { x: 520, y: 300 } });

  await expect(page.locator("text.node-label").filter({ hasText: "V" }).first()).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("V");
});

test("connection function table stays in sync with the selected connection inspector", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("function Z to X").click();
  await page.getByRole("option", { name: /Hill \/ Emax/ }).click();

  await expect(page.locator(".edge-panel")).toContainText("Z to X");
  await expect(page.locator(".edge-panel")).toContainText("Function: Hill / Emax");
  await expect(page.locator(".edge-panel")).toContainText("EC50");
  await expect(page.locator(".mechanism-row.selected")).toContainText("Z to X");
});

test("selected variables expose a fuller variable model row", async ({ page }) => {
  await page.goto("/");
  await page.locator("text.node-label").filter({ hasText: "Z" }).click({ force: true });
  const row = page.locator(".variable-model-row");

  await row.getByLabel("description").fill("Baseline confounder");
  await row.getByLabel("type").selectOption("count");
  await row.getByLabel("model").selectOption("noisy_proxy");

  await expect(row.getByLabel("description")).toHaveValue("Baseline confounder");
  await expect(row.getByLabel("type")).toHaveValue("count");
  await expect(row.getByLabel("model")).toHaveValue("noisy_proxy");
});

test("binary variables update simulation defaults", async ({ page }) => {
  await page.goto("/");
  await page.locator("text.node-label").filter({ hasText: "Z" }).click({ force: true });
  const row = page.locator(".variable-model-row");

  await row.getByLabel("type").selectOption("binary");
  await expect(page.getByLabel("root distribution")).toHaveValue("bernoulli");

  await page.locator("text.node-label").filter({ hasText: "X" }).click({ force: true });
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
  await conditioning.getByLabel("sampling").selectOption("importance");
  await conditioning.getByRole("spinbutton", { name: "value" }).fill("72");
  await conditioning.getByLabel("value slider").evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) throw new Error("expected range input");
    element.value = "72";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await expect(conditioning.getByLabel("sampling")).toHaveValue("importance");
  await expect(page.locator(".conditioning-summary")).toContainText("Father_height >= 72");
  await expect(page.locator(".conditioning-summary")).toContainText("analytic linear Gaussian");
  await expect(page.locator(".conditioning-summary")).toContainText(/\/ \d+/);
  await expect(page.locator(".variable-model-row")).toContainText("linear Gaussian moment match conditioned on Father_height >= 72");
});

test("sampling selector switches Galton conditioning between rejection and importance", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Examples").selectOption("galton-regression");
  await page.locator("text.node-label").filter({ hasText: "father height" }).click({ force: true });

  const conditioning = page.locator(".conditioning-editor");
  await conditioning.getByRole("button", { name: "condition on current" }).click();
  await conditioning.getByRole("spinbutton", { name: "value" }).fill("72");
  await conditioning.getByLabel("sampling").selectOption("rejection");
  await expect(page.locator(".conditioning-summary")).toContainText("method rejection");

  await conditioning.getByLabel("sampling").selectOption("importance");
  await expect(page.locator(".conditioning-summary")).toContainText("method importance");
  await expect(page.locator(".conditioning-summary")).toContainText("320 / 320");
});

test("canvas zoom controls keep distribution plots visible", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Examples").selectOption("galton-regression");

  await expect(page.locator(".node-distribution-plot")).toHaveCount(6);
  await page.getByLabel("Zoom in").click();
  await expect(page.locator(".canvas-zoom-controls")).toContainText("120%");
  const firstPlot = await page.locator(".node-distribution-plot").first().boundingBox();
  expect(firstPlot?.width ?? 0).toBeGreaterThan(20);
  expect(firstPlot?.height ?? 0).toBeGreaterThan(8);
});
