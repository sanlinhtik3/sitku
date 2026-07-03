// ═══ Project Phoenix: _shared/context-compactor.ts ═══
// Extracted from agent-chat/index.ts (lines 3750-3916)
// Token estimation and smart context compaction

export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Gemini family (per Google docs, May 2026)
  "gemini-2.5-flash-lite": 1000000,
  "gemini-2.5-flash": 1000000,
  "gemini-2.5-pro": 2000000, // Bug #3 fix: Pro is 2M, not 1M
  "gemini-3.5-flash": 1048576,
  "gemini-3-flash-preview": 1000000,
  "gemini-3.1-pro-preview": 1000000,
  "gemini-3.1-flash-lite": 1000000,
  "gemini-3.1-flash-lite-preview": 1000000,
  // Claude family
  "claude-4-5-sonnet": 200000,
  "claude-4-6-opus": 200000,
  // OpenRouter models (Bug #5 fix: explicit context limits prevent silent overflow)
  "openai/gpt-4o": 128000,
  "openai/gpt-4o-mini": 128000,
  "anthropic/claude-sonnet-4": 200000,
  "anthropic/claude-opus-4": 200000,
  "qwen/qwen3.6-plus-preview:free": 32000,
  "qwen/qwen3.6-plus-preview": 32000,
  "deepseek/deepseek-r1": 64000,
  "deepseek/deepseek-r1:free": 64000,
  "x-ai/grok-2": 128000,
};

// Lowered from 0.80 to 0.70 for safety margin against token estimation variance,
// especially for Myanmar language where tokenizer density is higher than English.
const COMPACTION_THRESHOLD_RATIO = 0.70;

// ═══ LANGUAGE-AWARE TOKEN ESTIMATION ═══
// Myanmar Unicode characters (U+1000-U+109F, U+AA60-U+AA7F) tokenize at ~2 tokens/char
// in both Gemini SentencePiece and Claude BPE tokenizers, not the 0.25 tokens/char
// that the chars/4 heuristic assumes for English.
export function estimateStringTokens(text: string): number {
  if (!text) return 0;
  const totalChars = text.length;
  if (totalChars === 0) return 0;

  const myanmarChars = (text.match(/[\u1000-\u109F\uAA60-\uAA7F]/g) || []).length;

  // Myanmar text: ~2 tokens per char. English/ASCII: ~0.25 tokens per char.
  // Blend based on actual character counts to handle mixed-language content.
  const myanmarTokens = myanmarChars * 2;
  const otherTokens = Math.ceil((totalChars - myanmarChars) / 4);

  return myanmarTokens + otherTokens;
}

// CANONICAL estimateTokens: language-aware, operates on message arrays
export function estimateTokens(messages: any[]): number {
  let total = 0;
  for (const msg of messages) {
    const content = typeof msg.content === 'string'
      ? msg.content
      : JSON.stringify(msg.content || '');
    total += estimateStringTokens(content);
    if (msg.tool_calls) total += Math.ceil(JSON.stringify(msg.tool_calls).length / 4);
  }
  return total;
}

// ═══ P1 UPGRADE: IMPORTANCE-WEIGHTED CONTEXT COMPACTION ═══
// Scores each message by importance before pruning, preserving critical context.

/**
 * Score a message's importance for compaction decisions.
 * Higher score = more important = keep longer.
 */
function scoreMessageForCompaction(
  msg: any,
  index: number,
  totalMessages: number,
  laterContent: string,
): number {
  let score = 0;
  const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');
  
  // 1. Recency bias (newer = more important)
  const recencyScore = (index / totalMessages) * 30;
  score += recencyScore;

  // 2. Role weight
  if (msg.role === 'system') score += 50; // System messages are critical
  if (msg.role === 'user') score += 15;   // User messages provide context
  if (msg.role === 'tool') score += 5;    // Tool results less important if old

  // 3. Content referenced later (cross-reference check)
  const contentWords = content.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4);
  const referencedWords = contentWords.filter((w: string) => laterContent.includes(w));
  if (referencedWords.length > 3) score += 20;

  // 4. Contains user facts or decisions
  if (/(?:my name|i prefer|i want|remember|ကျွန်တော်|ကျွန်မ|မှတ်ထား)/i.test(content)) score += 25;

  // 5. Contains financial data (critical to preserve)
  if (/(?:balance|ငွေ|ကျပ်|THB|MMK|USD|income|expense)/i.test(content)) score += 20;

  // 6. Contains tool calls (decisions made)
  if (msg.tool_calls) score += 10;

  // 7. Length penalty (very long messages less important per-token)
  if (content.length > 2000) score -= 5;

  return Math.max(0, Math.min(100, score));
}

