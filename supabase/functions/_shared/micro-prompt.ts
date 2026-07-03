// ═══ INITIATIVE 3: Micro-Prompt Pipeline ═══
// Sub-500 token fast path for simple/turbo messages
// Bypasses: agentic loop, guards, enrichment, compaction, BrainState, observer LLM, embedding

import { GEMINI_NATIVE_PREFIX, GEMINI_OPENAI_ENDPOINT, OPENROUTER_HEADERS } from "./api-endpoints.ts";
import { trackAIUsage } from "./streaming-engine.ts";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

export interface MicroPromptParams {
  supabase: any;
  userId: string;
  sessionId: string;
  sanitizedMessage: string;
  agentSettings: any;
  userName: string;
  quickFacts: { fact_key: string; fact_value: string }[];
  last4History: { role: string; content: string }[];
  apiKey: string;
  apiEndpoint: string;
  model: string;
  encoder: TextEncoder;
  controller: ReadableStreamDefaultController;
  isBurmese: boolean;
  source_channel: string | null;
  apiSource: string;
  clientRequestId?: string | null;
  traceId?: string | null;
  /** Optional system Google key for emergency Gemini fallback when OpenRouter fails */
  systemGoogleKey?: string | null;
}

// ═══ TRUNCATION DETECTION: Checks if micro-prompt output looks suspiciously incomplete ═══
function detectTruncation(content: string, inputMessage: string, isBurmese: boolean): boolean {
  const trimmed = content.trim();
  
  // Empty or near-empty response is always suspicious
  if (trimmed.length < 3) return true;
  
  // For non-greeting inputs, very short responses are suspicious
  const isGreeting = /^(hi|hello|hey|mingalar|မင်္ဂလာ|ဟယ်လို|ok|okay|thanks|ကျေးဇူး|bye)\s*[!?.]*$/i.test(inputMessage.trim());
  if (!isGreeting && trimmed.length < 20) {
    console.warn(`[MicroPrompt] ⚠️ Suspiciously short response (${trimmed.length} chars) for non-greeting input`);
    return true;
  }

  // ═══ FIX: Response-to-input ratio check ═══
  // If the response is much shorter than the input, it's likely a shallow/truncated reply
  if (!isGreeting && inputMessage.trim().length > 15 && trimmed.length < inputMessage.trim().length * 0.5) {
    console.warn(`[MicroPrompt] ⚠️ Response too short relative to input (${trimmed.length} vs ${inputMessage.trim().length} chars)`);
    return true;
  }
  
  // Detect mid-word cutoff: ends with a partial Burmese syllable or Latin word
  if (isBurmese) {
    // Burmese: ends with a consonant without a vowel/final marker = likely mid-syllable
    const endsAbruptly = /[\u1000-\u1021]$/.test(trimmed) && !/[။\.!?\s]$/.test(trimmed);
    if (endsAbruptly && trimmed.length < 80) {
      console.warn(`[MicroPrompt] ⚠️ Burmese response ends mid-syllable: "...${trimmed.slice(-20)}"`);
      return true;
    }
  } else {
    // English: ends mid-word (letter without punctuation/space terminator)
    const endsAbruptly = /[a-zA-Z]$/.test(trimmed) && !/[.!?)\]"']$/.test(trimmed);
    if (endsAbruptly && trimmed.length < 60) {
      console.warn(`[MicroPrompt] ⚠️ English response ends mid-word: "...${trimmed.slice(-20)}"`);
      return true;
    }
  }
  
  return false;
}

/**
 * Handles simple/turbo messages with a micro-prompt (~300-500 tokens).
 * Returns true if handled, false if the message should fall through to full pipeline.
 */
