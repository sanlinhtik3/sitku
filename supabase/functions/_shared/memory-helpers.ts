// ═══ Memory Helpers — Extracted from executor-helpers.ts ═══
// Profile learning, behavioral tracking, reflection, summary generation, session finalization.

import { GEMINI_OPENAI_ENDPOINT } from "./api-endpoints.ts";
import { resolveInternalLLM, callInternalLLM, type InternalLLMConfig } from "./internal-llm-caller.ts";
import { callGeminiEmbeddingAPI, generateEmbedding } from "./embedding-helpers.ts";
import type { ExtendedContext, UserProfileData } from "./prompt-builder.ts";

/** Build a fallback LLM config from a personal Gemini key — eliminates duplicate inline construction */
function buildFallbackLLMConfig(personalGeminiKey?: string): InternalLLMConfig | null {
  if (!personalGeminiKey) return null;
  return {
    apiKey: personalGeminiKey,
    endpoint: GEMINI_OPENAI_ENDPOINT,
    model: "gemini-2.5-flash-lite",
    provider: 'google' as const,
    headers: { "Authorization": `Bearer ${personalGeminiKey}`, "Content-Type": "application/json" },
  };
}

// ═══ USER PROFILE LEARNING ═══
export async function upsertUserProfile(supabase: any, userId: string, key: string, value: string) {
  const contextKey = `profile_${key}`;
  const { data: existing } = await supabase.from("agent_learning_context").select("id, context_value, usage_count").eq("user_id", userId).eq("context_type", "user_profile").eq("context_key", contextKey).maybeSingle();
  if (existing) {
    const currentValue = existing.context_value || {};
    const frequencies = currentValue.frequencies || {};
    frequencies[value] = (frequencies[value] || 0) + 1;
    const dominant = Object.entries(frequencies).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] || value;
    await supabase.from("agent_learning_context").update({
      context_value: { dominant, frequencies, last_observed: value },
      usage_count: (existing.usage_count || 0) + 1, last_used_at: new Date().toISOString(),
    }).eq("id", existing.id);
  } else {
    await supabase.from("agent_learning_context").insert({
      user_id: userId, context_type: "user_profile", context_key: contextKey,
      context_value: { dominant: value, frequencies: { [value]: 1 }, last_observed: value },
      usage_count: 1, last_used_at: new Date().toISOString(),
    });
  }
}

export async function incrementInteractionCount(supabase: any, userId: string) {
  const contextKey = "profile_interaction_count";
  const { data: existing } = await supabase.from("agent_learning_context").select("id, usage_count").eq("user_id", userId).eq("context_type", "user_profile").eq("context_key", contextKey).maybeSingle();
  if (existing) {
    await supabase.from("agent_learning_context").update({ usage_count: existing.usage_count + 1, last_used_at: new Date().toISOString() }).eq("id", existing.id);
  } else {
    await supabase.from("agent_learning_context").insert({
      user_id: userId, context_type: "user_profile", context_key: contextKey, context_value: { count: 1 }, usage_count: 1, last_used_at: new Date().toISOString(),
    });
  }
}

export async function trackBehavioralPatterns(supabase: any, userId: string, topics: string[], timeSlot: string) {
  try {
    for (const topic of topics) {
      const contextKey = `pattern_${topic}_${timeSlot}`;
      const { data: existing } = await supabase.from("agent_learning_context").select("id, context_value, usage_count").eq("user_id", userId).eq("context_type", "behavioral_pattern").eq("context_key", contextKey).maybeSingle();
      if (existing) {
        await supabase.from("agent_learning_context").update({ usage_count: (existing.usage_count || 0) + 1, last_used_at: new Date().toISOString() }).eq("id", existing.id);
      } else {
        await supabase.from("agent_learning_context").insert({
          user_id: userId, context_type: "behavioral_pattern", context_key: contextKey,
          context_value: { topic, time_slot: timeSlot }, usage_count: 1, last_used_at: new Date().toISOString(),
        });
      }
    }
  } catch (e) { console.error("Behavioral tracking error", e); }
}

