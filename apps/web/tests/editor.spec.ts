import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function loadExample(page: Page, title: string) {
  await page.getByLabel("Examples").click();
  await page.getByRole("menuitem").filter({ hasText: title }).click();
}

test("loads the editor and creates a variable with the node tool", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Nudagitty")).toBeVisible();
  await expect(page.getByLabel("Editable causal graph")).toBeVisible();
  await expect(page.locator(".editor-column")).toContainText("Select a node or edge for editing.");
  await expect(page.locator("body")).not.toContainText("Live Node Values");
  await expect(page.locator(".scenario-column").getByLabel("empirical draws", { exact: true })).toHaveValue("320");
  await page.locator(".scenario-column").getByLabel("empirical draws", { exact: true }).fill("640");
  await expect(page.locator(".scatterplot-panel")).toContainText("draws 640");

  await page.getByRole("button", { name: "Variable" }).click();
  await page.locator(".graph-canvas").click({ position: { x: 80, y: 320 } });

  await expect(page.locator("text.node-label").filter({ hasText: "V" }).first()).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("V");
});

test("selected connections populate the editor column", async ({ page }) => {
  await page.goto("/");
  await page.locator(".edge-hit").first().dispatchEvent("pointerdown");
  const editor = page.locator(".editor-column");

  await expect(editor).toContainText("Connection");
  await expect(editor).toContainText("Severity to Treatment");
  await editor.getByLabel("function Severity to Treatment").click();
  await page.getByRole("option", { name: /Hill \/ Emax/ }).click();

  await expect(editor.locator(".edge-panel")).toContainText("EC50");
  await expect(editor.getByLabel("function Severity to Treatment")).toContainText("Hill / Emax");
  await expect(page.locator("body")).not.toContainText("Connection Functions");
  await expect(page.locator("body")).not.toContainText("Connection Detail");
});

test("selected variables populate the editor column", async ({ page }) => {
  await page.goto("/");
  await page.locator("text.node-label").filter({ hasText: "Severity" }).click({ force: true });
  const variableEditor = page.locator(".editor-column");
  const scenario = page.locator(".scenario-column");

  await expect(variableEditor).toContainText("Variable");
  await expect(variableEditor).toContainText("Severity");
  await expect(variableEditor).toContainText("Roles");
  await expect(variableEditor).toContainText("Distribution");
  await variableEditor.getByText("Description").click();
  await variableEditor.getByLabel("description").fill("Baseline confounder");

  await expect(variableEditor.getByLabel("description")).toHaveValue("Baseline confounder");
  await expect(variableEditor.getByLabel("type")).toHaveCount(0);
  await expect(variableEditor.getByLabel("unit")).toHaveCount(0);
  await variableEditor.getByRole("tab", { name: "interventions" }).click();
  await expect(variableEditor.locator(".hard-do-editor")).toContainText("Hard do intervention");
  await expect(variableEditor.locator(".conditioning-editor")).toContainText("Conditioning filter");
  await expect(page.locator("body")).not.toContainText("Model Inspector");
  await expect(page.locator("body")).not.toContainText("Connection Functions");
  await expect(variableEditor).not.toContainText("Measurement");
  await expect(variableEditor.locator(".planned-module-list")).toContainText("planned");
  await expect(scenario.locator(".hard-do-editor")).toHaveCount(0);
  await expect(scenario.locator(".conditioning-editor")).toHaveCount(0);
  await expect(scenario.locator(".planned-module-list")).toHaveCount(0);
});

test("hard do controls share one override state", async ({ page }) => {
  await page.goto("/");
  await page.locator("text.node-label").filter({ hasText: "Severity" }).click({ force: true });

  const editor = page.locator(".editor-column");
  await editor.getByRole("tab", { name: "interventions" }).click();
  const hardDo = editor.locator(".hard-do-editor");
  await expect(hardDo).toContainText("available");
  await hardDo.getByLabel("hard do value").fill("2");

  await expect(hardDo).toContainText("active");
  await expect(hardDo.getByLabel("hard do value")).toHaveValue("2");
  await hardDo.getByRole("button", { name: "release hard do" }).click();
  await expect(hardDo).toContainText("available");
});