export async function compactContextIfNeeded(
  conversationMessages: any[],
  modelId: string,
  supabase: any,
  sessionId: string,
  personalGeminiKey?: string
): Promise<any[]> {
  // ═══ FIX 11: Short-circuit for short conversations — skip token estimation entirely ═══
  const nonSystemCount = conversationMessages.filter(m => m.role !== 'system').length;
  if (nonSystemCount < 10) {
    const contextLimit = MODEL_CONTEXT_LIMITS[modelId] || 1000000;
    const budgetThreshold = Math.floor(contextLimit * 0.30);
    const hasOverbudgetMessage = conversationMessages.some(m => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
      return content.length > 50000 && estimateStringTokens(content) > budgetThreshold;
    });
    if (!hasOverbudgetMessage) {
      return conversationMessages;
    }
  }

  const contextLimit = MODEL_CONTEXT_LIMITS[modelId] || 1000000;
  const threshold = Math.floor(contextLimit * COMPACTION_THRESHOLD_RATIO);
  const currentTokens = estimateTokens(conversationMessages);

  if (currentTokens <= threshold) {
    return conversationMessages;
  }

  console.log(`[Compaction] Token estimate ${currentTokens} exceeds threshold ${threshold} for ${modelId}. Compacting...`);

  const systemMessages = conversationMessages.filter(m => m.role === 'system');
  const nonSystemMessages = conversationMessages.filter(m => m.role !== 'system');

  if (nonSystemMessages.length <= 4) {
    console.log(`[Compaction] Too few non-system messages (${nonSystemMessages.length}), skipping`);
    return conversationMessages;
  }

  // ═══ P1: IMPORTANCE-WEIGHTED SPLIT ═══
  // Instead of fixed 50% split, score all messages and separate by importance
  const laterContent = nonSystemMessages.slice(Math.floor(nonSystemMessages.length / 2))
    .map(m => (typeof m.content === 'string' ? m.content : '').toLowerCase())
    .join(' ');

  const scored = nonSystemMessages.map((msg, index) => ({
    msg,
    index,
    score: scoreMessageForCompaction(msg, index, nonSystemMessages.length, laterContent),
  }));

  // Sort by score ascending (lowest importance first)
  scored.sort((a, b) => a.score - b.score);

  // Take bottom 50% by score as "olderHalf" to summarize
  const splitCount = Math.floor(scored.length / 2);
  const toSummarize = scored.slice(0, splitCount).sort((a, b) => a.index - b.index).map(s => s.msg);
  const toKeep = scored.slice(splitCount).sort((a, b) => a.index - b.index).map(s => s.msg);

  // ═══ PRE-COMPACTION MEMORY FLUSH (OpenClaw Pattern) ═══
  // Before discarding old messages, extract and persist key knowledge
  // so it survives in durable storage even after context window truncation
  await preCompactionMemoryFlush(supabase, sessionId, toSummarize);

  // Build text for summarization
  const summaryInput = toSummarize.map((m: any) => {
    const toolInfo = m.tool_calls ? ` [tools: ${JSON.stringify(m.tool_calls).substring(0, 150)}]` : "";
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
    return `${m.role}: ${content.substring(0, 500)}${toolInfo}`;
  }).join("\n");

  if (!personalGeminiKey) {
    console.warn("[Compaction] No personal Gemini key available, falling back to truncation");
    return [...systemMessages, ...toKeep];
  }

  try {
    const { GEMINI_OPENAI_ENDPOINT } = await import("./api-endpoints.ts");
    const summaryResponse = await fetch(GEMINI_OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${personalGeminiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `Summarize the following conversation history. You MUST preserve:
1. User's name, preferences, and personal facts
2. Important decisions and agreements made
3. Status of any open tasks, TODOs, or ongoing work
4. Key financial data discussed (balances, transactions, subscriptions)
5. Tools used and their outcomes
6. Any emotional tone or relationship context

Write as a dense factual summary, not a narrative. Max 500 words. Use bullet points for clarity.`
          },
          {
            role: "user",
            content: `Summarize this conversation segment:\n\n${summaryInput.substring(0, 12000)}`
          }
        ],
        max_tokens: 600,
        temperature: 0.2,
      }),
    });

    if (!summaryResponse.ok) {
      console.warn(`[Compaction] Personal key returned ${summaryResponse.status}, falling back to truncation`);
      return [...systemMessages, ...toKeep];
    }

    const summaryResult = await summaryResponse.json();
    const summary = summaryResult.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      console.warn("[Compaction] Empty summary from LLM, falling back to truncation");
      return [...systemMessages, ...toKeep];
    }

    console.log(`[Compaction] Generated summary (${summary.length} chars) replacing ${toSummarize.length} messages (importance-weighted)`);

    // Build compacted messages
    const compactedMessages = [
      {
        role: "system",
        content: (systemMessages[0]?.content || '') +
          `\n\n[Previous conversation summary (${toSummarize.length} messages compacted, importance-weighted):
${summary}

The conversation continues with recent messages below.]`
      },
      ...toKeep,
    ];

    // Re-check tokens after compaction
    const newTokens = estimateTokens(compactedMessages);
    if (newTokens > threshold) {
      console.warn(`[Compaction] Still over threshold after compaction (${newTokens}). Trimming recent window.`);
      let trimmedRecent = [...toKeep];
      while (trimmedRecent.length > 2) {
        trimmedRecent = trimmedRecent.slice(1);
        const trimmedMessages = [
          {
            role: "system",
            content: (systemMessages[0]?.content || '') +
              `\n\n[Previous conversation summary:\n${summary}]`
          },
          ...trimmedRecent,
        ];
        if (estimateTokens(trimmedMessages) <= threshold) {
          console.log(`[Compaction] Trimmed to ${trimmedRecent.length} recent messages to fit budget`);
          return trimmedMessages;
        }
      }
    }

    // Save compacted summary to session for persistence
    try {
      await supabase
        .from("agent_chat_sessions")
        .update({ context_summary: summary.substring(0, 5000) })
        .eq("id", sessionId);
      console.log(`[Compaction] Summary persisted to session ${sessionId}`);
    } catch (e) {
      console.error("[Compaction] Failed to persist summary:", e);
    }

    return compactedMessages;
  } catch (error) {
    console.error("[Compaction] Error during summarization:", error);
    return [...systemMessages, ...toKeep];
  }
}

