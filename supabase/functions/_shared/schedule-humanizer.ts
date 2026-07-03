// schedule-humanizer.ts
// Pure helpers that turn raw heartbeat rows into agent-friendly fields
// so BeeBot can quote them verbatim instead of re-parsing cron strings.
//
// Used by tool-executors/system.ts (schedule_task list/get/summary) and
// optionally by prompt-builder.ts for [ACTIVE_AUTOMATIONS] context injection.

const DOW: Record<string, string> = {
  "0": "Sun", "1": "Mon", "2": "Tue", "3": "Wed", "4": "Thu", "5": "Fri", "6": "Sat",
  "7": "Sun",
};

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }

function fmt12h(h: number, m: number): string {
  const ampm = h < 12 ? "AM" : "PM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${pad2(m)} ${ampm}`;
}

/** Convert a 5-field UTC cron expression into a human description in the user's TZ.
 *  Best-effort: handles common patterns (daily, weekly, hourly, interval). */
export function humanizeCron(cron: string | null | undefined, tz: string = "UTC"): string {
  if (!cron || typeof cron !== "string") return "Unscheduled";
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return `Custom: ${cron}`;
  const [min, hour, dom, mon, dow] = parts;

  // Pure interval minutes:  */N * * * *
  if (/^\*\/\d+$/.test(min) && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    const n = parseInt(min.slice(2), 10);
    return `Every ${n} minute${n === 1 ? "" : "s"}`;
  }
  // Hourly at minute M:  M * * * *
  if (/^\d+$/.test(min) && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `Every hour at :${pad2(parseInt(min, 10))}`;
  }
  // Interval hours: 0 */N * * *
  if (min === "0" && /^\*\/\d+$/.test(hour) && dom === "*" && mon === "*" && dow === "*") {
    const n = parseInt(hour.slice(2), 10);
    return `Every ${n} hour${n === 1 ? "" : "s"}`;
  }

  // Try to convert UTC HH:MM to local for daily/weekly patterns
  const isSimpleHM = /^\d+$/.test(min) && /^\d+$/.test(hour);
  let localTimeStr = "";
  if (isSimpleHM) {
    try {
      const utcHour = parseInt(hour, 10);
      const utcMin = parseInt(min, 10);
      // Build a UTC date today at HH:MM
      const now = new Date();
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), utcHour, utcMin, 0));
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true,
      });
      localTimeStr = fmt.format(d);
    } catch {
      localTimeStr = `${pad2(parseInt(hour, 10))}:${pad2(parseInt(min, 10))} UTC`;
    }
  }

  // Daily: M H * * *
  if (isSimpleHM && dom === "*" && mon === "*" && dow === "*") {
    return `Every day at ${localTimeStr} (${tz})`;
  }
  // Weekdays: M H * * 1-5
  if (isSimpleHM && dom === "*" && mon === "*" && dow === "1-5") {
    return `Weekdays at ${localTimeStr} (${tz})`;
  }
  // Weekends: M H * * 0,6 or 6,0
  if (isSimpleHM && dom === "*" && mon === "*" && /^[06](,[06])?$/.test(dow)) {
    return `Weekends at ${localTimeStr} (${tz})`;
  }
  // Specific weekdays: M H * * 1,3,5
  if (isSimpleHM && dom === "*" && mon === "*" && /^[0-7](,[0-7])*$/.test(dow)) {
    const days = dow.split(",").map((d) => DOW[d] || d).join(", ");
    return `${days} at ${localTimeStr} (${tz})`;
  }
  // Monthly: M H D * *
  if (isSimpleHM && /^\d+$/.test(dom) && mon === "*" && dow === "*") {
    return `Monthly on day ${dom} at ${localTimeStr} (${tz})`;
  }

  return `Custom: ${cron}`;
}

