// ═══ Provider Failover Engine — Single Source of Truth ═══
// Used by both agent-chat agentic-loop and beebot-orchestrator.
// Deterministic priority: Personal Key → System Key
// Model Fallback: Same key, different model when token/quota limit hit.
// Circuit-breaker for known-bad keys within same request lifecycle.

export interface ProviderConfig {
  apiKey: string;
  apiEndpoint: string;
  provider: 'google' | 'anthropic' | 'openrouter' | 'xai';
  label: string;
  isPersonalKey: boolean;
  supportsExplicitCache: boolean;
}

export interface ProviderFailoverOptions {
  personalGeminiKey?: string | null;
  personalAnthropicKey?: string | null;
  personalOpenrouterKey?: string | null;
  personalXaiKey?: string | null;
  systemGoogleKey?: string | null;
  systemAnthropicKey?: string | null;
  modelToUse: string;
  allowPersonalKey?: boolean;
  preferPersonal?: boolean;
  disabledConnectors?: string[];
}

import { GEMINI_OPENAI_ENDPOINT, GEMINI_NATIVE_PREFIX, ANTHROPIC_ENDPOINT, OPENROUTER_ENDPOINT, XAI_ENDPOINT } from "./api-endpoints.ts";

const GEMINI_ENDPOINT = GEMINI_OPENAI_ENDPOINT;
const GEMINI_DIRECT_PREFIX = GEMINI_NATIVE_PREFIX;

// ═══ Error Classification ═══
export type ProviderErrorType =
  | 'invalid_key'
  | 'quota_exhausted'
  | 'rate_limited'
  | 'model_not_found'
  | 'model_capability_error'
  | 'model_overloaded'
  | 'context_length_exceeded'
  | 'invalid_parameter'
  | 'server_error'
  | 'timeout'
  | 'unknown';

export function classifyProviderError(status: number, errorText: string): ProviderErrorType {
  const lowerText = errorText.toLowerCase();

  if (status === 401 || status === 403 ||
      lowerText.includes('api_key_invalid') ||
      lowerText.includes('invalid api key') ||
      lowerText.includes('permission_denied') ||
      lowerText.includes('api key not valid')) {
    return 'invalid_key';
  }
  // Context length / token limit errors — model-specific, fallback to smaller model
  if (lowerText.includes('context length') ||
      lowerText.includes('token limit') ||
      lowerText.includes('max_tokens') ||
      lowerText.includes('input too long') ||
      lowerText.includes('request too large') ||
      lowerText.includes('content_too_large') ||
      lowerText.includes('exceeds the maximum')) {
    return 'context_length_exceeded';
  }
  // HTTP 429 = "Too Many Requests" — always a temporary rate limit, not hard quota exhaustion.
  // Gemini uses RESOURCE_EXHAUSTED for both RPM limits AND daily quota via 429.
  // Treating 429 as quota_exhausted prevents model fallback from firing — so 429 is always rate_limited.
  if (status === 429 || lowerText.includes('rate limit')) {
    return 'rate_limited';
  }
  // Hard quota exhaustion: billing/daily limit signals on non-429 responses
  if (lowerText.includes('quota') || lowerText.includes('resource_exhausted')) {
    return 'quota_exhausted';
  }
  // OpenRouter capability/policy errors: model exists but doesn't support tools, or blocked by privacy settings
  if (status === 404 && (
      lowerText.includes('no endpoints found') ||
      lowerText.includes('no endpoints available') ||
      lowerText.includes('tool use') ||
      lowerText.includes('tool_choice') ||
      lowerText.includes('guardrail restrictions') ||
      lowerText.includes('data policy'))) {
    return 'model_capability_error';
  }
  if (status === 404 ||
      lowerText.includes('model not found') || lowerText.includes('not_found') ||
      lowerText.includes('invalid model')) {
    return 'model_not_found';
  }
  if (lowerText.includes('overloaded') || lowerText.includes('503')) {
    return 'model_overloaded';
  }
  // Gemini INVALID_ARGUMENT = bad parameter in request body
  if (status === 400 && (
      lowerText.includes('invalid_argument') ||
      lowerText.includes('invalid value') ||
      lowerText.includes('is not supported') ||
      lowerText.includes('unsupported') ||
      lowerText.includes('not allowed') ||
      lowerText.includes('unknown field'))) {
    return 'invalid_parameter';
  }
  if (status >= 500) return 'server_error';
  return 'unknown';
}