// ═══ PRE-COMPACTION MEMORY FLUSH ═══
// Extract key facts, decisions, and user preferences from messages about to be discarded.
// Saves them to agent_learning_context so knowledge survives context window truncation.
// Inspired by OpenClaw's pre-compaction flush pattern.
async function preCompactionMemoryFlush(
  supabase: any,
  sessionId: string,
  messagesToDiscard: any[]
): Promise<void> {
  try {
    const facts: { key: string; value: string }[] = [];

    for (const msg of messagesToDiscard) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');
      if (!content || content.length < 20) continue;

      // Extract user facts and preferences from user messages
      if (msg.role === 'user') {
        // Detect self-introductions / personal facts
        const nameMatch = content.match(/(?:my name is|ကျွန်တော်နာမည်|ကျွန်မနာမည်|i'm called|call me)\s+([^\s,.!?]+)/i);
        if (nameMatch) {
          facts.push({ key: 'user_name_mentioned', value: nameMatch[1] });
        }

        // Detect explicit preferences
        const prefPatterns = [
          /(?:i prefer|i like|i want|ကြိုက်|နှစ်သက်|ပိုကြိုက်)\s+(.{5,80})/i,
          /(?:don't|မ|never|hate)\s+(.{5,60})/i,
        ];
        for (const pattern of prefPatterns) {
          const match = content.match(pattern);
          if (match) {
            facts.push({ key: 'user_preference', value: match[0].substring(0, 200) });
          }
        }
      }

      // Extract tool outcomes from assistant messages (key decisions & results)
      if (msg.role === 'assistant' && msg.tool_calls && Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          const toolName = tc.name || tc.function?.name;
          if (toolName && ['manage_flowstate', 'manage_workspace_task', 'remember_user_fact', 'update_agent_settings'].includes(toolName)) {
            const args = tc.arguments || tc.function?.arguments;
            const argStr = typeof args === 'string' ? args : JSON.stringify(args || {});
            facts.push({
              key: `tool_action_${toolName}`,
              value: argStr.substring(0, 300),
            });
          }
        }
      }

      // Extract financial data mentions
      if (msg.role === 'user' || msg.role === 'assistant') {
        const financeMatch = content.match(/(?:balance|ငွေ|ကျပ်|THB|MMK|USD|income|expense|revenue)\s*[:=]?\s*([\d,]+(?:\.\d+)?)/i);
        if (financeMatch) {
          facts.push({ key: 'financial_data', value: financeMatch[0].substring(0, 200) });
        }
      }
    }

    // Deduplicate and limit
    const uniqueFacts = facts.reduce((acc, f) => {
      const key = `${f.key}:${f.value.substring(0, 50)}`;
      if (!acc.has(key)) acc.set(key, f);
      return acc;
    }, new Map<string, { key: string; value: string }>());

    const factsToSave = Array.from(uniqueFacts.values()).slice(0, 15);

    if (factsToSave.length === 0) {
      console.log(`[PreCompactionFlush] No extractable facts from ${messagesToDiscard.length} messages`);
      return;
    }

    // Batch insert to agent_learning_context with compaction_save type
    const { data: session } = await supabase
      .from("agent_chat_sessions")
      .select("user_id")
      .eq("id", sessionId)
      .single();

    if (!session?.user_id) {
      console.warn("[PreCompactionFlush] Could not resolve user_id from session");
      return;
    }

    const inserts = factsToSave.map(f => ({
      user_id: session.user_id,
      context_type: 'compaction_save',
      context_key: f.key,
      context_value: f.value,
      usage_count: 1,
    }));

    const { error } = await supabase
      .from("agent_learning_context")
      .upsert(inserts, { onConflict: 'user_id,context_type,context_key', ignoreDuplicates: true });

    if (error) {
      console.warn("[PreCompactionFlush] Upsert error (non-critical):", error.message);
    } else {
      console.log(`[PreCompactionFlush] ✅ Saved ${factsToSave.length} facts before discarding ${messagesToDiscard.length} messages`);
    }
  } catch (e) {
    // Non-critical — compaction should still proceed even if flush fails
    console.error("[PreCompactionFlush] Error (non-critical):", e);
  }
}
