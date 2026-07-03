import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { runPromptWithOrchestrator, summarizeMarkdown } from "./orchestrator-runner.ts";
import { runHeadlessAgent } from "../_shared/headless-agent-runner.ts";
import { sanitizeForChannel } from "../_shared/content-sanitizer.ts";
import { nextCronFires, parseSchedule, isScheduleError } from "../_shared/schedule-parser.ts";
import {
  buildAutomationPrompt,
  buildAutomationPromptAsync,
  summarizePrior,
  type PriorRunSummary,
  type IntentOverride,
} from "./automation-prompt-builder.ts";
import { evaluateQuality, type QualityGateResult } from "./quality-gate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type HeartbeatRow = {
  id: string;
  user_id: string;
  display_name: string;
  task_type: string;
  trigger_type: "cron" | "event" | "hybrid";
  cron_expression: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  is_active: boolean;
  action_count: number | null;
  task_config: Record<string, any> | null;
  last_status: string | null;
  last_result: Record<string, any> | null;
};

type ExecutionResult = {
  heartbeat_id: string;
  status: "success" | "skipped" | "failed" | "running";
  message: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(clampNumber(value, fallback, min, max));
}

function parseJsonSafely(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function isOneOffHeartbeat(heartbeat: HeartbeatRow): boolean {
  const cfg = heartbeat.task_config || {};
  return cfg?.schedule_type === "one_off" || !heartbeat.cron_expression;
}

// ═══════════════════════════════════════════════════════════════════
// 🔍 TOOL-USAGE INTROSPECTION
// Reads autonomous_task_steps to verify what the agent actually did,
// so the quality gate can penalise freshness violations accurately.
// ═══════════════════════════════════════════════════════════════════

const SEARCH_TOOL_RX =
  /^(?:search_web|web_search|deep_research|browse_url|fetch_external_api|fetch_url|scrape_url|search_news|google_search|bing_search)$/i;
const DATA_TOOL_RX =
  /^(?:manage_flowstate|manage_workspace_task|search_knowledge_base|recall_episodic_memory|recall_user_facts|get_user_info|manage_notion|manage_facebook_page|analyze_data|get_app_navigation)$/i;

interface ToolUsageReport {
  usedSearchTool: boolean;
  usedDataTool: boolean;
  toolsInvoked: string[];
  successfulToolSteps: number;
  failedToolSteps: number;
}

async function introspectToolUsage(supabase: any, taskId: string | null): Promise<ToolUsageReport> {
  const empty: ToolUsageReport = {
    usedSearchTool: false,
    usedDataTool: false,
    toolsInvoked: [],
    successfulToolSteps: 0,
    failedToolSteps: 0,
  };
  if (!taskId) return empty;
  try {
    const { data, error } = await supabase
      .from("autonomous_task_steps")
      .select("tool, status")
      .eq("task_id", taskId)
      .not("tool", "is", null);
    if (error || !data) return empty;
    const seen = new Set<string>();
    let usedSearch = false;
    let usedData = false;
    let okSteps = 0;
    let failSteps = 0;
    for (const row of data as Array<{ tool: string | null; status: string | null }>) {
      const tool = (row.tool || "").trim();
      if (!tool) continue;
      seen.add(tool);
      if (SEARCH_TOOL_RX.test(tool)) usedSearch = true;
      if (DATA_TOOL_RX.test(tool)) usedData = true;
      const st = (row.status || "").toLowerCase();
      if (st === "completed" || st === "success" || st === "done") okSteps++;
      else if (st === "failed" || st === "error") failSteps++;
    }
    return {
      usedSearchTool: usedSearch,
      usedDataTool: usedData,
      toolsInvoked: Array.from(seen),
      successfulToolSteps: okSteps,
      failedToolSteps: failSteps,
    };
  } catch (e) {
    console.warn(`[heartbeat] introspectToolUsage failed for task ${taskId}:`, (e as any)?.message);
    return empty;
  }
}

// Maximum auto re-fires for a one-off task whose retry also failed quality.
// Each re-fire schedules ~5 minutes out, capped to keep load bounded.
const MAX_REFIRE_ATTEMPTS = 3;
const REFIRE_DELAY_MS = 5 * 60 * 1000;

function parseCronValue(raw: string, isDayOfWeek = false): number {
  const value = Number(raw);
  if (Number.isNaN(value)) return NaN;
  if (isDayOfWeek && value === 7) return 0;
  return value;
}

function matchCronField(
  field: string,
  value: number,
  min: number,
  max: number,
  isDayOfWeek = false,
): boolean {
  if (!field || field === "*") return true;

  const parts = field.split(",").map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes("/")) {
      const [base, stepRaw] = part.split("/");
      const step = Number(stepRaw);
      if (Number.isNaN(step) || step <= 0) continue;

      let rangeStart = min;
      let rangeEnd = max;

      if (base && base !== "*") {
        if (base.includes("-")) {
          const [startRaw, endRaw] = base.split("-");
          rangeStart = parseCronValue(startRaw, isDayOfWeek);
          rangeEnd = parseCronValue(endRaw, isDayOfWeek);
        } else {
          rangeStart = parseCronValue(base, isDayOfWeek);
          rangeEnd = max;
        }
      }

      if (
        Number.isNaN(rangeStart) ||
        Number.isNaN(rangeEnd) ||
        value < rangeStart ||
        value > rangeEnd
      ) {
        continue;
      }

      if ((value - rangeStart) % step === 0) return true;
      continue;
    }

    if (part.includes("-")) {
      const [startRaw, endRaw] = part.split("-");
      const start = parseCronValue(startRaw, isDayOfWeek);
      const end = parseCronValue(endRaw, isDayOfWeek);
      if (!Number.isNaN(start) && !Number.isNaN(end) && value >= start && value <= end) {
        return true;
      }
      continue;
    }

    const exact = parseCronValue(part, isDayOfWeek);
    if (!Number.isNaN(exact) && value === exact) return true;
  }

  return false;
}

function cronMatchesNowUtc(cronExpression: string, now: Date): boolean {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minuteField, hourField, dayField, monthField, weekDayField] = parts;

  return (
    matchCronField(minuteField, now.getUTCMinutes(), 0, 59) &&
    matchCronField(hourField, now.getUTCHours(), 0, 23) &&
    matchCronField(dayField, now.getUTCDate(), 1, 31) &&
    matchCronField(monthField, now.getUTCMonth() + 1, 1, 12) &&
    matchCronField(weekDayField, now.getUTCDay(), 0, 6, true)
  );
}

