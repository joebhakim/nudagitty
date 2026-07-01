import { findNode, runSimulation } from "@nudagitty/core";
import type { GraphDocument, GraphModel, GraphNode, SimulationResult } from "@nudagitty/core";
import { weightedPointMoments } from "../charts/CategoryOutcomePlot";
import type { ScatterPoint } from "../charts/CategoryOutcomePlot";
import { formatPercent, formatPercentagePoints, formatSignedValue, formatValue } from "../shared/formatting";
import { defaultScatterPair } from "../shared/pairs";
import { basicOutputPunchlineFromResult } from "../outputs/modules";
import type { BasicOutputPunchline, BasicOutputPunchlineMetric, ComputedCompletedOutput } from "../outputs/modules";
import type { OutputContext } from "../outputs/types";
import type {
  BasicComparisonLedgerRow,
  BasicDemoContext,
  BasicRelationSummary,
  BinaryAdjustmentOutput,
  ResultPendingState,
  SimulationDerivedCache
} from "../app/types";
import { abbreviateLabel, formatOutcomeDifference, formatOutcomeMean, signForPunchline } from "./format";
import { buildSimulationDerivedCache, isBinaryGraphNode, pairDerivedSummary } from "./scatterStats";


export function computeObservedRelationSummary(graph: GraphModel, simulation: SimulationResult, derived: SimulationDerivedCache): BasicRelationSummary | null {
  const pair = defaultScatterPair(graph);
  const xNode = graph.nodes.find((node) => node.id === pair.x);
  const yNode = graph.nodes.find((node) => node.id === pair.y);
  if (!xNode || !yNode) return null;
  const xState = simulation.nodeStates[pair.x];
  const yState = simulation.nodeStates[pair.y];
  const pairSummary = pairDerivedSummary(derived, pair.x, pair.y);
  const points = pairSummary.points;
  if (points.length === 0) return null;
  const xLabel = shortNodeLabel(xNode);
  const yLabel = shortNodeLabel(yNode);
  const xIsBinary = isBinaryGraphNode(xNode, xState);
  const yIsBinary = isBinaryGraphNode(yNode, yState);
  const sampleLabel = simulation.conditioning.activeConditions.length > 0 ? "current analysis sample" : "simulated sample";
  if (xIsBinary && yIsBinary) {
    const contrast = pairSummary.binaryContrast;
    if (contrast.diff === null) return null;
    const interval = weightedMeanDifferenceInterval(points);
    return {
      relationLabel: `${xLabel} -> ${yLabel}`,
      observed: {
        label: "Observed risk diff",
        value: formatPercentagePoints(contrast.diff),
        detail: `${yLabel} at ${xLabel}=1 ${contrast.yAtX1 === null ? "n/a" : formatPercent(contrast.yAtX1)} vs ${contrast.yAtX0 === null ? "n/a" : formatPercent(contrast.yAtX0)}`,
        numericValue: contrast.diff,
        lower: interval?.lower,
        upper: interval?.upper
      },
      comparison: null,
      note: `This is the raw exposure/outcome relation in the ${sampleLabel}. Add adjustment, a sample filter, or an intervention to see whether the causal read changes.`
    };
  }
  if (xIsBinary && !yIsBinary) {
    const groups = pairSummary.binaryContinuousGroups;
    const groupZero = groups[0];
    const groupOne = groups[1];
    const groupZeroMean = groupZero?.mean;
    const groupOneMean = groupOne?.mean;
    if (groupZeroMean === null || groupZeroMean === undefined || groupOneMean === null || groupOneMean === undefined) return null;
    const gap = groupOneMean - groupZeroMean;
    const interval = weightedMeanDifferenceInterval(points);
    return {
      relationLabel: `${xLabel} -> ${yLabel}`,
      observed: {
        label: "Observed mean difference",
        value: formatSignedValue(gap),
        detail: `${xLabel}=1 mean ${formatValue(groupOneMean)} vs ${xLabel}=0 mean ${formatValue(groupZeroMean)}`,
        numericValue: gap,
        lower: interval?.lower,
        upper: interval?.upper
      },
      comparison: null,
      note: `This is the raw exposure/outcome relation in the ${sampleLabel}. Open Results for the plot and mark covariates when this is not the causal comparison.`
    };
  }
  const stats = pairSummary.stats;
  if (!stats || stats.correlation === null) return null;
  return {
    relationLabel: `${xLabel} -> ${yLabel}`,
    observed: {
      label: "Observed correlation",
      value: formatSignedValue(stats.correlation),
      detail: `slope ${formatSignedValue(stats.slope)} across ${points.length} samples`,
      numericValue: stats.correlation
    },
    comparison: null,
    note: `This is the raw relation in the ${sampleLabel}. It is a descriptive correlation until the graph says what adjustment, sample filtering, or intervention means.`
  };
}

