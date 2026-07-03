// ═══ STREAMING ENGINE MODULE ═══
// Extracted from agent-chat/index.ts — Phase 2A
// Handles: SSE emitters, thinking steps, AI usage tracking, quality gate

// ═══ ANTHROPIC CONTENT BLOCK SSE EMITTERS ═══
// These follow the Anthropic streaming API specification for content block events.
// They run alongside the existing custom events to improve relay state tracking
// and enable cleaner multi-block message parsing on the frontend.

export function emitMessageStart(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  messageId: string,
  inputTokens?: number,
) {
  controller.enqueue(encoder.encode(
    `data: ${JSON.stringify({
      type: "message_start",
      message: {
        id: messageId,
        usage: inputTokens !== undefined ? { input_tokens: inputTokens } : undefined,
      },
    })}\n\n`
  ));
}

export function emitContentBlockStart(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  blockType: "text" | "tool_use",
  index: number,
  toolName?: string,
  toolId?: string,
) {
  const block: Record<string, unknown> = { type: blockType, index };
  if (blockType === "tool_use" && toolName) {
    block.name = toolName;
    block.id = toolId || `tool_${index}`;
  }
  controller.enqueue(encoder.encode(
    `data: ${JSON.stringify({ type: "content_block_start", content_block: block, index })}\n\n`
  ));
}

export function emitContentBlockDelta(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  index: number,
  deltaType: "text_delta" | "input_json_delta",
  text: string,
) {
  controller.enqueue(encoder.encode(
    `data: ${JSON.stringify({
      type: "content_block_delta",
      index,
      delta: deltaType === "text_delta"
        ? { type: "text_delta", text }
        : { type: "input_json_delta", partial_json: text },
    })}\n\n`
  ));
}

export function emitContentBlockStop(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  index: number,
) {
  controller.enqueue(encoder.encode(
    `data: ${JSON.stringify({ type: "content_block_stop", index })}\n\n`
  ));
}

export function emitMessageDelta(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  stopReason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use",
  outputTokens?: number,
) {
  controller.enqueue(encoder.encode(
    `data: ${JSON.stringify({
      type: "message_delta",
      delta: { stop_reason: stopReason },
      usage: outputTokens !== undefined ? { output_tokens: outputTokens } : undefined,
    })}\n\n`
  ));
}

// ═══ SSE EMITTERS (Safe — catch closed-stream errors) ═══
export function emitThinking(controller: ReadableStreamDefaultController, encoder: TextEncoder, step: string, currentStep?: number, totalSteps?: number) {
  try {
    const payload: { type: string; step: string; currentStep?: number; totalSteps?: number } = { 
      type: "thinking_status", 
      step 
    };
    if (currentStep !== undefined) payload.currentStep = currentStep;
    if (totalSteps !== undefined) payload.totalSteps = totalSteps;
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  } catch { /* stream closed by client disconnect */ }
}

// ═══ REASONING INFO — tells frontend when Deep Think is active ═══
export function emitReasoningInfo(controller: ReadableStreamDefaultController, encoder: TextEncoder, effort: string, model: string, complexityTier: string) {
  try {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
      type: "reasoning_info",
      effort,
      model,
      complexityTier,
    })}\n\n`));
  } catch { /* stream closed */ }
}

export function emitStepComplete(controller: ReadableStreamDefaultController, encoder: TextEncoder, step: number, completedTools: string[]) {
  try {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
      type: "step_complete", 
      step, 
      completedTools 
    })}\n\n`));
  } catch { /* stream closed by client disconnect */ }
}

