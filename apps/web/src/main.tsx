import React from "react";
import { createRoot } from "react-dom/client";
import { initAnalytics } from "./analytics";
import { App } from "./App";
import "./styles.css";

initAnalytics();

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
