import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ═══ DAILY MEMORY CONSOLIDATION WORKER ═══
// Supports: today (default), single date, or date range backfill

function getDateRange(body: any): string[] {
  const dates: string[] = [];

  if (body?.date_range?.start && body?.date_range?.end) {
    const start = new Date(body.date_range.start + "T00:00:00Z");
    const end = new Date(body.date_range.end + "T00:00:00Z");
    if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error("Invalid date_range format");
    if (end < start) throw new Error("date_range.end must be >= date_range.start");
    const maxDays = 90;
    const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (diffDays > maxDays) throw new Error(`date_range exceeds ${maxDays} days limit`);
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(d.toISOString().split("T")[0]);
    }
  } else if (body?.date) {
    const d = new Date(body.date + "T00:00:00Z");
    if (isNaN(d.getTime())) throw new Error("Invalid date format");
    dates.push(body.date);
  } else {
    dates.push(new Date().toISOString().split("T")[0]);
  }

  return dates;
}

async function consolidateDate(supabase: any, targetDate: string) {
  const nextDate = new Date(targetDate + "T00:00:00Z");
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const nextDateStr = nextDate.toISOString().split("T")[0];

  const { data: sessions, error: sessErr } = await supabase
    .from("agent_chat_sessions")
    .select("id, user_id, context_summary, title, message_count, created_at")
    .gte("created_at", `${targetDate}T00:00:00Z`)
    .lt("created_at", `${nextDateStr}T00:00:00Z`)
    .not("context_summary", "is", null)
    .order("created_at", { ascending: true });

  if (sessErr) throw sessErr;
  if (!sessions || sessions.length === 0) {
    return { date: targetDate, sessions: 0, users_processed: 0, users_skipped: 0 };
  }

  const userSessionMap = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const existing = userSessionMap.get(session.user_id) || [];
    existing.push(session);
    userSessionMap.set(session.user_id, existing);
  }

  let consolidated = 0;
  let skipped = 0;

  for (const [userId, userSessions] of userSessionMap.entries()) {
    try {
      const { data: existingLog } = await supabase
        .from("agent_daily_logs")
        .select("id, content")
        .eq("user_id", userId)
        .eq("log_date", targetDate)
        .maybeSingle();

      const sessionEntries = userSessions.map((s: any, i: number) => {
        const time = new Date(s.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
        const summary = typeof s.context_summary === "string" ? s.context_summary : JSON.stringify(s.context_summary);
        return `### Session ${i + 1} (${time}, ${s.message_count || 0} msgs)\n**${s.title || "Untitled"}**\n${summary}`;
      });

      const dailyContent = `# Daily Log — ${targetDate}\n\n**Sessions: ${userSessions.length}** | **Total Messages: ${userSessions.reduce((sum: number, s: any) => sum + (s.message_count || 0), 0)}**\n\n${sessionEntries.join("\n\n---\n\n")}`;

      if (existingLog) {
        await supabase.from("agent_daily_logs").update({ content: dailyContent, updated_at: new Date().toISOString() }).eq("id", existingLog.id);
      } else {
        await supabase.from("agent_daily_logs").insert({ user_id: userId, log_date: targetDate, content: dailyContent });
      }
      consolidated++;
    } catch (userErr) {
      console.error(`[DailyConsolidation] Error for user ${userId} on ${targetDate}:`, userErr);
      skipped++;
    }
  }

  return { date: targetDate, sessions: sessions.length, users_processed: consolidated, users_skipped: skipped };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let body: any = {};
    try { body = await req.json(); } catch { /* no body = default to today */ }

    const targetDates = getDateRange(body);
    console.log(`[DailyConsolidation] Processing ${targetDates.length} date(s): ${targetDates[0]}${targetDates.length > 1 ? ` → ${targetDates[targetDates.length - 1]}` : ""}`);

    const results = [];
    for (const date of targetDates) {
      const result = await consolidateDate(supabase, date);
      results.push(result);
      if (result.users_processed > 0) {
        console.log(`[DailyConsolidation] ${date}: ${result.users_processed} users, ${result.sessions} sessions`);
      }
    }

    const totals = results.reduce((acc, r) => ({
      total_sessions: acc.total_sessions + r.sessions,
      total_users_processed: acc.total_users_processed + r.users_processed,
      total_users_skipped: acc.total_users_skipped + r.users_skipped,
    }), { total_sessions: 0, total_users_processed: 0, total_users_skipped: 0 });

    return new Response(JSON.stringify({
      success: true,
      dates_processed: targetDates.length,
      ...totals,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("[DailyConsolidation] Fatal error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
