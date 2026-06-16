import { useEffect, useRef } from "react";
import {
  trackAnalysisSampleSmall,
  trackBadControlShown,
  trackChartRendered,
  trackExampleDwell,
  trackNodeSelected,
  trackOutputEmpty,
  trackOutputViewed,
  trackSamplingFallback,
  trackSimState,
  type ChartKind,
  type EmptyReason,
  type FunnelRole,
  type OutputKind,
  type SamplingMethod,
  type SimStatus
} from "./analytics";

// Centralized, effect-driven telemetry: emit funnel + friction events on state
// transitions (deduped), instead of scattering tracker calls across handlers.
// All inputs are categorical (computed in App from the analysis report / sim
// summary), so nothing user-authored can reach the tracker from here.
export interface TelemetrySignals {
  exampleId: string; // "" for a custom (non-example) graph
  selectedNodeId: string | null;
  selectedRole: FunnelRole | null;
  outputKind: OutputKind | null;
  outputEmptyReason: EmptyReason | null;
  chartKind: ChartKind | null;
  badControlActive: boolean;
  simStatus: SimStatus;
  conditioningActive: boolean;
  samplingMethod: SamplingMethod;
  acceptedSamples: number;
}

// Visible-time milestones per example (separate from the global engagement timer).
const DWELL_MILESTONES = [10, 30, 90, 300] as const;

// Return a coarse upper-bound bucket only when the accepted sample is "small"
// (conditioning/rejection sampling shrank it); null means not noteworthy.
function smallSampleBucket(accepted: number): number | null {
  if (accepted >= 200) return null;
  if (accepted < 25) return 25;
  if (accepted < 50) return 50;
  if (accepted < 100) return 100;
  return 200;
}

export function useAnalyticsTelemetry(signals: TelemetrySignals) {
  const ledger = useRef({ once: new Set<string>(), last: new Map<string, string>() });

  const emitOnce = (key: string, emit: () => void) => {
    if (ledger.current.once.has(key)) return;
    ledger.current.once.add(key);
    emit();
  };
  const emitOnChange = (slot: string, value: string, emit: () => void) => {
    if (ledger.current.last.get(slot) === value) return;
    ledger.current.last.set(slot, value);
    emit();
  };

  // A. node_selected — once per (node, role)
  const { selectedNodeId, selectedRole } = signals;
  useEffect(() => {
    if (!selectedNodeId || !selectedRole) return;
    emitOnce(`node:${selectedNodeId}:${selectedRole}`, () => trackNodeSelected(selectedRole));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, selectedRole]);

  // A. output_viewed — once per (example, kind)
  const { exampleId, outputKind } = signals;
  useEffect(() => {
    if (!outputKind) return;
    emitOnce(`view:${exampleId}:${outputKind}`, () => trackOutputViewed(outputKind));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exampleId, outputKind]);

  // B. bad_control_shown — once per example while a conditioned collider opens a path
  const { badControlActive } = signals;
  useEffect(() => {
    if (!badControlActive) return;
    emitOnce(`badctl:${exampleId}`, () => trackBadControlShown());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exampleId, badControlActive]);

  // C. chart_rendered — once per (example, chart kind)
  const { chartKind } = signals;
  useEffect(() => {
    if (!chartKind) return;
    emitOnce(`chart:${exampleId}:${chartKind}`, () => trackChartRendered(chartKind));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exampleId, chartKind]);

  // D. output_empty — once per (example, reason)
  const { outputEmptyReason } = signals;
  useEffect(() => {
    if (!outputEmptyReason) return;
    emitOnce(`empty:${exampleId}:${outputEmptyReason}`, () => trackOutputEmpty(outputEmptyReason));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exampleId, outputEmptyReason]);

  // D. sim_state — on status transition (per example), so empty/failed surfaces
  // without per-keystroke spam
  const { simStatus } = signals;
  useEffect(() => {
    emitOnChange(`sim:${exampleId}`, simStatus, () => trackSimState(simStatus));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exampleId, simStatus]);

  // D. sampling_fallback — once per (example, method) when conditioning forces a
  // non-forward sampler
  const { conditioningActive, samplingMethod } = signals;
  useEffect(() => {
    if (!conditioningActive || samplingMethod === "forward") return;
    emitOnce(`fallback:${exampleId}:${samplingMethod}`, () => trackSamplingFallback(samplingMethod));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exampleId, conditioningActive, samplingMethod]);

  // D. analysis_sample_small — once per (example, bucket) when accepted draws shrink
  const { acceptedSamples } = signals;
  useEffect(() => {
    if (!conditioningActive) return;
    const bucket = smallSampleBucket(acceptedSamples);
    if (bucket === null) return;
    emitOnce(`small:${exampleId}:${bucket}`, () => trackAnalysisSampleSmall(bucket));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exampleId, conditioningActive, acceptedSamples]);

  // C. example_dwell — visible-time milestones, reset whenever the example changes
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (!exampleId) return;
    let visibleSeconds = 0;
    let lastTick = window.performance.now();
    const reached = new Set<number>();
    const tick = () => {
      const now = window.performance.now();
      if (document.visibilityState === "visible") visibleSeconds += (now - lastTick) / 1000;
      lastTick = now;
      for (const milestone of DWELL_MILESTONES) {
        if (visibleSeconds >= milestone && !reached.has(milestone)) {
          reached.add(milestone);
          trackExampleDwell(exampleId, milestone);
        }
      }
    };
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [exampleId]);
}
