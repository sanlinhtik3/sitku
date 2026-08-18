import { analyzeContent } from "./analyzeContent";
import type { ContentAnalysisInput } from "./types";

self.onmessage = (event: MessageEvent<{ id: number; input: ContentAnalysisInput }>) => {
  const { id, input } = event.data;
  try {
    self.postMessage({ id, report: analyzeContent(input) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "Unable to analyze content" });
  }
};
