// ═══ Headless Agent Runner ═══
// Same brain as `agent-chat`, but runs WITHOUT streaming and WITHOUT
// HTTP/SSE plumbing — for scheduled tasks (My Tasks / heartbeat).
//
// PROVIDER POLICY (per project rule "no Lovable AI Gateway"):
//   This runner NEVER calls the Lovable AI Gateway. It resolves the user's
//   personal/system provider configuration via `resolveApiConfig` (the same
//   resolver `agent-chat` uses) and calls the provider endpoint directly:
//     - Personal Gemini key  → Gemini OpenAI-compat endpoint
//     - Personal OpenRouter  → OpenRouter
//     - Personal xAI         → xAI
//     - Personal Anthropic   → Anthropic Messages API
//     - System Google grant  → Gemini OpenAI-compat
//   If no usable provider key exists, the run fails fast with a clear
//   "no provider key" error instead of falling back to any gateway.

import { assembleSystemPrompt, fetchSessionContext } from "./prompt-builder.ts";
import type { AgentSettings, SessionContext } from "./prompt-builder.ts";
import {
  BASE_TOOLS,
  AGENTIC_CORE_TOOLS,
  AGENT_NETWORK_TOOLS,
  ADVANCED_AGENT_TOOLS,
} from "./tool-definitions.ts";
import { fetchExtendedContext, fetchLivingMemories } from "./executor-helpers.ts";
import {
  fetchGlobalUserContext,
  fetchRecentMemoriesForWarmup,
} from "./memory-vault.ts";
import { executeTool } from "./tool-executor.ts";
import { resolveApiConfig, type ApiConfig } from "./api-key-resolver.ts";
import { ANTHROPIC_ENDPOINT, OPENROUTER_HEADERS } from "./api-endpoints.ts";
import { buildAnthropicBody } from "./bee-brain-request-builder.ts";
import { trackAIUsage } from "./streaming-engine.ts";

const DEFAULT_MODEL = "gemini-3.5-flash";

// Maximum agentic loop iterations.
const MAX_STEPS_DEFAULT = 6;
// Single AI call timeout (ms).
const PER_CALL_TIMEOUT_MS = 90_000;

export interface HeadlessRunInput {
  supabase: any;
  userId: string;
  sessionId: string;
  userMessage: string;
  preferredModel?: string | null;
  timezone?: string | null;
  sourceChannel?: string;
  autonomousTaskId?: string | null;
  maxSteps?: number;
}

export interface HeadlessToolCall {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  error?: string;
  duration_ms: number;
}

