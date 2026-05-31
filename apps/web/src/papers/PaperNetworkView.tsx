import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Search, X } from "lucide-react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type {
  PaperNetworkEdge,
  PaperNetworkEffect,
  PaperNetworkIntervention,
  PaperNetworkNode,
  PaperNetworkStudy
} from "./types";

type PaperNetworkViewProps = {
  study: PaperNetworkStudy;
  onClose: () => void;
};

type CanvasSize = { width: number; height: number };
type ScreenNode = { node: PaperNetworkNode; x: number; y: number; radius: number };
type GraphMode = "total" | "direct" | "full";
type EffectSort = "predicted" | "ace" | "fdr";
type RenderEdge = {
  source: string;
  target: string;
  value: number;
  kind: "total" | "direct";
  directEffect?: number;
  fdr?: number | null;
  mediated?: boolean;
};
type EffectRow = {
  effect: PaperNetworkEffect;
  outcome: PaperNetworkNode | undefined;
  predicted: number;
};

const countFormatter = new Intl.NumberFormat("en-US");
const DEFAULT_INTERVENTION_SYMBOL = "RPS3";

export function PaperNetworkView({ study, onClose }: PaperNetworkViewProps) {
  const [selectedId, setSelectedId] = useState(() => defaultInterventionGeneId(study));
  const [searchTerm, setSearchTerm] = useState("");
  const [scenarioDelta, setScenarioDelta] = useState(-1);
  const [graphMode, setGraphMode] = useState<GraphMode>("total");
  const [effectSort, setEffectSort] = useState<EffectSort>("predicted");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasFrameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const frame = canvasFrameRef.current;
    if (!frame) return undefined;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setCanvasSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height))
      });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const nodeById = useMemo(() => new Map(study.nodes.map((node) => [node.id, node])), [study.nodes]);
  const interventionByExposure = useMemo(() => new Map(study.interventions.map((item) => [item.exposure, item])), [study.interventions]);
  const maxDegree = useMemo(() => Math.max(1, ...study.nodes.map((node) => node.metrics.degree)), [study.nodes]);
  const selectedNode = nodeById.get(selectedId) ?? study.nodes[0] ?? null;
  const selectedIntervention = selectedNode ? interventionByExposure.get(selectedNode.id) ?? study.interventions[0] ?? null : null;

  useEffect(() => {
    const guideEffect = selectedNode?.metrics.guideEffect;
    if (typeof guideEffect === "number" && Number.isFinite(guideEffect)) {
      setScenarioDelta(roundToStep(guideEffect, 0.1));
    } else {
      setScenarioDelta(-1);
    }
  }, [selectedNode?.id, selectedNode?.metrics.guideEffect]);

  const searchMatches = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const fallbackIds = study.featuredInterventionGenes.length > 0
      ? study.featuredInterventionGenes.map((gene) => gene.id)
      : study.summary.topOutDegreeGenes.slice(0, 8).map((gene) => gene.id);
    const fallback = fallbackIds.map((id) => nodeById.get(id)).filter((node): node is PaperNetworkNode => Boolean(node));
    if (!query) return fallback;
    return study.nodes
      .filter((node) => node.symbol.toLowerCase().includes(query) || node.id.toLowerCase().includes(query))
      .sort((left, right) => searchRank(left, query) - searchRank(right, query) || interventionScore(right, interventionByExposure) - interventionScore(left, interventionByExposure))
      .slice(0, 10);
  }, [interventionByExposure, nodeById, searchTerm, study.featuredInterventionGenes, study.nodes, study.summary.topOutDegreeGenes]);

  const selectGene = useCallback((id: string) => {
    const node = nodeById.get(id);
    if (!node) return;
    setSelectedId(id);
    setSearchTerm(node.symbol);
    setGraphMode("total");
  }, [nodeById]);

  const effectRows = useMemo<EffectRow[]>(() => {
    if (!selectedIntervention) return [];
    return selectedIntervention.effects
      .map((effect) => ({
        effect,
        outcome: nodeById.get(effect.outcome),
        predicted: scenarioDelta * effect.ace
      }))
      .sort((left, right) => sortEffectRows(left, right, effectSort));
  }, [effectSort, nodeById, scenarioDelta, selectedIntervention]);

  const selectedDirectEdges = useMemo(() => {
    if (!selectedNode) return [];
    return study.edges
      .filter((edge) => edge.source === selectedNode.id)
      .sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight));
  }, [selectedNode, study.edges]);

  const graphEdges = useMemo<RenderEdge[]>(() => {
    if (!selectedNode || !selectedIntervention) return [];
    if (graphMode === "full") {
      return study.edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        value: edge.weight,
        kind: "direct" as const,
        directEffect: edge.weight,
        fdr: edge.fdr
      }));
    }
    if (graphMode === "direct") {
      return selectedDirectEdges.slice(0, 46).map((edge) => ({
        source: edge.source,
        target: edge.target,
        value: edge.weight,
        kind: "direct" as const,
        directEffect: edge.weight,
        fdr: edge.fdr
      }));
    }
    return effectRows
      .filter((row) => row.effect.fdr !== null && row.effect.fdr <= 0.05)
      .slice(0, 46)
      .map((row) => ({
        source: selectedNode.id,
        target: row.effect.outcome,
        value: row.predicted,
        kind: "total" as const,
        directEffect: row.effect.directEffect,
        fdr: row.effect.fdr,
        mediated: Math.abs(row.effect.directEffect) === 0
      }));
  }, [effectRows, graphMode, selectedDirectEdges, selectedIntervention, selectedNode, study.edges]);

  const visibleNodeIds = useMemo(() => {
    if (graphMode === "full") return null;
    const ids = new Set<string>();
    if (selectedNode) ids.add(selectedNode.id);
    for (const edge of graphEdges) {
      ids.add(edge.source);
      ids.add(edge.target);
    }
    return ids;
  }, [graphEdges, graphMode, selectedNode]);

  const visibleNodes = useMemo(
    () => visibleNodeIds ? study.nodes.filter((node) => visibleNodeIds.has(node.id)) : study.nodes,
    [study.nodes, visibleNodeIds]
  );

  const layout = useMemo(
    () => projectNodes(visibleNodes, canvasSize, maxDegree),
    [canvasSize, maxDegree, visibleNodes]
  );
  const screenNodeById = useMemo(() => new Map(layout.map((item) => [item.node.id, item])), [layout]);
  const maxAbsGraphValue = useMemo(() => Math.max(0.01, ...graphEdges.map((edge) => Math.abs(edge.value))), [graphEdges]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || canvasSize.width <= 0 || canvasSize.height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvasSize.width * dpr);
    canvas.height = Math.round(canvasSize.height * dpr);
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    drawPaperNetwork(ctx, {
      width: canvasSize.width,
      height: canvasSize.height,
      nodes: layout,
      nodeById: screenNodeById,
      edges: graphEdges,
      selectedId: selectedNode?.id ?? "",
      hoverId,
      maxAbsGraphValue,
      graphMode
    });
  }, [canvasSize, graphEdges, graphMode, hoverId, layout, maxAbsGraphValue, screenNodeById, selectedNode?.id]);

  const nearestNodeForEvent = useCallback((event: ReactPointerEvent<HTMLCanvasElement> | ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best: { id: string; distance: number } | null = null;
    for (const item of layout) {
      const distance = Math.hypot(item.x - x, item.y - y);
      const hitRadius = Math.max(9, item.radius + 5);
      if (distance > hitRadius) continue;
      if (!best || distance < best.distance) best = { id: item.node.id, distance };
    }
    return best?.id ?? null;
  }, [layout]);

  const mechanicCards = useMemo(() => selectedIntervention ? [
    {
      id: "directAgreement",
      title: "Direct and total agree",
      description: "A sparse edge and the total ACE point the same way.",
      effect: selectedIntervention.mechanics.directAgreement,
      tone: "agree"
    },
    {
      id: "mediatedOnly",
      title: "Mediated total effect",
      description: "The total effect is significant with no direct sparse edge.",
      effect: selectedIntervention.mechanics.mediatedOnly,
      tone: "mediated"
    },
    {
      id: "signDisagreement",
      title: "Signs disagree",
      description: "The direct edge and total intervention estimate have opposite signs.",
      effect: selectedIntervention.mechanics.signDisagreement,
      tone: "disagree"
    },
    {
      id: "lowPathExplanation",
      title: "Shortest path explains little",
      description: "The strongest path accounts for a small share of the total effect.",
      effect: selectedIntervention.mechanics.lowPathExplanation,
      tone: "weak"
    },
    {
      id: "pathCancellation",
      title: "Path exceeds total",
      description: "Other paths cancel part of the shortest-path effect.",
      effect: selectedIntervention.mechanics.pathCancellation,
      tone: "cancel"
    }
  ] : [], [selectedIntervention]);

  const graphModeLabel = graphMode === "total"
    ? "Top total-effect forecast"
    : graphMode === "direct"
      ? "Top direct G_hat edges"
      : "All released nonzero G_hat edges";
  const graphLegend = graphMode === "total"
    ? ["Forecast up", "Forecast down"]
    : ["Positive G_hat", "Negative G_hat"];

  return (
    <section className="paper-network-view intervention-explorer" aria-label="K562 paper network">
      <header className="paper-network-header">
        <div>
          <span className="paper-network-kicker">Brown et al. K562 reanalysis</span>
          <h1>Intervention mechanics from Perturb-seq</h1>
          <p>Pick a perturbed gene, then compare total ACE estimates, sparse direct edges, and path-mediated explanations from the released Brown estimates.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Back to workbench">
          <X size={16} />
          Back
        </button>
      </header>

      <div className="paper-network-layout intervention-layout">
        <aside className="paper-network-sidebar" aria-label="K562 intervention controls and provenance">
          <section className="paper-network-card">
            <div className="paper-network-card-title">
              <strong>Pick perturbation gene</strong>
              <ProvenanceChip label="Released estimates" />
            </div>
            <label className="paper-search-label" htmlFor="paper-network-search">
              <Search size={15} />
              Search gene
            </label>
            <input
              id="paper-network-search"
              aria-label="Search gene"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searchMatches[0]) selectGene(searchMatches[0].id);
              }}
              placeholder="RPS3, HSPA9, DYNLL1, ENSG..."
            />
            <div className="paper-search-results" aria-label="Gene search results">
              {searchMatches.map((node) => {
                const intervention = interventionByExposure.get(node.id);
                return (
                  <button
                    type="button"
                    key={node.id}
                    className={node.id === selectedNode?.id ? "active" : ""}
                    onClick={() => selectGene(node.id)}
                  >
                    <strong>{node.symbol}</strong>
                    <span>{node.id}</span>
                    <small>{formatCount(intervention?.summary.significantTotalEffectCount ?? 0)} total effects</small>
                  </button>
                );
              })}
            </div>
          </section>

          {selectedNode && selectedIntervention && (
            <section className="paper-network-card selected-gene-card" aria-label="Selected gene">
              <div className="selected-gene-heading">
                <div>
                  <span>Selected perturbation</span>
                  <strong>{selectedNode.symbol}</strong>
                  <small>{selectedNode.id}</small>
                </div>
                <div className="selected-gene-degree">
                  <strong>{formatCount(selectedIntervention.summary.significantTotalEffectCount)}</strong>
                  <span>FDR effects</span>
                </div>
              </div>
              <dl className="paper-network-property-grid compact">
                <Property label="Guide effect" value={formatSignedNullable(selectedNode.metrics.guideEffect, 2)} />
                <Property label="Guide cells" value={formatNullableCount(selectedNode.metrics.guideCellCount)} />
                <Property label="Direct G_hat edges" value={formatCount(selectedIntervention.summary.nonzeroDirectEdgeCount)} />
                <Property label="Mediated sig. effects" value={formatCount(selectedIntervention.summary.significantMediatedEffectCount)} />
              </dl>
            </section>
          )}

          <section className="paper-network-card">
            <div className="paper-network-card-title">
              <strong>Intervention scenario</strong>
              <ProvenanceChip label="Nudagitty derived" />
            </div>
            <label className="paper-field">
              <span>do({selectedNode?.symbol ?? "gene"} += {formatSigned(scenarioDelta, 1)} SD)</span>
              <input
                aria-label="Intervention delta in standard deviations"
                type="range"
                min={-4}
                max={4}
                step={0.1}
                value={scenarioDelta}
                onChange={(event) => setScenarioDelta(Number(event.target.value))}
              />
            </label>
            <div className="scenario-button-row">
              <button type="button" onClick={() => selectedNode?.metrics.guideEffect !== null && setScenarioDelta(roundToStep(selectedNode?.metrics.guideEffect ?? -1, 0.1))}>
                Use guide knockdown
              </button>
              <button type="button" onClick={() => setScenarioDelta(1)}>
                +1 SD
              </button>
              <button type="button" onClick={() => setScenarioDelta(-1)}>
                -1 SD
              </button>
            </div>
            <p className="paper-network-note">
              Forecasts are `delta * R_hat`; this is an inspection of Brown's released estimates, not a new perturbation experiment.
            </p>
          </section>

          <section className="paper-network-card paper-source-card">
            <div className="paper-network-card-title">
              <strong>Paper anchors</strong>
              <ProvenanceChip label="Reported" />
            </div>
            <dl className="paper-anchor-grid">
              <Property label="Genes" value={formatCount(study.summary.nodeCount)} />
              <Property label="G_hat edges" value={formatCount(study.paperAnchors.inferredGraphEdgeCount)} />
              <Property label="FDR ACEs incl. self" value={formatCount(study.paperAnchors.significantAceCountIncludingSelf)} />
              <Property label="Connected pairs" value={`${formatFixed(study.paperAnchors.connectedOrderedPairPercent, 1)}%`} />
              <Property label="Median FDR path" value={formatFixed(study.paperAnchors.medianFdrSignificantPathLength, 2)} />
              <Property label="Path > total" value={formatCount(study.paperAnchors.shortestPathOver100PercentPairCount)} />
            </dl>
            <div className="paper-link-row">
              <a href={study.articleUrl} target="_blank" rel="noreferrer">Article <ExternalLink size={13} /></a>
              <a href={study.dataUrl} target="_blank" rel="noreferrer">Zenodo data <ExternalLink size={13} /></a>
            </div>
          </section>
        </aside>

        <section className="paper-network-main-panel intervention-main-panel">
          {selectedNode && selectedIntervention && (
            <section className="paper-network-card intervention-summary-card">
              <div className="paper-network-card-title">
                <strong>Intervention forecast: do({selectedNode.symbol} += {formatSigned(scenarioDelta, 1)} SD)</strong>
                <ProvenanceChip label="Nudagitty derived" />
              </div>
              <div className="paper-metric-grid intervention-metric-grid">
                <MetricCard value={formatCount(selectedIntervention.summary.significantTotalEffectCount)} label="significant total effects" />
                <MetricCard value={formatCount(selectedIntervention.summary.significantDirectEffectCount)} label="significant direct-edge effects" />
                <MetricCard value={formatCount(selectedIntervention.summary.significantMediatedEffectCount)} label="significant mediated effects" />
                <MetricCard value={formatCount(selectedIntervention.summary.signDisagreementCount)} label="direct/total sign disagreements" />
              </div>
              <div className="blast-radius-bar" aria-label="Significant total effect direction split">
                <span style={{ width: `${directionShare(selectedIntervention, "positive")}%` }}>Up {formatCount(selectedIntervention.summary.significantPositiveTotalCount)}</span>
                <span style={{ width: `${directionShare(selectedIntervention, "negative")}%` }}>Down {formatCount(selectedIntervention.summary.significantNegativeTotalCount)}</span>
              </div>
            </section>
          )}

          <section className="paper-mechanics-grid" aria-label="Causal mechanics examples">
            {mechanicCards.map((card) => (
              <MechanicCard
                key={card.id}
                title={card.title}
                description={card.description}
                effect={card.effect}
                nodeById={nodeById}
                scenarioDelta={scenarioDelta}
                tone={card.tone}
              />
            ))}
          </section>

          <section className="paper-network-card intervention-graph-card">
            <div className="paper-network-canvas-toolbar">
              <div>
                <strong>{graphModeLabel}</strong>
                <span>{formatCount(visibleNodes.length)} genes, {formatCount(graphEdges.length)} drawn edges</span>
              </div>
              <div className="paper-mode-toggle" aria-label="K562 graph mode">
                <button type="button" className={graphMode === "total" ? "active" : ""} onClick={() => setGraphMode("total")}>Total effects</button>
                <button type="button" className={graphMode === "direct" ? "active" : ""} onClick={() => setGraphMode("direct")}>Direct edges</button>
                <button type="button" className={graphMode === "full" ? "active" : ""} onClick={() => setGraphMode("full")}>Full graph</button>
              </div>
            </div>
            <div className="paper-network-canvas-frame" ref={canvasFrameRef}>
              <canvas
                ref={canvasRef}
                className="paper-network-canvas"
                aria-label="K562 intervention graph canvas"
                role="img"
                onPointerMove={(event) => setHoverId(nearestNodeForEvent(event))}
                onPointerLeave={() => setHoverId(null)}
                onClick={(event) => {
                  const id = nearestNodeForEvent(event);
                  if (id) selectGene(id);
                }}
              />
              <div className="paper-network-overlay top-left">
                <span>{graphLegend[0]}</span>
                <span>{graphLegend[1]}</span>
                {graphMode === "total" && <span className="dashed-key">Mediated/no direct edge</span>}
              </div>
              <div className="paper-network-overlay bottom-right">
                {selectedNode ? `Selected: ${selectedNode.symbol}` : "Click a node"}
              </div>
            </div>
          </section>

          <section className="paper-network-card effects-table-card">
            <div className="paper-network-card-title">
              <strong>Largest downstream forecasts</strong>
              <label className="effect-sort-control">
                <span>Sort</span>
                <select value={effectSort} onChange={(event) => setEffectSort(event.target.value as EffectSort)}>
                  <option value="predicted">Predicted change</option>
                  <option value="ace">R_hat magnitude</option>
                  <option value="fdr">FDR</option>
                </select>
              </label>
            </div>
            <EffectTable rows={effectRows.slice(0, 28)} />
          </section>
        </section>
      </div>
    </section>
  );
}

function MetricCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="paper-metric-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function MechanicCard(props: {
  title: string;
  description: string;
  effect: PaperNetworkEffect | null;
  nodeById: Map<string, PaperNetworkNode>;
  scenarioDelta: number;
  tone: string;
}) {
  const outcome = props.effect ? props.nodeById.get(props.effect.outcome) : undefined;
  const predicted = props.effect ? props.effect.ace * props.scenarioDelta : null;
  return (
    <article className={`paper-network-card mechanic-card ${props.tone}`}>
      <div className="paper-network-card-title">
        <strong>{props.title}</strong>
        <ProvenanceChip label="Derived" />
      </div>
      <p>{props.description}</p>
      {props.effect ? (
        <div className="mechanic-card-body">
          <strong>{outcome?.symbol ?? props.effect.outcome}</strong>
          <div className="mechanic-inline-metrics">
            <span>pred {formatSigned(predicted ?? 0, 2)}</span>
            <span>R {formatSigned(props.effect.ace, 3)}</span>
            <span>G {formatSigned(props.effect.directEffect, 3)}</span>
            <span>{props.effect.pathLength === null ? "no path" : `path ${props.effect.pathLength}`}</span>
            <span>expl. {formatEffectExplained(props.effect.effectExplained)}</span>
            <span>FDR {formatPValue(props.effect.fdr)}</span>
          </div>
        </div>
      ) : (
        <span className="muted">No stored example for this perturbation.</span>
      )}
    </article>
  );
}

