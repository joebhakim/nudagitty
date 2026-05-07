import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  resolve: {
    alias: {
      "@nudagitty/core": resolve(root, "../../packages/core/src/index.ts"),
      "@nudagitty/analysis-worker": resolve(root, "../../packages/analysis-worker/src/index.ts"),
      "@nudagitty/sim-worker": resolve(root, "../../packages/sim-worker/src/index.ts")
    }
  },
  server: {
    port: 5173,
    strictPort: false
  }
});
