import { describe, it, expect } from "vitest";
import { exampleDocument, reconcilePins, syncGenerativeState } from "@nudagitty/core";
import { canonicalShareExampleId } from "../share/exportDocument";

// The user's original complaint: share links were ~9.8KB. Root cause was NOT the codec — it was that the
// two-part example was not a FIXED POINT of the app's commit pipeline, so the live doc no longer byte-matched
// exampleDocument(id); canonicalShareExampleId() rejected it and the app inlined the whole document.
// Deriving the coefficients inside reconcile makes it a fixed point, so it goes back on the short link.
describe("the two-part example is back on the SHORT share link", () => {
  it("survives the commit pipeline and still resolves to #example=<id>", () => {
    const id = "lalonde-fit-recover-2part";
    // exactly what the app does on load
    const live = reconcilePins(syncGenerativeState(structuredClone(exampleDocument(id)!))).document;
    expect(canonicalShareExampleId(live, id)).toBe(id);  // ~34 chars, not ~10KB
  });

  it("...and re-authoring the STORY correctly drops it to the compact payload", () => {
    const id = "lalonde-fit-recover-2part";
    const doc = exampleDocument(id)!;
    const edited = structuredClone(doc);
    edited.metadata.imposedEffect = { ...edited.metadata.imposedEffect!, extensiveShare: 0.2 };
    const live = reconcilePins(syncGenerativeState(edited)).document;
    // It is no longer the curated example — a different causal story — so it must NOT masquerade as it.
    expect(canonicalShareExampleId(live, id)).toBeNull();
  });
});
