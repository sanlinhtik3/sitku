// ═══ MEMORY CURATOR BACKFILL ═══
// One-shot cleanup: runs all existing user_memories through Curator pipeline.
// Idempotent. Supports dry_run mode.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isTrivial, normalize, findSemanticMatch, scoreCandidate, embedText,
  type CandidateMemory,
} from "../_shared/curator-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BackfillRequest {
  user_id?: string;       // if omitted, runs for all users (admin only)
  dry_run?: boolean;
  limit?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = (await req.json().catch(() => ({}))) as BackfillRequest;

    // Auth: require valid JWT for non-admin scope
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "auth required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.slice(7);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "invalid auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default to caller's user_id
    let targetUserId = body.user_id || user.id;

    // If targeting a different user, must be admin
    if (targetUserId !== user.id) {
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "admin required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const dryRun = body.dry_run === true;
    const limit = Math.min(body.limit || 200, 500);

    // Fetch active memories
    const { data: memories, error: fetchErr } = await supabase
      .from("user_memories")
      .select("id, category, content, confidence, pinned, normalized_key, embedding, source_session_id")
      .eq("user_id", targetUserId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (fetchErr) throw fetchErr;
    if (!memories?.length) {
      return new Response(JSON.stringify({ success: true, processed: 0, dry_run: dryRun }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve API key
    let apiKey = "";
    const { data: aiSettings } = await supabase
      .from("ai_user_settings").select("gemini_api_key")
      .eq("user_id", targetUserId).maybeSingle();
    if (aiSettings?.gemini_api_key) apiKey = aiSettings.gemini_api_key;
    if (!apiKey) apiKey = Deno.env.get("LOVABLE_API_KEY") || "";

    const stats = { rejected: 0, normalized: 0, merged: 0, pinned: 0, scored: 0, errors: 0 };
    const actions: any[] = [];

    // Track processed IDs for dedupe within this run
    const processedKeys = new Map<string, string>(); // normalized_key → memory_id (kept)

    for (const m of memories) {
      try {
        const candidate: CandidateMemory = {
          category: m.category,
          content: m.content,
          source_session_id: m.source_session_id,
          embedding: typeof m.embedding === "string" ? JSON.parse(m.embedding) : m.embedding,
        };

        // Step 1: triviality
        const triv = isTrivial(candidate);
        if (triv.trivial) {
          stats.rejected++;
          actions.push({ id: m.id, action: "deactivate", reason: triv.reason });
          if (!dryRun) {
            await supabase.from("user_memories")
              .update({ is_active: false, curator_reason: `backfill_trivial:${triv.reason}` })
              .eq("id", m.id);
          }
          continue;
        }

        // Step 2: normalize
        const { key: normKey, content: normContent } = normalize(candidate);
        const contentChanged = normContent !== m.content;
        const keyChanged = normKey !== m.normalized_key;

        // In-run dedupe by normalized key
        if (processedKeys.has(normKey)) {
          stats.merged++;
          const keptId = processedKeys.get(normKey)!;
          actions.push({ id: m.id, action: "merge", into: keptId, reason: "dup_normalized_key" });
          if (!dryRun) {
            await supabase.from("user_memories")
              .update({ is_active: false, curator_reason: "backfill_dup_merged" })
              .eq("id", m.id);
            await supabase.from("user_memories")
              .update({ merged_from: [m.id], last_accessed: new Date().toISOString() })
              .eq("id", keptId);
          }
          continue;
        }

        // Ensure embedding for semantic dedupe against OTHER memories
        if (!candidate.embedding && apiKey) {
          candidate.embedding = await embedText(normContent, apiKey);
        }

        // Cross-check with other already-processed memories via DB
        const match = await findSemanticMatch(supabase, targetUserId, candidate, normKey);
        if (match && match.memory_id !== m.id && match.similarity >= 0.88) {
          stats.merged++;
          actions.push({ id: m.id, action: "merge", into: match.memory_id, sim: match.similarity });
          if (!dryRun) {
            await supabase.from("user_memories")
              .update({ is_active: false, curator_reason: "backfill_semantic_dup" })
              .eq("id", m.id);
          }
          continue;
        }

        // Step 3: score
        const score = await scoreCandidate(candidate, apiKey);
        stats.scored++;

        const updates: any = {};
        if (contentChanged) updates.content = normContent;
        if (keyChanged) updates.normalized_key = normKey;
        updates.confidence = score.confidence;
        updates.curator_score = score.confidence;
        updates.curator_reason = `backfill:${score.reason}`;
        if (candidate.embedding && !m.embedding) updates.embedding = candidate.embedding;
        if (score.suggested_pin && !m.pinned) {
          updates.pinned = true;
          stats.pinned++;
        }
        if (contentChanged) stats.normalized++;

        actions.push({ id: m.id, action: "update", changes: Object.keys(updates) });

        if (!dryRun) {
          await supabase.from("user_memories").update(updates).eq("id", m.id);
        }

        processedKeys.set(normKey, m.id);
      } catch (e: any) {
        stats.errors++;
        console.error(`[Backfill] memory ${m.id} failed:`, e.message);
      }
    }

    // Log a summary decision
    if (!dryRun) {
      await supabase.from("curator_decisions").insert({
        user_id: targetUserId,
        candidate_content: `[BACKFILL] ${memories.length} memories processed`,
        candidate_category: "backfill",
        decision: "update",
        reason: JSON.stringify(stats),
      });
    }

    return new Response(
      JSON.stringify({ success: true, dry_run: dryRun, total: memories.length, stats, actions: actions.slice(0, 50) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[Backfill] fatal:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