function EffectTable({ rows }: { rows: EffectRow[] }) {
  return (
    <div className="effects-table-wrap">
      <table className="effects-table">
        <thead>
          <tr>
            <th>Outcome</th>
            <th>Predicted</th>
            <th>R_hat</th>
            <th>G_hat</th>
            <th>FDR</th>
            <th>Mechanic</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.effect.outcome}>
              <td>
                <strong>{row.outcome?.symbol ?? row.effect.outcome}</strong>
                <span>{row.effect.outcome}</span>
              </td>
              <td className={row.predicted >= 0 ? "positive" : "negative"}>{formatSigned(row.predicted, 2)}</td>
              <td>{formatSigned(row.effect.ace, 3)}</td>
              <td>{formatSigned(row.effect.directEffect, 3)}</td>
              <td>{formatPValue(row.effect.fdr)}</td>
              <td>{effectMechanicLabel(row.effect)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProvenanceChip({ label }: { label: string }) {
  return <span className="paper-provenance-chip">{label}</span>;
}

function Property({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function projectNodes(nodes: PaperNetworkNode[], size: CanvasSize, maxDegree: number): ScreenNode[] {
  if (nodes.length === 0 || size.width <= 0 || size.height <= 0) return [];
  const padding = Math.max(22, Math.min(46, Math.min(size.width, size.height) * 0.08));
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }
  const dataWidth = Math.max(1, maxX - minX);
  const dataHeight = Math.max(1, maxY - minY);
  const availableWidth = Math.max(1, size.width - padding * 2);
  const availableHeight = Math.max(1, size.height - padding * 2);
  const scale = Math.min(availableWidth / dataWidth, availableHeight / dataHeight);
  const drawnWidth = dataWidth * scale;
  const drawnHeight = dataHeight * scale;
  const offsetX = (size.width - drawnWidth) / 2;
  const offsetY = (size.height - drawnHeight) / 2;

  return nodes.map((node) => {
    const eigen = node.metrics.eigenCentrality ?? 0;
    const degreeRatio = Math.sqrt(Math.max(0, node.metrics.degree) / maxDegree);
    return {
      node,
      x: offsetX + (node.x - minX) * scale,
      y: offsetY + (node.y - minY) * scale,
      radius: 3.4 + degreeRatio * 7.4 + eigen * 2.4
    };
  });
}

function drawPaperNetwork(ctx: CanvasRenderingContext2D, props: {
  width: number;
  height: number;
  nodes: ScreenNode[];
  nodeById: Map<string, ScreenNode>;
  edges: RenderEdge[];
  selectedId: string;
  hoverId: string | null;
  maxAbsGraphValue: number;
  graphMode: GraphMode;
}) {
  ctx.fillStyle = "#f7f9fa";
  ctx.fillRect(0, 0, props.width, props.height);

  const selectedEdgeIds = new Set<string>();
  if (props.selectedId) {
    for (const edge of props.edges) {
      if (edge.source === props.selectedId || edge.target === props.selectedId) selectedEdgeIds.add(`${edge.source}->${edge.target}`);
    }
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const edge of props.edges) {
    const source = props.nodeById.get(edge.source);
    const target = props.nodeById.get(edge.target);
    if (!source || !target) continue;
    const selected = selectedEdgeIds.has(`${edge.source}->${edge.target}`);
    const strength = Math.min(1, Math.abs(edge.value) / props.maxAbsGraphValue);
    const dense = props.graphMode === "full";
    const alpha = dense ? 0.05 + strength * 0.24 : selected ? 0.72 : 0.34 + strength * 0.38;
    const color = edge.value >= 0 ? `rgba(35, 113, 111, ${alpha})` : `rgba(163, 59, 52, ${alpha})`;
    drawDirectedLine(ctx, source, target, color, dense ? 0.45 + strength * 1.3 : 1.2 + strength * 2.4, dense ? 5 + strength * 5 : 7 + strength * 6, edge.mediated);
  }

  const labelNodes = new Set<string>([
    props.selectedId,
    props.hoverId ?? "",
    ...props.nodes
      .filter((item) => props.nodes.length <= 55 || item.node.metrics.outDegree >= 180 || (item.node.metrics.eigenCentrality ?? 0) >= 0.72)
      .map((item) => item.node.id)
      .slice(0, props.graphMode === "full" ? 14 : 24)
  ]);

  for (const item of props.nodes) {
    const selected = item.node.id === props.selectedId;
    const hovered = item.node.id === props.hoverId;
    const degreeRatio = Math.min(1, item.node.metrics.outDegree / 250);
    ctx.beginPath();
    ctx.arc(item.x, item.y, item.radius + (selected ? 4.2 : hovered ? 2.4 : 0), 0, Math.PI * 2);
    ctx.fillStyle = selected ? "#16282c" : hovered ? "#ffffff" : "#ffffff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
    ctx.fillStyle = selected ? "#23716f" : blendColor("#6e7982", "#2f6fa6", degreeRatio);
    ctx.fill();
    ctx.lineWidth = selected || hovered ? 1.8 : 0.7;
    ctx.strokeStyle = selected ? "#16282c" : hovered ? "#202428" : "rgba(255,255,255,0.82)";
    ctx.stroke();
  }

  ctx.font = "700 11px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  for (const item of props.nodes) {
    if (!labelNodes.has(item.node.id)) continue;
    const text = item.node.symbol;
    const x = item.x + item.radius + 4;
    const y = item.y;
    const width = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    roundRect(ctx, x - 3, y - 8, width + 6, 16, 4);
    ctx.fill();
    ctx.fillStyle = item.node.id === props.selectedId ? "#16282c" : "#34414a";
    ctx.fillText(text, x, y);
  }
}

function drawDirectedLine(ctx: CanvasRenderingContext2D, source: ScreenNode, target: ScreenNode, color: string, width: number, arrowSize: number, dashed = false) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / distance;
  const uy = dy / distance;
  const startX = source.x + ux * (source.radius + 1);
  const startY = source.y + uy * (source.radius + 1);
  const endX = target.x - ux * (target.radius + 3);
  const endY = target.y - uy * (target.radius + 3);

  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dashed ? [6, 4] : []);
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.setLineDash([]);

  const angle = Math.atan2(uy, ux);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - Math.cos(angle - Math.PI / 6) * arrowSize, endY - Math.sin(angle - Math.PI / 6) * arrowSize);
  ctx.lineTo(endX - Math.cos(angle + Math.PI / 6) * arrowSize, endY - Math.sin(angle + Math.PI / 6) * arrowSize);
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function defaultInterventionGeneId(study: PaperNetworkStudy): string {
  return study.nodes.find((node) => node.symbol === DEFAULT_INTERVENTION_SYMBOL)?.id
    ?? study.featuredInterventionGenes[0]?.id
    ?? study.summary.topOutDegreeGenes[0]?.id
    ?? study.nodes[0]?.id
    ?? "";
}

