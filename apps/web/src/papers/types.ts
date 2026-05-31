export type PaperNetworkStudy = {
  id: string;
  title: string;
  subtitle: string;
  citation: string;
  doi: string;
  articleUrl: string;
  dataUrl: string;
  generatedFrom: {
    networkCsv: string;
    geneMetadata: string;
    generatedAt: string;
  };
  methodNotes: string[];
  paperAnchors: PaperNetworkPaperAnchors;
  featuredInterventionGenes: PaperNetworkFeaturedGene[];
  summary: PaperNetworkSummary;
  nodes: PaperNetworkNode[];
  edges: PaperNetworkEdge[];
  interventions: PaperNetworkIntervention[];
};

export type PaperNetworkSummary = {
  nodeCount: number;
  edgeCount: number;
  densityPercent: number;
  positiveEdgeCount: number;
  negativeEdgeCount: number;
  maxAbsEdgeWeight: number;
  fdr5SignificantAceCount: number;
  fdr5SignificantAceCountIncludingSelf: number;
  connectedOrderedPairPercent: number;
  medianPathLengthAllConnectedPairs: number;
  medianPathLengthFdr5Pairs: number;
  medianEffectExplainedByShortestPathFdr5Percent: number;
  shortestPathOver100PercentPairCount: number;
  topOutDegreeGenes: PaperNetworkRankedGene[];
  topEigenCentralityGenes: PaperNetworkRankedGene[];
};

export type PaperNetworkPaperAnchors = {
  significantAceCountIncludingSelf: number;
  inferredGraphEdgeCount: number;
  connectedOrderedPairPercent: number;
  medianConnectedPathLength: number;
  medianFdrSignificantPathLength: number;
  medianShortestPathEffectExplainedPercent: number;
  shortestPathOver100PercentPairCount: number;
  source: string;
};

export type PaperNetworkFeaturedGene = {
  id: string;
  symbol: string;
};

export type PaperNetworkRankedGene = {
  id: string;
  symbol: string;
  outDegree?: number;
  eigenCentrality?: number;
};

export type PaperNetworkNode = {
  id: string;
  symbol: string;
  x: number;
  y: number;
  metrics: PaperNetworkNodeMetrics;
  annotations: PaperNetworkNodeAnnotations;
};

export type PaperNetworkNodeMetrics = {
  guideEffect: number | null;
  guideCorrelation: number | null;
  guideCellCount: number | null;
  meanExpression: number | null;
  stdExpression: number | null;
  coefficientOfVariation: number | null;
  outDegree: number;
  inDegree: number;
  degree: number;
  betweenness: number | null;
  eigenCentrality: number | null;
  proteinInteractors: number | null;
  gnomadPLI: number | null;
  gnomadLOEUF: number | null;
  varianceExplainedIncoming: number | null;
  varianceExplainedByNetwork: number | null;
  genomeWideHeritability: number | null;
  heritabilityFdr: number | null;
};

export type PaperNetworkNodeAnnotations = {
  isTranscriptionFactor: boolean;
  isDiseaseGene: boolean;
  platelets: boolean;
  rbcs: boolean;
  reticulocytes: boolean;
  wbcs: boolean;
};

export type PaperNetworkEdge = {
  source: string;
  target: string;
  weight: number;
  ace: number;
  se: number | null;
  fdr: number | null;
  z: number | null;
  pathLength: number | null;
  pathEffect: number | null;
  effectExplained: number | null;
  scaledPathEffect: number | null;
};

export type PaperNetworkIntervention = {
  exposure: string;
  summary: PaperNetworkInterventionSummary;
  mechanics: PaperNetworkMechanicsExamples;
  effects: PaperNetworkEffect[];
};

export type PaperNetworkInterventionSummary = {
  significantTotalEffectCount: number;
  nonzeroDirectEdgeCount: number;
  significantDirectEffectCount: number;
  significantMediatedEffectCount: number;
  significantNoPathEffectCount: number;
  significantPositiveTotalCount: number;
  significantNegativeTotalCount: number;
  signDisagreementCount: number;
  lowPathExplanationCount: number;
  pathCancellationCount: number;
  storedEffectCount: number;
  maxAbsStoredPredictedGuideChange: number | null;
};

export type PaperNetworkMechanicsExamples = {
  directAgreement: PaperNetworkEffect | null;
  mediatedOnly: PaperNetworkEffect | null;
  signDisagreement: PaperNetworkEffect | null;
  lowPathExplanation: PaperNetworkEffect | null;
  pathCancellation: PaperNetworkEffect | null;
};

export type PaperNetworkEffect = {
  outcome: string;
  ace: number;
  se: number | null;
  fdr: number | null;
  z: number | null;
  directEffect: number;
  pathLength: number | null;
  pathEffect: number | null;
  effectExplained: number | null;
  scaledPathEffect: number | null;
};
