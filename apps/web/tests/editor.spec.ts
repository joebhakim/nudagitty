import { expect, test } from "@playwright/test";

test("loads the editor and creates a variable with the node tool", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Nudagitty")).toBeVisible();
  await expect(page.getByLabel("Editable causal graph")).toBeVisible();

  await page.getByRole("button", { name: "Variable" }).click();
  await page.locator(".graph-canvas").click({ position: { x: 80, y: 320 } });

  await expect(page.locator("text.node-label").filter({ hasText: "V" }).first()).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("V");
});

test("connection list opens a compact connection window", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Severity to Treatment" }).click();
  const connectionWindow = page.getByRole("dialog", { name: "Connection Severity to Treatment" });

  await expect(connectionWindow).toBeVisible();
  await connectionWindow.getByLabel("function Severity to Treatment").click();
  await page.getByRole("option", { name: /Hill \/ Emax/ }).click();

  await expect(connectionWindow.locator(".edge-panel")).toContainText("EC50");
  await expect(connectionWindow.getByLabel("function Severity to Treatment")).toContainText("Hill / Emax");
  await expect(page.locator(".mechanism-row.selected")).toContainText("Severity to Treatment");
  await expect(page.locator(".model-panel")).not.toContainText("Connection Detail");
});

test("selected variables open a compact variable window", async ({ page }) => {
  await page.goto("/");
  await page.locator("text.node-label").filter({ hasText: "Severity" }).click({ force: true });
  const variableWindow = page.getByRole("dialog", { name: "Variable Severity" });
  const scenario = page.locator(".scenario-column");

  await expect(variableWindow).toBeVisible();
  await expect(variableWindow).toContainText("Roles");
  await expect(variableWindow).toContainText("Distribution");
  await variableWindow.getByText("Description").click();
  await variableWindow.getByLabel("description").fill("Baseline confounder");

  await expect(variableWindow.getByLabel("description")).toHaveValue("Baseline confounder");
  await expect(variableWindow.getByLabel("type")).toHaveCount(0);
  await expect(variableWindow.getByLabel("unit")).toHaveCount(0);
  await variableWindow.getByRole("tab", { name: "interventions" }).click();
  await expect(variableWindow.locator(".hard-do-editor")).toContainText("Hard do intervention");
  await expect(variableWindow.locator(".conditioning-editor")).toContainText("Conditioning filter");
  await expect(page.locator(".model-panel")).not.toContainText("Domain");
  await expect(page.locator(".model-panel")).not.toContainText("Measurement");
  await expect(page.locator(".model-panel")).not.toContainText("Intervention");
  await expect(scenario.locator(".hard-do-editor")).toContainText("Hard do intervention");
  await expect(scenario).toContainText("Conditioning filter");
  await expect(scenario.locator(".planned-module-list")).not.toContainText("Hard do");
  await expect(scenario.locator(".planned-module-list")).toContainText("planned");
});

test("hard do controls share one override state", async ({ page }) => {
  await page.goto("/");
  await page.locator("text.node-label").filter({ hasText: "Severity" }).click({ force: true });

  const hardDo = page.locator(".hard-do-editor");
  await expect(hardDo).toContainText("available");
  await page.getByLabel("hard do Severity").evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) throw new Error("expected range input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(element, "2");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await expect(hardDo).toContainText("active");
  await expect(hardDo.getByLabel("hard do value")).toHaveValue("2");
  await hardDo.getByRole("button", { name: "release hard do" }).click();
  await expect(hardDo).toContainText("available");
});

test("binary variables update simulation defaults", async ({ page }) => {
  await page.goto("/");
  await page.locator("text.node-label").filter({ hasText: "Severity" }).click({ force: true });
  const variableWindow = page.locator(".variable-window");

  await variableWindow.getByLabel("root distribution").selectOption("bernoulli");
  await expect(variableWindow.getByLabel("root distribution")).toHaveValue("bernoulli");
  await expect(variableWindow).toContainText("binary");
  await expect(variableWindow.getByLabel("p slider")).toBeVisible();

  await page.getByLabel("Examples").selectOption("mediation-direct-total");
  await page.locator("text.node-label").filter({ hasText: "Biomarker" }).click({ force: true });
  await variableWindow.getByLabel("combiner").selectOption("bernoulli_logit");
  await expect(variableWindow.getByLabel("combiner")).toHaveValue("bernoulli_logit");
  await expect(variableWindow).toContainText("binary");
});

test("Galton example renders analytic and empirical node distributions", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Examples").selectOption("galton-regression");

  await expect(page.locator("text.node-label").filter({ hasText: "father height" })).toBeVisible();
  await expect(page.locator(".node-distribution-plot")).toHaveCount(6);
  await expect(page.locator(".node-distribution-annotation").first()).toContainText("draw");
  await expect(page.locator(".node-distribution-annotation").first()).toContainText("mean");
  await expect(page.locator(".node-distribution-annotation").first()).toContainText("sd");
  await page.locator("text.node-label").filter({ hasText: "father height" }).click({ force: true });
  await expect(page.locator(".variable-window")).toContainText("linear Gaussian SEM");
  await expect(page.locator(".variable-window")).toContainText("Normal(69.0, 2.80)");
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
  await expect(page.locator(".variable-window")).toContainText("linear Gaussian moment match conditioned on Father_height >= 72");
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
