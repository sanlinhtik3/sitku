// ═══ Loop Context Manager Module — Extracted from agentic-loop.ts ═══
// Pre-loop setup, SmartCompact v3, relay/budget management, nudge builder, post-loop.

import { generateFallbackResponse, formatToolName } from "./tool-executor.ts";
import { emitThinking, trackAIUsage } from "./streaming-engine.ts";
import { buildBrainStateRecall, generateQueryFingerprint, generateCategoryCacheKey, scoreMessageImportance, extractReasoningFingerprint } from "./bee-brain.ts";

/**
 * Inject BrainState recall into currentMessages if not turbo tier.
 */
export async function injectBrainState(
  currentMessages: any[],
  supabase: any,
  observerResult: any,
  sanitizedMessage: string,
  prefetchedBrainState: any[] | null | undefined,
  isTurboTier: boolean,
): Promise<void> {
  if (isTurboTier) {
    console.log(`[TurboBoost] ⚡ BrainState SKIPPED`);
    return;
  }
  try {
    const categoryKey = generateCategoryCacheKey(observerResult?.primary_action, observerResult?.complexity, sanitizedMessage);
    const queryFingerprint = categoryKey.length > 5 ? categoryKey : generateQueryFingerprint(sanitizedMessage);
    if (queryFingerprint.length > 5) {
      let cachedStrategies = prefetchedBrainState || null;
      if (!cachedStrategies) {
        const { data } = await supabase
          .from("agent_self_improvements")
          .select("insight, confidence")
          .eq("improvement_type", "reasoning_cache")
          .eq("is_active", true)
          .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order("confidence", { ascending: false })
          .limit(3);
        cachedStrategies = data;
      }

      if (cachedStrategies && cachedStrategies.length > 0) {
        const brainHint = buildBrainStateRecall(cachedStrategies);
        if (brainHint) {
          const sysIdx = currentMessages.findIndex((m: any) => m.role === 'system');
          if (sysIdx !== -1) {
            currentMessages.splice(sysIdx + 1, 0, { role: "user", content: `[BRAIN STATE]\n${brainHint}` });
            console.log(`[BrainState] Injected ${cachedStrategies.length} cached reasoning strategies${prefetchedBrainState ? ' (prefetched)' : ''}`);
          }
        }
      }
    }
  } catch (e) {
    console.warn(`[BrainState] Cache lookup failed (non-critical):`, e instanceof Error ? e.message : e);
  }
}

/**
 * Inject router hint into currentMessages.
 */
export function injectRouterHint(
  currentMessages: any[],
  observerResult: any,
  isSimpleMessage: boolean,
  isTurboTier: boolean,
): void {
  if (!observerResult?.primary_action || isSimpleMessage || isTurboTier) {
    if (isTurboTier) console.log(`[TurboBoost] ⚡ RouterHint SKIPPED`);
    return;
  }
  const ROUTER_TOOL_MAP: Record<string, string> = {
    search_web: 'search_web', manage_flowstate: 'manage_flowstate',
    generate_content: 'generate_ai_content', manage_content: 'manage_ai_content',
    manage_task: 'manage_workspace_task', get_navigation: 'get_app_navigation',
    manage_notifications: 'manage_notifications', get_user_info: 'get_user_info',
  };
  const hintTool = ROUTER_TOOL_MAP[observerResult.primary_action];
  if (hintTool) {
    const insertIdx = currentMessages.findIndex((m: any, i: number) => i > 0 && m.role !== 'system') || 1;
    currentMessages.splice(insertIdx, 0, {
      role: "user",
      content: `[ROUTER HINT: User intent classified as "${observerResult.primary_action}" (confidence: ${observerResult.confidence || 0.8}). Prioritize "${hintTool}" tool. Skip lengthy analysis — act directly.]`
    });
    console.log(`[RouterHint] Injected hint: ${observerResult.primary_action} → ${hintTool}`);
  }
}

/**
 * Pre-LLM fast prune: truncate old messages before each API call.
 */
export function preLLMFastPrune(currentMessages: any[], step: number): void {
  if (step <= 1) return;
  const keepIntact = Math.max(0, currentMessages.length - 4);
  for (let pi = 0; pi < keepIntact; pi++) {
    const msg = currentMessages[pi];
    if (msg.role === 'system') continue;
    const content = typeof msg.content === 'string' ? msg.content : '';
    if (content.length > 2000) {
      currentMessages[pi] = { ...msg, content: content.slice(0, 800) + '\n...[truncated for performance]' };
    }
  }
}