function shouldRunHeartbeat(heartbeat: HeartbeatRow, now: Date, isDirectTarget: boolean, forceRun: boolean): boolean {
  if (forceRun) return true;

  // ═══ Staleness Guard: force-fail tasks stuck "running" >10 minutes ═══
  if (heartbeat.last_status === "running") {
    const lastResult = heartbeat.last_result || {};
    const executedAt = lastResult.executed_at ? new Date(lastResult.executed_at).getTime() : 0;
    const staleThresholdMs = 20 * 60 * 1000; // 20 minutes — headless brain may take multiple agentic steps
    if (executedAt > 0 && (now.getTime() - executedAt) > staleThresholdMs) {
      // Will be force-failed in reconciliation below; allow re-run
      return true;
    }
    return false;
  }

  if (!heartbeat.is_active) return false;

  // Event-driven heartbeats should run when called directly by id (webhook/manual trigger).
  if (isDirectTarget && heartbeat.trigger_type === "event") return true;

  if (heartbeat.cron_expression) {
    if (isDirectTarget) return true;
    if (!cronMatchesNowUtc(heartbeat.cron_expression, now)) return false;
    // ═══ Per-minute idempotency: skip if already ran in this same UTC minute ═══
    // Prevents duplicate fires when cron tick overlaps or pg_net retries within 60s.
    if ((heartbeat as any).last_run_at) {
      const lastRunMs = new Date((heartbeat as any).last_run_at as string).getTime();
      if (!Number.isNaN(lastRunMs)) {
        const lastRunMinuteFloor = Math.floor(lastRunMs / 60000);
        const nowMinuteFloor = Math.floor(now.getTime() / 60000);
        if (lastRunMinuteFloor === nowMinuteFloor) return false;
      }
    }
    return true;
  }

  // One-off fallback: run once next_run_at is reached.
  if (heartbeat.next_run_at) {
    const nextRun = new Date(heartbeat.next_run_at);
    if (Number.isNaN(nextRun.getTime())) return false;
    return nextRun.getTime() <= now.getTime();
  }

  // Direct target fallback (non-cron, non-date).
  return isDirectTarget;
}

async function fetchAutonomousTaskSnapshot(supabase: any, taskId: string) {
  const { data, error } = await supabase
    .from("autonomous_tasks")
    .select("status, result, error, progress_pct, current_step, total_steps")
    .eq("id", taskId)
    .maybeSingle();

  if (error) throw error;
  return data as {
    status: string;
    result: string | null;
    error: string | null;
    progress_pct: number | null;
    current_step: number | null;
    total_steps: number | null;
  } | null;
}

async function waitForAutonomousSettlement(
  supabase: any,
  taskId: string,
  timeoutMs = 45_000,
  pollIntervalMs = 3_000,
) {
  const startedAt = Date.now();
  let lastSnapshot: Awaited<ReturnType<typeof fetchAutonomousTaskSnapshot>> = null;

  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await fetchAutonomousTaskSnapshot(supabase, taskId);
    if (snapshot) {
      lastSnapshot = snapshot;
      if (snapshot.status === "completed" || snapshot.status === "failed") {
        return snapshot;
      }
    }
    await sleep(pollIntervalMs);
  }

  return lastSnapshot;
}

async function reconcileRunningHeartbeat(
  supabase: any,
  heartbeat: HeartbeatRow,
  nowIso: string,
): Promise<ExecutionResult | null> {
  if (heartbeat.last_status !== "running") return null;

  const existing = heartbeat.last_result || {};
  const autonomousTaskId = typeof existing.autonomous_task_id === "string" ? existing.autonomous_task_id : null;
  if (!autonomousTaskId) return null;

  const snapshot = await fetchAutonomousTaskSnapshot(supabase, autonomousTaskId);
  if (!snapshot) return null;

  if (snapshot.status === "completed") {
    const completedPayload = {
      ...existing,
      autonomous_status: "completed",
      full_result: snapshot.result,
      content_preview: snapshot.result ? summarizeMarkdown(snapshot.result, 900) : null,
      summary: snapshot.result ? summarizeMarkdown(snapshot.result, 320) : existing.summary,
      progress_pct: snapshot.progress_pct,
      steps_completed: snapshot.current_step,
      total_steps: snapshot.total_steps,
      has_actionable_content: !!snapshot.result,
      completed_at: nowIso,
    };

    // Recurring schedule maintenance on recovery completion path too
    const recoveryPatch: { next_run_at?: string | null; cron_expression?: string; task_config?: any } = {};
    if (heartbeat.cron_expression) {
      const maint = computeRecurringMaintenance(heartbeat, new Date());
      if (maint.nextRunAt !== null) recoveryPatch.next_run_at = maint.nextRunAt;
      if (maint.recalculatedCron) recoveryPatch.cron_expression = maint.recalculatedCron;
      if (maint.nextRunAt || maint.nextRunLocal) {
        recoveryPatch.task_config = {
          ...(heartbeat.task_config || {}),
          next_run_at_utc: maint.nextRunAt,
          next_run_at_local: maint.nextRunLocal,
        };
      }
    }

    await supabase
      .from("agent_heartbeats")
      .update({ last_status: "success", last_result: completedPayload, ...recoveryPatch })
      .eq("id", heartbeat.id);

    await supabase.from("agent_heartbeat_logs").insert({
      heartbeat_id: heartbeat.id,
      user_id: heartbeat.user_id,
      status: "success",
      result: completedPayload,
    });

    return {
      heartbeat_id: heartbeat.id,
      status: "success",
      message: `Recovered completed task: ${heartbeat.display_name}`,
    };
  }

  if (snapshot.status === "failed") {
    const failedPayload = {
      ...existing,
      autonomous_status: "failed",
      error: snapshot.error || "Autonomous execution failed",
      progress_pct: snapshot.progress_pct,
      steps_completed: snapshot.current_step,
      total_steps: snapshot.total_steps,
      completed_at: nowIso,
    };

    const { error: updateErr } = await supabase
      .from("agent_heartbeats")
      .update({ last_status: "failed", last_result: failedPayload })
      .eq("id", heartbeat.id);
    if (updateErr) console.error(`[heartbeat] Failed to update heartbeat ${heartbeat.id} to failed:`, updateErr.message);

    const { error: logErr } = await supabase.from("agent_heartbeat_logs").insert({
      heartbeat_id: heartbeat.id,
      user_id: heartbeat.user_id,
      status: "failed",
      result: failedPayload,
    });
    if (logErr) console.error(`[heartbeat] Failed to insert failed log for ${heartbeat.id}:`, logErr.message);

    return {
      heartbeat_id: heartbeat.id,
      status: "failed",
      message: `Recovered failed task: ${heartbeat.display_name}`,
    };
  }

  // ═══ Staleness Guard: force-fail tasks stuck "running" — 15 min for telegram, 10 min default ═══
  const executedAt = existing.executed_at ? new Date(existing.executed_at).getTime() : 0;
  const isTelegramDelivery = existing?.delivery_target === "telegram" || existing?.task_config?.delivery_target === "telegram";
  // Headless brain runs the full BeeBot agent loop (memory fan-out + multiple
  // tool steps); give it more headroom than the legacy thin orchestrator.
  const staleThresholdMs = isTelegramDelivery ? 25 * 60 * 1000 : 20 * 60 * 1000;
  if (executedAt > 0 && (Date.now() - executedAt) > staleThresholdMs) {
    const stalePayload = {
      ...existing,
      autonomous_status: "failed",
      error: `Task timed out — stuck in running state for >${Math.round(staleThresholdMs / 60000)} minutes`,
      progress_pct: snapshot?.progress_pct ?? existing.progress_pct,
      steps_completed: snapshot?.current_step ?? existing.steps_completed,
      total_steps: snapshot?.total_steps ?? existing.total_steps,
      completed_at: nowIso,
    };

    const { error: staleUpdateErr } = await supabase
      .from("agent_heartbeats")
      .update({ last_status: "failed", last_result: stalePayload })
      .eq("id", heartbeat.id);
    if (staleUpdateErr) console.error(`[heartbeat] Stale guard update failed for ${heartbeat.id}:`, staleUpdateErr.message);

    const { error: staleLogErr } = await supabase.from("agent_heartbeat_logs").insert({
      heartbeat_id: heartbeat.id,
      user_id: heartbeat.user_id,
      status: "failed",
      result: stalePayload,
    });
    if (staleLogErr) console.error(`[heartbeat] Stale guard log failed for ${heartbeat.id}:`, staleLogErr.message);

    return {
      heartbeat_id: heartbeat.id,
      status: "failed",
      message: `Force-failed stale task: ${heartbeat.display_name}`,
    };
  }

  // Still running: keep heartbeat metadata fresh without spamming logs.
  await supabase
    .from("agent_heartbeats")
    .update({
      last_result: {
        ...existing,
        autonomous_status: snapshot.status,
        progress_pct: snapshot.progress_pct,
        steps_completed: snapshot.current_step,
        total_steps: snapshot.total_steps,
        updated_at: nowIso,
      },
    })
    .eq("id", heartbeat.id);

  return null;
}

