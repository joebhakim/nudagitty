import { useEffect, useMemo, useState } from "react";
import { computeDoseResponseCurves, normalizeVariableModel } from "@nudagitty/core";
import type { DoseResponseCurves, GraphModel, GraphNode, SimulationResult, SimulationSpec } from "@nudagitty/core";
import { coerceBinary, formatPercent, formatPercentagePoints, formatSignedValue, formatValue, formatWeightedCount } from "../shared/formatting";
import {
  CategoryOutcomePlot,
  RiskCurvePlot,
  binaryOutcomeSummaries,
  binnedBinaryRiskSummaries,
  categoryOutcomeDomain,
  continuousOutcomeSummaries,
  multiLevelContinuousSummaries
} from "../charts/CategoryOutcomePlot";
import type { RiskBin, ScatterPoint } from "../charts/CategoryOutcomePlot";
import { ScatterChart } from "../charts/ScatterChart";
import { paddedDomain } from "../charts/chartFrame";
import { trackInfoOverlayOpened } from "../analytics";
import { displayNodeName } from "../outputs/estimand";
import { HighlightNames, SvgAxisName } from "../shared/NodeNames";
import { stratifyRiskCurves } from "../outputs/stratify";
import type { StratifiedRiskContrast } from "../outputs/stratify";
import { reconcileScatterPair, scatterPairOptions } from "../shared/pairs";
import type { ScatterPair } from "../shared/pairs";
import type { BinaryCell, BinaryOutcomeContrastSummary, PairDerivedSummary, ResultPendingState, SimulationDerivedCache } from "../app/types";
import { binaryCells, binaryOutcomeContrastFromCells, pairDerivedSummary } from "../compute/scatterStats";
import { binaryAxisValueLabel, binaryShortLabel, nodeOutputLabel } from "../compute/format";
import { resultPendingActive, resultPendingDetail, shortNodeLabel } from "../compute/relationSummary";

