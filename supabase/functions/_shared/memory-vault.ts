// ═══ MEMORY VAULT MODULE ═══
// Extracted from agent-chat/index.ts — Phase 2A
// Handles: global user context, session warmup, cross-session messages, proactive recall

import { generateEmbedding } from "./executor-helpers.ts";
import type { GlobalUserContext, RecentMemoriesContext } from "./prompt-builder.ts";

// ═══ DYNAMIC MEMORY BUDGET BY COMPLEXITY TIER ═══
// Controls how many memory fragments are injected per turn to prevent context pollution.
// Lower tiers get fewer memories to reduce hallucination risk on simple queries.
export interface MemoryBudget {
  warmupEpisodicLimit: number;     // Max episodic memories in warmup
  warmupEpisodicMinScore: number;  // Minimum importance score for warmup episodic
  warmupSessionSummaries: number;  // Max session summaries in warmup
  warmupDailyLogs: number;         // Max daily logs in warmup
  crossSessionMessages: number;    // Max raw cross-session messages
  proactiveEpisodicCap: number;    // Max episodic memories from proactive recall
  proactiveKeywordLimit: number;   // Max keyword search results
  proactiveKBLimit: number;        // Max knowledge base results
  proactiveTemporalLimit: number;  // Max temporal search results
}

const MEMORY_BUDGETS: Record<string, MemoryBudget> = {
  greeting: {
    warmupEpisodicLimit: 3,
    warmupEpisodicMinScore: 0.7,
    warmupSessionSummaries: 1,
    warmupDailyLogs: 0,
    crossSessionMessages: 0,
    proactiveEpisodicCap: 0,
    proactiveKeywordLimit: 0,
    proactiveKBLimit: 0,
    proactiveTemporalLimit: 0,
  },
  simple: {
    warmupEpisodicLimit: 3,
    warmupEpisodicMinScore: 0.6,
    warmupSessionSummaries: 1,
    warmupDailyLogs: 1,
    crossSessionMessages: 3,
    proactiveEpisodicCap: 0,
    proactiveKeywordLimit: 0,
    proactiveKBLimit: 0,
    proactiveTemporalLimit: 0,
  },
  turbo: {
    warmupEpisodicLimit: 5,
    warmupEpisodicMinScore: 0.6,
    warmupSessionSummaries: 2,
    warmupDailyLogs: 1,
    crossSessionMessages: 3,
    proactiveEpisodicCap: 3,
    proactiveKeywordLimit: 2,
    proactiveKBLimit: 0,
    proactiveTemporalLimit: 3,
  },
  moderate: {
    warmupEpisodicLimit: 8,
    warmupEpisodicMinScore: 0.5,
    warmupSessionSummaries: 2,
    warmupDailyLogs: 3,
    crossSessionMessages: 5,
    proactiveEpisodicCap: 7,
    proactiveKeywordLimit: 3,
    proactiveKBLimit: 3,
    proactiveTemporalLimit: 5,
  },
  complex: {
    warmupEpisodicLimit: 12,
    warmupEpisodicMinScore: 0.4,
    warmupSessionSummaries: 3,
    warmupDailyLogs: 5,
    crossSessionMessages: 8,
    proactiveEpisodicCap: 10,
    proactiveKeywordLimit: 5,
    proactiveKBLimit: 5,
    proactiveTemporalLimit: 8,
  },
  deep: {
    warmupEpisodicLimit: 15,
    warmupEpisodicMinScore: 0.4,
    warmupSessionSummaries: 3,
    warmupDailyLogs: 5,
    crossSessionMessages: 8,
    proactiveEpisodicCap: 12,
    proactiveKeywordLimit: 5,
    proactiveKBLimit: 5,
    proactiveTemporalLimit: 10,
  },
  "ultra-deep": {
    warmupEpisodicLimit: 15,
    warmupEpisodicMinScore: 0.4,
    warmupSessionSummaries: 3,
    warmupDailyLogs: 5,
    crossSessionMessages: 8,
    proactiveEpisodicCap: 12,
    proactiveKeywordLimit: 5,
    proactiveKBLimit: 5,
    proactiveTemporalLimit: 10,
  },
};