// ═══ TOOL THINKING STEPS (Conversational — no robotic labels) ═══
export const TOOL_THINKING_STEPS: Record<string, { before: string; during: string; after: string }> = {
  search_knowledge_base: {
    before: "Let me check what I have on this...",
    during: "Going through the results...",
    after: "Got it, writing up the answer...",
  },
  search_web: {
    before: "Searching the web...",
    during: "Reading through results...",
    after: "Found relevant information!",
  },
  browser_scrape: {
    before: "Reading the webpage...",
    during: "Extracting content...",
    after: "Got the page content!",
  },
  generate_ai_content: {
    before: "Thinking about how to write this...",
    during: "Getting the structure right...",
    after: "Just finishing up...",
  },
  save_verbatim_content: {
    before: "Saving that for you...",
    during: "Almost done storing it...",
    after: "Saved!",
  },
  manage_flowstate: {
    before: "Let me pull up your finances...",
    during: "Crunching the numbers...",
    after: "All updated!",
  },
  manage_workspace_task: {
    before: "Checking your workspace...",
    during: "Working on that task...",
    after: "Done, workspace is up to date!",
  },
  manage_goal: {
    before: "Setting up your goal...",
    during: "Breaking it down into steps...",
    after: "Goal is all set!",
  },
  get_user_info: {
    before: "Let me look that up for you...",
    during: "Pulling your details...",
    after: "Got your info!",
  },
  manage_notifications: {
    before: "Checking your notifications...",
    during: "Looking through them...",
    after: "All caught up!",
  },
  get_app_navigation: {
    before: "Let me find that for you...",
    during: "Getting the right path...",
    after: "Here you go!",
  },
  update_agent_settings: {
    before: "Tweaking the settings...",
    during: "Applying your changes...",
    after: "All set!",
  },
  recall_episodic_memory: {
    before: "Let me think back...",
    during: "Going through our past chats...",
    after: "Found what I was looking for!",
  },
  get_my_config: {
    before: "Checking your setup...",
    during: "Reading through it...",
    after: "Got your config!",
  },
  send_push_notification: {
    before: "Sending that notification now...",
    during: "On its way to your device...",
    after: "Delivered!",
  },
  generate_file: {
    before: "Putting the file together...",
    during: "Building it out...",
    after: "Your file is ready!",
  },
  show_widget: {
    before: "Creating the visual for you...",
    during: "Rendering it now...",
    after: "Here it is!",
  },
};

// ═══ AI USAGE TRACKING ═══
export interface UsageMetrics {
  tokensInput: number;
  tokensOutput: number;
  durationMs: number;
  cachedTokens?: number;
  // ═══ STREAMING METRICS (Phase E — Observability) ═══
  firstTokenMs?: number;      // Time from request start → first text chunk arrived
  streamDurationMs?: number;  // Time spent actively streaming (first → last token)
}

type ApiUsageSource = "personal_key" | "lovable_gateway" | "system_key" | "gateway" | "system_grant" | "free_tier";

export interface UsageTraceContext {
  taskId?: string | null;
  clientRequestId?: string | null;
  traceId?: string | null;
  callKind?: string | null;
  provider?: string | null;
  requestCount?: number | null;
  metadata?: Record<string, unknown> | null;
}