export function computeBasicRelationSummary(
  context: OutputContext & { moduleId: string | null },
  completedOutput: ComputedCompletedOutput | null,
  derived: SimulationDerivedCache,
  binaryAdjustmentOutput: BinaryAdjustmentOutput | null,
  options: { hideOracle?: boolean } = {}
): BasicRelationSummary | null {
  const activeInterventionSummary = computeInterventionRelationSummary(context);
  if (activeInterventionSummary) return activeInterventionSummary;
  const activeSelectionSummary = computeSelectionRelationSummary(context, derived, completedOutput, options);
  if (activeSelectionSummary) return activeSelectionSummary;
  const activeAdjustmentSummary = computeAdjustmentRelationSummary(context, completedOutput, derived, binaryAdjustmentOutput, options);
  if (activeAdjustmentSummary) return activeAdjustmentSummary;
  const modulePunchline = completedOutput?.moduleId === context.moduleId
    ? basicOutputPunchlineFromResult(context.moduleId, completedOutput.result)
    : null;
  const relationLabel = basicRelationLabel(context.document.graph);
  if (modulePunchline && shouldShowModulePunchlineBeforeUserFix(context.moduleId)) {
    return {
      relationLabel,
      observed: modulePunchline.observed,
      comparison: modulePunchline.comparison,
      ledgerRows: ledgerRowsFromPunchline(context, modulePunchline),
      note: modulePunchline.note
    };
  }
  const observed = computeObservedRelationSummary(context.document.graph, context.simulation, derived);
  return observed ? {
    ...observed,
    ledgerRows: [rawLedgerRow(context, observed.observed, "Full sample")]
  } : null;
}