export interface HeadlessRunResult {
  finalContent: string;
  modelUsed: string;
  steps: number;
  toolCalls: HeadlessToolCall[];
  tokensInput: number;
  tokensOutput: number;
  durationMs: number;
  reachedMaxSteps: boolean;
  status: "completed" | "failed";
  error?: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Strip a `provider/` prefix when calling provider-native endpoints that
 *  expect a bare model id (Gemini, xAI, Anthropic). OpenRouter keeps the
 *  full slug. */
function modelForProvider(model: string, provider: ApiConfig["provider"]): string {
  if (provider === "openrouter") return model;
  if (model.includes("/")) return model.split("/").slice(1).join("/");
  return model;
}

async function resolveUserProviderConfig(
  supabase: any,
  userId: string,
  preferred: string | null | undefined,
): Promise<ApiConfig> {
  // Pull the same set of inputs `agent-chat` reads when resolving keys.
  const [aiSettingsRes, adminSettingsRes, systemKeyRes, extKeysRes, creditsRes] = await Promise.all([
    supabase
      .from("ai_user_settings")
      .select("gemini_api_key, gemini_model, granted_by, is_paused, personal_anthropic_key, disabled_connectors")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("ai_model_settings")
      .select("allow_personal_api_key, require_personal_key, enable_free_tier, enable_google_provider, enable_anthropic_provider")
      .single(),
    supabase
      .from("ai_model_settings")
      .select("google_system_api_key, anthropic_system_api_key")
      .single(),
    supabase
      .from("user_api_keys")
      .select("api_key_encrypted, provider")
      .eq("user_id", userId)
      .in("provider", ["openrouter", "xai"])
      .eq("is_active", true),
    supabase
      .from("user_credits")
      .select("preferred_model")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const userAISettingsRaw = aiSettingsRes?.data ?? null;
  const adminSettings = adminSettingsRes?.data ?? null;
  const systemGoogleKey = systemKeyRes?.data?.google_system_api_key ?? null;
  const systemAnthropicKey = systemKeyRes?.data?.anthropic_system_api_key ?? null;

  const extKeys = extKeysRes?.data ?? [];
  const personalOpenrouterKey =
    extKeys.find((k: any) => k.provider === "openrouter")?.api_key_encrypted ?? null;
  const personalXaiKey =
    extKeys.find((k: any) => k.provider === "xai")?.api_key_encrypted ?? null;
  // Preferred model: explicit override → user_credits → user setting → default.
  const requested =
    (preferred && preferred.trim()) ||
    creditsRes?.data?.preferred_model ||
    userAISettingsRaw?.gemini_model ||
    DEFAULT_MODEL;

  return resolveApiConfig({
    userAISettings: userAISettingsRaw
      ? { ...userAISettingsRaw, personalOpenrouterKey, personalXaiKey }
      : { personalOpenrouterKey, personalXaiKey } as any,
    adminSettings,
    systemGoogleKey,
    systemAnthropicKey,
    preferredModel: requested,
    apiSourcePreference: undefined,
  });
}

async function loadAgentBrainState(supabase: any, userId: string) {
  const safe = async <T>(p: Promise<T>): Promise<T | null> => {
    try { return await p; } catch (e) { console.warn("[HeadlessRunner] brain-state fetch:", (e as any)?.message); return null; }
  };
  const [soul, settings, facts, learning] = await Promise.all([
    safe(supabase.from("agent_soul_config").select("soul_text").eq("user_id", userId).maybeSingle()),
    safe(supabase.from("user_agent_settings").select("bot_name, bot_emoji, personality_mode, personality_level, custom_instructions, preferred_name, timezone").eq("user_id", userId).maybeSingle()),
    safe(supabase.from("agent_user_facts").select("fact_key, fact_value").eq("user_id", userId).order("updated_at", { ascending: false }).limit(8)),
    safe(supabase.from("learning_context").select("context_type, content").eq("user_id", userId).order("updated_at", { ascending: false }).limit(20)),
  ]);
  return {
    soulText: (soul as any)?.data?.soul_text ?? null,
    agentSettings: ((settings as any)?.data ?? null) as (AgentSettings & { custom_instructions?: string; preferred_name?: string; timezone?: string }) | null,
    userFacts: ((facts as any)?.data ?? []) as Array<{ fact_key: string; fact_value: string }>,
    learningContext: ((learning as any)?.data ?? []) as any[],
  };
}

async function isAdminUser(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    return data === true;
  } catch {
    return false;
  }
}

interface ProviderCallParams {
  config: ApiConfig;
  systemPrompt: string;
  messages: Array<{ role: string; content?: any; name?: string; tool_call_id?: string; tool_calls?: any[] }>;
  tools: any[];
  signal?: AbortSignal;
}

interface ProviderCallResult {
  content: string | null;
  tool_calls: Array<{ id: string; function: { name: string; arguments: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  raw_status: number;
  raw_text: string;
}

/** Direct provider call with tool support. Routes by provider; never touches
 *  the Lovable AI Gateway. */
async function callProviderWithTools(params: ProviderCallParams): Promise<ProviderCallResult> {
  const { config, systemPrompt, messages, tools, signal } = params;
  const providerModel = modelForProvider(config.model, config.provider);

  if (config.provider === "anthropic") {
    // Build OpenAI-shape body, then convert via the shared adapter.
    const oaiBody: Record<string, any> = {
      model: providerModel,
      max_tokens: 8192,
      temperature: 0.5,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    };
    if (tools && tools.length > 0) {
      oaiBody.tools = tools;
      oaiBody.tool_choice = "auto";
    }
    const anthropicBody = buildAnthropicBody({ ...oaiBody, stream: false });
    const resp = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
      signal,
    });
    const text = await resp.text();
    if (!resp.ok) return { content: null, tool_calls: [], raw_status: resp.status, raw_text: text };
    let parsed: any = {};
    try { parsed = JSON.parse(text); } catch { /* surface raw */ }
    // Map Anthropic response → OpenAI-shape `tool_calls` array.
    const blocks: any[] = Array.isArray(parsed?.content) ? parsed.content : [];
    const toolUses = blocks.filter((b) => b?.type === "tool_use");
    const textOut = blocks.filter((b) => b?.type === "text").map((b) => b.text || "").join("\n").trim();
    return {
      content: textOut || null,
      tool_calls: toolUses.map((tu, i) => ({
        id: tu.id || `call_${i}`,
        function: { name: tu.name, arguments: JSON.stringify(tu.input ?? {}) },
      })),
      usage: parsed?.usage
        ? { prompt_tokens: parsed.usage.input_tokens, completion_tokens: parsed.usage.output_tokens }
        : undefined,
      raw_status: resp.status,
      raw_text: text,
    };
  }

  // OpenAI-compatible response-shape providers: Gemini compat, OpenRouter, xAI.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (config.provider === "openrouter") {
    Object.assign(headers, OPENROUTER_HEADERS);
  }
  const body: Record<string, unknown> = {
    model: providerModel,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    stream: false,
    temperature: 0.5,
    max_tokens: 8192,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  const resp = await fetch(config.apiEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
  const text = await resp.text();
  if (!resp.ok) return { content: null, tool_calls: [], raw_status: resp.status, raw_text: text };
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { /* surface raw */ }
  const choice = parsed?.choices?.[0];
  const msg = choice?.message ?? {};
  return {
    content: typeof msg.content === "string" ? msg.content : null,
    tool_calls: Array.isArray(msg.tool_calls) ? msg.tool_calls : [],
    usage: parsed?.usage,
    raw_status: resp.status,
    raw_text: text,
  };
}

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

async function recordAutonomousStep(
  supabase: any,
  taskId: string | null,
  index: number,
  toolName: string,
  status: "running" | "completed" | "failed",
  payload: Record<string, unknown>,
) {
  if (!taskId) return;
  try {
    await supabase.from("autonomous_task_steps").upsert({
      task_id: taskId,
      step_index: index,
      tool: toolName,
      status,
      result: typeof payload.result === "string"
        ? payload.result.slice(0, 50_000)
        : JSON.stringify(payload).slice(0, 50_000),
      started_at: payload.started_at,
      completed_at: payload.completed_at,
      metadata: payload,
    }, { onConflict: "task_id,step_index" });
  } catch (e) {
    console.warn("[HeadlessRunner] autonomous step write failed:", (e as any)?.message);
  }
}

export async function runHeadlessAgent(input: HeadlessRunInput): Promise<HeadlessRunResult> {
  const t_start = Date.now();
  const maxSteps = Math.max(1, Math.min(input.maxSteps ?? MAX_STEPS_DEFAULT, 12));
  const sourceChannel = input.sourceChannel || "heartbeat";

  // ═══ 1. Resolve identity, provider config, admin status, brain state ═══
  const [providerConfig, isAdmin, brain] = await Promise.all([
    resolveUserProviderConfig(input.supabase, input.userId, input.preferredModel ?? null),
    isAdminUser(input.supabase, input.userId),
    loadAgentBrainState(input.supabase, input.userId),
  ]);

  // Hard rule: no Lovable AI Gateway. Fail fast if no real provider key.
  if (!providerConfig.apiKey || providerConfig.source === "gateway") {
    return {
      finalContent: "",
      modelUsed: providerConfig.model,
      steps: 0,
      toolCalls: [],
      tokensInput: 0,
      tokensOutput: 0,
      durationMs: Date.now() - t_start,
      reachedMaxSteps: false,
      status: "failed",
      error: "No personal or system AI provider key available for scheduled task. Add a personal API key in BeeBot settings.",
    };
  }

  console.log(
    `[HeadlessRunner] Provider=${providerConfig.provider} source=${providerConfig.source} model=${providerConfig.model} (${providerConfig.apiSourceLabel})`,
  );
  const traceId = `headless-${(input.autonomousTaskId || input.sessionId).slice(0, 8)}-${Date.now().toString(36)}`;
  const trackHeadlessUsage = (
    tokensInput: number,
    tokensOutput: number,
    durationMs: number,
    status: "completed" | "failed",
    callKind: string,
    error?: string | null,
  ) => Promise.resolve(trackAIUsage(
    input.supabase,
    input.userId,
    input.sessionId,
    providerConfig.source as any,
    providerConfig.model,
    { tokensInput, tokensOutput, durationMs },
    status === "completed",
    error || undefined,
    "none",
    {
      taskId: input.autonomousTaskId || null,
      traceId,
      callKind,
      provider: providerConfig.provider,
      requestCount: 1,
      metadata: { source_channel: sourceChannel, runner: "headless" },
    },
  )).catch(() => {});

  // ═══ 2. SessionContext ═══
  const deviceContext = input.timezone ? {
    timezone: input.timezone,
    deviceNowIso: new Date().toISOString(),
  } as any : undefined;
  const sessionContext: SessionContext = await fetchSessionContext(
    input.supabase, input.userId, deviceContext,
    brain.agentSettings ? { preferred_name: brain.agentSettings.preferred_name, timezone: brain.agentSettings.timezone } : null,
  );
  (sessionContext as any).sourceChannel = sourceChannel;

  // ═══ 3. Heavy memory fan-out ═══
  const [extendedContext, globalContext, recentMemories, livingMemories] = await Promise.all([
    fetchExtendedContext(input.supabase, input.userId).catch(() => undefined),
    fetchGlobalUserContext(input.supabase, input.userId).catch(() => undefined),
    fetchRecentMemoriesForWarmup(input.supabase, input.userId, input.sessionId).catch(() => undefined),
    fetchLivingMemories(input.supabase, input.userId, undefined).catch(() => []),
  ]);

  // ═══ 4. Tool registry ═══
  const tools = [
    ...BASE_TOOLS,
    ...AGENT_NETWORK_TOOLS,
    ...ADVANCED_AGENT_TOOLS,
    ...AGENTIC_CORE_TOOLS,
  ];

  // ═══ 5. Assemble system prompt ═══
  const systemPrompt = await assembleSystemPrompt(
    input.supabase,
    brain.learningContext,
    brain.agentSettings,
    isAdmin,
    sessionContext,
    extendedContext,
    globalContext,
    recentMemories,
    null,
    input.userId,
    /* isSimpleMessage */ false,
    livingMemories || [],
    /* groupContext */ undefined,
    /* complexityTier */ "deep",
  );

  // ═══ 6. Step loop ═══
  const messages: Array<any> = [
    { role: "user", content: input.userMessage },
  ];
  const toolCalls: HeadlessToolCall[] = [];
  let totalTokensInput = 0;
  let totalTokensOutput = 0;
  let step = 0;
  let modelUsed = providerConfig.model;
  let finalContent = "";
  let reachedMaxSteps = false;

  while (step < maxSteps) {
    step++;

    const stepStartedAt = Date.now();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), PER_CALL_TIMEOUT_MS);
    let resp: ProviderCallResult;
    try {
      resp = await callProviderWithTools({
        config: providerConfig,
        systemPrompt,
        messages,
        tools,
        signal: controller.signal,
      });
    } catch (e: any) {
      clearTimeout(t);
      const aborted = e?.name === "AbortError";
      await trackHeadlessUsage(
        JSON.stringify(messages).length > 0 ? Math.ceil(JSON.stringify(messages).length / 3.2) : 0,
        0,
        Date.now() - stepStartedAt,
        "failed",
        "headless_llm_error",
        aborted ? `timeout ${PER_CALL_TIMEOUT_MS}ms` : (e?.message || "AI provider call failed"),
      );
      return {
        finalContent: finalContent || "",
        modelUsed,
        steps: step,
        toolCalls,
        tokensInput: totalTokensInput,
        tokensOutput: totalTokensOutput,
        durationMs: Date.now() - t_start,
        reachedMaxSteps: false,
        status: "failed",
        error: aborted
          ? `Agent step ${step} timed out (${PER_CALL_TIMEOUT_MS}ms)`
          : (e?.message || "AI provider call failed"),
      };
    }
    clearTimeout(t);
    const stepDurationMs = Date.now() - stepStartedAt;

    if (resp.raw_status === 402) {
      await trackHeadlessUsage(0, 0, stepDurationMs, "failed", "headless_llm_error", "HTTP 402");
      return {
        finalContent: "", modelUsed, steps: step, toolCalls,
        tokensInput: totalTokensInput, tokensOutput: totalTokensOutput,
        durationMs: Date.now() - t_start, reachedMaxSteps: false,
        status: "failed",
        error: `Payment required from ${providerConfig.provider} provider — please check your account.`,
      };
    }
    if (resp.raw_status === 429) {
      await trackHeadlessUsage(0, 0, stepDurationMs, "failed", "headless_llm_error", "HTTP 429");
      return {
        finalContent: "", modelUsed, steps: step, toolCalls,
        tokensInput: totalTokensInput, tokensOutput: totalTokensOutput,
        durationMs: Date.now() - t_start, reachedMaxSteps: false,
        status: "failed",
        error: `Rate limited by ${providerConfig.provider} provider — try again later.`,
      };
    }
    if (resp.raw_status >= 400) {
      await trackHeadlessUsage(0, 0, stepDurationMs, "failed", "headless_llm_error", `HTTP ${resp.raw_status}`);
      return {
        finalContent: "", modelUsed, steps: step, toolCalls,
        tokensInput: totalTokensInput, tokensOutput: totalTokensOutput,
        durationMs: Date.now() - t_start, reachedMaxSteps: false,
        status: "failed",
        error: `Provider error ${resp.raw_status} (${providerConfig.provider}): ${resp.raw_text.slice(0, 300)}`,
      };
    }

    if (resp.usage) {
      totalTokensInput += resp.usage.prompt_tokens || 0;
      totalTokensOutput += resp.usage.completion_tokens || 0;
    }
    await trackHeadlessUsage(
      resp.usage?.prompt_tokens || Math.ceil(JSON.stringify(messages).length / 3.2),
      resp.usage?.completion_tokens || Math.ceil(((resp.content || "") + JSON.stringify(resp.tool_calls || [])).length / 3.2),
      stepDurationMs,
      "completed",
      resp.tool_calls?.length ? "headless_tool_planning" : "headless_final",
    );

    if (!resp.tool_calls || resp.tool_calls.length === 0) {
      finalContent = (resp.content || "").trim();
      break;
    }

    messages.push({
      role: "assistant",
      content: resp.content || "",
      tool_calls: resp.tool_calls,
    });

    for (const tc of resp.tool_calls) {
      const toolName = tc.function?.name;
      const args = safeJsonParse(tc.function?.arguments || "{}");
      const startedAt = new Date().toISOString();
      const tStep = Date.now();
      let result: unknown = null;
      let error: string | undefined;
      try {
        await recordAutonomousStep(input.supabase, input.autonomousTaskId ?? null, toolCalls.length, toolName, "running", {
          step_index: toolCalls.length, tool: toolName, args, started_at: startedAt,
        });
        result = await executeTool(
          input.supabase, input.userId, toolName, args,
          isAdmin, undefined,
          { sessionId: input.sessionId, sourceChannel },
        );
        const isErrShape = result && typeof result === "object" && (result as any).error;
        if (isErrShape) error = String((result as any).error);
      } catch (e: any) {
        error = e?.message || "tool execution threw";
        result = { error };
      }
      const dur = Date.now() - tStep;
      const completedAt = new Date().toISOString();
      toolCalls.push({ name: toolName, arguments: args, result, error, duration_ms: dur });
      await recordAutonomousStep(input.supabase, input.autonomousTaskId ?? null, toolCalls.length - 1, toolName, error ? "failed" : "completed", {
        step_index: toolCalls.length - 1, tool: toolName, args, started_at: startedAt, completed_at: completedAt,
        duration_ms: dur, result: typeof result === "string" ? result : JSON.stringify(result),
      });

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        name: toolName,
        content: typeof result === "string" ? result : JSON.stringify(result).slice(0, 12_000),
      });
    }

