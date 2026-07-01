import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { analyzeGraph, runSimulation } from "@nudagitty/core";
import type { AnalysisReport, GraphModel, SimulationResult, SimulationSpec } from "@nudagitty/core";
import { WORKER_FALLBACK_MS } from "../app/constants";

interface ComputationWorkersArgs {
  analysisSignature: string;
  analysisGraph: GraphModel;
  setAnalysis: Dispatch<SetStateAction<AnalysisReport>>;
  setAnalysisResultSignature: Dispatch<SetStateAction<string>>;
  simulationSignature: string;
  simulationGraph: GraphModel;
  outputSimulation: SimulationSpec;
  setSimulation: Dispatch<SetStateAction<SimulationResult>>;
  setSimulationResultSignature: Dispatch<SetStateAction<string>>;
}

// Off-main-thread analysis and simulation orchestration: each effect spins up its worker, races
// it against a synchronous fallback, and settles the result + result signature. Extracted verbatim
// from App() as the contiguous pair of worker useEffects — call order and both dependency arrays
// are preserved. (The only edit is the worker URL, now resolved relative to this module's parent.)
export function useComputationWorkers({
  analysisSignature,
  analysisGraph,
  setAnalysis,
  setAnalysisResultSignature,
  simulationSignature,
  simulationGraph,
  outputSimulation,
  setSimulation,
  setSimulationResultSignature
}: ComputationWorkersArgs): void {
  useEffect(() => {
    let cancelled = false;
    let settled = false;
    let worker: Worker | null = null;
    const requestSignature = analysisSignature;
    const complete = (nextAnalysis: AnalysisReport) => {
      if (cancelled || settled) return;
      settled = true;
      window.clearTimeout(fallbackTimer);
      worker?.terminate();
      setAnalysis(nextAnalysis);
      setAnalysisResultSignature(requestSignature);
    };
    const completeFallback = () => {
      if (cancelled || settled) return;
      try {
        complete(analyzeGraph(analysisGraph));
      } catch (error) {
        console.error("analysis worker fallback failed", error);
        if (!cancelled && !settled) {
          settled = true;
          window.clearTimeout(fallbackTimer);
          worker?.terminate();
          setAnalysisResultSignature(requestSignature);
        }
      }
    };
    const fallbackTimer = window.setTimeout(completeFallback, WORKER_FALLBACK_MS);
    try {
      worker = new Worker(new URL("../analysis.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<AnalysisReport>) => complete(event.data);
      worker.onerror = (event) => {
        event.preventDefault();
        completeFallback();
      };
      worker.onmessageerror = completeFallback;
      worker.postMessage(analysisGraph);
    } catch (error) {
      console.error("analysis worker start failed", error);
      completeFallback();
    }
    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      worker?.terminate();
    };
  }, [analysisGraph, analysisSignature]);

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    let worker: Worker | null = null;
    const requestSignature = simulationSignature;
    const complete = (nextSimulation: SimulationResult) => {
      if (cancelled || settled) return;
      settled = true;
      window.clearTimeout(fallbackTimer);
      worker?.terminate();
      setSimulation(nextSimulation);
      setSimulationResultSignature(requestSignature);
    };
    const completeFallback = () => {
      if (cancelled || settled) return;
      try {
        complete(runSimulation(simulationGraph, outputSimulation));
      } catch (error) {
        console.error("simulation worker fallback failed", error);
        if (!cancelled && !settled) {
          settled = true;
          window.clearTimeout(fallbackTimer);
          worker?.terminate();
          setSimulationResultSignature(requestSignature);
        }
      }
    };
    const fallbackTimer = window.setTimeout(completeFallback, WORKER_FALLBACK_MS);
    try {
      worker = new Worker(new URL("../sim.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<SimulationResult>) => complete(event.data);
      worker.onerror = (event) => {
        event.preventDefault();
        completeFallback();
      };
      worker.onmessageerror = completeFallback;
      worker.postMessage({ graph: simulationGraph, spec: outputSimulation });
    } catch (error) {
      console.error("simulation worker start failed", error);
      completeFallback();
    }
    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      worker?.terminate();
    };
    // Keyed on outputSimulation (the signature-stable snapshot), NOT raw document.simulation:
    // a position-only move clones document.simulation (new identity, identical content), which
    // would otherwise re-run this effect — re-simulating on every node drag for nothing.
  }, [outputSimulation, simulationGraph, simulationSignature]);
}
