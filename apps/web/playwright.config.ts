import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testIgnore: [
    ...(process.env.NUDAGITTY_SCREENSHOTS === "1" ? [] : ["**/example-screenshots.spec.ts"]),
    ...(process.env.NUDAGITTY_RESPONSIVE === "1" ? [] : ["**/responsive-screenshots.spec.ts"]),
    ...(process.env.NUDAGITTY_GALLERY === "1" ? [] : ["**/gallery.spec.ts"]),
    ...(process.env.NUDAGITTY_APPSTATES === "1" ? [] : ["**/app-states.spec.ts"])
  ],
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 120_000
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } }
  ]
});
