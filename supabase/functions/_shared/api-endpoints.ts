// ═══ API Endpoints — Single Source of Truth ═══
// All API endpoint URLs are defined here. Import from this module instead of hardcoding.

/** Gemini OpenAI-compatible endpoint (Bearer token auth) */
export const GEMINI_OPENAI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

/** Gemini native REST prefix (key= param auth). Usage: `${GEMINI_NATIVE_PREFIX}${model}:generateContent?key=${apiKey}` */
export const GEMINI_NATIVE_PREFIX = "https://generativelanguage.googleapis.com/v1beta/models/";

/** Gemini embedding endpoint. Usage: `${GEMINI_EMBEDDING_ENDPOINT}?key=${apiKey}` */
export const GEMINI_EMBEDDING_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";

/** Gemini cached contents endpoint. Usage: `${GEMINI_CACHED_CONTENT_ENDPOINT}?key=${apiKey}` */
export const GEMINI_CACHED_CONTENT_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/cachedContents";

/** Anthropic Messages API */
export const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";

/** OpenRouter API */
export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/** xAI (Grok) API */
export const XAI_ENDPOINT = "https://api.x.ai/v1/chat/completions";

/** Shared OpenRouter headers — import instead of inlining */
export const OPENROUTER_HEADERS = {
  "HTTP-Referer": "https://zoecrypto.lovable.app",
  "X-Title": "BeeBot AI",
} as const;
