// ═══ API KEY RESOLVER: Single Source of Truth for Hybrid Key Governance ═══
// Shared between agent-chat, agent-heartbeat, and telegram-webhook

export interface ApiConfig {
  apiKey: string;
  model: string;
  source: "personal_key" | "system_grant" | "free_tier" | "gateway";
  provider: 'google' | 'anthropic' | 'openrouter' | 'xai';
  apiEndpoint: string;
  apiSourceLabel: string;
  usePersonalKey: boolean;
}

export interface ApiResolverInput {
  userAISettings: {
    gemini_api_key?: string | null;
    personal_anthropic_key?: string | null;
    personalOpenrouterKey?: string | null;
    personalXaiKey?: string | null;
    gemini_model?: string | null;
    granted_by?: string | null;
    is_paused?: boolean | null;
    disabled_connectors?: string[] | null;
  } | null;
  adminSettings: {
    allow_personal_api_key?: boolean | null;
    require_personal_key?: boolean | null;
    enable_free_tier?: boolean | null;
    enable_google_provider?: boolean | null;
    enable_anthropic_provider?: boolean | null;
  } | null;
  systemGoogleKey: string | null;
  systemAnthropicKey?: string | null;
  preferredModel?: string | null;
  apiSourcePreference?: string | null;
}

import { GEMINI_OPENAI_ENDPOINT, ANTHROPIC_ENDPOINT, OPENROUTER_ENDPOINT, XAI_ENDPOINT } from "./api-endpoints.ts";

const GEMINI_ENDPOINT = GEMINI_OPENAI_ENDPOINT;

/**
 * Resolves which API key, endpoint, and model to use based on the hybrid governance chain:
 * Personal Key → System Grant → Free Tier → Gateway (no key)
 */
export function resolveApiConfig(input: ApiResolverInput): ApiConfig {
  const {
    userAISettings,
    adminSettings,
    systemGoogleKey,
    systemAnthropicKey,
    preferredModel,
    apiSourcePreference,
  } = input;

  const requestedModel = preferredModel || userAISettings?.gemini_model || "gemini-3.5-flash";
  const defaultModel = requestedModel.startsWith('google/')
    ? requestedModel.replace(/^google\//, '')
    : requestedModel;
  const isClaudeModel = defaultModel.startsWith('claude');
  const isOpenRouterModel = defaultModel.includes('/') && !defaultModel.startsWith('google/');
  const isXaiModel = defaultModel.startsWith('grok');
  const disabled = userAISettings?.disabled_connectors ?? [];

  const hasPersonalGeminiKey = !!userAISettings?.gemini_api_key && !disabled.includes('gemini');
  const hasPersonalAnthropicKey = !!userAISettings?.personal_anthropic_key && !disabled.includes('anthropic');
  const hasPersonalOpenrouterKey = !!userAISettings?.personalOpenrouterKey && !disabled.includes('openrouter');
  const hasPersonalXaiKey = !!userAISettings?.personalXaiKey && !disabled.includes('xai');
  const hasPersonalKey = hasPersonalGeminiKey || hasPersonalAnthropicKey || hasPersonalOpenrouterKey || hasPersonalXaiKey;
  const allowPersonalKey = adminSettings?.allow_personal_api_key === true;
  const preferPersonal = apiSourcePreference !== 'system';

  // Priority 1: Personal Key
  if (preferPersonal && hasPersonalKey && allowPersonalKey) {
    // 1a: Claude model + Anthropic key
    if (isClaudeModel && hasPersonalAnthropicKey) {
      return {
        apiKey: userAISettings!.personal_anthropic_key!,
        model: defaultModel,
        source: "personal_key",
        provider: 'anthropic',
        apiEndpoint: ANTHROPIC_ENDPOINT,
        apiSourceLabel: "Personal Anthropic Key",
        usePersonalKey: true,
      };
    }
    if (isOpenRouterModel && hasPersonalOpenrouterKey) {
      return {
        apiKey: userAISettings!.personalOpenrouterKey!,
        model: defaultModel,
        source: "personal_key",
        provider: 'openrouter',
        apiEndpoint: OPENROUTER_ENDPOINT,
        apiSourceLabel: "Personal OpenRouter Key",
        usePersonalKey: true,
      };
    }
    if (isXaiModel && hasPersonalXaiKey) {
      return {
        apiKey: userAISettings!.personalXaiKey!,
        model: defaultModel,
        source: "personal_key",
        provider: 'xai',
        apiEndpoint: XAI_ENDPOINT,
        apiSourceLabel: "Personal xAI Key",
        usePersonalKey: true,
      };
    }
    // 1b: Gemini key
    if (!isOpenRouterModel && !isXaiModel && hasPersonalGeminiKey) {
      return {
        apiKey: userAISettings!.gemini_api_key!,
        model: defaultModel,
        source: "personal_key",
        provider: 'google',
        apiEndpoint: GEMINI_ENDPOINT,
        apiSourceLabel: "Personal Gemini API Key",
        usePersonalKey: true,
      };
    }
  }

  // Priority 2: System Grant (user was granted access by admin)
  const hasSystemGrant = !!userAISettings?.granted_by && !userAISettings?.is_paused;
  if (hasSystemGrant && systemGoogleKey && !isOpenRouterModel && !isXaiModel) {
    return {
      apiKey: systemGoogleKey,
      model: defaultModel,
      source: "system_grant",
      provider: 'google',
      apiEndpoint: GEMINI_ENDPOINT,
      apiSourceLabel: "System Provided (Free)",
      usePersonalKey: false,
    };
  }

  // Priority 3: Free Tier (system key available, free tier enabled)
  const enableFreeTier = adminSettings?.enable_free_tier !== false;
  if (enableFreeTier && systemGoogleKey && !isOpenRouterModel && !isXaiModel) {
    return {
      apiKey: systemGoogleKey,
      model: defaultModel,
      source: "free_tier",
      provider: 'google',
      apiEndpoint: GEMINI_ENDPOINT,
      apiSourceLabel: "System Provided (Free)",
      usePersonalKey: false,
    };
  }

  // Priority 4: No key available (gateway fallback)
  return {
    apiKey: "",
    model: defaultModel,
    source: "gateway",
    provider: isClaudeModel ? 'anthropic' : isOpenRouterModel ? 'openrouter' : isXaiModel ? 'xai' : 'google',
    apiEndpoint: isClaudeModel ? ANTHROPIC_ENDPOINT : isOpenRouterModel ? OPENROUTER_ENDPOINT : isXaiModel ? XAI_ENDPOINT : GEMINI_ENDPOINT,
    apiSourceLabel: "Gateway",
    usePersonalKey: false,
  };
}