test("binary variables update simulation defaults", async ({ page }) => {
  await page.goto("/");
  await page.locator("text.node-label").filter({ hasText: "Severity" }).click({ force: true });
  const variableEditor = page.locator(".editor-column");

  await variableEditor.getByLabel("root distribution").selectOption("bernoulli");
  await expect(variableEditor.getByLabel("root distribution")).toHaveValue("bernoulli");
  await expect(variableEditor).toContainText("binary");
  await expect(variableEditor.getByLabel("p slider")).toBeVisible();
  await expect(page.locator(".node.selected .binary-node-distribution-plot")).toBeVisible();
  const binaryLabels = page.locator(".node.selected .node-distribution-annotation text");
  await expect(binaryLabels).toHaveCount(2);
  await expect(binaryLabels.nth(0)).toContainText(/^(draw [01]|value \d+%)/);
  await expect(binaryLabels.nth(1)).toContainText("P(1)");
  expect((await binaryLabels.allTextContents()).join(" ")).not.toContain("Bernoulli");

  await loadExample(page, "Mediation: direct and total effect");
  await page.locator("text.node-label").filter({ hasText: "Biomarker" }).click({ force: true });
  await variableEditor.getByLabel("combiner").selectOption("bernoulli_logit");
  await expect(variableEditor.getByLabel("combiner")).toHaveValue("bernoulli_logit");
  await expect(variableEditor).toContainText("binary");
});

test("Galton example renders analytic and empirical node distributions", async ({ page }) => {
  await page.goto("/");
  await loadExample(page, "Galton regression to the mean");

  await expect(page.locator("text.node-label").filter({ hasText: "father height" })).toBeVisible();
  await expect(page.locator(".node-distribution-plot")).toHaveCount(6);
  await expect(page.locator(".node-distribution-annotation").first()).toContainText("draw");
  await expect(page.locator(".node-distribution-annotation").first()).toContainText("mean");
  await expect(page.locator(".node-distribution-annotation").first()).toContainText("sd");
  const galtonAnnotationLabels = page.locator(".node-distribution-annotation").first().locator("text");
  await expect(galtonAnnotationLabels).toHaveCount(2);
  expect((await galtonAnnotationLabels.allTextContents()).join(" ")).not.toContain("Normal");
  await page.locator("text.node-label").filter({ hasText: "father height" }).click({ force: true });
  await expect(page.locator(".editor-column")).toContainText("linear Gaussian SEM");
  await expect(page.locator(".editor-column")).toContainText("Normal(69.0, 2.80)");
});

test("domain mode exposes practitioner examples and recommended modules", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Domain" }).click();
  await page.getByLabel("Examples").click();
  await page.getByText("Epidemiology / public health").hover();
  await expect(page.getByRole("menuitem").filter({ hasText: "Target trial: treatment start and follow-up" })).toBeVisible();
  await page.getByRole("menuitem").filter({ hasText: "Target trial: treatment start and follow-up" }).click();

  await expect(page.locator("text.node-label").filter({ hasText: "treatment start" })).toBeVisible();
  await expect(page.locator(".scenario-column")).toContainText("Target trial");
  await expect(page.locator(".scenario-column")).toContainText("Negative controls");

  await page.getByRole("button", { name: "Pro" }).click();
  await expect(page.locator(".scenario-column")).toContainText("Synthetic control / CausalImpact");
  await expect(page.locator(".scenario-column")).toContainText("Root cause");
});

test("Simpson example reports a completed crude versus do contrast", async ({ page }) => {
  await page.goto("/");
  const output = page.locator(".completed-output-card");

  await expect(output).toContainText("Simpson ready");
  await expect(output).toContainText("crude association");
  await expect(output).toContainText("do contrast");
  await expect(output).toContainText("Fast visual read");
  await expect(output).toContainText("Treatment <- Severity -> Recovery");
  await expect(output).toContainText("do(Treatment=1)");
  await expect(output).toContainText(/Sign reversal|No sign reversal/);
});