function sortEffectRows(left: EffectRow, right: EffectRow, sort: EffectSort): number {
  if (sort === "fdr") {
    return (left.effect.fdr ?? 1) - (right.effect.fdr ?? 1) || Math.abs(right.predicted) - Math.abs(left.predicted);
  }
  if (sort === "ace") return Math.abs(right.effect.ace) - Math.abs(left.effect.ace);
  return Math.abs(right.predicted) - Math.abs(left.predicted);
}

function effectMechanicLabel(effect: PaperNetworkEffect): string {
  const hasDirect = Math.abs(effect.directEffect) > 0;
  if (!hasDirect && effect.pathLength !== null) return `mediated path ${effect.pathLength}`;
  if (!hasDirect) return "no sparse path";
  if (effect.ace * effect.directEffect < 0) return "signs disagree";
  if (effect.effectExplained !== null && effect.effectExplained > 1) return "path cancellation";
  return "direct edge";
}

function directionShare(intervention: PaperNetworkIntervention, direction: "positive" | "negative"): number {
  const total = Math.max(1, intervention.summary.significantPositiveTotalCount + intervention.summary.significantNegativeTotalCount);
  const count = direction === "positive" ? intervention.summary.significantPositiveTotalCount : intervention.summary.significantNegativeTotalCount;
  return Math.max(8, (count / total) * 100);
}

