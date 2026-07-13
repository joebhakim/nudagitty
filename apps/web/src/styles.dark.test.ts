import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * THE APP IS LIGHT-ONLY — and this test is what keeps it honest.
 *
 * `base.css` declares `color-scheme: light` and defines exactly one palette. `color-scheme` does NOT affect
 * the `prefers-color-scheme` media query, which follows the OS. So a component carrying a dark block flips to
 * dark on a dark-mode OS while the page around it stays light. 36 such blocks had accumulated, and the result
 * was DARK ISLANDS: a light page with a black Diagnostics card, a black Dependence equation and a black
 * outcome ladder floating in it — plus unreadable text, because a component's dark block can restyle its own
 * background but cannot fix the inherited `--text` (#202428), which never flipped.
 *
 * The failure mode is invisible to anyone whose OS is light, which is why it grew to 36 blocks unnoticed.
 * A comment cannot stop that. This can.
 *
 * IF YOU ARE HERE BECAUSE THIS TEST FAILED: you added a dark rule to a light-only app. Either drop it, or
 * build dark mode properly — redefine --bg/--panel/--text/--muted/--line in base.css under the media query so
 * the whole page flips together — and then relax the guard below to require that palette.
 */

const ROOT = join(__dirname);

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...cssFiles(p));
    else if (entry.endsWith(".css")) out.push(p);
  }
  return out;
}

describe("the app is light-only", () => {
  it("no stylesheet may carry a prefers-color-scheme rule while the palette is light-only", () => {
    const base = readFileSync(join(ROOT, "styles/base.css"), "utf8");
    // The escape hatch: if someone DOES build a real dark palette, this guard stands down of its own accord.
    const hasDarkPalette = /@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*?--(bg|panel|text)\s*:/.test(base);
    if (hasDarkPalette) return;

    const offenders = cssFiles(ROOT)
      .filter((f) => readFileSync(f, "utf8").includes("prefers-color-scheme"))
      .map((f) => f.slice(ROOT.length + 1));

    expect(offenders, "a dark rule in a light-only app renders as a DARK ISLAND — see base.css").toEqual([]);
  });

  it("…and base.css still declares itself light, so the rule above means something", () => {
    expect(readFileSync(join(ROOT, "styles/base.css"), "utf8")).toContain("color-scheme: light");
  });
});
