export type WorkbenchMode = "basic" | "pro";

export const MODE_LABELS: Record<WorkbenchMode, string> = {
  basic: "Demo",
  pro: "Pro"
};

export function modeDescription(mode: WorkbenchMode): string {
  if (mode === "basic") return "Start with a guided causal demo focused on the main punchline.";
  return "Expose every current and planned causal design module.";
}
