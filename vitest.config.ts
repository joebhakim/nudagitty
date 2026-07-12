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
    passWithNoTests: false,
    // Several tests simulate a full cohort (NHEFS survival, the LaLonde plasmode) and run all eight
    // estimators over it. They are DETERMINISTIC — seeded cohorts, no RNG in the assertion path — but they
    // sit close to vitest's 5s default, so under CPU contention (a concurrent `npm run build`, say) they
    // time out and masquerade as assertion failures. A deterministic test that fails intermittently is
    // always a budget problem, never a logic one. 30s removes the false signal without hiding a real one.
    testTimeout: 30_000
  }
});
