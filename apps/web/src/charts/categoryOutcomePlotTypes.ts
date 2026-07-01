export type ScatterPoint = { x: number; y: number; weight: number; index: number };

export type CategoryOutcomeKind = "binary" | "continuous";

export type CategoryOutcomeSummary = {
  group: 0 | 1;
  label: string;
  tone: "treated" | "untreated";
  mean: number | null;
  lower: number | null;
  upper: number | null;
  nEff: number | null;
  points: ScatterPoint[];
};

export type RiskBin = {
  center: number;
  mean: number;
  lower: number | null;
  upper: number | null;
  nEff: number | null;
  weight: number;
  loEdge: number;
  hiEdge: number | null; // null marks the open-ended top band ("x+")
};
