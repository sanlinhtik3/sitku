// ═══ v19.0.0: Agentic Loop Orchestrator — Project Genesis + P0/P1 Upgrades ═══
// Decomposed into 5 dedicated modules + Plan Generator + Active Memory.
// P0: Tool Result Cache, Structured Output Enforcement
// P1: Error Recovery Checkpoints, Dynamic Plan Revision, Adaptive Context
// Modules: pdf-extractor, llm-stream-parser, tool-execution-engine, guard-pipeline-runner, loop-context-manager

import { generateFallbackResponse, formatToolName, formatToolResult, updateLearningContext } from "./tool-executor.ts";
import { OPENROUTER_HEADERS, GEMINI_OPENAI_ENDPOINT } from "./api-endpoints.ts";
import { estimateTokens as estimateTokensFromMessages } from "./context-compactor.ts";
import { getOrCreateCache, callWithExplicitCache, supportsExplicitCache } from "./explicit-cache.ts";
import { emitThinking, emitStepComplete, emitReasoningInfo, TOOL_THINKING_STEPS, trackAIUsage, createResumableTracker, stampEvent, finalizeTracker, type ResumableEventTracker } from "./streaming-engine.ts";
import {
  ProviderCircuitBreaker, buildProviderChain, getNextProvider,
  classifyProviderError, isNonRecoverableError, isModelFallbackError,
  buildProviderErrorSSE, buildModelFallbackSSE, getModelFallback,
  formatModelForProvider, getModelFamily, isProviderCompatible,
  getEmergencyFallback,
} from "./provider-failover.ts";
import { ToolMarshal } from "./tool-marshal.ts";
import { isQuestionMessage } from "./observer.ts";
import { buildAdaptiveRequestBody, verifyToolResultIntegrity, generateQueryFingerprint, generateCategoryCacheKey, extractReasoningFingerprint, buildBrainStateRecall, scoreMessageImportance, getStepModel, COMPLEXITY_WALL_CLOCK_MS, CONTINUATION_TRIGGER_RATIO, getSLATimeouts } from "./bee-brain.ts";
// tryLocalTemplate removed — "No Templates" policy
import { generateSmartFallback, narrateWidgetResult } from "./executor-helpers.ts";
import { getToolTier } from "./consent-guard.ts";
import type { ToolPermission } from "./consent-guard.ts";

// ═══ NEW MODULE IMPORTS ═══
import { preprocessPdfAttachments } from "./pdf-extractor.ts";
import { parseSSEStream, detectPartialStreamEnd } from "./llm-stream-parser.ts";
import type { ToolCallWithMetadata } from "./llm-stream-parser.ts";
import { executeAutoTools, executeConfirmTools, deduplicateToolCalls, updateCircuitBreaker, getToolContext } from "./tool-execution-engine.ts";
import type { MutableToolState, ToolExecutionContext } from "./tool-execution-engine.ts";
import { applyGuardResult, runTerseResponseGuard, runInterleavedVerification, runFinalAnswerGuards, runPostToolGuards } from "./guard-pipeline-runner.ts";
import type { MutableGuardState } from "./guard-pipeline-runner.ts";
import { injectBrainState, injectRouterHint, preLLMFastPrune, smartCompactV3, buildRelayContextSnapshot, buildNudgeContent, saveThinkingCache } from "./loop-context-manager.ts";
import { sanitizeToolResultContent } from "./sanitizer.ts";
import { generateNarrationAsync } from "./narration-llm.ts";
import { resolveInternalLLM } from "./internal-llm-caller.ts";
import { recordLLMCall } from "./rpm-budget-guard.ts";

// ═══ GENESIS MODULE IMPORTS ═══
import { generateExecutionPlan, updatePlanStep, getNextPlanStep, buildPlanInjection, planToSSE } from "./plan-generator.ts";
import type { ExecutionPlan, PlanStep } from "./plan-generator.ts";
import type { MemoryQueryResult } from "./active-memory-query.ts";

// ═══ P0/P1 UPGRADE IMPORTS ═══
import { ToolResultCache } from "./tool-result-cache.ts";
import { validateToolArguments, repairMalformedArgs } from "./tool-argument-validator.ts";
import { saveCheckpoint, loadCheckpoints, cleanupOldCheckpoints, isCheckpointed, detectCrashedSession, markCrashRecovery, buildCrashRecoveryContext } from "./loop-checkpoint.ts";
import type { Checkpoint } from "./loop-checkpoint.ts";
import { fireShadowExecution, compareShadowResult } from "./shadow-executor.ts";
import type { ShadowResult } from "./shadow-executor.ts";
import { evaluatePlanRevision, applyPlanRevisions } from "./plan-revision.ts";
import { detectWidgetOpportunity } from "./widget-hint-detector.ts";
import { SpanTracker, updateProviderHealth, trackGuardTrigger, hashProviderKey, startGuardDelta, completeGuardDelta, getHealthSortedProviders, recordModelPerformance, detectHealthAnomalies } from "./resilience-telemetry.ts";
import type { GuardDeltaCapture } from "./resilience-telemetry.ts";
import { edgeClassify } from "./edge-intent-router.ts";
import { gatherPreflightContext, formatPreflightContext } from "./preflight-context.ts";
import { getTunedBudget } from "./self-tuning-budgets.ts";
import { emitSessionStarted, emitSessionCompleted, emitSessionError } from "./session-events.ts";
import { callGeminiDirect, callAnthropicDirect, callOpenAIDirect } from "./ai-call-helpers.ts";

import type { ComplexityTier } from "./bee-brain.ts";

export interface AgenticLoopContext {
  supabase: any;
  serviceClient: any;
  userId: string;
  sessionId: string;
  missionId: string;
  encoder: TextEncoder;
  controller: ReadableStreamDefaultController;
  authHeader: string;
  source_channel: string | null;
  clientRequestId?: string | null;
  traceId?: string | null;
  autonomousTaskId?: string | null;
  modelToUse: string;
  apiEndpoint: string;
  apiKey: string;
  usePersonalKey: boolean;
  userAISettings: any;
  systemKeyCheck: any;
  hasSystemGoogleKey: boolean;
  hasSystemAnthropicKey: boolean;
  agentSettings: any;
  TOOLS: any[];
  finalMessages: any[];
  sanitizedMessage: string;
  validAttachments: any[];
  continuation: any;
  historyLength: number;
  isAdmin: boolean;
  isDeepQuery: boolean;
  isSimpleMessage: boolean;
  isQuickMessage?: boolean;
  isGroupBotGateway: boolean;
  observerResult: any;
  deviceContext: any;
  groupContext: any;
  userPermissions: ToolPermission[];
  userStrictMode: boolean;
  MAX_AGENT_STEPS: number;
  complexityTier?: ComplexityTier;
  lockAcquired: boolean;
  leaseRequestId: string;
  t_start: number;
  prefetchedBrainState?: any[] | null;
  isCancelledRef?: { current: boolean };
  userMessage?: string;
  activeMemoryResult?: MemoryQueryResult;
  sessionUserName?: string;
}

export interface AgenticLoopResult {
  finalContent: string;
  finalIsError: boolean;
  allToolCalls: { name: string; arguments: Record<string, any> }[];
  allToolResults: { name: string; result: any; error?: string }[];
  thinkingSteps: { id: string; title: string; tool_name: string; status: "loading" | "done" | "error"; detail?: string; timestamp: string }[];
  totalTokensInput: number;
  totalTokensOutput: number;
  earlyExit: boolean;
}

// ═══ Helper: Sanitize user name to prevent system-value injection into narration ═══
function sanitizeUserName(name: string): string {
  if (!name || name.length < 2 || name.length > 30) return '';
  if (/^(user|admin|group|bot|member|unknown|beebot|system|app_name|Group Member)/i.test(name)) return '';
  return name;
}

