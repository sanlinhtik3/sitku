// ═══ EXPLICIT GEMINI CONTEXT CACHING MODULE ═══
// Uses native Gemini cachedContents API for guaranteed 75% discount on system prompt tokens.
// Only available for direct Google API key users (personal or system key).
// Gateway users continue with implicit caching from Phase 1.

import { GEMINI_CACHED_CONTENT_ENDPOINT, GEMINI_NATIVE_PREFIX } from "./api-endpoints.ts";

// ═══ In-Memory Cache Store (per Deno isolate) ═══
interface CacheEntry {
  cacheName: string;
  expiresAt: number; // epoch ms
  promptHash: string;
  model: string;
}

const MAX_CACHE_ENTRIES = 5;
const CACHE_TTL_SECONDS = 1800; // 30 minutes
const cacheStore = new Map<string, CacheEntry>();

// ═══ SHA-256 Hash for cache keying ═══
async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ═══ Models that support explicit caching ═══
const CACHE_SUPPORTED_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  
  "gemini-2.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-3.1-flash-lite",
  "gemini-3.1-flash-lite-preview",
]);

export function supportsExplicitCache(model: string): boolean {
  return CACHE_SUPPORTED_MODELS.has(model);
}

// ═══ Create Explicit Cache ═══
async function createExplicitCache(
  apiKey: string,
  model: string,
  systemPromptParts: { text: string }[],
  toolDefinitions?: any[],
): Promise<{ cacheName: string; expiresAt: number } | null> {
  try {
    const contents: any[] = [{
      role: "user",
      parts: systemPromptParts,
    }];

    const body: Record<string, any> = {
      model: `models/${model}`,
      contents,
      ttl: `${CACHE_TTL_SECONDS}s`,
    };

    // Include tool definitions in cache if provided
    if (toolDefinitions && toolDefinitions.length > 0) {
      body.tools = [{
        functionDeclarations: toolDefinitions.map(t => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      }];
    }

    const response = await fetch(
      `${GEMINI_CACHED_CONTENT_ENDPOINT}?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[ExplicitCache] Create failed (${response.status}): ${errText.slice(0, 200)}`);
      return null;
    }

    const result = await response.json();
    const cacheName = result.name; // e.g. "cachedContents/abc123"
    if (!cacheName) {
      console.warn("[ExplicitCache] No cache name returned");
      return null;
    }

    const expiresAt = Date.now() + CACHE_TTL_SECONDS * 1000;
    console.log(`[ExplicitCache] Created: ${cacheName} (TTL: ${CACHE_TTL_SECONDS}s, model: ${model})`);
    return { cacheName, expiresAt };
  } catch (err) {
    console.warn(`[ExplicitCache] Create error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ═══ Get or Create Cache ═══
export async function getOrCreateCache(
  apiKey: string,
  model: string,
  systemPrompt: string,
  toolDefinitions?: any[],
): Promise<string | null> {
  if (!supportsExplicitCache(model)) {
    console.log(`[ExplicitCache] Model "${model}" not in supported set: [${[...CACHE_SUPPORTED_MODELS].join(', ')}]`);
    return null;
  }
  console.log(`[ExplicitCache] Model "${model}" supported, checking cache store (${cacheStore.size} entries)...`);

  const toolsHash = toolDefinitions ? JSON.stringify(toolDefinitions.map(t => t.function?.name || '').sort()) : '';
  const promptHash = await sha256(systemPrompt + model + toolsHash + 'v2');

  // Check existing cache
  const existing = cacheStore.get(promptHash);
  if (existing && existing.expiresAt > Date.now() + 60_000) { // 1min buffer
    console.log(`[ExplicitCache] Reusing: ${existing.cacheName} (expires in ${Math.round((existing.expiresAt - Date.now()) / 1000)}s)`);
    return existing.cacheName;
  }

  // Evict expired entries
  for (const [key, entry] of cacheStore) {
    if (entry.expiresAt < Date.now()) cacheStore.delete(key);
  }

  // Evict oldest if at capacity
  if (cacheStore.size >= MAX_CACHE_ENTRIES) {
    let oldestKey = "";
    let oldestTime = Infinity;
    for (const [key, entry] of cacheStore) {
      if (entry.expiresAt < oldestTime) {
        oldestTime = entry.expiresAt;
        oldestKey = key;
      }
    }
    if (oldestKey) cacheStore.delete(oldestKey);
  }

  const result = await createExplicitCache(apiKey, model, [{ text: systemPrompt }], toolDefinitions);
  if (!result) return null;

  cacheStore.set(promptHash, {
    cacheName: result.cacheName,
    expiresAt: result.expiresAt,
    promptHash,
    model,
  });

  return result.cacheName;
}

// ═══ Call with Explicit Cache (Native generateContent → OpenAI SSE adapter) ═══
export async function callWithExplicitCache(
  apiKey: string,
  model: string,
  cacheName: string,
  messages: any[],
  params: {
    tools?: any[];
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  },
): Promise<Response> {
  // Convert OpenAI-format messages to Gemini native format
  // Skip system messages (they're in the cache)
  const contents: any[] = [];
  for (const msg of messages) {
    if (msg.role === "system") continue;
    
    // Handle tool results (role: "tool" in OpenAI → role: "user" with functionResponse in Gemini)
    if (msg.role === "tool") {
      let resultData: any;
      try {
        resultData = typeof msg.content === "string" ? JSON.parse(msg.content) : msg.content;
      } catch {
        resultData = { result: msg.content };
      }
      contents.push({
        role: "user",
        parts: [{
          functionResponse: {
            name: msg.name || msg.tool_call_id || "unknown_tool",
            response: resultData,
          },
        }],
      });
      continue;
    }
    
    // Handle assistant messages with tool_calls
    if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
      const parts: any[] = [];
      // Include text content if present
      if (msg.content) {
        parts.push({ text: msg.content });
      }
      // Convert tool_calls to functionCall parts
      for (const tc of msg.tool_calls) {
        let args: any = {};
        try {
          args = typeof tc.function?.arguments === "string" ? JSON.parse(tc.function.arguments) : (tc.function?.arguments || {});
        } catch {
          args = {};
        }
        parts.push({
          functionCall: {
            name: tc.function?.name || "unknown",
            args,
          },
        });
      }
      contents.push({ role: "model", parts });
      continue;
    }
    
    const role = msg.role === "assistant" ? "model" : "user";
    if (typeof msg.content === "string") {
      contents.push({ role, parts: [{ text: msg.content }] });
    } else if (Array.isArray(msg.content)) {
      const parts = msg.content.map((p: any) => {
        if (p.type === "text") return { text: p.text };
        if (p.type === "image_url") return { inlineData: { mimeType: "image/jpeg", data: p.image_url?.url?.split(",")[1] || "" } };
        return { text: JSON.stringify(p) };
      });
      contents.push({ role, parts });
    }
  }
  
  console.log(`[ExplicitCache:Call] model=${model}, cacheName=${cacheName}, messages=${messages.length}, contents=${contents.length}`);

  const body: Record<string, any> = {
    contents,
    cachedContent: cacheName,
    generationConfig: {
      temperature: params.temperature ?? 0.7,
      maxOutputTokens: params.maxTokens ?? 8192,
      topP: params.topP ?? 0.95,
    },
  };

  // IMPORTANT: When using cachedContent, tools/system_instruction/tool_config
  // MUST NOT be included in the GenerateContent request — they're already in the cache.
  // Including them causes INVALID_ARGUMENT: "CachedContent can not be used with
  // GenerateContent request setting system_instruction, tools or tool_config."

  const nativeResponse = await fetch(
    `${GEMINI_NATIVE_PREFIX}${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    },
  );

  if (!nativeResponse.ok) {
    // Return error as-is so the caller's error handling can process it
    return nativeResponse;
  }

  // ═══ ADAPTER: Transform native Gemini SSE → OpenAI-format SSE ═══
  const nativeReader = nativeResponse.body!.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      let nativeBuffer = "";
      try {
        while (true) {
          const { done, value } = await nativeReader.read();
          if (done) break;
          nativeBuffer += decoder.decode(value, { stream: true });

          let nlIdx: number;
          while ((nlIdx = nativeBuffer.indexOf("\n")) !== -1) {
            let line = nativeBuffer.slice(0, nlIdx);
            nativeBuffer = nativeBuffer.slice(nlIdx + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data: ") || line.trim() === "") continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              break;
            }

            try {
              const native = JSON.parse(jsonStr);
              const candidate = native.candidates?.[0];

              // Map text content
              const textContent = candidate?.content?.parts
                ?.filter((p: any) => p.text)
                .map((p: any) => p.text)
                .join("") || "";

              // Map tool calls
              const toolCalls = candidate?.content?.parts
                ?.filter((p: any) => p.functionCall)
                .map((p: any, idx: number) => ({
                  index: idx,
                  id: `call_${Date.now()}_${idx}`,
                  type: "function",
                  function: {
                    name: p.functionCall.name,
                    arguments: JSON.stringify(p.functionCall.args || {}),
                  },
                }));

              // Build OpenAI-format delta
              const delta: Record<string, any> = {};
              if (textContent) delta.content = textContent;
              if (toolCalls && toolCalls.length > 0) delta.tool_calls = toolCalls;

              // Map finish reason
              let finishReason = null;
              if (candidate?.finishReason === "STOP") finishReason = "stop";
              else if (candidate?.finishReason === "MAX_TOKENS") finishReason = "length";

              // Build usage from usageMetadata
              let usage: any = undefined;
              if (native.usageMetadata) {
                const um = native.usageMetadata;
                usage = {
                  prompt_tokens: um.promptTokenCount || 0,
                  completion_tokens: um.candidatesTokenCount || 0,
                  total_tokens: um.totalTokenCount || 0,
                  cached_tokens: um.cachedContentTokenCount || 0,
                  prompt_tokens_details: {
                    cached_tokens: um.cachedContentTokenCount || 0,
                  },
                };
              }

              const openaiChunk: Record<string, any> = {
                id: `chatcmpl-${Date.now()}`,
                object: "chat.completion.chunk",
                choices: [{
                  index: 0,
                  delta,
                  finish_reason: finishReason,
                }],
              };
              if (usage) openaiChunk.usage = usage;

              controller.enqueue(encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`));
            } catch {
              // Skip malformed chunks
            }
          }
        }
        // Send [DONE]
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        console.error("[ExplicitCache] Stream adapter error:", err);
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
