// ═══════════════════════════════════════════════════════════════
// ⚡ BEE BRAIN — REQUEST BUILDER MODULE
// Adaptive request body construction, model tuning parameters
// Extracted from bee-brain.ts (P2 refactor)
// ═══════════════════════════════════════════════════════════════

import type { ComplexityTier, ModelTier } from "./bee-brain-complexity.ts";
import { getModelTier, getReasoningBoost, getAdaptiveTemperature } from "./bee-brain-complexity.ts";

// ═══ SAYA GYI TUNING: Model-specific hyper-parameter matrix ═══
export const SAYA_GYI_TUNING: Record<string, {
  temperature: number; top_p: number; max_tokens: number;
}> = {
  "gemini-3.1-pro":           { temperature: 0.72, top_p: 0.96, max_tokens: 65536 },
  "gemini-3.1-pro-preview":   { temperature: 0.72, top_p: 0.96, max_tokens: 65536 },
  "gemini-3-pro-image-preview": { temperature: 0.72, top_p: 0.96, max_tokens: 16384 },
  "gemini-2.5-pro":           { temperature: 0.72, top_p: 0.96, max_tokens: 32768 },
  "claude-3-5-sonnet":        { temperature: 0.72, top_p: 0.96, max_tokens: 8192 },
  "claude-3.5-sonnet":        { temperature: 0.72, top_p: 0.96, max_tokens: 8192 },
  "gemini-3.5-flash":         { temperature: 0.64, top_p: 0.88, max_tokens: 32768 },
  "gemini-3-flash-preview":   { temperature: 0.64, top_p: 0.88, max_tokens: 32768 },
  "gemini-2.5-flash":         { temperature: 0.64, top_p: 0.88, max_tokens: 32768 },
  "gemini-3.1-flash-lite":    { temperature: 0.4,  top_p: 0.8,  max_tokens: 16384 },
  "gemini-2.5-flash-lite":    { temperature: 0.4,  top_p: 0.8,  max_tokens: 8192 },
  "gemini-3.1-flash-lite-preview": { temperature: 0.4, top_p: 0.8, max_tokens: 8192 },
};

export const DEFAULT_TUNING = { temperature: 0.64, top_p: 0.88, max_tokens: 8192 };
export const DEFAULT_HB_TUNING = { temperature: 0.64, top_p: 0.88, max_tokens: 1024 };

// ═══ ANTHROPIC NATIVE EXTENDED THINKING BUDGET (per complexity tier) ═══
// 0 = disabled. Only Anthropic provider, only tier ≥ moderate.
const ANTHROPIC_THINKING_BUDGET: Record<string, number> = {
  "greeting":   0,
  "simple":     0,
  "turbo":      0,
  "moderate":   2000,
  "complex":    8000,
  "deep":       16000,
  "ultra-deep": 24000,
};

// ═══ TIER CONSTRAINTS ═══
const TIER_CONSTRAINTS: Record<ModelTier, { maxTokensCap: number }> = {
  pro:   { maxTokensCap: 65536 },
  flash: { maxTokensCap: 32768 },
  lite:  { maxTokensCap: 16384 },
};

// ═══ COMPLEXITY TOKEN MULTIPLIER ═══
const COMPLEXITY_TOKEN_MULTIPLIER: Record<ComplexityTier, number> = {
  "greeting":   1,
  "simple":     1,
  "turbo":      1,
  "moderate":   1.5,
  "complex":    2,
  "deep":       2,
  "ultra-deep": 3,
};

