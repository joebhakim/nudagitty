import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function loadExample(page: Page, title: string) {
  await page.getByLabel("Examples").click();
  await page.getByRole("menuitem").filter({ hasText: title }).click();
}

test("loads the desktop guided basic shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Nudagitty")).toBeVisible();
  await expect(page.getByLabel("Editable causal graph")).toBeVisible();
  await expect(page.getByRole("button", { name: "Demo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Demo" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Domain" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pro" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Variable" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "1 Tutoring" })).toBeVisible();
  await expect(page.getByRole("button", { name: "2 Simpson" })).toBeVisible();
  await expect(page.getByLabel("Examples")).toBeVisible();
  await expect(page.locator(".graph-legend")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Legend" })).toBeVisible();
  await page.getByRole("button", { name: "Legend" }).click();
  await expect(page.locator(".graph-legend")).toBeVisible();
  await expect(page.locator(".graph-legend")).toContainText("Exposure");
  await expect(page.locator(".graph-legend")).toContainText("Outcome");
  await expect(page.locator(".graph-legend")).not.toContainText("arrow");
  await page.getByRole("button", { name: "Legend" }).click();
  await expect(page.locator(".graph-legend")).toHaveCount(0);
  await expect(page.locator(".canvas-zoom-controls")).toHaveCount(0);
  await expect(page.locator(".edge-function-glyph").first()).toBeHidden();
  await expect(page.getByLabel("Exposure outcome relation")).toContainText("Tutoring -> test score");
  await expect(page.getByLabel("Exposure outcome relation")).toContainText("Observed mean gap");
  await expect(page.getByLabel("Exposure outcome relation")).toContainText("95% CI");
  await expect(page.getByLabel("Exposure outcome relation")).not.toContainText("Fixed: stabilized IPW");
  await expect(page.locator(".editor-column")).toContainText("Try the flip");
  await expect(page.locator(".basic-results-column")).toBeVisible();
  await expect(page.locator(".basic-results-column")).toContainText("Pairwise Output");
  await expect(page.getByRole("button", { name: "Close results" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Live Node Values");
});

test("ignores legacy saved documents when opening the demo", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("nudagitty.document.v1", JSON.stringify({ schemaVersion: 1, title: "Legacy saved DAG" }));
  });
  await page.goto("/");

  await expect(page.getByRole("button", { name: "1 Tutoring" })).toBeVisible();
  await expect(page.getByLabel("Exposure outcome relation")).toContainText("Tutoring -> test score");
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

test("basic examples surface the observed versus causal punchline", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Examples").click();
  const basicItems = page.locator(".example-choice-list").getByRole("menuitem");
  await expect(basicItems.nth(0)).toContainText("Does tutoring hurt test scores");
  await expect(basicItems.nth(1)).toContainText("Simpson's paradox");
  await page.getByRole("menuitem").filter({ hasText: "Birthweight paradox" }).click();

  const relation = page.getByLabel("Exposure outcome relation");
  await expect(relation).toContainText("Smoking -> infant mortality");
  await expect(relation).toContainText(/sign flip/i);
  await expect(relation).toContainText(/selected sample/i);
  await expect(relation).toContainText(/Full sample/i);
  await expect(relation).toContainText(/Birthweight <= 2500/i);
  await expect(relation.locator(".huh-shift-plot")).toBeVisible();
  await relation.getByRole("button", { name: "full results" }).click();
  await expect(page.locator(".basic-results-column")).toBeVisible();
  await page.getByRole("button", { name: "Close results" }).click();
  await expect(page.locator(".basic-results-column")).toHaveCount(0);

  await page.getByLabel("Examples").click();
  await page.getByRole("menuitem").filter({ hasText: "Simpson's paradox" }).click();
  await expect(relation).toContainText("Observed risk diff");
  await expect(relation).not.toContainText("Fixed: stabilized IPW");
  await page.locator("text.node-label").filter({ hasText: "Severity" }).click({ force: true });
  await page.locator(".editor-column").getByLabel("adjust for").click();
  await expect(relation).toContainText(/fixed: .*IPW/i);
  await expect(relation).not.toContainText("DGP do contrast");
  await expect(relation.locator(".huh-shift-plot")).toBeVisible();
  await relation.getByRole("button", { name: "full results" }).click();
  const results = page.locator(".basic-results-column");
  await expect(results).toContainText("Pairwise Output");
  await expect(results).toContainText("Weighted pairwise output");
  await expect(results).toContainText("Stabilized IPW");
  await expect(results).not.toContainText("do contrast");
  await expect(results).not.toContainText("do(Treatment=1)");
});

test("demo comparison states track adjustment and selection choices", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "1 Tutoring" }).click();
  const relation = page.getByLabel("Exposure outcome relation");

  await expect(relation).toContainText("Comparison states");
  await expect(relation).toContainText("Academic_need unadjusted");
  await expect(relation).toContainText("Observed mean gap");

  await page.locator("text.node-label").filter({ hasText: "academic need" }).click({ force: true });
  const editor = page.locator(".editor-column");
  await editor.getByLabel("adjust for").click();
  await expect(relation).toContainText("Adjusted estimate");
  await expect(relation).toContainText("Adjusted for Academic_need");
  await expect(relation).not.toContainText("DGP do contrast");

  await editor.getByLabel("adjust for").click();
  await editor.getByLabel("selection").click();
  const categories = editor.getByLabel("Academic_need included categories");
  await categories.getByLabel("0").uncheck();
  await expect(relation).toContainText("Selected sample");
  await expect(relation).toContainText("Academic_need in {1}");
  await expect(relation).toContainText("Academic_need fixed by selection");
});

