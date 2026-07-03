// ═══ BeeBot Autonomy Daemon ═══
// Phase 1 Agentic Era — fires schedule-based proactive triggers.
// Invoked hourly by pg_cron. For each due trigger, opens a trajectory,
// runs the headless agent with the trigger's action_prompt, and closes
// the trajectory with outcome + duration.
//
// Hard caps: 50 triggers per run, 60 s per trigger, parallelism = 4.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { runHeadlessAgent } from "../_shared/headless-agent-runner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_TRIGGERS_PER_RUN = 50;
const PER_TRIGGER_TIMEOUT_MS = 60_000;
const PARALLELISM = 4;

// ─── Minimal cron matcher (minute hour dom mon dow) ─────────────────
// Supports: *, */N, comma list, exact int, range a-b.
function fieldMatches(field: string, value: number): boolean {
  if (field === "*") return true;
  for (const part of field.split(",")) {
    if (part.startsWith("*/")) {
      const step = parseInt(part.slice(2), 10);
      if (step > 0 && value % step === 0) return true;
    } else if (part.includes("-")) {
      const [a, b] = part.split("-").map((n) => parseInt(n, 10));
      if (!isNaN(a) && !isNaN(b) && value >= a && value <= b) return true;
    } else {
      const n = parseInt(part, 10);
      if (!isNaN(n) && n === value) return true;
    }
  }
  return false;
}

function cronMatchesNow(cron: string, tz: string): boolean {
  if (!cron) return false;
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  // Compute now in tz
  let parts: Record<string, string> = {};
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "UTC",
      hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "short",
    });
    for (const p of fmt.formatToParts(new Date())) parts[p.type] = p.value;
  } catch {
    const d = new Date();
    parts = {
      minute: String(d.getUTCMinutes()).padStart(2, "0"),
      hour: String(d.getUTCHours()).padStart(2, "0"),
      day: String(d.getUTCDate()).padStart(2, "0"),
      month: String(d.getUTCMonth() + 1).padStart(2, "0"),
      weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()],
    };
  }
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const minute = parseInt(parts.minute, 10);
  const hour = parseInt(parts.hour, 10);
  const dom = parseInt(parts.day, 10);
  const mon = parseInt(parts.month, 10);
  const dow = dowMap[parts.weekday] ?? 0;
  return fieldMatches(fields[0], minute) &&
    fieldMatches(fields[1], hour) &&
    fieldMatches(fields[2], dom) &&
    fieldMatches(fields[3], mon) &&
    fieldMatches(fields[4], dow);
}

// ─── Run one trigger end-to-end ────────────────────────────────────
async function fireTrigger(service: any, trigger: any): Promise<{ ok: boolean; error?: string }> {
  const startedAt = Date.now();
  const trajectoryId = crypto.randomUUID();
  const sessionId = crypto.randomUUID(); // synthetic — autonomous run

  // 1. Open trajectory
  await service.from("beebot_trajectories").insert({
    id: trajectoryId,
    user_id: trigger.user_id,
    trigger_id: trigger.id,
    source: "autonomous_daemon",
    task_summary: `[AUTONOMOUS] ${trigger.name}`,
    outcome: "pending",
    metadata: { trigger_name: trigger.name, schedule_cron: trigger.schedule_cron },
  });

  const augmentedPrompt =
    `[AUTONOMOUS RUN — no user is watching]\n` +
    `Trigger: ${trigger.name}\n` +
    `Goal: ${trigger.action_prompt}\n\n` +
    `Complete this goal silently using available tools. ` +
    `If you discover a reusable insight, call manage_lesson(action='add'). ` +
    `Be concise; final reply is logged but not shown to the user.`;

  try {
    const result = await Promise.race([
      runHeadlessAgent({
        supabase: service,
        userId: trigger.user_id,
        sessionId,
        userMessage: augmentedPrompt,
        sourceChannel: "autonomy_daemon",
        maxSteps: 6,
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("per_trigger_timeout")), PER_TRIGGER_TIMEOUT_MS)),
    ]);

    const outcome = result.status === "completed" ? "completed" : "failed";
    await service.from("beebot_trajectories").update({
      outcome,
      outcome_summary: result.finalContent?.slice(0, 2000) || null,
      tools_used: Array.from(new Set(result.toolCalls.map((c: any) => c.name))),
      step_count: result.steps,
      duration_ms: Date.now() - startedAt,
      completed_at: new Date().toISOString(),
      error_text: result.error || null,
      steps_taken: result.toolCalls.map((c: any) => ({ name: c.name, error: c.error || null, duration_ms: c.duration_ms })),
    }).eq("id", trajectoryId);

    // bump trigger counters
    const counterField = outcome === "completed" ? "fire_count" : "failure_count";
    const { data: cur } = await service.from("beebot_proactive_triggers")
      .select("fire_count, failure_count").eq("id", trigger.id).single();
    await service.from("beebot_proactive_triggers").update({
      last_fired_at: new Date().toISOString(),
      fire_count: outcome === "completed" ? (cur?.fire_count ?? 0) + 1 : (cur?.fire_count ?? 0),
      failure_count: outcome === "failed" ? (cur?.failure_count ?? 0) + 1 : (cur?.failure_count ?? 0),
    }).eq("id", trigger.id);

    return { ok: outcome === "completed" };
  } catch (e: any) {
    const msg = e?.message || String(e);
    await service.from("beebot_trajectories").update({
      outcome: "failed",
      error_text: msg,
      duration_ms: Date.now() - startedAt,
      completed_at: new Date().toISOString(),
    }).eq("id", trajectoryId);
    const { data: cur } = await service.from("beebot_proactive_triggers")
      .select("failure_count").eq("id", trigger.id).single();
    await service.from("beebot_proactive_triggers").update({
      last_fired_at: new Date().toISOString(),
      failure_count: (cur?.failure_count ?? 0) + 1,
    }).eq("id", trigger.id);
    return { ok: false, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const targetTriggerId: string | null = body?.trigger_id ?? null;

  // Fetch candidate triggers
  let q = service.from("beebot_proactive_triggers")
    .select("id, user_id, name, action_prompt, trigger_type, schedule_cron, schedule_tz, is_active")
    .eq("is_active", true)
    .limit(MAX_TRIGGERS_PER_RUN * 4); // pre-filter buffer
  if (targetTriggerId) q = q.eq("id", targetTriggerId);
  const { data: candidates, error } = await q;

  if (error) {
    console.error("[AutonomyDaemon] fetch error:", error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const due = (candidates || []).filter((t: any) => {
    if (targetTriggerId) return true; // manual fire skips cron check
    if (t.trigger_type !== "schedule") return false;
    return cronMatchesNow(t.schedule_cron || "", t.schedule_tz || "Asia/Yangon");
  }).slice(0, MAX_TRIGGERS_PER_RUN);

  console.log(`[AutonomyDaemon] candidates=${candidates?.length ?? 0} due=${due.length}`);

  // Run with bounded parallelism
  let completed = 0, failed = 0;
  for (let i = 0; i < due.length; i += PARALLELISM) {
    const batch = due.slice(i, i + PARALLELISM);
    const results = await Promise.all(batch.map((t: any) =>
      fireTrigger(service, t).catch((e) => ({ ok: false, error: String(e?.message || e) }))
    ));
    for (const r of results) r.ok ? completed++ : failed++;
  }

  return new Response(
    JSON.stringify({ ok: true, scanned: candidates?.length ?? 0, fired: due.length, completed, failed }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