/** "in 3 hours", "tomorrow 8:00 AM", "in 12 minutes", "overdue", or absolute fallback. */
export function humanizeNextRun(nextRunAt: string | null | undefined, tz: string = "UTC"): string {
  if (!nextRunAt) return "no upcoming run";
  const next = new Date(nextRunAt);
  if (isNaN(next.getTime())) return "invalid time";
  const now = new Date();
  const diffMs = next.getTime() - now.getTime();
  if (diffMs < -60_000) return "overdue (catching up)";
  if (diffMs < 60_000) return "in <1 minute";
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `in ${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  if (days <= 7) {
    try {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit", hour12: true,
      });
      return `${days === 1 ? "tomorrow" : `in ${days} days`} (${fmt.format(next)})`;
    } catch {
      return `in ${days} day${days === 1 ? "" : "s"}`;
    }
  }
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
    });
    return fmt.format(next);
  } catch {
    return next.toISOString();
  }
}

/** Relative past: "5 minutes ago", "yesterday", "3 days ago", or absolute. */
export function humanizeLastRun(lastRunAt: string | null | undefined, tz: string = "UTC"): string {
  if (!lastRunAt) return "never run yet";
  const last = new Date(lastRunAt);
  if (isNaN(last.getTime())) return "unknown";
  const diffMs = Date.now() - last.getTime();
  if (diffMs < 60_000) return "just now";
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days <= 7) return `${days} days ago`;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, month: "short", day: "numeric",
    });
    return fmt.format(last);
  } catch {
    return last.toISOString().slice(0, 10);
  }
}

/** Map last_status + last_result quality into a chat-ready label. */
export function statusLabel(lastStatus: string | null | undefined, lastResult: any): string {
  if (!lastStatus) return "⏳ never run yet";
  const heldBack = !!(lastResult && (lastResult.quality_holdback || lastResult.held_back));
  const score = typeof lastResult?.quality_score === "number" ? lastResult.quality_score : null;
  if (heldBack) return `🚫 held back${score !== null ? ` (quality ${score})` : ""}`;
  if (lastStatus === "completed" || lastStatus === "delivered" || lastStatus === "success") {
    return score !== null ? `✅ delivered (quality ${score})` : "✅ delivered";
  }
  if (lastStatus === "failed" || lastStatus === "error") return "❌ failed";
  if (lastStatus === "running") return "⏳ running now";
  return `• ${lastStatus}`;
}

/** Derive a short friendly label from a prompt. */
export function friendlyLabel(prompt: string | null | undefined, fallback?: string): string {
  const src = (prompt && prompt.trim()) || (fallback && fallback.trim()) || "Untitled task";
  // Strip leading verbs/imperatives common in scheduling prompts
  const cleaned = src.replace(/^(please|pls|kindly|generate|send|post|create|fetch|get|give|tell|share|broadcast|publish|deliver|prepare|build|do|run)\s+/i, "");
  const words = cleaned.split(/\s+/).slice(0, 6).join(" ");
  // Sentence-case the first letter, keep the rest as-is (preserves Burmese & acronyms)
  const trimmed = words.replace(/[.,;:!?]+$/, "").trim();
  if (!trimmed) return "Untitled task";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** Heuristic health rating from recent run telemetry. */
export function healthRating(row: any): "good" | "degraded" | "failing" | "unknown" {
  const lastResult = row?.last_result;
  const refireCount = row?.refire_count || 0;
  const retryCount = lastResult?.retry_count || 0;
  if (!row?.last_run_at) return "unknown";
  if (row.last_status === "failed" || refireCount >= 2) return "failing";
  if (lastResult?.quality_holdback || retryCount >= 1 || refireCount >= 1) return "degraded";
  if (lastResult?.quality_score && lastResult.quality_score < 60) return "degraded";
  return "good";
}

/** Build the full enriched view for a single heartbeat row. */
export function enrichScheduledTask(row: any, tz: string = "UTC") {
  const prompt = row?.task_config?.prompt || row?.display_name || "";
  const isOneOff = !row?.cron_expression;
  const scheduleHuman = isOneOff
    ? `One-off — ${humanizeNextRun(row?.next_run_at || row?.start_at, tz)}`
    : humanizeCron(row?.cron_expression, tz);

  return {
    id: row?.id,
    friendly_label: friendlyLabel(prompt, row?.display_name),
    prompt,
    is_active: !!row?.is_active,
    is_one_off: isOneOff,
    schedule_type: row?.task_config?.schedule_type || (isOneOff ? "one_off" : "recurring"),
    cron_expression: row?.cron_expression || null,
    schedule_human: scheduleHuman,
    next_run_at: row?.next_run_at,
    next_run_human: humanizeNextRun(row?.next_run_at, tz),
    last_run_at: row?.last_run_at,
    last_run_human: humanizeLastRun(row?.last_run_at, tz),
    last_run_status_label: statusLabel(row?.last_status, row?.last_result),
    last_status: row?.last_status,
    priority: row?.priority,
    health: healthRating(row),
    quality_summary: row?.last_result?.quality_score != null ? {
      last_score: row.last_result.quality_score,
      held_back: !!row.last_result.quality_holdback,
      retry_count: row.last_result.retry_count || 0,
      refire_count: row?.refire_count || 0,
    } : null,
    created_at: row?.created_at,
  };
}
