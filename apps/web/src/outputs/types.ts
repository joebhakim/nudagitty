import type { AnalysisReport, GraphDocument, SimulationResult } from "@nudagitty/core";
import type { ReactNode } from "react";

export interface OutputContext {
  analysis: AnalysisReport;
  document: GraphDocument;
  simulation: SimulationResult;
}

export interface CompletedOutputModule<Result> {
  id: string;
  label: string;
  compute: (context: OutputContext) => Result | null;
  render: (result: Result, options?: CompletedOutputRenderOptions) => ReactNode;
  fallback: ReactNode;
}

export type CompletedOutputRenderOptions = {
  hideOracle?: boolean;
};
