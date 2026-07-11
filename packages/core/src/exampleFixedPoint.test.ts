import { describe, it, expect } from "vitest";
import { EXAMPLES, exampleDocument, reconcilePins, syncGenerativeState } from "./index";

// INVARIANT: every curated example must be a FIXED POINT of the app's own commit pipeline
// (workbenchStore.commitState = reconcilePins(syncGenerativeState(doc))). If an example is not, then
// merely OPENING it silently mutates it — the doc the app shows is not the doc we authored.
//
// This bit us for real: `lalonde-fit-recover-2part` fitted Earnings_78's confounders with treat's δ
// authored at 0, then set δ afterwards WITHOUT re-reconciling. On load the app refit the confounders
// holding the real δ as an offset, drifting every Earnings_78 coefficient. Two consequences:
//   1. the example silently changed under the user, and
//   2. it fell off the ~60-char `#example=<id>` share link (canonicalShareExampleId compares the live doc
//      byte-for-byte against exampleDocument(id)), so it serialized a ~9.8KB `#c=` payload instead.
// The fix was to iterate solve→reconcile to convergence in the configurator.
describe("every example is a fixed point of reconcile (protects the short #example= share link)", () => {
  const canon = (d: { graph: unknown; simulation: unknown }) => JSON.stringify({ graph: d.graph, simulation: d.simulation });

  it.each(EXAMPLES.map((e) => e.id))("%s is unchanged by the commit pipeline", (id) => {
    const pristine = exampleDocument(id);
    expect(pristine).toBeTruthy();
    const before = canon(pristine!);
    // Clone rather than rebuild: some configurators (the two-part fitted DGP) iterate a fit to a fixed point
    // and are expensive, and this runs for every example.
    const afterCommit = reconcilePins(syncGenerativeState(structuredClone(pristine!))).document;
    expect(canon(afterCommit)).toBe(before);
  });
});