test("results panes mark output as updating while analysis recomputes", async ({ page }) => {
  await page.route(/analysis\.worker/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  await page.goto("/");
  await page.getByLabel("Exposure outcome relation").getByRole("button", { name: "full results" }).click();
  await page.locator("text.node-label").filter({ hasText: "academic need" }).click({ force: true });
  await page.locator(".editor-column").getByLabel("adjust for").click();

  await expect(page.getByLabel("Exposure outcome relation").locator(".pending-chip")).toContainText("updating");
  await expect(page.locator(".basic-results-column")).toContainText("Updating adjusted output");
  await expect(page.locator(".canvas-computation-status")).toContainText("updating paths");
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
  await page.getByRole("button", { name: "Domain" }).click();
  await page.getByLabel("Examples").click();
  await page.getByText("Social science / education / psychology").hover();
  await page.getByRole("menuitem").filter({ hasText: "selection fails to flip" }).click();

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
  await expect(page.getByLabel("Exposure outcome relation")).toContainText("Selected sample");
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
  await expect(editor.locator(".conditioning-editor").getByRole("button", { name: "condition on selected = 1" })).toBeVisible();
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
  await expect(variableEditor).toContainText("Selection filter");
  await expect(variableEditor).toContainText("Adjustment method");
  await expect(variableEditor.getByLabel("type")).toHaveCount(0);
  await expect(variableEditor.getByLabel("unit")).toHaveCount(0);
  await variableEditor.locator("summary").filter({ hasText: "Intervene" }).click();
  await expect(variableEditor.locator(".hard-do-editor")).toContainText("Hard do intervention");
  await expect(page.locator("body")).not.toContainText("Model Inspector");
  await expect(page.locator("body")).not.toContainText("Connection Functions");
  await expect(variableEditor).not.toContainText("Measurement");
  await variableEditor.locator("summary").filter({ hasText: "Selection filter" }).click();
  await expect(variableEditor.locator(".conditioning-editor")).toContainText("Selection / conditioning filter");
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
  await expect(page.getByLabel("Exposure outcome relation")).toContainText("Intervention result");
  await expect(page.getByLabel("Exposure outcome relation")).toContainText("Change from baseline");
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

test.skip("domain mode exposes practitioner examples and recommended modules", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Domain" }).click();
  await page.getByLabel("Examples").click();
  await page.getByText("Epidemiology / public health").hover();
  await expect(page.getByRole("menuitem").filter({ hasText: "Target trial: treatment start and follow-up" })).toBeVisible();
  await page.getByRole("menuitem").filter({ hasText: "Target trial: treatment start and follow-up" }).click();

  await expect(page.locator("text.node-label").filter({ hasText: "treatment start" })).toBeVisible();
  await page.locator(".scenario-column").getByText("Practitioner modules").click();
  await expect(page.locator(".scenario-column")).toContainText("Target trial");
  await expect(page.locator(".scenario-column")).toContainText("Negative controls");

  await page.getByRole("button", { name: "Pro" }).click();
  await expect(page.locator(".scenario-column")).toContainText("Synthetic control / CausalImpact");
  await expect(page.locator(".scenario-column")).toContainText("Root cause");
});

test("Simpson example reports a completed crude versus do contrast", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Domain" }).click();
  await loadExample(page, "Simpson's paradox: treatment by severity");
  await page.locator("text.node-label").filter({ hasText: "Severity" }).click({ force: true });
  await page.locator(".editor-column").getByLabel("adjusted").click();
  const adjustedOutput = page.locator(".adjusted-output-column");
  const output = adjustedOutput.locator(".completed-output-card");
  const binaryOutput = adjustedOutput.locator(".binary-adjustment-output");

  await expect(binaryOutput).toContainText("Binary adjusted output");
  await expect(binaryOutput).toContainText("Before: unadjusted");
  await expect(binaryOutput).toContainText("looks harmful");
  await expect(binaryOutput).not.toContainText("Raw matrix");
  await expect(binaryOutput).not.toContainText("Needs a different adjustment display");
  await expect(output).toContainText("Simpson ready");
  await expect(output).toContainText("crude association");
  await expect(output).toContainText("do contrast");
  await expect(output).toContainText("Fast visual read");
  await expect(output).toContainText("Treatment <- Severity -> Recovery");
  await expect(output).toContainText("do(Treatment=1)");
  await expect(output).toContainText(/Sign reversal|No sign reversal/);
  await expect(page.locator(".edge-value").first()).toContainText("linear coef");
});

test("adjusted continuous variables expose draggable bin methodology and positivity warnings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "2 Simpson" }).click();
  await page.getByLabel("Exposure outcome relation").getByRole("button", { name: "full results" }).click();
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
  await expect(binaryOutput).toContainText("Partly fixed: clipped IPW");
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
  await expect(output).toContainText("crude mortality");
  await expect(output).toContainText("do mortality");
  await expect(output).toContainText("severity separation");
  await expect(output).toContainText("triage collider");
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
  await expect(output).toContainText("raw premium");
  await expect(output).toContainText("do premium");
  await expect(output).toContainText("income gap");
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
  await expect(output).toContainText("Fix detected");
  await expect(output).toContainText("raw score gap");
  await expect(output).toContainText("do score gain");
  await expect(output).toContainText("need gap");
  await expect(output).toContainText("Tutoring <- Academic_need -> Test_score");
  await expect(output).toContainText("Sign reversal");
  await expect(output).toContainText("do(Tutoring=1)");
  await expect(output).toContainText("Adjusted reveal plan");
  const adjustedGraph = page.locator(".adjusted-pair-graph-card");
  await expect(adjustedGraph).toBeVisible();
  await expect(adjustedGraph).toContainText("Adjusted pair graph");
  await expect(adjustedGraph).toContainText("Low need");
  await expect(adjustedGraph).toContainText("High need");
  await expect(adjustedGraph).toContainText("weighted adjusted gap");
  await expect(adjustedGraph).toContainText("Continuous confounders need bins");
  expect(await adjustedGraph.locator(".adjusted-strip-point").count()).toBeGreaterThan(20);
  await expect(adjustedGraph.locator(".adjusted-strip-treatment-label").filter({ hasText: "tutored" }).first()).toBeVisible();
  const pairwise = page.locator(".scatterplot-panel");
  await expect(pairwise).toContainText("x=0 mean");
  await expect(pairwise).toContainText("x=1 mean");
  await expect(pairwise).toContainText("gap 1-0");
  await expect(pairwise).not.toContainText("corr");
});

