import type { ComponentType } from "react";

/**
 * Common props every tool renderer accepts. The renderer reads `result` (typed
 * loosely because the backend payload shape differs per tool) and renders an
 * inline preview that fits in a chat bubble.
 */
export interface ToolRendererProps {
  /** Tool name as emitted by the agent (e.g. `search_web`, `generate_image`). */
  name: string;
  /** Status of this specific tool call. */
  status: "pending" | "running" | "success" | "error";
  /** Raw result object returned by the tool (or `undefined` while running). */
  result?: unknown;
  /** Optional structured arguments the tool was invoked with. Used for status text. */
  args?: Record<string, unknown>;
  /** When `true`, the renderer should produce a compact inline summary. When `false`,
   *  it can produce a richer expanded view. Defaults to compact. */
  compact?: boolean;
}

export type ToolRenderer = ComponentType<ToolRendererProps>;
