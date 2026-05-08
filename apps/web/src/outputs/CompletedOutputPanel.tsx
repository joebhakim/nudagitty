import { useMemo } from "react";
import { completedOutputModules } from "./modules";
import type { OutputContext } from "./types";

export function CompletedOutputPanel(props: OutputContext & { moduleId: string | null }) {
  const module = completedOutputModules.find((candidate) => candidate.id === props.moduleId);
  const result = useMemo(
    () => module?.compute({ analysis: props.analysis, document: props.document, simulation: props.simulation }) ?? null,
    [module, props.analysis, props.document, props.simulation]
  );

  if (!module) return null;
  return result === null ? module.fallback : module.render(result);
}