test("ICU example reports severity confounding and triage collider warning", async ({ page }) => {
  await page.goto("/");
  await loadExample(page, "Does the ICU make patients die?");
  const output = page.locator(".completed-output-card");

  await expect(page.locator("text.node-label").filter({ hasText: "ICU admission" })).toBeVisible();
  await expect(page.locator("text.node-label").filter({ hasText: "triage score" })).toBeVisible();
  await expect(output).toContainText("ICU ready");
  await expect(output).toContainText("crude mortality");
  await expect(output).toContainText("do mortality");
  await expect(output).toContainText("severity separation");
  await expect(output).toContainText("triage collider");
  await expect(output).toContainText("ICU_admission <- Severity -> Death");
  await expect(output).toContainText("ICU_admission -> Triage_score <- Severity");
});

test("college example reports a raw versus do earnings premium", async ({ page }) => {
  await page.goto("/");
  await loadExample(page, "Does college raise earnings?");
  const output = page.locator(".completed-output-card");

  await expect(page.locator("text.node-label").filter({ hasText: "family advantage" })).toBeVisible();
  await expect(page.locator("text.node-label").filter({ hasText: "College" })).toBeVisible();
  await expect(page.locator("text.node-label").filter({ hasText: "Earnings" })).toBeVisible();
  await expect(output).toContainText("college ready");
  await expect(output).toContainText("raw premium");
  await expect(output).toContainText("do premium");
  await expect(output).toContainText("advantage gap");
  await expect(output).toContainText("College <- Family_advantage -> Earnings");
  await expect(output).toContainText("do(College=1)");
});

test("tutoring example reports a raw versus do sign flip", async ({ page }) => {
  await page.goto("/");
  await loadExample(page, "Does tutoring hurt test scores?");
  const output = page.locator(".completed-output-card");

  await expect(page.locator("text.node-label").filter({ hasText: "academic need" })).toBeVisible();
  await expect(page.locator("text.node-label").filter({ hasText: "Tutoring" })).toBeVisible();
  await expect(page.locator("text.node-label").filter({ hasText: "test score" })).toBeVisible();
  await expect(output).toContainText("sign flip ready");
  await expect(output).toContainText("raw score gap");
  await expect(output).toContainText("do score gain");
  await expect(output).toContainText("need gap");
  await expect(output).toContainText("Tutoring <- Academic_need -> Test_score");
  await expect(output).toContainText("Sign reversal");
  await expect(output).toContainText("do(Tutoring=1)");
});

test("denouement panel switches by example and expands checklists", async ({ page }) => {
  await page.goto("/");
  const denouement = page.locator(".denouement-panel");

  await expect(denouement).toContainText("Adjustment / backdoor");
  await expect(denouement).toContainText("The treatment looks worse in the crude comparison");

  await page.getByRole("button", { name: "Domain" }).click();
  await page.getByLabel("Examples").click();
  await page.getByText("Econometrics / public policy").hover();
  await page.getByRole("menuitem").filter({ hasText: "Policy evaluation: DiD and synthetic control" }).click();
  await expect(denouement).toContainText("DiD / event study / synthetic control");
  await expect(denouement).toContainText("treated units' post-policy change");
  await expect(denouement).toContainText("event-time effects");

  await denouement.getByText("Assumption checklist").click();
  await expect(denouement).toContainText("Parallel trends");
  await expect(denouement).toContainText("No anticipation");
});