// ═══ Helper: LLM Synthesis Retry — replaces template fallbacks ═══
// When the main loop fails to produce content but tool results exist,
// this does a single non-streaming LLM call to synthesize a natural response.
async function synthesizeFromToolResults(
  toolResults: any[],
  userMessage: string,
  modelToUse: string,
  apiEndpoint: string,
  apiKey: string,
  providerType?: string,
  agentSettings?: any,
): Promise<string | null> {
  if (!toolResults || toolResults.length === 0) return null;
  const successResults = toolResults.filter(r => !r.error && r.result);
  if (successResults.length === 0) return null;

  const isBurmese = /[\u1000-\u109F]/.test(userMessage);
  const botName = agentSettings?.bot_name || "BeeBot";
  const botEmoji = agentSettings?.bot_emoji || "🐝";
  const personality = agentSettings?.personality_mode || "friendly";

  // Compact tool data for synthesis prompt
  const toolDataSummary = successResults.map(tr => {
    const r = tr.result;
    const parts: string[] = [];
    if (r.answer) parts.push(`Answer: ${String(r.answer).slice(0, 800)}`);
    if (r.results && Array.isArray(r.results)) {
      for (const item of r.results.slice(0, 5)) {
        parts.push(`- ${item.title || item.url || ''}: ${(item.snippet || item.description || '').slice(0, 300)}`);
      }
    }
    if (r.markdown) parts.push(String(r.markdown).slice(0, 800));
    if (r.response) parts.push(String(r.response).slice(0, 600));
    if (r.balance !== undefined) parts.push(`Balance: ${r.balance} ${r.currency || 'MMK'}`);
    if (r.message && typeof r.message === 'string') parts.push(r.message);
    return `[Tool: ${tr.name}]\n${parts.join('\n')}`;
  }).join('\n\n');

  const synthesisMessages = [
    {
      role: "system",
      content: `You are ${botEmoji} ${botName}, personality: ${personality}. Synthesize the tool results below into a natural, conversational response. ${isBurmese ? 'Respond in Burmese (Myanmar language).' : 'Respond in English.'} Be informative and helpful. Do NOT dump raw data — explain and summarize meaningfully. Do NOT add greetings or filler.`
    },
    { role: "user", content: userMessage },
    {
      role: "assistant",
      content: `I found the following data from my tools:\n\n${toolDataSummary}\n\nLet me synthesize this for you.`
    },
    {
      role: "user",
      content: `[SYSTEM] Now write the final response for the user based on the tool data above. Be natural, informative, and helpful.`
    }
  ];

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (providerType === 'anthropic') {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`;
      if (providerType === 'openrouter') {
        Object.assign(headers, OPENROUTER_HEADERS);
      }
    }

    const synthesisBody: any = {
      model: modelToUse,
      messages: synthesisMessages,
      max_tokens: 2048,
      temperature: 0.7,
      stream: false,
    };
    // Bug #2 fix: OpenRouter requires provider routing config to land on tool-capable sub-providers
    if (providerType === 'openrouter') {
      synthesisBody.provider = { require_parameters: true, allow_fallbacks: true };
    }

    let resp = await fetch(apiEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(synthesisBody),
      signal: AbortSignal.timeout(30_000),
    });

    // Bug #2 fix: OpenRouter :free variants sometimes 404 — retry once with :free stripped
    if (!resp.ok && providerType === 'openrouter' && modelToUse.includes(':free') && (resp.status === 404 || resp.status === 400)) {
      const paidVariant = modelToUse.replace(':free', '');
      console.log(`[SynthesisRetry] OpenRouter :free 404 — retrying with paid variant: ${paidVariant}`);
      synthesisBody.model = paidVariant;
      resp = await fetch(apiEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(synthesisBody),
        signal: AbortSignal.timeout(30_000),
      });
    }

    if (!resp.ok) {
      console.warn(`[SynthesisRetry] LLM returned ${resp.status} — synthesis failed`);
      return null;
    }

    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content;
    if (content && content.trim().length > 20) {
      console.log(`[SynthesisRetry] ✅ LLM synthesis successful (${content.length} chars)`);
      return content.trim();
    }
    console.warn(`[SynthesisRetry] LLM returned empty/short content`);
    return null;
  } catch (err) {
    console.warn(`[SynthesisRetry] Error:`, err);
    return null;
  }
}

// ═══ Helper: Direct Fallback (Autonomous Escalation REMOVED) ═══
// Per user request (2026-04), the agent NEVER auto-switches to Autonomous Mode.
// When the agentic loop exhausts its budget without producing content, we return
// the best fallback response inline so the user always gets a direct reply
// in the same chat bubble.
async function escalateToAutonomous(
  _supabase: any, _userId: string, _sessionId: string, _sanitizedMessage: string,
  _safeEnqueue: (data: Uint8Array) => boolean, _encoder: TextEncoder,
  allToolResults: any[], agentSettings: any,
  escalatedFrom: string, _metadata: Record<string, any>,
  _isUsingPersonalKey: boolean, _modelToUse: string,
): Promise<string> {
  console.warn(`[Agent] Budget exhausted (${escalatedFrom}) — using direct fallback (autonomous mode removed)`);
  return generateFallbackResponse(allToolResults, agentSettings);
}

// ═══ Main Agentic Loop ═══
export async function runAgenticLoop(ctx: AgenticLoopContext): Promise<AgenticLoopResult> {
  const {
    supabase, serviceClient, userId, sessionId, missionId,
    encoder, controller, authHeader, source_channel,
    agentSettings, validAttachments, continuation, historyLength,
    isAdmin, isDeepQuery: isDeepQueryOrig, isGroupBotGateway,
    observerResult, deviceContext, groupContext,
    userPermissions, userStrictMode,
    lockAcquired, leaseRequestId, t_start,
  } = ctx;

  let modelToUse = ctx.modelToUse;
  let apiEndpoint = ctx.apiEndpoint;
  let apiKey = ctx.apiKey;
  let isUsingPersonalKey = ctx.usePersonalKey;

  // ═══ BRAIN SOVEREIGNTY ASSERTION ═══
  // Logs prove the user's selected model/provider is what runs the main reply.
  // Background helpers (narration/observer/memory) use small models via internal-llm-caller — never overrides Brain.
  console.log(`[BrainSovereignty] User=${userId} Session=${sessionId} Model=${modelToUse} Endpoint=${apiEndpoint?.includes('openrouter') ? 'openrouter' : apiEndpoint?.includes('anthropic') ? 'anthropic' : apiEndpoint?.includes('google') || apiEndpoint?.includes('gemini') ? 'google' : 'gateway'} Source=${isUsingPersonalKey ? 'personal' : 'system'}`);
  let isSimpleMessage = ctx.isSimpleMessage;
  let MAX_AGENT_STEPS = ctx.MAX_AGENT_STEPS;
  let TOOLS = ctx.TOOLS;
  let isDeepQuery = isDeepQueryOrig;
  const sanitizedMessage = ctx.sanitizedMessage;
  const userAISettings = ctx.userAISettings;
  const systemKeyCheck = ctx.systemKeyCheck;
  const hasSystemGoogleKey = ctx.hasSystemGoogleKey;
  const hasSystemAnthropicKey = ctx.hasSystemAnthropicKey;
  const finalMessages = ctx.finalMessages;

  // ═══ PRE-LOOP: Sanitize history ═══
  let currentMessages = [...finalMessages].map((msg: any) => {
    if (msg.role === 'tool') {
      const toolName = msg.name || msg.tool_name || 'tool';
      const contentPreview = (typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)).substring(0, 300);
      return { role: 'user', content: `[Previous tool result from ${toolName}: ${contentPreview}]` };
    }
    if (msg.role === 'assistant' && msg.tool_calls) {
      const toolNames = msg.tool_calls.map((tc: any) => tc.function?.name || tc.name || 'tool').join(', ');
      return { role: 'assistant', content: (msg.content || '') + `\n[Used tools: ${toolNames}]` };
    }
    return msg;
  });

  // ═══ P0: Restore tool results from relay snapshot ═══
  let relayRestoredToolResults: { name: string; result: any; error?: string }[] = [];
  if (continuation?.context_snapshot) {
    const relayRound = continuation.relay_round || 1;
    console.log(`[Relay] Resuming from relay round ${relayRound}, injecting context snapshot`);
    
    // Parse and restore tool results from prior relay rounds
    try {
      const snapshot = typeof continuation.context_snapshot === 'string' 
        ? JSON.parse(continuation.context_snapshot) 
        : continuation.context_snapshot;
      if (snapshot?.tool_results_summary && Array.isArray(snapshot.tool_results_summary)) {
        relayRestoredToolResults = snapshot.tool_results_summary;
        console.log(`[Relay] Restored ${relayRestoredToolResults.length} tool results from prior relay rounds`);
      }
    } catch (e) {
      console.warn(`[Relay] Failed to parse tool results from snapshot:`, e instanceof Error ? e.message : e);
    }
    
    // ═══ Phase 3: Continuity Anchor ═══
    // Mid-task relay restarts lost emotional thread → injected emotional anchor
    // BEFORE the cold "[RELAY CONTINUATION]" system block to keep tone, language,
    // warmth, and user commitment consistent across rounds.
    const relayUserNameAnchor = (ctx.sessionUserName || '').trim() || 'the user';
    const isBurmeseAnchor = /[\u1000-\u109F]/.test(sanitizedMessage);
    const continuityAnchor = isBurmeseAnchor
      ? `[CONTINUITY] မင်းက ${relayUserNameAnchor} ကို အလုပ်တစ်ခု လုပ်ပေးနေတယ်။ စိတ်ရှည်ပါ၊ tone တူတူ၊ ဘာသာစကား တူတူ၊ ပူးတွဲခံစားမှု တူတူနဲ့ ဆက်လုပ်။ ပြန်စမလုပ်နဲ့—စောစောက ရရှိပြီးသား အချက်အလက်တွေပေါ် တည်ဆောက်။ ${relayUserNameAnchor} က မင်းကို စောင့်နေတယ်။`
      : `[CONTINUITY] You promised ${relayUserNameAnchor} you'd finish this. Resume the same warmth, language, and tone — do NOT restart from scratch. Build on what you already gathered. They're still waiting.`;

    currentMessages.push({
      role: "system",
      content: `${continuityAnchor}\n\n[RELAY CONTINUATION - Round ${relayRound + 1}] You were working on a task and ran out of time. Here is the context from your previous relay:\n\n${continuation.context_snapshot}\n\nContinue where you left off. Complete the remaining work. Do NOT repeat what was already done.`,
    });
  }

  // ═══ STATE INITIALIZATION ═══
  let allToolCalls: { name: string; arguments: Record<string, any> }[] = [];
  let allToolResults: { name: string; result: any; error?: string }[] = [];
  let thinkingSteps: { id: string; title: string; tool_name: string; status: "loading" | "done" | "error"; detail?: string; timestamp: string }[] = [];
  const planHistory: { id: string; tool: string; label: string; emoji: string; status: "done" | "error"; context?: string }[] = [];
  
  const toolState: MutableToolState = {
    completedImagePrompts: new Set<string>(),
    imageGenerationCompleted: false,
    lastGeneratedImageUrl: null,
    disabledToolsSet: new Set<string>(),
    toolFailureCounter: {},
    CIRCUIT_BREAKER_THRESHOLD: 2,
  };

  // ═══ P0: TOOL RESULT CACHE ═══
  const toolCache = new ToolResultCache(sessionId);

  // ═══ P1+P4: CHECKPOINT RECOVERY (relay + crash) ═══
  let checkpoints: Checkpoint[] = [];
  if (continuation?.context_snapshot) {
    // Load checkpoints from previous relay rounds for resume capability
    checkpoints = await loadCheckpoints(serviceClient, sessionId, missionId);
    if (checkpoints.length > 0) {
      console.log(`[Checkpoint] Loaded ${checkpoints.length} checkpoints for resume`);
    }
  } else {
    // ═══ P4: CRASH RECOVERY — check if previous mission crashed ═══
    const crashInfo = await detectCrashedSession(serviceClient, sessionId);
    if (crashInfo.crashedMissionId) {
      const crashCheckpoints = await loadCheckpoints(serviceClient, sessionId, crashInfo.crashedMissionId);
      if (crashCheckpoints.length > 0) {
        checkpoints = crashCheckpoints;
        const recoveryContext = buildCrashRecoveryContext(crashCheckpoints);
        currentMessages.push({ role: "system", content: recoveryContext });
        markCrashRecovery(serviceClient, sessionId, crashInfo.crashedMissionId, missionId, crashCheckpoints.length).catch(() => {});
        console.log(`[P4-CrashRecovery] Injected ${crashCheckpoints.length} checkpoints from crashed mission`);
      }
    }
  }
  // Cleanup old checkpoints (fire-and-forget)
  cleanupOldCheckpoints(serviceClient, sessionId, missionId).catch(() => {});

  // Scan history for previous image generation
  for (let i = finalMessages.length - 1; i >= 0; i--) {
    const msg = finalMessages[i];
    if (msg.role === 'tool' && msg.content) {
      try {
        const parsed = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
        if (parsed.image_url) { toolState.lastGeneratedImageUrl = parsed.image_url; break; }
      } catch {}
    }
  }

  const guardState: MutableGuardState = {
    deepResearchRetryAttempted: false,
    promiseRetryCount: 0,
    hallucinationGuardCount: 0,
    postToolGroundingChecked: false,
    noResultsRetryAttempted: false,
    snippetEscalationAttempted: false,
    qualityRequeueAttempted: false,
    reflectionAttempted: false,
    constitutionalGuardTriggered: false,
    forceReplyAttempted: false,
    toolReplanAttempts: new Map<string, number>(),
    antiGhostTriggered: false,
    lastTriggeredGuard: undefined,
    passedGuards: new Set<string>(),
  };

  let finalContent = "";
  let finalIsError = false;
  let hasVisibleContentStreamed = false;

  // ═══ WEBHOOK-1: session.started (fire-and-forget) ═══
  emitSessionStarted(serviceClient, userId, sessionId ?? null, {
    model: modelToUse,
    complexity_tier: ctx.complexityTier,
    is_admin: !!isAdmin,
    source_channel: source_channel ?? "web",
  });
  const sessionStartMs = Date.now();
  let pseudoToolRetryAttempted = false;
  let partialRecoveryAttempted = false;
  let step = 0;
  let stripRetryLevel = 0;
  let isGuardRetry = false;
  let guardRetryCount = 0;        // P0: Track total guard retries
  const MAX_GUARD_RETRIES = 3;    // P0: Hard cap to prevent infinite guard loops
  let pendingForceToolChoice = false;
  let tokenCapContinuations = 0;
  const MAX_TOKEN_CAP_CONTINUATIONS = 3;
  const traceId = ctx.traceId || `${missionId.slice(0, 8)}-${Date.now().toString(36)}`; // P1: Distributed trace ID
  console.log(`[Trace] ${traceId} — Session: ${sessionId}, Mission: ${missionId}`);
  // ═══ P0: RESILIENCE TELEMETRY ═══
  const spanTracker = new SpanTracker(traceId, sessionId, userId);
  const attemptedModels = new Set<string>([modelToUse]);
  let totalTokensInput = 0;
  let totalTokensOutput = 0;
  let totalCachedTokens = 0;
  let successfulAIRequestCount = 0;
  const loopStartTime = Date.now();
  // ═══ Phase E — Streaming Observability ═══
  let firstTokenAt = 0;       // timestamp of first text chunk reaching the user
  let lastTokenAt = 0;        // timestamp of most recent text chunk (for stream duration)
  let capturedThinkingContent = "";
  const stepThinkingMap = new Map<number, string>();
  let activeGuardDelta: GuardDeltaCapture | null = null; // P1: Track guard improvement

  // ═══ P3: EDGE INTENT ROUTER — sub-1ms pre-classification ═══
  const edgeRoute = edgeClassify(sanitizedMessage);
  spanTracker.recordSpan('guard_check', 'edge_intent_router', 0, 'ok', {
    tier: edgeRoute.tier,
    skipObserver: edgeRoute.skipObserver,
    confidence: edgeRoute.confidence,
    source: edgeRoute.source,
  });
  if (edgeRoute.skipObserver) {
    console.log(`[P3-EdgeRouter] ⚡ Observer SKIPPED (${edgeRoute.source}, confidence: ${edgeRoute.confidence}, tier: ${edgeRoute.tier})`);
  }

  // ═══ P4 HARNESS: PREFLIGHT CONTEXT GATHERING — parallel to Observer ═══
  let preflightContextBlock: string | null = null;
  if (edgeRoute.prefetchHints && (edgeRoute.prefetchHints.finance || edgeRoute.prefetchHints.tasks || edgeRoute.prefetchHints.kb)) {
    const preflightPromise = gatherPreflightContext(ctx.supabase, ctx.userId, edgeRoute.prefetchHints, sanitizedMessage)
      .then(data => {
        preflightContextBlock = formatPreflightContext(data);
        if (preflightContextBlock) {
          console.log(`[P4-Preflight] Context pre-loaded (${data.duration_ms}ms): finance=${edgeRoute.prefetchHints!.finance}, tasks=${edgeRoute.prefetchHints!.tasks}, kb=${edgeRoute.prefetchHints!.kb}`);
        }
      })
      .catch(e => console.warn(`[P4-Preflight] Non-critical failure:`, e?.message));
    // Don't await — let it run in parallel, inject result if ready before LLM call
    await Promise.race([preflightPromise, new Promise(r => setTimeout(r, 100))]);
  }

  // ═══ SAFE ENQUEUE + RESUMABLE TRACKER (event_id stamping + ringbuffer persistence) ═══
  let streamClosed = false;
  const resumableTracker: ResumableEventTracker | null = missionId
    ? createResumableTracker(missionId, serviceClient)
    : null;
  const PERSIST_TYPES = new Set([
    "content_block_delta", "tool_call", "tool_result",
    "step_complete", "agent_step", "thinking_block",
  ]);
  function safeEnqueue(data: Uint8Array) {
    if (streamClosed) return false;
    try {
      // Stamp event_id for resumable streams (parse + re-encode only when persistence relevant)
      if (resumableTracker) {
        try {
          const text = new TextDecoder().decode(data);
          if (text.startsWith("data: ")) {
            const jsonStr = text.slice(6).trimEnd();
            const obj = JSON.parse(jsonStr);
            if (obj && typeof obj === "object" && obj.type) {
              const stamped = stampEvent(resumableTracker, obj.type as string, obj);
              if (PERSIST_TYPES.has(obj.type as string)) {
                obj.event_id = stamped.event_id;
                data = new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
              }
            }
          }
        } catch { /* non-JSON heartbeat or partial frame — pass through */ }
      }
      controller.enqueue(data);
      return true;
    } catch { streamClosed = true; console.warn("[SafeEnqueue] Stream closed"); return false; }
  }

  // ═══ PROVIDER FAILOVER (P1: health-aware ordering) ═══
  const circuitBreaker = new ProviderCircuitBreaker();
  const providerChain = buildProviderChain({
    personalGeminiKey: userAISettings?.gemini_api_key,
    personalAnthropicKey: userAISettings?.personal_anthropic_key,
    personalOpenrouterKey: userAISettings?.personalOpenrouterKey,
    personalXaiKey: userAISettings?.personalXaiKey,
    systemGoogleKey: systemKeyCheck?.google_system_api_key,
    systemAnthropicKey: hasSystemAnthropicKey ? systemKeyCheck?.anthropic_system_api_key : null,
    modelToUse, allowPersonalKey: true, preferPersonal: ctx.usePersonalKey,
    disabledConnectors: (userAISettings?.disabled_connectors as string[]) ?? [],
  });
  let currentProviderIndex = 0;
  for (let i = 0; i < providerChain.length; i++) {
    if (providerChain[i].apiKey === apiKey) {
      currentProviderIndex = i;
      modelToUse = formatModelForProvider(modelToUse, providerChain[i].provider);
      break;
    }
  }

  // P1: Check DB-backed provider health — skip cooldown providers upfront
  if (providerChain.length > 1) {
    const healthOrder = await getHealthSortedProviders(
      serviceClient,
      providerChain.map((p, i) => ({ keyHash: hashProviderKey(p.apiKey), model: modelToUse, index: i }))
    );
    const bestHealthy = healthOrder.find(i => !circuitBreaker.isBad(providerChain[i].apiKey));
    if (bestHealthy !== undefined && bestHealthy !== currentProviderIndex) {
      console.log(`[P1-Health] Reordering: provider ${currentProviderIndex} → ${bestHealthy} (health-based)`);
      currentProviderIndex = bestHealthy;
      apiKey = providerChain[bestHealthy].apiKey;
      apiEndpoint = providerChain[bestHealthy].apiEndpoint;
      isUsingPersonalKey = providerChain[bestHealthy].isPersonalKey;
      modelToUse = formatModelForProvider(ctx.modelToUse, providerChain[bestHealthy].provider);
    }
  }

  const isTurboTier = ctx.complexityTier === "turbo";

  // ═══ PROVIDER-AWARE HEADERS BUILDER ═══
  function buildProviderHeaders(key: string, providerType?: string): Record<string, string> {
    if (providerType === 'anthropic') {
      return {
        "x-api-key": key,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      };
    }
    const h: Record<string, string> = { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" };
    if (providerType === 'openrouter') {
      Object.assign(h, OPENROUTER_HEADERS);
    }
    return h;
  }

  // ═══ EXPLICIT CACHE SETUP ═══
  let explicitCacheName: string | null = null;
  let cacheType: "explicit" | "implicit" | "none" = "none";
  const trackLoopUsage = async (
    metrics: {
      tokensInput: number;
      tokensOutput: number;
      durationMs: number;
      cachedTokens?: number;
      firstTokenMs?: number;
      streamDurationMs?: number;
    },
    isSuccessful: boolean,
    errorMessage: string | undefined,
    callKind: string,
    requestCount = Math.max(1, successfulAIRequestCount),
  ) => trackAIUsage(
    supabase,
    userId,
    sessionId,
    isUsingPersonalKey ? "personal_key" : "system_key",
    modelToUse,
    metrics,
    isSuccessful,
    errorMessage,
    cacheType,
    {
      taskId: ctx.autonomousTaskId || null,
      clientRequestId: ctx.clientRequestId || null,
      traceId,
      callKind,
      provider: providerChain[currentProviderIndex]?.provider || null,
      requestCount,
      metadata: {
        source_channel: source_channel || "web",
        complexity_tier: ctx.complexityTier || null,
        group_bot_gateway: !!isGroupBotGateway,
      },
    },
  );
  const currentProvider = providerChain[currentProviderIndex];
  const rawModelName = ctx.modelToUse.startsWith('google/')
    ? ctx.modelToUse.replace(/^google\//, '')
    : ctx.modelToUse.includes('/') ? ctx.modelToUse.split('/').pop()! : ctx.modelToUse;
  const skipExplicitCache = ctx.isSimpleMessage || ctx.isQuickMessage || isTurboTier || ctx.usePersonalKey;
  let explicitCachePromise: Promise<string | null> | null = null;

  if (skipExplicitCache) {
    console.log(`[ExplicitCache] SKIPPED for ${isTurboTier ? 'turbo' : ctx.isQuickMessage ? 'quick' : 'simple'} message`);
  } else if (currentProvider?.supportsExplicitCache && supportsExplicitCache(rawModelName)) {
    const systemMsg = finalMessages.find((m: any) => m.role === 'system');
    const systemLen = typeof systemMsg?.content === 'string' ? systemMsg.content.length : 0;
    if (systemMsg?.content && typeof systemMsg.content === 'string' && systemLen > 2000) {
      emitThinking(controller, encoder, "Optimizing context cache... ⚡", 0, MAX_AGENT_STEPS);
      explicitCachePromise = getOrCreateCache(currentProvider.apiKey, rawModelName, systemMsg.content, TOOLS).catch(e => {
        console.warn(`[ExplicitCache] Setup failed:`, e instanceof Error ? e.message : e);
        return null;
      });
    }
  }

  // ═══ P1+P3: SLA-DRIVEN EXECUTION CELLS — self-tuning timeouts ═══
  const slaTier = getSLATimeouts(ctx.complexityTier);
  // P3: Try self-tuned budgets from rolling performance data
  const tunedBudget = await getTunedBudget(serviceClient, ctx.complexityTier).catch(() => null);
  const effectiveSLA = tunedBudget || slaTier;
  const LOOP_BUDGET_MS = isGroupBotGateway ? 18_000 : (ctx.complexityTier ? (COMPLEXITY_WALL_CLOCK_MS[ctx.complexityTier] || 42_000) : 42_000);
  const WALL_CLOCK_HARD_LIMIT_MS = isGroupBotGateway ? 22_000 : 90_000;
  const SOFT_BUDGET_MS = Math.floor(LOOP_BUDGET_MS * (CONTINUATION_TRIGGER_RATIO || 0.85));
  const STEP_TIMEOUT_MS = isGroupBotGateway ? 15_000 : effectiveSLA.stepTimeoutMs;
  const TOOL_TIMEOUT_MS = isGroupBotGateway ? 8_000 : effectiveSLA.toolTimeoutMs;
  const IMAGE_TOOL_TIMEOUT_MS = 90_000;
  const LONG_RUNNING_TOOLS = ['generate_image', 'spawn_sub_agent', 'spawn_parallel_swarm', 'ingest_url', 'browser_scrape'];
  console.log(`[Agent] Wall-clock budget: ${LOOP_BUDGET_MS}ms (soft: ${SOFT_BUDGET_MS}ms, tier: ${ctx.complexityTier || 'default'}, SLA P95: ${effectiveSLA.p95Ms}ms, source: ${tunedBudget?.source || 'static'}${isTurboTier ? ' ⚡TURBO' : ''})`);

  // ═══ P4: SHADOW EXECUTION — fire parallel LLM for complex/deep queries ═══
  let shadowExec: { promise: Promise<ShadowResult | null>; abort: () => void } | null = null;
  const isComplexOrDeep = ctx.complexityTier === 'complex' || ctx.complexityTier === 'ultra-deep';
  const isORModel = ctx.modelToUse.includes('/') && !ctx.modelToUse.startsWith('google/');
  if (isComplexOrDeep && !isGroupBotGateway && providerChain.length > 1 && !isORModel) {
    const systemMsg = finalMessages.find((m: any) => m.role === 'system');
    const systemSummary = typeof systemMsg?.content === 'string' ? systemMsg.content.slice(0, 1000) : '';
    shadowExec = fireShadowExecution(providerChain, currentProviderIndex, modelToUse, sanitizedMessage, systemSummary);
    console.log(`[P4-Shadow] 🔮 Shadow execution fired for ${ctx.complexityTier} query`);
  }
  const emitFinalContentIfNeeded = (content: string) => {
    const trimmed = content?.trim();
    if (!trimmed || hasVisibleContentStreamed) return;
    const chunks = trimmed.match(/.{1,220}/gs) || [trimmed];
    for (const chunk of chunks) {
      try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "content", content: chunk })}\n\n`)); } catch { break; }
    }
    if (firstTokenAt === 0) firstTokenAt = Date.now();
    lastTokenAt = Date.now();
    hasVisibleContentStreamed = true;
  };

  // ═══ PDF PRE-PROCESSING (delegated to module) ═══
  await preprocessPdfAttachments(currentMessages, validAttachments, apiEndpoint, apiKey, userAISettings, systemKeyCheck, controller, encoder, MAX_AGENT_STEPS);

  // ═══ BRAIN STATE + ROUTER HINT (delegated to module) ═══
  await injectBrainState(currentMessages, supabase, observerResult, sanitizedMessage, ctx.prefetchedBrainState, isTurboTier);

  try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "thinking_status", step: "⚡ Preparing execution strategy..." })}\n\n`)); } catch {}

  // ═══ Cognitive v2: Pre-Think transparent reasoning stream (all providers) ═══
  // Fire-and-forget — emits Anthropic-compatible `thinking_block` events so the
  // ExtendedThinkingPanel renders BeeBot's reasoning before/while the Brain runs.
  // Skipped for trivial paths to preserve latency.
  if (!isTurboTier && !ctx.isQuickMessage && !isSimpleMessage && !continuation?.context_snapshot) {
    try {
      const { streamPreThink } = await import("./cognitive/pre-think-stream.ts");
      const isMyanmarMsg = /[\u1000-\u109F]/.test(sanitizedMessage);
      streamPreThink(
        (json) => { try { safeEnqueue(encoder.encode(`data: ${JSON.stringify(json)}\n\n`)); } catch {} },
        {
          userMessage: sanitizedMessage,
          agentName: agentSettings?.agent_name,
          isMyanmar: isMyanmarMsg,
        }
      ).catch(() => {});
    } catch (e) {
      console.warn("[PreThink] launch failed:", (e as Error).message);
    }
  }

  injectRouterHint(currentMessages, observerResult, isSimpleMessage, isTurboTier);

  // ═══ P4 HARNESS: INJECT PREFLIGHT CONTEXT (if gathered) ═══
  if (preflightContextBlock) {
    currentMessages.push({ role: "system", content: preflightContextBlock });
    console.log(`[P4-Preflight] Injected ${(preflightContextBlock as string).length} chars of preflight context`);
  }

  let executionPlan: ExecutionPlan | null = null;
  const isComplexEnough = ctx.complexityTier === 'complex' || ctx.complexityTier === 'deep' || ctx.isDeepQuery;

  // ═══ Cognitive v2: Tree-of-Thoughts pre-evaluator (heavy tiers only) ═══
  let totSeedBlock = "";
  let totResultRef: any = null;
  if (isComplexEnough && !isSimpleMessage && !isTurboTier && !ctx.isQuickMessage && !continuation?.context_snapshot && !isGroupBotGateway) {
    try {
      const { runToTEvaluator, formatToTSeedBlock, logThoughtTree, shouldRunToT } =
        await import("./cognitive/tot-evaluator.ts");
      if (shouldRunToT({ tier: ctx.complexityTier, observerModules: observerResult?.modules })) {
        emitThinking(controller, encoder, "🌳 Evaluating multiple plans...", 0, MAX_AGENT_STEPS);
        const totRes = await runToTEvaluator(sanitizedMessage, {
          availableTools: (TOOLS ?? []).map((t: any) => t?.function?.name).filter(Boolean).slice(0, 30),
          userPreferences: null,
        });
        if (totRes) {
          totResultRef = totRes;
          totSeedBlock = formatToTSeedBlock(totRes);
          if (totSeedBlock) {
            currentMessages.push({ role: "system", content: totSeedBlock });
            console.log(`[ToT] Seeded plan into messages (+${totSeedBlock.length} chars)`);
          }
          // Audit log (best-effort)
          logThoughtTree(supabase, userId, sessionId, null, sanitizedMessage, totRes).catch(() => {});
        }
      }
    } catch (e) {
      console.warn("[ToT] skipped:", e);
    }
  }

  // ═══ PHASE 2: Skip plan generation for group bots (saves 2-4s latency) ═══
  if (isComplexEnough && !isSimpleMessage && !isTurboTier && !ctx.isQuickMessage && !continuation?.context_snapshot && !isGroupBotGateway) {
    try {
      emitThinking(controller, encoder, "📋 Building execution plan...", 0, MAX_AGENT_STEPS);
      executionPlan = await generateExecutionPlan(
        apiEndpoint, apiKey, modelToUse,
        sanitizedMessage,
        ctx.activeMemoryResult || null,
        observerResult,
      );
      if (executionPlan) {
        const firstStep = getNextPlanStep(executionPlan);
        if (firstStep) updatePlanStep(executionPlan, firstStep.id, 'active');
        currentMessages.push({ role: "system", content: buildPlanInjection(executionPlan, firstStep) });
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "task_plan", steps: planToSSE(executionPlan) })}\n\n`));
        console.log(`[Genesis] Plan injected: ${executionPlan.steps.length} steps, strategy: ${executionPlan.memory_strategy || 'none'}`);
        // ═══ STEP 3: Coordinator Info Message (agentic-loop path) ═══
        // Emit visible acknowledgment so user sees what the agent is about to do.
        const isMyanmarMsg = /[\u1000-\u109F]/.test(sanitizedMessage);
        const ackMsg = isMyanmarMsg
          ? `✅ **မေးခွန်းကို လက်ခံရရှိပါပြီ** — **${executionPlan.steps.length} ဆင့်**ဖြင့် ဆောင်ရွက်ပေးပါမည်...`
          : `✅ **Request received** — Executing **${executionPlan.steps.length} steps**...`;
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({
          type: "coordinator_info_message",
          message: ackMsg,
          stepCount: executionPlan.steps.length,
          steps: executionPlan.steps.map((s: any) => s.title || s.description).slice(0, 5),
        })}\n\n`));
      }
    } catch (planErr: any) {
      console.warn(`[Genesis] Plan generation failed (non-critical):`, planErr.message);
    }
  } else if (!isSimpleMessage && !isTurboTier) {
    console.log(`[Genesis] Plan skipped for tier=${ctx.complexityTier} (only complex/deep triggers planning)`);
  }

  // ═══ GENESIS: Active Memory Context Injection ═══
  if (ctx.activeMemoryResult && ctx.activeMemoryResult.confidence > 0.3 && !isSimpleMessage && !isTurboTier) {
    const memCtx = ctx.activeMemoryResult;
    const memSnippets = [...memCtx.relevant_facts, ...memCtx.relevant_memories.slice(0, 2)].join('\n');
    if (memSnippets.length > 10) {
      currentMessages.push({
        role: "system",
        content: `[MEMORY CONTEXT — confidence: ${memCtx.confidence.toFixed(2)}] Prior knowledge:\n${memSnippets}\n\nUse this knowledge. If sufficient, respond directly without tools.`,
      });
      console.log(`[Genesis] Memory context injected (${memCtx.relevant_facts.length} facts, ${memCtx.relevant_memories.length} memories)`);
    }
  }

  // ═══ EXPLICIT CACHE RACE ═══
  if (explicitCachePromise) {
    const raceResult = await Promise.race([
      explicitCachePromise.then(name => ({ name, ready: true })),
      new Promise<{ name: null; ready: false }>(r => setTimeout(() => r({ name: null, ready: false }), 200)),
    ]);
    if (raceResult.ready && raceResult.name) {
      explicitCacheName = raceResult.name;
      cacheType = "explicit";
      console.log(`[ExplicitCache] ✅ Active: ${explicitCacheName}`);
    } else {
      console.log(`[ExplicitCache] ⏳ Not ready — Step 1 standard path`);
    }
  }

  // ═══ FINANCE INTENT — AUTO-TOOL HINT (Honesty Protocol) ═══
  // When the user asks for a finance summary/dashboard/balance/insights, force the
  // model to call manage_flowstate + financial_report and render via show_widget.
  // Prevents prose-only "ghost" replies that violate the Honesty Protocol.
  {
    const lower = sanitizedMessage.toLowerCase();
    const hasFinanceIntent =
      /\b(finance|flowstate|balance|expense|income|spending|revenue|cashflow|portfolio)\b/.test(lower) ||
      /(ငွေ|လက်ကျန်|ဝင်ငွေ|သုံးငွေ|ကုန်ကျ|ဘတ်ဂျက်)/.test(sanitizedMessage);
    const hasSummaryShape =
      /\b(summary|overview|dashboard|report|breakdown|insight)\b/.test(lower) ||
      /(summary|အကျဉ်း|ခြုံငုံ|အစီရင်ခံ)/.test(sanitizedMessage);
    if (hasFinanceIntent && hasSummaryShape && !continuation?.context_snapshot) {
      currentMessages.push({
        role: "system",
        content:
          "[Auto-Tool Hint — Finance Dashboard]\n" +
          "User is asking for a finance summary/dashboard. You MUST:\n" +
          "  1) Call `manage_flowstate({action:'get_insights'})` AND `financial_report({action:'period', range:'this_month'})` IN PARALLEL in this turn.\n" +
          "  2) Pass the merged result to `compose_dashboard({title:'<period> Finance Summary', data:result, focus:'metrics'})` so it renders KPI row + line chart + donut + table.\n" +
          "  3) NEVER reply with prose-only when finance data is available — that violates the Honesty Protocol.\n" +
          "  4) If a tool errors or returns empty, say so plainly (e.g. 'No transactions recorded yet') and ask a clarifying question. Do NOT fabricate numbers.",
      });
      console.log(`[FinanceHint] Auto-tool hint injected for finance dashboard intent`);
    }
  }

  // ═══ Phase 2.7 — PGE Planner Stage (feature-flag gated) ═══
  // When pge_pipeline_enabled and complexity ≥ threshold, run Planner first
  // and inject its plan as a system-prompt addendum BEFORE the loop starts.
  // See docs/AGENTIC_AUDIT.md Phase 2 + pge-pipeline.ts.
  let pgePlan: any = null;
  let pgeRunId: string = (globalThis.crypto?.randomUUID?.() ?? `pge_${Date.now()}`);
  let pgeProviderType: "anthropic" | "google" | "openrouter" | "xai" = "google";
  if (apiEndpoint?.includes("anthropic")) pgeProviderType = "anthropic";
  else if (apiEndpoint?.includes("openrouter")) pgeProviderType = "openrouter";
  else if (apiEndpoint?.includes("x.ai") || apiEndpoint?.includes("xai")) pgeProviderType = "xai";
  try {
    const { shouldUsePGE, runPlannerStage, planToSystemAddendum } = await import("./pge-pipeline.ts");
    if (shouldUsePGE({ agentSettings, complexityTier: ctx.complexityTier })) {
      pgePlan = await runPlannerStage({
        serviceClient, userId, sessionId,
        runId: pgeRunId,
        userMessage: sanitizedMessage,
        providerType: pgeProviderType,
        apiKey, apiEndpoint, agentSettings,
      });
      if (pgePlan) {
        const addendum = planToSystemAddendum(pgePlan);
        const sysIdx = currentMessages.findIndex((m: any) => m.role === "system");
        if (sysIdx >= 0) {
          currentMessages[sysIdx] = {
            ...currentMessages[sysIdx],
            content: (currentMessages[sysIdx].content ?? "") + addendum,
          };
        } else {
          currentMessages.unshift({ role: "system", content: addendum });
        }
        console.log(`[pge] plan injected (run_id=${pgeRunId}, steps=${pgePlan.steps?.length ?? 0})`);
      }
    }
  } catch (pgeErr: any) {
    console.warn(`[pge] planner stage skipped: ${pgeErr?.message ?? pgeErr}`);
  }

  // ═══ MAIN WHILE LOOP ═══
  while (step < MAX_AGENT_STEPS) {
    // Resolve cache before Step 2+
    if (step > 1 && explicitCachePromise && !explicitCacheName) {
      const resolved = await Promise.race([explicitCachePromise.then(n => n), new Promise<null>(r => setTimeout(() => r(null), 500))]);
      if (resolved) { explicitCacheName = resolved; cacheType = "explicit"; }
    }

    // Cancel check
    if (ctx.isCancelledRef?.current) {
      console.log(`[Agent] Cancel detected at step ${step}`);
      finalContent = finalContent || "_Request cancelled by user._";
      break;
    }

    // ═══ WALL-CLOCK HARD BRAKE ═══
    const loopElapsed = Date.now() - loopStartTime;
    if (loopElapsed > WALL_CLOCK_HARD_LIMIT_MS) {
      console.warn(`[Agent] ⚠️ Wall-clock hard limit (${WALL_CLOCK_HARD_LIMIT_MS}ms) exceeded at step ${step}. Elapsed: ${loopElapsed}ms. Breaking gracefully.`);
      if (!finalContent && allToolResults.length > 0) {
        const provType = providerChain[currentProviderIndex]?.provider;
        finalContent = await synthesizeFromToolResults(allToolResults, sanitizedMessage, modelToUse, apiEndpoint, apiKey, provType, agentSettings)
          || narrateWidgetResult(allToolResults, sanitizedMessage, agentSettings)
          || generateSmartFallback(allToolResults, sanitizedMessage, agentSettings, supabase, isGroupBotGateway);
      }
      if (!finalContent) {
        finalContent = "⚠️ Processing time limit reached. Please try again.";
        finalIsError = true;
      }
      break;
    }

    // Budget guards
    const currentRelayRound = continuation?.relay_round || 1;

    // ═══ P0: Merge restored relay tool results into allToolResults (once) ═══
    if (relayRestoredToolResults.length > 0 && allToolResults.length === 0 && step === 0) {
      allToolResults.push(...relayRestoredToolResults);
      console.log(`[Relay] Injected ${relayRestoredToolResults.length} restored tool results into allToolResults`);
      relayRestoredToolResults = []; // Clear to prevent re-injection
    }

    // ═══ SERVER-SIDE RELAY CAP (absolute guard — prevents client manipulation) ═══
    const MAX_RELAY_ROUNDS = 5;

    // Relay safety cap — prevent infinite relay loops without progress
    if (currentRelayRound >= 3 && !finalContent && allToolResults.length === 0) {
      if (isGroupBotGateway) {
        console.warn(`[Agent] Relay safety cap: round ${currentRelayRound} — group bot using direct fallback (no autonomous)`);
        const isBurmese = /[\u1000-\u109F]/.test(sanitizedMessage);
        finalContent = isBurmese
          ? "🐝 ဒီအကြောင်းကို ယခုအချိန်မှာ ရှာဖွေမတွေ့ပါ။ ထပ်မေးပေးပါ ဗျ။"
          : "🐝 I couldn't find that information right now. Please try again.";
      } else {
        finalContent = await escalateToAutonomous(supabase, userId, sessionId, sanitizedMessage, safeEnqueue, encoder, allToolResults, agentSettings, "relay_safety_cap", { relay_round: currentRelayRound, reason: "no_progress_after_3_relays" }, isUsingPersonalKey, modelToUse);
      }
      break;
    }

    // If relay safety cap triggers but we DO have restored tool results, use smart fallback
    if (currentRelayRound >= 3 && !finalContent && allToolResults.length > 0) {
      console.warn(`[Agent] Relay safety cap: round ${currentRelayRound} — using smart fallback from ${allToolResults.length} tool results`);
      const provType601 = providerChain[currentProviderIndex]?.provider;
      finalContent = await synthesizeFromToolResults(allToolResults, sanitizedMessage, modelToUse, apiEndpoint, apiKey, provType601, agentSettings)
        || narrateWidgetResult(allToolResults, sanitizedMessage, agentSettings)
        || generateSmartFallback(allToolResults, sanitizedMessage, agentSettings, undefined, isGroupBotGateway);
      break;
    }

    // Absolute relay cap — server-enforced, cannot be bypassed by client
    if (currentRelayRound >= MAX_RELAY_ROUNDS) {
      console.warn(`[Agent] Absolute relay cap reached: round ${currentRelayRound}/${MAX_RELAY_ROUNDS}`);
      if (!finalContent && allToolResults.length > 0) {
        const provType609 = providerChain[currentProviderIndex]?.provider;
        finalContent = await synthesizeFromToolResults(allToolResults, sanitizedMessage, modelToUse, apiEndpoint, apiKey, provType609, agentSettings)
          || narrateWidgetResult(allToolResults, sanitizedMessage, agentSettings)
          || generateSmartFallback(allToolResults, sanitizedMessage, agentSettings, undefined, isGroupBotGateway);
      } else if (!finalContent) {
        finalContent = await escalateToAutonomous(supabase, userId, sessionId, sanitizedMessage, safeEnqueue, encoder, allToolResults, agentSettings, "absolute_relay_cap", { relay_round: currentRelayRound }, isUsingPersonalKey, modelToUse);
      }
      break;
    }

    // Soft budget → relay (DISABLED for group bots — no client-side continuation)
    if (loopElapsed > SOFT_BUDGET_MS && currentRelayRound < MAX_RELAY_ROUNDS && step > 1 && !isGroupBotGateway) {
      console.log(`[Agent] Soft budget exceeded — relay at step ${step} (partial content: ${finalContent?.length || 0} chars)`);
      const contextSnapshot = buildRelayContextSnapshot(sanitizedMessage, allToolResults, allToolCalls, finalContent, step, loopElapsed);
      const nextRound = currentRelayRound + 1;

      // ═══ Phase 2 (Continuity): Persist pending_continuation BEFORE closing the stream ═══
      // If the user navigates routes / refreshes / loses network during the relay gap,
      // the next session-load can detect this state and resume cleanly instead of
      // appearing dead ("mid-task disappearance" root cause).
      try {
        await supabase.from("agent_chat_sessions").update({
          global_session_state: {
            active_surface: source_channel || 'web',
            last_activity_at: new Date().toISOString(),
            processing_status: "relay_pending",
            current_step: step,
            max_steps: MAX_AGENT_STEPS,
            active_mission_id: missionId,
            pending_continuation: {
              context_snapshot: contextSnapshot,
              relay_round: currentRelayRound,
              next_round: nextRound,
              max_rounds: MAX_RELAY_ROUNDS,
              partial_content_length: finalContent?.length || 0,
              created_at: new Date().toISOString(),
              user_message: sanitizedMessage.slice(0, 500),
            },
          },
        }).eq("id", sessionId);
      } catch (persistErr) {
        console.warn(`[Relay] Failed to persist pending_continuation:`, persistErr instanceof Error ? persistErr.message : persistErr);
      }

      // ═══ Phase 2: Emit relay_handover BEFORE continuation so UI never goes blank ═══
      // The client uses this to show "🔄 Continuing round N/M..." status instantly,
      // covering the network gap until the next fetch's first byte arrives.
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: "relay_handover",
        relay_round: currentRelayRound,
        next_round: nextRound,
        max_rounds: MAX_RELAY_ROUNDS,
        reason: "soft_budget_exceeded",
        step,
        partial_content_length: finalContent?.length || 0,
      })}\n\n`));

      // ═══ FIX #1: Persist partial content before relay so Anti-Ghost has anchor ═══
      // The actual save happens via the index.ts post-loop handler — we mark earlyExit
      // and pass partial finalContent along so it can be persisted with relay_pending flag.
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "continuation", reason: "soft_budget_exceeded", step, relay_round: currentRelayRound, context_snapshot: contextSnapshot, partial_content_length: finalContent?.length || 0 })}\n\n`));
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      if (resumableTracker) finalizeTracker(resumableTracker).catch(() => {});
      return { finalContent: finalContent || "", finalIsError, allToolCalls, allToolResults, thinkingSteps, totalTokensInput, totalTokensOutput, earlyExit: true, relayPending: true } as any;
    }

    // Hard budget
    if (loopElapsed > LOOP_BUDGET_MS) {
      console.warn(`[Agent] Hard budget exceeded at step ${step}`);
      if (!finalContent && allToolResults.length > 0) {
        const provType629 = providerChain[currentProviderIndex]?.provider;
        finalContent = await synthesizeFromToolResults(allToolResults, sanitizedMessage, modelToUse, apiEndpoint, apiKey, provType629, agentSettings)
          || narrateWidgetResult(allToolResults, sanitizedMessage, agentSettings)
          || generateSmartFallback(allToolResults, sanitizedMessage, agentSettings, undefined, isGroupBotGateway);
      } else if (!finalContent) {
        if (isGroupBotGateway) {
          const isBurmese = /[\u1000-\u109F]/.test(sanitizedMessage);
          finalContent = isBurmese
            ? "🐝 ဒီအကြောင်းကို ယခုအချိန်မှာ မဖြေနိုင်ပါ။ ထပ်မေးပေးပါ ဗျ။"
            : "🐝 I couldn't process that request. Please try again.";
        } else {
          finalContent = await escalateToAutonomous(supabase, userId, sessionId, sanitizedMessage, safeEnqueue, encoder, allToolResults, agentSettings, "hard_budget", { reason: "budget_exhausted_no_content" }, isUsingPersonalKey, modelToUse);
        }
      }
      break;
    }

    step++;
    console.log(`[Agent] Step ${step}/${MAX_AGENT_STEPS} (elapsed: ${loopElapsed}ms)`);

    // Queue interrupt + session state (step > 1, non-turbo)
    if (step > 1 && lockAcquired && !isSimpleMessage && !isTurboTier) {
      try {
        const { data: pendingMsgs } = await supabase.from("pending_messages").select("id, content, priority").eq("session_id", sessionId).eq("status", "pending").order("priority", { ascending: false }).order("created_at", { ascending: true }).limit(1);
        if (pendingMsgs?.[0]?.priority >= 10) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "queue_interrupt", message_id: pendingMsgs[0].id, content: pendingMsgs[0].content })}\n\n`));
          await supabase.from("pending_messages").update({ status: "completed", processed_at: new Date().toISOString() }).eq("id", pendingMsgs[0].id);
          break;
        }
      } catch (qErr) { console.error("[Queue] Check failed:", qErr); }
      try { await supabase.from("agent_chat_sessions").update({ global_session_state: { active_surface: source_channel || 'web', last_activity_at: new Date().toISOString(), processing_status: "thinking", current_step: step, max_steps: MAX_AGENT_STEPS } }).eq("id", sessionId); } catch {}
    }

    // Thinking status
    const isBurmese = /[\u1000-\u109F]/.test(sanitizedMessage);
    if (step === 1) {
      emitThinking(controller, encoder, isBurmese ? "🤖 AI Model ဆီ ပို့နေတယ်..." : "🤖 Generating response...", step, MAX_AGENT_STEPS);
      // ═══ Emit reasoning effort info to frontend (only on step 1) ═══
      const isProModel = modelToUse.includes("pro") && !modelToUse.includes("sonnet") && !modelToUse.includes("claude") && !modelToUse.includes("/");
      const tier = ctx.complexityTier || "moderate";
      const effortMap: Record<string, string> = { turbo: "low", moderate: "medium", complex: "high", deep: "high", "ultra-deep": "high" };
      const effort = effortMap[tier] || "none";
      if (isProModel && effort !== "none") {
        emitReasoningInfo(controller, encoder, effort, modelToUse, tier);
      }
    } else {
      emitThinking(controller, encoder, isBurmese ? `🔄 အဆင့် ${step}/${MAX_AGENT_STEPS}...` : `🔄 Step ${step}/${MAX_AGENT_STEPS}...`, step, MAX_AGENT_STEPS);
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "agent_step", current: step, max: MAX_AGENT_STEPS, status: "processing" })}\n\n`));
    }

    // Pre-LLM prune (delegated)
    preLLMFastPrune(currentMessages, step);

    const stepStartTime = Date.now();
    const finishLlmSpan = spanTracker.startSpan('llm_call', `step_${step}_${modelToUse}`, { model: modelToUse, step, complexityTier: ctx.complexityTier });
    if (step === 1) console.log(`⏱️ [Perf] T4 LLM call start: ${Date.now() - t_start}ms`);

    // LLM Pulse
    const llmPulseInterval = setInterval(() => {
      try { safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "thinking_pulse", elapsed_s: Math.round((Date.now() - stepStartTime) / 1000), message: `Still thinking...` })}\n\n`)); } catch {}
    }, 8_000);

    // Model Sovereignty: user's selected model stays fixed throughout the loop — no step-based swaps
    isGuardRetry = false;
    let forceToolChoice = pendingForceToolChoice;
    pendingForceToolChoice = false;

    // ═══ LLM API CALL ═══
    let aiResponse: Response;
    let toolsToUse: any[] | undefined = undefined;
    let toolChoiceToUse: string | undefined = undefined;

    try {
      // Resolve tools
      const TOOL_DRIVEN_ACTIONS = new Set(['search_web', 'manage_flowstate', 'manage_workspace_task', 'generate_ai_content', 'generate_image', 'manage_ai_content', 'search_knowledge_base']);
      const observerToolIntent = observerResult && (observerResult.needs_tools === true || TOOL_DRIVEN_ACTIONS.has(observerResult.primary_action));
      const KEYWORD_TOOL_OVERRIDE = /money|expense|income|ငွေ|write|create|generate|ရေး|task|workspace|အလုပ်|remember|recall|မှတ်|deep|research|analyze|audit|compare|image|ပုံ|goal|heartbeat|notification|file|document|သုံးသပ်|အသေးစိတ်|ဈေးကွက်|တုံ့ပြန်|ရှာဖွေ|ရှာပေး|ထပ်ရှာ|စစ်ဆေး|ဈေးနှုန်း|FOMC|reaction|outlook|commentary|market|stock|crypto|bitcoin|sentiment|forecast|search|ရှာ|price|ဈေး|sol|solana|ကြည့်ပေး|ဘယ်ဈေး|coinmarketcap|news|သတင်း|weather|ရာသီဥတု/i;
      const keywordToolOverride = KEYWORD_TOOL_OVERRIDE.test(ctx.userMessage || sanitizedMessage);
      const toolIntentOverride = observerToolIntent || keywordToolOverride;

      if (!isSimpleMessage && (!ctx.isQuickMessage || toolIntentOverride)) {
        let baseTools: any[];
        const filteredTools = ToolMarshal.getFilteredTools(observerResult?.primary_action, observerResult?.complexity, TOOLS, isAdmin);
        baseTools = (filteredTools === null || (filteredTools && filteredTools.length < 3)) ? TOOLS : filteredTools;
        if (toolState.imageGenerationCompleted) baseTools = baseTools.filter((t: any) => t.function?.name !== 'generate_image');
        if (isTurboTier) baseTools = baseTools.filter((t: any) => t.function?.name !== 'generate_image');
        toolsToUse = baseTools;
        toolChoiceToUse = forceToolChoice ? "required" : "auto";
        // Phase 3.1 — Dynamic tool search (token saver, feature-flag gated).
        // See tool-search.ts. When `agentic_sdk_enabled` is on, caps the tool
        // list to top-N relevant tools per turn.
        try {
          const { applyToolSearchIfEnabled } = await import("./tool-search.ts");
          toolsToUse = applyToolSearchIfEnabled(
            toolsToUse as any[],
            agentSettings,
            sanitizedMessage,
            observerResult?.primary_action,
            ctx.complexityTier,
          );
        } catch (e: any) {
          console.warn(`[tool-search] dynamic search skipped: ${e?.message}`);
        }
      }

      const useExplicitCache = explicitCacheName && cacheType === "explicit" && providerChain[currentProviderIndex]?.supportsExplicitCache;
      if (useExplicitCache) {
        const adaptiveBody = buildAdaptiveRequestBody({ model: modelToUse, messages: currentMessages, tools: toolsToUse, toolChoice: toolChoiceToUse, isDeepQuery, stripLevel: stripRetryLevel, retryCount: stripRetryLevel, complexityTier: ctx.complexityTier, tokenCapRound: tokenCapContinuations });
        aiResponse = await callWithExplicitCache(apiKey, rawModelName, explicitCacheName || "", currentMessages, { tools: toolsToUse, temperature: adaptiveBody.temperature, maxTokens: adaptiveBody.max_tokens, topP: adaptiveBody.top_p });
      } else {
        const currentProviderType = providerChain[currentProviderIndex]?.provider;
        let requestBody = buildAdaptiveRequestBody({ model: modelToUse, messages: currentMessages, tools: toolsToUse, toolChoice: toolChoiceToUse, isDeepQuery, stripLevel: stripRetryLevel, retryCount: stripRetryLevel, complexityTier: ctx.complexityTier, tokenCapRound: tokenCapContinuations, providerType: currentProviderType });
        // Apply Gemini parameter sanitizer on 400 retry
        if (stripRetryLevel > 0 && (currentProviderType === 'google' || !modelToUse.includes('/'))) {
          const { sanitizeForGeminiRetry } = await import("./bee-brain-request-builder.ts");
          requestBody = sanitizeForGeminiRetry(requestBody, stripRetryLevel);
        }
        // Phase 1.2 — Anthropic SDK branch (feature-flag gated).
        // When provider is Anthropic AND user has agentic_sdk_enabled=true,
        // route through @anthropic-ai/sdk; else fall through to raw fetch.
        // See docs/AGENTIC_AUDIT.md §A3 and anthropic-client.ts header.
        const { shouldUseAnthropicSDK, callAnthropicViaSDK } = await import("./anthropic-client.ts");
        if (shouldUseAnthropicSDK(currentProviderType, agentSettings)) {
          aiResponse = await callAnthropicViaSDK({
            apiKey,
            body: requestBody,
            signal: AbortSignal.timeout(180_000),
          });
        } else {
          aiResponse = await fetch(apiEndpoint, {
            method: "POST",
            headers: buildProviderHeaders(apiKey, currentProviderType),
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(180_000),
          });
        }
      }
    } finally {
      clearInterval(llmPulseInterval);
    }

    // ═══ RPM TRACKING: Record main loop LLM call for unified budget guard ═══
    recordLLMCall(userId, modelToUse);

    // ═══ ERROR HANDLING (rate limit, provider failover, model fallback) ═══
    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const llmDuration = Date.now() - stepStartTime;
      finishLlmSpan({ status: 'error', metadata: { httpStatus: status, durationMs: llmDuration } });
      // P0: Track provider health on error
      updateProviderHealth(serviceClient, hashProviderKey(apiKey), modelToUse, llmDuration, false, classifyProviderError(status, '').toString()).catch(() => {});
      await trackLoopUsage({ tokensInput: 0, tokensOutput: 0, durationMs: llmDuration }, false, `HTTP ${status}`, "main_llm_error", 1);

      if (status === 429) {
        console.log(`[AgenticLoop] 429 rate limit on "${modelToUse}" — attempting model fallback before error`);
        // Fall through to model fallback / provider failover logic below (no early break)
      }
      if (status === 402) {
        if (!isUsingPersonalKey) {
          finalContent = "⚠️ Credit မလုံလောက်ပါ။\n_Insufficient credits._";
          finalIsError = true; break;
        }
        // Personal key 402 = provider billing issue — fall through to failover logic below
        console.log(`[AgenticLoop] 402 from personal key provider — attempting failover`);
      }

      const errorText = status === 402 ? "quota_exhausted billing limit" : await aiResponse.text();
      console.error(`[AgenticLoop] HTTP ${status} from "${modelToUse}": ${errorText.slice(0, 500)}`);
      const errorType = classifyProviderError(status, errorText);

      // ═══ Model Fallback: rate_limited / overloaded / context_length_exceeded ═══
      // Step 1: Try next model in same-family fallback chain
      if (isModelFallbackError(errorType)) {
        const fallbackModel = getModelFallback(modelToUse, attemptedModels);
        if (fallbackModel) {
          console.log(`[ModelFallback] "${modelToUse}" → "${fallbackModel}" (${errorType})`);
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(buildModelFallbackSSE(modelToUse, fallbackModel, errorType))}\n\n`)); } catch {}
          attemptedModels.add(fallbackModel);
          modelToUse = fallbackModel;
          if (!isGroupBotGateway) await new Promise(r => setTimeout(r, 300));
          step--; continue;
        }
        // Model chain exhausted — fall through to provider failover / emergency fallback below
        console.log(`[ModelFallback] Chain exhausted for "${modelToUse}" (${errorType}) — trying provider failover`);
      }

      if (!aiResponse.ok) {
        // ═══ Provider Failover + Emergency Cross-Family Fallback ═══
        // Triggers for: non-recoverable errors, rate_limited (after model chain exhausted), overloaded chain exhausted
        if (isNonRecoverableError(errorType) || isModelFallbackError(errorType)) {
          circuitBreaker.markBad(apiKey);
          const modelFamily = getModelFamily(ctx.modelToUse);
          const nextResult = getNextProvider(providerChain, circuitBreaker, currentProviderIndex + 1);
          let sameFamilyFailoverSucceeded = false;
          if (nextResult) {
            const { provider: nextProvider, index: nextIndex } = nextResult;
            // Only failover to compatible provider (same model family, different key)
            const isCompatible = isProviderCompatible(nextProvider.provider, modelFamily);
            if (isCompatible) {
              try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(buildProviderErrorSSE(errorType, providerChain[currentProviderIndex]?.label || 'unknown', nextProvider.label))}\n\n`)); } catch {}
              apiKey = nextProvider.apiKey; apiEndpoint = nextProvider.apiEndpoint; isUsingPersonalKey = nextProvider.isPersonalKey; currentProviderIndex = nextIndex;
              modelToUse = formatModelForProvider(ctx.modelToUse, nextProvider.provider);
              attemptedModels.clear(); attemptedModels.add(modelToUse);
              if (!nextProvider.supportsExplicitCache) { explicitCacheName = null; if (cacheType === "explicit") cacheType = "none"; }
              if (!isGroupBotGateway) await new Promise(r => setTimeout(r, 500));
              sameFamilyFailoverSucceeded = true;
              step--; continue;
            }
          }
          if (!sameFamilyFailoverSucceeded) {
            // ═══ Emergency Cross-Family Fallback ═══
            // Bug #6 fix: Skip emergency Gemini swap if user explicitly disabled the gemini connector
            // (respects Model Sovereignty — never silently use a provider the user opted out of).
            const userDisabledGemini = ((userAISettings?.disabled_connectors as string[]) ?? []).includes('gemini');
            const emergencyProvider = userDisabledGemini
              ? null
              : getEmergencyFallback(modelFamily, systemKeyCheck?.google_system_api_key, GEMINI_OPENAI_ENDPOINT);
            if (emergencyProvider) {
              const emergencyModel = 'gemini-3.5-flash';
              // Bug #6 fix: Emit explicit, user-visible SSE event BEFORE swapping so the user is aware
              // their selected model failed and a different provider is taking over.
              try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: "provider_error", error_type: errorType,
                provider: providerChain[currentProviderIndex]?.label || ctx.modelToUse,
                fallback: `${emergencyModel} (emergency)`,
                message: `⚠️ "${ctx.modelToUse}" — no same-family fallback available. Emergency switching to "${emergencyModel}" via system Google key. Your selected model could not be reached.`,
              })}\n\n`)); } catch {}
              apiKey = emergencyProvider.apiKey;
              apiEndpoint = emergencyProvider.apiEndpoint;
              isUsingPersonalKey = emergencyProvider.isPersonalKey;
              modelToUse = emergencyModel;
              attemptedModels.add(emergencyModel);
              if (!isGroupBotGateway) await new Promise(r => setTimeout(r, 500));
              step--; continue;
            }
            console.log(`[ProviderFailover] No same-family or emergency fallback for "${ctx.modelToUse}" — stopping (userDisabledGemini=${userDisabledGemini})`);
          }
        }

        // If we exhausted all fallbacks and isModelFallbackError, show the chain-exhausted error
        if (isModelFallbackError(errorType)) {
          const reason = errorType === 'context_length_exceeded'
            ? 'Message သို့မဟုတ် conversation ရှည်လွန်းနေပါတယ်။ Available model အားလုံးရဲ့ context window ထဲ မဆံ့ပါ။\n_Input too long for all available models._'
            : errorType === 'rate_limited'
              ? 'Model rate limit ပြည့်သွားပါပြီ။ Fallback models အားလုံးလည်း rate limit ပြည့်နေပါတယ်။ ခဏစောင့်ပြီး ပြန်စမ်းပါ။\n_All models rate limited — please wait a moment._'
              : 'Model ယာယီ အလုပ်များနေပါတယ်။ Fallback models အားလုံးလည်း overloaded ဖြစ်နေပါတယ်။\n_All models temporarily overloaded — try again shortly._';
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: "provider_error", error_type: errorType, provider: modelToUse, fallback: null,
            message: reason
          })}\n\n`)); } catch {}
          finalContent = `⚠️ **${Array.from(attemptedModels).join(' → ')}** — ${reason}`;
          finalIsError = true; break;
        }

        // Strip retry on 400 — progressively sanitize request body params
        if (status === 400 && (errorType === 'unknown' || errorType === 'invalid_parameter') && ++stripRetryLevel <= 2) {
          console.log(`[AgenticLoop] 400 strip-retry level ${stripRetryLevel} for "${modelToUse}"`);
          // Sanitize the request body by removing problematic params
          // The sanitizer is applied in buildAdaptiveRequestBody via stripLevel
          // Additionally, strip tool messages from conversation history at level 1+
          currentMessages = currentMessages.filter((m: any) => m.role !== 'tool').map((m: any) => {
            if (m.role === 'assistant' && m.tool_calls) return { role: 'assistant', content: (m.content || '') + `\n[Used tools: ${m.tool_calls.map((tc: any) => tc.function?.name).join(', ')}]` };
            return m;
          });
          step--; continue;
        }

        // Smart fallback
        if (allToolResults.length > 0 && step > 1) {
          const provType850 = providerChain[currentProviderIndex]?.provider;
          finalContent = await synthesizeFromToolResults(allToolResults, sanitizedMessage, modelToUse, apiEndpoint, apiKey, provType850, agentSettings)
            || narrateWidgetResult(allToolResults, sanitizedMessage, agentSettings)
            || generateSmartFallback(allToolResults, sanitizedMessage, agentSettings, supabase, isGroupBotGateway);
          break;
        }

        // ═══ Clear, actionable error messages per error type ═══
        const modelName = ctx.modelToUse;
        const errorMessages: Record<string, string> = {
          'invalid_key': `⚠️ **API Key Error**\n\nAPI key မမှန်ပါ သို့မဟုတ် expired ဖြစ်နေပါတယ်။ Connectors settings မှာ key ကို update လုပ်ပေးပါ။\n_API key invalid or expired for "${modelName}"._`,
          'quota_exhausted': `⚠️ **Quota ကုန်သွားပါပြီ**\n\n"${modelName}" အတွက် quota/billing limit ပြည့်သွားပါပြီ။ Provider dashboard မှာ စစ်ဆေးပါ။\n_Quota exhausted for "${modelName}"._`,
          'model_not_found': `⚠️ **Model မတွေ့ပါ**\n\n"${modelName}" — ဒီ model ID က မှားနေပါတယ် သို့မဟုတ် မရရှိနိုင်ပါ။ Settings မှာ model ID ကို စစ်ဆေးပြီး ပြင်ပေးပါ။\n_Model not found: "${modelName}"._`,
          'model_capability_error': ctx.modelToUse.includes('/')
            ? `⚠️ **Model Incompatible**\n\n"${modelName}" က BeeBot ရဲ့ tool-calling workflow ကို support မလုပ်ပါ သို့မဟုတ် privacy/data policy settings ကြောင့် block ဖြစ်နေပါတယ်။\n\nOpenRouter settings (openrouter.ai/settings/privacy) စစ်ဆေးပါ သို့မဟုတ် compatible model သို့ ပြောင်းပါ။\n_Model doesn't support tool-calling or blocked by privacy settings._`
            : `⚠️ **AI Service Error**\n\n"${modelName}" နဲ့ ချိတ်ဆက်ရာတွင် ပြဿနာ ရှိနေပါတယ်။ ခဏစောင့်ပြီး ပြန်စမ်းပါ။\n_Upstream error for "${modelName}" — please retry._`,
          'invalid_parameter': `⚠️ **Request Parameter Error**\n\n"${modelName}" က request ထဲမှာ support မလုပ်တဲ့ parameter ပါနေပါတယ်။ Strip-retry ${stripRetryLevel}/2 ကျော်သွားပါပြီ။ ပြန်စမ်းပါ။\n_Unsupported parameter for "${modelName}" after ${stripRetryLevel} retries._`,
          'server_error': `⚠️ **AI Service Error**\n\nAI service မှာ ယာယီ ပြဿနာ ရှိနေပါတယ်။ ခဏစောင့်ပြီး ပြန်စမ်းပါ။\n_AI service temporary issue._`,
          'timeout': `⚠️ **Request Timeout**\n\n"${modelName}" က response ပြန်မလာပါ။ ခဏစောင့်ပြီး ပြန်စမ်းပါ။\n_Request timed out._`,
        };
        finalContent = errorMessages[errorType] || `⚠️ **AI Error (${status})**\n\n"${modelName}" — မမျှော်လင့်ထားတဲ့ error ဖြစ်ပေါ်ပါတယ်။ ပြန်စမ်းပါ သို့မဟုတ် model ပြောင်းကြည့်ပါ။\n_Unexpected error (${status})._`;
        // Send provider_error SSE so frontend clears thinking status
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: "provider_error", error_type: errorType, provider: modelName, fallback: null,
          message: finalContent
        })}\n\n`)); } catch {}
        finalIsError = true; break;
      }
    }

    // ═══ STREAM PARSING (delegated to module) ═══
    const reader = aiResponse.body!.getReader();
    const parseResult = await parseSSEStream(reader, encoder, step, sanitizedMessage, cacheType, {
      safeEnqueue,
      onFirstToken: () => { if (step === 1) console.log(`⏱️ [Perf] T5 First token: ${Date.now() - t_start}ms`); },
      onThinkingBlock: (s, summary) => {
        capturedThinkingContent += summary;
        stepThinkingMap.set(s, (stepThinkingMap.get(s) || '') + summary);
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "thinking_block", step: s, summary })}\n\n`)); } catch {}
      },
      onToolCall: (name, callId, idx) => {
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_call", name, call_id: callId })}\n\n`));
        const toolLabel = formatToolName(name);
        const toolEmoji = name.includes('search') ? '🔍' : name.includes('flowstate') ? '💰' : name.includes('workspace') ? '📋' : '⚙️';
        const toolStepId = `step${step}_tool${idx}_${callId}`;
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_progress", tool: name, emoji: toolEmoji, label: TOOL_THINKING_STEPS[name]?.before || `Running ${toolLabel}...`, stepId: toolStepId })}\n\n`));
        // PRE-TOOL NARRATION removed — getToolContext at L853 provides context-aware replacement
        thinkingSteps.push({ id: `thought_${callId}`, title: `${step > 1 ? `Step ${step}: ` : ''}${toolLabel}`, tool_name: name, status: "loading", timestamp: new Date().toISOString() });
      },
    });

    let { stepContent, stepToolCalls, stepFinishReason, streamEnded } = parseResult;
    // ═══ P0: Close LLM span on success ═══
    const llmDuration = Date.now() - stepStartTime;
    finishLlmSpan({ status: 'ok', metadata: { durationMs: llmDuration, model: modelToUse, toolCallCount: stepToolCalls.length, contentLength: stepContent.length } });
    updateProviderHealth(serviceClient, hashProviderKey(apiKey), modelToUse, llmDuration, true).catch(() => {});

    // ═══ SAME-STEP TOOL CALL DEDUPLICATION ═══
    successfulAIRequestCount++;
    if (stepToolCalls.length > 1) {
      const seen = new Set<string>();
      const dedupedCalls: typeof stepToolCalls = [];
      for (const tc of stepToolCalls) {
        const fingerprint = `${tc.name}::${JSON.stringify(tc.arguments || {})}`;
        if (seen.has(fingerprint)) {
          console.log(`[Dedup] Skipping duplicate tool call: ${tc.name} (same args in step ${step})`);
          continue;
        }
        seen.add(fingerprint);
        dedupedCalls.push(tc);
      }
      if (dedupedCalls.length < stepToolCalls.length) {
        console.log(`[Dedup] Removed ${stepToolCalls.length - dedupedCalls.length} duplicate tool calls in step ${step}`);
        stepToolCalls = dedupedCalls;
      }
    }

    // ═══ Phase E: First/last token timestamps for streaming metrics ═══
    if (parseResult.hasVisibleContentStreamed) {
      if (firstTokenAt === 0) firstTokenAt = Date.now();
      lastTokenAt = Date.now();
    }
    hasVisibleContentStreamed = hasVisibleContentStreamed || parseResult.hasVisibleContentStreamed;
    totalCachedTokens += parseResult.totalCachedTokens;
    cacheType = parseResult.cacheType;

    // Partial stream recovery
    const isPartialStream = detectPartialStreamEnd(streamEnded, stepContent);
    if (isPartialStream && !partialRecoveryAttempted && stepToolCalls.length === 0 && step < MAX_AGENT_STEPS && stepContent.length > 50 && !/[.!?။\n]$/.test(stepContent.trimEnd())) {
      partialRecoveryAttempted = true;
      currentMessages.push({ role: "assistant", content: stepContent }, { role: "user", content: `[SYSTEM] Your previous response was cut off. Continue from: "...${stepContent.slice(-200)}"` });
      continue;
    }

    // Token cap auto-continuation — disabled for group bots (no multi-round continuation benefit)
    if (stepFinishReason === "length" && stepToolCalls.length === 0 && stepContent.length > 50 && step <= MAX_AGENT_STEPS && !isGroupBotGateway) {
      if (tokenCapContinuations < MAX_TOKEN_CAP_CONTINUATIONS) {
        tokenCapContinuations++;
        currentMessages.push({ role: "assistant", content: stepContent }, { role: "user", content: `[SYSTEM] Your response was truncated. Continue EXACTLY from where you stopped.` });
        step--; continue;
      }
      const fallbackModel = getModelFallback(modelToUse, attemptedModels);
      if (fallbackModel) {
        attemptedModels.add(fallbackModel);
        currentMessages.push({ role: "assistant", content: stepContent }, { role: "user", content: `[SYSTEM] Continue more concisely.` });
        modelToUse = fallbackModel; tokenCapContinuations = 0; explicitCacheName = null; if (cacheType === "explicit") cacheType = "none";
        step--; continue;
      }
    }

    // Emit tool_call_context post-parse + context-aware narration replacement
    for (const tool of stepToolCalls) {
      const toolContext = getToolContext(tool.name, JSON.stringify(tool.arguments || {}));
      if (toolContext) {
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_call_context", name: tool.name, context: toolContext, call_id: tool.id })}\n\n`));
        // Replace generic pre-tool narration with context-specific one
        const snippet = toolContext.replace(/^[A-Za-z]+:\s*/, '').slice(0, 60);
        const isWidget = tool.name === 'show_widget' || tool.name === 'compose_dashboard';
        const emoji = isWidget ? '📊' : tool.name.includes('search') ? '🔍' : tool.name.includes('browser') ? '🌐' : tool.name.includes('flowstate') ? '💰' : tool.name.includes('generat') ? '✍️' : '⚙️';
        const verb = isWidget ? 'Visualization ပြင်ဆင်နေတယ်' : tool.name.includes('search') ? 'ရှာဖွေနေတယ်' : tool.name.includes('browser') ? 'ဆွဲယူနေတယ်' : 'စစ်ဆေးနေတယ်';
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "pipeline_narration", text: `${emoji} '${snippet}' ${verb}၊ ခဏစောင့်ဦးနော်...`, id: `narr_pre_${tool.id || 'unknown'}` })}\n\n`));
      }
    }

    // Dynamic task plan
    if (stepToolCalls.length >= 1) {
      const getToolEmoji = (n: string) => n.includes('search') ? '🔍' : n.includes('browser') ? '🌐' : n.includes('flowstate') ? '💰' : n.includes('workspace') ? '📋' : n.includes('generat') ? '✍️' : n.includes('memory') ? '🧠' : n.includes('image') ? '🎨' : '⚙️';
      const currentPlanSteps = stepToolCalls.map((tc, i) => ({ id: `plan_${step}_${i}`, tool: tc.name, label: getToolContext(tc.name, JSON.stringify(tc.arguments || {})) || formatToolName(tc.name), emoji: getToolEmoji(tc.name), status: "running" as const }));
      safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "task_plan", steps: [...planHistory, ...currentPlanSteps, { id: "plan_respond", tool: "respond", label: "Composing response", emoji: "✅", status: "pending" }] })}\n\n`));
    }

    // Token estimation — language-aware (P0 fix: replaces inaccurate chars/4)
    const stepDuration = Date.now() - stepStartTime;
    totalTokensInput += estimateTokensFromMessages(currentMessages);
    totalTokensOutput += estimateTokensFromMessages([{ role: "assistant", content: stepContent }]);

    // Empty response handling
    if ((!stepContent || stepContent.trim().length < 5) && stepToolCalls.length === 0) {
      if (allToolResults.length > 0 || step > 1) {
        // ═══ FIX #6: Allow up to 2 force-reply retries before falling to template ═══
        const forceReplyCount = (guardState as any).forceReplyCount || 0;
        if (forceReplyCount < 2) {
          (guardState as any).forceReplyCount = forceReplyCount + 1;
          guardState.forceReplyAttempted = true;
          // Include tool result data summary in force-reply prompt for better LLM synthesis
          const toolDataSnippet = allToolResults.filter(r => !r.error && r.result).map(tr => {
            const r = tr.result;
            if (r.answer) return `[${tr.name}] ${String(r.answer).slice(0, 300)}`;
            if (r.results && Array.isArray(r.results)) return `[${tr.name}] ${r.results.slice(0, 3).map((i: any) => i.title || i.snippet || '').join('; ').slice(0, 300)}`;
            if (r.markdown) return `[${tr.name}] ${String(r.markdown).slice(0, 300)}`;
            if (r.message) return `[${tr.name}] ${r.message}`;
            return `[${tr.name}] ${JSON.stringify(r).slice(0, 200)}`;
          }).join('\n');
          const promptText = forceReplyCount === 0
            ? `[SYSTEM] TOOL_OUTPUT_RECEIVED. Here is the data:\n${toolDataSnippet}\n\nSynthesize this into a helpful, natural response for the user. Include ONLY data from the tool results. Do NOT add greetings, names, or filler text.`
            : `[SYSTEM] FINAL ATTEMPT: User is waiting. Output ANY useful summary from the tool data above, even one sentence. Do NOT return empty. Data:\n${toolDataSnippet}`;
          currentMessages.push({ role: "user", content: promptText });
          continue;
        }
        // LLM synthesis retry instead of template fallback
        const provTypeFR = providerChain[currentProviderIndex]?.provider;
        finalContent = await synthesizeFromToolResults(allToolResults, sanitizedMessage, modelToUse, apiEndpoint, apiKey, provTypeFR, agentSettings)
          || narrateWidgetResult(allToolResults, sanitizedMessage, agentSettings)
          || generateSmartFallback(allToolResults, sanitizedMessage, agentSettings, supabase, isGroupBotGateway);
        break;
      }
      // ═══ PHASE 2: Group empty-response retry with simplified prompt ═══
      if (isGroupBotGateway && !guardState.forceReplyAttempted) {
        guardState.forceReplyAttempted = true;
        currentMessages.push({ role: "user", content: `[SYSTEM] Just answer the question directly. No tools needed. Be concise.` });
        continue;
      }
      if ((isSimpleMessage || ctx.isQuickMessage) && !guardState.forceReplyAttempted) {
        guardState.forceReplyAttempted = true; isSimpleMessage = false; continue;
      }
      finalContent = "⚠️ AI response ပြဿနာဖြစ်နေပါတယ်။ New Chat session စပါ။";
      finalIsError = true; break;
    }

    // Pseudo-tool leak detector — catches model hallucinating tool syntax as plain text
    const PSEUDO_TOOL_PATTERNS = [
      /^tool_code\s*$/m,
      /print\s*\(\s*search_web\s*\(/,
      /search_web\s*\(\s*query\s*=/,
      /^search_web\s*$/m,
      /^search_web\s*\n+\s*\{/m,
      /^search_web\s*\{/m,
      /^\{\s*"query"\s*:/m,
      /^search_knowledge_base\s*\{/m,
      /^manage_flowstate\s*\{/m,
      /^generate_ai_content\s*\{/m,
    ];
    if (stepContent && PSEUDO_TOOL_PATTERNS.some(p => p.test(stepContent)) && stepToolCalls.length === 0) {
      if (!pseudoToolRetryAttempted) {
        pseudoToolRetryAttempted = true;
        pendingForceToolChoice = true;
        currentMessages.push({ role: "assistant", content: stepContent }, { role: "user", content: `[SYSTEM] CRITICAL: You wrote tool syntax as plain text. Use the ACTUAL tool function call, not text. Call the tool NOW.` });
        stepContent = ""; continue;
      }
      finalContent = "⚠️ ရှာဖွေမှု ယာယီ မအောင်မြင်ပါ။ ထပ်ကြိုးစားပေးပါ။\n\n_Search temporarily unavailable. Please try again._"; break;
    }

    // ═══ NO TOOL CALLS → FINAL ANSWER PATH ═══
    if (stepToolCalls.length === 0) {
      // ═══ GROUP BOT LEAN MODE: Skip all guards except toolFailureFabrication (handled in runFinalAnswerGuards) ═══
      if (isGroupBotGateway) {
        // For group bots: accept the answer directly — no terse guard, no interleaved verification, no guard pipeline
        // Only check toolFailureFabrication via a minimal guard pass
        const { checkToolFailureFabrication } = await import("./guard-protocols.ts");
        const tfg = checkToolFailureFabrication(stepContent, allToolResults, step, MAX_AGENT_STEPS);
        if (tfg.triggered) {
          applyGuardResult(tfg, currentMessages, controller, encoder, step, MAX_AGENT_STEPS);
          guardRetryCount++;
          if (guardRetryCount <= MAX_GUARD_RETRIES) continue;
        }
        finalContent = stepContent;
        await trackLoopUsage({ tokensInput: totalTokensInput, tokensOutput: totalTokensOutput, durationMs: Date.now() - loopStartTime, cachedTokens: totalCachedTokens, firstTokenMs: firstTokenAt > 0 ? firstTokenAt - loopStartTime : undefined, streamDurationMs: (firstTokenAt > 0 && lastTokenAt > firstTokenAt) ? lastTokenAt - firstTokenAt : undefined }, true, undefined, "main_final");
        break;
      }

      if (runTerseResponseGuard(stepContent, allToolResults, guardState, currentMessages, agentSettings, controller, encoder, step, MAX_AGENT_STEPS)) continue;
      if (runInterleavedVerification(stepContent, allToolResults, guardState, currentMessages, step, controller, encoder, MAX_AGENT_STEPS)) continue;

      if (isTurboTier) {
        finalContent = stepContent;
        await trackLoopUsage({ tokensInput: totalTokensInput, tokensOutput: totalTokensOutput, durationMs: Date.now() - loopStartTime, cachedTokens: totalCachedTokens, firstTokenMs: firstTokenAt > 0 ? firstTokenAt - loopStartTime : undefined, streamDurationMs: (firstTokenAt > 0 && lastTokenAt > firstTokenAt) ? lastTokenAt - firstTokenAt : undefined }, true, undefined, "main_final");
        break;
      }

      const guardStartTime = Date.now();
      const guardResult = await runFinalAnswerGuards(
        { isSimpleMessage, isDeepQuery, isTurboTier, observerResult, sanitizedMessage, agentSettings, controller, encoder, step, MAX_AGENT_STEPS, safeEnqueue, supabase, userId, TOOLS, complexityTier: ctx.complexityTier },
        stepContent, allToolCalls, allToolResults, guardState, currentMessages, planHistory,
        toolState.imageGenerationCompleted, toolState.lastGeneratedImageUrl,
      );
      const guardDuration = Date.now() - guardStartTime;

      if (guardResult.maxStepsOverride) MAX_AGENT_STEPS = guardResult.maxStepsOverride;
      if (guardResult.shouldContinue) {
        guardRetryCount++;
        // ═══ P1: Complete previous guard delta if exists, start new one ═══
        if (activeGuardDelta) {
          completeGuardDelta(serviceClient, activeGuardDelta, stepContent).catch(() => {});
        }
        const triggeredGuard = guardState.lastTriggeredGuard || 'unknown';
        activeGuardDelta = startGuardDelta(triggeredGuard, stepContent);
        spanTracker.recordSpan('guard_check', triggeredGuard, guardDuration, 'ok', { step, guardRetryCount, triggered: true });

        // P0: Hard cap on guard retries to prevent infinite loops
        if (guardRetryCount > MAX_GUARD_RETRIES) {
          // ═══ GRACEFUL DEGRADATION: If cap hit ONLY from AntiGhost, let LLM answer naturally ═══
          if (guardState.lastTriggeredGuard === "antiGhost" || guardState.antiGhostTriggered) {
            console.warn(`[Trace:${traceId}] Guard cap from AntiGhost — releasing tool constraint, letting LLM answer naturally.`);
            pendingForceToolChoice = false;
            guardState.antiGhostTriggered = false;
            guardState.promiseRetryCount = 99; // prevent re-trigger
            isGuardRetry = false;
            continue;
          }
          console.warn(`[Trace:${traceId}] Guard retry cap reached (${MAX_GUARD_RETRIES}). Accepting current answer.`);
          finalContent = stepContent;
          await trackLoopUsage({ tokensInput: totalTokensInput, tokensOutput: totalTokensOutput, durationMs: Date.now() - loopStartTime, cachedTokens: totalCachedTokens, firstTokenMs: firstTokenAt > 0 ? firstTokenAt - loopStartTime : undefined, streamDurationMs: (firstTokenAt > 0 && lastTokenAt > firstTokenAt) ? lastTokenAt - firstTokenAt : undefined }, true, undefined, "guard_cap_final");
          break;
        }
        isGuardRetry = guardResult.isGuardRetry;
        if (guardResult.forceToolChoice) pendingForceToolChoice = true;
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "pipeline_narration", text: "🔍 ပိုမှန်ကန်အောင် ထပ်ပြီး စစ်ဆေးနေတယ်၊ ခဏလေး စောင့်ပေးပါဦးနော်...", id: `narr_guard_${step}` })}\n\n`));
        continue;
      } else {
        // Guards passed — record as successful pass
        spanTracker.recordSpan('guard_check', 'final_answer_guards', guardDuration, 'ok', { step, allPassed: true });
        // P1: Complete guard delta — content after retry is the accepted content
        if (activeGuardDelta) {
          completeGuardDelta(serviceClient, activeGuardDelta, stepContent).catch(() => {});
          activeGuardDelta = null;
        }
      }

      // ═══ FINAL ANSWER NARRATION ═══
      safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "pipeline_narration", text: "✍️ အဖြေ ရေးသားနေတယ်၊ ခဏလေး စောင့်ပေးပါဦးနော်...", id: `narr_final_${step}` })}\n\n`));
      finalContent = stepContent;
      if (planHistory.length > 0) safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "task_plan", steps: [...planHistory, { id: "plan_respond", tool: "respond", label: "Composing response", emoji: "✅", status: "running" }] })}\n\n`));
      await trackLoopUsage({ tokensInput: totalTokensInput, tokensOutput: totalTokensOutput, durationMs: Date.now() - loopStartTime, cachedTokens: totalCachedTokens, firstTokenMs: firstTokenAt > 0 ? firstTokenAt - loopStartTime : undefined, streamDurationMs: (firstTokenAt > 0 && lastTokenAt > firstTokenAt) ? lastTokenAt - firstTokenAt : undefined }, true, undefined, "main_final");
      break;
    }

    // ═══ P0: STRUCTURED OUTPUT ENFORCEMENT — Validate & repair tool arguments ═══
    for (const tc of stepToolCalls) {
      const validation = validateToolArguments(tc.name, tc.arguments);
      if (validation.repairedArgs) {
        tc.arguments = validation.repairedArgs;
      }
      if (!validation.isValid && validation.errors.length > 0) {
        // Try LLM repair as last resort
        const repaired = await repairMalformedArgs(tc.name, JSON.stringify(tc.arguments), apiKey);
        if (repaired) {
          tc.arguments = repaired;
          console.log(`[ArgRepair] LLM-repaired args for ${tc.name}`);
        }
      }
    }

    // ═══ TOOL EXECUTION (delegated to modules) ═══
    const { dedupedCalls, earlyResults } = deduplicateToolCalls(stepToolCalls, toolState, safeEnqueue, encoder, controller);
    const stepToolResults: { name: string; result: any; error?: string }[] = [...earlyResults];

    // ═══ P1: CHECK CHECKPOINTS — skip already-completed tool calls on resume ═══
    const nonCheckpointedCalls: typeof dedupedCalls = [];
    for (const tc of dedupedCalls) {
      const cp = isCheckpointed(checkpoints, step, tc.name, tc.arguments);
      if (cp) {
        stepToolResults.push({ name: tc.name, result: cp.toolResult });
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_result", name: tc.name, result: cp.toolResult, resumed: true, call_id: tc.id })}\n\n`));
        console.log(`[Checkpoint] Skipped ${tc.name} step ${step} — already completed`);
      } else {
        nonCheckpointedCalls.push(tc);
      }
    }

    // ═══ P0: CHECK TOOL CACHE before execution ═══
    const uncachedCalls: ToolCallWithMetadata[] = [];
    for (const tc of nonCheckpointedCalls) {
      const cached = toolCache.get(tc.name, tc.arguments);
      if (cached) {
        stepToolResults.push({ name: tc.name, result: cached });
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_result", name: tc.name, result: cached, cached: true, call_id: tc.id })}\n\n`));
        console.log(`[ToolCache] Served cached result for ${tc.name}`);
      } else {
        uncachedCalls.push(tc);
      }
    }

    const classifiedTools = uncachedCalls.map((tool: any) => ({ tool, tier: getToolTier(tool.name, tool.arguments?.action, userStrictMode), action: tool.arguments?.action }));
    const autoTools = classifiedTools.filter(ct => ct.tier < 3);
    const confirmTools = classifiedTools.filter(ct => ct.tier >= 3);

    const toolExecCtx: ToolExecutionContext = { supabase, serviceClient, userId, sessionId, missionId, authHeader, source_channel, isAdmin, deviceContext, groupContext, agentSettings, userPermissions, userStrictMode, isUsingPersonalKey, userAISettings, controller, encoder, step, MAX_AGENT_STEPS, STEP_TIMEOUT_MS, TOOL_TIMEOUT_MS, IMAGE_TOOL_TIMEOUT_MS, LONG_RUNNING_TOOLS, safeEnqueue };

    if (autoTools.length > 0) {
      const toolExecStart = Date.now();
      const autoResults = await executeAutoTools(toolExecCtx, autoTools, toolState);
      spanTracker.recordSpan('tool_execution', `auto_tools_step_${step}`, Date.now() - toolExecStart, autoResults.some(r => r.error) ? 'error' : 'ok', { toolCount: autoTools.length, toolNames: autoTools.map(t => t.tool.name) });
      stepToolResults.push(...autoResults);

      // ═══ P0: CACHE new results + invalidate related caches for mutations ═══
      const READ_ONLY_ACTIONS = new Set(['list', 'get', 'get_balance', 'get_insights', 'get_status', 'get_leaderboard', 'list_recent', 'list_subscriptions', 'count', 'search']);
      for (const tr of autoResults) {
        if (!tr.error) {
          toolCache.set(tr.name, dedupedCalls.find(tc => tc.name === tr.name)?.arguments || {}, tr.result);
        }
        // Skip invalidation for read-only actions
        const matchingAction = dedupedCalls.find(tc => tc.name === tr.name)?.arguments?.action;
        if (!matchingAction || !READ_ONLY_ACTIONS.has(matchingAction)) {
          toolCache.invalidateRelated(tr.name);
        }
      }

      // ═══ P1: SAVE CHECKPOINTS for each successful tool result ═══
      for (const tr of autoResults) {
        const matchingCall = dedupedCalls.find(tc => tc.name === tr.name);
        saveCheckpoint(
          serviceClient, sessionId, missionId, userId, step,
          tr.name, matchingCall?.arguments || {}, tr.result, !tr.error
        ).catch(() => {}); // fire-and-forget
      }

      // Data-sparse retry
      const dataSparseResults = stepToolResults.filter((tr: any) => tr._dataSparse === true);
      if (dataSparseResults.length > 0 && !guardState.noResultsRetryAttempted && step < MAX_AGENT_STEPS - 1) {
        guardState.noResultsRetryAttempted = true;
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "pipeline_narration", text: "🔍 ပထမတစ်ကြိမ် ရှာတာ data မလုံလောက်ဘူး၊ keyword ပြောင်းပြီး ထပ်ရှာနေတယ်...", id: `narr_sparse_${step}` })}\n\n`));
        currentMessages.push({ role: "user", content: `[SYSTEM — DATA_SPARSE] Refine search with alternative keywords.` });
        allToolCalls.push(...stepToolCalls); allToolResults.push(...stepToolResults);
        continue;
      }
    }

    if (confirmTools.length > 0) {
      const confirmResult = await executeConfirmTools(toolExecCtx, confirmTools, toolState, { lastUserMessage: sanitizedMessage });
      stepToolResults.push(...confirmResult.results);

      // ═══ P1: CHECKPOINT confirm tools too ═══
      for (const tr of confirmResult.results) {
        const matchingCall = uncachedCalls.find(tc => tc.name === tr.name);
        saveCheckpoint(serviceClient, sessionId, missionId, userId, step, tr.name, matchingCall?.arguments || {}, tr.result, !tr.error).catch(() => {});
        toolCache.invalidateRelated(tr.name);
      }

      if (confirmResult.shouldBreak) { finalContent = confirmResult.breakContent || ""; allToolCalls.push(...stepToolCalls); allToolResults.push(...stepToolResults); break; }
    }

    allToolCalls.push(...stepToolCalls);
    allToolResults.push(...stepToolResults);

    // ═══ P1: DYNAMIC PLAN REVISION — evaluate and revise plan after tool execution ═══
    if (executionPlan) {
      const activeStep = executionPlan.steps.find(s => s.status === 'active');
      if (activeStep) {
        // Mark current step as done/error
        const stepHasError = stepToolResults.some(tr => tr.error || tr.result?.error);
        updatePlanStep(executionPlan, activeStep.id, stepHasError ? 'error' : 'done',
          stepToolResults.map(tr => `${tr.name}: ${tr.error ? 'FAILED' : 'OK'}`).join(', '));

        // Evaluate revisions for remaining steps
        for (const tr of stepToolResults) {
          const decisions = evaluatePlanRevision(executionPlan, activeStep.id, tr.name, tr.result, !!tr.error);
          if (decisions.length > 0) {
            const revision = applyPlanRevisions(executionPlan, decisions);
            if (revision.skippedCount + revision.addedCount + revision.revisedCount > 0) {
              // Emit updated plan to frontend
              safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "task_plan", steps: planToSSE(executionPlan) })}\n\n`));
              // Inject revision context for LLM
              const skipped = decisions.filter(d => d.action === 'skip').map(d => d.reason).join('; ');
              if (skipped) {
                currentMessages.push({ role: "user", content: `[PLAN REVISION] Steps skipped: ${skipped}. Focus on remaining steps.` });
              }
            }
          }
        }

        // Activate next step
        const nextStep = getNextPlanStep(executionPlan);
        if (nextStep) {
          updatePlanStep(executionPlan, nextStep.id, 'active');
          currentMessages.push({ role: "system", content: `[CURRENT STEP] Now execute: "${nextStep.title}" — ${nextStep.description}${nextStep.tool_hint ? ` (suggested tool: ${nextStep.tool_hint})` : ''}` });
        }
      }
    }

    // ═══ SYNC thinkingSteps with actual tool results ═══
    for (let i = 0; i < stepToolCalls.length; i++) {
      const tc = stepToolCalls[i];
      const tr = stepToolResults[i];
      const thoughtId = `thought_${tc.id || `call_${step}_${i}`}`;
      const isFail = tr?.error || tr?.result?.error || tr?.result?.success === false;
      const idx = thinkingSteps.findIndex(t => t.id === thoughtId);
      if (idx !== -1) {
        thinkingSteps[idx] = {
          ...thinkingSteps[idx],
          status: isFail ? "error" : "done",
          detail: isFail
            ? (tr?.error || tr?.result?.error || "Tool execution failed")
            : formatToolResult(tc.name, tr?.result),
        };
      }
    }

    // Update plan history
    const getToolEmoji2 = (n: string) => n.includes('search') ? '🔍' : n.includes('browser') ? '🌐' : n.includes('flowstate') ? '💰' : n.includes('workspace') ? '📋' : n.includes('generat') ? '✍️' : n.includes('memory') ? '🧠' : n.includes('image') ? '🎨' : '⚙️';
    for (let i = 0; i < stepToolCalls.length; i++) {
      const tc = stepToolCalls[i]; const tr = stepToolResults[i];
      const isFail = tr?.error || tr?.result?.error || tr?.result?.success === false;
      const toolCtx = getToolContext(tc.name, JSON.stringify(tc.arguments || {}));
      planHistory.push({ id: `plan_${step}_${i}`, tool: tc.name, label: toolCtx || formatToolName(tc.name), emoji: getToolEmoji2(tc.name), status: isFail ? "error" : "done" });
    }
    // ═══ BATCHED LLM NARRATION — one call per step, no template fallback ═══
    if (stepToolResults.length > 0) {
      const batchNarrationId = `narr_batch_${step}`;
      const resolvedUserName = sanitizeUserName(ctx.sessionUserName || groupContext?.sender_name || '');
      const completedNames = stepToolCalls.map(tc => tc.name).join(', ');
      const anyFail = stepToolResults.some(tr => tr.error || tr.result?.error || tr.result?.success === false);
      const narrationLLMConfig = resolveInternalLLM({
        systemGoogleKey: systemKeyCheck?.google_system_api_key,
        personalGeminiKey: userAISettings?.gemini_api_key,
        mainModel: modelToUse,
        taskType: 'narration',
      });
      if (narrationLLMConfig) {
        generateNarrationAsync(narrationLLMConfig.apiKey, {
          phase: "post_tool",
          userQuery: sanitizedMessage.slice(0, 100),
          toolName: completedNames,
          toolResult: stepToolResults.map(tr => JSON.stringify(tr?.result || '').slice(0, 100)).join(' | '),
          isFail: anyFail,
          remainingTools: 0,
          botName: agentSettings?.bot_name || "BeeBot",
          botEmoji: agentSettings?.bot_emoji || "🐝",
          personalityMode: agentSettings?.personality_mode || "friendly",
          userName: resolvedUserName,
        }, { provider: narrationLLMConfig.provider, resolvedConfig: { endpoint: narrationLLMConfig.endpoint, model: narrationLLMConfig.model, headers: narrationLLMConfig.headers } }).then(text => {
          if (text) try { safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "pipeline_narration", text, id: batchNarrationId })}\n\n`)); } catch {}
        }).catch(() => {});
      }
    }
    if (planHistory.length > 0) safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "task_plan", steps: [...planHistory, { id: "plan_respond", tool: "respond", label: "Composing response", emoji: "✅", status: "pending" }] })}\n\n`));

    // Circuit breaker
    const newlyTripped = updateCircuitBreaker(stepToolResults, toolState);
    if (newlyTripped.length > 0) {
      currentMessages.push({ role: "user", content: `[SYSTEM] CIRCUIT_BREAKER: ${newlyTripped.join(', ')} PERMANENTLY DISABLED. Do NOT call them again.` });
    }

    // Model Sovereignty: tryLocalTemplate REMOVED — all responses go through LLM synthesis
    const hasToolErrors = stepToolResults.some(tr => tr.error || tr.result?.error || tr.result?.success === false);

    // Post-tool guards (delegated) — skip for group bot lean mode
    if (!isTurboTier && !isGroupBotGateway) {
      const postGuardResult = await runPostToolGuards(
        { isSimpleMessage, isDeepQuery, isTurboTier, observerResult, sanitizedMessage, agentSettings, controller, encoder, step, MAX_AGENT_STEPS, safeEnqueue, supabase, userId, TOOLS, complexityTier: ctx.complexityTier },
        stepContent, stepToolCalls, stepToolResults, guardState, currentMessages, TOOLS, toolState.disabledToolsSet,
      );
      if (postGuardResult.maxStepsOverride) MAX_AGENT_STEPS = postGuardResult.maxStepsOverride;
      if (postGuardResult.shouldBreak) {
        await trackLoopUsage({ tokensInput: totalTokensInput, tokensOutput: totalTokensOutput, durationMs: Date.now() - loopStartTime, cachedTokens: totalCachedTokens, firstTokenMs: firstTokenAt > 0 ? firstTokenAt - loopStartTime : undefined, streamDurationMs: (firstTokenAt > 0 && lastTokenAt > firstTokenAt) ? lastTokenAt - firstTokenAt : undefined }, true, undefined, "post_tool_guard_final");
        break;
      }
      if (postGuardResult.shouldContinue) {
        guardRetryCount++;
        if (guardRetryCount > MAX_GUARD_RETRIES) {
          console.warn(`[Trace:${traceId}] Post-tool guard retry cap reached (${MAX_GUARD_RETRIES}). Breaking loop.`);
          break;
        }
        isGuardRetry = postGuardResult.isGuardRetry;
        if (postGuardResult.forceToolChoice) pendingForceToolChoice = true;
        continue;
      }
    }

    // Append tool results + nudge
    currentMessages.push({
      role: "assistant", content: stepContent || null,
      tool_calls: stepToolCalls.filter(tc => tc?.name).map((tc, idx) => {
        const toolCall: any = { id: tc.id || `call_${step}_${idx}`, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } };
        if (tc.thought_signature) toolCall.extra_content = { google: { thought_signature: tc.thought_signature } };
        return toolCall;
      }),
    });
    for (let i = 0; i < stepToolCalls.length; i++) {
      const tc = stepToolCalls[i]; if (!tc?.name) continue;
      const tr = stepToolResults[i];
      currentMessages.push({ role: "tool", tool_call_id: tc.id || `call_${step}_${i}`, name: tc.name, content: (() => { const raw = JSON.stringify(tr?.error ? { error: tr.error } : tr?.result); const truncated = raw.length > 1500 ? raw.slice(0, 1497) + "..." : raw; return sanitizeToolResultContent(truncated); })() });
    }

    // Soul Protocol 2: Lessons Learned
    if (hasToolErrors) {
      const failed = stepToolResults.filter(tr => tr.error), succeeded = stepToolResults.filter(tr => !tr.error);
      if (succeeded.length > 0 && failed.length > 0) {
        Promise.resolve(supabase.from("agent_self_improvements").insert({ improvement_type: "tool_usage", insight: `Tool "${failed[0].name}" failed. Alternative "${succeeded[0].name}" succeeded.`, learned_from: { session_id: sessionId, failed_tool: failed[0].name, success_tool: succeeded[0].name }, confidence: 0.8, priority: "medium", is_active: true })).catch(e => console.warn('[Audit] Self-improvement write failed:', e?.message));
      }
    }

    // Forensic step audit — DECOMMISSIONED for hot path (per agent_communication_log cleanup).
    // Step-level audit writes removed; aggregate stats now derived from agent_telemetry_spans.

    // SmartCompact v3 (delegated)
    smartCompactV3(currentMessages);

    if (thinkingSteps.length > 20) thinkingSteps = thinkingSteps.slice(-20);

    // Nudge (delegated)
    const completedToolNamesList = stepToolResults.map(tr => tr.name).join(", ");
    const nudgeContent = buildNudgeContent(stepToolResults, completedToolNamesList, agentSettings, step, MAX_AGENT_STEPS, TOOLS, toolState.disabledToolsSet);

    if (hasToolErrors && step < MAX_AGENT_STEPS - 1) {
      emitThinking(controller, encoder, `Tool failed, retrying...`, step, MAX_AGENT_STEPS);
    }

    // ═══ F1: Widget Opportunity Detection — nudge agent to visualize dashboard-shape data ═══
    let widgetHintLine = "";
    let widgetShouldHaveRendered = false;
    const widgetAlreadyCalled = stepToolCalls.some(tc => tc?.name === "show_widget" || tc?.name === "compose_dashboard");
    if (widgetAlreadyCalled) {
      // Mark as rendered for telemetry (read by streaming-engine on usage insert)
      (globalThis as any).__beebot_last_widget_rendered = true;
      // ─── POST-WIDGET REFLECTION NUDGE ───
      // Force the next LLM step to write a 2–4 sentence Insight Block instead
      // of stopping silently after the widget renders.
      widgetHintLine = `\n\n[Post-Widget Reflection Required] You just rendered a widget for the user. ` +
        `Your reply MUST end with a short Insight Block (2–4 sentences, ≤80 words):\n` +
        `  1) What it shows — the headline pattern (biggest mover / outlier / trend direction). Do NOT re-list raw numbers already on the chart.\n` +
        `  2) Why it matters — context tied to the user's goal or period.\n` +
        `  3) Recommended next step — one concrete action OR one follow-up question BeeBot can run.\n` +
        `Tone: friendly, confident, Burmese if the user wrote Burmese. Never stop at the widget alone.`;
    } else {
      for (let i = 0; i < stepToolResults.length; i++) {
        const tr = stepToolResults[i];
        if (!tr || tr.error || !tr.result) continue;
        const opp = detectWidgetOpportunity(tr.name, tr.result);
        if (opp) {
          widgetHintLine = `\n\n${opp.hint}`;
          widgetShouldHaveRendered = true;
          console.log(`[WidgetHint] ${tr.name} → ${opp.reason} → suggest ${opp.suggestedPreset}`);
          break; // one hint per turn is enough
        }
      }
    }
    if (widgetShouldHaveRendered) (globalThis as any).__beebot_last_widget_should_render = true;

    currentMessages.push({ role: "user", content: nudgeContent + widgetHintLine });
    emitStepComplete(controller, encoder, step, stepToolCalls.map(tc => tc.name));
    emitThinking(controller, encoder, "Synthesizing information... 🧠", step + 1, MAX_AGENT_STEPS);
    // ═══ RELAY NARRATION — LLM-only, no template fallback ═══
    if (step < MAX_AGENT_STEPS) {
      const relayId = `narr_relay_${step}`;
      const relayUserName = sanitizeUserName(ctx.sessionUserName || groupContext?.sender_name || '');
      const relayLLMConfig = resolveInternalLLM({
        systemGoogleKey: systemKeyCheck?.google_system_api_key,
        personalGeminiKey: userAISettings?.gemini_api_key,
        mainModel: modelToUse,
        taskType: 'narration',
      });
      if (relayLLMConfig) {
        generateNarrationAsync(relayLLMConfig.apiKey, {
          phase: "relay",
          userQuery: sanitizedMessage.slice(0, 100),
          completedTools: completedToolNamesList,
          currentStep: step,
          maxSteps: MAX_AGENT_STEPS,
          botName: agentSettings?.bot_name || "BeeBot",
          botEmoji: agentSettings?.bot_emoji || "🐝",
          personalityMode: agentSettings?.personality_mode || "friendly",
          userName: relayUserName,
        }, { provider: relayLLMConfig.provider, resolvedConfig: { endpoint: relayLLMConfig.endpoint, model: relayLLMConfig.model, headers: relayLLMConfig.headers } }).then(text => {
          if (text) try { safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "pipeline_narration", text, id: relayId })}\n\n`)); } catch {}
        }).catch(() => {});
      }
    }
  }

  // ═══ POST-LOOP ═══
  if (!finalContent || finalContent.trim().length < 3) {
    if (planHistory.length > 0) safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "task_plan", steps: [...planHistory, { id: "plan_respond", tool: "respond", label: "Composing response", emoji: "✅", status: "running" }] })}\n\n`));
    // P0: Use smart fallback with user context instead of generic error
    const provTypePL = providerChain[currentProviderIndex]?.provider;
    finalContent = allToolResults.length > 0
      ? (await synthesizeFromToolResults(allToolResults, sanitizedMessage, modelToUse, apiEndpoint, apiKey, provTypePL, agentSettings)
         || narrateWidgetResult(allToolResults, sanitizedMessage, agentSettings)
         || generateSmartFallback(allToolResults, sanitizedMessage, agentSettings))
      : generateFallbackResponse(allToolResults, agentSettings);
    await trackLoopUsage({ tokensInput: totalTokensInput, tokensOutput: totalTokensOutput, durationMs: Date.now() - loopStartTime, cachedTokens: totalCachedTokens, firstTokenMs: firstTokenAt > 0 ? firstTokenAt - loopStartTime : undefined, streamDurationMs: (firstTokenAt > 0 && lastTokenAt > firstTokenAt) ? lastTokenAt - firstTokenAt : undefined }, true, undefined, "fallback_final");
  }

  // ═══ GROUP BOT FALLBACK GUARANTEE: Never return empty to group ═══
  if (isGroupBotGateway && (!finalContent || finalContent.trim().length < 5)) {
    console.warn(`[GroupBot-Fallback] Empty content after loop — generating graceful fallback`);
    if (allToolResults.length > 0) {
      const provTypeGB = providerChain[currentProviderIndex]?.provider;
      const smartFB = await synthesizeFromToolResults(allToolResults, sanitizedMessage, modelToUse, apiEndpoint, apiKey, provTypeGB, agentSettings)
        || narrateWidgetResult(allToolResults, sanitizedMessage, agentSettings)
        || generateSmartFallback(allToolResults, sanitizedMessage);
      if (smartFB && smartFB.trim().length > 10) {
        finalContent = smartFB;
        console.log(`[GroupBot-Fallback] LLM synthesis/smart fallback generated from ${allToolResults.length} tool results`);
      }
    }
    if (!finalContent || finalContent.trim().length < 5) {
      const isBurmese = /[\u1000-\u109F]/.test(sanitizedMessage);
      finalContent = isBurmese
        ? "🐝 ဒီအကြောင်းကို ကျွန်တော် ယခုအချိန်မှာ မဖြေနိုင်ပါဘူး။ နောက်တစ်ခါ ထပ်မေးပေးပါ ဗျ။"
        : "🐝 I couldn't process that request right now. Please try again.";
      console.log(`[GroupBot-Fallback] Static fallback used`);
    }
  }

  // ═══ Cross-path escalation to autonomous orchestrator REMOVED (2026-04) ═══
  // Per user request, no automatic escalation. If the agentic loop produced thin
  // output after exhausting guards, we keep finalContent (or fallback) inline.
  // The user can opt into Deep Run / Automations if they want a heavier pass.
  if (!isGroupBotGateway && (!finalContent || finalContent.trim().length < 200) && allToolResults.length >= 3 && guardRetryCount >= MAX_GUARD_RETRIES && !ctx.continuation) {
    console.log("[CrossPath] Budget exhausted with thin output — using inline fallback (autonomous escalation disabled)");
    if (!finalContent || finalContent.trim().length < 200) {
      finalContent = generateFallbackResponse(allToolResults, agentSettings);
    }
  }

  // ═══ Cognitive v2: Self-Critique pre-output layer ═══
  try {
    const { shouldCritique, runSelfCritique, logCritique } =
      await import("./cognitive/self-critique.ts");
    const usedTools = (allToolResults?.length ?? 0) > 0;
    if (
      finalContent &&
      !finalIsError &&
      shouldCritique({ tier: ctx.complexityTier, usedTools, draftLen: finalContent.length })
    ) {
      const toolSummaries = (allToolResults || []).slice(0, 6).map((r: any) => ({
        tool: r.name,
        ok: !r.error,
        summary: typeof r.result === "string" ? r.result.slice(0, 200) : JSON.stringify(r.result ?? {}).slice(0, 200),
      }));
      // Emit transparency: tell user we're auditing the draft (no silent swap)
      safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "critique_started" })}\n\n`));
      const critique = await runSelfCritique({
        userMessage: sanitizedMessage,
        draft: finalContent,
        toolResults: toolSummaries,
        userContextPreference: null,
        lessons: [],
      });
      const willSwap = !!(critique && critique.verdict !== "ok" && critique.refined_answer && critique.refined_answer.length > 30);
      if (willSwap && critique) {
        const sanitizedIssues = (critique.issues || []).slice(0, 3).map((s) => s.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "[email]").slice(0, 140));
        console.log(`[SelfCritique] ${critique.verdict} → revising draft (issues: ${sanitizedIssues.join("; ")})`);
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "critique_revising", issues: sanitizedIssues, verdict: critique.verdict })}\n\n`));
        finalContent = critique.refined_answer!;
      }
      safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "critique_done", changed: willSwap })}\n\n`));
      if (critique) {
        logCritique(supabase, userId, sessionId, null, finalContent, critique).catch(() => {});
      }
    }
  } catch (e) {
    console.warn("[SelfCritique] skipped:", e);
  }

  emitFinalContentIfNeeded(finalContent);

  if (planHistory.length > 0) safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "task_plan", steps: [...planHistory, { id: "plan_respond", tool: "respond", label: "Composing response", emoji: "✅", status: "done" }] })}\n\n`));

  // Thinking cache (delegated)
  await saveThinkingCache(supabase, sessionId, capturedThinkingContent, stepThinkingMap, allToolCalls, allToolResults, finalContent, finalIsError, isSimpleMessage, observerResult, sanitizedMessage);

  // Finalize truly orphan thoughts (only those never synced above)
  thinkingSteps = thinkingSteps.map(t => {
    if (t.status !== "loading") return t;
    // Check if a matching tool result exists
    const matchingResult = allToolResults.find(tr => t.tool_name && tr.name === t.tool_name && !tr.error);
    if (matchingResult) {
      return { ...t, status: "done" as const, detail: formatToolResult(matchingResult.name, matchingResult.result) };
    }
    return { ...t, status: "error" as const, detail: t.detail || "No result received" };
  });

  // ═══ P0+P1+P2+P3: TELEMETRY — Record full request span with SLA data + flush ═══
  const totalDuration = Date.now() - loopStartTime;
  const exceededP95 = totalDuration > effectiveSLA.p95Ms;
  const taskType = observerResult?.primaryAction || 'general';
  const tier = ctx.complexityTier || 'moderate';
  spanTracker.recordSpan('full_request', 'agentic_loop', totalDuration, finalIsError ? 'error' : 'ok', {
    steps: step,
    toolCallCount: allToolCalls.length,
    guardRetries: guardRetryCount,
    model: modelToUse,
    complexityTier: tier,
    contentLength: finalContent.length,
    isGroupBot: isGroupBotGateway,
    sla_p50_target: effectiveSLA.p50Ms,
    sla_p95_target: effectiveSLA.p95Ms,
    sla_source: tunedBudget?.source || 'static',
    exceeded_p95: exceededP95,
    taskType,
    edgeRouterSource: edgeRoute.source,
    edgeRouterSkippedObserver: edgeRoute.skipObserver,
  });
  if (exceededP95) {
    console.warn(`[SLA] ⚠️ P95 exceeded: ${totalDuration}ms > ${effectiveSLA.p95Ms}ms target (tier: ${tier}, source: ${tunedBudget?.source || 'static'})`);
  }

  // P2: Model Performance Registry — record per-task success data
  recordModelPerformance(serviceClient, {
    model: modelToUse,
    taskType,
    complexityTier: tier,
    latencyMs: totalDuration,
    outputLength: finalContent.length,
    guardRetries: guardRetryCount,
    success: !finalIsError && finalContent.trim().length > 10,
  }).catch(() => {});

  // P2: Predictive Health — detect anomalies
  detectHealthAnomalies(serviceClient, traceId, {
    model: modelToUse,
    latencyMs: totalDuration,
    guardRetries: guardRetryCount,
    complexityTier: tier,
    toolCallCount: allToolCalls.length,
  }).catch(() => {});

  // ═══ P4: SHADOW COMPARISON — telemetry only (Phase 1) ═══
  if (shadowExec) {
    shadowExec.promise.then(shadowResult => {
      const comparison = compareShadowResult(finalContent, shadowResult);
      spanTracker.recordSpan('llm_call', 'shadow_execution', shadowResult?.latencyMs || 0, shadowResult?.error ? 'error' : 'ok', comparison);
      console.log(`[P4-Shadow] Result: available=${comparison.shadow_available}, ratio=${comparison.length_ratio || 'N/A'}`);
    }).catch(() => {});
    // Abort shadow if still running
    setTimeout(() => shadowExec?.abort(), 500);
  }

  // Fire-and-forget telemetry flush
  spanTracker.flush(serviceClient).catch(() => {});

  // Final flush of resumable event ringbuffer (best-effort)
  if (resumableTracker) finalizeTracker(resumableTracker).catch(() => {});

  // ═══ Phase 2.7 — PGE Evaluator + Revise Loop (P0 fix: now AWAITED with 1-round revise) ═══
  // If Planner ran, score the Generator's output. If score < 0.7, run a single
  // revise round using the same provider/model and replace finalContent.
  // Hard-capped at 1 revise; total extra latency budget ~8s.
  if (pgePlan && !finalIsError && finalContent) {
    try {
      const { runEvaluatorStage, shouldRevise, buildReviseInstruction } = await import("./pge-pipeline.ts");
      const evalArt = await runEvaluatorStage({
        serviceClient, userId, sessionId,
        runId: pgeRunId,
        userMessage: sanitizedMessage,
        plan: pgePlan,
        generatorOutput: finalContent,
        generatorToolSummary: allToolResults.map((r: any) => `${r.name}:${r.error ? "ERR" : "ok"}`).join(", "),
        providerType: pgeProviderType,
        apiKey, apiEndpoint, agentSettings,
        reviseRound: 0,
      });

      if (shouldRevise(evalArt, 0) && evalArt) {
        console.log(`[pge] revise loop triggered (score=${evalArt.score.toFixed(2)})`);
        const reviseInstruction = buildReviseInstruction(evalArt);
        const sys = `You are revising a previously produced answer. Follow the evaluator feedback exactly. Output the FINAL revised answer only — no preamble.`;
        const userPrompt =
          `Original user request:\n${sanitizedMessage}\n\n` +
          `Previous answer (to revise):\n${finalContent.slice(0, 12000)}\n` +
          reviseInstruction;
        try {
          const reviseSignal = AbortSignal.timeout(8000);
          let revised: string | null = null;
          if (pgeProviderType === "anthropic") {
            revised = await callAnthropicDirect(apiKey, sys, userPrompt, 0.4, 2048, reviseSignal, modelToUse);
          } else if (pgeProviderType === "google") {
            revised = await callGeminiDirect(apiKey, `${sys}\n\n${userPrompt}`, 0.4, 2048, reviseSignal, modelToUse);
          } else {
            // openrouter / xai / OpenAI-compatible providers
            revised = await callOpenAIDirect(apiKey, apiEndpoint, sys, userPrompt, 0.4, 2048, reviseSignal, modelToUse);
          }
          if (revised && revised.trim().length > 20) {
            finalContent = revised.trim();
            console.log(`[pge] revise applied — new length=${finalContent.length}`);
            // Persist revise artifact
            serviceClient.from("agent_run_artifacts").insert({
              user_id: userId, session_id: sessionId, run_id: pgeRunId,
              stage: "revise", payload: { score_before: evalArt.score, revised_length: finalContent.length, issues: evalArt.issues },
            }).then(() => {}, () => {});
          } else {
            console.warn(`[pge] revise returned empty/short — keeping original`);
          }
        } catch (revErr: any) {
          console.warn(`[pge] revise call failed: ${revErr?.message ?? revErr}`);
        }
      }
    } catch (e: any) {
      console.warn(`[pge] evaluator/revise pipeline error: ${e?.message}`);
    }
  }

  // ═══ WEBHOOK-1: session.completed / session.error (fire-and-forget) ═══
  const sessionDurationMs = Date.now() - sessionStartMs;
  if (finalIsError) {
    emitSessionError(serviceClient, userId, sessionId ?? null, {
      message: (finalContent || "agentic loop returned with error flag").slice(0, 500),
      stage: "agentic-loop",
    });
  } else {
    emitSessionCompleted(serviceClient, userId, sessionId ?? null, {
      duration_ms: sessionDurationMs,
      tool_calls: allToolCalls.length,
      tokens_in: totalTokensInput,
      tokens_out: totalTokensOutput,
      model: modelToUse,
    });
  }

  return { finalContent, finalIsError, allToolCalls, allToolResults, thinkingSteps, totalTokensInput, totalTokensOutput, earlyExit: false };
}