export async function analyzeAndLearnUserProfile(supabase: any, userId: string, userMessage: string) {
  if (userMessage.length < 10) return;
  const hasBurmese = /[\u1000-\u109F]/.test(userMessage);
  const languagePattern = hasBurmese ? "burmese" : "english";
  const formality = userMessage.includes("ခင်ဗျာ") || userMessage.includes("ပါ") ? "formal" : "casual";
  const myanmarTime = new Date(Date.now() + (6.5 * 60 * 60 * 1000));
  const hour = myanmarTime.getUTCHours();
  const activeTime = hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  
  await Promise.all([
    upsertUserProfile(supabase, userId, "language_pattern", languagePattern),
    upsertUserProfile(supabase, userId, "formality_style", formality),
    upsertUserProfile(supabase, userId, "active_times", activeTime),
    incrementInteractionCount(supabase, userId),
  ]);
}

export async function fetchExtendedContext(supabase: any, userId: string): Promise<ExtendedContext> {
  try {
    const [trustResult, skillsResult, memoriesResult, appStateResult, userProfileResult] = await Promise.all([
      supabase.rpc('get_user_trust_level', { p_user_id: userId }),
      supabase.from("agent_custom_skills").select("id, skill_name, description, trigger_keywords").eq("user_id", userId).eq("is_active", true).order("use_count", { ascending: false }).limit(20),
      supabase.from("agent_learning_context").select("context_key, context_value").eq("user_id", userId).eq("context_type", "explicit_memory").order("last_used_at", { ascending: false }).limit(15),
      supabase.rpc('get_user_app_context', { p_user_id: userId }),
      supabase.from("agent_learning_context").select("context_key, context_value, usage_count").eq("user_id", userId).eq("context_type", "user_profile").order("usage_count", { ascending: false }),
    ]);
    
    const userProfile: UserProfileData = {};
    if (userProfileResult?.data) {
      for (const item of userProfileResult.data) {
        const key = item.context_key.replace("profile_", "") as keyof UserProfileData;
        userProfile[key] = item.context_value;
      }
    }
    
    return {
      trustLevel: trustResult?.data || null,
      skills: skillsResult?.data || [],
      memories: memoriesResult?.data || [],
      appState: appStateResult?.data || null,
      userProfile: Object.keys(userProfile).length > 0 ? userProfile : undefined,
    };
  } catch { return {}; }
}

// ═══ POST-INTERACTION REFLECTION ═══
export async function postInteractionReflection(supabase: any, userId: string, sessionId: string, userMessage: string, botResponse: string, toolsUsed: string[], personalGeminiKey?: string, llmConfig?: InternalLLMConfig | null) {
  const config = llmConfig || buildFallbackLLMConfig(personalGeminiKey);
  if (!config) return;
  if (userMessage.length < 15 || botResponse.length < 50) return;
  if (/^(hi|hello|hey|ok|oke|hmm|yes|no|ဟို|အင်း|ဟုတ်ကဲ့)\b/i.test(userMessage.trim())) return;

  const reflectionPrompt = `Analyze conversation. JSON only. user: "${userMessage.slice(0, 300)}", bot: "${botResponse.slice(0, 400)}". Return { "satisfaction": "positive"|"neutral"|"negative", "implicit_facts": [{"key": "string", "value": "string"}] }. Only extract MEANINGFUL facts (preferences, names, decisions, goals). Skip trivial/obvious facts.`;

  try {
    const reflectionConfig: InternalLLMConfig = { ...config, taskType: 'memory_reflection' };
    const content = await callInternalLLM(reflectionConfig, [{ role: "system", content: reflectionPrompt }], { maxTokens: 300, temperature: 0.2, timeoutMs: 8000 });
    if (!content) return;
    const json = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || "{}");
    if (json.implicit_facts?.length) {
      const { count } = await supabase.from("agent_learning_context")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("context_type", "auto_learned");
      
      const currentCount = count || 0;
      if (currentCount >= 200) {
        const { data: oldEntries } = await supabase.from("agent_learning_context")
          .select("id").eq("user_id", userId).eq("context_type", "auto_learned")
          .order("last_used_at", { ascending: true }).limit(20);
        if (oldEntries?.length) {
          await supabase.from("agent_learning_context")
            .delete().in("id", oldEntries.map((e: any) => e.id));
          console.log(`[Reflection] Pruned ${oldEntries.length} old auto_learned entries`);
        }
      }

      for (const fact of json.implicit_facts) {
        if (!fact.key || !fact.value || fact.value.length < 3) continue;
        const { data: existing } = await supabase.from("agent_learning_context")
          .select("id, usage_count").eq("user_id", userId)
          .eq("context_type", "auto_learned").eq("context_key", fact.key)
          .maybeSingle();
        
        if (existing) {
          await supabase.from("agent_learning_context").update({
            context_value: { value: fact.value, source: "reflection" },
            usage_count: (existing.usage_count || 0) + 1,
            last_used_at: new Date().toISOString(),
          }).eq("id", existing.id);
        } else {
          await supabase.from("agent_learning_context").insert({
            user_id: userId, context_type: "auto_learned", context_key: fact.key,
            context_value: { value: fact.value, source: "reflection" },
            usage_count: 1, last_used_at: new Date().toISOString(),
          });
        }
      }
    }
  } catch (e) { console.error("Reflection error", e); }
}

