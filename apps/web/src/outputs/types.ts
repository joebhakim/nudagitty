import type { AnalysisReport, CovariateBasis, GraphDocument, SimulationResult } from "@nudagitty/core";
import type { ReactNode } from "react";

export interface OutputContext {
  analysis: AnalysisReport;
  document: GraphDocument;
  simulation: SimulationResult;
  covariateBasis?: CovariateBasis;
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
