import type {
  PaperNetworkEffect,
  PaperNetworkNode,
  PaperNetworkStudy
} from "./types";

export type PaperNetworkViewProps = {
  study: PaperNetworkStudy;
  onClose: () => void;
};

export type CanvasSize = { width: number; height: number };
export type ScreenNode = { node: PaperNetworkNode; x: number; y: number; radius: number };
export type GraphMode = "total" | "direct" | "full";
export type EffectSort = "predicted" | "ace" | "fdr";
export type RenderEdge = {
  source: string;
  target: string;
  value: number;
  kind: "total" | "direct";
  directEffect?: number;
  fdr?: number | null;
  mediated?: boolean;
};
export type EffectRow = {
  effect: PaperNetworkEffect;
  outcome: PaperNetworkNode | undefined;
  predicted: number;
};