export function ScatterplotPanel(props: {
  graph: GraphModel;
  simulation: SimulationResult;
  derived: SimulationDerivedCache;
  pair: ScatterPair;
  pending?: ResultPendingState;
  pendingLabel?: string;
  variant?: "default" | "demo";
  simulationSpec?: SimulationSpec;
  onPair: (pair: ScatterPair) => void;
  onSelectNode: (id: string) => void;
}) {
  const nodes = [...props.graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const pair = reconcileScatterPair(props.graph, props.pair);
  // User-tunable point opacity (persisted) — replaces the auto/adaptive alpha. Lets the user dial in
  // overplotting for their own data instead of guessing a heuristic.
  const [pointAlpha, setPointAlpha] = useState<number>(() => {
    try { const v = parseFloat(localStorage.getItem("nudagitty.pointAlpha") ?? ""); return Number.isFinite(v) ? v : 0.4; } catch { return 0.4; }
  });
  useEffect(() => { try { localStorage.setItem("nudagitty.pointAlpha", String(pointAlpha)); } catch { /* ignore */ } }, [pointAlpha]);
  // Polynomial degree of the dose term for the adjusted dose-response curve (1 = straight, 2 = curved).
  const [doseDegree, setDoseDegree] = useState<1 | 2>(1);
  const roleOptions = scatterPairOptions(props.graph);
  const exposureOptionIds = new Set(roleOptions.exposures);
  const outcomeOptionIds = new Set(roleOptions.outcomes);
  const exposureOptions = nodes.filter((node) => exposureOptionIds.has(node.id));
  const outcomeOptions = nodes.filter((node) => outcomeOptionIds.has(node.id));
  const hasRolePairOptions = exposureOptions.length > 0 && outcomeOptions.length > 0;
  const xState = props.simulation.nodeStates[pair.x];
  const yState = props.simulation.nodeStates[pair.y];
  const pairSummary = pairDerivedSummary(props.derived, pair.x, pair.y);
  const points = pairSummary.points;
  const xDomain = pairSummary.xDomain;
  const yDomain = pairSummary.yDomain;
  const stats = pairSummary.stats;
  const xNode = props.graph.nodes.find((node) => node.id === pair.x);
  const yNode = props.graph.nodes.find((node) => node.id === pair.y);
  const xLabel = xNode ? nodeOutputLabel(xNode) : pair.x;
  const yLabel = yNode ? nodeOutputLabel(yNode) : pair.y;
  const xIsBinary = xNode !== undefined && normalizeVariableModel(xNode.variable).valueType === "binary";
  const yIsBinary = yNode !== undefined && normalizeVariableModel(yNode.variable).valueType === "binary";
  // A categorical / ordinal exposure (K small levels) × continuous outcome renders as K grouped
  // means (the K-arm generalization of the binary-continuous view). Categorical outcomes and
  // categorical × binary remain follow-ups.
  const xFamily = xNode ? normalizeVariableModel(xNode.variable) : null;
  const categoricalExposureLevels = xFamily && (xFamily.valueType === "categorical" || xFamily.valueType === "ordinal")
    ? Math.max(2, Math.min(8, Math.floor(xFamily.responseFamily.levels) || 0)) : 0;
  const categoricalExposureContinuous = categoricalExposureLevels >= 2 && yNode !== undefined && !yIsBinary;
  const categoricalSummaries = categoricalExposureContinuous && xFamily
    ? multiLevelContinuousSummaries(points, Array.from({ length: categoricalExposureLevels }, (_, i) => xFamily.categories[i] ?? `${i}`))
    : [];
  const categoricalYDomain = categoricalExposureContinuous ? categoryOutcomeDomain(yDomain, categoricalSummaries, false) : yDomain;
  const binaryPair = xIsBinary && yIsBinary;
  const binaryContinuousPair = xIsBinary && !yIsBinary;
  const continuousBinaryPair = !xIsBinary && yIsBinary;
  // When a binary covariate is set to condition/adjust (roles.adjusted), stratify the
  // continuous-exposure risk curve by it instead of showing the single crude curve.
  const stratifyNode = props.graph.nodes.find((node) =>
    node.roles.adjusted && node.id !== pair.x && node.id !== pair.y && normalizeVariableModel(node.variable).valueType === "binary"
  );
  const stratifyOperation: "condition" | "adjust" | null = stratifyNode
    ? (normalizeVariableModel(stratifyNode.variable).adjustment.standardize ? "adjust" : "condition")
    : null;
  const stratifiedContrast = continuousBinaryPair && stratifyNode
    ? stratifyRiskCurves(props.simulation, pair.x, pair.y, stratifyNode.id, 7)
    : null;
  const relationPreposition = "by";
  const detailRows = pairwiseDetailRows({
    summary: pairSummary,
    xLabel,
    yLabel,
    binaryPair,
    binaryContinuousPair,
    effectiveSampleSize: props.simulation.conditioning.effectiveSampleSize
  });
  const regression = stats && Number.isFinite(stats.slope) && Number.isFinite(stats.intercept)
    ? {
      x1: xDomain[0],
      y1: stats.intercept + stats.slope * xDomain[0],
      x2: xDomain[1],
      y2: stats.intercept + stats.slope * xDomain[1]
    }
    : null;
  // For a continuous exposure we intervene on, overlay the dose-response curves
  // (crude vs re-simulated oracle vs from-data adjusted). Returns null for any
  // other pairing, falling back to the ordinary crude scatter. Skipped in demo.
  const doseResponse = useMemo<DoseResponseCurves | null>(() => {
    if (props.variant === "demo" || !props.simulationSpec) return null;
    return computeDoseResponseCurves(props.graph, props.simulationSpec, props.simulation, { x: pair.x, y: pair.y }, { doseDegree });
  }, [props.variant, props.simulationSpec, props.graph, props.simulation, pair.x, pair.y, doseDegree]);

  if (nodes.length < 2) return <p className="muted">Add at least two variables to compare simulated observations.</p>;
  const demoVariant = props.variant === "demo";

  // No causal question yet (no exposure AND outcome marked): show an empty prompt rather than plotting
  // an arbitrary guessed pair — which, for a fresh import, was the latent resample source vs a covariate.
  if (!hasRolePairOptions) {
    return (
      <div className={demoVariant ? "scatterplot-panel demo-scatterplot scatter-empty" : "scatterplot-panel scatter-empty"} aria-busy={resultPendingActive(props.pending)}>
        <p className="scatter-empty-title">Mark an exposure and an outcome</p>
        <p className="scatter-empty-hint muted">Click a variable on the canvas, then turn on <b>exposure</b> — and <b>outcome</b> on another — in its “Use this variable” toggles. Their relationship will appear here.</p>
      </div>
    );
  }

  return (
    <div className={demoVariant ? "scatterplot-panel demo-scatterplot" : "scatterplot-panel"} aria-busy={resultPendingActive(props.pending)}>
      {!demoVariant && <div className="pairwise-relation-header">
        {hasRolePairOptions ? (
          <div className="pairwise-relation-title" aria-label={`${yLabel} ${relationPreposition} ${xLabel}`}>
            <PairVariableSelect
              axis="y"
              nodes={outcomeOptions}
              value={pair.y}
              onChange={(y) => props.onPair({ ...pair, y })}
            />
            <span>{relationPreposition}</span>
            <PairVariableSelect
              axis="x"
              nodes={exposureOptions}
              value={pair.x}
              onChange={(x) => props.onPair({ ...pair, x })}
            />
          </div>
        ) : (
          <p className="pairwise-role-warning muted">Mark at least one exposure and one outcome to choose this output.</p>
        )}
        {points.length > 0 && (
          <label className="scatter-alpha-control" title="Point opacity">
            <span aria-hidden="true">α</span>
            <input type="range" min="0.03" max="1" step="0.01" value={pointAlpha} aria-label="Point opacity" onChange={(event) => setPointAlpha(parseFloat(event.target.value))} />
          </label>
        )}
        <details className="pairwise-info" onToggle={(event) => { if ((event.currentTarget as HTMLDetailsElement).open) trackInfoOverlayOpened("pairwise"); }}>
          <summary aria-label="Pairwise details" title="Pairwise details">i</summary>
          <div className="pairwise-info-card">
            {detailRows.map((row) => <span key={row}>{row}</span>)}
          </div>
        </details>
      </div>}
      <ResultsPendingNotice pending={props.pending} label={props.pendingLabel ?? "Updating pairwise output"} />

      {binaryPair ? (
        <BinaryPairView
          summary={pairSummary}
          xLabel={xLabel}
          yLabel={yLabel}
          effectiveSampleSize={props.simulation.conditioning.effectiveSampleSize}
          showStats={demoVariant}
        />
      ) : binaryContinuousPair ? (
        <BinaryContinuousPairView summary={pairSummary} xLabel={xLabel} yLabel={yLabel} showStats={demoVariant} />
      ) : continuousBinaryPair && stratifiedContrast && stratifyOperation ? (
        <StratifiedContrastView contrast={stratifiedContrast} operation={stratifyOperation} xLabel={xLabel} yLabel={yLabel} />
      ) : continuousBinaryPair ? (
        <ContinuousBinaryPairView summary={pairSummary} xLabel={xLabel} yLabel={yLabel} showStats={demoVariant} />
      ) : categoricalExposureContinuous ? (
        <CategoryOutcomePlot points={points} summaries={categoricalSummaries} xLabel={xLabel} yLabel={yLabel} yDomain={categoricalYDomain} outcomeKind="continuous" />
      ) : (
        <>
          <ScatterChart
            points={points}
            xDomain={xDomain}
            yDomain={yDomain}
            regression={regression}
            xLabel={xLabel}
            yLabel={yLabel}
            pointAlpha={pointAlpha}
            doseResponse={doseResponse}
          />
          {doseResponse && (
            <DoseResponseLegend
              graph={props.graph}
              curves={doseResponse}
              doseDegree={doseDegree}
              onDoseDegree={setDoseDegree}
            />
          )}

          {points.length === 0 ? (
            <p className="muted">No finite paired samples are available for this variable pair.</p>
          ) : demoVariant ? (
            <div className="scatter-stats">
              <span>samples {points.length}</span>
              <span>corr {stats?.correlation === null || stats?.correlation === undefined ? "n/a" : formatValue(stats.correlation)}</span>
              <span>x mean {stats ? formatValue(stats.meanX) : "n/a"}</span>
              <span>y mean {stats ? formatValue(stats.meanY) : "n/a"}</span>
              {props.simulation.conditioning.effectiveSampleSize !== null && <span>ESS {formatValue(props.simulation.conditioning.effectiveSampleSize)}</span>}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function DoseResponseLegend(props: {
  graph: GraphModel;
  curves: DoseResponseCurves;
  doseDegree: 1 | 2;
  onDoseDegree: (degree: 1 | 2) => void;
}) {
  const adjustForLabel = props.curves.covariates
    .map((id) => { const node = props.graph.nodes.find((candidate) => candidate.id === id); return node ? shortNodeLabel(node) : id; })
    .join(", ");
  const hasAdjusted = props.curves.adjusted !== null;
  return (
    <div className="dose-response-legend">
      <div className="dose-legend-keys">
        <span className="dose-key"><span className="dose-swatch crude" />observed <span className="dose-key-formula">E[Y | X]</span></span>
        <span className="dose-key"><span className="dose-swatch oracle" />re-simulated oracle <span className="dose-key-formula">E[Y | do(X)]</span></span>
        {hasAdjusted && <span className="dose-key"><span className="dose-swatch adjusted" />adjusted for {adjustForLabel}</span>}
      </div>
      {hasAdjusted && (
        <div className="dose-fit-toggle" role="group" aria-label="Adjusted dose-response fit">
          <span className="dose-fit-label">fit</span>
          <button type="button" className={props.doseDegree === 1 ? "active" : ""} aria-pressed={props.doseDegree === 1} onClick={() => props.onDoseDegree(1)}>straight</button>
          <button type="button" className={props.doseDegree === 2 ? "active" : ""} aria-pressed={props.doseDegree === 2} onClick={() => props.onDoseDegree(2)}>curved</button>
        </div>
      )}
    </div>
  );
}

function PairVariableSelect(props: {
  axis: "x" | "y";
  nodes: GraphNode[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="pair-variable-select">
      <span className="screen-reader-only">{props.axis} variable</span>
      <select
        aria-label={`${props.axis} variable`}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.nodes.map((node) => <option value={node.id} key={node.id}>{displayNodeName(nodeOutputLabel(node))}</option>)}
      </select>
    </label>
  );
}

function pairwiseDetailRows(props: {
  summary: PairDerivedSummary;
  xLabel: string;
  yLabel: string;
  binaryPair: boolean;
  binaryContinuousPair: boolean;
  effectiveSampleSize: number | null;
}): string[] {
  const rows: string[] = [`samples ${props.summary.points.length}`];
  if (props.binaryPair) {
    const cells = props.summary.binaryCells;
    const totalWeight = cells.reduce((sum, cell) => sum + cell.weight, 0);
    const cell = (x: 0 | 1, y: 0 | 1) => cells.find((candidate) => candidate.x === x && candidate.y === y) ?? { x, y, weight: 0, count: 0, percent: 0, columnPercent: 0 };
    const yPositive = cell(1, 1).weight + cell(0, 1).weight;
    const xPositive = cell(1, 1).weight + cell(1, 0).weight;
    const contrast = props.summary.binaryContrast;
    rows.push(`${binaryShortLabel(props.yLabel)} at ${binaryAxisValueLabel(props.xLabel, 0)} ${contrast.yAtX0 === null ? "n/a" : formatPercent(contrast.yAtX0)}`);
    rows.push(`${binaryShortLabel(props.yLabel)} at ${binaryAxisValueLabel(props.xLabel, 1)} ${contrast.yAtX1 === null ? "n/a" : formatPercent(contrast.yAtX1)}`);
    rows.push(`risk diff ${contrast.diff === null ? "n/a" : formatPercentagePoints(contrast.diff)}`);
    if (totalWeight > 0) {
      rows.push(`${binaryAxisValueLabel(props.xLabel, 1)} share ${formatPercent(xPositive / totalWeight)}`);
      rows.push(`${binaryAxisValueLabel(props.yLabel, 1)} share ${formatPercent(yPositive / totalWeight)}`);
    }
  } else if (props.binaryContinuousPair) {
    const groups = props.summary.binaryContinuousGroups;
    const groupZero = groups[0];
    const groupOne = groups[1];
    const gap = groupZero?.mean !== null && groupZero?.mean !== undefined && groupOne?.mean !== null && groupOne?.mean !== undefined
      ? groupOne.mean - groupZero.mean
      : null;
    rows.push(`${binaryAxisValueLabel(props.xLabel, 1)} share ${groupOne ? formatPercent(groupOne.share) : "n/a"}`);
    rows.push(`${binaryAxisValueLabel(props.xLabel, 0)} mean ${groupZero?.mean === null || groupZero?.mean === undefined ? "n/a" : formatValue(groupZero.mean)}`);
    rows.push(`${binaryAxisValueLabel(props.xLabel, 1)} mean ${groupOne?.mean === null || groupOne?.mean === undefined ? "n/a" : formatValue(groupOne.mean)}`);
    rows.push(`${binaryAxisValueLabel(props.xLabel, 0)} n ${groupZero ? formatWeightedCount(groupZero.weight) : "0"}`);
    rows.push(`${binaryAxisValueLabel(props.xLabel, 1)} n ${groupOne ? formatWeightedCount(groupOne.weight) : "0"}`);
    rows.push(`difference 1-0 ${gap === null ? "n/a" : formatSignedValue(gap)}`);
  } else {
    const stats = props.summary.stats;
    rows.push(`corr ${stats?.correlation === null || stats?.correlation === undefined ? "n/a" : formatValue(stats.correlation)}`);
    rows.push(`${props.xLabel} mean ${stats ? formatValue(stats.meanX) : "n/a"}`);
    rows.push(`${props.yLabel} mean ${stats ? formatValue(stats.meanY) : "n/a"}`);
  }
  if (props.effectiveSampleSize !== null) rows.push(`ESS ${formatValue(props.effectiveSampleSize)}`);
  return rows;
}

function BinaryContinuousPairView(props: {
  summary: PairDerivedSummary;
  xLabel: string;
  yLabel: string;
  showStats?: boolean;
}) {
  const points = props.summary.points;
  const groups = props.summary.binaryContinuousGroups;
  const groupZero = groups[0];
  const groupOne = groups[1];
  const totalWeight = groups.reduce((sum, group) => sum + group.weight, 0);
  const gap = groupZero?.mean !== null && groupZero?.mean !== undefined && groupOne?.mean !== null && groupOne?.mean !== undefined
    ? groupOne.mean - groupZero.mean
    : null;
  const summaries = continuousOutcomeSummaries(points, props.xLabel);

  if (points.length === 0 || totalWeight <= 0) {
    return <p className="muted">No finite paired samples are available for this variable pair.</p>;
  }

  return (
    <div className="binary-continuous-pair-view">
      <CategoryOutcomePlot
        points={points}
        summaries={summaries}
        xLabel={props.xLabel}
        yLabel={props.yLabel}
        yDomain={categoryOutcomeDomain(props.summary.ySampleDomain, summaries, false)}
        outcomeKind="continuous"
      />

      {props.showStats !== false && <div className="scatter-stats binary-continuous-stats">
        <span>samples {points.length}</span>
        <span>x=1 share {groupOne ? formatPercent(groupOne.share) : "n/a"}</span>
        <span>x=0 mean {groupZero?.mean === null || groupZero?.mean === undefined ? "n/a" : formatValue(groupZero.mean)}</span>
        <span>x=1 mean {groupOne?.mean === null || groupOne?.mean === undefined ? "n/a" : formatValue(groupOne.mean)}</span>
        <span>x=0 n {groupZero ? formatWeightedCount(groupZero.weight) : "0"}</span>
        <span>x=1 n {groupOne ? formatWeightedCount(groupOne.weight) : "0"}</span>
        <span>difference 1-0 {gap === null ? "n/a" : formatSignedValue(gap)}</span>
      </div>}
    </div>
  );
}

function ContinuousBinaryPairView(props: {
  summary: PairDerivedSummary;
  xLabel: string;
  yLabel: string;
  showStats?: boolean;
}) {
  const points = props.summary.points;
  const bins = binnedBinaryRiskSummaries(points, 7);
  const totalWeight = points.reduce((sum, point) => sum + point.weight, 0);
  const successes = points.reduce((sum, point) => sum + coerceBinary(point.y) * point.weight, 0);
  const overall = totalWeight > 0 ? successes / totalWeight : null;
  const yPositiveLabel = binaryAxisValueLabel(props.yLabel, 1);
  const firstBin: RiskBin | undefined = bins[0];
  const lastBin: RiskBin | undefined = bins[bins.length - 1];
  const tailGap = firstBin && lastBin ? lastBin.mean - firstBin.mean : null;

  if (points.length === 0 || totalWeight <= 0 || bins.length === 0) {
    return <p className="muted">No finite paired samples are available for this variable pair.</p>;
  }

  return (
    <HighlightNames>
    <div className="continuous-binary-pair-view">
      <RiskCurvePlot bins={bins} xLabel={props.xLabel} yLabel={yPositiveLabel} />

      {props.showStats !== false && <div className="scatter-stats">
        <span>samples {points.length}</span>
        <span>{binaryShortLabel(props.yLabel)} overall {overall === null ? "n/a" : formatPercent(overall)}</span>
        <span>lowest band {firstBin ? formatPercent(firstBin.mean) : "n/a"}</span>
        <span>highest band {lastBin ? formatPercent(lastBin.mean) : "n/a"}</span>
        <span>bands {bins.length}</span>
        <span>top-bottom {tailGap === null ? "n/a" : formatPercentagePoints(tailGap)}</span>
      </div>}
    </div>
    </HighlightNames>
  );
}

function StratifiedContrastView(props: {
  contrast: StratifiedRiskContrast;
  operation: "condition" | "adjust";
  xLabel: string;
  yLabel: string;
}) {
  const { contrast, operation } = props;
  const yPositiveLabel = binaryAxisValueLabel(props.yLabel, 1);
  const panels: Array<{ label: string; detail?: string; bins: RiskBin[] }> = operation === "condition"
    ? [
        { label: "all (crude)", detail: `${formatPercent(contrast.crude.outcomeRate)} overall`, bins: contrast.crude.bins },
        ...contrast.strata.map((stratum) => ({
          label: stratum.label,
          detail: `${formatPercent(stratum.outcomeRate)} · ${formatPercent(stratum.share)} of population`,
          bins: stratum.bins
        }))
      ]
    : [
        { label: "all (crude)", detail: "unconditioned — the unbiased causal curve here", bins: contrast.crude.bins },
        { label: `standardized over ${contrast.conditioningId}`, detail: "backdoor-adjusted, re-weighted to the population", bins: contrast.standardized }
      ];
  if (panels.every((panel) => panel.bins.length === 0)) {
    return <p className="muted">No finite paired samples are available to stratify.</p>;
  }
  // One shared, cropped y-domain across panels: tight (no empty 0–50% band) yet
  // comparable, since every small-multiple uses the same axis.
  const rates = panels.flatMap((panel) => panel.bins.flatMap((bin) => [bin.mean, bin.lower, bin.upper]))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const sharedYDomain = rates.length > 0
    ? paddedDomain(Math.min(...rates), Math.max(...rates), { pad: 0.12, clampMin: 0, clampMax: 1 })
    : ([0, 1] as [number, number]);
  return (
    <HighlightNames>
    <div className="stratified-contrast-view">
      <div className="stratified-contrast-grid">
        {panels.map((panel) => (
          <div className="stratified-contrast-panel" key={panel.label}>
            <div className="stratified-contrast-label">
              <strong>{panel.label}</strong>
              {panel.detail && <span>{panel.detail}</span>}
            </div>
            <RiskCurvePlot bins={panel.bins} xLabel={props.xLabel} yLabel={yPositiveLabel} yDomain={sharedYDomain} compact />
          </div>
        ))}
      </div>
      <p className="stratified-contrast-note">
        {operation === "condition"
          ? `Conditioning on ${contrast.conditioningId}: each stratum is shown separately and not combined. Selecting only one is the bias — the strata disagree because it is a collider.`
          : `Adjusting for ${contrast.conditioningId}: the strata are standardized back to the population. Here that re-marginalizes toward the crude curve, so the danger of this collider is selection, not standardization.`}
      </p>
    </div>
    </HighlightNames>
  );
}

function BinaryPairView(props: {
  summary?: PairDerivedSummary;
  points?: ScatterPoint[];
  cells?: BinaryCell[];
  contrast?: BinaryOutcomeContrastSummary;
  xLabel: string;
  yLabel: string;
  effectiveSampleSize: number | null;
  showStats?: boolean;
}) {
  const points = props.summary?.points ?? props.points ?? [];
  const cells = props.summary?.binaryCells ?? props.cells ?? binaryCells(points);
  const totalWeight = cells.reduce((sum, cell) => sum + cell.weight, 0);
  const cell = (x: 0 | 1, y: 0 | 1) => cells.find((candidate) => candidate.x === x && candidate.y === y) ?? { x, y, weight: 0, count: 0, percent: 0, columnPercent: 0 };
  const yPositive = cell(1, 1).weight + cell(0, 1).weight;
  const xPositive = cell(1, 1).weight + cell(1, 0).weight;
  const contrast = props.summary?.binaryContrast ?? props.contrast ?? binaryOutcomeContrastFromCells(cells);
  const yPositiveLabel = binaryAxisValueLabel(props.yLabel, 1);
  const xZeroLabel = binaryAxisValueLabel(props.xLabel, 0);
  const xOneLabel = binaryAxisValueLabel(props.xLabel, 1);
  const xZeroRate = contrast.yAtX0 === null ? "n/a" : formatPercent(contrast.yAtX0);
  const xOneRate = contrast.yAtX1 === null ? "n/a" : formatPercent(contrast.yAtX1);
  const summaries = binaryOutcomeSummaries(points, props.xLabel);

  if (points.length === 0 || totalWeight <= 0) {
    return <p className="muted">No finite paired samples are available for this variable pair.</p>;
  }

  return (
    <div className="binary-pair-view">
      <CategoryOutcomePlot
        points={points}
        summaries={summaries}
        xLabel={props.xLabel}
        yLabel={yPositiveLabel}
        yDomain={[0, 1]}
        outcomeKind="binary"
      />

      {props.showStats !== false && <div className="scatter-stats">
        <span>samples {points.length}</span>
        <span>{binaryShortLabel(props.yLabel)} at {xZeroLabel} {xZeroRate}</span>
        <span>{binaryShortLabel(props.yLabel)} at {xOneLabel} {xOneRate}</span>
        <span>risk diff {contrast.diff === null ? "n/a" : formatPercentagePoints(contrast.diff)}</span>
        <span>{xOneLabel} share {formatPercent(xPositive / totalWeight)}</span>
        <span>{yPositiveLabel} share {formatPercent(yPositive / totalWeight)}</span>
        {props.effectiveSampleSize !== null && <span>ESS {formatValue(props.effectiveSampleSize)}</span>}
      </div>}
    </div>
  );
}

export function ResultsPendingNotice({ pending, label }: { pending?: ResultPendingState; label: string }) {
  if (!resultPendingActive(pending)) return null;
  return (
    <div className="results-pending-notice" role="status">
      <span className="pending-spinner" aria-hidden="true" />
      <span className="results-pending-copy">
        <strong>{label}</strong>
        <span>{resultPendingDetail(pending)}</span>
      </span>
    </div>
  );
}
