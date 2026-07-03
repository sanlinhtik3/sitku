// ═══ Tool Execution Engine Module — Extracted from agentic-loop.ts ═══
// Tool tier classification, parallel/sequential execution, circuit breaker, forensic logging, pipeline integrity.
// Phase C: Tool Risk Classification integrated — HIGH risk tools get extra logging

import { executeTool, formatToolName, formatToolResult, updateLearningContext } from "./tool-executor.ts";
import { emitThinking, TOOL_THINKING_STEPS } from "./streaming-engine.ts";
import { verifyToolResultIntegrity } from "./bee-brain.ts";
import {
  getToolTier, checkAllowlist, shouldAutoExecute, hasExplicitCommand,
  savePendingAction, clearPendingAction, generateConfirmationPrompt,
} from "./consent-guard.ts";
import type { PendingAction, ToolPermission, RequestContext } from "./consent-guard.ts";
import type { ToolCallWithMetadata } from "./llm-stream-parser.ts";
import { sanitizeToolResultContent } from "./sanitizer.ts";
import { getToolRiskLevel } from "./tool-definitions.ts";
import type { ToolRiskLevel } from "./tool-definitions.ts";
// Phase 1.5 of docs/AGENTIC_AUDIT.md — per-tool-call observability.
// Fire-and-forget; never throws.
import { logToolCall, estimateResultSize } from "./tool-call-tracer.ts";
import { emitToolCalled } from "./session-events.ts";

export interface ToolExecutionContext {
  supabase: any;
  serviceClient: any;
  userId: string;
  sessionId: string;
  missionId: string;
  authHeader: string;
  source_channel: string | null;
  isAdmin: boolean;
  deviceContext: any;
  groupContext: any;
  agentSettings: any;
  userPermissions: ToolPermission[];
  userStrictMode: boolean;
  isUsingPersonalKey: boolean;
  userAISettings: any;
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
  step: number;
  MAX_AGENT_STEPS: number;
  STEP_TIMEOUT_MS: number;
  TOOL_TIMEOUT_MS: number;
  IMAGE_TOOL_TIMEOUT_MS: number;
  LONG_RUNNING_TOOLS: string[];
  safeEnqueue: (data: Uint8Array) => boolean;
}

export interface ToolExecutionResult {
  stepToolResults: { name: string; result: any; error?: string }[];
  imageGenerationCompleted: boolean;
  lastGeneratedImageUrl: string | null;
  shouldBreak: boolean;
  breakContent?: string;
  dataSparseTriggered: boolean;
  thinkingStepsUpdates: { toolName: string; status: "done" | "error"; detail: string }[];
}

export interface MutableToolState {
  completedImagePrompts: Set<string>;
  imageGenerationCompleted: boolean;
  lastGeneratedImageUrl: string | null;
  disabledToolsSet: Set<string>;
  toolFailureCounter: Record<string, number>;
  CIRCUIT_BREAKER_THRESHOLD: number;
}

/**
 * Deduplicate tool calls (image dedup guard).
 */
export function deduplicateToolCalls(
  stepToolCalls: ToolCallWithMetadata[],
  state: MutableToolState,
  safeEnqueue: (data: Uint8Array) => boolean,
  encoder: TextEncoder,
  controller: ReadableStreamDefaultController,
): { dedupedCalls: ToolCallWithMetadata[]; earlyResults: { name: string; result: any; error?: string }[] } {
  const earlyResults: { name: string; result: any; error?: string }[] = [];
  const dedupedCalls = stepToolCalls.filter((tool: any) => {
    if (tool.name === 'generate_image') {
      if (state.imageGenerationCompleted) {
        console.warn(`[ImageCap] Blocked generate_image — already completed this turn`);
        earlyResults.push({ name: tool.name, result: { success: true, skipped: true, message: "Image already generated this turn" } });
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_result", name: tool.name, result: { success: true, skipped: true, message: "Image already generated" } })}\n\n`)); } catch {}
        return false;
      }
      const promptKey = (tool.arguments?.prompt || '').slice(0, 100).toLowerCase();
      if (promptKey && state.completedImagePrompts.has(promptKey)) {
        console.warn(`[ImageDedup] Skipping duplicate generate_image call for prompt: "${promptKey.slice(0, 50)}..."`);
        earlyResults.push({ name: tool.name, result: { success: true, skipped: true, message: "Image already generated for this prompt" } });
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_result", name: tool.name, result: { success: true, skipped: true, message: "Image already generated" } })}\n\n`));
        return false;
      }
    }
    return true;
  });
  return { dedupedCalls, earlyResults };
}

