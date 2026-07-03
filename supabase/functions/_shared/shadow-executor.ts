// ═══ P4: Shadow Execution — Observation-Only Parallel LLM ═══
// For complex/deep queries, fires a parallel "shadow" LLM call using a secondary model.
// Phase 1: Telemetry only (no replacement). Phase 2 (future): Auto-swap on quality.

import { formatModelForProvider } from "./provider-failover.ts";

export interface ShadowResult {
  content: string;
  model: string;
  latencyMs: number;
  contentLength: number;
  error?: string;
}

/**
 * Fire a shadow LLM call in the background. Returns a promise that resolves
 * with the shadow result (or null on failure/timeout).
 * 
 * IMPORTANT: This is fire-and-forget from the caller's perspective.
 * The primary path never waits for this.
 */
export function fireShadowExecution(
  providerChain: Array<{ apiKey: string; apiEndpoint: string; provider: string; isPersonalKey: boolean }>,
  currentProviderIndex: number,
  modelToUse: string,
  userMessage: string,
  systemPromptSummary: string,
  timeoutMs: number = 10_000,
): { promise: Promise<ShadowResult | null>; abort: () => void } {
  const abortController = new AbortController();

  // Pick a different provider/model if available
  const shadowProviderIndex = currentProviderIndex + 1 < providerChain.length
    ? currentProviderIndex + 1
    : (currentProviderIndex - 1 >= 0 ? currentProviderIndex - 1 : -1);

  if (shadowProviderIndex < 0 || shadowProviderIndex >= providerChain.length) {
    // Only one provider — can't shadow
    return {
      promise: Promise.resolve(null),
      abort: () => {},
    };
  }

  const shadowProvider = providerChain[shadowProviderIndex];
  const shadowModel = formatModelForProvider(modelToUse, shadowProvider.provider as "google" | "openrouter" | "anthropic" | "xai");

  const promise = executeShadow(
    shadowProvider.apiEndpoint,
    shadowProvider.apiKey,
    shadowModel,
    userMessage,
    systemPromptSummary,
    timeoutMs,
    abortController.signal,
  );

  return {
    promise,
    abort: () => abortController.abort(),
  };
}

async function executeShadow(
  apiEndpoint: string,
  apiKey: string,
  model: string,
  userMessage: string,
  systemPromptSummary: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<ShadowResult | null> {
  const startTime = Date.now();

  try {
    // Build a simplified prompt — no tools, direct answer only
    const messages = [
      {
        role: "user",
        parts: [{
          text: `${systemPromptSummary}\n\n---\nUser question: ${userMessage}\n\nProvide a direct, helpful answer. Be concise and accurate.`,
        }],
      },
    ];

    const requestBody = {
      contents: messages,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
        candidateCount: 1,
      },
    };

    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey && !apiEndpoint.includes("lovable.dev")
          ? { "x-goog-api-key": apiKey }
          : { Authorization: `Bearer ${apiKey}` }),
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
    });

    if (!response.ok) {
      return {
        content: "",
        model,
        latencyMs: Date.now() - startTime,
        contentLength: 0,
        error: `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return {
      content,
      model,
      latencyMs: Date.now() - startTime,
      contentLength: content.length,
    };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    // Silence abort errors — expected when primary finishes first
    if (errMsg.includes("abort") || errMsg.includes("Abort")) {
      return null;
    }
    return {
      content: "",
      model,
      latencyMs: Date.now() - startTime,
      contentLength: 0,
      error: errMsg,
    };
  }
}

/**
 * Compare shadow result with primary content for telemetry.
 * Returns quality heuristics for span metadata.
 */
export function compareShadowResult(
  primaryContent: string,
  shadowResult: ShadowResult | null,
): Record<string, any> {
  if (!shadowResult || shadowResult.error || !shadowResult.content) {
    return {
      shadow_available: false,
      shadow_error: shadowResult?.error || 'no_result',
    };
  }

  const primaryLen = primaryContent.trim().length;
  const shadowLen = shadowResult.content.trim().length;
  const lengthRatio = primaryLen > 0 ? shadowLen / primaryLen : 0;

  return {
    shadow_available: true,
    shadow_model: shadowResult.model,
    shadow_latency_ms: shadowResult.latencyMs,
    shadow_content_length: shadowLen,
    primary_content_length: primaryLen,
    length_ratio: Math.round(lengthRatio * 100) / 100,
    shadow_was_faster: shadowResult.latencyMs < (Date.now() - shadowResult.latencyMs), // approximate
    shadow_was_longer: shadowLen > primaryLen,
  };
}