export function computeAdjustmentRelationSummary(
  context: OutputContext & { moduleId: string | null },
  completedOutput: ComputedCompletedOutput | null,
  derived: SimulationDerivedCache,
  binaryAdjustmentOutput: BinaryAdjustmentOutput | null,
  options: { hideOracle?: boolean } = {}
): BasicRelationSummary | null {
  if (context.moduleId === "simpson-severity") {
    const ipw = binaryAdjustmentOutput?.stabilizedIpw;
    const rawInterval = binaryAdjustmentOutput ? weightedMeanDifferenceInterval(binaryAdjustmentOutput.rawPoints) : null;
    const xLabel = binaryAdjustmentOutput?.exposure ? shortNodeLabel(binaryAdjustmentOutput.exposure) : "exposure";
    const yLabel = binaryAdjustmentOutput?.outcome ? shortNodeLabel(binaryAdjustmentOutput.outcome) : "outcome";
    const rawDiff = ipw?.rawDiff ?? binaryAdjustmentOutput?.rawContrast.diff ?? null;
    if (rawDiff === null) return null;
    const rawTreated = ipw?.rawTreated ?? binaryAdjustmentOutput?.rawContrast.yAtX1 ?? null;
    const rawUntreated = ipw?.rawUntreated ?? binaryAdjustmentOutput?.rawContrast.yAtX0 ?? null;
    const adjusted = ipw && ipw.weightedDiff !== null
      ? {
          metric: {
            label: ipw.clippedCount > 0 ? "Clipped IPW difference" : "Stabilized IPW difference",
            value: formatPercentagePoints(ipw.weightedDiff),
            detail: `weighted ${yLabel} ${ipw.weightedTreated === null ? "n/a" : formatPercent(ipw.weightedTreated)} vs ${ipw.weightedUntreated === null ? "n/a" : formatPercent(ipw.weightedUntreated)}`,
            numericValue: ipw.weightedDiff,
            lower: weightedMeanDifferenceInterval(ipw.weightedPoints)?.lower,
            upper: weightedMeanDifferenceInterval(ipw.weightedPoints)?.upper
          },
          method: ipw.clippedCount > 0 ? "stabilized IPW, clipped propensities" : "stabilized IPW"
        }
      : binaryAdjustmentOutput && binaryAdjustmentOutput.strata.length > 0
        ? binnedOrStratifiedAdjustmentMetric(binaryAdjustmentOutput, yLabel)
        : null;
    if (!adjusted) return null;
    const rawMetric: BasicOutputPunchlineMetric = {
      label: "Observed association",
      value: formatPercentagePoints(rawDiff),
      detail: `${yLabel} at ${xLabel}=1 ${rawTreated === null ? "n/a" : formatPercent(rawTreated)} vs ${rawUntreated === null ? "n/a" : formatPercent(rawUntreated)}`,
      numericValue: rawDiff,
      lower: rawInterval?.lower,
      upper: rawInterval?.upper
    };
    const dgpRow = options.hideOracle ? null : dgpLedgerRowFromCompletedOutput(context, completedOutput);
    return {
      relationLabel: basicRelationLabel(context.document.graph),
      observed: rawMetric,
      comparison: adjusted.metric,
      ledgerRows: [
        rawLedgerRow(context, rawMetric, "Full sample"),
        {
          id: "adjusted",
          label: "Adjusted estimate",
          sample: "Full sample",
          adjustment: "Severity adjusted",
          method: adjusted.method,
          status: "adjusted",
          metric: adjusted.metric
        },
        ...(dgpRow ? [dgpRow] : [])
      ],
      note: options.hideOracle
        ? "Severity is now marked adjust for. The displayed association changes from the raw treatment comparison to the stabilized-IPW adjusted comparison."
        : "Severity is now marked adjust for. The displayed association changes from the raw treatment comparison to a model-based adjusted comparison; open Results for the DGP do difference and diagnostics."
    };
  }

  if (context.moduleId === "tutoring-scores" && isTutoringCompletedResult(completedOutput?.result)) {
    const output = completedOutput.result;
    if (!output.academicNeedAdjusted || output.adjustedPairGap === null) return null;
    const pair = defaultScatterPair(context.document.graph);
    const rawInterval = weightedMeanDifferenceInterval(pairDerivedSummary(derived, pair.x, pair.y).points);
    const rawMetric: BasicOutputPunchlineMetric = {
      label: "Observed score difference",
      value: formatSignedValue(output.crudeGap),
      detail: `tutored ${formatValue(output.crudeTutoredScore)} vs untutored ${formatValue(output.crudeUntutoredScore)}`,
      numericValue: output.crudeGap,
      lower: rawInterval?.lower,
      upper: rawInterval?.upper
    };
    const adjustedMetric: BasicOutputPunchlineMetric = {
      label: "Stratified adjusted difference",
      value: formatSignedValue(output.adjustedPairGap),
      detail: "weighted within Academic_need strata",
      numericValue: output.adjustedPairGap
    };
    const dgpRow = options.hideOracle ? null : dgpLedgerRowFromCompletedOutput(context, completedOutput);
    return {
      relationLabel: basicRelationLabel(context.document.graph),
      observed: rawMetric,
      comparison: adjustedMetric,
      ledgerRows: [
        rawLedgerRow(context, rawMetric, "Full sample"),
        {
          id: "adjusted",
          label: "Adjusted estimate",
          sample: "Full sample",
          adjustment: "Adjusted for Academic_need",
          method: "stratified standardization",
          status: "adjusted",
          metric: adjustedMetric
        },
        ...(dgpRow ? [dgpRow] : [])
      ],
      note: "Academic_need is now marked adjust for. The adjusted estimate compares tutored and untutored students within comparable need groups instead of mixing the groups together."
    };
  }

  return null;
}