function interventionScore(node: PaperNetworkNode, interventions: Map<string, PaperNetworkIntervention>): number {
  return interventions.get(node.id)?.summary.significantTotalEffectCount ?? 0;
}

function searchRank(node: PaperNetworkNode, query: string): number {
  const symbol = node.symbol.toLowerCase();
  const id = node.id.toLowerCase();
  if (symbol === query || id === query) return 0;
  if (symbol.startsWith(query)) return 1;
  if (id.startsWith(query)) return 2;
  if (symbol.includes(query)) return 3;
  return 4;
}

function blendColor(from: string, to: string, amount: number): string {
  const left = hexToRgb(from);
  const right = hexToRgb(to);
  const clamped = Math.max(0, Math.min(1, amount));
  return `rgb(${Math.round(left.r + (right.r - left.r) * clamped)}, ${Math.round(left.g + (right.g - left.g) * clamped)}, ${Math.round(left.b + (right.b - left.b) * clamped)})`;
}

function hexToRgb(hex: string) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16)
  };
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function formatCount(value: number): string {
  return countFormatter.format(value);
}

function formatNullableCount(value: number | null): string {
  return value === null ? "n/a" : countFormatter.format(value);
}

function formatFixed(value: number, digits: number): string {
  return value.toFixed(digits);
}

function formatSigned(value: number, digits: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatNullable(value: number | null, digits: number): string {
  return value === null ? "n/a" : value.toFixed(digits);
}

function formatSignedNullable(value: number | null, digits: number): string {
  return value === null ? "n/a" : formatSigned(value, digits);
}

function formatPValue(value: number | null): string {
  if (value === null) return "n/a";
  if (value === 0) return "<1e-6";
  if (value < 0.001) return value.toExponential(1);
  return value.toFixed(3);
}

function formatEffectExplained(value: number | null): string {
  if (value === null) return "n/a";
  return `${(value * 100).toFixed(0)}%`;
}