/**
 * Execute auto (Tier 1-2) tools in parallel with timeouts and forensic logging.
 */
export async function executeAutoTools(
  ctx: ToolExecutionContext,
  autoTools: { tool: ToolCallWithMetadata; tier: number; action: string | undefined }[],
  state: MutableToolState,
): Promise<{ name: string; result: any; error?: string }[]> {
  const { supabase, serviceClient, userId, missionId, isAdmin, authHeader, deviceContext, source_channel, groupContext, controller, encoder, step, isUsingPersonalKey, userAISettings, safeEnqueue, TOOL_TIMEOUT_MS, IMAGE_TOOL_TIMEOUT_MS, LONG_RUNNING_TOOLS, STEP_TIMEOUT_MS, sessionId } = ctx;
  
  const stepToolResults: { name: string; result: any; error?: string }[] = [];

  // Filter disabled tools
  const filteredAutoTools = autoTools.filter(ct => {
    if (state.disabledToolsSet.has(ct.tool.name)) {
      console.warn(`[CircuitBreaker] Skipping disabled tool: ${ct.tool.name}`);
      const cbError = `Tool disabled by circuit breaker (${state.CIRCUIT_BREAKER_THRESHOLD}+ consecutive failures)`;
      stepToolResults.push({ name: ct.tool.name, result: { error: cbError, _nonRetryable: true } });
      safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_result", name: ct.tool.name, error: cbError })}\n\n`));
      return false;
    }
    return true;
  });

  if (filteredAutoTools.length === 0) return stepToolResults;

  console.log(`[Agent] Tool batch: ${filteredAutoTools.length} auto (parallel)${state.disabledToolsSet.size > 0 ? `, ${state.disabledToolsSet.size} disabled` : ''}`);

  const stepDeadline = Date.now() + STEP_TIMEOUT_MS;
  const toolPulseStartTime = Date.now();
  const completedToolNamesArr: string[] = [];
  const toolPulseInterval = setInterval(() => {
    try {
      const elapsed = Math.round((Date.now() - toolPulseStartTime) / 1000);
      const runningNames = filteredAutoTools.map(t => t.tool.name).filter(n => !completedToolNamesArr.includes(n));
      safeEnqueue(encoder.encode(`data: ${JSON.stringify({
        type: "thinking_pulse",
        elapsed_s: elapsed,
        running: runningNames,
        completed: completedToolNamesArr,
        message: `Still working... (${elapsed}s) — ${runningNames.length} tool${runningNames.length > 1 ? 's' : ''} running`
      })}\n\n`));
    } catch { /* stream closed */ }
  }, 10_000);

  const forensicBatch: any[] = [];

  const parallelResults = await Promise.allSettled(
    filteredAutoTools.map(async ({ tool, tier }, toolIndex) => {
      // Forensic logging consolidated — single entry per tool (no pre-entries)

      if (Date.now() > stepDeadline) {
        throw new Error(`Step timeout exceeded (${STEP_TIMEOUT_MS}ms)`);
      }

      console.log(`[Agent] Executing tool (parallel): ${tool.name}`, tool.arguments);

      // Phase C: Risk classification logging
      const riskLevel = getToolRiskLevel(tool.name, tool.arguments?.action);
      if (riskLevel === 'HIGH') {
        console.warn(`[RiskGuard] HIGH-risk tool execution: ${tool.name}.${tool.arguments?.action || '*'}`);
      }

      if (tier === 2) {
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_tier", name: tool.name, tier: 2, action: tool.arguments?.action })}\n\n`));
      }

      const toolPromise = executeTool(supabase, userId, tool.name, tool.arguments, isAdmin, authHeader, { timezone: deviceContext?.timezone, effectiveNowMs: (deviceContext as any)?.effectiveNowMs, driftMs: (deviceContext as any)?.driftMs, sessionId, sourceChannel: source_channel || 'web', groupContext, writer: controller, encoder, isUsingPersonalKey, userAISettings, agentSettings, serviceClient });
      const effectiveTimeout = LONG_RUNNING_TOOLS.includes(tool.name) ? IMAGE_TOOL_TIMEOUT_MS : TOOL_TIMEOUT_MS;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Tool '${tool.name}' timed out after ${effectiveTimeout}ms`)), effectiveTimeout)
      );
      const toolExecStart = Date.now();
      let result: any;
      let tracedStatus: "success" | "error" | "timeout" = "success";
      let tracedError: string | null = null;
      try {
        result = await Promise.race([toolPromise, timeoutPromise]) as any;
        if (result?.error) {
          tracedStatus = "error";
          tracedError = String(result.error).slice(0, 500);
        }
      } catch (raceErr: any) {
        const msg = raceErr?.message || "Unknown error";
        tracedStatus = msg.includes("timed out") ? "timeout" : "error";
        tracedError = String(msg).slice(0, 500);
        // Log before re-throwing so Promise.allSettled still rejects as before.
        logToolCall({
          serviceClient, userId, sessionId, missionId, step,
          toolName: tool.name, toolAction: tool.arguments?.action ?? null,
          riskLevel, tier, args: tool.arguments, status: tracedStatus,
          errorMessage: tracedError, latencyMs: Date.now() - toolExecStart,
          resultSize: 0, startedAt: new Date(toolExecStart),
        }).catch(() => {});
        emitToolCalled(serviceClient, userId, sessionId, {
          name: tool.name, status: tracedStatus, latency_ms: Date.now() - toolExecStart,
        });
        throw raceErr;
      }
      const toolExecDuration = Date.now() - toolExecStart;
      // Successful (or result.error) — log once with final status.
      logToolCall({
        serviceClient, userId, sessionId, missionId, step,
        toolName: tool.name, toolAction: tool.arguments?.action ?? null,
        riskLevel, tier, args: tool.arguments, status: tracedStatus,
        errorMessage: tracedError, latencyMs: toolExecDuration,
        resultSize: estimateResultSize(result), startedAt: new Date(toolExecStart),
      }).catch(() => {});
      emitToolCalled(serviceClient, userId, sessionId, {
        name: tool.name, status: tracedStatus, latency_ms: toolExecDuration,
      });

      // ═══ PAYLOAD CAP: Prevent oversized tool results from crashing the pipeline ═══
      // Truncate any string fields > 50KB to prevent context window overflow and SSE bloat.
      const TOOL_RESULT_MAX_CHARS = 50_000;
      if (result && typeof result === 'object') {
        for (const [key, val] of Object.entries(result)) {
          if (typeof val === 'string' && val.length > TOOL_RESULT_MAX_CHARS) {
            (result as any)[key] = val.slice(0, TOOL_RESULT_MAX_CHARS) + `\n[...truncated from ${val.length} chars to ${TOOL_RESULT_MAX_CHARS}]`;
            console.warn(`[PayloadCap] Tool "${tool.name}" field "${key}" truncated: ${val.length} → ${TOOL_RESULT_MAX_CHARS} chars`);
          }
        }
      } else if (typeof result === 'string' && result.length > TOOL_RESULT_MAX_CHARS) {
        result = result.slice(0, TOOL_RESULT_MAX_CHARS) + `\n[...truncated from ${result.length} chars to ${TOOL_RESULT_MAX_CHARS}]`;
        console.warn(`[PayloadCap] Tool "${tool.name}" string result truncated: ${result.length} → ${TOOL_RESULT_MAX_CHARS} chars`);
      }

      // ═══ CONSOLIDATED forensic entry: one per tool (reuse riskLevel from L154) ═══
      const riskTag = riskLevel;
      forensicBatch.push({
        requester_agent_id: userId,
        query_type: "audit_tool_executed",
        query_content: `[MISSION ${missionId}] Tool: ${tool.name} (${toolExecDuration}ms) → ${result?.error ? 'FAIL' : 'OK'} [RISK:${riskTag}]`,
        target_type: ['search_web', 'browser_search', 'browser_scrape', 'browser_map'].includes(tool.name) ? "recon" : "system",
        was_successful: !result?.error,
        metadata: {
          mission_id: missionId, tool_name: tool.name, duration_ms: toolExecDuration,
          status: result?.error ? 'error' : 'success',
          result_preview: JSON.stringify(result).substring(0, 200),
          step: step,
          data_points: result?.results?.length || 0,
          risk_level: riskTag,
        },
      });

      completedToolNamesArr.push(tool.name);

      const enrichedResult = tier === 2 ? { ...result, tier: 2 } : result;
      return { name: tool.name, result: enrichedResult, tier };
    })
  );

  clearInterval(toolPulseInterval);

  // Forensic batch flush — DECOMMISSIONED for hot path performance.
  // Per-tool audit rows removed; integrity violations still tracked below.
  void forensicBatch;

  for (let i = 0; i < parallelResults.length; i++) {
    const settled = parallelResults[i]; 
    const { tool } = filteredAutoTools[i];

    if (settled.status === "fulfilled") {
      const { name, result, tier } = settled.value;
      stepToolResults.push({ name, result });
      // Sanitize string fields in tool results before SSE stream (defense in depth)
      const sanitizedResult = result && typeof result === 'object'
        ? Object.fromEntries(Object.entries(result).map(([k, v]) => [k, typeof v === 'string' ? sanitizeToolResultContent(v) : v]))
        : (typeof result === 'string' ? sanitizeToolResultContent(result) : result);
      safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_result", name, result: sanitizedResult, call_id: tool.id || undefined })}\n\n`));

      if (name === 'generate_image' && result?.success) {
        const imgPromptKey = (autoTools.find(t => t.tool.name === 'generate_image')?.tool.arguments?.prompt || '').slice(0, 100).toLowerCase();
        if (imgPromptKey) state.completedImagePrompts.add(imgPromptKey);
        state.imageGenerationCompleted = true;
        if (result.image_url) state.lastGeneratedImageUrl = result.image_url;
        console.log(`[ImageDedup] Image generation completed — future calls blocked`);
      }

      if (tier >= 2 && result && !result.error) {
        await clearPendingAction(supabase, sessionId);
      }
      updateLearningContext(supabase, userId, name, !!(result && !result.error)).catch(e => console.warn('[Audit] Learning context update failed:', e?.message));
    } else {
      const errorMsg = settled.reason?.message || "Unknown error";
      console.error(`[Agent] Parallel tool error (${tool.name}):`, errorMsg);
      stepToolResults.push({ name: tool.name, result: null, error: errorMsg });
      safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_result", name: tool.name, error: errorMsg })}\n\n`));
    }
  }

  // Pipeline Integrity verification
  for (const tr of stepToolResults) {
    const integrity = verifyToolResultIntegrity(tr.name, tr.result, !!tr.error);
    if (!integrity.isValid) {
      console.warn(`[PipelineIntegrity] Violations for ${tr.name}:`, integrity.violations);
      Promise.resolve(serviceClient.from("agent_communication_log").insert({
        requester_agent_id: userId,
        target_type: "integrity_check",
        query_type: "integrity_violation",
        query_content: `Tool: ${tr.name}`,
        response_summary: integrity.violations.join('; ').slice(0, 500),
        was_successful: false,
        metadata: { violations: integrity.violations, data_sparse: integrity.dataSparse },
      })).catch(e => console.warn('[Audit] Integrity violation write failed:', e?.message));
    }
    if (integrity.dataSparse && !tr.error) {
      (tr as any)._dataSparse = true;
      console.log(`[PipelineIntegrity] data_sparse flag set for ${tr.name}`);
    }
  }

  return stepToolResults;
}