export function buildAdaptiveRequestBody(opts: {
  model: string;
  messages: any[];
  tools?: any[];
  toolChoice?: string;
  isDeepQuery: boolean;
  stripLevel: number;
  retryCount?: number;
  complexityTier?: ComplexityTier;
  tokenCapRound?: number;
  reasoningEffort?: string;
  providerType?: string;
}): Record<string, any> {
  const tuning = SAYA_GYI_TUNING[opts.model] || DEFAULT_TUNING;
  const tier = getModelTier(opts.model);
  const constraints = TIER_CONSTRAINTS[tier];

  const baseTokens = opts.isDeepQuery ? Math.max(tuning.max_tokens, 8192) : tuning.max_tokens;
  const multiplier = opts.complexityTier ? COMPLEXITY_TOKEN_MULTIPLIER[opts.complexityTier] : 1;
  let scaledTokens = Math.round(baseTokens * multiplier);

  // Token escalation: capped at 1.3x max (prevents wasteful full-tier escalation)
  if (opts.tokenCapRound && opts.tokenCapRound > 0) {
    scaledTokens = Math.round(scaledTokens * 1.3);
    console.log(`[TokenEscalation] Round ${opts.tokenCapRound}: 1.3x cap → ${scaledTokens} tokens`);
  }

  const modelMaxTokensCap = opts.model.includes("gemini-3.5-flash")
    ? 65536
    : constraints.maxTokensCap;
  const maxTokens = Math.min(scaledTokens, modelMaxTokensCap);
  const boost = getReasoningBoost(opts.model, opts.isDeepQuery);

  let temperature = boost.active ? boost.temperature : tuning.temperature;
  if (opts.retryCount && opts.retryCount > 0) {
    temperature = getAdaptiveTemperature(temperature, opts.retryCount);
  }

  // ═══ REASONING EFFORT ═══
  const isOpenRouterModel = opts.model.includes('/') && !opts.model.startsWith('google/');
  const isGeminiPro = opts.model.includes("pro") && !opts.model.includes("sonnet") && !opts.model.includes("claude") && !isOpenRouterModel;
  const reasoningEffort = opts.reasoningEffort || getReasoningEffortFromTier(opts.complexityTier);
  const useReasoning = isOpenRouterModel && reasoningEffort && reasoningEffort !== "none";

  const reqBody: any = {
    model: opts.model,
    messages: opts.messages,
    stream: true,
    max_tokens: maxTokens,
  };

  // When reasoning is active, skip temperature/top_p (Gemini ignores them with reasoning)
  if (useReasoning) {
    reqBody.reasoning = { effort: reasoningEffort };
    console.log(`[AdaptiveBuilder] Reasoning effort: ${reasoningEffort} (Pro model detected)`);
  } else {
    reqBody.temperature = temperature;
    if (opts.stripLevel === 0) {
      reqBody.top_p = boost.active ? boost.top_p : tuning.top_p;
    }
  }

  if (boost.active && opts.isDeepQuery && tier === "pro" && opts.complexityTier === "ultra-deep") {
    reqBody.presence_penalty = 0.2;
    console.log(`[NeuralMatrix] presence_penalty: 0.2 applied (Pro + ultra-deep)`);
  }

  if (opts.stripLevel >= 2) {
    if (!useReasoning) reqBody.temperature = 0.5;
    reqBody.max_tokens = Math.min(reqBody.max_tokens, 16384);
    reqBody.messages = reqBody.messages
      .filter((m: any) => m.role !== 'tool')
      .map((m: any) => m.tool_calls ? { ...m, content: m.content || '', tool_calls: undefined } : m);
  }

  if (opts.tools && opts.stripLevel < 2) {
    reqBody.tools = opts.tools;
    if (opts.toolChoice) reqBody.tool_choice = opts.toolChoice;
  }

  // ═══ OPENROUTER PROVIDER ROUTING ═══
  if (isOpenRouterModel) {
    reqBody.provider = {
      require_parameters: true,
      allow_fallbacks: true,
    };

    // OpenRouter reasoning: pass effort level + exclude reasoning tokens from stream
    if (useReasoning) {
      reqBody.reasoning = { effort: reasoningEffort, exclude: true };
      console.log(`[AdaptiveBuilder] OpenRouter reasoning: effort=${reasoningEffort}, exclude=true`);
    }

    console.log(`[AdaptiveBuilder] OpenRouter provider config: require_parameters=true, allow_fallbacks=true`);
  }

  console.log(`[AdaptiveBuilder] Model: ${opts.model}, Tier: ${tier}, MaxTokens: ${reqBody.max_tokens}, ComplexityTier: ${opts.complexityTier || 'unknown'}, Multiplier: ${multiplier}x, Temp: ${reqBody.temperature?.toFixed?.(2) ?? 'reasoning'}, StripLevel: ${opts.stripLevel}${boost.active ? ', ReasoningBoost: ON' : ''}${useReasoning ? `, Reasoning: ${reasoningEffort}` : ''}${opts.retryCount ? `, RetryCount: ${opts.retryCount}` : ''}${opts.tokenCapRound ? `, TokenCapRound: ${opts.tokenCapRound}` : ''}${isOpenRouterModel ? ', OpenRouter: provider-routed' : ''}`);

  // ═══ ANTHROPIC BODY FORMAT ADAPTER + EXTENDED THINKING ═══
  if (opts.providerType === 'anthropic') {
    const thinkingBudget = opts.complexityTier
      ? (ANTHROPIC_THINKING_BUDGET[opts.complexityTier] ?? 0)
      : 0;
    if (thinkingBudget > 0) {
      // Signal to buildAnthropicBody to inject thinking config
      reqBody._extended_thinking = { budget_tokens: thinkingBudget };
    }
    return buildAnthropicBody(reqBody);
  }

  return reqBody;
}

