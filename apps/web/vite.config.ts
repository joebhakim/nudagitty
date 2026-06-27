import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

// Short commit of the build, surfaced to analytics so a session can be tied to the
// deploy it ran on. Falls back to "dev" outside a git checkout.
let appVersion = "dev";
try {
  appVersion = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim() || "dev";
} catch {
  appVersion = "dev";
}

export default defineConfig({
  root,
  define: {
    __APP_VERSION__: JSON.stringify(appVersion)
  },
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
    allowedHosts: ["nudag.joeha.kim", "gallery.nudag.joeha.kim", "canary-nudag.joeha.kim"]
  }
});