export function computeInterventionRelationSummary(context: OutputContext & { moduleId: string | null }): BasicRelationSummary | null {
  const overrideEntries = Object.entries(context.document.simulation.overrides ?? {});
  if (overrideEntries.length === 0) return null;
  const graph = context.document.graph;
  const pair = defaultScatterPair(graph);
  const outcomeNode = graph.nodes.find((node) => node.roles.outcome) ?? graph.nodes.find((node) => node.id === pair.y);
  if (!outcomeNode) return null;
  const outcomeState = context.simulation.nodeStates[outcomeNode.id];
  const currentMean = outcomeState?.empirical.mean;
  if (currentMean === null || currentMean === undefined) return null;
  const baselineSimulation = runSimulation(graph, { ...context.document.simulation, overrides: {}, selections: {} });
  const baselineMean = baselineSimulation.nodeStates[outcomeNode.id]?.empirical.mean;
  if (baselineMean === null || baselineMean === undefined) return null;
  const diff = currentMean - baselineMean;
  const outcomeLabel = shortNodeLabel(outcomeNode);
  const interventionLabels = formatActiveInterventions(context.document);
  const outcomeValue = formatOutcomeMean(outcomeNode, outcomeState, currentMean);
  const baselineValue = formatOutcomeMean(outcomeNode, baselineSimulation.nodeStates[outcomeNode.id], baselineMean);
  const interventionMetric: BasicOutputPunchlineMetric = {
    label: "Intervention result",
    value: outcomeValue,
    detail: `${outcomeLabel} under ${interventionLabels.join(", ")}`,
    numericValue: currentMean
  };
  const changeMetric: BasicOutputPunchlineMetric = {
    label: "Change from baseline",
    value: formatOutcomeDifference(outcomeNode, diff),
    detail: `baseline ${outcomeLabel} ${baselineValue}`,
    numericValue: diff
  };
  return {
    relationLabel: basicRelationLabel(graph),
    observed: interventionMetric,
    comparison: changeMetric,
    ledgerRows: [
      {
        id: "intervention-result",
        label: "Intervention world",
        sample: interventionLabels.join(", "),
        adjustment: "do operator",
        method: "hard intervention",
        status: "intervention",
        metric: interventionMetric
      },
      {
        id: "intervention-change",
        label: "Change",
        sample: "vs baseline simulation",
        adjustment: "baseline held by DGP",
        method: "difference from no intervention",
        status: "dgp",
        metric: changeMetric
      }
    ],
    note: `The graph is now answering an intervention question: what changes downstream after ${interventionLabels.join(", ")}. Clear the intervention to return to the observed association.`
  };
}

export function computeSelectionRelationSummary(
  context: OutputContext & { moduleId: string | null },
  derived: SimulationDerivedCache,
  completedOutput: ComputedCompletedOutput | null,
  options: { hideOracle?: boolean } = {}
): BasicRelationSummary | null {
  if (context.simulation.conditioning.activeConditions.length === 0) return null;
  const current = computeObservedRelationSummary(context.document.graph, context.simulation, derived);
  if (!current) return null;
  const baselineSimulation = runSimulation(context.document.graph, { ...context.document.simulation, overrides: {}, selections: {} });
  const baseline = computeObservedRelationSummary(context.document.graph, baselineSimulation, buildSimulationDerivedCache(baselineSimulation));
  const selectedMetric: BasicOutputPunchlineMetric = {
    ...current.observed,
    label: "Selected sample"
  };
  const fullMetric = baseline ? {
    ...baseline.observed,
    label: "Full sample"
  } : null;
  const dgpRow = options.hideOracle ? null : dgpLedgerRowFromCompletedOutput(context, completedOutput);
  return {
    relationLabel: current.relationLabel,
    observed: selectedMetric,
    comparison: fullMetric,
    ledgerRows: [
      ...(fullMetric ? [rawLedgerRow(context, fullMetric, "Full sample")] : []),
      selectedLedgerRow(context, selectedMetric),
      ...(dgpRow ? [dgpRow] : [])
    ],
    note: `The sample filter changed the rows in the analysis sample: ${context.simulation.conditioning.activeConditions.join(", ")}. The DAG is unchanged; the displayed association is now conditional on that filter.`
  };
}

export function basicRelationLabel(graph: GraphModel): string {
  const exposure = graph.nodes.find((node) => node.roles.exposure);
  const outcome = graph.nodes.find((node) => node.roles.outcome);
  if (exposure && outcome) return `${shortNodeLabel(exposure)} -> ${shortNodeLabel(outcome)}`;
  const pair = defaultScatterPair(graph);
  const xNode = graph.nodes.find((node) => node.id === pair.x);
  const yNode = graph.nodes.find((node) => node.id === pair.y);
  if (xNode && yNode) return `${shortNodeLabel(xNode)} -> ${shortNodeLabel(yNode)}`;
  return "Exposure -> outcome";
}

export function relationChangeLabel(observed: number | null, comparison: number | null): string {
  if (comparison === null) return "observed";
  const observedSign = signForPunchline(observed);
  const comparisonSign = signForPunchline(comparison);
  if (observedSign !== 0 && comparisonSign !== 0 && observedSign !== comparisonSign) return "sign flip";
  if (observed !== null && Math.abs(observed - comparison) >= 0.05) return "changes";
  return "same sign";
}

