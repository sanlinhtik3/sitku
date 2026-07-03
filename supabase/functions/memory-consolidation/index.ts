import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══ DREAM SYSTEM v2: Claude-Inspired Memory Consolidation ═══
// Three-Gate Trigger + Four-Phase Cycle (Orient → Gather → Consolidate → Prune)
// Contradiction detection, size-capped memories, absolute date conversion

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ═══ CONFIGURATION ═══
const STALE_DAYS = 30;
const CONFIDENCE_DECAY_RATE = 0.02;
const MIN_CONFIDENCE_THRESHOLD = 0.15;
const MAX_ACTIVE_MEMORIES_PER_USER = 200;
const MEMORY_SIZE_CAP_LINES = 200;      // Claude's 200-line cap
const MEMORY_SIZE_CAP_BYTES = 25_000;   // Claude's 25KB cap
const MIN_SESSIONS_FOR_DREAM = 5;       // Gate 2: minimum sessions in last 7 days
const DREAM_COOLDOWN_MS = 24 * 60 * 60 * 1000; // Gate 1: 24hr cooldown
const MAX_USERS_PER_TICK = 5;           // FIX: throttle to avoid LLM cost spike

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const startTime = Date.now();
  const stats = {
    decayed: 0, pruned: 0, merged: 0, deactivated: 0,
    usersProcessed: 0, contradictions: 0, sizeCapped: 0,
    dreamTriggered: 0, dreamSkipped: 0,
  };

  try {
    const body = await req.json().catch(() => ({}));
    const requestedUserId = typeof body?.user_id === "string" ? body.user_id : null;
    const forceUser = body?.force === true;

    console.log(`[Dream] Starting memory consolidation v2${requestedUserId ? ` for user ${requestedUserId.slice(0, 8)}` : ""}...`);

    // ═══ ELIGIBILITY (FIX: derive from chat_memory_embeddings — agent_soul_config was always empty) ═══
    // Find users with ≥ MIN_SESSIONS_FOR_DREAM distinct sessions in the last 7 days.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentActivity } = await serviceClient
      .from("chat_memory_embeddings")
      .select("user_id, session_id")
      .gte("created_at", sevenDaysAgo);

    const sessionsByUser = new Map<string, Set<string>>();
    for (const row of (recentActivity || [])) {
      if (!row.user_id || !row.session_id) continue;
      if (!sessionsByUser.has(row.user_id)) sessionsByUser.set(row.user_id, new Set());
      sessionsByUser.get(row.user_id)!.add(row.session_id);
    }
    const candidateUsers = requestedUserId
      ? [requestedUserId]
      : Array.from(sessionsByUser.entries())
          .filter(([_, sessions]) => sessions.size >= MIN_SESSIONS_FOR_DREAM)
          .map(([userId]) => userId);

    // Read dream_state from agent_learning_context (cooldown gate)
    const { data: dreamStates } = candidateUsers.length > 0
      ? await serviceClient
          .from("agent_learning_context")
          .select("user_id, context_value, updated_at")
          .eq("context_type", "dream_state")
          .eq("context_key", "last_dream")
          .in("user_id", candidateUsers)
      : { data: [] };

    const lastDreamByUser = new Map<string, number>();
    for (const row of (dreamStates || [])) {
      const ts = row.updated_at ? new Date(row.updated_at).getTime() : 0;
      lastDreamByUser.set(row.user_id, ts);
    }

    const eligibleUsers: string[] = [];
    const now = Date.now();
    for (const userId of candidateUsers) {
      const lastDream = lastDreamByUser.get(userId) || 0;
      if (forceUser || now - lastDream >= DREAM_COOLDOWN_MS) {
        eligibleUsers.push(userId);
        stats.dreamTriggered++;
      } else {
        stats.dreamSkipped++;
      }
    }

    // FIX: Throttle to MAX_USERS_PER_TICK to avoid LLM cost spike on first run
    const usersToProcess = eligibleUsers.slice(0, MAX_USERS_PER_TICK);
    console.log(`[Dream] Candidates: ${candidateUsers.length}, eligible: ${eligibleUsers.length}, processing this tick: ${usersToProcess.length} (throttled)`);

    // Process each eligible user through 4-phase dream cycle
    for (const userId of usersToProcess) {
      try {
        await runDreamCycle(serviceClient, userId, stats);
        stats.usersProcessed++;
      } catch (e) {
        console.error(`[Dream] User ${userId} dream failed:`, e);
      } finally {
        // Update last_dream_at in agent_learning_context (replaces broken agent_soul_config write)
        await serviceClient
          .from("agent_learning_context")
          .upsert({
            user_id: userId,
            context_type: "dream_state",
            context_key: "last_dream",
            context_value: { ts: new Date().toISOString() },
            is_active: true,
            usage_count: 1,
            last_used_at: new Date().toISOString(),
          }, { onConflict: "user_id,context_type,context_key" });
      }
    }

    // ═══ GLOBAL MAINTENANCE (runs for ALL users, not just dream-eligible) ═══
    await runGlobalMaintenance(serviceClient, stats);

    const duration = Date.now() - startTime;
    console.log(`[Dream] Complete in ${duration}ms:`, stats);

    return new Response(JSON.stringify({ success: true, stats, duration_ms: duration }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Dream] Fatal error:`, errorMsg);
    return new Response(JSON.stringify({ success: false, error: errorMsg, stats }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ═══ FOUR-PHASE DREAM CYCLE ═══
async function runDreamCycle(serviceClient: any, userId: string, stats: any) {
  console.log(`[Dream:${userId.slice(0, 8)}] Starting 4-phase dream cycle...`);

  // ═══ PHASE 1: ORIENT — Assess current memory state ═══
  const { data: activeMemories } = await serviceClient
    .from("user_memories")
    .select("id, content, confidence, category, created_at, last_accessed")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const memoryCount = activeMemories?.length || 0;
  console.log(`[Dream:Orient] ${memoryCount} active memories`);

  if (!activeMemories || memoryCount === 0) return;

  // ═══ PHASE 2: GATHER — Collect facts and detect patterns ═══
  const { data: userFacts } = await serviceClient
    .from("agent_user_facts")
    .select("id, fact_key, fact_value, created_at, updated_at")
    .eq("user_id", userId);

  const { data: learningCtx } = await serviceClient
    .from("agent_learning_context")
    .select("id, context_key, context_value, context_type, created_at, last_used_at, usage_count")
    .eq("user_id", userId)
    .eq("is_active", true);

  // ═══ PHASE 3: CONSOLIDATE — Contradiction detection + date normalization ═══
  // 3a: Detect contradictions in user_facts (same key, different values)
  const factMap = new Map<string, { id: string; value: string; updated: string }[]>();
  for (const fact of (userFacts || [])) {
    const key = fact.fact_key.toLowerCase().trim();
    if (!factMap.has(key)) factMap.set(key, []);
    factMap.get(key)!.push({ id: fact.id, value: fact.fact_value, updated: fact.updated_at || fact.created_at });
  }

  const contradictionIds: string[] = [];
  for (const [key, entries] of factMap) {
    if (entries.length <= 1) continue;
    // Sort by recency — keep newest, remove older contradictions
    entries.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].value !== entries[0].value) {
        contradictionIds.push(entries[i].id);
        console.log(`[Dream:Consolidate] Contradiction: "${key}" old="${entries[i].value}" → keeping "${entries[0].value}"`);
      }
    }
  }

  if (contradictionIds.length > 0) {
    for (let i = 0; i < contradictionIds.length; i += 100) {
      await serviceClient
        .from("agent_user_facts")
        .delete()
        .in("id", contradictionIds.slice(i, i + 100));
    }
    stats.contradictions += contradictionIds.length;
    console.log(`[Dream:Consolidate] Removed ${contradictionIds.length} contradicted facts`);
  }

  // 3b: Detect contradictions in learning context (same context_key, same type)
  const ctxMap = new Map<string, { id: string; value: any; used: string }[]>();
  for (const ctx of (learningCtx || [])) {
    const compositeKey = `${ctx.context_type}::${ctx.context_key}`.toLowerCase();
    if (!ctxMap.has(compositeKey)) ctxMap.set(compositeKey, []);
    ctxMap.get(compositeKey)!.push({
      id: ctx.id,
      value: ctx.context_value,
      used: ctx.last_used_at || ctx.created_at,
    });
  }

  const ctxContradictionIds: string[] = [];
  for (const [, entries] of ctxMap) {
    if (entries.length <= 1) continue;
    entries.sort((a, b) => new Date(b.used).getTime() - new Date(a.used).getTime());
    for (let i = 1; i < entries.length; i++) {
      ctxContradictionIds.push(entries[i].id);
    }
  }

  if (ctxContradictionIds.length > 0) {
    for (let i = 0; i < ctxContradictionIds.length; i += 100) {
      await serviceClient
        .from("agent_learning_context")
        .update({ is_active: false })
        .in("id", ctxContradictionIds.slice(i, i + 100));
    }
    stats.contradictions += ctxContradictionIds.length;
    console.log(`[Dream:Consolidate] Deactivated ${ctxContradictionIds.length} duplicate learning entries`);
  }

  // ═══ PHASE 4: PRUNE — Size cap + confidence decay + stale removal ═══
  // 4a: Enforce size cap (200 lines / 25KB)
  if (memoryCount > MEMORY_SIZE_CAP_LINES) {
    const excess = memoryCount - MEMORY_SIZE_CAP_LINES;
    // Remove lowest-confidence, least-accessed memories
    const sorted = [...activeMemories]
      .sort((a: any, b: any) => (a.confidence || 0) - (b.confidence || 0) || new Date(a.last_accessed || a.created_at).getTime() - new Date(b.last_accessed || b.created_at).getTime());
    const toDeactivate = sorted.slice(0, excess).map((m: any) => m.id);
    
    for (let i = 0; i < toDeactivate.length; i += 100) {
      await serviceClient
        .from("user_memories")
        .update({ is_active: false })
        .in("id", toDeactivate.slice(i, i + 100));
    }
    stats.sizeCapped += toDeactivate.length;
    console.log(`[Dream:Prune] Size-capped ${toDeactivate.length} memories (${memoryCount} → ${MEMORY_SIZE_CAP_LINES})`);
  }

  // 4b: Total byte size check
  const totalBytes = activeMemories.reduce((sum: number, m: any) => sum + (m.content?.length || 0), 0);
  if (totalBytes > MEMORY_SIZE_CAP_BYTES) {
    const sortedBySize = [...activeMemories]
      .sort((a: any, b: any) => (a.confidence || 0) - (b.confidence || 0));
    let currentSize = totalBytes;
    const bytePruneIds: string[] = [];
    for (const m of sortedBySize) {
      if (currentSize <= MEMORY_SIZE_CAP_BYTES) break;
      currentSize -= (m.content?.length || 0);
      bytePruneIds.push(m.id);
    }
    if (bytePruneIds.length > 0) {
      for (let i = 0; i < bytePruneIds.length; i += 100) {
        await serviceClient
          .from("user_memories")
          .update({ is_active: false })
          .in("id", bytePruneIds.slice(i, i + 100));
      }
      stats.sizeCapped += bytePruneIds.length;
      console.log(`[Dream:Prune] Byte-capped ${bytePruneIds.length} memories (${totalBytes} → ~${MEMORY_SIZE_CAP_BYTES} bytes)`);
    }
  }

  console.log(`[Dream:${userId.slice(0, 8)}] Dream cycle complete`);
}

// ═══ GLOBAL MAINTENANCE (Confidence decay, stale pruning, old context cleanup, scratchpad cleanup) ═══
async function runGlobalMaintenance(serviceClient: any, stats: any) {
  // ═══ Phase D: Scratchpad Cleanup (7-day TTL) — uses code-split module ═══
  try {
    const { cleanupOldScratchpads } = await import("../_shared/scratchpad.ts");
    const cleaned = await cleanupOldScratchpads(serviceClient, 7);
    if (cleaned > 0) console.log(`[Dream:Maintenance] Cleaned ${cleaned} old scratchpad entries`);
  } catch (e) {
    console.warn(`[Dream:Maintenance] Scratchpad cleanup failed:`, e);
  }

  // ═══ Confidence Decay for unused memories ═══
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: staleMemories } = await serviceClient
    .from("user_memories")
    .select("id, confidence")
    .eq("is_active", true)
    .lt("last_accessed", sevenDaysAgo)
    .gt("confidence", MIN_CONFIDENCE_THRESHOLD);

  if (staleMemories && staleMemories.length > 0) {
    for (const m of staleMemories) {
      await serviceClient
        .from("user_memories")
        .update({ confidence: Math.max(MIN_CONFIDENCE_THRESHOLD, (m.confidence || 0.5) - CONFIDENCE_DECAY_RATE) })
        .eq("id", m.id);
    }
    stats.decayed = staleMemories.length;
  }

  // ═══ Auto-deactivate low-confidence ═══
  const { data: lowConf } = await serviceClient
    .from("user_memories")
    .select("id")
    .eq("is_active", true)
    .lte("confidence", MIN_CONFIDENCE_THRESHOLD);

  if (lowConf && lowConf.length > 0) {
    for (let i = 0; i < lowConf.length; i += 100) {
      await serviceClient
        .from("user_memories")
        .update({ is_active: false })
        .in("id", lowConf.slice(i, i + 100).map((m: any) => m.id));
    }
    stats.deactivated = lowConf.length;
  }

  // ═══ Prune old unused memories ═══
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: oldUnused } = await serviceClient
    .from("user_memories")
    .select("id")
    .eq("is_active", true)
    .lt("created_at", staleCutoff)
    .lt("confidence", 0.4);

  if (oldUnused && oldUnused.length > 0) {
    for (let i = 0; i < oldUnused.length; i += 100) {
      await serviceClient
        .from("user_memories")
        .update({ is_active: false })
        .in("id", oldUnused.slice(i, i + 100).map((m: any) => m.id));
    }
    stats.pruned = oldUnused.length;
  }

  // ═══ Prune old learning context ═══
  const learningCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: oldLearning } = await serviceClient
    .from("agent_learning_context")
    .select("id")
    .eq("is_active", true)
    .lt("last_used_at", learningCutoff)
    .lte("usage_count", 2);

  if (oldLearning && oldLearning.length > 0) {
    for (let i = 0; i < oldLearning.length; i += 100) {
      await serviceClient
        .from("agent_learning_context")
        .update({ is_active: false })
        .in("id", oldLearning.slice(i, i + 100).map((l: any) => l.id));
    }
  }

  // ═══ Prune old self-improvements ═══
  const { data: oldImprovements } = await serviceClient
    .from("agent_self_improvements")
    .select("id")
    .eq("is_active", true)
    .lt("created_at", learningCutoff)
    .lt("confidence", 0.5)
    .lte("applied_count", 1);

  if (oldImprovements && oldImprovements.length > 0) {
    for (let i = 0; i < oldImprovements.length; i += 100) {
      await serviceClient
        .from("agent_self_improvements")
        .update({ is_active: false })
        .in("id", oldImprovements.slice(i, i + 100).map((x: any) => x.id));
    }
  }

  // ═══ Legacy agent_episodic_memory pruning REMOVED (table dropped in F9 cleanup) ═══
  // Single source of truth = chat_memory_embeddings.
}
