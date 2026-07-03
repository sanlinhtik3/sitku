// ═══ Shared AI Caller with Model Fallback ═══
// For standalone edge functions that need resilient AI calls.
// Uses personal key with automatic model fallback on token/rate limit errors.

import { getModelFallback, classifyProviderError, isModelFallbackError } from "./provider-failover.ts";
import { GEMINI_OPENAI_ENDPOINT, OPENROUTER_HEADERS } from "./api-endpoints.ts";

const GEMINI_DIRECT_URL = GEMINI_OPENAI_ENDPOINT;

export interface AICallOptions {
  apiKey: string;
  model: string;
  apiEndpoint?: string;
  messages: Array<{ role: string; content: any }>;
  temperature?: number;
  max_tokens?: number;
  tools?: any[];
  tool_choice?: any;
  timeoutMs?: number;
}

export interface AICallResult {
  data: any;
  modelUsed: string;
  fallbackUsed: boolean;
}

/** Detect if endpoint is OpenRouter */
function isOpenRouterEndpoint(endpoint: string): boolean {
  return endpoint.includes('openrouter.ai');
}

/** Build headers based on provider */
function buildHeaders(apiKey: string, endpoint: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (isOpenRouterEndpoint(endpoint)) {
    Object.assign(headers, OPENROUTER_HEADERS);
  }
  return headers;
}

/**
 * Call AI API with automatic model fallback.
 * If the current model hits token limit, rate limit, or overload,
 * automatically retries with the next model in the fallback chain.
 */
export async function callAIWithFallback(options: AICallOptions): Promise<AICallResult> {
  const attemptedModels = new Set<string>([options.model]);
  let currentModel = options.model;
  let fallbackUsed = false;
  const maxAttempts = 4;
  const endpoint = options.apiEndpoint || GEMINI_DIRECT_URL;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 120000);

    try {
      const body: any = {
        model: currentModel,
        messages: options.messages,
        temperature: options.temperature ?? 0.5,
        max_tokens: options.max_tokens ?? 4096,
      };
      if (options.tools) body.tools = options.tools;
      if (options.tool_choice) body.tool_choice = options.tool_choice;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: buildHeaders(options.apiKey, endpoint),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorType = classifyProviderError(response.status, errorText);

        // Skip model fallback for OpenRouter models (cross-provider incompatible)
        const isORModel = currentModel.includes('/') && !currentModel.startsWith('google/');

        if (!isORModel && isModelFallbackError(errorType)) {
          const fallback = getModelFallback(currentModel, attemptedModels);
          if (fallback) {
            console.log(`[AICallerFallback] ${currentModel} → ${fallback} (${errorType})`);
            attemptedModels.add(fallback);
            currentModel = fallback;
            fallbackUsed = true;
            continue;
          }
        }

        const err = new Error(`AI API error (${response.status}): ${errorText.slice(0, 200)}`) as any;
        err.status = response.status;
        throw err;
      }

      const data = await response.json();
      return { data, modelUsed: currentModel, fallbackUsed };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${(options.timeoutMs || 120000) / 1000} seconds`);
      }
      if (attempt === maxAttempts - 1) throw error;
      
      // Skip cross-provider fallback for OpenRouter models
      if (currentModel.includes('/') && !currentModel.startsWith('google/')) throw error;

      const errorType = classifyProviderError(error.status || 0, error.message || String(error));
      if (isModelFallbackError(errorType)) {
        const fallback = getModelFallback(currentModel, attemptedModels);
        if (fallback) {
          console.log(`[AICallerFallback] ${currentModel} → ${fallback} (${errorType})`);
          attemptedModels.add(fallback);
          currentModel = fallback;
          fallbackUsed = true;
          continue;
        }
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error("All model fallback attempts exhausted");
}