// ═══ Recurring schedule maintenance: next_run_at advancement + DST self-heal ═══
// Returns { nextRunAt, recalculatedCron, nextRunLocal } — caller patches the heartbeat row.
function formatLocalForTz(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz, weekday: "short", year: "numeric", month: "short",
      day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function computeRecurringMaintenance(heartbeat: HeartbeatRow, now: Date): { nextRunAt: string | null; recalculatedCron: string | null; nextRunLocal: string | null } {
  if (!heartbeat.cron_expression) return { nextRunAt: null, recalculatedCron: null, nextRunLocal: null };

  const cfg = heartbeat.task_config || {};
  let cronToUse = heartbeat.cron_expression;
  let recalculatedCron: string | null = null;

  // DST self-heal: if we have the original local intent, re-derive the UTC cron
  // from current TZ offset. This auto-corrects on DST transitions for non-Yangon users.
  const originalRecurrence = cfg.original_recurrence as string | undefined;
  const originalLocalTime = cfg.original_local_time as string | undefined;
  const originalTz = cfg.original_timezone as string | undefined;
  if (originalLocalTime && originalTz && originalRecurrence) {
    try {
      const reparsed = parseSchedule({
        recurrence: originalRecurrence as any,
        at_time: originalLocalTime,
        weekdays: cfg.original_weekdays || undefined,
        day_of_month: cfg.original_day_of_month || undefined,
      }, originalTz);
      if (!isScheduleError(reparsed) && reparsed.cron_expression_utc && reparsed.cron_expression_utc !== heartbeat.cron_expression) {
        cronToUse = reparsed.cron_expression_utc;
        recalculatedCron = reparsed.cron_expression_utc;
      }
    } catch (e) {
      console.warn(`[heartbeat] DST recalc failed for ${heartbeat.id}:`, (e as Error).message);
    }
  }

  // Honor end_at_utc cap
  const endCap = cfg.end_at_utc ? new Date(cfg.end_at_utc).getTime() : null;

  try {
    const fires = nextCronFires(cronToUse, now, 1);
    if (fires.length === 0) return { nextRunAt: null, recalculatedCron, nextRunLocal: null };
    const next = fires[0];
    if (endCap !== null && next.getTime() > endCap) return { nextRunAt: null, recalculatedCron, nextRunLocal: null };
    const tz = originalTz || "UTC";
    return { nextRunAt: next.toISOString(), recalculatedCron, nextRunLocal: formatLocalForTz(next, tz) };
  } catch (e) {
    console.warn(`[heartbeat] nextCronFires failed for ${heartbeat.id}:`, (e as Error).message);
    return { nextRunAt: null, recalculatedCron, nextRunLocal: null };
  }
}

// ═══ SESSION ISOLATION: Scheduled tasks get their own dedicated session ═══
// This prevents heartbeat output from appearing in the user's active chat.
const SCHEDULED_SESSION_TITLE = "🐝 Scheduled Tasks";

async function resolveSessionId(
  supabase: any,
  userId: string,
  heartbeatId?: string | null,
  displayName?: string | null,
): Promise<string> {
  // ── Per-task stable session (preferred) ──
  // Each heartbeat gets its OWN agent_chat_sessions row, reused on every
  // fire. Gives BeeBot continuity across runs ("last week's report said X,
  // this week…") without polluting the user's normal chat sessions.
  // Discovery key: title prefix `[task:<heartbeatId>]` — works without
  // a schema migration since the title column already exists.
  if (heartbeatId) {
    const taskTitleTag = `[task:${heartbeatId}]`;
    const { data: existing, error: existingErr } = await supabase
      .from("agent_chat_sessions")
      .select("id")
      .eq("user_id", userId)
      .ilike("title", `${taskTitleTag}%`)
      .limit(1)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing?.id) return existing.id;

    const safeName = (displayName || "Scheduled task").slice(0, 80);
    const { data: created, error: createErr } = await supabase
      .from("agent_chat_sessions")
      .insert({
        user_id: userId,
        title: `${taskTitleTag} ${safeName}`,
        is_active: false, // hidden from "current chat" surfaces by default
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (createErr) throw createErr;
    return created.id;
  }

  // ── Fallback: legacy shared "Scheduled Tasks" bucket ──
  // Used only when caller did not supply a heartbeatId (e.g. ad-hoc).
  const { data: scheduledSession, error: lookupError } = await supabase
    .from("agent_chat_sessions")
    .select("id")
    .eq("user_id", userId)
    .or(`title.eq.${SCHEDULED_SESSION_TITLE},title.eq.Scheduled Tasks`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (scheduledSession?.id) return scheduledSession.id;

  const { data: createdSession, error: createError } = await supabase
    .from("agent_chat_sessions")
    .insert({
      user_id: userId,
      title: SCHEDULED_SESSION_TITLE,
      is_active: false,
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (createError) throw createError;
  return createdSession.id;
}

async function processHeartbeat(
  supabase: any,
  heartbeat: HeartbeatRow,
  sessionId: string,
  nowIso: string,
  triggerSource: "cron_dispatch" | "manual_trigger" | "event_trigger",
  cachedContext?: { soulText: string | null; customInstructions: string | null; mode: string },
): Promise<ExecutionResult> {
  const taskConfig = heartbeat.task_config || {};
  const rawPrompt = taskConfig?.prompt || heartbeat.display_name;
  const oneOff = isOneOffHeartbeat(heartbeat);
  const taskStartedAt = Date.now();
  const deliveryTarget: "telegram" | "in_app" =
    taskConfig?.delivery_target === "telegram" ? "telegram" : "in_app";
  const userTimezone: string =
    (typeof taskConfig?.original_timezone === "string" && taskConfig.original_timezone) ||
    (typeof taskConfig?.user_timezone === "string" && taskConfig.user_timezone) ||
    "UTC";
  const scheduleKind: string =
    taskConfig?.schedule_type === "one_off" || oneOff ? "one_off" : "recurring";
  const selfHealEnabled = taskConfig?.self_heal !== false;
  const qualityDeliveryFloor = clampInteger(taskConfig?.quality_floor, 50, 40, 95);
  const maxRefireAttempts = selfHealEnabled
    ? clampInteger(taskConfig?.max_refire_attempts, MAX_REFIRE_ATTEMPTS, 0, 5)
    : 0;
  const agenticProfile =
    typeof taskConfig?.agentic_profile === "string" ? taskConfig.agentic_profile : "beebot_agentic_era";
  const autonomyLevel =
    typeof taskConfig?.autonomy_level === "string" ? taskConfig.autonomy_level : "autonomous";
  const contextMemory =
    typeof taskConfig?.context_memory === "string" ? taskConfig.context_memory : "deep";

  // Format "now" in the user's local timezone (best-effort)
  let nowLocal = nowIso;
  try {
    nowLocal = new Date(nowIso).toLocaleString("en-GB", {
      timeZone: userTimezone,
      hour12: false,
    });
  } catch {
    // fall through to ISO
  }

  // ═══ Fetch last 3 successful runs for non-duplication context ═══
  let priorRuns: PriorRunSummary[] = [];
  try {
    const { data: priorLogs } = await supabase
      .from("agent_heartbeat_logs")
      .select("created_at, result")
      .eq("heartbeat_id", heartbeat.id)
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(3);
    if (Array.isArray(priorLogs)) {
      priorRuns = priorLogs.map((row: any, idx: number) => {
        const result = row?.result || {};
        const text =
          (typeof result.full_result === "string" && result.full_result) ||
          (typeof result.content_preview === "string" && result.content_preview) ||
          (typeof result.summary === "string" && result.summary) ||
          "";
        return {
          run_index: idx + 1,
          ran_at_iso: row?.created_at || "",
          summary: summarizePrior(text, 140),
        };
      });
    }
  } catch (e) {
    console.warn(`[heartbeat] prior-runs fetch failed (non-fatal) for ${heartbeat.id}:`, (e as Error).message);
  }

  // ═══ Personality context (cached or fresh) ═══
  let personalityMode = cachedContext?.mode || "friendly";
  let soulText = cachedContext?.soulText ?? null;
  let customInstructions = cachedContext?.customInstructions ?? null;
  if (!cachedContext) {
    try {
      const [{ data: soulHint }, { data: settingsHint }] = await Promise.all([
        supabase.from("agent_soul_config").select("soul_text").eq("user_id", heartbeat.user_id).maybeSingle(),
        supabase.from("user_agent_settings").select("personality_mode, custom_instructions").eq("user_id", heartbeat.user_id).maybeSingle(),
      ]);
      personalityMode = settingsHint?.personality_mode || "friendly";
      soulText = soulHint?.soul_text || null;
      customInstructions = settingsHint?.custom_instructions || null;
    } catch (e) {
      console.warn("[Heartbeat] Personality context fetch failed (non-fatal):", e);
    }
  }

  // ═══ Build automation-grade prompt ═══
  const lastResult = (heartbeat.last_result || {}) as any;
  let lastRunLocal: string | null = null;
  if (heartbeat.last_run_at) {
    try {
      lastRunLocal = new Date(heartbeat.last_run_at).toLocaleString("en-GB", {
        timeZone: userTimezone,
        hour12: false,
      });
    } catch {
      lastRunLocal = heartbeat.last_run_at;
    }
  }

  const intentOverride: IntentOverride | null =
    (typeof taskConfig.intent_override === "string" ? (taskConfig.intent_override as IntentOverride) : null);
  const built = await buildAutomationPromptAsync({
    displayName: heartbeat.display_name || "Scheduled task",
    userPrompt: rawPrompt,
    runNumber: (heartbeat.action_count ?? 0) + 1,
    scheduleKind,
    nowLocal,
    timezone: userTimezone,
    lastStatus: heartbeat.last_status,
    lastSummary: typeof lastResult.summary === "string" ? lastResult.summary : null,
    lastRunLocal,
    priorRuns,
    deliveryTarget,
    successCriteriaOverride: typeof taskConfig.success_criteria === "string" ? taskConfig.success_criteria : null,
    freshnessOverride: (taskConfig.freshness as any) || null,
    intentOverride,
    agenticProfile,
    autonomyLevel,
    contextMemory,
    selfHeal: selfHealEnabled,
    qualityFloor: qualityDeliveryFloor,
  });

  let prompt = built.prompt;

  // Append voice/persona suffix (style guidance only — not identity)
  const personaSuffix: string[] = [];
  personaSuffix.push(`[VOICE] ${personalityMode} tone.`);
  if (soulText) personaSuffix.push(`Voice guide (style only, NOT identity): ${soulText.slice(0, 400)}`);
  if (customInstructions) personaSuffix.push(`Custom instructions: ${customInstructions.slice(0, 300)}`);
  prompt += "\n\n" + personaSuffix.join("\n");


  try {
    const { data: seededTask, error: seedError } = await supabase
      .from("autonomous_tasks")
      .insert({
        user_id: heartbeat.user_id,
        session_id: sessionId,
        original_prompt: prompt,
        status: "planning",
        plan: [],
        current_step: 0,
        total_steps: 0,
        progress_pct: 0,
      })
      .select("id")
      .single();

    if (seedError) throw seedError;

    const taskId = seededTask.id as string;
    const runningPayload = {
      summary: `Task started for prompt: "${String(rawPrompt).slice(0, 90)}"`,
      prompt_preview: String(rawPrompt).slice(0, 180),
      trigger_source: triggerSource,
      user_timezone: taskConfig?.user_timezone || null,
      executed_at: nowIso,
      autonomous_task_id: taskId,
      autonomous_status: "running",
      progress_pct: 0,
      steps_completed: 0,
      total_steps: 0,
      has_actionable_content: false,
      ...(taskConfig?.delivery_target === "telegram" && { delivery_target: "telegram" }),
    };

    // ═══ Dedup Guard: Atomic lock — skip if already running (prevents cron overlap double-execution) ═══
    const { data: lockResult, error: heartbeatUpdateError } = await supabase
      .from("agent_heartbeats")
      .update({
        last_run_at: nowIso,
        last_status: "running",
        last_result: runningPayload,
        action_count: (heartbeat.action_count ?? 0) + 1,
      })
      .eq("id", heartbeat.id)
      .neq("last_status", "running")
      .select("id")
      .maybeSingle();

    if (heartbeatUpdateError) throw heartbeatUpdateError;
    if (!lockResult) {
      console.log(`[Heartbeat] ⏭️ Skipped ${heartbeat.id} — already running (dedup guard)`);
      return { heartbeat_id: heartbeat.id, status: "skipped", message: "Already running (dedup)" };
    }

    // NOTE: No "running" start-log inserted — only final success/error logs are persisted
    // to prevent orphan "running" entries polluting execution history.

    const finalizeExecution = async () => {
      try {
        // Helper: run via headless agent (same brain as agent-chat) by
        // default. Falls back to legacy DAG orchestrator only when
        // task_config.use_legacy_orchestrator === true.
        const useLegacy = taskConfig?.use_legacy_orchestrator === true;
        const runOnce = async (promptToUse: string) => {
          if (!useLegacy) {
            const headless = await runHeadlessAgent({
              supabase,
              userId: heartbeat.user_id,
              sessionId,
              userMessage: promptToUse,
              timezone: userTimezone,
              sourceChannel: "heartbeat",
              autonomousTaskId: taskId,
            });
            return {
              taskId,
              taskStatus: headless.status as "completed" | "failed",
              finalContent: headless.finalContent,
              error: headless.error || null,
              progressPct: headless.status === "completed" ? 100 : 0,
              currentStep: headless.steps,
              totalSteps: headless.steps,
            };
          }
          // ── Legacy DAG path (kept for rollback) ──
          const out = await runPromptWithOrchestrator({
            supabase,
            supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
            serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
            prompt: promptToUse,
            sessionId,
            userId: heartbeat.user_id,
            taskId,
          });
          if (out.taskStatus === "running" && taskId) {
            const settled = await waitForAutonomousSettlement(supabase, taskId);
            if (settled?.status === "completed") {
              return { ...out, taskStatus: "completed" as const, finalContent: settled.result, error: null,
                progressPct: settled.progress_pct ?? 100, currentStep: settled.current_step ?? out.currentStep, totalSteps: settled.total_steps ?? out.totalSteps };
            } else if (settled?.status === "failed") {
              return { ...out, taskStatus: "failed" as const, finalContent: null, error: settled.error || "Autonomous task failed",
                progressPct: settled.progress_pct ?? out.progressPct, currentStep: settled.current_step ?? out.currentStep, totalSteps: settled.total_steps ?? out.totalSteps };
            }
          }
          return out;
        };

        // ═══ Attempt 1 ═══
        let resolvedOutcome = await runOnce(prompt);

        if (resolvedOutcome.taskStatus === "failed") {
          throw new Error(resolvedOutcome.error || "Autonomous task failed");
        }

        // ═══ Quality Gate (rule-based, no extra LLM) ═══
        // Tool-usage introspection: query autonomous_task_steps to verify what
        // the agent actually invoked, so freshness/data violations are scored
        // against ground truth instead of "unknown".
        let toolUsage = await introspectToolUsage(supabase, taskId);
        const evaluateContent = (content: string | null, usage: ToolUsageReport) =>
          evaluateQuality({
            content: typeof content === "string" ? content : content ? JSON.stringify(content) : null,
            intent: built.intent,
            freshness: built.freshness,
            priorRuns: priorRuns.map((r) => ({ summary: r.summary })),
            usedSearchTool: usage.usedSearchTool,
            usedDataTool: usage.usedDataTool,
          });

        // sourceContent is captured by the builder; pass it to the quality gate
        // so verbatim modes get proportional length/fabrication checks.
        const evaluateContentV2 = (content: string | null, usage: ToolUsageReport) =>
          evaluateQuality({
            content: typeof content === "string" ? content : content ? JSON.stringify(content) : null,
            intent: built.intent,
            freshness: built.freshness,
            priorRuns: priorRuns.map((r) => ({ summary: r.summary })),
            usedSearchTool: usage.usedSearchTool,
            usedDataTool: usage.usedDataTool,
            sourceContent: built.sourceContent,
          });
        let quality: QualityGateResult = evaluateContentV2(resolvedOutcome.finalContent, toolUsage);
        let retryCount = 0;
        let bestOutcome = resolvedOutcome;
        let bestQuality = quality;
        let bestUsage = toolUsage;

        // ═══ One-shot retry on soft-fail ═══
        if (selfHealEnabled && !quality.ok && retryCount < 1 && resolvedOutcome.taskStatus !== "running") {
          retryCount = 1;
          console.log(
            `[heartbeat] Quality gate failed for ${heartbeat.id} (score=${quality.score}, reasons=${quality.reasons.join("|")}, tools=${toolUsage.toolsInvoked.join(",") || "none"}). Retrying once.`,
          );
          const retryBuilt = await buildAutomationPromptAsync({
            displayName: heartbeat.display_name || "Scheduled task",
            userPrompt: rawPrompt,
            runNumber: (heartbeat.action_count ?? 0) + 1,
            scheduleKind,
            nowLocal,
            timezone: userTimezone,
            lastStatus: heartbeat.last_status,
            lastSummary: typeof lastResult.summary === "string" ? lastResult.summary : null,
            lastRunLocal,
            priorRuns,
            deliveryTarget,
            successCriteriaOverride: typeof taskConfig.success_criteria === "string" ? taskConfig.success_criteria : null,
            freshnessOverride: (taskConfig.freshness as any) || null,
            intentOverride,
            retryReasons: quality.reasons,
            agenticProfile,
            autonomyLevel,
            contextMemory,
            selfHeal: selfHealEnabled,
            qualityFloor: qualityDeliveryFloor,
          });
          let retryPrompt = retryBuilt.prompt;
          if (soulText) retryPrompt += `\n\n[VOICE] ${personalityMode} tone.\nVoice guide (style only): ${soulText.slice(0, 400)}`;
          if (customInstructions) retryPrompt += `\nCustom instructions: ${customInstructions.slice(0, 300)}`;

          try {
            const retryOutcome = await runOnce(retryPrompt);
            if (retryOutcome.taskStatus !== "failed") {
              // Re-introspect — same taskId, so step rows now reflect both attempts.
              const retryUsage = await introspectToolUsage(supabase, taskId);
              const retryQuality = evaluateContentV2(retryOutcome.finalContent, retryUsage);
              // Keep whichever is better
              if (retryQuality.score > bestQuality.score) {
                bestOutcome = retryOutcome;
                bestQuality = retryQuality;
                bestUsage = retryUsage;
              }
            }
          } catch (retryErr: any) {
            console.warn(`[heartbeat] Retry attempt failed for ${heartbeat.id}:`, retryErr?.message);
          }
        }

        resolvedOutcome = bestOutcome;
        quality = bestQuality;
        toolUsage = bestUsage;

        const durationMs = Date.now() - taskStartedAt;
        const finalSummary = resolvedOutcome.finalContent
          ? summarizeMarkdown(resolvedOutcome.finalContent, 320)
          : `Task completed for prompt: "${String(rawPrompt).slice(0, 90)}"`;

        const finalPayload: any = {
          ...runningPayload,
          summary: finalSummary,
          full_result: resolvedOutcome.finalContent,
          content_preview: resolvedOutcome.finalContent
            ? summarizeMarkdown(resolvedOutcome.finalContent, 900)
            : null,
          autonomous_status: resolvedOutcome.taskStatus,
          progress_pct: resolvedOutcome.progressPct,
          steps_completed: resolvedOutcome.currentStep,
          total_steps: resolvedOutcome.totalSteps,
          duration_ms: durationMs,
          has_actionable_content: !!resolvedOutcome.finalContent,
          // ═══ Automation observability ═══
          intent_class: built.intent,
          freshness_required: built.freshness,
          quality_score: quality.score,
          quality_ok: quality.ok,
          gate_reasons: quality.reasons,
          gate_flags: quality.flags,
          retry_count: retryCount,
          agentic_profile: agenticProfile,
          autonomy_level: autonomyLevel,
          context_memory: contextMemory,
          self_heal_enabled: selfHealEnabled,
          quality_floor: qualityDeliveryFloor,
          tools_invoked: toolUsage.toolsInvoked,
          used_search_tool: toolUsage.usedSearchTool,
          used_data_tool: toolUsage.usedDataTool,
          tool_steps_ok: toolUsage.successfulToolSteps,
          tool_steps_failed: toolUsage.failedToolSteps,
          ...(resolvedOutcome.taskStatus !== "running" && { completed_at: new Date().toISOString() }),
          ...(taskConfig?.delivery_target === "telegram" && { delivery_target: "telegram" }),
        };

        // ═══ Telegram Delivery + Verification (Quality-Gated) ═══
        const qualityGatedHoldback =
          taskConfig?.delivery_target === "telegram" &&
          quality.score < qualityDeliveryFloor;

        if (qualityGatedHoldback) {
          finalPayload.quality_holdback = true;
          finalPayload.posted = false;
          finalPayload.verified_success = false;
          finalPayload.verification_score = quality.score;
          console.warn(
            `[heartbeat] HOLDBACK ${heartbeat.id} — quality_score=${quality.score} < ${qualityDeliveryFloor}. Reasons: ${quality.reasons.join(" | ")}`,
          );

          // ═══ Proactive in-app notification (throttled: 1 per task per 6h) ═══
          try {
            const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
            const { data: recentNotice } = await supabase
              .from("agent_chat_messages")
              .select("id")
              .eq("user_id", heartbeat.user_id)
              .eq("role", "assistant")
              .eq("source_channel", "automation_holdback")
              .gte("created_at", sixHoursAgo)
              .like("content", `%task_id:${heartbeat.id}%`)
              .limit(1)
              .maybeSingle();
            if (!recentNotice) {
              const { data: activeSession } = await supabase
                .from("agent_chat_sessions")
                .select("id")
                .eq("user_id", heartbeat.user_id)
                .eq("is_active", true)
                .order("last_message_at", { ascending: false, nullsFirst: false })
                .limit(1)
                .maybeSingle();
              if (activeSession?.id) {
                const taskName = heartbeat.display_name || "Untitled task";
                const reason = quality.reasons[0] || "Quality below threshold";
                const noticeBody =
                  `🐝 Automation holdback: "${taskName}" ran but quality was ${quality.score}/100.\n` +
                  `Reason: ${reason}\n` +
                  `Tell me "fix ${taskName}" to repair, or open Scheduled Tasks to inspect.\n` +
                  `<!-- task_id:${heartbeat.id} -->`;
                await supabase.from("agent_chat_messages").insert({
                  session_id: activeSession.id,
                  user_id: heartbeat.user_id,
                  role: "assistant",
                  content: noticeBody,
                  source_channel: "automation_holdback",
                });
                console.log(`[heartbeat] Holdback notice posted to session ${activeSession.id} for task ${heartbeat.id}`);
              }
            } else {
              console.log(`[heartbeat] Holdback notice throttled for ${heartbeat.id}`);
            }
          } catch (noticeErr: any) {
            console.warn(`[heartbeat] Holdback notice failed for ${heartbeat.id}:`, noticeErr.message);
          }
        } else if (
          taskConfig?.delivery_target === "telegram" &&
          resolvedOutcome.finalContent &&
          resolvedOutcome.taskStatus !== "running"
        ) {
          // Evidence-based check: only trust structured proof with a real message_id
          const resultObj: any = typeof resolvedOutcome.finalContent === "object" ? resolvedOutcome.finalContent : {};
          const hasRealMessageId = !!(
            resultObj?.message_id ||
            resultObj?.result?.message_id ||
            (finalPayload as any)?.message_id
          );



          if (hasRealMessageId) {
            // Agent already delivered with proof — trust it
            const msgId = resultObj?.message_id || resultObj?.result?.message_id || (finalPayload as any)?.message_id;
            (finalPayload as any).telegram_delivered_by_agent = true;
            (finalPayload as any).posted = true;
            (finalPayload as any).message_id = msgId;
            (finalPayload as any).verified_success = true;
            (finalPayload as any).verification_score = 100;
            console.log(`[heartbeat] Agent delivery verified with message_id=${msgId} for ${heartbeat.id}`);
          } else {
            // No real evidence — this is THE ONLY delivery path. Sanitize content first.
            console.log(`[heartbeat] Single-path delivery for ${heartbeat.id}`);
            try {
              // Sanitize agent labels and meta-narration before posting
              let deliveryContent = typeof resolvedOutcome.finalContent === "string"
                ? resolvedOutcome.finalContent
                : JSON.stringify(resolvedOutcome.finalContent);
              
              // Use shared sanitizer (single source of truth)
              deliveryContent = sanitizeForChannel(deliveryContent);

              const { executeBroadcastMessage } = await import("../_shared/tool-executors/system.ts");
              // Propagate full broadcast_payload from task_config so scheduled photo/button/pin/silent posts
              // don't silently degrade to plain text.
              const storedPayload = (taskConfig as any)?.broadcast_payload || {};
              const broadcastResult = await executeBroadcastMessage(supabase, heartbeat.user_id, {
                action: "post",
                ...storedPayload, // post_type, photo_url, photo_urls, buttons, pin, silent, disable_link_preview, parse_mode, etc.
                message: deliveryContent, // sanitized content always wins
                channel_name: storedPayload.channel_name || taskConfig.delivery_channel_name || null,
              });
              (finalPayload as any).telegram_fallback_delivery = broadcastResult;
              const msgId = broadcastResult?.message_id || broadcastResult?.result?.message_id;
              if (msgId) {
                (finalPayload as any).posted = true;
                (finalPayload as any).message_id = msgId;
                (finalPayload as any).verified_success = true;
                (finalPayload as any).verification_score = 100;
                console.log(`[heartbeat] Fallback delivery verified with message_id=${msgId} for ${heartbeat.id}`);
              } else {
                // Broadcast returned but no message_id — partial success
                (finalPayload as any).posted = true;
                (finalPayload as any).verified_success = false;
                (finalPayload as any).verification_score = 40;
                console.warn(`[heartbeat] Fallback delivery returned no message_id for ${heartbeat.id}`);
              }
            } catch (e: any) {
              console.warn(`[heartbeat] Telegram fallback delivery failed for ${heartbeat.id}:`, e.message);
              (finalPayload as any).posted = false;
              (finalPayload as any).telegram_fallback_error = e.message;
              (finalPayload as any).verified_success = false;
              (finalPayload as any).verification_score = 0;
            }
          }
        }

        // CRITICAL: Never insert a log with status "running" — only final states.
        const isFinalState = resolvedOutcome.taskStatus !== "running";

        // ═══ Recurring schedule maintenance: advance next_run_at + DST self-heal ═══
        const recurringPatch: { next_run_at?: string | null; cron_expression?: string; task_config?: any } = {};
        if (!oneOff && isFinalState) {
          const maint = computeRecurringMaintenance(heartbeat, new Date());
          if (maint.nextRunAt !== null) recurringPatch.next_run_at = maint.nextRunAt;
          if (maint.recalculatedCron) {
            recurringPatch.cron_expression = maint.recalculatedCron;
            console.log(`[heartbeat] DST self-heal: ${heartbeat.id} cron ${heartbeat.cron_expression} → ${maint.recalculatedCron}`);
          }
          // Mirror dual UTC + local stamps in task_config for UI accuracy
          if (maint.nextRunAt || maint.nextRunLocal) {
            recurringPatch.task_config = {
              ...(heartbeat.task_config || {}),
              next_run_at_utc: maint.nextRunAt,
              next_run_at_local: maint.nextRunLocal,
            };
          }
        }

        // Quality-gated holdback or non-ok quality should surface as "failed" in UI,
        // but recurring schedule still advances (handled above via recurringPatch).
        const finalLastStatus = !isFinalState
          ? "running"
          : finalPayload.quality_holdback || quality.ok === false
          ? "failed"
          : "success";

        // ═══ Failed retry → schedule re-fire (one-off only) ═══
        // If a one-off task's retry also failed quality, push next_run_at +5min
        // and keep is_active=true so it fires again. Capped per task policy.
        // to avoid infinite churn.
        const priorRefireCount = typeof (heartbeat.last_result as any)?.refire_count === "number"
          ? (heartbeat.last_result as any).refire_count
          : 0;
        const shouldRefire =
          oneOff &&
          isFinalState &&
          resolvedOutcome.taskStatus !== "running" &&
          (!quality.ok || finalPayload.quality_holdback === true) &&
          retryCount >= 1 &&
          selfHealEnabled &&
          priorRefireCount < maxRefireAttempts;

        const refirePatch: Record<string, any> = {};
        if (shouldRefire) {
          const nextRunAt = new Date(Date.now() + REFIRE_DELAY_MS).toISOString();
          refirePatch.next_run_at = nextRunAt;
          (finalPayload as any).refire_count = priorRefireCount + 1;
          (finalPayload as any).refire_scheduled_at = nextRunAt;
          console.log(
            `[heartbeat] RE-FIRE scheduled for ${heartbeat.id} ` +
              `(attempt ${priorRefireCount + 1}/${maxRefireAttempts}) at ${nextRunAt} ` +
              `— retry quality still ${quality.score}/100`,
          );
        } else if (oneOff && isFinalState && maxRefireAttempts > 0 && priorRefireCount >= maxRefireAttempts && (!quality.ok || finalPayload.quality_holdback)) {
          (finalPayload as any).refire_exhausted = true;
          console.warn(
            `[heartbeat] RE-FIRE EXHAUSTED for ${heartbeat.id} after ${priorRefireCount} attempts — giving up.`,
          );
        }

        await supabase
          .from("agent_heartbeats")
          .update({
            last_status: finalLastStatus,
            last_result: finalPayload,
            // One-off tasks: deactivate ONLY on successful, quality-passing completion (retry on failure or re-fire pending)
            ...(oneOff && isFinalState && resolvedOutcome.taskStatus === "completed" && quality.ok && !finalPayload.quality_holdback
              ? { is_active: false }
              : {}),
            ...recurringPatch,
            ...refirePatch,
          })
          .eq("id", heartbeat.id);

        if (isFinalState) {
          await supabase.from("agent_heartbeat_logs").insert({
            heartbeat_id: heartbeat.id,
            user_id: heartbeat.user_id,
            status: finalLastStatus === "failed" ? "failed" : "success",
            result: finalPayload,
          });
        }
        // If still running: NO log inserted. Reconciliation on next tick will finalize.

      } catch (backgroundError: any) {
        const errorMessage = backgroundError?.message || "Unknown execution error";
        console.error(`[heartbeat] Execution failed for ${heartbeat.id}:`, errorMessage);

        const errorPayload = {
          ...runningPayload,
          autonomous_status: "failed",
          error: errorMessage,
          completed_at: new Date().toISOString(),
        };

        const { error: failUpdateErr } = await supabase
          .from("agent_heartbeats")
          .update({
            last_status: "failed",
            last_result: errorPayload,
          })
          .eq("id", heartbeat.id);
        if (failUpdateErr) console.error(`[heartbeat] Failed to write failed status for ${heartbeat.id}:`, failUpdateErr.message);

        const { error: failLogErr } = await supabase.from("agent_heartbeat_logs").insert({
          heartbeat_id: heartbeat.id,
          user_id: heartbeat.user_id,
          status: "failed",
          result: errorPayload,
        });
        if (failLogErr) console.error(`[heartbeat] Failed to insert failed log for ${heartbeat.id}:`, failLogErr.message);
      }
    };

    // CRITICAL FIX: Always await finalizeExecution(). pg_cron fires HTTP via pg_net
    // which does NOT wait for the response — EdgeRuntime.waitUntil promises get killed
    // when the instance shuts down. Awaiting ensures the full pipeline completes:
    // orchestrator → result save → Telegram delivery → log insertion.
    await finalizeExecution();
    return {
      heartbeat_id: heartbeat.id,
      status: "success",
      message: `Task completed: ${heartbeat.display_name}`,
    };
  } catch (error: any) {
    const errorMessage = error?.message || "Unknown execution error";
    console.error(`[heartbeat] Fatal processHeartbeat error for ${heartbeat.id}:`, errorMessage);

    const { error: fatalUpdateErr } = await supabase
      .from("agent_heartbeats")
      .update({
        last_run_at: nowIso,
        last_status: "failed",
        last_result: {
          prompt_preview: String(prompt).slice(0, 180),
          trigger_source: triggerSource,
          executed_at: nowIso,
          error: errorMessage,
          completed_at: nowIso,
        },
        // NOTE: Do NOT deactivate one-off tasks on fatal errors — allow retry on next cron tick
      })
      .eq("id", heartbeat.id);
    if (fatalUpdateErr) console.error(`[heartbeat] Fatal update write failed for ${heartbeat.id}:`, fatalUpdateErr.message);

    const { error: fatalLogErr } = await supabase.from("agent_heartbeat_logs").insert({
      heartbeat_id: heartbeat.id,
      user_id: heartbeat.user_id,
      status: "failed",
      result: {
        prompt_preview: String(prompt).slice(0, 180),
        trigger_source: triggerSource,
        executed_at: nowIso,
        error: errorMessage,
      },
    });
    if (fatalLogErr) console.error(`[heartbeat] Fatal log write failed for ${heartbeat.id}:`, fatalLogErr.message);

    return {
      heartbeat_id: heartbeat.id,
      status: "failed",
      message: `Failed to execute ${heartbeat.display_name}: ${errorMessage}`,
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const rawBody = await req.text();
    const body = rawBody ? parseJsonSafely(rawBody) : {};

    const heartbeatId = typeof body?.heartbeat_id === "string" ? body.heartbeat_id : null;
    const forceRun = body?.force_run === true;
    const now = new Date();
    const nowIso = now.toISOString();

    let heartbeats: HeartbeatRow[] = [];

    if (heartbeatId) {
      const { data: heartbeat, error } = await supabase
        .from("agent_heartbeats")
        .select("id, user_id, display_name, task_type, trigger_type, cron_expression, next_run_at, last_run_at, is_active, action_count, task_config, last_status, last_result")
        .eq("id", heartbeatId)
        .maybeSingle();

      if (error) throw error;

      if (!heartbeat) {
        return new Response(
          JSON.stringify({ success: false, error: `Heartbeat ${heartbeatId} not found`, results: [] }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      heartbeats = [heartbeat as HeartbeatRow];
    } else {
      // Fetch active cron/hybrid heartbeats + any stuck "running" heartbeats for reconciliation
      const { data: activeData, error: activeErr } = await supabase
        .from("agent_heartbeats")
        .select("id, user_id, display_name, task_type, trigger_type, cron_expression, next_run_at, last_run_at, is_active, action_count, task_config, last_status, last_result")
        .eq("is_active", true)
        .in("trigger_type", ["cron", "hybrid"]);

      if (activeErr) throw activeErr;

      const { data: runningData, error: runningErr } = await supabase
        .from("agent_heartbeats")
        .select("id, user_id, display_name, task_type, trigger_type, cron_expression, next_run_at, last_run_at, is_active, action_count, task_config, last_status, last_result")
        .eq("last_status", "running");

      if (runningErr) throw runningErr;

      // Merge, deduplicate by id
      const merged = new Map<string, HeartbeatRow>();
      for (const h of [...(activeData || []), ...(runningData || [])]) {
        merged.set(h.id, h as HeartbeatRow);
      }
      heartbeats = Array.from(merged.values());
    }

    const results: ExecutionResult[] = [];
    const sessionIdCache = new Map<string, string>();

    // ═══ Priority order for task sorting ═══
    const PRIORITY_ORDER: Record<string, number> = { critical: 4, high: 3, normal: 2, low: 1 };
    const CONCURRENCY_CAP = 3;

    // Phase 1: Reconcile + filter due heartbeats
    const dueHeartbeats: { heartbeat: HeartbeatRow; triggerSource: "cron_dispatch" | "manual_trigger" | "event_trigger" }[] = [];

    for (const heartbeat of heartbeats) {
      const isDirectTarget = !!heartbeatId;

      const recovered = await reconcileRunningHeartbeat(supabase, heartbeat, nowIso);
      if (recovered) {
        results.push(recovered);
        if (!forceRun) continue;
      }

      if (!shouldRunHeartbeat(heartbeat, now, isDirectTarget, forceRun)) {
        results.push({
          heartbeat_id: heartbeat.id,
          status: "skipped",
          message: heartbeatId
            ? `Skipped ${heartbeat.display_name}: not due yet`
            : `Skipped ${heartbeat.display_name}: schedule not due`,
        });
        continue;
      }

      const triggerSource: "cron_dispatch" | "manual_trigger" | "event_trigger" =
        heartbeat.trigger_type === "event"
          ? "event_trigger"
          : heartbeatId
            ? "manual_trigger"
            : "cron_dispatch";

      dueHeartbeats.push({ heartbeat, triggerSource });
    }

    // Phase 2: Group by user, priority sort, parallel execute with concurrency cap
    const userGroups = new Map<string, typeof dueHeartbeats>();
    for (const item of dueHeartbeats) {
      const uid = item.heartbeat.user_id;
      const group = userGroups.get(uid) || [];
      group.push(item);
      userGroups.set(uid, group);
    }

    // Batch-level user context cache: avoid redundant soul/personality DB queries per user
    const userContextCache = new Map<string, { soulText: string | null; customInstructions: string | null; mode: string }>();

    for (const [userId, tasks] of userGroups) {
      // Sort by priority: critical first
      tasks.sort((a, b) => {
        const pa = PRIORITY_ORDER[a.heartbeat.task_config?.priority || "normal"] || 2;
        const pb = PRIORITY_ORDER[b.heartbeat.task_config?.priority || "normal"] || 2;
        return pb - pa;
      });

      // Per-heartbeat session: each scheduled task owns its own session
      // so BeeBot can recall its own previous runs without picking up
      // unrelated tasks' history. Cache key includes heartbeat id.
      // (We resolve inside the inner loop below — see processHeartbeat call.)

      // Pre-fetch user context once per user (saves 2 DB queries per additional task)
      if (!userContextCache.has(userId)) {
        try {
          const [{ data: soul }, { data: settings }] = await Promise.all([
            supabase.from("agent_soul_config").select("soul_text").eq("user_id", userId).maybeSingle(),
            supabase.from("user_agent_settings").select("personality_mode, custom_instructions").eq("user_id", userId).maybeSingle(),
          ]);
          userContextCache.set(userId, {
            soulText: soul?.soul_text || null,
            customInstructions: settings?.custom_instructions || null,
            mode: settings?.personality_mode || "friendly",
          });
        } catch { userContextCache.set(userId, { soulText: null, customInstructions: null, mode: "friendly" }); }
      }

      // Process in batches of CONCURRENCY_CAP — resolve a per-heartbeat
      // session lazily so each task gets its own continuity bucket.
      for (let i = 0; i < tasks.length; i += CONCURRENCY_CAP) {
        const batch = tasks.slice(i, i + CONCURRENCY_CAP);
        const batchResults = await Promise.allSettled(
          batch.map(async ({ heartbeat, triggerSource }) => {
            const perTaskSession = await resolveSessionId(supabase, userId, heartbeat.id, heartbeat.display_name);
            return processHeartbeat(supabase, heartbeat, perTaskSession, nowIso, triggerSource, userContextCache.get(userId));
          })
        );
        for (const r of batchResults) {
          if (r.status === "fulfilled") {
            results.push(r.value);
          } else {
            results.push({
              heartbeat_id: batch[batchResults.indexOf(r)]?.heartbeat.id || "unknown",
              status: "failed",
              message: `Parallel execution error: ${r.reason?.message || "Unknown"}`,
            });
          }
        }
      }
    }

    // Daily memory consolidation worker (non-blocking / non-critical).
    try {
      const workerUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/agent-heartbeat-worker`;
      const dreamUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/memory-consolidation`;
      const svcHeaders = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      };
      fetch(workerUrl, {
        method: "POST",
        headers: svcHeaders,
        body: JSON.stringify({ triggered_by: "heartbeat_cron" }),
      }).catch((e) => console.error("[agent-heartbeat] Consolidation fire-and-forget:", e));
      fetch(dreamUrl, {
        method: "POST",
        headers: svcHeaders,
        body: JSON.stringify({ triggered_by: "heartbeat_cron" }),
      }).catch((e) => console.error("[agent-heartbeat] Memory dream fire-and-forget:", e));
    } catch (_) { /* non-critical */ }

    const successCount = results.filter((r) => r.status === "success").length;
    const runningCount = results.filter((r) => r.status === "running").length;

    return new Response(
      JSON.stringify({
        success: true,
        checked: heartbeats.length,
        processed: successCount + runningCount,
        running: runningCount,
        skipped: results.filter((r) => r.status === "skipped").length,
        errors: results.filter((r) => r.status === "failed").length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[agent-heartbeat] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Unknown error", results: [] }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
