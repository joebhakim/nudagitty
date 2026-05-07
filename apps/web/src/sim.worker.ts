import { runSimulation } from "@nudagitty/core";
import type { GraphModel, SimulationSpec } from "@nudagitty/core";

self.onmessage = (event: MessageEvent<{ graph: GraphModel; spec: SimulationSpec }>) => {
  self.postMessage(runSimulation(event.data.graph, event.data.spec));
};
