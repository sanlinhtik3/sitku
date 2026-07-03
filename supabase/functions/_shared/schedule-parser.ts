// ═══ Schedule Parser v2 — World-Class Accuracy ═══
// Structured-first, NL fallback, DST-aware, Burmese-aware.
// Single source of truth for converting user intent → cron + next-fire previews.

export type Recurrence =
  | "one_off"
  | "daily"
  | "weekly"
  | "weekdays"
  | "weekends"
  | "hourly"
  | "interval"
  | "monthly"
  | "custom_cron";

export type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

const WEEKDAY_INDEX: Record<Weekday, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const BURMESE_WEEKDAY: Record<string, Weekday> = {
  "တနင်္ဂနွေ": "sun", "တနင်္လာ": "mon", "အင်္ဂါ": "tue",
  "ဗုဒ္ဓဟူး": "wed", "ကြာသပတေး": "thu", "သောကြာ": "fri", "စနေ": "sat",
};

const BURMESE_DIGITS: Record<string, string> = {
  "၀": "0", "၁": "1", "၂": "2", "၃": "3", "၄": "4",
  "၅": "5", "၆": "6", "၇": "7", "၈": "8", "၉": "9",
};

function normalizeBurmeseDigits(s: string): string {
  return s.replace(/[၀-၉]/g, (d) => BURMESE_DIGITS[d] || d);
}

export interface StructuredScheduleInput {
  recurrence?: Recurrence;
  at_time?: string;            // "HH:MM" (24h, in `timezone`)
  weekdays?: Weekday[];        // for weekly
  day_of_month?: number;       // for monthly (1-31)
  interval_minutes?: number;   // for interval
  interval_hours?: number;     // for interval
  start_at?: string;           // ISO 8601 (one_off)
  end_at?: string;             // ISO 8601 (recurring expiry)
  cron_expression?: string;    // 5-field UTC cron (advanced)
  time_desc?: string;          // NL fallback
}

export interface ScheduleResult {
  schedule_kind: "one_off" | "recurring";
  cron_expression_utc: string | null;
  one_off_utc: string | null;
  next_3_runs_utc: string[];
  next_3_runs_local: string[];
  display_time_local: string;
  display_timezone_label: string;
  validation_warnings: string[];
  end_at_utc?: string | null;
  parser_path: "structured" | "nl";
  parser_version: string;
}

export interface ScheduleError {
  error: string;
  suggestions?: string[];
}

const PARSER_VERSION = "v2.0";

export function isScheduleError(r: ScheduleResult | ScheduleError): r is ScheduleError {
  return (r as ScheduleError).error !== undefined;
}

// ─── Timezone helpers ────────────────────────────────────────────────

export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function getTimezoneOffsetMs(tz: string, date: Date): number {
  try {
    const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" });
    const tzStr = date.toLocaleString("en-US", { timeZone: tz });
    return new Date(tzStr).getTime() - new Date(utcStr).getTime();
  } catch {
    return 0;
  }
}

function localDateTimeToUTC(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  const asUTC = new Date(dateStr + "Z");
  const offsetMs = getTimezoneOffsetMs(tz, asUTC);
  return new Date(asUTC.getTime() - offsetMs);
}

function getLocalParts(date: Date, tz: string): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  const wkMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
    weekday: wkMap[parts.weekday] ?? 0,
  };
}

function formatLocal(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz, weekday: "short", year: "numeric", month: "short",
      day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function timezoneLabel(tz: string, date: Date): string {
  try {
    const offsetMs = getTimezoneOffsetMs(tz, date);
    const sign = offsetMs >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMs);
    const hh = Math.floor(abs / 3600000);
    const mm = Math.floor((abs % 3600000) / 60000);
    return `${tz} (UTC${sign}${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")})`;
  } catch {
    return tz;
  }
}

// ─── Cron helpers (5-field standard) ─────────────────────────────────

