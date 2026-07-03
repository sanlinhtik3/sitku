// ═══ Internal LLM Caller — Provider-Aware Resolver for Background/Helper Calls ═══
// Single source of truth for all non-main LLM calls (narration, memory, scoring, tool AI).
// Priority: System Google Key → Personal Gemini Key → Skip
// RPM Budget: Flexible guard via rpm-budget-guard.ts — no rigid skip, budget decides per-call.
//
// ═══ TASK-TYPE ROUTING (Brain Sovereignty + Smart Helper Routing) ═══
// Diversifies background helper calls across multiple small models so a single
// model hiccup doesn't cascade into total satellite failure. Each task picks
// the right-fit small model. The user-selected MAIN model is never touched here.

import { GEMINI_OPENAI_ENDPOINT } from "./api-endpoints.ts";
import { tryLLMCall } from "./rpm-budget-guard.ts";

export type InternalTaskType =
  | 'observer'           // intent classification (fast, tiny)
  | 'narration'          // pre/post tool user-facing micro-text
  | 'memory_summary'     // session compaction (needs ≥8K context)
  | 'memory_reflection'  // post-interaction JSON scoring
  | 'memory_tagging'     // classification/tagging
  | 'synthesis_fallback';// emergency synthesis when main fails

/** Map each task to its best-fit small model.
 *  All entries are Google models so they share the same key/endpoint —
 *  diversification spreads load across model RPM buckets without changing provider. */
const TASK_MODEL_MAP: Record<InternalTaskType, string> = {
  observer:           'gemini-2.5-flash-lite',
  narration:          'gemini-2.5-flash-lite',
  memory_tagging:     'gemini-2.5-flash-lite',
  memory_reflection:  'gemini-2.5-flash-lite',
  memory_summary:     'gemini-3.5-flash',       // larger context window for compaction
  synthesis_fallback: 'gemini-3.5-flash',       // quality matters when main fails
};

export interface InternalLLMConfig {
  apiKey: string;
  endpoint: string;
  model: string;
  provider: 'google';
  headers: Record<string, string>;
  taskType?: InternalTaskType;
}

export function resolveInternalLLM(opts: {
  systemGoogleKey?: string | null;
  personalGeminiKey?: string | null;
  personalOpenrouterKey?: string | null;
  userModel?: string | null;
  mainModel?: string | null;
  taskType?: InternalTaskType;
}): InternalLLMConfig | null {
  const taskType: InternalTaskType = opts.taskType || 'narration';
  const helperModel = TASK_MODEL_MAP[taskType];

  // ═══ FIX #5: Skip narration entirely for personal Pro key users (RPM=2) ═══
  // Pro keys have a 2 RPM limit; satellite calls steal budget from the main reply.
  const mainModel = (opts.userModel || opts.mainModel || '').toLowerCase();
  const isProModel = mainModel.includes('pro') && !mainModel.includes('flash');
  if (isProModel && opts.personalGeminiKey && !opts.systemGoogleKey) {
    console.log(`[InternalLLM] Skipped task=${taskType} — personal Pro key user, preserving RPM for main reply`);
    return null;
  }
  // Priority 1: System Google key (free for user, no rate limit impact on user's key)
  if (opts.systemGoogleKey) {
    return {
      apiKey: opts.systemGoogleKey,
      endpoint: GEMINI_OPENAI_ENDPOINT,
      model: helperModel,
      provider: 'google',
      headers: { "Authorization": `Bearer ${opts.systemGoogleKey}`, "Content-Type": "application/json" },
      taskType,
    };
  }
  // Priority 2: Personal Gemini key — rpm-budget-guard.ts handles RPM gating per-call
  if (opts.personalGeminiKey) {
    return {
      apiKey: opts.personalGeminiKey,
      endpoint: GEMINI_OPENAI_ENDPOINT,
      model: helperModel,
      provider: 'google',
      headers: { "Authorization": `Bearer ${opts.personalGeminiKey}`, "Content-Type": "application/json" },
      taskType,
    };
  }
  // No key available — skip background call
  return null;
}

/** Quick helper to call internal LLM with resolved config */
export async function callInternalLLM(
  config: InternalLLMConfig,
  messages: Array<{ role: string; content: string }>,
  opts?: {
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
    userId?: string;
    sessionId?: string;
    messageId?: string;
    runId?: string;
    traceId?: string;
    taskId?: string;
  },
): Promise<string | null> {
  // ═══ RPM BUDGET GUARD: Internal calls are satellite priority ═══
  if (opts?.userId && !tryLLMCall(opts.userId, config.model, 'satellite')) {
    console.log(`[InternalLLM] Skipped — RPM budget guard denied satellite call for ${config.model} (task=${config.taskType || 'unknown'})`);
    return null;
  }

  const { logSatelliteUsage } = await import("./usage-logger.ts");
  const callKindMap: Record<string, any> = {
    observer: "observer",
    narration: "narration",
    memory_summary: "memory_summary",
    memory_reflection: "memory_reflection",
    memory_tagging: "memory_tagging",
    synthesis_fallback: "synthesis_fallback",
  };
  const callKind = callKindMap[config.taskType ?? "narration"] ?? "narration";

  const t0 = Date.now();
  let tokensInput = 0, tokensOutput = 0, ok = false, err: string | null = null;

  try {
    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: opts?.maxTokens ?? 200,
        temperature: opts?.temperature ?? 0.3,
      }),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 5000),
    });
    if (!res.ok) {
      err = `HTTP ${res.status}`;
      console.warn(`[InternalLLM] ${res.status} from ${config.provider} (task=${config.taskType || 'unknown'}, model=${config.model})`);
      return null;
    }
    const data = await res.json();
    tokensInput = data.usage?.prompt_tokens ?? 0;
    tokensOutput = data.usage?.completion_tokens ?? 0;
    ok = true;
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e: any) {
    err = e?.message ?? String(e);
    console.warn(`[InternalLLM] Failed (task=${config.taskType || 'unknown'}): ${err}`);
    return null;
  } finally {
    if (opts?.userId) {
      logSatelliteUsage({
        userId: opts.userId,
        sessionId: opts.sessionId,
        messageId: opts.messageId,
        runId: opts.runId,
        traceId: opts.traceId,
        taskId: opts.taskId,
        callKind,
        model: config.model,
        provider: config.provider,
        apiSource: "personal_key",
        tokensInput,
        tokensOutput,
        durationMs: Date.now() - t0,
        isSuccessful: ok,
        errorMessage: err,
        metadata: { task_type: config.taskType },
      });
    }
  }
}

