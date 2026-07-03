// ═══ Project Titan: Phase 1A - Unified SSE Event Parser ═══
// Single handleSSEEvent() dispatcher used by both main and relay loops.
// Eliminates ~700 lines of duplicated event handling.

import type { ThinkingStep, CompletedToolStep, ToolCallState, SubTask } from "./types";
import { TOOL_LABELS, formatToolSummary } from "./types";
import { finalizeToolCalls } from "./useToolCallTracker";
import { safeParseSSEEvent } from "./sseSchemas";

const MAX_THOUGHTS = 25;

// ═══ Boundary classifier (token / word / sentence / block) ═══
// Used to bias the visual drip cadence so the typing animation pauses naturally
// at sentence and block boundaries (Claude/Kimi-style reading rhythm).
export type BoundaryKind = 'token' | 'word' | 'sentence' | 'block';

export function classifyDelta(prevTail: string, added: string): BoundaryKind {
  if (!added) return 'token';
  // Block-level: paragraph break, fence open/close, heading start, list item, table row end
  if (/\n\s*\n|```|\n#{1,6}\s|\n[-*+]\s|\n\d+\.\s|\|\s*\n/.test(added)) return 'block';
  // Sentence-level: terminal punctuation followed by whitespace/end (incl. Myanmar ။ and FW ？！)
  const combined = (prevTail + added).slice(-12);
  if (/[.!?။？！](?:["')\]\u201D\u2019]*)(?:\s|$)/.test(combined)) return 'sentence';
  // Word-level: whitespace or word-closing punctuation at end of chunk
  if (/[\s,;:)\]}\u104A\u104B]$/.test(added)) return 'word';
  return 'token';
}

// Helper: classify the just-appended chunk and record absolute offsets on the
// drip state. Called from every text-ingest site (text_delta / content / OpenAI).
function recordBoundary(handlers: SSEEventHandlers, added: string) {
  const ds = handlers.dripState;
  if (!ds) return;
  const totalLen = handlers.contentRef.current.length;
  const prevTail = handlers.contentRef.current.slice(Math.max(0, totalLen - added.length - 8), totalLen - added.length);
  const kind = classifyDelta(prevTail, added);
  ds.lastBoundaryKind = kind;
  if (kind === 'sentence') {
    ds.lastSentenceEnd = totalLen;
  } else if (kind === 'block') {
    ds.lastBlockEnd = totalLen;
    ds.lastSentenceEnd = totalLen; // a block end implies a sentence end too
  }
}

// ═══ FIX #10: Streaming-safe <thinking> stripper ═══
// LLMs occasionally leak <thinking>...</thinking> blocks during streaming.
// We can't strip with a simple regex on each delta because a tag may be split
// across chunks ("<think" | "ing>"). State machine + holdback buffer below.
type ThinkingStripState = {
  inside: boolean;       // currently between <thinking> and </thinking>
  holdback: string;      // partial tail that might start a tag
};
function ensureStripState(handlers: any): ThinkingStripState {
  if (!handlers.__thinkingStrip) {
    handlers.__thinkingStrip = { inside: false, holdback: "" };
  }
  return handlers.__thinkingStrip as ThinkingStripState;
}
const OPEN_TAG = "<thinking>";
const CLOSE_TAG = "</thinking>";
const MAX_HOLDBACK = Math.max(OPEN_TAG.length, CLOSE_TAG.length); // 11
function stripThinkingFromDelta(state: ThinkingStripState, incoming: string): string {
  let buf = state.holdback + incoming;
  let out = "";
  while (buf.length > 0) {
    if (state.inside) {
      const end = buf.indexOf(CLOSE_TAG);
      if (end === -1) {
        // Keep last (CLOSE_TAG.length - 1) chars in case tag is split
        const keep = Math.min(buf.length, CLOSE_TAG.length - 1);
        state.holdback = buf.slice(buf.length - keep);
        return out;
      }
      buf = buf.slice(end + CLOSE_TAG.length);
      state.inside = false;
    } else {
      const start = buf.indexOf(OPEN_TAG);
      if (start === -1) {
        // Could there still be a partial open tag at the tail? Hold back up to MAX_HOLDBACK chars
        // only if the tail looks like a possible prefix of OPEN_TAG.
        let safeLen = buf.length;
        const tailWindow = Math.min(buf.length, MAX_HOLDBACK);
        for (let i = buf.length - tailWindow; i < buf.length; i++) {
          const tail = buf.slice(i);
          if (OPEN_TAG.startsWith(tail)) { safeLen = i; break; }
        }
        out += buf.slice(0, safeLen);
        state.holdback = buf.slice(safeLen);
        return out;
      }
      out += buf.slice(0, start);
      buf = buf.slice(start + OPEN_TAG.length);
      state.inside = true;
    }
  }
  state.holdback = "";
  return out;
}


// ═══ Event handler callbacks interface ═══
export interface SSEEventHandlers {
  setThinkingStatus: (v: string | null) => void;
  setCurrentStep: (v: number | undefined) => void;
  setTotalSteps: (v: number | undefined) => void;
  setAccumulatedThoughts: React.Dispatch<React.SetStateAction<ThinkingStep[]>>;
  setToolCalls: React.Dispatch<React.SetStateAction<ToolCallState[]>>;
  setCompletedToolSteps: React.Dispatch<React.SetStateAction<CompletedToolStep[]>>;
  setStreamingContent: (v: string) => void;
  setStreamingIsError: (v: boolean) => void;
  setRateLimitedUntil: (v: number | null) => void;
  setToolExecutionCount: React.Dispatch<React.SetStateAction<number>>;
  setLastTokenUsage: (v: { input: number; output: number } | null) => void;
  setTotalTokens: React.Dispatch<React.SetStateAction<{ input: number; output: number }>>;
  setLastLatencyMs: (v: number | null) => void;
  setIsResearching: (v: boolean) => void;
  setSubTasks: React.Dispatch<React.SetStateAction<SubTask[]>>;
  receivedToolCallsRef: React.MutableRefObject<boolean>;
  thoughtCounterRef: React.MutableRefObject<number>;
  // Content accumulation (mutated by caller)
  contentRef: { current: string };
  pendingContentRef: { current: string };
  // Drip animation
  startThrottle: () => void;
  resetDripVisualLength?: () => void;
  // Drip state (for boundary-aware pacing — sentence/block micropauses)
  dripState?: VisualDripState;
  // Continuation callback
  onContinuation?: (data: { context_snapshot: string; relay_round: number }) => void;
  // Relay handover (Phase 2 continuity): early signal so UI never goes blank during relay gap
  onRelayHandover?: (data: { relay_round: number; next_round: number; max_rounds: number; reason?: string; step?: number }) => void;
  // Track streaming error for outer scope
  onStreamError?: () => void;
  // Tool progress timeline callback
  onToolProgress?: (step: { tool: string; emoji: string; label: string; stepId?: string }) => void;
  // Task plan callback for decomposition display
  onTaskPlan?: (steps: { id?: string; tool: string; label: string; emoji: string; status?: string; context?: string }[]) => void;
  // Context update callback — patches running step with search query / URL detail
  onToolContextUpdate?: (toolName: string, context: string) => void;
  // Autonomous task started callback
  onAutonomousStarted?: (taskId: string) => void;
  // Pipeline narration callback
  onPipelineNarration?: (msg: { id: string; text: string; timestamp: number }) => void;
  // Reasoning effort info callback (Deep Think)
  onReasoningInfo?: (info: { effort: string; model: string; complexityTier: string }) => void;
  // Anthropic native extended thinking block event (phase: start | delta | stop)
  onThinkingBlockEvent?: (event: { phase: string; index: number; step?: number; text?: string; chars?: number }) => void;
  // Self-critique transparency: started → revising? → done
  onCritiqueEvent?: (event: { phase: "started" | "revising" | "done"; issues?: string[]; verdict?: string; changed?: boolean }) => void;
  // Resumable SSE: mission_id and event_id tracking
  onMissionId?: (missionId: string) => void;
  onEventId?: (eventId: number) => void;
  // Prefix for thought IDs ('' for main, 'relay_' for relay)
  idPrefix?: string;
}

// Return type: 'continue' = keep parsing, 'break' = stop stream
export type SSEAction = 'continue' | 'break';

// ═══ Per-instance batch state (no more module-level globals) ═══
export interface SSEBatchState {
  pendingThoughts: ThinkingStep[];
  batchScheduled: boolean;
  batchGeneration: number;
  toolCallDedupMap: Map<string, number>;
}

export function createSSEBatchState(): SSEBatchState {
  return {
    pendingThoughts: [],
    batchScheduled: false,
    batchGeneration: 0,
    toolCallDedupMap: new Map(),
  };
}

/** Reset batch state between sessions to prevent cross-session leaks */
export function resetPendingThoughts(batchState: SSEBatchState) {
  batchState.pendingThoughts = [];
  batchState.batchScheduled = false;
  batchState.batchGeneration++;
  batchState.toolCallDedupMap.clear();
}

function addThought(
  handlers: SSEEventHandlers,
  thought: ThinkingStep,
  batchState: SSEBatchState
) {
  batchState.pendingThoughts.push(thought);
  if (!batchState.batchScheduled) {
    batchState.batchScheduled = true;
    const gen = batchState.batchGeneration;
    queueMicrotask(() => {
      if (gen !== batchState.batchGeneration) {
        return;
      }
      const batch = batchState.pendingThoughts;
      batchState.pendingThoughts = [];
      batchState.batchScheduled = false;
      if (batch.length === 0) return;
      handlers.setAccumulatedThoughts(prev => {
        const next = [...prev, ...batch];
        return next.length > MAX_THOUGHTS ? next.slice(-MAX_THOUGHTS) : next;
      });
    });
  }
}

// ═══ AGENT_STEP sub-status map ═══
const GUARD_STATUS_MAP: Record<string, { title: string; toolName: string; emoji: string; defaultDetail: string }> = {
  deep_research_guard: { title: "Deep Research Required", toolName: "deep_research_guard", emoji: "🔍", defaultDetail: "Deep query requires tool-based research" },
  anti_ghost_retry: { title: "Anti-Ghost: Executing promised action", toolName: "anti_ghost", emoji: "🔄", defaultDetail: "Ensuring promised search is executed" },
  hallucination_guard: { title: "Fact Verification Required", toolName: "hallucination_guard", emoji: "🔍", defaultDetail: "Verifying factual claims with tools" },
  quality_requeue: { title: "Quality Gate: Re-processing", toolName: "quality_gate", emoji: "🧠", defaultDetail: "Response quality below threshold" },
  persistence_retry: { title: "Persistence: Alternative Search", toolName: "persistence", emoji: "🔄", defaultDetail: "Retrying with different approach" },
  source_exhaustion: { title: "Source Exhaustion: Deep Scraping", toolName: "source_exhaustion", emoji: "📄", defaultDetail: "Snippet-only results - escalating to full article scrape" },
};

const GUARD_THINKING_STATUS: Record<string, string> = {
  deep_research_guard: "Initiating mandatory research... 🔍",
  anti_ghost_retry: "Following through on promise... 🔄",
  hallucination_guard: "Verifying facts with live data... 🔍",
  quality_requeue: "Quality audit: Enhancing response... 🧠",
  persistence_retry: "Trying alternative search strategies... 🔄",
  source_exhaustion: "Escalating to full article analysis... 📄",
};

/**
 * Unified SSE event handler. Returns 'break' to stop parsing, 'continue' to keep going.
 * Updates lastContentEventTime via the returned value (caller should track).
 */
export function handleSSEEvent(
  parsed: Record<string, unknown>,
  handlers: SSEEventHandlers,
  lastContentEventTime: { current: number },
  silenceState: { attempted: boolean; limitMs: number; assistantContentLength: number },
  batchState: SSEBatchState,
): SSEAction {
  // Envelope guard — if backend ever sends a non-object frame, fail fast
  // instead of crashing on the next `.foo` access.
  if (!safeParseSSEEvent(parsed)) {
    console.warn("[SSE] Discarding malformed event:", typeof parsed);
    return 'continue';
  }
  const prefix = handlers.idPrefix || '';
  const type = parsed.type as string | undefined;

  // ═══ RESEARCHING ═══
  if (type === "researching") {
    handlers.setIsResearching(!!parsed.status);
    return 'continue';
  }

  // ═══ SUBTASK ═══
  if (type === "subtask") {
    const subTask = parsed.subtask as SubTask;
    if (subTask && subTask.id) {
      handlers.setSubTasks(prev => {
        const index = prev.findIndex(t => t.id === subTask.id);
        if (index >= 0) {
          const next = [...prev];
          next[index] = { ...next[index], ...subTask };
          return next;
        }
        return [...prev, subTask];
      });
    }
    return 'continue';
  }

  // ═══ HEARTBEAT ═══
  if (type === "heartbeat") {
    if (Date.now() - lastContentEventTime.current > silenceState.limitMs) {
      // ═══ FIX #4: Always grant one grace cycle (even with no content yet) for slow research/plan chains ═══
      if (!silenceState.attempted) {
        silenceState.attempted = true;
        lastContentEventTime.current = Date.now();
        return 'continue';
      }
      // Second strike: only break if we already have content OR truly nothing more to wait for
      return 'break';
    }
    return 'continue';
  }

  // ═══ DISTRIBUTED TRACE ID ═══
  if (type === "trace_id") {
    console.log(`[Trace] Server traceId=${parsed.trace_id} missionId=${parsed.mission_id}`);
    return 'continue';
  }

  // ═══ RESUMABLE SSE: mission_id + event_id tracking ═══
  if (type === "mission_id") {
    if (parsed.mission_id) handlers.onMissionId?.(parsed.mission_id as string);
    return 'continue';
  }
  if (typeof (parsed as any).event_id === 'number') {
    handlers.onEventId?.((parsed as any).event_id as number);
  }

  // ═══ ANTHROPIC NATIVE EXTENDED THINKING ═══
  if (type === "thinking_block") {
    handlers.onThinkingBlockEvent?.({
      phase: parsed.phase as string,
      index: parsed.index as number ?? 0,
      step: parsed.step as number | undefined,
      text: parsed.text as string | undefined,
      chars: parsed.chars as number | undefined,
    });
    return 'continue';
  }

  // ═══ SELF-CRITIQUE TRANSPARENCY ═══
  if (type === "critique_started") {
    lastContentEventTime.current = Date.now();
    handlers.onCritiqueEvent?.({ phase: "started" });
    return 'continue';
  }
  if (type === "critique_revising") {
    lastContentEventTime.current = Date.now();
    handlers.onCritiqueEvent?.({
      phase: "revising",
      issues: parsed.issues as string[] | undefined,
      verdict: parsed.verdict as string | undefined,
    });
    return 'continue';
  }
  if (type === "critique_done") {
    lastContentEventTime.current = Date.now();
    handlers.onCritiqueEvent?.({ phase: "done", changed: !!parsed.changed });
    return 'continue';
  }

  if (type === "resume_replay_complete") {
    console.log(`[ResumableSSE] Replay complete — replayed ${parsed.replayed} events`);
    return 'continue';
  }

  // ═══ ERROR ═══
  if (type === "error") {
    handlers.setStreamingIsError(true);
    handlers.onStreamError?.();
    const msg = parsed.message as string || "";
    if (msg.includes("rate limit")) {
      const cooldownSeconds = (parsed.cooldown_seconds as number) || 60;
      handlers.setRateLimitedUntil(Date.now() + cooldownSeconds * 1000);
      const source = parsed.source === "personal_key" ? "Personal Gemini Key" : "Gateway";
      const modelName = (parsed.model as string) || "";
      const isProModel = modelName.toLowerCase().includes('pro') && !modelName.toLowerCase().includes('flash');
      
      if (isProModel && parsed.source === "personal_key") {
        handlers.setStreamingContent(
          `⚠️ Google API rate limit (RPM) ပြည့်သွားပါပြီ။\n` +
          `**${modelName}** (RPM=2) — တစ်မိနစ်လျှင် ၂ ကြိမ်သာ သုံးနိုင်ပါတယ်။\n\n` +
          `ခဏစောင့်ပြီး ပြန်စမ်းပါ သို့မဟုတ် Flash model သို့ ပြောင်းပါ။\n\n` +
          `_Pro models have very low RPM (2/min). Wait ${cooldownSeconds}s or switch to a Flash model._`
        );
      } else {
        handlers.setStreamingContent(`⚠️ AI rate limit ပြည့်သွားပါပြီ။\nကျေးဇူးပြု၍ ${cooldownSeconds} စက္ကန့် စောင့်ပါ။\n\n_${source} rate limit. Please wait ${cooldownSeconds} seconds._`);
      }
      return 'break';
    }
    const errorMessages: Record<string, { en: string; my: string }> = {
      "Insufficient credits": { en: "Insufficient credits. Please purchase more credits.", my: "Credit မလုံလောက်ပါ။ ကျေးဇူးပြု၍ credits ထပ်ဝယ်ပါ။" },
    };
    const errorInfo = errorMessages[msg] || { en: msg, my: msg };
    handlers.setStreamingContent(`⚠️ ${errorInfo.my}\n\n_${errorInfo.en}_`);
    return 'break';
  }

  // ═══ THINKING_STATUS ═══
  if (type === "thinking_status") {
    lastContentEventTime.current = Date.now();
    const stepText = parsed.step as string;
    handlers.setThinkingStatus(stepText);
    if (parsed.currentStep !== undefined) handlers.setCurrentStep(parsed.currentStep as number);
    if (parsed.totalSteps !== undefined) handlers.setTotalSteps(parsed.totalSteps as number);
    // v12.0: Surface context compaction events in ThinkingAccordion
    if (stepText && (stepText.includes("Compacting context") || stepText.includes("Context optimized") || stepText.includes("context compaction"))) {
      addThought(handlers, {
        id: `context_compaction_${prefix}${Date.now()}`,
        title: stepText.includes("optimized") ? "Context Optimized ✓" : "Compacting Context...",
        tool_name: "context_compaction",
        status: stepText.includes("optimized") ? "done" : "loading",
        detail: stepText,
        timestamp: new Date().toISOString(),
      }, batchState);
    }
    return 'continue';
  }

  // ═══ REASONING_INFO — Deep Think badge ═══
  if (type === "reasoning_info") {
    lastContentEventTime.current = Date.now();
    handlers.onReasoningInfo?.({
      effort: parsed.effort as string,
      model: parsed.model as string,
      complexityTier: parsed.complexityTier as string,
    });
    return 'continue';
  }

  // ═══ THINKING_PULSE ═══
  if (type === "thinking_pulse") {
    lastContentEventTime.current = Date.now();
    handlers.setThinkingStatus((parsed.message as string) || `Still working... (${parsed.elapsed_s || '?'}s elapsed)`);
    return 'continue';
  }

  // ═══ AGENT_STEP ═══
  if (type === "agent_step") {
    lastContentEventTime.current = Date.now();
    if (parsed.current !== undefined) handlers.setCurrentStep(parsed.current as number);
    if (parsed.max !== undefined) handlers.setTotalSteps(parsed.max as number);
    const status = parsed.status as string;

    if (status === "reflecting") {
      handlers.setThinkingStatus("Verifying accuracy... 🔍");
      addThought(handlers, {
        id: `reflection_${prefix}${Date.now()}`,
        title: "Self-Correction Check",
        tool_name: "reflection",
        status: "loading",
        detail: (parsed.reason as string) || "Reviewing answer for accuracy",
        timestamp: new Date().toISOString(),
      }, batchState);
    } else if (status === "reflection_complete") {
      handlers.setAccumulatedThoughts(prev =>
        prev.map(t =>
          t.tool_name === "reflection" && t.status === "loading"
            ? { ...t, status: "done", detail: "Answer verified ✓" }
            : t
        )
      );
      handlers.setThinkingStatus("Answer verified ✓");
    } else if (status === "retrying") {
      handlers.setThinkingStatus(`Retrying: ${(parsed.reason as string) || "Trying different approach"}...`);
    } else if (status === "processing") {
      handlers.setThinkingStatus(`Step ${parsed.current}/${parsed.max}: Processing...`);
    } else if (status === "budget_exceeded") {
      handlers.setThinkingStatus("Preparing final answer (time limit)...");
    } else if (GUARD_STATUS_MAP[status]) {
      const guard = GUARD_STATUS_MAP[status];
      handlers.setThinkingStatus(GUARD_THINKING_STATUS[status]);
      addThought(handlers, {
        id: `guard_${status}_${prefix}${Date.now()}`,
        title: guard.title,
        tool_name: guard.toolName,
        status: "loading",
        detail: (parsed.reason as string) || guard.defaultDetail,
        timestamp: new Date().toISOString(),
      }, batchState);
    } else if (parsed.message || parsed.reason) {
      const msg = (parsed.message || parsed.reason) as string;
      handlers.setThinkingStatus(msg);
      if (msg.includes("Worker Bee") || msg.includes("Sub-Agent")) {
        const isDone = msg.includes("finalizing") || msg.includes("finished");
        if (isDone) {
          addThought(handlers, {
            id: `sub_agent_${prefix}${Date.now()}`,
            title: msg,
            tool_name: "spawn_sub_agent",
            status: "done",
            detail: msg,
            timestamp: new Date().toISOString(),
          }, batchState);
        }
      }
    }
    return 'continue';
  }

  // ═══ STEP_COMPLETE ═══
  if (type === "step_complete") {
    lastContentEventTime.current = Date.now();
    handlers.setToolCalls(prev => finalizeToolCalls(prev, handlers.setCompletedToolSteps, prefix));
    return 'continue';
  }

  // ═══ CLEAR_STREAMING ═══
  if (type === "clear_streaming") {
    handlers.setToolCalls(prev => finalizeToolCalls(prev, handlers.setCompletedToolSteps, prefix));
    // ═══ FIX #2: Guard against wiping substantial content (mirrors content_replace guard) ═══
    if (handlers.contentRef.current.length > 200) {
      console.warn(`[SSE] clear_streaming ignored — would wipe ${handlers.contentRef.current.length} chars`);
      return 'continue';
    }
    // Append separator if there's existing content
    handlers.contentRef.current = handlers.contentRef.current.trim().length > 0
      ? handlers.contentRef.current + "\n\n"
      : handlers.contentRef.current;
    return 'continue';
  }

  // ═══ TOOL_CALL (v16.7: dedup by call_id or name|context, not just name) ═══
  if (type === "tool_call") {
    lastContentEventTime.current = Date.now();
    const name = parsed.name as string;
    const context = parsed.context as string | undefined;
    const callId = parsed.call_id as string | undefined;
    const now = Date.now();
    
    // v16.7: Dedup key uses call_id (unique per call) or name|context combo
    // This prevents dropping rapid same-tool calls with different queries
    const dedupKey = callId || `${name}|${context || ''}`;
    const lastEmitTime = batchState.toolCallDedupMap.get(dedupKey);
    if (lastEmitTime && (now - lastEmitTime) < 200) {
      return 'continue'; // True duplicate — skip
    }
    batchState.toolCallDedupMap.set(dedupKey, now);

    // Size cap — prevent unbounded growth
    if (batchState.toolCallDedupMap.size > 100) {
      for (const [key, ts] of batchState.toolCallDedupMap) {
        if (now - ts > 10000) batchState.toolCallDedupMap.delete(key);
      }
    }
    
    // v16.6.0: Show tool context in thinking status
    handlers.setThinkingStatus(context || `Executing ${name}...`);
    handlers.setToolCalls(prev => [...prev, { name, callId, status: "running", context }]);
    handlers.receivedToolCallsRef.current = true;
    handlers.thoughtCounterRef.current += 1;
    const nowISO = new Date().toISOString();
    addThought(handlers, {
      id: callId || `thought_${prefix}${Date.now()}_${handlers.thoughtCounterRef.current}_${name}`,
      title: TOOL_LABELS[name] || name,
      tool_name: name,
      status: "loading",
      detail: context || undefined,
      timestamp: nowISO,
      startedAt: nowISO,
    }, batchState);
    return 'continue';
  }

  // ═══ TOOL_RESULT (v16.7: match by call_id for precision) ═══
  if (type === "tool_result") {
    lastContentEventTime.current = Date.now();
    const name = parsed.name as string;
    const callId = parsed.call_id as string | undefined;
    const toolLabel = TOOL_LABELS[name] || name;
    handlers.setThinkingStatus(
      parsed.error
        ? `⚠️ ${toolLabel} failed — recovering...`
        : "Processing results..."
    );
    handlers.setToolExecutionCount(prev => prev + 1);
    
    // v16.7: Match toolCalls by callId first, fallback to first-matching name
    handlers.setToolCalls(prev => {
      let found = false;
      return prev.map(t => {
        if (found) return t;
        const isMatch = callId
          ? (t.callId === callId)
          : (t.name === name && t.status === "running");
        if (isMatch) {
          found = true;
          return { ...t, status: parsed.error ? "error" : "success", result: (parsed.result || parsed.error) as Record<string, unknown> };
        }
        return t;
      });
    });
    
    const safeSummary = formatToolSummary(name, parsed.result);
    
    // v16.7: Match thoughts by callId (set as thought id) or fallback to first loading match
    const matchThought = (t: ThinkingStep): boolean => {
      if (callId && t.id === callId) return true;
      return t.tool_name === name && t.status === "loading";
    };
    
    // Flush any pending batched thoughts BEFORE searching for the matching "loading" entry.
    if (batchState.pendingThoughts.length > 0) {
      const batch = batchState.pendingThoughts;
      batchState.pendingThoughts = [];
      batchState.batchScheduled = false;
      handlers.setAccumulatedThoughts(prev => {
        const withBatch = [...prev, ...batch];
        const capped = withBatch.length > MAX_THOUGHTS ? withBatch.slice(-MAX_THOUGHTS) : withBatch;
        let found = false;
        return capped.map(t => {
          if (!found && matchThought(t)) {
            found = true;
            return { ...t, status: (parsed.error ? "error" : "done") as "error" | "done", detail: safeSummary.length > 500 ? safeSummary.slice(0, 497) + "..." : safeSummary, timestamp: new Date().toISOString() };
          }
          return t;
        });
      });
      return 'continue';
    }
    // Normal path: no pending batch, update directly
    handlers.setAccumulatedThoughts(prev => {
      let found = false;
      return prev.map(t => {
        if (!found && matchThought(t)) {
          found = true;
          return {
            ...t,
            status: (parsed.error ? "error" : "done") as "error" | "done",
            detail: safeSummary.length > 500 ? safeSummary.slice(0, 497) + "..." : safeSummary,
            timestamp: new Date().toISOString(),
          };
        }
        return t;
      });
    });
    return 'continue';
  }

  // ═══ USAGE ═══
  if (type === "usage" || parsed.usage) {
    const usage = (parsed.usage || parsed) as Record<string, unknown>;
    if (usage.prompt_tokens || usage.tokens_input) {
      const inputTokens = (usage.prompt_tokens || usage.tokens_input || 0) as number;
      const outputTokens = (usage.completion_tokens || usage.tokens_output || 0) as number;
      handlers.setLastTokenUsage({ input: inputTokens, output: outputTokens });
      handlers.setTotalTokens(prev => ({
        input: prev.input + inputTokens,
        output: prev.output + outputTokens,
      }));
    }
    if (usage.request_duration_ms || parsed.request_duration_ms) {
      handlers.setLastLatencyMs((usage.request_duration_ms || parsed.request_duration_ms) as number);
    }
    return 'continue';
  }

  // ═══ TOOL_CALL_CONTEXT (v16.6.1: post-parse context update) ═══
  if (type === "tool_call_context") {
    lastContentEventTime.current = Date.now();
    const name = parsed.name as string;
    const context = parsed.context as string;
    const callId = parsed.call_id as string | undefined;
    if (context) {
      handlers.setThinkingStatus(context);
      // v16.7: Match by callId first, fallback to first name match without context
      handlers.setToolCalls(prev => {
        let found = false;
        return prev.map(t => {
          if (found) return t;
          const isMatch = callId
            ? (t.callId === callId)
            : (t.name === name && !t.context);
          if (isMatch) {
            found = true;
            return { ...t, context };
          }
          return t;
        });
      });
      handlers.setAccumulatedThoughts(prev => {
        let found = false;
        return prev.map(t => {
          if (!found && ((callId && t.id === callId) || (t.tool_name === name && t.status === "loading" && !t.detail))) {
            found = true;
            return { ...t, detail: context };
          }
          return t;
        });
      });
      // Forward context to task plan steps
      handlers.onToolContextUpdate?.(name, context);
    }
    return 'continue';
  }

  // ═══ COORDINATOR_INFO_MESSAGE — Step 3 of 9-step agent flow ═══
  // Visible acknowledgment from Coordinator before execution starts.
  // Routes to pipeline narration so it appears above the main response.
  if (type === "coordinator_info_message") {
    lastContentEventTime.current = Date.now();
    const msg = parsed.message as string;
    const stepCount = parsed.stepCount as number;
    if (msg) {
      handlers.onPipelineNarration?.({ id: `coord_ack_${Date.now()}`, text: msg, timestamp: Date.now() });
      handlers.setThinkingStatus(`🐝 ${stepCount ? `${stepCount} ဆင့် —` : ''} လုပ်ဆောင်နေသည်...`);
    }
    return 'continue';
  }

  // ═══ AUTONOMOUS_ACK — immediate pre-pipeline acknowledgment ═══
  if (type === "autonomous_ack") {
    lastContentEventTime.current = Date.now();
    const msg = parsed.message as string;
    if (msg) {
      handlers.setThinkingStatus(msg);
    }
    return 'continue';
  }

  // ═══ CONTENT_PREVIEW — status indicator only, NOT chat bubble ═══
  if (type === "content_preview") {
    lastContentEventTime.current = Date.now();
    const preview = parsed.preview as string;
    if (preview) {
      handlers.setThinkingStatus(preview);
    }
    return 'continue';
  }

  // ═══ TOOL_PROGRESS — dedicated event for execution timeline (not mixed into content) ═══
  if (type === "tool_progress") {
    lastContentEventTime.current = Date.now();
    handlers.onToolProgress?.({
      tool: parsed.tool as string,
      emoji: parsed.emoji as string,
      label: parsed.label as string,
      stepId: parsed.stepId as string | undefined,
    });
    return 'continue';
  }

  // ═══ TASK_PLAN — decomposition display for multi-tool queries ═══
  if (type === "task_plan") {
    lastContentEventTime.current = Date.now();
    const steps = (parsed.steps as any[]).map(s => ({
      ...s,
      status: (s.status as "pending" | "running" | "done" | "error") || undefined,
    }));
    if (Array.isArray(steps) && steps.length > 0) {
      handlers.onTaskPlan?.(steps);
    }
    return 'continue';
  }

  // ═══ PIPELINE_NARRATION — conversational agent commentary ═══
  if (type === "pipeline_narration") {
    lastContentEventTime.current = Date.now();
    const text = parsed.text as string;
    const id = (parsed.id as string) || `narr_${Date.now()}`;
    if (text) {
      handlers.onPipelineNarration?.({ id, text, timestamp: Date.now() });
    }
    return 'continue';
  }

  // ═══ CONTENT_REPLACE — reset refs only if content is placeholder/phase text ═══
  // Guard: If we already have substantial LLM output (>200 chars), skip the reset
  // to prevent wiping real research data during phase transitions.
  if (type === "content_replace") {
    lastContentEventTime.current = Date.now();
    const currentLen = handlers.contentRef.current.length;
    if (currentLen > 200) {
      // Substantial content exists — do NOT reset, protect real LLM output
      return 'continue';
    }
    handlers.contentRef.current = "";
    handlers.pendingContentRef.current = "";
    handlers.resetDripVisualLength?.();
    // DON'T clear streamingContent — let next content event overwrite smoothly
    return 'continue';
  }

  // ═══ AUTONOMOUS_STARTED ═══
  if (type === "autonomous_started") {
    lastContentEventTime.current = Date.now();
    const taskId = parsed.taskId as string;
    const estimatedMinutes = (parsed.estimatedMinutes as number) || 2;
    handlers.setThinkingStatus(`🐝 Autonomous Mode: ~${estimatedMinutes} min`);
    // Signal to parent to start Realtime subscription for this task
    handlers.onAutonomousStarted?.(taskId);
    console.log(`[SSE] Autonomous task started: ${taskId}, forwarding to hook`);
    return 'continue';
  }

  // ═══ MODEL_FALLBACK — transparent model switch notification ═══
  if (type === "model_fallback") {
    lastContentEventTime.current = Date.now();
    const fromModel = parsed.from_model as string || '';
    const toModel = parsed.to_model as string || '';
    const reason = parsed.reason as string || 'rate_limited';
    const reasonLabel = reason === 'rate_limited' ? 'rate limit' : reason === 'model_overloaded' ? 'overloaded' : reason;
    handlers.setThinkingStatus(`⚡ "${fromModel}" hit ${reasonLabel} — auto-switching to "${toModel}"...`);
    console.info(`[SSE] Model fallback: ${fromModel} → ${toModel} (${reason})`);
    return 'continue';
  }

  // ═══ PROVIDER_ERROR — structured error notification from backend ═══
  if (type === "provider_error") {
    lastContentEventTime.current = Date.now();
    const errorType = parsed.error_type as string || 'unknown';
    const providerLabel = parsed.provider as string || 'AI Provider';
    const fallback = parsed.fallback as string | null;
    const message = parsed.message as string || `Provider error: ${errorType}`;
    
    if (fallback) {
      // Provider failover (same model, different key) — transient status
      handlers.setThinkingStatus(`⚠️ ${providerLabel}: ${errorType} — switching to ${fallback}...`);
    } else {
      // No fallback — this is a terminal error, clear thinking and let the error message show
      handlers.setThinkingStatus(null);
    }
    console.warn(`[SSE] Provider error: ${errorType} on ${providerLabel}, fallback: ${fallback || 'none'}`);
    return 'continue';
  }

  // ═══ CONTINUATION ═══
  if (type === "continuation") {
    handlers.onContinuation?.({
      context_snapshot: parsed.context_snapshot as string,
      relay_round: (parsed.relay_round as number) || 1,
    });
    return 'continue';
  }

  // ═══ RELAY HANDOVER (Phase 2 continuity) ═══
  // Emitted right before `continuation` so the UI can show
  // "🔄 Continuing analysis (round N/M)..." instantly while we re-POST.
  if (type === "relay_handover") {
    const round = (parsed.relay_round as number) || 1;
    const next = (parsed.next_round as number) || round + 1;
    const max = (parsed.max_rounds as number) || 5;
    handlers.onRelayHandover?.({
      relay_round: round,
      next_round: next,
      max_rounds: max,
      reason: parsed.reason as string | undefined,
      step: parsed.step as number | undefined,
    });
    handlers.setThinkingStatus(`🔄 Continuing analysis... (round ${next}/${max})`);
    lastContentEventTime.current = Date.now();
    return 'continue';
  }

  // ═══ QUEUE_INTERRUPT ═══
  if (type === "queue_interrupt") {
    lastContentEventTime.current = Date.now();
    handlers.setThinkingStatus(`Priority message received: ${((parsed.content as string) || "Interrupt").slice(0, 50)}...`);
    return 'continue';
  }

  // ═══ ANTHROPIC: message_start ═══
  // Signals the start of a new assistant message in a relay round.
  // Use input_tokens for token tracking if provided.
  if (type === "message_start") {
    lastContentEventTime.current = Date.now();
    const msg = parsed.message as Record<string, unknown> | undefined;
    const inputTokens = (msg?.usage as Record<string, unknown>)?.input_tokens as number | undefined;
    if (inputTokens !== undefined) {
      handlers.setTotalTokens(prev => ({ input: prev.input + inputTokens, output: prev.output }));
    }
    return 'continue';
  }

  // ═══ ANTHROPIC: content_block_start ═══
  // Marks the beginning of a text or tool_use block.
  // Track block type — tool_use blocks emit input_json_delta, text blocks emit text_delta.
  if (type === "content_block_start") {
    lastContentEventTime.current = Date.now();
    // We don't need extra state tracking here beyond what tool_call events provide.
    return 'continue';
  }

  // ═══ ANTHROPIC: content_block_delta ═══
  // Carries streamed text (text_delta) or tool input JSON (input_json_delta).
  if (type === "content_block_delta") {
    lastContentEventTime.current = Date.now();
    const delta = parsed.delta as Record<string, unknown> | undefined;
    if (!delta) return 'continue';

    // text_delta — same as existing "content" event
    if (delta.type === "text_delta" && typeof delta.text === "string") {
      const safe = stripThinkingFromDelta(ensureStripState(handlers), delta.text);
      if (safe) {
        handlers.contentRef.current += safe;
        handlers.pendingContentRef.current = handlers.contentRef.current;
        recordBoundary(handlers, safe);
        // Always route through drip — first call renders synchronously (zero latency),
        // subsequent calls flow through smooth rAF pacing (no handoff jump).
        handlers.startThrottle();
      }
    }
    // input_json_delta — tool input streaming; no user-visible update needed
    return 'continue';
  }

  // ═══ ANTHROPIC: content_block_stop ═══
  // Marks end of a content block (text or tool_use).
  if (type === "content_block_stop") {
    lastContentEventTime.current = Date.now();
    return 'continue';
  }

  // ═══ ANTHROPIC: message_delta ═══
  // Contains stop_reason and output token count for the completed message.
  if (type === "message_delta") {
    lastContentEventTime.current = Date.now();
    const delta = parsed.delta as Record<string, unknown> | undefined;
    const usage = parsed.usage as Record<string, unknown> | undefined;

    if (usage?.output_tokens !== undefined) {
      const outputTokens = usage.output_tokens as number;
      handlers.setLastTokenUsage({
        input: 0,
        output: outputTokens,
      });
      handlers.setTotalTokens(prev => ({ input: prev.input, output: prev.output + outputTokens }));
    }

    // max_tokens stop reason → the backend will emit a continuation event separately,
    // so we just update thinking status here.
    if (delta?.stop_reason === "max_tokens") {
      handlers.setThinkingStatus("Continuing generation...");
    }
    return 'continue';
  }

  // ═══ CONTENT ═══
  if (type === "content" && parsed.content) {
    lastContentEventTime.current = Date.now();
    const incoming = parsed.content as string;
    const added = stripThinkingFromDelta(ensureStripState(handlers), incoming);
    if (added) {
      handlers.contentRef.current += added;
      handlers.pendingContentRef.current = handlers.contentRef.current;
      recordBoundary(handlers, added);
      // Unified path: drip controller renders the first frame synchronously,
      // then paces subsequent updates via rAF — smooth, no jump at the 100-char mark.
      handlers.startThrottle();
    }
    return 'continue';
  }

  // ═══ DONE ═══
  if (type === "done") {
    return 'break';
  }

  // ═══ THINKING ═══
  if (type === "thinking" && parsed.status) {
    lastContentEventTime.current = Date.now();
    const ts = parsed.status as Record<string, unknown>;
    handlers.setThinkingStatus((ts.title as string) || "Processing...");
    addThought(handlers, {
      id: (ts.id as string) || `thinking_${prefix}${Date.now()}`,
      title: (ts.title as string) || "Processing",
      tool_name: "thinking",
      status: ts.status === "done" ? "done" : "loading",
      detail: (ts.detail as string) || "",
      timestamp: (ts.timestamp as string) || new Date().toISOString(),
    }, batchState);
    return 'continue';
  }

  // ═══ CHOICES DELTA (OpenAI-style content) ═══
  const deltaContent = (parsed as any).choices?.[0]?.delta?.content;
  if (deltaContent) {
    lastContentEventTime.current = Date.now();
    const safe = stripThinkingFromDelta(ensureStripState(handlers), deltaContent as string);
    if (safe) {
      handlers.contentRef.current += safe;
      handlers.pendingContentRef.current = handlers.contentRef.current;
      recordBoundary(handlers, safe);
      handlers.startThrottle();
    }
    return 'continue';
  }

  return 'continue';
}

// ═══ Visual Drip Animation Utilities ═══

export interface VisualDripState {
  pendingContentRef: { current: string };
  visualLength: number;
  rafId: number | null;
  pollTimerId: ReturnType<typeof setTimeout> | null;
  dripActive: boolean;
  cachedSegmenter: unknown | null;
  boundaryCache: number[];
  cachedTextLen: number;
  startTime: number;
  // ═══ Boundary semantics (richer event metadata) ═══
  lastSentenceEnd: number;        // absolute char offset of last sentence terminator
  lastBlockEnd: number;           // absolute char offset of last block boundary
  lastBoundaryKind: BoundaryKind; // most-recent classification
  pendingMicropauseUntil: number; // ms timestamp; 0 = no pause
}

export function createVisualDripState(): VisualDripState {
  return {
    pendingContentRef: { current: "" },
    visualLength: 0,
    rafId: null,
    pollTimerId: null,
    dripActive: false,
    cachedSegmenter: (typeof Intl !== 'undefined' && 'Segmenter' in Intl)
      ? new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' })
      : null,
    boundaryCache: [0],
    cachedTextLen: 0,
    startTime: Date.now(),
    lastSentenceEnd: 0,
    lastBlockEnd: 0,
    lastBoundaryKind: 'token',
    pendingMicropauseUntil: 0,
  };
}

export function extendBoundaries(state: VisualDripState, text: string) {
  if (text.length <= state.cachedTextLen) return;
  if (state.cachedSegmenter) {
    const lastBoundary = state.boundaryCache[state.boundaryCache.length - 1];
    const tail = text.slice(lastBoundary);
    let offset = lastBoundary;
    for (const { segment } of (state.cachedSegmenter as any).segment(tail)) {
      offset += segment.length;
      if (offset > lastBoundary) state.boundaryCache.push(offset);
    }
    // Periodic trim: remove boundaries below visualLength to prevent unbounded growth
    if (state.boundaryCache.length > 2000) {
      const trimBelow = state.visualLength;
      let trimIdx = 0;
      while (trimIdx < state.boundaryCache.length - 1 && state.boundaryCache[trimIdx + 1] <= trimBelow) {
        trimIdx++;
      }
      if (trimIdx > 0) {
        state.boundaryCache = state.boundaryCache.slice(trimIdx);
      }
    }
  }
  state.cachedTextLen = text.length;
}

export function safeGraphemeBoundary(state: VisualDripState, text: string, pos: number): number {
  if (pos >= text.length) return text.length;
  if (state.cachedSegmenter) {
    extendBoundaries(state, text);
    // O(log n) binary search for the last boundary <= pos
    const cache = state.boundaryCache;
    let lo = 0, hi = cache.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cache[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1 < cache.length ? cache[lo + 1] : text.length;
  }
  while (pos < text.length) {
    const c = text.charCodeAt(pos);
    if ((c >= 0x102B && c <= 0x103E) || (c >= 0x1056 && c <= 0x1059)) {
      pos++;
    } else { break; }
  }
  return pos;
}

// ═══ COALESCING CONFIG (rAF-aligned, velocity-aware) ═══
// Only hold tiny fragments when the stream is *idle*; never delay live bursts.
const COALESCE_MIN_CHARS = 3;    // Below this AND idle → wait briefly
const COALESCE_MAX_CHARS = 200;  // Force flush if backlog exceeds this
const COALESCE_IDLE_MS = 40;     // Idle hold window (was 60ms)

export function createDripController(
  state: VisualDripState,
  setStreamingContent: (v: string) => void,
) {
  let lastTokenArrival = Date.now();
  let lastBacklog = 0;
  let backlogEma = 0;          // velocity-smoothed backlog
  let lastFrameTime = 0;
  let idleSinceMs = 0;         // when buffer first hit empty in this idle phase
  let visibilityHooked = false;

  // rAF wrapper — falls back to setTimeout when the tab is hidden
  const schedule = (fn: () => void, delayMs?: number) => {
    if (typeof document !== 'undefined' && document.hidden) {
      state.pollTimerId = setTimeout(fn, delayMs ?? 100);
      return;
    }
    if (delayMs && delayMs > 16) {
      state.pollTimerId = setTimeout(() => {
        state.pollTimerId = null;
        state.rafId = requestAnimationFrame(() => { state.rafId = null; fn(); });
      }, delayMs);
      return;
    }
    state.rafId = requestAnimationFrame(() => { state.rafId = null; fn(); });
  };

  const cancelScheduled = () => {
    if (state.rafId != null) { cancelAnimationFrame(state.rafId); state.rafId = null; }
    if (state.pollTimerId != null) { clearTimeout(state.pollTimerId); state.pollTimerId = null; }
  };

  // Visibility handler — fast-forward on tab return so user doesn't watch a slow crawl
  const onVisibilityChange = () => {
    if (!state.dripActive) return;
    if (typeof document !== 'undefined' && !document.hidden) {
      const fullText = state.pendingContentRef.current;
      const behind = fullText.length - state.visualLength;
      if (behind > 800) {
        // Big gap: snap to end in one frame, then resume
        state.visualLength = fullText.length;
        setStreamingContent(fullText);
      }
      cancelScheduled();
      schedule(visualDrip);
    }
  };

  const ensureVisibilityHook = () => {
    if (visibilityHooked || typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', onVisibilityChange);
    visibilityHooked = true;
  };

  const visualDrip = () => {
    state.rafId = null;
    state.pollTimerId = null;

    const now = Date.now();

    // Honour pending boundary micropause (block-end "thought break")
    if (state.pendingMicropauseUntil > 0) {
      const wait = state.pendingMicropauseUntil - now;
      if (wait > 0) { schedule(visualDrip, wait); return; }
      state.pendingMicropauseUntil = 0;
    }

    const fullText = state.pendingContentRef.current;
    const behind = fullText.length - state.visualLength;

    // Track token arrival (backlog grew since last tick)
    if (behind > lastBacklog) lastTokenArrival = now;
    lastBacklog = behind;

    if (behind <= 0) {
      if (!state.dripActive) return;
      // Adaptive idle poll: tighter for first 1.5s of silence, then back off
      if (idleSinceMs === 0) idleSinceMs = now;
      const idleFor = now - idleSinceMs;
      const next = idleFor < 1500 ? 80 : 250;
      schedule(visualDrip, next);
      return;
    }
    idleSinceMs = 0;

    // Smart coalesce: only hold tiny fragments when stream looks *idle*.
    // If tokens are still arriving, render immediately — no artificial pause.
    const timeSinceToken = now - lastTokenArrival;
    if (
      behind < COALESCE_MIN_CHARS &&
      behind < COALESCE_MAX_CHARS &&
      timeSinceToken >= COALESCE_IDLE_MS &&
      timeSinceToken < COALESCE_IDLE_MS + 40
    ) {
      schedule(visualDrip, 16);
      return;
    }

    // Velocity-smoothed pacing — EMA prevents "breathing" speed oscillations
    backlogEma = backlogEma === 0 ? behind : backlogEma * 0.7 + behind * 0.3;

    const conn = (navigator as any).connection;
    const isSlow = conn?.effectiveType === '2g' || conn?.effectiveType === '3g' || conn?.effectiveType === 'slow-2g';
    const minChars = isSlow ? 24 : 8;
    // Claude-style readable cadence cap: ~24 chars/frame at 60fps ≈ 1440 cpm,
    // matches confident-typing speed. On slow networks we still allow bursts
    // to avoid stalls. If the backlog gets *huge* (>800 chars), we let it
    // accelerate to avoid a runaway tail.
    const readableCap = isSlow ? 120 : (behind > 800 ? 48 : 24);
    const maxChars = readableCap;
    const factor = isSlow ? 0.6 : 0.32;
    const charsPerFrame = Math.max(minChars, Math.min(maxChars, Math.ceil(backlogEma * factor)));

    let rawTarget = Math.min(state.visualLength + charsPerFrame, fullText.length);

    // Word-boundary snap (Claude/Kimi-style): avoid mid-word cuts so words
    // appear whole. Skip when inside an open code fence (preserve raw layout).
    if (rawTarget > state.visualLength && rawTarget < fullText.length) {
      const fenceCount = (fullText.slice(0, rawTarget).match(/```/g) || []).length;
      const insideFence = fenceCount % 2 === 1;
      if (!insideFence) {
        const ch = fullText.charAt(rawTarget);
        const isWordChar = /[\w\u0900-\uFFFF]/.test(ch); // includes CJK/Myanmar
        if (isWordChar) {
          const snapWindow = isSlow ? 12 : 8;
          const lookahead = fullText.slice(rawTarget, rawTarget + snapWindow);
          const fwd = lookahead.search(/[\s.,;:!?)\]}\u104A\u104B]/);
          const lookback = fullText.slice(Math.max(0, rawTarget - 4), rawTarget);
          const backRel = lookback.search(/[\s.,;:!?)\]}\u104A\u104B](?=[^\s.,;:!?)\]}\u104A\u104B]*$)/);
          const fwdDist = fwd >= 0 ? fwd + 1 : Infinity;
          const backDist = backRel >= 0 ? lookback.length - backRel - 1 : Infinity;
          if (fwdDist <= backDist && fwdDist !== Infinity) {
            rawTarget = Math.min(fullText.length, rawTarget + fwdDist);
          } else if (backDist !== Infinity && backDist < 4 && (rawTarget - backDist) > state.visualLength) {
            rawTarget = rawTarget - backDist;
          }
        }
      }
    }

    // ═══ Boundary-aware micropause (Claude/Kimi reading rhythm) ═══
    // Cap the frame at the nearest sentence/block boundary so the eye gets a
    // natural beat at meaning breaks. Skip when backlog is large (avoid stalls).
    if (behind <= 600) {
      // Sentence boundary inside this frame's range → cap at boundary
      if (state.lastSentenceEnd > state.visualLength &&
          state.lastSentenceEnd <= rawTarget &&
          state.lastSentenceEnd < fullText.length) {
        rawTarget = state.lastSentenceEnd;
      }
      // Block boundary → cap + schedule a one-frame ~80ms hold ("thought break")
      if (state.lastBlockEnd > state.visualLength &&
          state.lastBlockEnd <= rawTarget &&
          state.lastBlockEnd < fullText.length) {
        rawTarget = state.lastBlockEnd;
        state.pendingMicropauseUntil = now + 80;
      }
    }

    state.visualLength = safeGraphemeBoundary(state, fullText, rawTarget);
    setStreamingContent(fullText.slice(0, state.visualLength));

    lastFrameTime = now;
    schedule(visualDrip);
  };

  const startThrottle = () => {
    if (!state.dripActive) {
      state.dripActive = true;
      ensureVisibilityHook();
      // First frame: render synchronously so first-token latency stays ~0ms,
      // then hand off to rAF for smooth pacing — eliminates handoff jump.
      const fullText = state.pendingContentRef.current;
      if (fullText.length > 0 && state.visualLength === 0) {
        const initial = Math.min(fullText.length, 80);
        state.visualLength = safeGraphemeBoundary(state, fullText, initial);
        setStreamingContent(fullText.slice(0, state.visualLength));
        lastTokenArrival = Date.now();
        lastBacklog = fullText.length - state.visualLength;
      }
    }
    if (state.rafId == null && state.pollTimerId == null) {
      schedule(visualDrip);
    }
  };

  // Smooth final flush — ramp the last bit across a few rAF frames instead of snapping
  const stopThrottle = () => {
    state.dripActive = false;
    cancelScheduled();
    if (visibilityHooked && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      visibilityHooked = false;
    }
    const fullText = state.pendingContentRef.current;
    const remaining = fullText.length - state.visualLength;
    if (remaining <= 0) return;

    // Big remainder → flush immediately to avoid stalling completion
    if (remaining > 400 || (typeof document !== 'undefined' && document.hidden)) {
      state.visualLength = fullText.length;
      setStreamingContent(fullText);
      return;
    }

    // Small tail → ramp across ~3 frames for a buttery finish
    const steps = 3;
    let stepIdx = 0;
    const startLen = state.visualLength;
    const ramp = () => {
      stepIdx++;
      const t = stepIdx / steps;
      const target = stepIdx >= steps
        ? fullText.length
        : Math.min(fullText.length, startLen + Math.ceil(remaining * t));
      state.visualLength = safeGraphemeBoundary(state, fullText, target);
      setStreamingContent(fullText.slice(0, state.visualLength));
      if (stepIdx < steps && state.visualLength < fullText.length) {
        requestAnimationFrame(ramp);
      } else if (state.visualLength < fullText.length) {
        state.visualLength = fullText.length;
        setStreamingContent(fullText);
      }
    };
    requestAnimationFrame(ramp);
  };

  return { startThrottle, stopThrottle, visualDrip };
}

