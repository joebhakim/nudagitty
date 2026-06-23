import { create } from "zustand";
import {
  EXAMPLES,
  cloneDocument,
  serializeModel,
  withGraph
} from "@nudagitty/core";
import type {
  EffectKind,
  GraphDocument,
  GraphModel,
  ViewMode
} from "@nudagitty/core";
import type { WorkbenchMode } from "../shared/workbench";
import { loadInitialWorkbenchState } from "../shared/appState";
import type { BibliographyTopic, Selection, ToolMode } from "../shared/appState";
import { defaultScatterPair, reconcileScatterPair } from "../shared/pairs";
import type { ScatterPair } from "../shared/pairs";

type ScatterPairUpdater = ScatterPair | ((pair: ScatterPair) => ScatterPair);

type WorkbenchStore = {
  document: GraphDocument;
  history: GraphDocument[];
  future: GraphDocument[];
  selection: Selection;
  tool: ToolMode;
  edgeSource: string | null;
  viewMode: ViewMode;
  effectKind: EffectKind;
  bibliographyTopic: BibliographyTopic;
  showCausal: boolean;
  showBiasing: boolean;
  showAncestors: boolean;
  workbenchMode: WorkbenchMode;
  basicResultsOpen: boolean;
  activeExampleId: string | null;
  modelText: string;
  modelDirty: boolean;
  scatterPair: ScatterPair;
  commit: (next: GraphDocument) => void;
  undo: () => void;
  redo: () => void;
  replaceGraph: (graph: GraphModel) => void;
  setSelection: (selection: Selection | ((selection: Selection) => Selection)) => void;
  setTool: (tool: ToolMode) => void;
  setEdgeSource: (nodeId: string | null) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setEffectKind: (effectKind: EffectKind) => void;
  setBibliographyTopic: (topic: BibliographyTopic) => void;
  setShowCausal: (show: boolean) => void;
  setShowBiasing: (show: boolean) => void;
  setShowAncestors: (show: boolean) => void;
  setWorkbenchMode: (mode: WorkbenchMode) => void;
  setBasicResultsOpen: (open: boolean) => void;
  setActiveExampleId: (id: string | null) => void;
  setModelText: (text: string) => void;
  setModelDirty: (dirty: boolean) => void;
  setScatterPair: (pair: ScatterPairUpdater) => void;
};

function commitState(state: WorkbenchStore, next: GraphDocument): Partial<WorkbenchStore> {
  return {
    history: [...state.history.slice(-80), cloneDocument(state.document)],
    future: [],
    document: next,
    modelText: serializeModel(next),
    modelDirty: false,
    scatterPair: reconcileScatterPair(next.graph, state.scatterPair)
  };
}

const initialState = loadInitialWorkbenchState();
const initialDocument = initialState.document;

export const useWorkbenchStore = create<WorkbenchStore>((set, get) => ({
  document: initialDocument,
  history: [],
  future: [],
  selection: null,
  tool: "select",
  edgeSource: null,
  viewMode: "normal",
  effectKind: "total",
  bibliographyTopic: "sem",
  showCausal: true,
  showBiasing: true,
  showAncestors: true,
  // Demo (basic) mode is hidden for now — default to pro; the toggle is not rendered.
  workbenchMode: "pro",
  basicResultsOpen: true,
  activeExampleId: initialState.activeExampleId,
  modelText: serializeModel(initialDocument),
  modelDirty: false,
  scatterPair: defaultScatterPair(initialDocument.graph),
  commit: (next) => set((state) => commitState(state, next)),
  undo: () => set((state) => {
    const previous = state.history.at(-1);
    if (!previous) return {};
    return {
      history: state.history.slice(0, -1),
      future: [cloneDocument(state.document), ...state.future],
      document: previous,
      modelText: serializeModel(previous),
      modelDirty: false,
      scatterPair: reconcileScatterPair(previous.graph, state.scatterPair)
    };
  }),
  redo: () => set((state) => {
    const next = state.future[0];
    if (!next) return {};
    return {
      history: [...state.history, cloneDocument(state.document)],
      future: state.future.slice(1),
      document: next,
      modelText: serializeModel(next),
      modelDirty: false,
      scatterPair: reconcileScatterPair(next.graph, state.scatterPair)
    };
  }),
  replaceGraph: (graph) => {
    const current = get().document;
    get().commit(withGraph(current, graph));
  },
  setSelection: (selection) => set((state) => ({
    selection: typeof selection === "function" ? selection(state.selection) : selection
  })),
  setTool: (tool) => set({ tool }),
  setEdgeSource: (edgeSource) => set({ edgeSource }),
  setViewMode: (viewMode) => set({ viewMode }),
  setEffectKind: (effectKind) => set({ effectKind }),
  setBibliographyTopic: (bibliographyTopic) => set({ bibliographyTopic }),
  setShowCausal: (showCausal) => set({ showCausal }),
  setShowBiasing: (showBiasing) => set({ showBiasing }),
  setShowAncestors: (showAncestors) => set({ showAncestors }),
  setWorkbenchMode: (workbenchMode) => set({ workbenchMode }),
  setBasicResultsOpen: (basicResultsOpen) => set({ basicResultsOpen }),
  setActiveExampleId: (activeExampleId) => set({ activeExampleId }),
  setModelText: (modelText) => set({ modelText }),
  setModelDirty: (modelDirty) => set({ modelDirty }),
  setScatterPair: (pair) => set((state) => ({
    scatterPair: typeof pair === "function" ? pair(state.scatterPair) : pair
  }))
}));
