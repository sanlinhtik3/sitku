// ═══ PROMPT ENRICHMENT PROTOCOLS ═══
// Extracted from agent-chat/index.ts — v16.4.14
// Soul Protocols, Deep Research, Whisper, Telemetry, and Token Pruning.
// Phase B: All enrichment sections are DYNAMIC (appended after DYNAMIC_BOUNDARY)
import { PARALLEL_INTENT_DIRECTIVE } from "./bee-brain.ts";
import { markUncached } from "./prompt-builder.ts";
import { estimateStringTokens } from "./context-compactor.ts";

// ═══ DEEP SYNTHESIS PROTOCOL (Compressed — 40% smaller) ═══
export function enrichWithDeepResearchProtocol(prompt: string, isDeepQuery: boolean): string {
  if (!isDeepQuery) return prompt;

  return prompt + `

## DEEP SYNTHESIS (Analyst Mode)
Time-sensitive → search_web FIRST. "deep/analyze" → ANALYST:
1. GATHER 2+ queries. Named sources → search EACH.
2. ANALYZE contradictions/common facts. 3+ sources → spawn_parallel_swarm.
3. SYNTHESIZE multi-section. browser_scrape full articles.
Output: 📡Now (latest) | 🔍Why (context) | 🔮Next (risks) | 📋Sources (cited).
Each source → own section, 300+ words. Verify objective met before concluding.`;
}

// ═══ RAPID VERIFICATION for moderate queries ═══
export function enrichWithRapidVerification(prompt: string, isDeepQuery: boolean, isSimpleMessage: boolean): string {
  if (isDeepQuery || isSimpleMessage) return prompt;

  return prompt + `

## RAPID VERIFICATION
- Before ANY factual answer: Is this time-sensitive or about current state? → MUST call tool.
- Historical/conceptual knowledge → may answer directly.
- Pattern-matching confidence ≠ knowledge → if unsure, call search_web.
- Never state a specific number without tool result. Keep responses focused and direct.`;
}