test("binary variable pairs render a colored confusion matrix", async ({ page }) => {
  await page.goto("/");
  await loadExample(page, "Simpson's paradox: treatment by severity");

  const panel = page.locator(".scatterplot-panel");
  await expect(panel.getByLabel("x variable")).toHaveValue("Treatment");
  await expect(panel.getByLabel("y variable")).toHaveValue("Recovery");
  await expect(panel.locator(".confusion-matrix")).toBeVisible();
  await expect(panel.locator(".matrix-cell.agreement").first()).toBeVisible();
  await expect(panel).toContainText("positive x");
  await expect(panel.locator(".scatter-point")).toHaveCount(0);
});

test("Galton example plots observed father and son height samples", async ({ page }) => {
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

test("conditioning a Galton variable is separate from overriding it", async ({ page }) => {
  await page.goto("/");
  await loadExample(page, "Galton regression to the mean");
  await page.locator("text.node-label").filter({ hasText: "father height" }).click({ force: true });

  await page.locator(".editor-column").getByRole("tab", { name: "interventions" }).click();
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

  await expect(conditioning.getByLabel("inference method")).toHaveValue("analytic");
  await expect(page.locator(".conditioning-summary")).toContainText("Inference Methods");
  await expect(page.locator(".conditioning-summary")).toContainText("Father_height >= 72");
  await expect(page.locator(".conditioning-summary")).toContainText("selected analytic");
  await expect(page.locator(".conditioning-summary")).toContainText("active analytic");
  await expect(page.locator(".conditioning-summary")).toContainText("linear Gaussian");
  await expect(page.locator(".conditioning-summary")).toContainText(/\/ \d+/);
  await expect(page.locator(".editor-column")).toContainText("linear Gaussian moment match conditioned on Father_height >= 72");
});

test("inference selector switches Galton conditioning between rejection and importance", async ({ page }) => {
  await page.goto("/");
  await loadExample(page, "Galton regression to the mean");
  await page.locator("text.node-label").filter({ hasText: "father height" }).click({ force: true });

  await page.locator(".editor-column").getByRole("tab", { name: "interventions" }).click();
  const conditioning = page.locator(".editor-column").locator(".conditioning-editor");
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
  await loadExample(page, "Galton regression to the mean");

  await expect(page.locator(".node-distribution-plot")).toHaveCount(6);
  const initialZoom = Number((await page.locator(".canvas-zoom-controls span").textContent())?.replace("%", ""));
  await page.getByLabel("Zoom in").click();
  const nextZoom = Number((await page.locator(".canvas-zoom-controls span").textContent())?.replace("%", ""));
  expect(nextZoom).toBeGreaterThan(initialZoom);
  const firstPlot = await page.locator(".node-distribution-plot").first().boundingBox();
  expect(firstPlot?.width ?? 0).toBeGreaterThan(20);
  expect(firstPlot?.height ?? 0).toBeGreaterThan(8);
});

test("canvas background drag pans the desktop viewport", async ({ page }) => {
  await page.goto("/");

  const canvas = page.locator(".graph-canvas");
  const before = await canvas.getAttribute("viewBox");
  const nodeCount = await page.locator(".node").count();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + 80, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + 170, box.y + 130, { steps: 6 });
  await page.mouse.up();

  await expect(canvas).not.toHaveAttribute("viewBox", before ?? "");
  await expect(page.locator(".node")).toHaveCount(nodeCount);
});

test("mobile pinch zoom changes the canvas viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const canvas = page.locator(".graph-canvas");
  const before = await canvas.getAttribute("viewBox");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.locator(".canvas-grid").evaluate((element, box) => {
    const dispatch = (type: string, pointerId: number, clientX: number, clientY: number) => {
      element.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: "touch",
        clientX,
        clientY
      }));
    };
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    dispatch("pointerdown", 21, cx - 36, cy);
    dispatch("pointerdown", 22, cx + 36, cy);
    dispatch("pointermove", 21, cx - 78, cy - 10);
    dispatch("pointermove", 22, cx + 78, cy + 10);
    dispatch("pointerup", 21, cx - 78, cy - 10);
    dispatch("pointerup", 22, cx + 78, cy + 10);
  }, box);

  await expect(canvas).not.toHaveAttribute("viewBox", before ?? "");
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
