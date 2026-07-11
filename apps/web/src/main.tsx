import React from "react";
import { createRoot } from "react-dom/client";
import { initAnalytics } from "./analytics";
import { App } from "./App";
import { hydrateWorkbenchState } from "./store/workbenchStore";
import "./styles.css";

initAnalytics();

// Decoding a share link is async now (compressed payloads use the native, stream-based
// DecompressionStream). Resolve the initial state BEFORE the first render, so the store is already
// populated when App mounts — no flash of an empty canvas and no loading state. The store itself is still
// created synchronously, so every module that imports it is unaffected.
void hydrateWorkbenchState().finally(() => {
  createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