/**
 * Execute Tier 3 (confirm) tools sequentially.
 */
export async function executeConfirmTools(
  ctx: ToolExecutionContext,
  confirmTools: { tool: ToolCallWithMetadata; tier: number; action: string | undefined }[],
  state: MutableToolState,
  requestContext: RequestContext,
): Promise<{ results: { name: string; result: any; error?: string }[]; shouldBreak: boolean; breakContent?: string }> {
  const { supabase, userId, sessionId, missionId, isAdmin, authHeader, deviceContext, source_channel, groupContext, controller, encoder, step, isUsingPersonalKey, userAISettings, safeEnqueue, agentSettings, serviceClient, TOOL_TIMEOUT_MS, IMAGE_TOOL_TIMEOUT_MS, LONG_RUNNING_TOOLS } = ctx;
  
  const stepToolResults: { name: string; result: any; error?: string }[] = [];
  let shouldBreak = false;
  let breakContent: string | undefined;

  // Filter disabled
  const filteredConfirmTools = confirmTools.filter(ct => {
    if (state.disabledToolsSet.has(ct.tool.name)) {
      console.warn(`[CircuitBreaker] Skipping disabled confirm tool: ${ct.tool.name}`);
      stepToolResults.push({ name: ct.tool.name, result: { error: `Tool disabled by circuit breaker` } });
      safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_result", name: ct.tool.name, error: "Circuit breaker: tool disabled" })}\n\n`));
      return false;
    }
    return true;
  });

  for (const { tool, tier, action } of filteredConfirmTools) {
    try {
      console.log(`[Agent] Executing tool (sequential/confirm): ${tool.name}`, tool.arguments);
      const allowlistResult = checkAllowlist(ctx.userPermissions, tool.name, action || "*");

      if (allowlistResult === "deny") {
        console.log(`[Agent] DENIED by allowlist: ${tool.name}.${action}`);
        stepToolResults.push({ name: tool.name, result: { error: "Action denied by your permission settings." } });
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_result", name: tool.name, result: { error: "Denied by permission settings" } })}\n\n`));
        continue;
      }

      if (allowlistResult === "allow") {
        console.log(`[Agent] ALLOWED by allowlist (Tier 3→2): ${tool.name}.${action}`);
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_tier", name: tool.name, tier: 2, action })}\n\n`));
      } else {
        if (shouldAutoExecute(requestContext.lastUserMessage, tool.name, tool.arguments)) {
          console.log(`[Agent] SMART AUTO-EXECUTE: ${tool.name}.${action}`);
        } else if (!hasExplicitCommand(requestContext.lastUserMessage, tool.name, action)) {
          console.log(`[Agent] BLOCKED Tier 3: ${tool.name}.${action} - asking confirmation`);
          const botEmoji = agentSettings?.bot_emoji || "🐝";
          const confirmMsg = generateConfirmationPrompt(tool.name, tool.arguments, botEmoji);

          const pendingActionToSave: PendingAction = {
            tool: tool.name, action: action || '*',
            args: tool.arguments, asked_at: new Date().toISOString(),
            confirmation_prompt: confirmMsg,
          };
          await savePendingAction(supabase, sessionId, pendingActionToSave);

          stepToolResults.push({
            name: tool.name,
            result: { needs_confirmation: true, message: confirmMsg, pending_action: action, pending_args: tool.arguments, tier: 3, }
          });
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({
            type: "tool_result", name: tool.name,
            result: { needs_confirmation: true, message: confirmMsg, tier: 3 }
          })}\n\n`));

          breakContent = confirmMsg;
          shouldBreak = true;
          console.log(`[Agent] BREAK: Tier 3 confirmation needed for ${tool.name}.${action}`);
          break;
        }
      }

      // Execute the Tier 3 tool (approved)
      const toolSteps = TOOL_THINKING_STEPS[tool.name];
      if (toolSteps) {
        emitThinking(controller, encoder, toolSteps.before, step, ctx.MAX_AGENT_STEPS);
      }

      const toolPromise3 = executeTool(supabase, userId, tool.name, tool.arguments, isAdmin, authHeader, { timezone: deviceContext?.timezone, effectiveNowMs: (deviceContext as any)?.effectiveNowMs, driftMs: (deviceContext as any)?.driftMs, sessionId, sourceChannel: source_channel || 'web', groupContext, writer: controller, encoder, isUsingPersonalKey, userAISettings, agentSettings, serviceClient });
      const effectiveTimeout3 = LONG_RUNNING_TOOLS.includes(tool.name) ? IMAGE_TOOL_TIMEOUT_MS : TOOL_TIMEOUT_MS;
      const timeoutPromise3 = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Tool '${tool.name}' timed out after ${effectiveTimeout3}ms`)), effectiveTimeout3)
      );
      // Phase 1.5 — tracing for Tier-3 sequential path.
      const seqRiskLevel = getToolRiskLevel(tool.name, tool.arguments?.action);
      const seqStart = Date.now();
      let result: any;
      let seqTracedStatus: "success" | "error" | "timeout" = "success";
      let seqTracedError: string | null = null;
      try {
        result = await Promise.race([toolPromise3, timeoutPromise3]) as any;
        if (result?.error) {
          seqTracedStatus = "error";
          seqTracedError = String(result.error).slice(0, 500);
        }
      } catch (seqErr: any) {
        const msg = seqErr?.message || "Unknown error";
        seqTracedStatus = msg.includes("timed out") ? "timeout" : "error";
        seqTracedError = String(msg).slice(0, 500);
        logToolCall({
          serviceClient, userId, sessionId, missionId, step,
          toolName: tool.name, toolAction: action ?? null,
          riskLevel: seqRiskLevel, tier, args: tool.arguments,
          status: seqTracedStatus, errorMessage: seqTracedError,
          latencyMs: Date.now() - seqStart, resultSize: 0,
          startedAt: new Date(seqStart),
        }).catch(() => {});
        throw seqErr; // preserve existing outer catch at L~391
      }
      logToolCall({
        serviceClient, userId, sessionId, missionId, step,
        toolName: tool.name, toolAction: action ?? null,
        riskLevel: seqRiskLevel, tier, args: tool.arguments,
        status: seqTracedStatus, errorMessage: seqTracedError,
        latencyMs: Date.now() - seqStart, resultSize: estimateResultSize(result),
        startedAt: new Date(seqStart),
      }).catch(() => {});

      // Autonomous Job Trigger
      if (result?.job_id) {
        console.log(`[Autonomous] Detected job_id ${result.job_id} in tool result (Tier 3), emitting SSE event`);
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "autonomous_job", jobId: result.job_id })}\n\n`));
      }

      if (toolSteps) {
        emitThinking(controller, encoder, toolSteps.after, step, ctx.MAX_AGENT_STEPS);
      }

      const enrichedResult = { ...result, tier: 2 };
      stepToolResults.push({ name: tool.name, result: enrichedResult });
      // Sanitize string fields in confirmed tool results before SSE stream (defense in depth)
      const sanitizedEnriched = Object.fromEntries(Object.entries(enrichedResult).map(([k, v]) => [k, typeof v === 'string' ? sanitizeToolResultContent(v) : v]));
      safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_result", name: tool.name, result: sanitizedEnriched, call_id: tool.id || undefined })}\n\n`));

      // Tier 3 forensic audit — DECOMMISSIONED for hot path performance.
      // Confirmed-action telemetry now captured by agent_telemetry_spans.

      if (tool.name === 'generate_image' && result?.success) {
        const imgPromptKey = (tool.arguments?.prompt || '').slice(0, 100).toLowerCase();
        if (imgPromptKey) state.completedImagePrompts.add(imgPromptKey);
        state.imageGenerationCompleted = true;
        if (result.image_url) state.lastGeneratedImageUrl = result.image_url;
        console.log(`[ImageDedup] Sequential image generation completed — future calls blocked`);
      }

      if (tier >= 2 && result && !result.error) {
        await clearPendingAction(supabase, sessionId);
      }
      updateLearningContext(supabase, userId, tool.name, !!(result && !result.error)).catch(e => console.warn('[Audit] Learning context update failed:', e?.message));
    } catch (error: any) {
      console.error(`[Agent] Tool error:`, error);
      stepToolResults.push({ name: tool.name, result: null, error: error.message });
      safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_result", name: tool.name, error: error.message })}\n\n`));
    }
  }

  return { results: stepToolResults, shouldBreak, breakContent };
}