export function formatActiveInterventions(document: GraphDocument): string[] {
  return Object.entries(document.simulation.overrides ?? {}).map(([id, value]) => {
    const node = findNode(document.graph, id);
    return `do(${node ? shortNodeLabel(node) : id}=${formatValue(value)})`;
  });
}

export function resultPendingActive(pending?: ResultPendingState): boolean {
  return Boolean(pending?.analysis || pending?.simulation);
}

export function resultPendingShortLabel(pending?: ResultPendingState): string {
  if (pending?.analysis && pending.simulation) return "updating model";
  if (pending?.analysis) return "updating paths";
  if (pending?.simulation) return "updating sample";
  return "updating";
}

export function resultPendingDetail(pending?: ResultPendingState): string {
  if (pending?.analysis && pending.simulation) return "Graph paths and simulated data are recalculating.";
  if (pending?.analysis) return "Graph paths are recalculating.";
  if (pending?.simulation) return "Simulated data are recalculating.";
  return "Displayed values will refresh shortly.";
}

export function demoResultHeading(summary: BasicRelationSummary, adjustedActive: boolean, context: BasicDemoContext): string {
  if (context.interventions.length > 0) return "Intervention";
  if (context.selections.length > 0) return "Selected sample";
  if (adjustedActive) return "Adjusted comparison";
  if (summary.comparison) return "Comparison";
  return "Raw comparison";
}

export function fallbackLedgerRows(summary: BasicRelationSummary): BasicComparisonLedgerRow[] {
  return [
    {
      id: "observed",
      label: "Observed",
      sample: "current sample",
      adjustment: "as displayed",
      method: "raw contrast",
      status: "raw",
      metric: summary.observed
    },
    ...(summary.comparison ? [{
      id: "comparison",
      label: "Comparison",
      sample: "reference state",
      adjustment: "as displayed",
      method: "comparison contrast",
      status: "adjusted" as const,
      metric: summary.comparison
    }] : [])
  ];
}

export function ledgerRowsFromPunchline(
  context: OutputContext & { moduleId: string | null },
  punchline: BasicOutputPunchline
): BasicComparisonLedgerRow[] {
  return [
    rawLedgerRow(context, punchline.observed, "Observed sample"),
    {
      id: "module-comparison",
      label: punchline.comparison.label.toLowerCase().includes("do") ? "DGP do difference" : "Comparison",
      sample: punchline.comparison.label.toLowerCase().includes("do") ? "intervention world" : "reference state",
      adjustment: punchline.comparison.label.toLowerCase().includes("do") ? "DGP intervention" : "module comparison",
      method: punchline.comparison.label.toLowerCase().includes("do") ? "do simulation" : "example-specific estimator",
      status: punchline.comparison.label.toLowerCase().includes("do") ? "dgp" : "adjusted",
      metric: punchline.comparison
    }
  ];
}