/**
 * Convert OpenAI-format request body to Anthropic Messages API format.
 * Claude requires: system as top-level field, no system role in messages,
 * x-api-key auth (handled by headers), anthropic-version header.
 *
 * PROMPT CACHING: System prompt + tools are marked with cache_control.
 * Anthropic charges +25% on cache writes and -90% on cache reads — long
 * conversations with stable system prompts hit cache, cutting cost ~70-90%.
 * Only blocks ≥1024 tokens are eligible; small system prompts pay the write
 * surcharge with no benefit, so we gate on a minimum size.
 */
const ANTHROPIC_CACHE_MIN_CHARS = 4_000; // ~1024 tokens (4 chars/token heuristic)

export function buildAnthropicBody(openaiBody: Record<string, any>): Record<string, any> {
  const messages = openaiBody.messages || [];
  const systemMessages = messages.filter((m: any) => m.role === 'system');
  const nonSystemMessages = messages.filter((m: any) => m.role !== 'system');

  const anthropicBody: Record<string, any> = {
    model: openaiBody.model,
    max_tokens: openaiBody.max_tokens || 8192,
    stream: openaiBody.stream ?? true,
  };

  // System prompt → top-level field. Use content-block array form when large
  // enough to benefit from caching, otherwise use the cheaper string form.
  if (systemMessages.length > 0) {
    const systemText = systemMessages.map((m: any) => m.content).join('\n\n');
    if (systemText.length >= ANTHROPIC_CACHE_MIN_CHARS) {
      anthropicBody.system = [
        { type: 'text', text: systemText, cache_control: { type: 'ephemeral' } },
      ];
    } else {
      anthropicBody.system = systemText;
    }
  }

  // Messages (no system role allowed)
  anthropicBody.messages = nonSystemMessages.map((m: any) => {
    const msg: any = { role: m.role, content: m.content };
    // Preserve tool_calls/tool_use blocks
    if (m.tool_calls) {
      msg.content = [
        ...(m.content ? [{ type: 'text', text: m.content }] : []),
        ...m.tool_calls.map((tc: any) => ({
          type: 'tool_use',
          id: tc.id,
          name: tc.function?.name || tc.name,
          input: typeof tc.function?.arguments === 'string' 
            ? JSON.parse(tc.function.arguments) 
            : tc.function?.arguments || {},
        })),
      ];
    }
    // Convert tool role to Anthropic format
    if (m.role === 'tool') {
      return {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: m.tool_call_id,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        }],
      };
    }
    return msg;
  });

  // Temperature (if set)
  if (openaiBody.temperature !== undefined) {
    anthropicBody.temperature = openaiBody.temperature;
  }
  if (openaiBody.top_p !== undefined) {
    anthropicBody.top_p = openaiBody.top_p;
  }

  // Tools → Anthropic format. Mark the LAST tool with cache_control so the
  // entire tool definition list (typically 5-50KB for BeeBot's 70+ tools)
  // is cached as a single prefix block. Single breakpoint covers all tools.
  if (openaiBody.tools && openaiBody.tools.length > 0) {
    const tools = openaiBody.tools.map((t: any) => ({
      name: t.function?.name || t.name,
      description: t.function?.description || t.description || '',
      input_schema: t.function?.parameters || t.parameters || { type: 'object', properties: {} },
    }));
    const totalToolsChars = tools.reduce(
      (sum: number, t: any) => sum + (t.description?.length || 0) + JSON.stringify(t.input_schema || {}).length,
      0,
    );
    if (totalToolsChars >= ANTHROPIC_CACHE_MIN_CHARS && tools.length > 0) {
      tools[tools.length - 1].cache_control = { type: 'ephemeral' };
    }
    anthropicBody.tools = tools;
    if (openaiBody.tool_choice === 'required') {
      anthropicBody.tool_choice = { type: 'any' };
    } else if (openaiBody.tool_choice === 'auto') {
      anthropicBody.tool_choice = { type: 'auto' };
    }
  }

  // Extended thinking: inject if caller passed _extended_thinking
  if (openaiBody._extended_thinking?.budget_tokens) {
    const budget = openaiBody._extended_thinking.budget_tokens as number;
    anthropicBody.thinking = { type: 'enabled', budget_tokens: budget };
    // max_tokens must exceed budget_tokens
    if (anthropicBody.max_tokens <= budget) {
      anthropicBody.max_tokens = budget + 4096;
    }
    console.log(`[AnthropicAdapter] Extended thinking enabled: budget=${budget}`);
  }

  console.log(`[AnthropicAdapter] Converted: ${messages.length} msgs → system(${systemMessages.length}) + messages(${nonSystemMessages.length}), tools: ${anthropicBody.tools?.length || 0}`);
  return anthropicBody;
}

