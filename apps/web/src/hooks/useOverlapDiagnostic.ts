import { useMemo } from "react";
import { adjustmentOverlap, deriveAdjustmentSpec, positivityStatus } from "@nudagitty/core";
import type { GraphDocument } from "@nudagitty/core";

// Overlap/positivity diagnostic, computed once per (signature-stable) computationDocument — so it
// does NOT re-run on node drags — and shared by the toolbar badge and the overlap modal. Extracted
// verbatim from App(); the useMemo dependency array is preserved.
export function useOverlapDiagnostic(computationDocument: GraphDocument) {
  const overlapDiagnostic = useMemo(() => {
    const spec = deriveAdjustmentSpec(computationDocument);
    return spec ? adjustmentOverlap(computationDocument, spec) : null;
  }, [computationDocument]);
  const positivity = overlapDiagnostic ? positivityStatus(overlapDiagnostic) : "ok";
  return { overlapDiagnostic, positivity };
}