export function rawLedgerRow(
  context: OutputContext & { moduleId: string | null },
  metric: BasicOutputPunchlineMetric,
  sample: string
): BasicComparisonLedgerRow {
  return {
    id: `raw-${sample.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    label: sample,
    sample,
    adjustment: rawAdjustmentLabel(context),
    method: "raw association",
    status: "raw",
    metric
  };
}

export function selectedLedgerRow(
  context: OutputContext & { moduleId: string | null },
  metric: BasicOutputPunchlineMetric
): BasicComparisonLedgerRow {
  return {
    id: "selected-sample",
    label: "Selected sample",
    sample: context.simulation.conditioning.activeConditions.join(", ") || "selected rows",
    adjustment: selectedAdjustmentLabel(context),
    method: "raw contrast within selected rows",
    status: "selected",
    metric
  };
}

export function dgpLedgerRowFromCompletedOutput(
  context: OutputContext & { moduleId: string | null },
  completedOutput: ComputedCompletedOutput | null
): BasicComparisonLedgerRow | null {
  if (!completedOutput || completedOutput.moduleId !== context.moduleId) return null;
  const punchline = basicOutputPunchlineFromResult(context.moduleId, completedOutput.result);
  if (!punchline) return null;
  return {
    id: "dgp-do",
    label: "DGP do difference",
    sample: "intervention world",
    adjustment: "DGP intervention",
    method: "do simulation",
    status: "dgp",
    metric: punchline.comparison
  };
}

export function rawAdjustmentLabel(context: OutputContext & { moduleId: string | null }): string {
  if (context.moduleId === "simpson-severity") return nodeAdjusted(context.document.graph, "Severity") ? "Adjusted for Severity" : "Raw relation";
  if (context.moduleId === "tutoring-scores") return nodeAdjusted(context.document.graph, "Academic_need") ? "Adjusted for Academic_need" : "Raw relation";
  const adjustedNames = context.document.graph.nodes.filter((node) => node.roles.adjusted).map(shortNodeLabel);
  return adjustedNames.length > 0 ? `Adjusted for ${adjustedNames.join(", ")}` : "Raw relation";
}

export function selectedAdjustmentLabel(context: OutputContext & { moduleId: string | null }): string {
  const selectedIds = Object.keys(context.document.simulation.selections ?? {});
  if (context.moduleId === "tutoring-scores" && selectedIds.includes("Academic_need")) return "Academic_need fixed by sample filter";
  if (context.moduleId === "simpson-severity" && selectedIds.includes("Severity")) return "Severity fixed by sample filter";
  const selectedNames = selectedIds.map((id) => {
    const node = findNode(context.document.graph, id);
    return node ? shortNodeLabel(node) : id;
  });
  return selectedNames.length > 0 ? `Conditioned on ${selectedNames.join(", ")}` : "Sample filter";
}

export function nodeAdjusted(graph: GraphModel, id: string): boolean {
  return graph.nodes.find((node) => node.id === id)?.roles.adjusted ?? false;
}

export function basicDemoRecommendedAdjustmentId(moduleId: string | null, graph: GraphModel): string | null {
  const candidate = moduleId === "tutoring-scores"
    ? "Academic_need"
    : moduleId === "simpson-severity"
      ? "Severity"
      : null;
  if (!candidate) return null;
  return graph.nodes.some((node) => node.id === candidate) ? candidate : null;
}

export function binnedOrStratifiedAdjustmentMetric(
  output: BinaryAdjustmentOutput,
  yLabel: string
): { metric: BasicOutputPunchlineMetric; method: string } | null {
  const usable = output.strata.filter((stratum) => stratum.contrast.diff !== null && stratum.weight > 0);
  const totalWeight = usable.reduce((sum, stratum) => sum + stratum.weight, 0);
  if (totalWeight <= 0) return null;
  const diff = usable.reduce((sum, stratum) => sum + (stratum.contrast.diff ?? 0) * stratum.weight, 0) / totalWeight;
  const binned = output.binnedAdjustedNodes.length > 0;
  const adjustmentDetail = binned
    ? output.binnedAdjustedNodes.map((item) => `${shortNodeLabel(item.node)} ${item.cutpoints.length + 1} bins`).join(", ")
    : output.binaryAdjustedNodes.map(shortNodeLabel).join(", ");
  return {
    metric: {
      label: binned ? "Binned adjusted difference" : "Stratified adjusted difference",
      value: formatPercentagePoints(diff),
      detail: `${yLabel} contrast averaged across ${adjustmentDetail}`,
      numericValue: diff
    },
    method: binned ? "binned standardization" : "stratified standardization"
  };
}

export function shouldShowModulePunchlineBeforeUserFix(moduleId: string | null): boolean {
  return moduleId !== "simpson-severity" && moduleId !== "tutoring-scores";
}

export function isTutoringCompletedResult(value: unknown): value is {
  crudeTutoredScore: number;
  crudeUntutoredScore: number;
  crudeGap: number;
  academicNeedAdjusted: boolean;
  adjustedPairGap: number | null;
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.crudeTutoredScore === "number" &&
    typeof candidate.crudeUntutoredScore === "number" &&
    typeof candidate.crudeGap === "number" &&
    typeof candidate.academicNeedAdjusted === "boolean" &&
    (typeof candidate.adjustedPairGap === "number" || candidate.adjustedPairGap === null)
  );
}

export function shortNodeLabel(node: GraphNode): string {
  return abbreviateLabel(node.label || node.id, 24);
}


export function weightedMeanDifferenceInterval(points: ScatterPoint[]): { lower: number; upper: number } | null {
  const group0 = weightedPointMoments(points, 0);
  const group1 = weightedPointMoments(points, 1);
  if (!group0 || !group1 || group0.nEff <= 1 || group1.nEff <= 1) return null;
  const diff = group1.mean - group0.mean;
  const se = Math.sqrt(group1.variance / group1.nEff + group0.variance / group0.nEff);
  if (!Number.isFinite(se)) return null;
  return {
    lower: diff - 1.96 * se,
    upper: diff + 1.96 * se
  };
}