function parseCronField(field: string, min: number, max: number): number[] {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const t = part.trim();
    if (!t) continue;
    if (t === "*") {
      for (let i = min; i <= max; i++) out.add(i);
      continue;
    }
    let step = 1;
    let body = t;
    if (t.includes("/")) {
      const [b, s] = t.split("/");
      body = b;
      step = Math.max(1, Number(s) || 1);
    }
    let lo = min, hi = max;
    if (body && body !== "*") {
      if (body.includes("-")) {
        const [a, b] = body.split("-").map(Number);
        lo = a; hi = b;
      } else {
        lo = Number(body); hi = (t.includes("/") && !body.includes("-")) ? max : lo;
      }
    }
    if (Number.isNaN(lo) || Number.isNaN(hi)) continue;
    for (let i = lo; i <= hi; i++) {
      if ((i - lo) % step === 0) out.add(i);
    }
  }
  return [...out].sort((a, b) => a - b);
}

export function isValidCron(expr: string): boolean {
  if (!expr || typeof expr !== "string") return false;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  try {
    parseCronField(parts[0], 0, 59);
    parseCronField(parts[1], 0, 23);
    parseCronField(parts[2], 1, 31);
    parseCronField(parts[3], 1, 12);
    parseCronField(parts[4], 0, 6);
    return true;
  } catch {
    return false;
  }
}

/** Compute next N UTC fires of a cron expression after `from` (exclusive). */
export function nextCronFires(cronExpr: string, from: Date, count: number): Date[] {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return [];
  const minutes = parseCronField(parts[0], 0, 59);
  const hours = parseCronField(parts[1], 0, 23);
  const days = parseCronField(parts[2], 1, 31);
  const months = parseCronField(parts[3], 1, 12);
  const weekdays = parseCronField(parts[4], 0, 6);

  const out: Date[] = [];
  // Walk forward minute-by-minute. Cap at 366 days to avoid infinite loops.
  const cursor = new Date(Math.ceil((from.getTime() + 1) / 60000) * 60000);
  const maxIter = 366 * 24 * 60;
  for (let i = 0; i < maxIter && out.length < count; i++) {
    const m = cursor.getUTCMinutes();
    const h = cursor.getUTCHours();
    const dom = cursor.getUTCDate();
    const mon = cursor.getUTCMonth() + 1;
    const dow = cursor.getUTCDay();
    if (
      minutes.includes(m) && hours.includes(h) &&
      days.includes(dom) && months.includes(mon) && weekdays.includes(dow)
    ) {
      out.push(new Date(cursor));
    }
    cursor.setTime(cursor.getTime() + 60000);
  }
  return out;
}

// ─── At-time parsing ─────────────────────────────────────────────────