/**
 * Entity-Preserving Tool Result Compression (Safety Net 1)
 * Compresses tool results to ≤500 chars while preserving critical entities.
 */
export function compressToolResult(raw: string, toolName: string): string {
  if (!raw || raw.length <= 500) return raw;

  // Extract critical entities BEFORE truncation
  const preserved: string[] = [];
  
  // UUIDs
  const uuids = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
  if (uuids) preserved.push(...uuids.slice(0, 3).map(u => `id:${u}`));
  
  // URLs
  const urls = raw.match(/https?:\/\/\S+/gi);
  if (urls) preserved.push(...urls.slice(0, 2).map(u => `url:${u.slice(0, 100)}`));
  
  // Currency/money
  const money = raw.match(/[\d,]+\.?\d*\s*(?:MMK|USD|ks|kyat|Ks)/gi);
  if (money) preserved.push(...money.slice(0, 3));
  
  // Error codes
  const errors = raw.match(/(?:error|status|code)[:\s]*(\d{3,}|\w+_\w+)/gi);
  if (errors) preserved.push(...errors.slice(0, 2));
  
  // Key-value pairs for critical fields
  const kvPairs = raw.match(/"(?:balance|total|count|price|amount|id|name|status|success)":\s*(?:"[^"]*"|[\d.]+|true|false|null)/gi);
  if (kvPairs) preserved.push(...kvPairs.slice(0, 5));

  const header = preserved.length > 0 ? `[ENTITIES: ${preserved.join(', ')}]\n` : '';
  const contextBudget = Math.max(100, 500 - header.length);
  const context = raw.slice(0, contextBudget);
  
  return `${header}${context}${raw.length > contextBudget ? '...' : ''}`;
}

/**
 * SmartCompact v3: Aggressive in-loop context pruning for edge function perf.
 * Now with entity-preserving tool result compression (Safety Net 1).
 */
export function smartCompactV3(currentMessages: any[]): void {
  const preCompactJson = JSON.stringify(currentMessages);
  const loopContextSize = preCompactJson.length;
  if (loopContextSize <= 100_000) return;

  console.log(`[SmartCompact v3] Context: ${loopContextSize} chars → aggressive pruning for edge function perf`);
  
  // Phase 1: Compress tool results with entity preservation + truncate old messages
  const recentMessageCutoff = Math.max(0, currentMessages.length - 6);
  for (let mi = 0; mi < recentMessageCutoff; mi++) {
    const msg = currentMessages[mi];
    if (msg.role === 'system') continue;
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');
    if (content.length > 300) {
      const toolName = msg.name || msg.role;
      // Use entity-preserving compression for tool results
      if (msg.role === 'tool' || msg.name) {
        currentMessages[mi] = { ...msg, content: compressToolResult(content, toolName) };
      } else {
        currentMessages[mi] = { ...msg, content: `[${toolName}: ${content.slice(0, 150)}... (pruned)]` };
      }
    }
  }
  
  // Phase 2: Importance-weighted pruning
  const postPhase1Size = JSON.stringify(currentMessages).length;
  if (postPhase1Size > 80_000) {
    const scored: Array<{ index: number; score: number }> = [];
    const totalMsgs = currentMessages.length;
    const laterContent = currentMessages.slice(Math.floor(totalMsgs / 2)).map((m: any) => 
      typeof m.content === 'string' ? m.content.toLowerCase() : ''
    ).join(' ');
    
    for (let mi = 0; mi < currentMessages.length; mi++) {
      const msg = currentMessages[mi];
      if (msg.role === "system") continue;
      const score = scoreMessageImportance(msg, mi, totalMsgs, laterContent);
      scored.push({ index: mi, score });
    }
    
    scored.sort((a, b) => a.score - b.score);
    
    let currentSize = postPhase1Size;
    const TARGET_SIZE = 60_000;
    let pruned = 0;
    
    for (const { index, score } of scored) {
      if (currentSize <= TARGET_SIZE) break;
      const msg = currentMessages[index];
      const content = typeof msg.content === 'string' ? msg.content : '';
      if (content.length <= 100) continue;
      
      const toolName = msg.name || msg.role;
      const firstLine = content.split('\n')[0].slice(0, 60);
      const savedChars = content.length - 60;
      currentMessages[index] = { ...msg, content: `[${toolName}: ${firstLine}... (score:${score})]` };
      currentSize -= savedChars;
      pruned++;
    }
    
    console.log(`[SmartCompact v3] Phase 2 pruned ${pruned} messages: ${postPhase1Size} → ~${currentSize} chars`);
  } else {
    console.log(`[SmartCompact v3] Phase 1 sufficient: ${loopContextSize} → ~${postPhase1Size} chars`);
  }
}

/**
 * Build relay context snapshot for soft budget continuation.
 * Includes tool_results_summary so the next relay round preserves accumulated results.
 */
export function buildRelayContextSnapshot(
  sanitizedMessage: string,
  allToolResults: any[],
  allToolCalls: any[],
  finalContent: string,
  step: number,
  loopElapsed: number,
): string {
  return JSON.stringify({
    original_query: sanitizedMessage.slice(0, 1000),
    tool_results_detail: allToolResults.slice(-8).map(r => ({
      tool: r.name,
      success: !r.error,
      snippet: JSON.stringify(r.result).slice(0, 800),
    })),
    // P0: Preserve tool results across relay handoffs for safety-cap checks
    tool_results_summary: allToolResults.map(r => ({
      name: r.name,
      result: r.result,
      error: r.error,
    })),
    answer_so_far: (finalContent || "").slice(0, 6000),
    steps_completed: step,
    tools_used: allToolCalls.map((tc: any) => tc.name),
    elapsed_ms: loopElapsed,
  }).slice(0, 15000);
}

/**
 * Build nudge content for conversationalist after tool execution.
 */
// Shared nudge rules — extracted to avoid repetition across 3 variants (~300 tokens saved)
const NUDGE_CORE_RULES = `No raw JSON. No snake_case keys. No [SYSTEM:] tags. Speak warmly in user's language. For factual data, use ONLY tool results — trust them over training knowledge.`;

export function buildNudgeContent(
  stepToolResults: { name: string; result: any; error?: string }[],
  completedToolNamesList: string,
  agentSettings: any,
  step: number,
  MAX_AGENT_STEPS: number,
  TOOLS: any[],
  disabledToolsSet: Set<string>,
): string {
  const bName = agentSettings?.bot_name || "BeeBot";
  const bEmoji = agentSettings?.bot_emoji || "🐝";
  const bMode = agentSettings?.personality_mode || "friendly";
  const persona = `${bName} ${bEmoji} (personality: ${bMode})`;
  const hasToolErrors = stepToolResults.some(tr => tr.error || tr.result?.error || tr.result?.success === false);

  if (hasToolErrors && step < MAX_AGENT_STEPS - 1) {
    const failedTools = stepToolResults.filter(tr => tr.error || tr.result?.error || tr.result?.success === false).map(tr => tr.name);
    const failedErrorSummaries = stepToolResults.filter(tr => tr.error || tr.result?.error || tr.result?.success === false).map(tr => `${tr.name}: ${String(tr.error || tr.result?.error || 'failed').slice(0, 100)}`).join("; ");
    const allFailedDisabled = failedTools.every(t => disabledToolsSet.has(t));

    if (allFailedDisabled) {
      return `[SYSTEM] Tools done: ${completedToolNamesList}. ERRORS.
DISABLED: ${failedTools.join(", ")} | ERRORS: ${failedErrorSummaries}
These tools CANNOT be called again. Respond as ${persona} using only successful data. If none, say service is temporarily unavailable.
${NUDGE_CORE_RULES}`;
    }
    const availableToolNames = (TOOLS || []).map((t: any) => t.function?.name).filter((n: string) => n && !failedTools.includes(n) && !disabledToolsSet.has(n)).slice(0, 8).join(", ");
    return `[SYSTEM] Tools done: ${completedToolNamesList}. ERRORS.
FAILED: ${failedTools.join(", ")} | ERRORS: ${failedErrorSummaries}
DISABLED (never call): ${[...disabledToolsSet].join(', ') || 'none'}
RECOVERY (${MAX_AGENT_STEPS - step - 1} steps left): Try different tools [${availableToolNames}] or synthesize from available data. Present error "guide"/"action_needed" warmly.
Respond as ${persona}. ${NUDGE_CORE_RULES}`;
  } else if (hasToolErrors) {
    const failed = stepToolResults.filter(tr => tr.error).map(tr => `${tr.name}: "${String(tr.error).slice(0, 80)}"`);
    const succeeded = stepToolResults.filter(tr => !tr.error).map(tr => tr.name);
    return `[SYSTEM] Tools done: ${completedToolNamesList}. PARTIAL FAILURE.
FAILED: [${failed.join(', ')}] | OK: [${succeeded.join(', ')}]
Respond as ${persona}. Never present failed-tool data — say "ဒီ data ကို ယခု ရယူ၍ မရပါ". Present error "guide"/"action_needed" warmly. No invented numbers.
${NUDGE_CORE_RULES}`;
  } else {
    return `[SYSTEM] Tools done: ${completedToolNamesList}. All OK.
Respond as ${persona}: 1) Confirm action 2) Add insight 3) Suggest next step (optional).
${NUDGE_CORE_RULES} If you cite ANY fact NOT from tool results, you are hallucinating.
RESEARCH queries: Dedicate a section per source (## Source: [Name]), then add Cross-Source Analysis.`;
  }
}

/**
 * Post-loop: Save reasoning cache (thinking cache with quality filter & dynamic confidence).
 */
export async function saveThinkingCache(
  supabase: any,
  sessionId: string,
  capturedThinkingContent: string,
  stepThinkingMap: Map<number, string>,
  allToolCalls: any[],
  allToolResults: any[],
  finalContent: string,
  finalIsError: boolean,
  isSimpleMessage: boolean,
  observerResult: any,
  sanitizedMessage: string,
): Promise<void> {
  const isComplexReasoning = allToolCalls.length >= 2 || stepThinkingMap.size >= 2;
  const qualityPassed = finalContent && !finalIsError && finalContent.length > 200;
  if (!qualityPassed || capturedThinkingContent.length <= 100 || isSimpleMessage || !isComplexReasoning) {
    if (capturedThinkingContent.length > 100 && !isComplexReasoning) {
      console.log(`[ThinkingCache] Skipped caching — not complex enough (tools: ${allToolCalls.length}, thinking steps: ${stepThinkingMap.size})`);
    }
    return;
  }

  try {
    const reasoningFP = extractReasoningFingerprint(capturedThinkingContent);
    if (!reasoningFP) return;

    const cacheKey = generateCategoryCacheKey(observerResult?.primary_action, observerResult?.complexity, sanitizedMessage);
    const queryFP = cacheKey.length > 5 ? cacheKey : generateQueryFingerprint(sanitizedMessage);
    
    const successfulToolCount = allToolResults.filter(r => !r.error).length;
    const toolSuccessRate = allToolResults.length > 0 ? successfulToolCount / allToolResults.length : 1;
    const dynamicConfidence = Math.min(0.95, 
      0.4 + (toolSuccessRate * 0.3) + (allToolCalls.length * 0.05) + (stepThinkingMap.size * 0.1)
    );
    
    const { data: oldestCandidate } = await supabase
      .from("agent_self_improvements")
      .select("id", { count: "exact" })
      .eq("improvement_type", "reasoning_cache")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(21);

    if (oldestCandidate && oldestCandidate.length >= 20 && oldestCandidate[0]?.id) {
      await supabase.from("agent_self_improvements")
        .update({ is_active: false })
        .eq("id", oldestCandidate[0].id);
    }

    Promise.resolve(supabase.from("agent_self_improvements").insert({
      improvement_type: "reasoning_cache",
      insight: `[FP:${queryFP.slice(0, 100)}] ${reasoningFP}`,
      learned_from: { session_id: sessionId, query_fingerprint: queryFP, tools_used: allToolCalls.length, tool_success_rate: toolSuccessRate, thinking_steps: stepThinkingMap.size, timestamp: new Date().toISOString() },
      confidence: dynamicConfidence,
      priority: dynamicConfidence >= 0.8 ? "medium" : "low",
      is_active: true,
    })).catch(() => {});
    console.log(`[ThinkingCache] Saved (quality-filtered) — ${reasoningFP.length} chars, confidence: ${dynamicConfidence.toFixed(2)}, toolSuccessRate: ${(toolSuccessRate * 100).toFixed(0)}%`);
  } catch (e) {
    console.warn(`[ThinkingCache] Save failed (non-critical):`, e instanceof Error ? e.message : e);
  }
}
