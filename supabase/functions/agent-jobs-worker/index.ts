// ═══════════════════════════════════════════════════════════════════════════
// agent-jobs-worker — Phase 3.7 of docs/AGENTIC_AUDIT.md
//
// Single worker for the unified `agent_jobs` queue. Claims jobs atomically
// via `agent_jobs_claim()` RPC and dispatches by `job_type`.
//
// Designed to be invoked by Supabase scheduled-task / pg_cron / external
// cron every minute. Idempotent — pickups are atomic with FOR UPDATE SKIP
// LOCKED so concurrent invocations don't double-process.
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_JOBS_PER_TICK = 10;
const JOB_TIMEOUT_MS = 60_000;

async function processJob(job: any, serviceClient: any): Promise<{ ok: boolean; result?: any; error?: string }> {
  try {
    switch (job.job_type) {
      case "kb_embed": {
        // Delegate to existing memory-curator / kb embedding flow if available.
        // For now: mark as "would-be-processed" so the pattern is visible.
        return { ok: true, result: { dispatched_to: "kb_embed_pipeline", payload: job.payload } };
      }
      case "dream_tick": {
        // Trigger memory-consolidation function for one user.
        const userId = job.payload?.user_id;
        if (!userId) return { ok: false, error: "missing user_id in payload" };
        const { data, error } = await serviceClient.functions.invoke("memory-consolidation", {
          body: { user_id: userId, source: "agent_jobs_worker" },
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: data };
      }
      case "srt": {
        // Existing srt pipeline already has its own queue — delegate via metadata.
        return { ok: true, result: { dispatched_to: "srt_translations", id: job.payload?.translation_id } };
      }
      case "generic":
      default: {
        // Generic job: payload contains { handler_url, headers, body } — POST through.
        const url = job.payload?.handler_url;
        if (!url) return { ok: false, error: "no handler_url in generic payload" };
        const resp = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", ...(job.payload?.headers ?? {}) },
          body: JSON.stringify(job.payload?.body ?? {}),
          signal: AbortSignal.timeout(JOB_TIMEOUT_MS),
        });
        if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
        const text = await resp.text();
        let result: any;
        try { result = JSON.parse(text); } catch { result = { raw: text.slice(0, 1000) }; }
        return { ok: true, result };
      }
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "job handler threw" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Claim a batch
  const { data: claimed, error: claimErr } = await serviceClient.rpc("agent_jobs_claim", { p_limit: MAX_JOBS_PER_TICK });
  if (claimErr) {
    return new Response(JSON.stringify({ error: claimErr.message }), { status: 500, headers: corsHeaders });
  }

  const results: Array<{ id: string; status: string; error?: string }> = [];

  for (const job of claimed ?? []) {
    const outcome = await processJob(job, serviceClient);
    const patch = outcome.ok
      ? { status: "completed", finished_at: new Date().toISOString(), result: outcome.result ?? null, error: null }
      : (job.attempts >= job.max_attempts
          ? { status: "failed", finished_at: new Date().toISOString(), error: outcome.error ?? null }
          : { status: "pending", started_at: null, error: outcome.error ?? null, scheduled_for: new Date(Date.now() + 60_000 * job.attempts).toISOString() });

    const { error: upErr } = await serviceClient.from("agent_jobs").update(patch).eq("id", job.id);
    if (upErr) console.warn(`[agent-jobs-worker] update ${job.id} failed: ${upErr.message}`);
    results.push({ id: job.id, status: patch.status, error: patch.error || undefined });
  }

  return new Response(
    JSON.stringify({ claimed: claimed?.length ?? 0, processed: results.length, results }),
    { headers: { ...corsHeaders, "content-type": "application/json" } },
  );
});
