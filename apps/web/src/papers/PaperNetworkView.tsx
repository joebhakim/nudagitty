import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Search, X } from "lucide-react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type {
  PaperNetworkEffect,
  PaperNetworkNode
} from "./types";
import type {
  CanvasSize,
  EffectRow,
  EffectSort,
  GraphMode,
  PaperNetworkViewProps,
  RenderEdge
} from "./paperNetworkTypes";
import {
  defaultInterventionGeneId,
  directionShare,
  drawPaperNetwork,
  effectMechanicLabel,
  formatCount,
  formatEffectExplained,
  formatFixed,
  formatNullableCount,
  formatPValue,
  formatSigned,
  formatSignedNullable,
  interventionScore,
  projectNodes,
  roundToStep,
  searchRank,
  sortEffectRows
} from "./paperNetworkHelpers";

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