function parseAtTime(at: string): { hour: number; minute: number } | null {
  const m = String(at).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

// ─── Builders: structured → cron/one_off ─────────────────────────────

function buildFromStructured(input: StructuredScheduleInput, tz: string, now: Date): ScheduleResult | ScheduleError {
  const warnings: string[] = [];

  // Custom cron — trust as UTC
  if (input.cron_expression) {
    if (!isValidCron(input.cron_expression)) {
      return { error: `Invalid cron_expression "${input.cron_expression}". Must be 5 fields: "min hour dom mon dow".` };
    }
    return finalize({
      schedule_kind: "recurring",
      cron_expression_utc: input.cron_expression,
      one_off_utc: null,
      validation_warnings: warnings,
      end_at_utc: input.end_at ? normalizeIso(input.end_at) : null,
      parser_path: "structured",
    }, now, tz);
  }

  // One-off
  if (input.recurrence === "one_off" || (!input.recurrence && input.start_at)) {
    let target: Date | null = null;
    if (input.start_at) {
      const iso = normalizeIso(input.start_at);
      if (!iso) return { error: `Invalid start_at "${input.start_at}". Must be ISO 8601.` };
      target = new Date(iso);
    } else if (input.at_time) {
      const at = parseAtTime(input.at_time);
      if (!at) return { error: `Invalid at_time "${input.at_time}". Must be "HH:MM" (24-hour).` };
      const local = getLocalParts(now, tz);
      target = localDateTimeToUTC(local.year, local.month, local.day, at.hour, at.minute, tz);
      if (target.getTime() <= now.getTime()) {
        target = new Date(target.getTime() + 86400000);
        warnings.push(`${input.at_time} already passed in ${tz}; scheduled for tomorrow instead.`);
      }
    } else {
      return { error: "one_off requires start_at (ISO) or at_time (HH:MM).", suggestions: ["Provide start_at: '2026-05-15T14:00:00Z'", "Or at_time: '08:00' with timezone"] };
    }
    if (!target || isNaN(target.getTime())) return { error: "Could not compute target time." };
    if (target.getTime() <= now.getTime()) return { error: "Target time is in the past." };
    return finalize({
      schedule_kind: "one_off",
      cron_expression_utc: null,
      one_off_utc: target.toISOString(),
      validation_warnings: warnings,
      end_at_utc: null,
      parser_path: "structured",
    }, now, tz);
  }

  // Recurring kinds requiring at_time (except hourly/interval)
  const recurrence = input.recurrence;

  if (recurrence === "interval") {
    const mins = input.interval_minutes ?? (input.interval_hours ? input.interval_hours * 60 : 0);
    if (!mins || mins <= 0) return { error: "interval requires interval_minutes or interval_hours > 0." };
    if (mins < 1) return { error: "interval_minutes must be >= 1." };
    // Cron supports interval only if minutes divides 60 (for sub-hour) or hours divides 24 (for hourly+)
    if (mins < 60) {
      if (60 % mins !== 0) {
        warnings.push(`interval_minutes=${mins} doesn't divide 60 evenly; using closest cron approximation.`);
      }
      const cron = `*/${mins} * * * *`;
      return finalize({
        schedule_kind: "recurring", cron_expression_utc: cron, one_off_utc: null,
        validation_warnings: warnings, end_at_utc: input.end_at ? normalizeIso(input.end_at) : null,
        parser_path: "structured",
      }, now, tz);
    } else {
      const hours = Math.round(mins / 60);
      if (24 % hours !== 0) warnings.push(`Hour interval ${hours} doesn't divide 24 evenly.`);
      const cron = `0 */${hours} * * *`;
      return finalize({
        schedule_kind: "recurring", cron_expression_utc: cron, one_off_utc: null,
        validation_warnings: warnings, end_at_utc: input.end_at ? normalizeIso(input.end_at) : null,
        parser_path: "structured",
      }, now, tz);
    }
  }

  if (recurrence === "hourly") {
    const mins = input.at_time ? parseAtTime(`00:${input.at_time.split(":")[1] || "00"}`)?.minute ?? 0 : 0;
    return finalize({
      schedule_kind: "recurring", cron_expression_utc: `${mins} * * * *`, one_off_utc: null,
      validation_warnings: warnings, end_at_utc: input.end_at ? normalizeIso(input.end_at) : null,
      parser_path: "structured",
    }, now, tz);
  }

  // For daily/weekly/weekdays/weekends/monthly we need at_time
  if (!input.at_time) {
    return { error: `${recurrence} requires at_time (e.g., "08:00").` };
  }
  const at = parseAtTime(input.at_time);
  if (!at) return { error: `Invalid at_time "${input.at_time}". Must be "HH:MM" (24-hour).` };

  // Convert local hour:minute → UTC using TODAY's offset (DST self-heal handles future drift)
  const local = getLocalParts(now, tz);
  const utcAnchor = localDateTimeToUTC(local.year, local.month, local.day, at.hour, at.minute, tz);
  const utcMin = utcAnchor.getUTCMinutes();
  const utcHour = utcAnchor.getUTCHours();

  let cron: string;
  switch (recurrence) {
    case "daily":
      cron = `${utcMin} ${utcHour} * * *`;
      break;
    case "weekdays":
      cron = `${utcMin} ${utcHour} * * 1-5`;
      break;
    case "weekends":
      cron = `${utcMin} ${utcHour} * * 0,6`;
      break;
    case "weekly": {
      if (!input.weekdays || input.weekdays.length === 0) {
        return { error: "weekly requires weekdays array (e.g., [\"mon\",\"wed\"])." };
      }
      const dows = input.weekdays.map((w) => WEEKDAY_INDEX[w]).filter((n) => n !== undefined);
      if (dows.length === 0) return { error: "Invalid weekdays. Use sun/mon/tue/wed/thu/fri/sat." };
      // Adjust dow if local→UTC crossed midnight
      const dayShift = utcAnchor.getUTCDate() - local.day;
      const adjusted = dows.map((d) => (d + dayShift + 7) % 7).sort((a, b) => a - b);
      cron = `${utcMin} ${utcHour} * * ${adjusted.join(",")}`;
      break;
    }
    case "monthly": {
      if (!input.day_of_month || input.day_of_month < 1 || input.day_of_month > 31) {
        return { error: "monthly requires day_of_month (1-31)." };
      }
      cron = `${utcMin} ${utcHour} ${input.day_of_month} * *`;
      break;
    }
    default:
      return { error: `Unknown recurrence "${recurrence}". Valid: one_off, daily, weekly, weekdays, weekends, hourly, interval, monthly, custom_cron.` };
  }

  return finalize({
    schedule_kind: "recurring",
    cron_expression_utc: cron,
    one_off_utc: null,
    validation_warnings: warnings,
    end_at_utc: input.end_at ? normalizeIso(input.end_at) : null,
    parser_path: "structured",
  }, now, tz);
}

function normalizeIso(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function finalize(
  partial: Omit<ScheduleResult, "next_3_runs_utc" | "next_3_runs_local" | "display_time_local" | "display_timezone_label" | "parser_version">,
  now: Date,
  tz: string,
): ScheduleResult {
  let nextRuns: Date[] = [];
  if (partial.cron_expression_utc) {
    nextRuns = nextCronFires(partial.cron_expression_utc, now, 3);
    // Cap by end_at if present
    if (partial.end_at_utc) {
      const cap = new Date(partial.end_at_utc).getTime();
      nextRuns = nextRuns.filter((d) => d.getTime() <= cap);
    }
  } else if (partial.one_off_utc) {
    nextRuns = [new Date(partial.one_off_utc)];
  }

  const next3UTC = nextRuns.map((d) => d.toISOString());
  const next3Local = nextRuns.map((d) => formatLocal(d, tz));
  const displayLocal = nextRuns[0] ? formatLocal(nextRuns[0], tz) : "(no upcoming fires)";
  const tzLabel = timezoneLabel(tz, now);

  return {
    ...partial,
    next_3_runs_utc: next3UTC,
    next_3_runs_local: next3Local,
    display_time_local: displayLocal,
    display_timezone_label: tzLabel,
    parser_version: PARSER_VERSION,
  };
}

// ─── NL parser (extended from v1) ────────────────────────────────────

function parseNL(timeDesc: string, tz: string, now: Date): ScheduleResult | ScheduleError {
  const raw = normalizeBurmeseDigits(timeDesc.trim());
  const lower = raw.toLowerCase();

  // Burmese day-of-week first
  for (const [my, en] of Object.entries(BURMESE_WEEKDAY)) {
    if (raw.includes(my)) {
      const t = extractTime(raw);
      if (t) {
        return buildFromStructured({ recurrence: "weekly", weekdays: [en], at_time: `${pad(t.hour)}:${pad(t.minute)}` }, tz, now);
      }
    }
  }

  // "every N min/hour"
  const intervalMatch = lower.match(/every\s+(\d+)\s*(min(?:ute)?s?|hour|hours|hr|hrs)/);
  if (intervalMatch) {
    const n = Number(intervalMatch[1]);
    const isHour = intervalMatch[2].startsWith("h");
    return buildFromStructured(
      isHour ? { recurrence: "interval", interval_hours: n } : { recurrence: "interval", interval_minutes: n },
      tz, now,
    );
  }

  // "every hour"
  if (/every\s+hour/.test(lower)) {
    return buildFromStructured({ recurrence: "hourly" }, tz, now);
  }

  // "every weekday/weekend"
  const wkSetMatch = lower.match(/every\s+(weekday|weekend)s?\s*(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (wkSetMatch) {
    const kind = wkSetMatch[1] === "weekday" ? "weekdays" : "weekends";
    const t = parseHourMinAmPm(wkSetMatch[2], wkSetMatch[3], wkSetMatch[4]);
    if (t) return buildFromStructured({ recurrence: kind as Recurrence, at_time: `${pad(t.hour)}:${pad(t.minute)}` }, tz, now);
  }

  // "every (mon|tue|...) at H[:MM] [am|pm]"
  const dowMap: Record<string, Weekday> = {
    sunday: "sun", monday: "mon", tuesday: "tue", wednesday: "wed",
    thursday: "thu", friday: "fri", saturday: "sat",
    sun: "sun", mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat",
  };
  const everyDowMatch = lower.match(/every\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\s*(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (everyDowMatch) {
    const wk = dowMap[everyDowMatch[1]];
    const t = parseHourMinAmPm(everyDowMatch[2], everyDowMatch[3], everyDowMatch[4]);
    if (wk && t) return buildFromStructured({ recurrence: "weekly", weekdays: [wk], at_time: `${pad(t.hour)}:${pad(t.minute)}` }, tz, now);
  }

  // "every day at H[:MM] [am|pm]" / "နေ့တိုင်း H နာရီ"
  const everyDayMatch = lower.match(/every\s*day\s*(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/) ||
    raw.match(/နေ့တိုင်း\s*(\d{1,2})(?::(\d{2}))?\s*(?:နာရီ)?\s*(am|pm)?/i);
  if (everyDayMatch) {
    const t = parseHourMinAmPm(everyDayMatch[1], everyDayMatch[2], everyDayMatch[3]);
    if (t) return buildFromStructured({ recurrence: "daily", at_time: `${pad(t.hour)}:${pad(t.minute)}` }, tz, now);
  }

  // "in N min/hour"
  const inMatch = lower.match(/(?:in\s+)?(\d+)\s*(min(?:ute)?s?|hour|hours|hr|hrs|နာရီ|မိနစ်)/);
  if (inMatch) {
    const amount = Number(inMatch[1]);
    const isHour = inMatch[2].startsWith("h") || inMatch[2] === "နာရီ";
    const ms = isHour ? amount * 3600000 : amount * 60000;
    const target = new Date(now.getTime() + ms);
    return buildFromStructured({ recurrence: "one_off", start_at: target.toISOString() }, tz, now);
  }

  // "tomorrow at H[:MM]" / "မနက်ဖြန် H နာရီ"
  const tomorrowMatch = lower.match(/tomorrow\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/) ||
    raw.match(/မနက်ဖြန်\s*(\d{1,2})(?::(\d{2}))?\s*(?:နာရီ)?\s*(am|pm)?/i);
  if (tomorrowMatch) {
    const t = parseHourMinAmPm(tomorrowMatch[1], tomorrowMatch[2], tomorrowMatch[3]);
    if (t) {
      const local = getLocalParts(now, tz);
      const tomorrow = new Date(now.getTime() + 86400000);
      const localT = getLocalParts(tomorrow, tz);
      const target = localDateTimeToUTC(localT.year, localT.month, localT.day, t.hour, t.minute, tz);
      return buildFromStructured({ recurrence: "one_off", start_at: target.toISOString() }, tz, now);
    }
  }

  // ISO datetime
  const isoMatch = raw.match(/(\d{4}-\d{2}-\d{2})[T\s]?(\d{1,2}):(\d{2})/);
  if (isoMatch) {
    const [, dateStr, hStr, mStr] = isoMatch;
    const [y, mo, d] = dateStr.split("-").map(Number);
    const target = localDateTimeToUTC(y, mo, d, Number(hStr), Number(mStr), tz);
    return buildFromStructured({ recurrence: "one_off", start_at: target.toISOString() }, tz, now);
  }

  // noon/midnight
  if (/noon/.test(lower)) return buildFromStructured({ recurrence: "one_off", at_time: "12:00" }, tz, now);
  if (/midnight/.test(lower)) return buildFromStructured({ recurrence: "one_off", at_time: "00:00" }, tz, now);

  // "at H[:MM] [am|pm]" or bare "H[:MM] am/pm"
  const atTimeMatch = lower.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?:\s*today)?/);
  if (atTimeMatch) {
    const t = parseHourMinAmPm(atTimeMatch[1], atTimeMatch[2], atTimeMatch[3]);
    if (t) return buildFromStructured({ recurrence: "one_off", at_time: `${pad(t.hour)}:${pad(t.minute)}` }, tz, now);
  }

  return {
    error: `Could not parse "${timeDesc}". Try structured params or examples: "every day at 8am", "every Monday at 9am", "in 30 minutes", "tomorrow at 9am", "2026-05-15 14:00".`,
    suggestions: [
      "Use structured params: recurrence + at_time + timezone",
      "Examples: { recurrence: 'daily', at_time: '08:00', timezone: 'Asia/Yangon' }",
      "Or: { recurrence: 'weekly', weekdays: ['mon','wed'], at_time: '09:00' }",
    ],
  };
}

function parseHourMinAmPm(hStr: string, mStr: string | undefined, ampm: string | undefined): { hour: number; minute: number } | null {
  let hour = Number(hStr);
  const minute = Number(mStr || "0");
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function extractTime(raw: string): { hour: number; minute: number } | null {
  const m = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i) || raw.match(/(\d{1,2})\s*နာရီ/);
  if (!m) return null;
  return parseHourMinAmPm(m[1], m[2], (m[3] || "").toLowerCase());
}

const pad = (n: number) => String(n).padStart(2, "0");

// ─── Public entry ────────────────────────────────────────────────────

export function parseSchedule(input: StructuredScheduleInput, timezone?: string, nowOverride?: Date): ScheduleResult | ScheduleError {
  const tz = timezone || "UTC";
  if (!isValidIanaTimezone(tz)) {
    return { error: `Invalid IANA timezone "${tz}". Examples: "Asia/Yangon", "America/New_York", "Europe/London".` };
  }
  const now = nowOverride && !isNaN(nowOverride.getTime()) ? nowOverride : new Date();

  const hasStructured = !!(
    input.recurrence || input.at_time || input.weekdays || input.day_of_month ||
    input.interval_minutes || input.interval_hours || input.start_at || input.cron_expression
  );

  if (hasStructured) {
    return buildFromStructured(input, tz, now);
  }
  if (input.time_desc) {
    return parseNL(input.time_desc, tz, now);
  }
  return { error: "Provide structured params (recurrence + at_time) or time_desc." };
}

// ─── Backward-compat shim for legacy callers ─────────────────────────

export function parseTimeDescriptionLegacy(timeDesc: string, timezone?: string):
  | { type: "one_off"; schedule_time: string; display_time: string; cron_expression?: string }
  | { type: "recurring"; cron_expression: string; display_time: string; schedule_time?: string }
  | null {
  const r = parseSchedule({ time_desc: timeDesc }, timezone);
  if (isScheduleError(r)) return null;
  if (r.schedule_kind === "one_off" && r.one_off_utc) {
    return { type: "one_off", schedule_time: r.one_off_utc, display_time: r.display_time_local };
  }
  if (r.schedule_kind === "recurring" && r.cron_expression_utc) {
    return { type: "recurring", cron_expression: r.cron_expression_utc, display_time: r.display_time_local };
  }
  return null;
}