// ═══ LLM SUMMARY HELPER ═══
export async function generateLLMSummary(messagesText: string, existingSummary?: string, personalGeminiKey?: string, llmConfig?: InternalLLMConfig | null): Promise<string | null> {
  const config = llmConfig || buildFallbackLLMConfig(personalGeminiKey);
  if (!config) { console.error("[Summary] No LLM config available"); return null; }

  const mergeInstruction = existingSummary
    ? `\n\nEXISTING SUMMARY (merge with new information, don't lose old facts):\n${existingSummary}`
    : "";

  const systemContent = `You are a memory compression engine. Produce a dense factual summary preserving: user facts, names, decisions, financial data, task statuses, emotional context, and preferences. No commentary. Max 4500 chars. Output ONLY the summary text.${mergeInstruction}`;

  try {
    // ═══ Memory summary uses gemini-2.5-flash for ≥8K context window ═══
    const summaryConfig: InternalLLMConfig = { ...config, model: 'gemini-2.5-flash', taskType: 'memory_summary' };
    const content = await callInternalLLM(summaryConfig, [{ role: "system", content: systemContent }, { role: "user", content: messagesText }], { maxTokens: 1500, temperature: 0.2, timeoutMs: 15000 });
    return content ? content.slice(0, 5000) : null;
  } catch (e) { console.error("[Summary] LLM call failed:", e); return null; }
}