    await sleep(150);
  }

  if (step >= maxSteps && !finalContent) {
    reachedMaxSteps = true;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), PER_CALL_TIMEOUT_MS);
      const synth = await callProviderWithTools({
        config: providerConfig,
        systemPrompt: systemPrompt + "\n\n[FINAL SYNTHESIS] You have used your tool budget. Write the final answer now using the tool results above. Do not call any more tools.",
        messages: [...messages, { role: "user", content: "Write the final answer now based on the tool results so far. No more tool calls." }],
        tools: [],
        signal: controller.signal,
      });
      clearTimeout(t);
      finalContent = (synth.content || "").trim();
      if (synth.usage) {
        totalTokensInput += synth.usage.prompt_tokens || 0;
        totalTokensOutput += synth.usage.completion_tokens || 0;
      }
      await trackHeadlessUsage(
        synth.usage?.prompt_tokens || Math.ceil(JSON.stringify(messages).length / 3.2),
        synth.usage?.completion_tokens || Math.ceil((synth.content || "").length / 3.2),
        Date.now() - t_start,
        "completed",
        "headless_final_synthesis",
      );
    } catch (e) {
      console.warn("[HeadlessRunner] final synthesis failed:", (e as any)?.message);
    }
  }

  return {
    finalContent: finalContent || "",
    modelUsed,
    steps: step,
    toolCalls,
    tokensInput: totalTokensInput,
    tokensOutput: totalTokensOutput,
    durationMs: Date.now() - t_start,
    reachedMaxSteps,
    status: finalContent ? "completed" : "failed",
    error: finalContent ? null : "No final content produced",
  };
}