test.skip("denouement panel switches by example and expands checklists", async ({ page }) => {
  await page.goto("/");
  await page.locator(".scenario-column").getByText("Practitioner modules").click();
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
  await page.getByLabel("Exposure outcome relation").getByRole("button", { name: "full results" }).click();

  const panel = page.locator(".scatterplot-panel");
  await expect(panel.getByLabel("x variable")).toHaveValue("Treatment");
  await expect(panel.getByLabel("y variable")).toHaveValue("Recovery");
  await expect(panel).toContainText("Observed gap");
  await expect(panel).toContainText("-47.2 pp");
  await expect(panel).toContainText("Each column is one Treatment group and sums to 100%");
  await expect(panel.locator(".confusion-matrix")).toBeVisible();
  await expect(panel.locator(".matrix-cell.outcome-positive").first()).toBeVisible();
  await expect(panel).toContainText("Treatment=1");
  await expect(panel).toContainText("Recovery=1");
  await expect(panel.locator(".matrix-cell").first()).toHaveAttribute("title", /Recovery=0, Treatment=0/);
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

  await page.locator(".editor-column").getByRole("tab", { name: "selection" }).click();
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
  await expect(page.locator(".conditioning-summary")).toContainText("selected analytic");
  await expect(page.locator(".conditioning-summary")).toContainText("active analytic");
  await expect(page.locator(".conditioning-summary")).toContainText("linear Gaussian");
  await expect(page.locator(".conditioning-summary")).toContainText(/\/ \d+/);
  await expect(page.locator(".editor-column")).toContainText("linear Gaussian moment match conditioned on Father_height >= 72");
});

test.skip("inference selector switches Galton conditioning between rejection and importance", async ({ page }) => {
  await page.goto("/");
  await loadExample(page, "Galton regression to the mean");
  await page.locator("text.node-label").filter({ hasText: "father height" }).click({ force: true });

  await page.locator(".editor-column").getByRole("tab", { name: "selection" }).click();
  const conditioning = page.locator(".editor-column").locator(".conditioning-editor");
  await conditioning.getByRole("button", { name: "condition on current" }).click();
  await conditioning.getByRole("spinbutton", { name: "value" }).fill("72");
  await page.locator(".advanced-drawer summary").click();
  await conditioning.getByLabel("inference method").selectOption("rejection");
  await expect(page.locator(".conditioning-summary")).toContainText("selected rejection sampling");
  await expect(page.locator(".conditioning-summary")).toContainText("active rejection sampling");

  await conditioning.getByLabel("inference method").selectOption("importance");
  await expect(page.locator(".conditioning-summary")).toContainText("selected importance sampling");
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
  const before = await canvas.getAttribute("viewBox");
  const nodeCount = await page.locator(".node").count();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + box.width - 72, box.y + box.height - 72);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 152, box.y + box.height - 122, { steps: 6 });
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
