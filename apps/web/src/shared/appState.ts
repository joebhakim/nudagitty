import {
  initialDocument,
  reconcileSimulationSpec
} from "@nudagitty/core";
import type { GraphDocument } from "@nudagitty/core";

export const STORAGE_KEY = "nudagitty.document.v2";
export const LEGACY_STORAGE_KEYS = ["nudagitty.document.v1"];

export type ToolMode = "select" | "node" | "edge";
export type Selection = { kind: "node"; id: string } | { kind: "edge"; id: string } | null;
export type BibliographyTopic = "sem" | "nonlinear" | "probability" | "deep";

export function loadInitialDocument(): GraphDocument {
  const hash = window.location.hash.startsWith("#model=") ? window.location.hash.slice("#model=".length) : "";
  if (hash) {
    try {
      const decoded = JSON.parse(decodeURIComponent(atob(hash))) as GraphDocument;
      if (decoded.schemaVersion === 1) return { ...decoded, simulation: reconcileSimulationSpec(decoded.graph, decoded.simulation) };
    } catch {
      // Ignore malformed links and fall back to local state.
    }
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as GraphDocument;
      if (parsed.schemaVersion === 1) return { ...parsed, simulation: reconcileSimulationSpec(parsed.graph, parsed.simulation) };
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }
  for (const key of LEGACY_STORAGE_KEYS) window.localStorage.removeItem(key);
  return initialDocument();
}
