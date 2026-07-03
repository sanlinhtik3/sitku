// Cognitive Architecture v2 — Background Maintenance Worker
// Hourly via pg_cron. For each active user (last 24h chat activity):
//   1. Refresh user_context_state (memory synthesis / predictive baseline)
//   2. Prune stale low-value reflexive lessons
// No user-facing UI. Cheap, idempotent, capped at 100 users per run.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getOrSynthesizeUserContextState } from "../_shared/cognitive/context-synthesizer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const targetUserId: string | null = body?.user_id ?? null;

  let userIds: string[] = [];
  if (targetUserId) {
    userIds = [targetUserId];
  } else {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: actives } = await service
      .from("agent_chat_messages")
      .select("user_id")
      .gte("created_at", since)
      .limit(2000);
    userIds = Array.from(new Set((actives ?? []).map((r: any) => r.user_id))).slice(0, 100);
  }

  console.log(`[CognitiveMaintenance] processing ${userIds.length} users`);

  let synthesized = 0, synthFailed = 0;
  for (const uid of userIds) {
    try {
      const res = await getOrSynthesizeUserContextState(service, uid, { forceRefresh: true });
      if (res) synthesized++; else synthFailed++;
    } catch (e) {
      synthFailed++;
      console.warn(`[CognitiveMaintenance] synth ${uid} failed:`, (e as Error).message);
    }
  }

  let pruned = 0;
  try {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { data: del } = await service
      .from("reflexive_learning")
      .delete()
      .lte("created_at", cutoff)
      .eq("hits", 0)
      .select("id");
    pruned = del?.length ?? 0;
  } catch (e) {
    console.warn("[CognitiveMaintenance] prune failed:", (e as Error).message);
  }

  return new Response(
    JSON.stringify({ ok: true, processed: userIds.length, synthesized, synthFailed, pruned }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