/** Returns true if the error should trigger a MODEL fallback (same key, different model)
 *  Project Aegis Model Sovereignty: 'rate_limited' is EXCLUDED — transient 429s must NOT cause silent
 *  downgrade of the user's chosen model. Only hard token/overload errors trigger model swap. */
export function isModelFallbackError(errorType: ProviderErrorType): boolean {
  return errorType === 'context_length_exceeded' || errorType === 'model_overloaded';
}

/** Returns true if the error is non-recoverable for the same key (should switch provider) */
export function isNonRecoverableError(errorType: ProviderErrorType): boolean {
  return errorType === 'invalid_key' || errorType === 'quota_exhausted' || errorType === 'model_not_found' || errorType === 'model_capability_error' || errorType === 'timeout';
}

// ═══ MODEL FALLBACK CHAIN ═══
// When a model hits token/rate limits, automatically fallback to a capable alternative
// using the SAME API key. Priority: maintain capability while reducing cost/size.
const MODEL_FALLBACK_CHAIN: Record<string, string[]> = {
  // Pro models → Flash → Flash-Lite (3.1 flash-lite as terminal)
  "gemini-2.5-pro":            ["gemini-3.1-pro-preview", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"],
  "gemini-3.1-pro-preview":    ["gemini-3.5-flash", "gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-2.5-flash"],
  // Flash models → other Flash variants → Lite
  "gemini-3.5-flash":          ["gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-2.5-flash"],
  "gemini-3-flash-preview":    ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"],
  // No phantom non-lite preview fallback here; every target must exist in the registry.
  "gemini-2.5-flash":          ["gemini-3.5-flash", "gemini-3-flash-preview", "gemini-3.1-flash-lite"],
  // Lite → Flash → Pro
  "gemini-3.1-flash-lite":     ["gemini-2.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"],
  "gemini-3.1-flash-lite-preview": ["gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-3.5-flash"],
  "gemini-2.5-flash-lite":     ["gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"],
  // Legacy (deprecated June 2026, mapped to 2.5 flash)
  "gemini-2.0-flash":          ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.1-flash-lite"],
  // Image models
  "gemini-3.1-flash-image-preview": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
  "gemini-3-pro-image-preview":     ["gemini-3.1-flash-image-preview", "gemini-2.5-flash-image"],
  "gemini-2.5-flash-image":         ["gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"],
  // Claude/Anthropic models
  "claude-4-5-sonnet":              ["claude-4-6-opus"],
  "claude-4-6-opus":                ["claude-4-5-sonnet"],
  "claude-3-5-sonnet":              ["claude-4-5-sonnet"],
  "claude-3.5-sonnet":              ["claude-4-5-sonnet"],
};

/**
 * Get the next fallback model for a given model.
 * Returns null if no more fallbacks available.
 * @param currentModel - The model that just failed
 * @param attemptedModels - Set of models already tried (to avoid loops)
 */
export function getModelFallback(currentModel: string, attemptedModels: Set<string>): string | null {
  // ═══ OpenRouter models: try :free → paid variant fallback ═══
  if (currentModel.includes('/') && !currentModel.startsWith('google/')) {
    if (currentModel.includes(':free')) {
      const paidVariant = currentModel.replace(':free', '');
      if (!attemptedModels.has(paidVariant)) {
        console.log(`[ModelFallback] OpenRouter :free → paid variant: ${paidVariant}`);
        return paidVariant;
      }
    }
    // No further model fallback for OpenRouter (provider failover handles the rest)
    return null;
  }

  // Gemini model fallback chain
  const cleanModel = currentModel.startsWith('google/') ? currentModel.replace(/^google\//, '') : currentModel;
  const chain = MODEL_FALLBACK_CHAIN[cleanModel];
  if (!chain) return null;

  for (const fallback of chain) {
    if (!attemptedModels.has(fallback)) {
      return fallback;
    }
  }
  return null;
}

/**
 * Build SSE event for model fallback notification
 */
export function buildModelFallbackSSE(
  fromModel: string,
  toModel: string,
  reason: ProviderErrorType,
): Record<string, unknown> {
  return {
    type: "model_fallback",
    from_model: fromModel,
    to_model: toModel,
    reason,
    message: `Model "${fromModel}" hit ${reason === 'context_length_exceeded' ? 'token limit' : reason === 'rate_limited' ? 'rate limit' : 'overload'}. Auto-switching to "${toModel}"...`,
  };
}

/**
 * Circuit-breaker: tracks bad keys within a single request lifecycle.
 * Not persisted — resets per edge function invocation (module-level is fine for Deno isolates).
 */
export class ProviderCircuitBreaker {
  private badKeys = new Set<string>();

  markBad(key: string): void {
    // Store hash-like prefix to avoid holding full key in memory
    this.badKeys.add(key.slice(0, 12));
  }

  isBad(key: string): boolean {
    return this.badKeys.has(key.slice(0, 12));
  }
}

/**
 * Build ordered provider chain based on priority.
 * Returns array of ProviderConfig in failover order.
 */
export function getModelFamily(model: string): 'openrouter' | 'claude' | 'grok' | 'gemini' {
  if (model.startsWith('google/')) return 'gemini';
  if (model.includes('/')) return 'openrouter';
  if (model.startsWith('claude')) return 'claude';
  if (model.startsWith('grok')) return 'grok';
  return 'gemini';
}

/** Check if a provider is compatible with a model family */
export function isProviderCompatible(provider: ProviderConfig['provider'], modelFamily: ReturnType<typeof getModelFamily>): boolean {
  switch (modelFamily) {
    case 'openrouter': return provider === 'openrouter';
    case 'claude': return provider === 'anthropic';
    case 'grok': return provider === 'xai';
    case 'gemini': return provider === 'google';
  }
}

/**
 * Build ordered provider chain based on priority.
 * MODEL-SOVEREIGN: Only includes providers compatible with the selected model family.
 * Gemini models → Google only. Claude → Anthropic only. OpenRouter → OpenRouter only. Grok → xAI only.
 */
export function buildProviderChain(opts: ProviderFailoverOptions): ProviderConfig[] {
  const chain: ProviderConfig[] = [];
  const modelFamily = getModelFamily(opts.modelToUse);
  const allowPersonal = opts.allowPersonalKey !== false;
  const preferPersonal = opts.preferPersonal !== false;
  const disabled = opts.disabledConnectors ?? [];

  const addIfCompatible = (
    key: string | null | undefined,
    endpoint: string,
    provider: ProviderConfig['provider'],
    label: string,
    isPersonal: boolean,
    supportsCache: boolean,
    disableKey?: string,
  ) => {
    if (!key) return;
    if (disableKey && disabled.includes(disableKey)) return;
    if (!isProviderCompatible(provider, modelFamily)) return;
    chain.push({ apiKey: key, apiEndpoint: endpoint, provider, label, isPersonalKey: isPersonal, supportsExplicitCache: supportsCache });
  };

  // Priority 1: Personal Keys (if allowed and preferred)
  if (preferPersonal && allowPersonal) {
    addIfCompatible(opts.personalOpenrouterKey, OPENROUTER_ENDPOINT, 'openrouter', 'Personal OpenRouter Key', true, false, 'openrouter');
    addIfCompatible(opts.personalAnthropicKey, ANTHROPIC_ENDPOINT, 'anthropic', 'Personal Anthropic Key', true, false, 'anthropic');
    addIfCompatible(opts.personalGeminiKey, GEMINI_ENDPOINT, 'google', 'Personal Gemini Key', true, true, 'gemini');
    addIfCompatible(opts.personalXaiKey, XAI_ENDPOINT, 'xai', 'Personal xAI Key', true, false, 'xai');
  }

  // Priority 2: System Keys
  addIfCompatible(opts.systemAnthropicKey, ANTHROPIC_ENDPOINT, 'anthropic', 'System Anthropic Key', false, false);
  addIfCompatible(opts.systemGoogleKey, GEMINI_ENDPOINT, 'google', 'System Google Key', false, true);

  // Priority 3: Personal key at end if not preferred but allowed
  if (!preferPersonal && allowPersonal) {
    addIfCompatible(opts.personalGeminiKey, GEMINI_ENDPOINT, 'google', 'Personal Gemini Key (fallback)', true, true, 'gemini');
    addIfCompatible(opts.personalOpenrouterKey, OPENROUTER_ENDPOINT, 'openrouter', 'Personal OpenRouter Key (fallback)', true, false, 'openrouter');
    addIfCompatible(opts.personalAnthropicKey, ANTHROPIC_ENDPOINT, 'anthropic', 'Personal Anthropic Key (fallback)', true, false, 'anthropic');
    addIfCompatible(opts.personalXaiKey, XAI_ENDPOINT, 'xai', 'Personal xAI Key (fallback)', true, false, 'xai');
  }

  console.log(`[ProviderChain] Model: ${opts.modelToUse} (family: ${modelFamily}) → ${chain.length} compatible providers: ${chain.map(p => p.label).join(', ') || 'NONE'}`);
  return chain;
}

/**
 * Get the next valid provider from chain, skipping circuit-broken keys.
 * Returns null if all providers exhausted.
 */
export function getNextProvider(
  chain: ProviderConfig[],
  circuitBreaker: ProviderCircuitBreaker,
  startIndex: number = 0,
): { provider: ProviderConfig; index: number } | null {
  for (let i = startIndex; i < chain.length; i++) {
    if (!circuitBreaker.isBad(chain[i].apiKey)) {
      return { provider: chain[i], index: i };
    }
  }
  return null;
}

/**
 * Format model name for Gateway (needs provider prefix like "google/gemini-2.5-flash")
 */
export function formatModelForProvider(model: string, provider: ProviderConfig['provider']): string {
  const modelFamily = getModelFamily(model);
  // Hard guard: prevent misrouted requests
  if (!isProviderCompatible(provider, modelFamily)) {
    console.error(`[ROUTING GUARD] Model "${model}" (family: ${modelFamily}) incompatible with provider "${provider}" — blocking request`);
    throw new Error(`Provider routing mismatch: "${model}" cannot be sent to ${provider} endpoint`);
  }
  // Strip any "google/" prefix for direct API calls
  if (provider === 'google' && model.startsWith('google/')) {
    return model.replace('google/', '');
  }
  return model;
}

/**
 * Emergency cross-family fallback: when all same-family providers are exhausted,
 * return a Gemini Flash config using the system Google key as last resort.
 * Returns null if no system key is available.
 */
export function getEmergencyFallback(
  modelFamily: ReturnType<typeof getModelFamily>,
  systemGoogleKey: string | null | undefined,
  geminiEndpoint: string,
): ProviderConfig | null {
  // Only provide emergency fallback for non-Gemini families that have exhausted their options
  if (modelFamily === 'gemini') return null;
  if (!systemGoogleKey) return null;
  console.log(`[EmergencyFallback] ${modelFamily} exhausted — falling back to Gemini Flash (system key)`);
  return {
    apiKey: systemGoogleKey,
    apiEndpoint: geminiEndpoint,
    provider: 'google',
    label: 'Emergency Gemini Flash (System)',
    isPersonalKey: false,
    supportsExplicitCache: true,
  };
}

/**
 * Emit a structured provider error SSE event
 */
export function buildProviderErrorSSE(
  errorType: ProviderErrorType,
  providerLabel: string,
  fallbackLabel?: string,
): Record<string, unknown> {
  return {
    type: "provider_error",
    error_type: errorType,
    provider: providerLabel,
    fallback: fallbackLabel || null,
    message: errorType === 'invalid_key'
      ? `API key invalid for ${providerLabel}. ${fallbackLabel ? `Switching to ${fallbackLabel}...` : 'No fallback available.'}`
      : errorType === 'quota_exhausted'
        ? `Quota exhausted for ${providerLabel}. ${fallbackLabel ? `Switching to ${fallbackLabel}...` : 'No fallback available.'}`
        : errorType === 'rate_limited'
          ? `Rate limited on ${providerLabel}. Please wait.`
          : `Provider error on ${providerLabel}.`,
  };
}
