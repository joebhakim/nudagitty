import { analyzeGraph } from "@nudagitty/core";
import type { GraphModel } from "@nudagitty/core";

self.onmessage = (event: MessageEvent<GraphModel>) => {
  self.postMessage(analyzeGraph(event.data));
};