// ═══ REASONING EFFORT MAPPING ═══
function getReasoningEffortFromTier(tier?: ComplexityTier): string {
  if (!tier) return "none";
  switch (tier) {
    case "greeting":
    case "simple":
      return "none";
    case "turbo":
      return "low";
    case "moderate":
      return "medium";
    case "complex":
    case "deep":
      return "high";
    case "ultra-deep":
      return "xhigh";
    default:
      return "none";
  }
}

// ═══ GEMINI PARAMETER SANITIZER FOR 400 RETRY ═══
// Progressively strips parameters that Gemini's OAI-compat endpoint may reject
export function sanitizeForGeminiRetry(body: Record<string, any>, stripLevel: number): Record<string, any> {
  const cleaned = { ...body };

  // Level 1+: Remove known-unsupported optional params
  delete cleaned.presence_penalty;
  delete cleaned.frequency_penalty;
  delete cleaned.logit_bias;
  delete cleaned.logprobs;
  delete cleaned.top_logprobs;
  delete cleaned.n;
  delete cleaned.seed;
  // reasoning field is not supported on Gemini OAI-compat
  delete cleaned.reasoning;

  if (stripLevel >= 2) {
    // Level 2: Strip tools + cap tokens
    delete cleaned.tools;
    delete cleaned.tool_choice;
    cleaned.max_tokens = Math.min(cleaned.max_tokens || 8192, 16384);
    // Strip tool messages from history
    if (Array.isArray(cleaned.messages)) {
      cleaned.messages = cleaned.messages
        .filter((m: any) => m.role !== 'tool')
        .map((m: any) => {
          if (m.role === 'assistant' && m.tool_calls) {
            return { role: 'assistant', content: (m.content || '') + `\n[Used tools: ${m.tool_calls.map((tc: any) => tc.function?.name).join(', ')}]` };
          }
          return m;
        });
    }
  }

  console.log(`[SanitizeGemini] Level ${stripLevel}: removed unsupported params, tools=${!!cleaned.tools}, max_tokens=${cleaned.max_tokens}`);
  return cleaned;
}
