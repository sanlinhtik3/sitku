// ═══ Embedding Helpers — Extracted from executor-helpers.ts ═══
// Handles Gemini embedding API calls and in-memory caching.

import { GEMINI_EMBEDDING_ENDPOINT } from "./api-endpoints.ts";

// ═══ EMBEDDINGS ═══
export async function callGeminiEmbeddingAPI(
  text: string,
  apiKey: string,
  ctx?: { userId?: string; sessionId?: string; runId?: string; traceId?: string },
): Promise<number[] | null> {
  const t0 = Date.now();
  try {
    const response = await fetch(`${GEMINI_EMBEDDING_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "models/gemini-embedding-001", content: { parts: [{ text }] }, outputDimensionality: 768 }),
    });
    if (!response.ok) {
      _logEmb(ctx, text, Date.now() - t0, false, `HTTP ${response.status}`);
      return null;
    }
    const data = await response.json();
    const vec = data.embedding?.values || null;
    _logEmb(ctx, text, Date.now() - t0, !!vec);
    return vec;
  } catch (e: any) {
    _logEmb(ctx, text, Date.now() - t0, false, e?.message ?? String(e));
    console.error("[Embedding] API call error:", e);
    return null;
  }
}

function _logEmb(
  ctx: { userId?: string; sessionId?: string; runId?: string; traceId?: string } | undefined,
  text: string,
  durationMs: number,
  ok: boolean,
  err?: string,
) {
  if (!ctx?.userId) return;
  const approxTokens = Math.max(1, Math.ceil(text.length / 4));
  import("./usage-logger.ts").then(({ logSatelliteUsage }) => {
    logSatelliteUsage({
      userId: ctx.userId!,
      sessionId: ctx.sessionId,
      runId: ctx.runId,
      traceId: ctx.traceId,
      callKind: "embedding",
      model: "gemini-embedding-001",
      provider: "google",
      apiSource: "personal_key",
      tokensInput: approxTokens,
      tokensOutput: 0,
      durationMs,
      isSuccessful: ok,
      errorMessage: err ?? null,
      metadata: { chars: text.length },
    });
  }).catch(() => { /* ignore */ });
}

export async function generateEmbedding(text: string, supabaseClient: any, userId: string): Promise<number[] | null> {
  try {
    const { data: userSettings } = await supabaseClient.from("ai_user_settings").select("gemini_api_key").eq("user_id", userId).maybeSingle();
    if (userSettings?.gemini_api_key) {
      const result = await callGeminiEmbeddingAPI(text, userSettings.gemini_api_key);
      if (result) return result;
    }
    console.warn("[Embedding] No personal Gemini key available, embedding generation skipped");
    return null;
  } catch (error) {
    console.error("[Embedding] Generation error:", error);
    return null;
  }
}

// ═══ In-memory embedding cache to reduce Gemini API calls ═══
const embeddingCache = new Map<string, { embedding: number[]; ts: number }>();
const EMBEDDING_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const EMBEDDING_CACHE_MAX = 100;

export async function generateEmbeddingWithKey(text: string, personalKey: string | null): Promise<number[] | null> {
  const cacheKey = text.substring(0, 200).toLowerCase().trim();
  const cached = embeddingCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < EMBEDDING_CACHE_TTL_MS) {
    console.log('[Embedding] ⚡ Cache hit');
    return cached.embedding;
  }

  if (personalKey) {
    const result = await callGeminiEmbeddingAPI(text, personalKey);
    if (result) {
      embeddingCache.set(cacheKey, { embedding: result, ts: Date.now() });
      if (embeddingCache.size > EMBEDDING_CACHE_MAX) {
        const oldestKey = embeddingCache.keys().next().value;
        if (oldestKey) embeddingCache.delete(oldestKey);
      }
      return result;
    }
  }

  console.warn("[Embedding] No personal key available, embedding skipped");
  return null;
}