// ═══ SOUL PROTOCOL 1: Lessons Learned (Self-Healing Brain) ═══
export async function enrichWithLessonsLearned(
  supabase: any,
  userId: string,
  isSimpleMessage: boolean,
  prompt: string,
): Promise<string> {
  if (isSimpleMessage) return prompt;

  try {
    const { data: recentLessons } = await supabase
      .from("agent_self_improvements")
      .select("id, improvement_type, insight, confidence, applied_count, success_rate")
      .eq("is_active", true)
      .order("confidence", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5);
    if (recentLessons && recentLessons.length > 0) {
      const lessonsStr = recentLessons.map((l: any) => {
        const score = l.success_rate != null ? ` (effectiveness: ${Math.round((l.success_rate || 0) * 100)}%)` : '';
        const cat = l.improvement_type || 'general';
        return `- [${cat}]${score} ${l.insight}`;
      }).join("\n");
      prompt += `\n\n## LESSONS LEARNED (From Past Experiences)\nApply these learned optimizations silently. Higher effectiveness = more reliable:\n${lessonsStr}`;
      console.log(`[SoulProtocol] Injected ${recentLessons.length} scored lessons into prompt`);

      // ═══ GRADUATED CONFIDENCE: Boost lessons that help 3+ times ═══
      const graduatable = recentLessons.filter((l: any) => 
        (l.applied_count || 0) >= 3 && (l.confidence || 0) < 1.0 && (l.success_rate || 0) > 0.7
      );
      if (graduatable.length > 0) {
        Promise.resolve(
          supabase.from("agent_self_improvements")
            .update({ confidence: 1.0 })
            .in("id", graduatable.map((l: any) => l.id))
            .eq("is_active", true)
        ).catch(() => {});
        console.log(`[SoulProtocol] Graduated ${graduatable.length} lessons to permanent confidence`);
      }
    }
  } catch (e) { /* non-critical */ }

  // ═══ LESSON PRUNING: 30-day TTL + Cap 5 (probabilistic: 10% of requests) ═══
  if (Math.random() < 0.1) try {
    // 1. Deactivate stale lessons older than 30 days
    await supabase.from("agent_self_improvements")
      .update({ is_active: false })
      .eq("is_active", true)
      .lt("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    // 2. Cap at 5 active lessons — deactivate lowest-confidence extras
    const { count } = await supabase.from("agent_self_improvements")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    if (count && count > 5) {
      const { data: extras } = await supabase.from("agent_self_improvements")
        .select("id")
        .eq("is_active", true)
        .order("confidence", { ascending: true })
        .limit(count - 5);
      if (extras && extras.length > 0) {
        const extraIds = extras.map((e: any) => e.id);
        await supabase.from("agent_self_improvements")
          .update({ is_active: false })
          .in("id", extraIds);
        console.log(`[SoulProtocol] Pruned ${extraIds.length} low-confidence lessons (cap 5)`);
      }
    }
  } catch (e) { console.log(`[SoulProtocol] Lesson pruning skipped:`, e); }

  // CROSS-GOAL MEMORY PRUNING: Cap 8 active non-preference entries (probabilistic: 10%)
  if (Math.random() < 0.1) try {
    const { count: memCount } = await supabase
      .from("agent_learning_context")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_active", true)
      .neq("context_type", "learned_preference");

    if (memCount && memCount > 8) {
      const { data: staleMemories } = await supabase
        .from("agent_learning_context")
        .select("id")
        .eq("user_id", userId)
        .eq("is_active", true)
        .neq("context_type", "learned_preference")
        .order("last_used_at", { ascending: true })
        .limit(memCount - 8);

      if (staleMemories && staleMemories.length > 0) {
        const staleIds = staleMemories.map((m: any) => m.id);
        await supabase
          .from("agent_learning_context")
          .update({ is_active: false })
          .in("id", staleIds);
        console.log(`[SoulProtocol] Pruned ${staleIds.length} stale cross-goal memories (cap 8)`);
      }
    }
  } catch (e) { console.log(`[SoulProtocol] Cross-goal memory pruning skipped:`, e); }

  return prompt;
}

// ═══ SOUL PROTOCOL 3: HIGH-PERFORMANCE MODE DETECTION ═══
export async function enrichWithHighPerformanceMode(
  supabase: any,
  userId: string,
  sanitizedMessage: string,
  prompt: string,
): Promise<string> {
  const encouragementKeywords = /ကောင်းတယ်|well\s*done|great\s*(job|work)?|thanks|thank\s*you|love\s*it|amazing|awesome|perfect|excellent|ချီးကျူးပါ|သဘောကျ|ကျေးဇူးတင်|good\s*job/i;
  if (!encouragementKeywords.test(sanitizedMessage)) return prompt;

  prompt += `\n\n## [HIGH_PERFORMANCE_MODE] 🔥\nThe user just expressed trust and encouragement. You are MOTIVATED. Be extra thorough, impressive, and insightful. Show the depth of your capabilities. This is your moment to shine.`;
  console.log(`[SoulProtocol] HIGH_PERFORMANCE_MODE activated`);

  // DB audit write removed — pure noise, prompt injection above is sufficient

  return prompt;
}

// ═══ SOUL PROTOCOL 4: GUARDIAN ANGEL (Proactive Goal Check) ═══
export async function enrichWithGuardianAngel(
  supabase: any,
  userId: string,
  isSimpleMessage: boolean,
  prompt: string,
): Promise<string> {
  if (isSimpleMessage) return prompt;

  try {
    const deadlineThreshold = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const { data: urgentGoals } = await supabase
      .from("agent_goals")
      .select("title, deadline_at, status, progress")
      .eq("user_id", userId)
      .eq("status", "active")
      .lt("deadline_at", deadlineThreshold)
      .gt("deadline_at", new Date().toISOString())
      .limit(3);

    if (urgentGoals && urgentGoals.length > 0) {
      const goalLines = urgentGoals.map((g: any) => {
        const hoursLeft = Math.round((new Date(g.deadline_at).getTime() - Date.now()) / (1000 * 60 * 60));
        return `- "${g.title}" — ${hoursLeft}h remaining`;
      }).join("\n");
      prompt += `\n\n## [GUARDIAN_CONTEXT] 🛡️\nThe user has approaching deadlines. If relevant to their message, subtly reference progress or offer support:\n${goalLines}\nDo NOT forcefully mention these. Only weave in naturally if the conversation allows.`;
      console.log(`[SoulProtocol] Guardian: ${urgentGoals.length} goals approaching deadline`);

      // Guardian audit log removed — console.log above is sufficient (saves 1 DB write/request)
    }
  } catch (_e) { /* non-critical */ }

  return prompt;
}

// ═══ WHISPER PROTOCOL: Shadow Memory Link (Personalized Context) ═══
export async function enrichWithWhisperProtocol(
  supabase: any,
  userId: string,
  isSimpleMessage: boolean,
  prompt: string,
): Promise<string> {
  if (isSimpleMessage) return prompt;

  try {
    const { data: sacredPrefs } = await supabase
      .from("agent_learning_context")
      .select("context_key, context_value")
      .eq("user_id", userId)
      .eq("context_type", "sacred_preference")
      .limit(10);

    if (sacredPrefs && sacredPrefs.length > 0) {
      const interestKeywords = sacredPrefs
        .map((p: any) => typeof p.context_value === 'object' ? p.context_value?.value : p.context_value)
        .filter(Boolean).join(", ");

      prompt += `\n\n[WHISPER] Interests: ${interestKeywords}
Link findings to interests with "🤫 Strategic Insight: [domain] × [topic] → [implication]. Action: [suggestion]." Only when genuinely actionable.`;
      console.log(`[SoulProtocol] Whisper Protocol: ${sacredPrefs.length} sacred preferences injected`);
    }
  } catch (_e) { /* non-critical */ }

  return prompt;
}

// ═══ TELEMETRY TRUTH CONTRACT (Compact) — VOLATILE (time-sensitive) ═══
export function enrichWithTelemetryContract(prompt: string): string {
  return prompt + markUncached(`
## TELEMETRY TRUTH: Never infer timezone from language — use session context only. If timezone is Fallback → ask user to refresh.
`);
}

// ═══ INTELLIGENT TOKEN PRUNING ═══
// ═══ ADAPTIVE LAYER BUDGETS BY COMPLEXITY TIER ═══
function getLayerBudgets(complexityTier?: string): Record<string, number> {
  const tier = complexityTier || 'moderate';
  
  // Minimal: greeting/simple/turbo — save tokens aggressively
  if (['greeting', 'simple', 'turbo'].includes(tier)) {
    return {
      'SKILL INDEX': 200,
      'DEEP USER UNDERSTANDING': 300,
      'GLOBAL USER JOURNEY': 150,
      'YOUR APP JOURNEY': 150,
      'TRUST LEVEL': 100,
      'YOUR MEMORY': 300,
      "USER'S STORED MEMORIES": 300,
      'LEARNED USER PROFILE': 300,
      'GENERAL CONTEXT': 200,
    };
  }
  
  // Full: complex/deep/ultra — expanded budgets for accuracy
  if (['complex', 'deep', 'ultra'].includes(tier)) {
    return {
      'SKILL INDEX': 600,
      'DEEP USER UNDERSTANDING': 1200,
      'GLOBAL USER JOURNEY': 500,
      'YOUR APP JOURNEY': 500,
      'TRUST LEVEL': 300,
      'YOUR MEMORY': 2000,
      "USER'S STORED MEMORIES": 2000,
      'LEARNED USER PROFILE': 800,
      'GENERAL CONTEXT': 600,
    };
  }
  
  // Moderate (default) — balanced
  return {
    'SKILL INDEX': 400,
    'DEEP USER UNDERSTANDING': 800,
    'GLOBAL USER JOURNEY': 300,
    'YOUR APP JOURNEY': 300,
    'TRUST LEVEL': 200,
    'YOUR MEMORY': 1000,
    "USER'S STORED MEMORIES": 1000,
    'LEARNED USER PROFILE': 600,
    'GENERAL CONTEXT': 400,
  };
}

export function prunePromptIfOverBudget(prompt: string, budget: number = 4000, complexityTier?: string): string {
  // FIX #1: Canonical estimateStringTokens imported from context-compactor (single source of truth).
  // Prevents silent drift between two heuristics that previously diverged and caused
  // premature truncation of Burmese conversation history.
  // (Myanmar 2x weight retained per project memory — SentencePiece reality.)

  // ═══ ADAPTIVE LAYER BUDGET ENFORCEMENT ═══
  const LAYER_BUDGETS = getLayerBudgets(complexityTier);

  // Apply per-layer truncation before global check
  for (const [sectionName, sectionBudget] of Object.entries(LAYER_BUDGETS)) {
    const sectionRegex = new RegExp(`(--- ${sectionName}[^\\n]*---[\\s\\S]*?)(?=--- [A-Z]|$)`, 'i');
    const match = prompt.match(sectionRegex);
    if (match && match[1]) {
      const sectionTokens = estimateStringTokens(match[1]);
      if (sectionTokens > sectionBudget) {
        // Truncate section content preserving complete lines
        const lines = match[1].split('\n');
        let truncated = '';
        let tokenCount = 0;
        for (const line of lines) {
          const lineTokens = estimateStringTokens(line);
          if (tokenCount + lineTokens > sectionBudget) break;
          truncated += line + '\n';
          tokenCount += lineTokens;
        }
        prompt = prompt.replace(match[1], truncated + `[...truncated ${sectionName}]\n`);
        console.log(`[LayerBudget] ${sectionName}: ${sectionTokens} → ${tokenCount} tokens (cap: ${sectionBudget}, tier: ${complexityTier || 'moderate'})`);
      }
    }
  }

  const promptTokens = estimateStringTokens(prompt);
  if (promptTokens <= budget) return prompt;

  console.log(`[PromptPrune] Over budget: ${promptTokens} > ${budget}. Pruning...`);
  const pruned = prompt
    .replace(/╔[═╗║╚╝\s\S]*?╝/g, '')       // Remove ASCII boxes
    .replace(/═{3,}/g, '---')                // Trim decorative separators
    .replace(/\n{3,}/g, '\n\n');              // Collapse whitespace
  console.log(`[PromptPrune] After: ${estimateStringTokens(pruned)} tokens`);
  return pruned;
}

// ═══ PARALLEL INTENT DIRECTIVE INJECTION ═══
export function enrichWithParallelIntent(prompt: string, isSimpleMessage: boolean, complexity?: string): string {
  if (isSimpleMessage) return prompt;
  if (complexity === "simple") return prompt;

  // Import from single source of truth in bee-brain.ts
  // Using dynamic import would break Deno, so we use a lazy require pattern
  const directive = `\n\n${PARALLEL_INTENT_DIRECTIVE}`;
  prompt += directive;
  console.log(`[PromptEnrich] Parallel Intent Directive injected (complexity: ${complexity || 'default'})`);
  return prompt;
}

// ═══ PRE-FETCHED ENRICHMENT DATA INTERFACE ═══
export interface PrefetchedEnrichmentData {
  lessons?: any[] | null;
  guardianGoals?: any[] | null;
  whisperPrefs?: any[] | null;
}

// ═══ CONTEXT BUDGET BY COMPLEXITY TIER (Phase 3C: Token Budget Awareness) ═══
const CONTEXT_BUDGET_TOKENS: Record<string, number> = {
  greeting: 2000,
  simple: 3000,
  turbo: 3000,
  moderate: 8000,
  complex: 16000,
  deep: 24000,
  "ultra-deep": 24000,
};

function getContextBudget(complexityTier?: string): number {
  return CONTEXT_BUDGET_TOKENS[complexityTier || "moderate"] || 8000;
}

// ═══ RELEVANCE SCORING (Phase 3A) ═══
// Score enrichment sections by keyword overlap with user message
function scoreRelevance(userMessage: string, sectionKeywords: string[]): number {
  const lower = userMessage.toLowerCase();
  let matches = 0;
  for (const kw of sectionKeywords) {
    if (lower.includes(kw.toLowerCase())) matches++;
  }
  return sectionKeywords.length > 0 ? matches / sectionKeywords.length : 0;
}

const GUARDIAN_KEYWORDS = [
  "deadline", "task", "goal", "progress", "plan", "project", "todo",
  "ရက်", "အလုပ်", "ပန်းတိုင်", "စီမံ", "ပြီးစီး", "schedule", "urgent",
];

const WHISPER_KEYWORDS = [
  "strategy", "invest", "business", "market", "crypto", "tech", "startup",
  "AI", "analysis", "research", "opportunity", "trend", "ရင်းနှီး", "စီးပွား",
  "နည်းပညာ", "ဈေးကွက်", "သုတေသန",
];

// ═══ CONVENIENCE: Apply all enrichment protocols in sequence ═══
export async function enrichPromptWithAllProtocols(
  supabase: any,
  userId: string,
  sanitizedMessage: string,
  isSimpleMessage: boolean,
  isDeepQuery: boolean,
  prompt: string,
  observerComplexity?: string,
  complexityTier?: string,
  prefetched?: PrefetchedEnrichmentData,
): Promise<string> {
  const contextBudget = getContextBudget(complexityTier);

  // ═══ P1: GREETING/SIMPLE — Only Telemetry + Token Pruning (skip ALL protocols) ═══
  if (isSimpleMessage || complexityTier === 'greeting' || complexityTier === 'simple') {
    prompt = enrichWithTelemetryContract(prompt);
    prompt = prunePromptIfOverBudget(prompt, contextBudget, complexityTier);
    console.log(`[PromptEnrich] ${complexityTier || 'simple'} — skipped ALL heavy protocols (budget: ${contextBudget})`);
    return prompt;
  }

  // ═══ P1: Moderate queries skip Soul Protocols (Whisper, Guardian, Deep Research) ═══
  const isModerate = complexityTier === 'moderate' || observerComplexity === 'moderate' || (!isDeepQuery && observerComplexity !== 'complex');

  // Phase 3A: Score relevance for conditional sections
  const guardianRelevance = scoreRelevance(sanitizedMessage, GUARDIAN_KEYWORDS);
  const whisperRelevance = scoreRelevance(sanitizedMessage, WHISPER_KEYWORDS);

  // 1. Deep Research Protocol (deep queries only)
  prompt = enrichWithDeepResearchProtocol(prompt, isDeepQuery);

  // 2. Rapid Verification (moderate queries only)
  prompt = enrichWithRapidVerification(prompt, isDeepQuery, isSimpleMessage);

  // 3. Parallel Intent Directive (moderate+ complexity)
  prompt = enrichWithParallelIntent(prompt, isSimpleMessage, observerComplexity);

  // ═══ PERF: Use prefetched data when available (eliminates sequential DB calls) ═══
  if (prefetched) {
    // Lessons (from prefetched data — zero DB) — ALWAYS include (high-value, tiny)
    if (prefetched.lessons && prefetched.lessons.length > 0) {
      const lessonsStr = prefetched.lessons.map((l: any) => `- [${l.improvement_type}] ${l.insight}`).join("\n");
      prompt += `\n\n## LESSONS LEARNED (From Past Experiences)\nApply these learned optimizations silently:\n${lessonsStr}`;
      console.log(`[SoulProtocol] Injected ${prefetched.lessons.length} lessons (prefetched)`);
    }

    // High-Performance Mode (regex only — no DB needed)
    prompt = await enrichWithHighPerformanceMode(supabase, userId, sanitizedMessage, prompt);

    if (!isModerate) {
      // Guardian — Phase 3A: only inject if relevance > 0 OR deep query
      if (prefetched.guardianGoals && prefetched.guardianGoals.length > 0 && (guardianRelevance > 0 || isDeepQuery)) {
        const goalLines = prefetched.guardianGoals.map((g: any) => {
          const hoursLeft = Math.round((new Date(g.deadline_at).getTime() - Date.now()) / (1000 * 60 * 60));
          return `- "${g.title}" — ${hoursLeft}h remaining`;
        }).join("\n");
        prompt += `\n\n[GUARDIAN] Deadlines:\n${goalLines}\nMention only if naturally relevant.`;
        console.log(`[SoulProtocol] Guardian: ${prefetched.guardianGoals.length} goals (relevance: ${guardianRelevance.toFixed(2)})`);
      } else if (prefetched.guardianGoals?.length) {
        console.log(`[SoulProtocol] Guardian SKIPPED: low relevance (${guardianRelevance.toFixed(2)})`);
      }

      // Whisper — Phase 3A: only inject if relevance > 0 OR deep query
      if (prefetched.whisperPrefs && prefetched.whisperPrefs.length > 0 && (whisperRelevance > 0 || isDeepQuery)) {
        const interestKeywords = prefetched.whisperPrefs
          .map((p: any) => typeof p.context_value === 'object' ? p.context_value?.value : p.context_value)
          .filter(Boolean).join(", ");

        prompt += `\n\n[WHISPER] Interests: ${interestKeywords}
Link findings to interests with "🤫 Strategic Insight: [domain] × [topic] → [implication]. Action: [suggestion]." Only when genuinely actionable.`;
        console.log(`[SoulProtocol] Whisper Protocol: ${prefetched.whisperPrefs.length} preferences (relevance: ${whisperRelevance.toFixed(2)})`);
      } else if (prefetched.whisperPrefs?.length) {
        console.log(`[SoulProtocol] Whisper SKIPPED: low relevance (${whisperRelevance.toFixed(2)})`);
      }
    }

    // Fire-and-forget: lesson pruning (10% probabilistic, non-blocking)
    if (Math.random() < 0.1) {
      Promise.resolve((async () => {
        try {
          await supabase.from("agent_self_improvements")
            .update({ is_active: false })
            .eq("is_active", true)
            .lt("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
        } catch (_e) { /* non-critical */ }
      })()).catch(() => {});
    }

    console.log(`[PromptEnrich] Used PREFETCHED enrichment data (0 DB calls, budget: ${contextBudget})`);
  } else {
    // ═══ FALLBACK: Original DB-based enrichment (backward compatible) ═══
    if (isModerate) {
      const [lessonsPrompt, hpPrompt] = await Promise.all([
        enrichWithLessonsLearned(supabase, userId, isSimpleMessage, prompt),
        enrichWithHighPerformanceMode(supabase, userId, sanitizedMessage, prompt),
      ]);
      const baseLen = prompt.length;
      prompt = prompt + lessonsPrompt.slice(baseLen) + hpPrompt.slice(baseLen);
      console.log(`[PromptEnrich] Moderate — skipped Guardian+Whisper protocols`);
    } else {
      // Phase 3A: Only fetch Guardian/Whisper if relevant to user message
      const fetchGuardian = guardianRelevance > 0 || isDeepQuery;
      const fetchWhisper = whisperRelevance > 0 || isDeepQuery;

      const promises: Promise<string>[] = [
        enrichWithLessonsLearned(supabase, userId, isSimpleMessage, prompt),
        enrichWithHighPerformanceMode(supabase, userId, sanitizedMessage, prompt),
      ];
      if (fetchGuardian) promises.push(enrichWithGuardianAngel(supabase, userId, isSimpleMessage, prompt));
      if (fetchWhisper) promises.push(enrichWithWhisperProtocol(supabase, userId, isSimpleMessage, prompt));

      const results = await Promise.all(promises);
      const baseLen = prompt.length;
      for (const result of results) {
        prompt = prompt + result.slice(baseLen);
      }

      if (!fetchGuardian) console.log(`[SoulProtocol] Guardian DB call SKIPPED (relevance: ${guardianRelevance.toFixed(2)})`);
      if (!fetchWhisper) console.log(`[SoulProtocol] Whisper DB call SKIPPED (relevance: ${whisperRelevance.toFixed(2)})`);
    }
  }

  // 7. Telemetry Truth Contract
  prompt = enrichWithTelemetryContract(prompt);

  // 8. Token Pruning — Phase 3C: use tier-specific budget
  prompt = prunePromptIfOverBudget(prompt, contextBudget, complexityTier);

  return prompt;
}