export async function handleMicroPrompt(params: MicroPromptParams): Promise<boolean> {
  const {
    supabase, userId, sessionId, sanitizedMessage, agentSettings,
    userName, quickFacts, last4History, apiKey, apiEndpoint, model,
    encoder, controller, isBurmese, source_channel, apiSource,
    clientRequestId, traceId, systemGoogleKey,
  } = params;

  const botName = agentSettings?.bot_name || "BeeBot";
  const botEmoji = agentSettings?.bot_emoji || "🐝";
  const personality = agentSettings?.personality_mode || "friendly";
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });

  // Build micro system prompt (~300 tokens)
  const factsStr = quickFacts.length > 0
    ? `\nKnown about user: ${quickFacts.slice(0, 3).map(f => f.fact_value).join('; ')}`
    : '';

  const personalityHint = personality === 'professional' ? 'Be concise and formal.'
    : personality === 'casual' ? 'Be relaxed and conversational.'
    : personality === 'mentor' ? 'Be warm and guiding.'
    : 'Be warm, friendly, and natural.';

  const microSystemPrompt = `You are ${botName} ${botEmoji}, a personalized AI assistant.
User: ${userName}. Date: ${today}.${factsStr}
${personalityHint}
Reply naturally in the user's language. Be warm, brief, and unique. Never repeat previous greetings. Do not mention tools or internal systems.`;

  // Build messages array (micro: system + last 4 history + user message)
  const messages: { role: string; content: string }[] = [
    { role: "system", content: microSystemPrompt },
    ...last4History.slice(-4),
    { role: "user", content: sanitizedMessage },
  ];

  const t_start = Date.now();
  console.log(`[MicroPrompt] ⚡ ENTRY — key=${apiKey ? `${apiKey.slice(0,6)}...` : 'EMPTY'}, model=${model}, endpoint=${apiEndpoint}, msgLen=${sanitizedMessage.length}`);
  console.log(`[MicroPrompt] ⚡ Starting micro-prompt (${messages.length} messages, ~${microSystemPrompt.length} chars system prompt)`);

  // ═══ INCREASED OUTPUT BUDGET: 1024 tokens (was 256) to prevent truncation ═══
  const MICRO_MAX_TOKENS = 1024;

  let safeEnqueue = true;
  function enqueue(data: Uint8Array) {
    if (!safeEnqueue) return;
    try { controller.enqueue(data); } catch { safeEnqueue = false; }
  }

  try {
    if (!apiKey) {
      console.warn(`[MicroPrompt] No API key available — falling through`);
      return false;
    }

    const isOpenRouter = apiEndpoint.includes('openrouter.ai');
    const isAnthropic = apiEndpoint.includes('anthropic.com');
    const isXai = apiEndpoint.includes('x.ai');
    let response: Response | null = null;
    let modelUsed = model;

    if (isAnthropic) {
      // ═══ Anthropic Path: Claude Messages API format ═══
      console.log(`[MicroPrompt] 🟣 Anthropic detected — using Claude Messages API format`);
      const systemContent = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
      const nonSystemMsgs = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
      const claudeBody = JSON.stringify({
        model,
        system: systemContent,
        messages: nonSystemMsgs,
        max_tokens: MICRO_MAX_TOKENS,
        temperature: 0.7,
        stream: true,
      });
      try {
        const attemptResponse = await fetch(apiEndpoint, {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
          },
          body: claudeBody,
          signal: AbortSignal.timeout(15_000),
        });
        if (attemptResponse.ok) {
          response = attemptResponse;
          console.log(`[MicroPrompt] ✅ Anthropic succeeded with "${model}"`);
        } else {
          const errText = await attemptResponse.text().catch(() => '');
          console.warn(`[MicroPrompt] Anthropic "${model}" returned ${attemptResponse.status}: ${errText.slice(0, 300)}`);
        }
      } catch (fetchErr: any) {
        console.warn(`[MicroPrompt] Anthropic fetch error: ${fetchErr.message}`);
      }
      if (!response || !response.ok) {
        console.warn(`[MicroPrompt] Anthropic failed — falling through to full pipeline`);
        return false;
      }
    } else if (isXai) {
      // ═══ xAI Path: OpenAI-compatible format ═══
      console.log(`[MicroPrompt] 🔵 xAI detected — using OpenAI-compatible format`);
      const xaiBody = JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: MICRO_MAX_TOKENS,
        temperature: 0.7,
        stream: true,
      });
      try {
        const attemptResponse = await fetch(apiEndpoint, {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: xaiBody,
          signal: AbortSignal.timeout(15_000),
        });
        if (attemptResponse.ok) {
          response = attemptResponse;
          console.log(`[MicroPrompt] ✅ xAI succeeded with "${model}"`);
        } else {
          const errText = await attemptResponse.text().catch(() => '');
          console.warn(`[MicroPrompt] xAI "${model}" returned ${attemptResponse.status}: ${errText.slice(0, 300)}`);
        }
      } catch (fetchErr: any) {
        console.warn(`[MicroPrompt] xAI fetch error: ${fetchErr.message}`);
      }
      if (!response || !response.ok) {
        console.warn(`[MicroPrompt] xAI failed — falling through to full pipeline`);
        return false;
      }
    } else if (isOpenRouter) {
      // ═══ OpenRouter Path: Standard OpenAI chat completions format ═══
      console.log(`[MicroPrompt] 🌐 OpenRouter detected — using OpenAI-compatible format`);
      const orBody = JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: MICRO_MAX_TOKENS,
        temperature: 0.7,
        stream: true,
      });
      try {
        const attemptResponse = await fetch(apiEndpoint, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...OPENROUTER_HEADERS,
          },
          body: orBody,
          signal: AbortSignal.timeout(15_000),
        });
        if (attemptResponse.ok) {
          response = attemptResponse;
          console.log(`[MicroPrompt] ✅ OpenRouter succeeded with "${model}"`);
        } else {
          const errText = await attemptResponse.text().catch(() => '');
          console.warn(`[MicroPrompt] OpenRouter "${model}" returned ${attemptResponse.status}: ${errText.slice(0, 300)}`);
        }
      } catch (fetchErr: any) {
        console.warn(`[MicroPrompt] OpenRouter fetch error: ${fetchErr.message}`);
      }

      if (!response || !response.ok) {
        // ═══ Emergency Gemini Fallback for OpenRouter failure ═══
        if (systemGoogleKey) {
          console.warn(`[MicroPrompt] OpenRouter failed — trying Gemini Flash emergency fallback`);
          const geminiBody = JSON.stringify({
            model: 'gemini-2.5-flash-lite',
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            max_tokens: MICRO_MAX_TOKENS,
            temperature: 0.7,
            stream: true,
          });
          try {
            const geminiAttempt = await fetch(GEMINI_OPENAI_ENDPOINT, {
              method: "POST",
              headers: { "Authorization": `Bearer ${systemGoogleKey}`, "Content-Type": "application/json" },
              body: geminiBody,
              signal: AbortSignal.timeout(15_000),
            });
            if (geminiAttempt.ok) {
              response = geminiAttempt;
              modelUsed = 'gemini-2.5-flash-lite';
              console.log(`[MicroPrompt] ✅ Emergency Gemini fallback succeeded`);
            } else {
              console.warn(`[MicroPrompt] Emergency Gemini fallback failed (${geminiAttempt.status}) — falling through`);
            }
          } catch (e: any) {
            console.warn(`[MicroPrompt] Emergency Gemini fallback error: ${e.message}`);
          }
        }
        if (!response || !response.ok) {
          console.warn(`[MicroPrompt] OpenRouter failed with no emergency fallback — falling through to full pipeline`);
          return false;
        }
      }
    } else {
      // ═══ Gemini Path: Native + OAI-compat fallback ═══
      const systemInstruction = messages.find(m => m.role === 'system')?.content || '';
      const geminiContents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));

      const requestBody = JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: geminiContents,
        generationConfig: { maxOutputTokens: MICRO_MAX_TOKENS, temperature: 0.7 },
      });

      const MICRO_MODELS = [model, "gemini-2.5-flash"];

      // --- Attempt 1: Native Gemini endpoint (key= param) ---
      for (const tryModel of MICRO_MODELS) {
        const endpoint = `${GEMINI_NATIVE_PREFIX}${tryModel}:streamGenerateContent?key=${apiKey}&alt=sse`;
        try {
          const attemptResponse = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody,
            signal: AbortSignal.timeout(15_000),
          });
          if (attemptResponse.ok) {
            response = attemptResponse;
            modelUsed = tryModel;
            if (tryModel !== model) console.log(`[MicroPrompt] ⚠️ Primary "${model}" failed, fallback "${tryModel}" succeeded`);
            break;
          }
          const errText = await attemptResponse.text().catch(() => '');
          console.warn(`[MicroPrompt] Model "${tryModel}" returned ${attemptResponse.status}: ${errText.slice(0, 300)}`);
          response = null;
        } catch (fetchErr: any) {
          console.warn(`[MicroPrompt] Model "${tryModel}" fetch error: ${fetchErr.message}`);
          response = null;
        }
      }

      // --- Attempt 2: OpenAI-compatible endpoint (Bearer token) ---
      if (!response || !response.ok) {
        console.log(`[MicroPrompt] Native endpoints failed — trying OpenAI-compatible endpoint`);
        const openaiCompatMessages = messages.map(m => ({ role: m.role, content: m.content }));
        for (const tryModel of MICRO_MODELS) {
          try {
            const oaiEndpoint = GEMINI_OPENAI_ENDPOINT;
            const oaiBody = JSON.stringify({ model: tryModel, messages: openaiCompatMessages, max_tokens: MICRO_MAX_TOKENS, temperature: 0.7, stream: true });
            const attemptResponse = await fetch(oaiEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
              body: oaiBody,
              signal: AbortSignal.timeout(15_000),
            });
            if (attemptResponse.ok) {
              response = attemptResponse;
              modelUsed = tryModel;
              console.log(`[MicroPrompt] ✅ OpenAI-compatible endpoint succeeded with "${tryModel}"`);
              break;
            }
            const errText = await attemptResponse.text().catch(() => '');
            console.warn(`[MicroPrompt] OAI-compat "${tryModel}" returned ${attemptResponse.status}: ${errText.slice(0, 200)}`);
          } catch (e: any) {
            console.warn(`[MicroPrompt] OAI-compat "${tryModel}" fetch error: ${e.message}`);
          }
        }
      }

      if (!response || !response.ok) {
        console.warn(`[MicroPrompt] All Gemini models failed — falling through to full pipeline`);
        return false;
      }
    }

    console.log(`[MicroPrompt] ✅ Using model "${modelUsed}" (primary was "${model}")`);

    // Stream native Gemini SSE tokens, re-emit as OpenAI-compatible SSE for client
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let firstTokenEmitted = false;
    let streamEndedCleanly = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        streamEndedCleanly = true;
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);

        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') {
          streamEndedCleanly = true;
          break;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          // Support Gemini native, OpenAI-compatible, AND Anthropic SSE formats
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text  // Native Gemini
            || parsed.choices?.[0]?.delta?.content  // OpenAI-compatible (Gemini OAI, xAI, OpenRouter)
            || (parsed.type === 'content_block_delta' ? parsed.delta?.text : undefined);  // Anthropic
          
          // Check for finish_reason to confirm clean completion
          const finishReason = parsed.candidates?.[0]?.finishReason 
            || parsed.choices?.[0]?.finish_reason
            || (parsed.type === 'message_stop' ? 'stop' : undefined);  // Anthropic
          if (finishReason === 'STOP' || finishReason === 'stop' || finishReason === 'end_turn') {
            streamEndedCleanly = true;
          }
          
          if (text) {
            fullContent += text;
            if (!firstTokenEmitted) {
              console.log(`[MicroPrompt] ⚡ First token at ${Date.now() - t_start}ms`);
              firstTokenEmitted = true;
            }
            // Re-emit as OpenAI-compatible SSE for the client
            enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
          }
        } catch { /* partial JSON, skip */ }
      }
    }

    // ═══ TRUNCATION GUARD: Validate response completeness before persisting ═══
    if (detectTruncation(fullContent, sanitizedMessage, isBurmese)) {
      console.warn(`[MicroPrompt] 🚫 TRUNCATION DETECTED — discarding partial response (${fullContent.length} chars), falling through to full pipeline`);
      // Note: partial content was already streamed to client, but we won't save it.
      // The full pipeline will generate a proper response that overwrites the stream.
      return false;
    }

    if (!streamEndedCleanly && fullContent.length < 50) {
      console.warn(`[MicroPrompt] 🚫 Stream ended abnormally with short content (${fullContent.length} chars) — falling through`);
      return false;
    }

    // Post-check: did the response contain tool-like intent that was misclassified?
    const TOOL_INTENT_LEAK = /I('ll| will) (search|look up|check|find|generate|create|calculate|manage)|let me (search|look|check|find)|searching for|looking up/i;
    if (TOOL_INTENT_LEAK.test(fullContent)) {
      console.warn(`[MicroPrompt] Tool intent detected in response — future messages should use full pipeline`);
      // Still use this response (it's already streamed), but log the anomaly
    }

    // Fire-and-forget: save messages to DB
    Promise.all([
      supabase.from("agent_chat_messages").insert({
        session_id: sessionId, user_id: userId, role: "user",
        content: sanitizedMessage,
        ...(source_channel ? { source_channel } : {}),
      }),
      supabase.from("agent_chat_messages").insert({
        session_id: sessionId, user_id: userId, role: "assistant",
        content: fullContent || `${botEmoji}`,
        is_error: false,
      }),
    ]).catch(e => console.error("[MicroPrompt] DB save error:", e));

    // Track usage in the same ledger as the full agentic loop.
    Promise.resolve(trackAIUsage(
      supabase,
      userId,
      sessionId,
      (apiSource || "personal_key") as any,
      modelUsed,
      {
        tokensInput: Math.ceil(JSON.stringify(messages).length / 3.2),
        tokensOutput: Math.ceil(fullContent.length / 3.2),
        durationMs: Date.now() - t_start,
      },
      true,
      undefined,
      "none",
      {
        clientRequestId: clientRequestId || null,
        traceId: traceId || null,
        callKind: "micro_prompt",
        provider: apiEndpoint.includes("openrouter") ? "openrouter" : apiEndpoint.includes("anthropic") ? "anthropic" : "google",
        requestCount: 1,
        metadata: { source_channel: source_channel || "web", path: "micro_prompt" },
      },
    )).catch(() => {});

    console.log(`[MicroPrompt] ✅ Complete in ${Date.now() - t_start}ms (${fullContent.length} chars, cleanEnd=${streamEndedCleanly})`);
    return true;
  } catch (err: any) {
    console.warn(`[MicroPrompt] Failed (${err.message}), falling through to full pipeline`);
    return false;
  }
}
