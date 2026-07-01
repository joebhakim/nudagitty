import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@nudagitty/core": resolve(__dirname, "packages/core/src/index.ts"),
      "@nudagitty/analysis-worker": resolve(__dirname, "packages/analysis-worker/src/index.ts"),
      "@nudagitty/sim-worker": resolve(__dirname, "packages/sim-worker/src/index.ts")
    }
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "packages/**/*.test.tsx", "apps/**/*.test.ts", "apps/**/*.test.tsx"],
    passWithNoTests: false
  }
});