/**
 * Update circuit breaker state after tool execution.
 */
export function updateCircuitBreaker(
  stepToolResults: { name: string; result: any; error?: string }[],
  state: MutableToolState,
): string[] {
  const newlyTripped: string[] = [];
  for (const tr of stepToolResults) {
    const isFail = tr.error || tr.result?.error || tr.result?.success === false;
    if (isFail) {
      state.toolFailureCounter[tr.name] = (state.toolFailureCounter[tr.name] || 0) + 1;
      if (state.toolFailureCounter[tr.name] >= state.CIRCUIT_BREAKER_THRESHOLD) {
        if (!state.disabledToolsSet.has(tr.name)) {
          state.disabledToolsSet.add(tr.name);
          newlyTripped.push(tr.name);
        }
      }
    } else {
      state.toolFailureCounter[tr.name] = 0;
    }
  }
  return newlyTripped;
}

/**
 * Extract human-readable context from tool arguments for live streaming.
 */
export function getToolContext(toolName: string, rawArgs: string): string | null {
  try {
    let args: Record<string, any>;
    if (typeof rawArgs === 'string') {
      try { args = JSON.parse(rawArgs); } catch { args = {}; }
    } else {
      args = rawArgs as any || {};
    }
    switch (toolName) {
      case 'search_web':
      case 'browser_search':
      case 'search_web_deep':
        return args.query ? `Searching: ${String(args.query).slice(0, 80)}` : null;
      case 'browser_scrape':
      case 'browser_read_page':
        return args.url ? `Reading: ${String(args.url).slice(0, 80)}` : null;
      case 'spawn_sub_agent':
        return args.task ? `Sub-Agent: ${String(args.task).slice(0, 80)}` : null;
      case 'spawn_parallel_swarm':
        return args.tasks ? `Swarm: ${args.tasks.length} parallel agents` : null;
      case 'generate_image':
        return args.prompt ? `Generating: ${String(args.prompt).slice(0, 60)}` : null;
      case 'generate_ai_content':
        return args.prompt ? `Writing: ${String(args.prompt).slice(0, 60)}` : null;
      case 'search_knowledge_base':
        return args.query ? `Knowledge: ${String(args.query).slice(0, 80)}` : null;
      case 'manage_flowstate':
        return args.action ? `FlowState: ${args.action}${args.amount ? ` ${args.amount}` : ''}` : null;
      case 'manage_workspace_task':
        return args.action ? `Task: ${args.action}${args.title ? ` — ${String(args.title).slice(0, 40)}` : ''}` : null;
      case 'manage_ai_content':
        return args.action ? `Content: ${args.action}` : null;
      case 'get_user_info':
        return args.info_type ? `Info: ${args.info_type}` : null;
      case 'recall_episodic_memory':
      case 'search_user_memories':
        return args.query ? `Remembering: ${String(args.query).slice(0, 60)}` : null;
      case 'recall_session_history':
        return args.query ? `Searching past chats: ${String(args.query).slice(0, 60)}` : null;
      case 'remember_user_fact':
      case 'save_user_fact':
        return args.fact ? `Saving: ${String(args.fact).slice(0, 60)}` : null;
      default:
        return args.action ? String(args.action) : null;
    }
  } catch {
    return null;
  }
}
