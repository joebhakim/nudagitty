import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        // Two pages: the app, and a standalone chart gallery (deployable to a
        // gallery.* subdomain). In dev both are served at / and /gallery.html.
        main: resolve(root, "index.html"),
        gallery: resolve(root, "gallery.html")
      }
    }
  },
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
  },
  preview: {
    allowedHosts: ["nudag.joeha.kim", "gallery.nudag.joeha.kim"]
  }
});