export function getMemoryBudget(complexityTier?: string): MemoryBudget {
  return MEMORY_BUDGETS[complexityTier || 'moderate'] || MEMORY_BUDGETS.moderate;
}

// ═══ MODULE-LEVEL CACHE: Global user context (5-min TTL) ═══
const _globalContextCache = new Map<string, { data: GlobalUserContext; ts: number }>();
const GLOBAL_CONTEXT_CACHE_TTL = 5 * 60 * 1000;

// ═══ FETCH GLOBAL USER CONTEXT (Cross-Session Awareness) — CACHED + COUNT ═══
export async function fetchGlobalUserContext(supabase: any, userId: string): Promise<GlobalUserContext> {
  // Check cache first (warm isolate optimization)
  const cached = _globalContextCache.get(userId);
  if (cached && (Date.now() - cached.ts) < GLOBAL_CONTEXT_CACHE_TTL) {
    console.log(`[GlobalContext] Cache HIT for user ${userId}`);
    return cached.data;
  }

  try {
    // ═══ PERF: Use COUNT aggregate + first session only (not SELECT * on all sessions) ═══
    const [sessionCountResult, firstSessionResult, toolPatterns] = await Promise.all([
      supabase.from("agent_chat_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase.from("agent_chat_sessions")
        .select("created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1),
      supabase.from("agent_learning_context")
        .select("context_key, usage_count, last_used_at")
        .eq("user_id", userId)
        .eq("context_type", "tool_preference")
        .order("usage_count", { ascending: false })
        .limit(5),
    ]);
    
    const totalSessions = sessionCountResult?.count || 0;
    // Estimate total messages (COUNT avoids fetching all rows)
    const totalMessages = totalSessions * 8;
    
    const firstSession = firstSessionResult?.data?.[0];
    const firstInteractionDate = firstSession?.created_at 
      ? new Date(firstSession.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : "";
    
    const accountAgeInDays = firstSession?.created_at 
      ? Math.floor((Date.now() - new Date(firstSession.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    
    const mostUsedTools = toolPatterns?.data?.map((t: any) => 
      t.context_key.replace("preferred_tool_", "")
    ) || [];
    
    console.log(`[GlobalContext] User ${userId}: ${totalSessions} sessions, ~${totalMessages} msgs (est), ${accountAgeInDays} days`);
    
    const result: GlobalUserContext = {
      totalSessions,
      totalMessages,
      mostUsedTools,
      accountAgeInDays,
      firstInteractionDate,
    };
    
    // Store in cache
    _globalContextCache.set(userId, { data: result, ts: Date.now() });
    return result;
  } catch (e) {
    console.error("Error fetching global context:", e);
    return { 
      totalSessions: 0, 
      totalMessages: 0, 
      mostUsedTools: [], 
      accountAgeInDays: 0,
      firstInteractionDate: "",
    };
  }
}

// ═══ FETCH RECENT MEMORIES FOR SESSION WARM-UP ═══
// Uses dynamic memory budget based on complexity tier to prevent context pollution.
export async function fetchRecentMemoriesForWarmup(
  supabase: any,
  userId: string,
  currentSessionId: string,
  complexityTier?: string,
): Promise<RecentMemoriesContext> {
  try {
    const budget = getMemoryBudget(complexityTier);

    const { data: sessionSummaries } = await supabase.rpc('get_recent_session_summaries', {
      p_user_id: userId,
      p_limit: budget.warmupSessionSummaries
    });

    // Skip episodic fetch entirely for greeting tier with 0 budget
    const episodicPromise = budget.warmupEpisodicLimit > 0
      ? supabase
          .from("chat_memory_embeddings")
          .select("content_summary, created_at, topic_tags, importance_score")
          .eq("user_id", userId)
          .neq("session_id", currentSessionId)
          .gte("importance_score", budget.warmupEpisodicMinScore)
          .order("created_at", { ascending: false })
          .limit(budget.warmupEpisodicLimit)
      : Promise.resolve({ data: [] });

    const { data: episodicMemories } = await episodicPromise;

    const formattedSummaries = (sessionSummaries || []).map((s: any) => ({
      sessionKey: s.session_key,
      summary: s.summary,
      date: new Date(s.created_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      }),
    }));

    const formattedMemories = (episodicMemories || []).map((m: any) => ({
      summary: m.content_summary,
      when: new Date(m.created_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      }),
      topics: m.topic_tags || [],
    }));

    // ═══ FETCH RECENT DAILY LOGS (budget-gated) ═══
    const dailyLogPromise = budget.warmupDailyLogs > 0
      ? supabase
          .from("agent_daily_logs")
          .select("log_date, content")
          .eq("user_id", userId)
          .order("log_date", { ascending: false })
          .limit(budget.warmupDailyLogs)
      : Promise.resolve({ data: [] });

    const { data: dailyLogs } = await dailyLogPromise;

    const formattedDailyLogs = (dailyLogs || []).map((d: any) => ({
      date: d.log_date,
      content: (d.content || "").slice(0, 3000),
    }));

    const totalLoaded = formattedSummaries.length + formattedMemories.length + formattedDailyLogs.length;
    console.log(`[MemoryWarmup] Loaded ${formattedSummaries.length}/${budget.warmupSessionSummaries} summaries, ${formattedMemories.length}/${budget.warmupEpisodicLimit} episodic, ${formattedDailyLogs.length}/${budget.warmupDailyLogs} daily logs (tier: ${complexityTier || 'default'})`);

    try {
      await supabase.from("agent_communication_log").insert({
        requester_agent_id: userId,
        target_type: "memory_system",
        query_type: "memory_warmup",
        query_content: `Memory warmup [${complexityTier || 'default'}]: ${formattedSummaries.length} summaries, ${formattedMemories.length} episodic, ${formattedDailyLogs.length} daily logs`,
        response_summary: `Loaded ${totalLoaded} total memories (budget: ${budget.warmupEpisodicLimit} ep, ${budget.warmupSessionSummaries} sum, ${budget.warmupDailyLogs} log)`,
        was_successful: true,
      });
    } catch (e) { /* non-critical */ }

    return {
      sessionSummaries: formattedSummaries,
      episodicMemories: formattedMemories,
      dailyLogs: formattedDailyLogs,
    };
  } catch (error) {
    console.error("[MemoryWarmup] Error fetching memories:", error);
    return { sessionSummaries: [], episodicMemories: [] };
  }
}

// ═══ CROSS-SESSION RAW MESSAGE RETRIEVAL ═══
export async function fetchCrossSessionRecentMessages(
  supabase: any,
  userId: string,
  currentSessionId: string,
  complexityTier?: string,
): Promise<string> {
  const budget = getMemoryBudget(complexityTier);
  if (budget.crossSessionMessages <= 0) return "";

  try {
    const { data: recentMessages } = await supabase
      .from("agent_chat_messages")
      .select("content, role, created_at, session_id")
      .eq("user_id", userId)
      .neq("session_id", currentSessionId)
      .in("role", ["user", "assistant"])
      .not("content", "is", null)
      .order("created_at", { ascending: false })
      .limit(budget.crossSessionMessages);

    if (!recentMessages?.length) return "";

    return recentMessages.reverse().map((msg: any) => {
      const dt = new Date(msg.created_at);
      const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const role = msg.role === 'user' ? 'User' : 'BeeBot';
      const content = (msg.content || '').substring(0, 200);
      return `[${dateStr} ${timeStr}] ${role}: ${content}${msg.content?.length > 200 ? '...' : ''}`;
    }).join("\n");
  } catch (e) {
    console.error("[CrossSessionMessages] Error:", e);
    return "";
  }
}

// ═══ PROACTIVE MEMORY + KNOWLEDGE RECALL ═══
export async function proactiveMemoryRecall(
  supabase: any,
  userId: string,
  userMessage: string,
  baseMemories: RecentMemoriesContext,
  preComputedEmbedding?: number[] | null,
  complexityTier?: string,
): Promise<RecentMemoriesContext> {
  const budget = getMemoryBudget(complexityTier);

  // Skip proactive recall entirely for tiers with zero budget
  if (budget.proactiveEpisodicCap <= 0) {
    console.log(`[ProactiveRecall] SKIPPED (${complexityTier || 'default'} tier — zero memory budget)`);
    return baseMemories;
  }

  try {
    const lowerMessage = userMessage.toLowerCase();
    
    const topicKeywords: Record<string, string[]> = {
      finance: ["ငွေ", "money", "budget", "expense", "income", "balance", "ကျပ်", "dollar", "flowstate", "သုံး"],
      crypto: ["bitcoin", "btc", "ethereum", "crypto", "blockchain", "wallet", "coin", "ကိုင်း"],
      task: ["task", "အလုပ်", "todo", "workspace", "project", "deadline", "team"],
      personal: ["remember", "မှတ်ထား", "မမေ့နဲ့", "ပြောခဲ့", "said", "told you", "recall", "forget"],
      learning: ["course", "သင်တန်း", "learn", "study", "certificate"],
      knowledge: ["saved", "ingested", "digested", "knowledge", "article", "read", "note", "ဖတ်", "သိမ်း", "research"],
      // Temporal: past conversation queries
      temporal: [
        "yesterday", "last time", "previous", "before", "earlier", "ago", "past",
        "last week", "last month", "ပြီးခဲ့", "အရင်", "မနေ့", "မနေ့က", "ဒီတစ်ပတ်",
        "ပြီးခဲ့တဲ့", "တုန်းက", "ဘာပြောခဲ့", "ဘာလုပ်ခဲ့", "discuss", "talked",
        "what did we", "what did i", "ဘာတွေ", "history", "recent",
      ],
    };
    
    const detectedTopics: string[] = [];
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(kw => lowerMessage.includes(kw))) {
        detectedTopics.push(topic);
      }
    }
    
    // Use only pre-computed embedding — never generate independently (prevents double API calls)
    const msgEmbedding = preComputedEmbedding || null;
    
    // Path 1: Keyword-based episodic memory search (budget-gated).
    // FIX (10x): raise importance gate from 0.4 → 0.55 to cut noisy keyword pulls in half.
    // Combined with semantic Path 2, low-importance keyword hits add pollution without lift.
    const KEYWORD_MIN_IMPORTANCE = 0.55;
    const keywordSearchPromise = detectedTopics.length > 0 && budget.proactiveKeywordLimit > 0
      ? supabase
          .from("chat_memory_embeddings")
          .select("content_summary, created_at, topic_tags, importance_score")
          .eq("user_id", userId)
          .overlaps("topic_tags", detectedTopics)
          .gte("importance_score", KEYWORD_MIN_IMPORTANCE)
          .order("importance_score", { ascending: false })
          .limit(budget.proactiveKeywordLimit)
      : Promise.resolve({ data: [] });

    // Path 2: Semantic episodic memory search — GATED by topic relevance
    const needsPersonalSearch = detectedTopics.some(t => ["personal", "temporal", "finance", "task"].includes(t));
    const semanticSearchPromise = (async () => {
      if (!needsPersonalSearch || !msgEmbedding) {
        if (!needsPersonalSearch) console.log("[ProactiveRecall] Path 2 SKIPPED (no relevant topics)");
        return [];
      }
      try {
        const { data: semanticHits } = await supabase.rpc("search_user_memories", {
          p_user_id: userId,
          p_query_embedding: `[${msgEmbedding.join(",")}]`,
          p_limit: 3,
        });

        // ═══ CONFIDENCE REINFORCEMENT: Update access tracking for retrieved memories ═══
        // This prevents useful memories from decaying during consolidation.
        if (semanticHits && semanticHits.length > 0) {
          const hitIds = semanticHits.map((m: any) => m.id).filter(Boolean);
          if (hitIds.length > 0) {
            // Fire-and-forget: increment access_count + refresh last_accessed_at
            supabase.rpc("reinforce_recalled_memories", {
              p_memory_ids: hitIds,
              p_confidence_boost: 0.03,
            }).catch(() => {
              // Fallback: direct update if RPC doesn't exist yet
              supabase
                .from("user_memories")
                .update({ last_accessed_at: new Date().toISOString() })
                .in("id", hitIds)
                .then(() => {})
                .catch(() => {});
            });
          }
        }

        return (semanticHits || []).map((m: any) => ({
          content_summary: `[${m.category}] ${m.memory_key}: ${m.memory_value}`,
          created_at: m.created_at,
          topic_tags: [m.category],
          importance_score: m.similarity || 0.5,
        }));
      } catch (e) {
        console.error("[ProactiveRecall] Semantic branch error:", e);
        return [];
      }
    })();

    // Path 3: Personal Knowledge Base vector search — GATED by knowledge topics + budget
    const needsKBSearch = budget.proactiveKBLimit > 0 && detectedTopics.some(t => ["knowledge", "learning", "crypto", "finance"].includes(t));
    const knowledgeSearchPromise = (async () => {
      if (!needsKBSearch || !msgEmbedding) {
        if (!needsKBSearch) console.log("[ProactiveRecall] Path 3 SKIPPED (no knowledge topics or zero KB budget)");
        return [];
      }
      try {
        const { data: kbHits, error: kbErr } = await supabase.rpc("search_personal_knowledge", {
          p_user_id: userId,
          p_query_embedding: `[${msgEmbedding.join(",")}]`,
          p_match_count: budget.proactiveKBLimit,
          p_match_threshold: 0.45,
        });
        if (kbErr) {
          console.error("[ProactiveRecall] KB search error:", kbErr.message);
          return [];
        }
        return (kbHits || []).map((k: any) => ({
          id: k.id,
          title: k.title,
          content: (k.content || "").slice(0, 500),
          category: k.category,
          tags: k.tags || [],
          source_type: k.source_type,
          similarity: k.similarity,
          created_at: k.created_at,
        }));
      } catch (e) {
        console.error("[ProactiveRecall] KB branch error:", e);
        return [];
      }
    })();

    // Path 4: Time-range direct search for temporal queries (budget-gated)
    const temporalSearchPromise = (async () => {
      if (!detectedTopics.includes("temporal") || budget.proactiveTemporalLimit <= 0) return [];
      try {
        const timeRange = detectTimeRange(lowerMessage);
        const { data: temporalHits } = await supabase
          .from("chat_memory_embeddings")
          .select("content_summary, created_at, topic_tags, importance_score, session_id")
          .eq("user_id", userId)
          .gte("created_at", timeRange.start.toISOString())
          .lte("created_at", timeRange.end.toISOString())
          .order("created_at", { ascending: false })
          .limit(budget.proactiveTemporalLimit);

        // Also fetch raw messages from the time range for richer context
        const temporalRawMessages = await fetchTemporalCrossSessionMessages(
          supabase, userId, "", timeRange.start, timeRange.end
        );
        if (temporalRawMessages) {
          baseMemories.crossSessionMessages = (baseMemories.crossSessionMessages || "") +
            "\n--- Past Messages (Time-Range) ---\n" + temporalRawMessages;
        }

        return temporalHits || [];
      } catch (e) {
        console.error("[ProactiveRecall] Temporal search error:", e);
        return [];
      }
    })();

    const [{ data: topicMemories }, semanticResults, knowledgeResults, temporalResults] = await Promise.all([
      keywordSearchPromise,
      semanticSearchPromise,
      knowledgeSearchPromise,
      temporalSearchPromise,
    ]);

    // Merge keyword + semantic + temporal episodic results with fuzzy deduplication
    const allEpisodicResults = [...(topicMemories || []), ...semanticResults, ...temporalResults];
    const existingSummaries = baseMemories.episodicMemories.map(m => m.summary);
    const acceptedSummaries: string[] = [...existingSummaries];

    const additionalMemories = allEpisodicResults
      .filter((m: any) => {
        const summary = m.content_summary;
        if (!summary) return false;
        // Fuzzy dedup: reject if too similar to any already-accepted memory
        if (isSemanticallyDuplicate(summary, acceptedSummaries)) return false;
        acceptedSummaries.push(summary);
        return true;
      })
      .map((m: any) => ({
        summary: m.content_summary,
        when: new Date(m.created_at).toLocaleDateString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric'
        }),
        topics: m.topic_tags || [],
      }));
    
    const totalFound = additionalMemories.length + knowledgeResults.length;
    if (totalFound > 0) {
      console.log(`[ProactiveRecall] Found ${additionalMemories.length} episodic + ${knowledgeResults.length} knowledge items (keyword: ${(topicMemories || []).length}, semantic: ${semanticResults.length})`);
      
      try {
        await supabase.from("agent_communication_log").insert({
          requester_agent_id: userId,
          target_type: "memory_system",
          query_type: "memory_recall",
          query_content: `ProactiveRecall for topics: ${detectedTopics.join(", ")}`,
          response_summary: `Found ${additionalMemories.length} episodic + ${knowledgeResults.length} KB items`,
          was_successful: true,
          metadata: { topics: detectedTopics, keyword_count: (topicMemories || []).length, semantic_count: semanticResults.length, kb_count: knowledgeResults.length },
        });
      } catch (e) { /* non-critical */ }
    }
    
    return {
      ...baseMemories,
      episodicMemories: [
        ...baseMemories.episodicMemories,
        ...additionalMemories,
      ].slice(0, budget.proactiveEpisodicCap),
      personalKnowledge: knowledgeResults.slice(0, budget.proactiveKBLimit),
    };
  } catch (error) {
    console.error("[ProactiveRecall] Error:", error);
    return baseMemories;
  }
}

