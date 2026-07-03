// ═══ Satellite Usage Logger ═══
// Lightweight fire-and-forget logger for non-main LLM calls (observer, narration,
// memory, embeddings, planner, evaluator, revise, tool_internal).
// Writes directly to agent_ai_usage via PostgREST so we don't pay supabase-js init.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export type SatelliteCallKind =
  | "observer"
  | "narration"
  | "memory_reflection"
  | "memory_summary"
  | "memory_tagging"
  | "synthesis_fallback"
  | "embedding"
  | "planner"
  | "evaluator"
  | "revise"
  | "tool_internal";

export interface SatelliteUsageRecord {
  userId: string;
  sessionId?: string | null;
  messageId?: string | null;
  runId?: string | null;
  traceId?: string | null;
  taskId?: string | null;
  callKind: SatelliteCallKind;
  model: string;
  provider?: string;        // google | openai | anthropic | …
  apiSource?: string;       // personal_key | system_key | gateway
  tokensInput?: number;
  tokensOutput?: number;
  cachedTokens?: number;
  durationMs?: number;
  isSuccessful?: boolean;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

// Gemini pricing per 1M tokens (USD) — keep in sync with streaming-engine.ts
function estimateCostUsd(model: string, tokensInput: number, tokensOutput: number): number {
  const lower = model.toLowerCase();
  let inPrice = 0.075, outPrice = 0.30;
  if (lower.includes("pro") && !lower.includes("flash")) { inPrice = 1.25; outPrice = 5.0; }
  else if (lower.includes("embedding")) { inPrice = 0.025; outPrice = 0; }
  return Number(((tokensInput / 1_000_000) * inPrice + (tokensOutput / 1_000_000) * outPrice).toFixed(6));
}

/**
 * Fire-and-forget usage log. Never throws — failures are logged to console only.
 * Safe to call from any satellite/background LLM path without await.
 */
export function logSatelliteUsage(rec: SatelliteUsageRecord): void {
  if (!SUPABASE_URL || !SERVICE_KEY || !rec.userId) return;

  const tokensInput = Math.max(0, Math.floor(rec.tokensInput ?? 0));
  const tokensOutput = Math.max(0, Math.floor(rec.tokensOutput ?? 0));
  const cost = estimateCostUsd(rec.model, tokensInput, tokensOutput);

  const body = {
    user_id: rec.userId,
    session_id: rec.sessionId ?? null,
    message_id: rec.messageId ?? null,
    run_id: rec.runId ?? null,
    trace_id: rec.traceId ?? null,
    task_id: rec.taskId ?? null,
    call_kind: rec.callKind,
    api_source: rec.apiSource ?? "personal_key",
    provider: rec.provider ?? "google",
    model_used: rec.model,
    tokens_input: tokensInput,
    tokens_output: tokensOutput,
    cached_tokens: rec.cachedTokens ?? 0,
    estimated_cost: cost,
    request_duration_ms: rec.durationMs ?? null,
    is_successful: rec.isSuccessful ?? true,
    error_message: rec.errorMessage ?? null,
    metadata: rec.metadata ?? {},
    request_count: 1,
  };

  // Fire and forget — do not await
  fetch(`${SUPABASE_URL}/rest/v1/agent_ai_usage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Prefer": "return=minimal",
    },
    body: JSON.stringify(body),
  }).catch((e) => console.warn(`[UsageLogger] ${rec.callKind} log failed: ${e?.message ?? e}`));
}