function normalizeModelId(model: string): string {
  if (model.startsWith("google/")) return model.replace(/^google\//, "");
  return model;
}

function inferProvider(model: string, explicit?: string | null): string | null {
  if (explicit) return explicit;
  const lower = model.toLowerCase();
  if (lower.startsWith("claude")) return "anthropic";
  if (lower.includes("openrouter") || lower.includes("/")) return "openrouter";
  if (lower.startsWith("grok") || lower.includes("xai")) return "xai";
  if (lower.startsWith("gemini") || lower.startsWith("google/")) return "google";
  return null;
}

async function estimateUsageCost(
  supabase: any,
  modelUsed: string,
  metrics: UsageMetrics,
  apiSource: ApiUsageSource,
  providerHint?: string | null,
): Promise<{ estimatedCostUsd: number; estimatedIU: number; provider: string | null; costBasis: string }> {
  const modelId = normalizeModelId(modelUsed);
  let provider = inferProvider(modelUsed, providerHint);
  let estimatedIU = 0;

  try {
    const { data } = await supabase
      .from("model_cost_matrix")
      .select("provider, iu_per_1k_input, iu_per_1k_output, base_iu_per_request")
      .eq("model_id", modelId)
      .maybeSingle();

    if (data) {
      provider = provider || data.provider || null;
      estimatedIU =
        Number(data.base_iu_per_request || 0) +
        (metrics.tokensInput / 1000) * Number(data.iu_per_1k_input || 0) +
        (metrics.tokensOutput / 1000) * Number(data.iu_per_1k_output || 0);
    }
  } catch {
    // Best-effort telemetry must never break the user-facing agent run.
  }

  // USD is an operational estimate for cost modeling. Provider invoices remain
  // the source of truth, especially for OpenRouter pass-through pricing.
  let inputUsdPer1M = 0;
  let outputUsdPer1M = 0;
  const lower = modelId.toLowerCase();
  if (provider === "google" || lower.startsWith("gemini")) {
    const isPro = lower.includes("pro");
    inputUsdPer1M = isPro ? 1.25 : 0.075;
    outputUsdPer1M = isPro ? 5.0 : 0.30;
  } else if (provider === "anthropic" || lower.startsWith("claude")) {
    const isOpus = lower.includes("opus");
    inputUsdPer1M = isOpus ? 15.0 : 3.0;
    outputUsdPer1M = isOpus ? 75.0 : 15.0;
  } else if (provider === "xai" || lower.startsWith("grok")) {
    inputUsdPer1M = 3.0;
    outputUsdPer1M = 15.0;
  } else if (apiSource === "lovable_gateway" || apiSource === "gateway" || apiSource === "free_tier") {
    return {
      estimatedCostUsd: 0,
      estimatedIU: Number(estimatedIU.toFixed(4)),
      provider,
      costBasis: estimatedIU > 0 ? "iu_matrix_gateway_usd_unknown" : "gateway_usd_unknown",
    };
  }

  const estimatedCostUsd =
    (metrics.tokensInput / 1_000_000) * inputUsdPer1M +
    (metrics.tokensOutput / 1_000_000) * outputUsdPer1M;

  return {
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
    estimatedIU: Number(estimatedIU.toFixed(4)),
    provider,
    costBasis: estimatedIU > 0 ? "iu_matrix_plus_provider_usd_estimate" : "provider_usd_estimate",
  };
}

export async function trackAIUsage(
  supabase: any,
  userId: string,
  sessionId: string,
  apiSource: ApiUsageSource,
  modelUsed: string,
  metrics: UsageMetrics,
  isSuccessful: boolean,
  errorMessage?: string,
  cacheType?: "explicit" | "implicit" | "none",
  traceContext?: UsageTraceContext,
) {
  try {
    const cost = await estimateUsageCost(supabase, modelUsed, metrics, apiSource, traceContext?.provider);

    // ═══ Streaming throughput (tokens/sec) — only when we have output + duration ═══
    let tokensPerSec: number | null = null;
    const streamDur = metrics.streamDurationMs ?? metrics.durationMs;
    if (metrics.tokensOutput > 0 && streamDur > 0) {
      tokensPerSec = Number((metrics.tokensOutput / (streamDur / 1000)).toFixed(2));
    }

    // ═══ F6: Widget activation telemetry ═══
    // The agentic loop stashes these flags on globalThis after each turn.
    const widgetRendered = !!(globalThis as any).__beebot_last_widget_rendered;
    const widgetShouldHaveRendered = !!(globalThis as any).__beebot_last_widget_should_render;
    // Reset so we don't double-count on the next call
    (globalThis as any).__beebot_last_widget_rendered = false;
    (globalThis as any).__beebot_last_widget_should_render = false;

    await supabase.from("agent_ai_usage").insert({
      user_id: userId,
      session_id: sessionId,
      api_source: apiSource,
      model_used: modelUsed,
      tokens_input: metrics.tokensInput,
      tokens_output: metrics.tokensOutput,
      estimated_cost: cost.estimatedCostUsd,
      estimated_iu: cost.estimatedIU,
      request_duration_ms: metrics.durationMs,
      is_successful: isSuccessful,
      error_message: errorMessage || null,
      task_id: traceContext?.taskId || null,
      client_request_id: traceContext?.clientRequestId || null,
      trace_id: traceContext?.traceId || null,
      call_kind: traceContext?.callKind || "main_response",
      provider: cost.provider,
      request_count: Math.max(1, Math.floor(Number(traceContext?.requestCount || 1))),
      metadata: {
        ...(traceContext?.metadata || {}),
        cost_basis: cost.costBasis,
      },
      cached_tokens: metrics.cachedTokens || 0,
      cache_type: cacheType || (metrics.cachedTokens && metrics.cachedTokens > 0 ? 'implicit' : 'none'),
      first_token_ms: metrics.firstTokenMs ?? null,
      stream_duration_ms: metrics.streamDurationMs ?? null,
      tokens_per_sec: tokensPerSec,
      widget_rendered: widgetRendered,
      widget_should_have_rendered: widgetShouldHaveRendered,
    });
    
    const cacheInfo = metrics.cachedTokens ? `, cached: ${metrics.cachedTokens}` : '';
    const ttftInfo = metrics.firstTokenMs ? `, ttft: ${metrics.firstTokenMs}ms` : '';
    const tpsInfo = tokensPerSec ? `, tps: ${tokensPerSec}` : '';
    const traceInfo = traceContext?.traceId ? `, trace: ${traceContext.traceId}` : '';
    console.log(`[Usage] Tracked: ${apiSource}, ${modelUsed}, ${metrics.tokensInput}+${metrics.tokensOutput} tokens, requests=${traceContext?.requestCount || 1}${cacheInfo}, ${metrics.durationMs}ms${ttftInfo}${tpsInfo}${traceInfo}`);
  } catch (error) {
    console.error("Failed to track AI usage:", error);
  }
}

// ═══ SOUL PROTOCOL 1: Quality Score Gate ═══
export async function runQualityScoreGate(
  responseContent: string,
  userQuery: string,
  model: string,
  isPersonalKey: boolean,
  userAISettings: any,
  hasSystemGoogleKey: boolean,
  systemKeyCheck: any,
  hasSystemAnthropicKey: boolean
): Promise<number> {
  // RPM Protection: If main model is Pro (RPM=2) and only personal key, skip scoring to preserve RPM
  const isProModel = model.toLowerCase().includes('pro') && !model.toLowerCase().includes('flash');
  if (isProModel && isPersonalKey && !hasSystemGoogleKey) {
    console.log(`[QualityGate] Skipped — Pro model "${model}" (RPM=2), preserving RPM for main call`);
    return 95;
  }

  let scoringKey = "";
  let scoringEndpoint = "";
  let scoringHeaders: Record<string, string> = {};
  
  const { GEMINI_OPENAI_ENDPOINT } = await import("./api-endpoints.ts");
  if (isPersonalKey && userAISettings?.gemini_api_key) {
    scoringKey = userAISettings.gemini_api_key;
    scoringEndpoint = GEMINI_OPENAI_ENDPOINT;
    scoringHeaders = { "Authorization": `Bearer ${scoringKey}`, "Content-Type": "application/json" };
  } else if (hasSystemGoogleKey && systemKeyCheck?.google_system_api_key) {
    scoringKey = systemKeyCheck.google_system_api_key;
    scoringEndpoint = GEMINI_OPENAI_ENDPOINT;
    scoringHeaders = { "Authorization": `Bearer ${scoringKey}`, "Content-Type": "application/json" };
  } else {
    // Model Sovereignty: No OpenRouter fallback for background scoring — only Gemini keys
    console.log("[QualityGate] No API key available for scoring, passing by default");
    return 95;
  }
  
  const cleanScoringModel = model.startsWith("google/") ? model.replace(/^google\//, "") : model;
  const scoringModel = scoringEndpoint.includes('openrouter') ? "google/gemini-2.5-flash-lite" : (cleanScoringModel.includes("pro") ? "gemini-2.5-flash" : cleanScoringModel);
  
  try {
    const scoringResponse = await fetch(scoringEndpoint, {
      method: "POST",
      headers: scoringHeaders,
      body: JSON.stringify({
        model: scoringModel,
        messages: [
          { role: "system", content: "You are a quality scorer. Rate the response 0-100. Output ONLY the number." },
          { role: "user", content: `Query: ${userQuery.slice(0, 300)}\n\nResponse: ${responseContent.slice(0, 2000)}\n\nScore (0-100) based on: accuracy, completeness, specific data points, source citations. Output ONLY the number.` }
        ],
        temperature: 0.1,
        max_tokens: 10,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    
    if (!scoringResponse.ok) {
      console.warn(`[QualityGate] Scoring API returned ${scoringResponse.status}, passing by default`);
      return 95;
    }
    
    const scoringData = await scoringResponse.json();
    const scoreText = scoringData.choices?.[0]?.message?.content?.trim() || "95";
    const score = parseInt(scoreText.replace(/[^0-9]/g, ""), 10);
    
    return isNaN(score) ? 95 : Math.max(0, Math.min(100, score));
  } catch (e) {
    console.warn("[QualityGate] Scoring failed:", e);
    return 95;
  }
}

// ═══ BACKPRESSURE-AWARE ENQUEUE ═══
// Drops low-priority frames (text deltas) when the consumer is >64KB behind.
// Control events (tool_call, tool_result, thinking_block, heartbeat) are always kept.
const BACKPRESSURE_DROP_THRESHOLD = -65536; // -64KB

const LOW_PRIORITY_TYPES = new Set(["content_block_delta", "text_delta"]);

export function tryEnqueue(
  controller: ReadableStreamDefaultController,
  chunk: Uint8Array,
  lowPriority = false,
): void {
  try {
    const desired = controller.desiredSize ?? 0;
    if (lowPriority && desired < BACKPRESSURE_DROP_THRESHOLD) {
      return; // drop — consumer is too far behind
    }
    controller.enqueue(chunk);
  } catch {
    // controller already closed — ignore
  }
}

// ═══ RESUMABLE STREAM TRACKER ═══
// Stamps per-mission monotonic event_id onto key SSE frames and batches
// them to the loop_checkpoint_events ringbuffer for Last-Event-ID replay.

export interface ResumableEventTracker {
  missionId: string;
  nextEventId: number;
  batch: Array<{ event_id: number; event_type: string; payload: unknown }>;
  flushTimer: ReturnType<typeof setTimeout> | null;
  supabase: any;
}

const PERSIST_BATCH_SIZE = 25;
const PERSIST_DEBOUNCE_MS = 250;
// Event types worth persisting for resume replay
const PERSIST_TYPES = new Set([
  "content_block_delta", "tool_call", "tool_result",
  "step_complete", "agent_step", "thinking_block",
]);

export function createResumableTracker(missionId: string, supabase: any): ResumableEventTracker {
  return { missionId, nextEventId: 1, batch: [], flushTimer: null, supabase };
}

export function stampEvent(
  tracker: ResumableEventTracker,
  eventType: string,
  payload: unknown,
): { event_id: number; payload: unknown } {
  const event_id = tracker.nextEventId++;
  if (PERSIST_TYPES.has(eventType)) {
    tracker.batch.push({ event_id, event_type: eventType, payload });
    if (tracker.batch.length >= PERSIST_BATCH_SIZE) {
      _flushBatch(tracker);
    } else if (!tracker.flushTimer) {
      tracker.flushTimer = setTimeout(() => _flushBatch(tracker), PERSIST_DEBOUNCE_MS);
    }
  }
  return { event_id, payload };
}

export async function replayEventsSince(
  tracker: ResumableEventTracker,
  sinceEventId: number,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
): Promise<void> {
  try {
    const { data, error } = await tracker.supabase
      .from("loop_checkpoint_events")
      .select("event_id, event_type, payload")
      .eq("mission_id", tracker.missionId)
      .gt("event_id", sinceEventId)
      .gt("ttl_at", new Date().toISOString())
      .order("event_id", { ascending: true })
      .limit(200);

    if (error || !data?.length) return;

    for (const row of data) {
      const frame = `data: ${JSON.stringify({ ...(row.payload as object), event_id: row.event_id })}\n\n`;
      controller.enqueue(encoder.encode(frame));
    }
    controller.enqueue(encoder.encode(
      `data: ${JSON.stringify({ type: "resume_replay_complete", replayed: data.length })}\n\n`
    ));
  } catch (e) {
    console.warn("[ResumableStream] replay failed:", e);
  }
}

export async function finalizeTracker(tracker: ResumableEventTracker): Promise<void> {
  if (tracker.flushTimer) {
    clearTimeout(tracker.flushTimer);
    tracker.flushTimer = null;
  }
  await _flushBatch(tracker);
}

async function _flushBatch(tracker: ResumableEventTracker): Promise<void> {
  tracker.flushTimer = null;
  if (!tracker.batch.length) return;
  const rows = tracker.batch.splice(0);
  try {
    await tracker.supabase.from("loop_checkpoint_events").insert(
      rows.map(r => ({
        mission_id: tracker.missionId,
        event_id: r.event_id,
        event_type: r.event_type,
        payload: r.payload,
      }))
    );
  } catch (e) {
    console.warn("[ResumableStream] batch flush failed:", e);
  }
}
