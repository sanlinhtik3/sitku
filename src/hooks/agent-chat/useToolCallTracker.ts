// ═══ Project Titan: Phase 1A - Tool Call Tracker ═══
// Extracts the duplicated tool-call-to-completed-step finalization logic.

import type { CompletedToolStep, ToolCallState } from "./types";
import { TOOL_LABELS, formatToolSummary } from "./types";

export interface FinalizeResult {
  cleared: ToolCallState[];          // Always [] (caller setter resets)
  incompleteTools: string[];         // Tools that were left in "running" state — pipeline crash signal
  failedTools: string[];             // Tools that returned an explicit error
}

/**
 * Finalize completed/errored tool calls into CompletedToolSteps,
 * then return an empty array (clearing active tool calls).
 * Used by step_complete, clear_streaming, and final cleanup.
 *
 * Returns metadata about incomplete/failed tools so the caller can
 * surface an actionable error to the user (instead of silently
 * promoting them to "error" with no UI feedback).
 */
export function finalizeToolCalls(
  toolCalls: ToolCallState[],
  setCompletedToolSteps: React.Dispatch<React.SetStateAction<CompletedToolStep[]>>,
  idPrefix: string = '',
): ToolCallState[] {
  const incompleteTools: string[] = [];
  const failedTools: string[] = [];

  const completed = toolCalls
    .filter(t => t.status === "success" || t.status === "error" || t.status === "running")
    .map((t, i) => {
      const wasIncomplete = t.status === "running";
      if (wasIncomplete) incompleteTools.push(TOOL_LABELS[t.name] || t.name);
      else if (t.status === "error") failedTools.push(TOOL_LABELS[t.name] || t.name);

      return {
        id: `tool_${idPrefix}${Date.now()}_${i}`,
        name: t.name,
        label: TOOL_LABELS[t.name] || t.name,
        status: (wasIncomplete ? "error" : t.status) as "success" | "error",
        summary: wasIncomplete
          ? "⚠️ Tool stopped responding — pipeline interrupted"
          : formatToolSummary(t.name, t.result),
        context: t.context,
        result: t.result,
        timestamp: new Date(),
      };
    });

  if (completed.length > 0) {
    setCompletedToolSteps(prev => [...prev, ...completed]);
  }

  // Stash diagnostic metadata on the returned array so the caller can read it
  // without changing the existing return signature contract.
  const result: ToolCallState[] = [];
  (result as any).__incompleteTools = incompleteTools;
  (result as any).__failedTools = failedTools;
  return result;
}