// ═══ FUZZY DEDUPLICATION (Jaccard similarity on word sets) ═══
// Detects near-duplicate memories across sessions without needing embeddings.
// Threshold 0.6 catches "user likes Python" vs "user prefers Python for scripting".
const DEDUP_SIMILARITY_THRESHOLD = 0.6;

function textToWordSet(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^\w\s\u1000-\u109F]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function isSemanticallyDuplicate(candidate: string, existingSummaries: string[]): boolean {
  const candidateWords = textToWordSet(candidate);
  for (const existing of existingSummaries) {
    if (jaccardSimilarity(candidateWords, textToWordSet(existing)) >= DEDUP_SIMILARITY_THRESHOLD) {
      return true;
    }
  }
  return false;
}

// ═══ TIME-RANGE DETECTION (for temporal queries) ═══
function detectTimeRange(message: string): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (/yesterday|မနေ့|မနေ့က/.test(message)) {
    const start = new Date(today); start.setDate(start.getDate() - 1);
    return { start, end: today };
  }
  if (/last week|ပြီးခဲ့တဲ့.*ပတ်|ဒီတစ်ပတ်/.test(message)) {
    const start = new Date(today); start.setDate(start.getDate() - 7);
    return { start, end: now };
  }
  if (/last month|ပြီးခဲ့တဲ့.*လ/.test(message)) {
    const start = new Date(today); start.setMonth(start.getMonth() - 1);
    return { start, end: now };
  }
  if (/today|ဒီနေ့/.test(message)) {
    return { start: today, end: now };
  }
  // Default: last 3 days
  const start = new Date(today); start.setDate(start.getDate() - 3);
  return { start, end: now };
}

// ═══ TEMPORAL CROSS-SESSION RAW MESSAGES ═══
export async function fetchTemporalCrossSessionMessages(
  supabase: any, userId: string, currentSessionId: string,
  startDate: Date, endDate: Date
): Promise<string> {
  try {
    let query = supabase
      .from("agent_chat_messages")
      .select("content, role, created_at, session_id")
      .eq("user_id", userId)
      .in("role", ["user", "assistant"])
      .not("content", "is", null)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: false })
      .limit(20);

    if (currentSessionId) {
      query = query.neq("session_id", currentSessionId);
    }

    const { data: recentMessages } = await query;
    if (!recentMessages?.length) return "";

    return recentMessages.reverse().map((msg: any) => {
      const dt = new Date(msg.created_at);
      const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const role = msg.role === 'user' ? 'User' : 'BeeBot';
      const content = (msg.content || '').substring(0, 400);
      return `[${dateStr} ${timeStr}] ${role}: ${content}${msg.content?.length > 400 ? '...' : ''}`;
    }).join("\n");
  } catch (e) {
    console.error("[TemporalCrossSession] Error:", e);
    return "";
  }
}