// ═══ ROLLING CONTEXT SUMMARY ═══
export async function generateRollingContextSummary(supabase: any, sessionId: string, personalGeminiKey?: string) {
  try {
    const { data: session } = await supabase
      .from("agent_chat_sessions")
      .select("message_count, context_summary")
      .eq("id", sessionId).single();
    if (!session) return;

    const msgCount = session.message_count || 0;
    const hasExisting = !!session.context_summary;
    const triggerInterval = hasExisting ? 10 : 3;

    if (msgCount < 3 || (msgCount % triggerInterval !== 0)) return;

    console.log(`[RollingContext] Triggering summary for session ${sessionId} at ${msgCount} messages`);

    const { data: msgs } = await supabase
      .from("agent_chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false }).limit(20);
    if (!msgs || msgs.length < 3) return;

    const messagesText = msgs.reverse()
      .map((m: any) => `${m.role}: ${(m.content || "").slice(0, 500)}`)
      .join("\n");

    const summary = await generateLLMSummary(messagesText, session.context_summary || undefined, personalGeminiKey);
    if (!summary) return;

    await supabase.from("agent_chat_sessions")
      .update({ context_summary: summary.slice(0, 5000) })
      .eq("id", sessionId);

    console.log(`[RollingContext] ✅ Summary saved (${summary.length} chars) for session ${sessionId}`);
  } catch (e) { console.error("[RollingContext] Error:", e); }
}

// ═══ SESSION FINALIZATION ═══
export async function finalizeSessionSummary(supabase: any, sessionId: string, personalGeminiKey?: string) {
  try {
    const { data: msgs } = await supabase
      .from("agent_chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }).limit(50);
    if (!msgs || msgs.length < 3) return;

    console.log(`[Finalize] Generating final summary for session ${sessionId} (${msgs.length} messages)`);

    const messagesText = msgs
      .map((m: any) => `${m.role}: ${(m.content || "").slice(0, 500)}`)
      .join("\n");

    const summary = await generateLLMSummary(messagesText, undefined, personalGeminiKey);
    if (!summary) return;

    await supabase.from("agent_chat_sessions")
      .update({ context_summary: summary.slice(0, 5000) })
      .eq("id", sessionId);

    console.log(`[Finalize] ✅ Final summary saved (${summary.length} chars) for session ${sessionId}`);

    // ═══ SESSION-END HOOK: Append to daily log ═══
    try {
      const { data: sessionData } = await supabase
        .from("agent_chat_sessions")
        .select("user_id, title, message_count, created_at")
        .eq("id", sessionId)
        .single();

      if (sessionData?.user_id) {
        const today = new Date().toISOString().split("T")[0];
        const time = new Date(sessionData.created_at).toLocaleTimeString("en-US", {
          hour: "2-digit", minute: "2-digit",
        });
        const sessionEntry = `### Session (${time}, ${sessionData.message_count || 0} msgs)\n**${sessionData.title || "Untitled"}**\n${summary.slice(0, 2000)}`;

        const { data: existingLog } = await supabase
          .from("agent_daily_logs")
          .select("id, content")
          .eq("user_id", sessionData.user_id)
          .eq("log_date", today)
          .maybeSingle();

        if (existingLog) {
          const updatedContent = existingLog.content + "\n\n---\n\n" + sessionEntry;
          await supabase
            .from("agent_daily_logs")
            .update({ content: updatedContent, updated_at: new Date().toISOString() })
            .eq("id", existingLog.id);
        } else {
          await supabase.from("agent_daily_logs").insert({
            user_id: sessionData.user_id,
            log_date: today,
            content: `# Daily Log — ${today}\n\n${sessionEntry}`,
          });
        }
        console.log(`[Finalize] 📅 Daily log updated for ${today}`);
      }
    } catch (dailyErr) {
      console.error("[Finalize] Daily log append error (non-critical):", dailyErr);
    }
  } catch (e) { console.error("[Finalize] Error:", e); }
}

// ═══ SELF-HEALING MEMORY WATCHDOG ═══
export async function memoryHealthCheck(supabase: any, userId: string, personalGeminiKey?: string) {
  try {
    let llmCallCount = 0;
    const MAX_LLM_CALLS = 7;
    const healedSessionIds: string[] = [];

    const { data: orphans } = await supabase
      .from("agent_chat_sessions")
      .select("id, message_count")
      .eq("user_id", userId)
      .gt("message_count", 2)
      .is("context_summary", null)
      .order("message_count", { ascending: false })
      .limit(5);

    if (orphans && orphans.length > 0) {
      console.log(`[MemoryWatchdog] Found ${orphans.length} orphaned sessions for user ${userId}`);

      for (const orphan of orphans) {
        if (llmCallCount >= MAX_LLM_CALLS) break;
        const healed = await healOrphanSession(supabase, orphan, "[MemoryWatchdog]", personalGeminiKey);
        if (healed) {
          llmCallCount++;
          healedSessionIds.push(orphan.id);
        }
      }
    }

    if (llmCallCount < MAX_LLM_CALLS) {
      const globalLimit = Math.min(2, MAX_LLM_CALLS - llmCallCount);
      const { data: globalOrphans } = await supabase
        .from("agent_chat_sessions")
        .select("id, message_count, user_id")
        .gt("message_count", 2)
        .is("context_summary", null)
        .order("message_count", { ascending: false })
        .limit(globalLimit + healedSessionIds.length);

      if (globalOrphans && globalOrphans.length > 0) {
        let globalHealed = 0;
        for (const orphan of globalOrphans) {
          if (globalHealed >= globalLimit || llmCallCount >= MAX_LLM_CALLS) break;
          if (healedSessionIds.includes(orphan.id)) continue;
          const healed = await healOrphanSession(supabase, orphan, "[MemoryWatchdog:Global]", personalGeminiKey);
          if (healed) {
            llmCallCount++;
            globalHealed++;
          }
        }
        if (globalHealed > 0) {
          console.log(`[MemoryWatchdog:Global] Healed ${globalHealed} cross-user orphan(s)`);
        }
      }
    }
  } catch (e) { console.error("[MemoryWatchdog] Error:", e); }
}

async function healOrphanSession(supabase: any, orphan: { id: string; message_count: number }, logPrefix: string, personalGeminiKey?: string): Promise<boolean> {
  try {
    const { data: msgs } = await supabase
      .from("agent_chat_messages")
      .select("role, content")
      .eq("session_id", orphan.id)
      .order("created_at", { ascending: false }).limit(30);
    if (!msgs || msgs.length < 3) return false;

    const messagesText = msgs.reverse()
      .map((m: any) => `${m.role}: ${(m.content || "").slice(0, 500)}`)
      .join("\n");

    const summary = await generateLLMSummary(messagesText, undefined, personalGeminiKey);
    if (!summary) return false;

    await supabase.from("agent_chat_sessions")
      .update({ context_summary: summary.slice(0, 5000) })
      .eq("id", orphan.id);

    console.log(`${logPrefix} ✅ Healed session ${orphan.id} (${orphan.message_count} msgs → ${summary.length} char summary)`);
    return true;
  } catch (e) {
    console.error(`${logPrefix} Error healing ${orphan.id}:`, e);
    return false;
  }
}

// ═══ LEARNING CONTEXT ═══
export async function updateLearningContext(supabase: any, userId: string, toolName: string, wasSuccessful: boolean) {
  try {
    const contextKey = `tool_usage_${toolName}`;
    const { data: existing } = await supabase.from("agent_learning_context")
      .select("id, context_value, usage_count")
      .eq("user_id", userId).eq("context_type", "tool_preference").eq("context_key", contextKey)
      .maybeSingle();
    if (existing) {
      const val = existing.context_value || {};
      val.success_count = (val.success_count || 0) + (wasSuccessful ? 1 : 0);
      val.fail_count = (val.fail_count || 0) + (wasSuccessful ? 0 : 1);
      await supabase.from("agent_learning_context").update({
        context_value: val, usage_count: (existing.usage_count || 0) + 1, last_used_at: new Date().toISOString()
      }).eq("id", existing.id);
    } else {
      await supabase.from("agent_learning_context").insert({
        user_id: userId, context_type: "tool_preference", context_key: contextKey,
        context_value: { success_count: wasSuccessful ? 1 : 0, fail_count: wasSuccessful ? 0 : 1 },
        usage_count: 1, last_used_at: new Date().toISOString(),
      });
    }
  } catch (e) { console.error("Learning context error:", e); }
}

export async function upsertLearningContext(supabase: any, userId: string, contextType: string, contextKey: string, contextValue: any) {
  try {
    const { data: existing } = await supabase.from("agent_learning_context")
      .select("id, usage_count")
      .eq("user_id", userId).eq("context_type", contextType).eq("context_key", contextKey)
      .maybeSingle();
    if (existing) {
      await supabase.from("agent_learning_context").update({
        context_value: contextValue, usage_count: (existing.usage_count || 0) + 1, last_used_at: new Date().toISOString()
      }).eq("id", existing.id);
    } else {
      await supabase.from("agent_learning_context").insert({
        user_id: userId, context_type: contextType, context_key: contextKey,
        context_value: contextValue, usage_count: 1, last_used_at: new Date().toISOString(),
      });
    }
  } catch (e) { console.error("Upsert learning context error:", e); }
}

// ═══ FETCH LIVING MEMORIES ═══
export async function fetchLivingMemories(supabase: any, userId: string, _messageEmbedding?: number[]): Promise<any[]> {
  try {
    const [learningResult, factsResult, lessonsResult] = await Promise.all([
      supabase
        .from("agent_learning_context")
        .select("context_type, context_key, context_value, usage_count, last_used_at")
        .eq("user_id", userId)
        .eq("is_active", true)
        .in("context_type", ["explicit_memory", "auto_learned", "learned_preference"])
        .order("usage_count", { ascending: false })
        .limit(15),
      // FIX: switched from empty agent_user_facts → user_memories (pinned/high-confidence as live source)
      supabase
        .from("user_memories")
        .select("category, content, last_accessed, created_at")
        .eq("user_id", userId)
        .eq("is_active", true)
        .eq("scope", "personal")
        .is("scope_key", null)
        .order("pinned", { ascending: false })
        .order("priority", { ascending: false })
        .order("confidence", { ascending: false })
        .limit(10),
      supabase
        .from("agent_self_improvements")
        .select("improvement_type, insight, confidence")
        .eq("is_active", true)
        .eq("user_id", userId)
        .order("confidence", { ascending: false })
        .limit(3),
    ]);

    const memories: any[] = [];

    if (factsResult.data?.length) {
      for (const f of factsResult.data) {
        memories.push({
          category: f.category || "user_fact",
          content: f.content,
          memory_value: f.category || "memory",
          confidence: 0.95,
        });
      }
    }

    if (learningResult.data?.length) {
      for (const d of learningResult.data) {
        const value = typeof d.context_value === 'string' 
          ? d.context_value 
          : (d.context_value?.value || d.context_value?.dominant || d.context_key);
        memories.push({
          category: d.context_type || "general",
          content: value,
          memory_value: d.context_key,
          confidence: Math.min(1, 0.5 + (d.usage_count || 0) * 0.05),
        });
      }
    }

    if (lessonsResult.data?.length) {
      for (const l of lessonsResult.data) {
        memories.push({
          category: "lesson_learned",
          content: l.insight,
          memory_value: l.improvement_type,
          confidence: l.confidence || 0.6,
        });
      }
    }

    console.log(`[LivingMemory] Total: ${memories.length} (facts: ${factsResult.data?.length || 0}, learned: ${learningResult.data?.length || 0}, lessons: ${lessonsResult.data?.length || 0})`);
    return memories;
  } catch (e) {
    console.error("[LivingMemory] Fetch error:", e);
    return [];
  }
}

// ═══ ARCHIVE TO EPISODIC MEMORY ═══
const NOISE_PATTERN = /^(hi|hello|hey|ok|oke|hmm|yes|no|yeah|nope|thanks|thank you|ဟို|အင်း|ဟုတ်|ကောင်း|ရ|ဟုတ်ကဲ့|ကျေးဇူး|aya|helo)\b/i;

export async function archiveToEpisodicMemory(
  supabase: any, userId: string, sessionId: string,
  userMessage: string, botResponse: string, toolsUsed: string[],
  personalGeminiKey?: string, complexityTier?: string,
  scopeInfo?: { scope?: 'personal' | 'telegram_group'; scope_key?: string | null; source_platform?: string | null },
) {
  try {
    if (!botResponse || botResponse.length < 20) return;
    if (userMessage.length < 10 || botResponse.length < 50) return;
    if (NOISE_PATTERN.test(userMessage.trim())) return;

    const topicTags = detectTopicTags(userMessage, botResponse, toolsUsed);
    const importanceScore = scoreConversationImportance(userMessage, botResponse, toolsUsed);

    if (importanceScore < 0.4) {
      console.log(`[EpisodicMemory] SKIP entirely (importance: ${importanceScore} < 0.4)`);
      return;
    }

    const isSimpleTier = ['greeting', 'simple', 'turbo'].includes(complexityTier || '');

    let summary: string;
    const scope = scopeInfo?.scope || 'personal';
    const scopeKey = scope === 'telegram_group' ? (scopeInfo?.scope_key || null) : null;

    if (importanceScore >= 0.6 && !isSimpleTier) {
      const llmSummary = await generateCompactTurnSummary(userMessage, botResponse, toolsUsed, personalGeminiKey);
      summary = llmSummary || `User: ${userMessage.slice(0, 150)} | Bot: ${botResponse.slice(0, 250)}`;
    } else {
      summary = `User: ${userMessage.slice(0, 150)} | Bot: ${botResponse.slice(0, 250)}`;
    }

    const metadata = { tools_used: toolsUsed, importance: importanceScore, tier: complexityTier || 'moderate', timestamp: new Date().toISOString() };

    if (importanceScore >= 0.6 && !isSimpleTier) {
      // High-importance: generate embedding and write both atomically
      const embeddingText = `${userMessage.slice(0, 500)} ${botResponse.slice(0, 500)}`;
      const embedding = await generateEmbeddingForArchive(embeddingText, supabase, userId, personalGeminiKey);

      if (scope === 'telegram_group') {
        if (embedding) {
          await supabase.from("chat_memory_embeddings").insert({
            user_id: userId,
            session_id: sessionId,
            content_summary: summary,
            embedding: `[${embedding.join(",")}]`,
            importance_score: importanceScore,
            topic_tags: topicTags,
            scope,
            scope_key: scopeKey,
            source_platform: scopeInfo?.source_platform || 'telegram',
          });
        }
        console.log(`[EpisodicMemory] ✅ Group-scoped archive (importance: ${importanceScore}, group=${scopeKey})`);
        return;
      }

      // ═══ ATOMIC WRITE: Episodic + Embedding in single transaction ═══
      const { error: rpcError } = await supabase.rpc("archive_episodic_with_embedding", {
        p_user_id: userId,
        p_session_id: sessionId,
        p_content: summary,
        p_metadata: metadata,
        p_content_summary: embedding ? summary : null,
        p_embedding: embedding ? `[${embedding.join(",")}]` : null,
        p_importance_score: importanceScore,
        p_topic_tags: topicTags,
      });

      if (rpcError) {
        // FIX: Removed legacy fallback to agent_episodic_memory (no embeddings, dead-weight).
        // Single source of truth = chat_memory_embeddings only.
        console.warn(`[EpisodicMemory] Atomic RPC failed (${rpcError.message}), falling back to embeddings-only write`);
        if (embedding) {
          await supabase.from("chat_memory_embeddings").insert({
            user_id: userId, session_id: sessionId,
            content_summary: summary, embedding: `[${embedding.join(",")}]`,
            importance_score: importanceScore, topic_tags: topicTags,
          });
        }
      } else {
        console.log(`[EpisodicMemory] ✅ Atomic archive (importance: ${importanceScore}, tier: ${complexityTier || 'moderate'}, embedded: ${!!embedding}, tags: [${topicTags.join(",")}])`);
      }
    } else {
      // FIX: Low-importance turns no longer written to agent_episodic_memory (caused 802 duplicate rows).
      // If we have an embedding generator available later, importance threshold will route here too.
      // For now: skip the write entirely — low-importance content is not worth storing.
      console.log(`[EpisodicMemory] Skipped low-importance turn (importance: ${importanceScore}, tier: ${complexityTier || 'moderate'})`);
    }
  } catch (e) {
    console.error("[EpisodicMemory] Archive error:", e);
  }
}

// ═══ LLM-Compressed Turn Summary ═══
async function generateCompactTurnSummary(userMessage: string, botResponse: string, toolsUsed: string[], personalGeminiKey?: string, llmConfig?: InternalLLMConfig | null): Promise<string | null> {
  const config = llmConfig || (personalGeminiKey ? { apiKey: personalGeminiKey, endpoint: GEMINI_OPENAI_ENDPOINT, model: "gemini-2.5-flash-lite", provider: 'google' as const, headers: { "Authorization": `Bearer ${personalGeminiKey}`, "Content-Type": "application/json" } } : null);
  if (!config) return null;
  try {
    const prompt = `Compress this conversation turn into 1-2 dense factual sentences. Preserve: names, numbers, decisions, actions taken, key facts. No fluff.\n\nUser: ${userMessage.slice(0, 300)}\nBot: ${botResponse.slice(0, 400)}\nTools: ${toolsUsed.join(", ") || "none"}`;
    
    const res = await fetch(config.endpoint, {
      method: "POST", headers: config.headers,
      body: JSON.stringify({ model: config.model, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res?.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.slice(0, 400) || null;
  } catch { return null; }
}

// ═══ MEMORY EMBEDDING HELPERS ═══
async function generateEmbeddingForArchive(
  text: string, supabase: any, userId: string, personalGeminiKey?: string
): Promise<number[] | null> {
  try {
    if (personalGeminiKey) {
      const result = await callGeminiEmbeddingAPI(text, personalGeminiKey);
      if (result) return result;
    }
    return await generateEmbedding(text, supabase, userId);
  } catch (e) {
    console.error("[EpisodicMemory] Embedding generation failed:", e);
    return null;
  }
}

function detectTopicTags(userMessage: string, botResponse: string, toolsUsed: string[]): string[] {
  const combined = `${userMessage} ${botResponse}`.toLowerCase();
  const tags: string[] = [];

  const topicMap: Record<string, string[]> = {
    finance: ["ငွေ", "money", "budget", "expense", "income", "balance", "ကျပ်", "dollar", "flowstate"],
    crypto: ["bitcoin", "btc", "ethereum", "crypto", "blockchain", "wallet", "coin"],
    task: ["task", "အလုပ်", "todo", "workspace", "project", "deadline"],
    personal: ["remember", "မှတ်ထား", "ပြောခဲ့", "preference", "favorite"],
    learning: ["course", "သင်တန်း", "learn", "study", "certificate"],
    knowledge: ["article", "research", "note", "knowledge"],
    content: ["write", "ရေး", "content", "blog", "caption", "generate"],
  };

  for (const [topic, keywords] of Object.entries(topicMap)) {
    if (keywords.some(kw => combined.includes(kw))) {
      tags.push(topic);
    }
  }

  const toolTopicMap: Record<string, string> = {
    manage_flowstate: "finance",
    manage_workspace_task: "task",
    search_web: "research",
    generate_ai_content: "content",
    remember_user_fact: "personal",
    search_knowledge_base: "knowledge",
    recall_episodic_memory: "personal",
  };
  for (const tool of toolsUsed) {
    const topic = toolTopicMap[tool];
    if (topic && !tags.includes(topic)) tags.push(topic);
  }

  if (tags.length === 0) tags.push("conversation");
  return tags;
}

function scoreConversationImportance(userMessage: string, botResponse: string, toolsUsed: string[]): number {
  let score = 0.4;
  if (userMessage.length > 50) score += 0.1;
  if (botResponse.length > 200) score += 0.1;
  if (toolsUsed.length > 0) score += 0.15;
  if (/remember|decide|plan|goal|important|မှတ်ထား|ဆုံးဖြတ်|budget|deadline/i.test(userMessage)) score += 0.15;
  if (/prefer|favorite|like|dislike|want|need|ကြိုက်|မကြိုက်|လိုချင်/i.test(userMessage)) score += 0.1;
  return Math.min(1.0, Math.round(score * 100) / 100);
}

// ═══ AUTO-TAG CONTENT ═══
export async function autoTagContent(content: string, title: string, personalGeminiKey?: string, llmConfig?: InternalLLMConfig | null): Promise<string[]> {
  if (!personalGeminiKey && !llmConfig) return ["#Personal"];
  
  const config = llmConfig || { apiKey: personalGeminiKey!, endpoint: GEMINI_OPENAI_ENDPOINT, model: "gemini-2.5-flash-lite", provider: 'google' as const, headers: { "Authorization": `Bearer ${personalGeminiKey}`, "Content-Type": "application/json" } };
  const TAXONOMY = ["Finance", "AI", "Tech", "Health", "ReadingList", "Business", "Learning", "Personal", "News", "Research"];
  const tagMessages = [
    { role: "system", content: `Classify this content into 2-5 tags from ONLY this list: ${TAXONOMY.join(", ")}. Return JSON array of strings only. No explanation.` },
    { role: "user", content: `Title: ${title}\n\nContent: ${content.slice(0, 2000)}` }
  ];
  
  try {
    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify({ model: config.model, messages: tagMessages }),
    });
    if (!res?.ok) return ["#Personal"];
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "[]";
    const parsed = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || "[]");
    return (parsed as string[]).filter((t: string) => TAXONOMY.includes(t.replace("#", ""))).map((t: string) => t.startsWith("#") ? t : `#${t}`);
  } catch (e) {
    console.error("[AutoTag] Error:", e);
    return ["#Personal"];
  }
}
