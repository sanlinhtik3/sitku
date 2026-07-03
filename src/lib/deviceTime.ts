/**
 * Device-Time Sovereignty
 * ------------------------------------------------------------------
 * Single source-of-truth for "what time/zone is this user actually in?"
 * Every scheduling code path (manual forms, chat-side AI tools, Telegram
 * dialogs) MUST funnel through this so server-side cron stays anchored
 * to the user's real local clock — not the server's UTC clock.
 *
 * Why this exists:
 *   - `Intl.DateTimeFormat().resolvedOptions().timeZone` is wrong on
 *     ~3% of Asian devices (half-hour zones: Yangon UTC+6:30, Kolkata
 *     UTC+5:30, Kathmandu UTC+5:45). Browsers report them as
 *     "Asia/Bangkok" (UTC+7) instead, drifting cron by 30+ minutes.
 *   - `Date#getTimezoneOffset()` is the OS truth — we cross-check the
 *     two and override IANA when they disagree.
 */

/** Offset (minutes; negative = east) → IANA fallback for non-standard zones. */
export const OFFSET_TO_IANA: Record<number, string> = {
  [-330]: "Asia/Kolkata",     // UTC+5:30 India
  [-345]: "Asia/Kathmandu",   // UTC+5:45 Nepal
  [-390]: "Asia/Yangon",      // UTC+6:30 Myanmar
  [-210]: "Asia/Tehran",      // UTC+3:30 Iran
  [-270]: "Asia/Kabul",       // UTC+4:30 Afghanistan
  [-570]: "Australia/Darwin", // UTC+9:30
  [-630]: "Australia/Lord_Howe",
  [210]: "America/St_Johns",  // UTC-3:30 Newfoundland
  [-525]: "Australia/Eucla",  // UTC+8:45
  [-765]: "Pacific/Chatham",  // UTC+12:45
};

/** Known IANA zone → expected standard offset (minutes, getTimezoneOffset sign). */
export const IANA_EXPECTED_OFFSET: Record<string, number> = {
  "Asia/Yangon": -390,
  "Asia/Bangkok": -420,
  "Asia/Ho_Chi_Minh": -420,
  "Asia/Jakarta": -420,
  "Asia/Kolkata": -330,
  "Asia/Kathmandu": -345,
  "Asia/Tehran": -210,
  "Asia/Kabul": -270,
  "Asia/Singapore": -480,
  "Asia/Shanghai": -480,
  "Asia/Tokyo": -540,
  "Asia/Seoul": -540,
  "Australia/Darwin": -570,
  "Australia/Sydney": -660,
  "America/New_York": 300,
  "America/Chicago": 360,
  "America/Denver": 420,
  "America/Los_Angeles": 480,
  "Europe/London": 0,
  "Europe/Berlin": -60,
  "America/St_Johns": 210,
};

export function formatUtcOffset(offsetMinutes: number): string {
  // offsetMinutes from getTimezoneOffset: positive = west, negative = east
  const totalMinutes = -offsetMinutes;
  const sign = totalMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;
  return mins > 0 ? `UTC${sign}${hours}:${String(mins).padStart(2, "0")}` : `UTC${sign}${hours}`;
}

export interface DeviceTimeSnapshot {
  /** IANA zone, half-hour-corrected. Always valid for `Intl.DateTimeFormat`. */
  timezone: string;
  /** Signed minutes; negative = east of UTC (matches `getTimezoneOffset`). */
  offsetMinutes: number;
  /** "UTC+6:30" style label. */
  offsetLabel: string;
  /** Device "now" as ISO 8601 UTC instant — server's reference truth. */
  nowIso: string;
  /** "2026-04-30 14:32" in user's zone (24h, no seconds). */
  nowLocal: string;
  /** BCP-47 locale (navigator.language). */
  locale: string;
  /** True when our offset map overrode `Intl`'s reported zone. */
  corrected: boolean;
}

/**
 * Capture a frozen snapshot of the user's local time/zone right now.
 * Pure & sync. Safe to call inside event handlers.
 */
export function getDeviceTimeSnapshot(): DeviceTimeSnapshot {
  const now = new Date();
  const rawOffset = now.getTimezoneOffset();
  let intlZone = "UTC";
  try {
    intlZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch { /* keep UTC */ }

  const expected = IANA_EXPECTED_OFFSET[intlZone];
  const override = OFFSET_TO_IANA[rawOffset];
  let timezone = intlZone;
  let corrected = false;

  if (expected !== undefined && expected !== rawOffset && override) {
    // Intl is lying — device offset is the truth, take override.
    timezone = override;
    corrected = true;
  } else if (expected === undefined && override) {
    // Intl gave us a zone we don't know; offset matches a known correction.
    timezone = override;
    corrected = true;
  }

  // Format local "now" via Intl using the resolved zone.
  let nowLocal = "";
  try {
    nowLocal = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(now).replace(",", "");
  } catch {
    nowLocal = now.toISOString();
  }

  let locale = "en-US";
  try { locale = navigator.language || "en-US"; } catch { /* SSR */ }

  return {
    timezone,
    offsetMinutes: rawOffset,
    offsetLabel: formatUtcOffset(rawOffset),
    nowIso: now.toISOString(),
    nowLocal,
    locale,
    corrected,
  };
}

/**
 * Convert a local Y/M/D h:m in a specific IANA zone → UTC instant.
 * Mirrors the server-side `localDateTimeToUTC` algorithm in
 * `supabase/functions/_shared/schedule-parser.ts` so client-computed
 * cron and `next_run_at` match what the heartbeat runner expects.
 */
export function localDateTimeToUTC(
  year: number, month: number, day: number,
  hour: number, minute: number, tz: string,
): Date {
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  const asUTC = new Date(dateStr + "Z");
  // Offset of `tz` at this instant, in ms.
  let offsetMs = 0;
  try {
    const utcStr = asUTC.toLocaleString("en-US", { timeZone: "UTC" });
    const tzStr = asUTC.toLocaleString("en-US", { timeZone: tz });
    offsetMs = new Date(tzStr).getTime() - new Date(utcStr).getTime();
  } catch { /* keep 0 */ }
  return new Date(asUTC.getTime() - offsetMs);
}

/** Read local Y/M/D/H/M parts of a UTC instant, projected into `tz`. */
export function getLocalParts(date: Date, tz: string) {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts: Record<string, string> = {};
    for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour === "24" ? "0" : parts.hour),
      minute: Number(parts.minute),
    };
  } catch {
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes() };
  }
}

/**
 * Build a 5-field UTC cron from a local hour:minute in `tz`.
 * `dayOfWeek` is local (0=Sun..6=Sat); we shift if local→UTC crosses midnight.
 */
export function buildCronInTimezone(
  type: "hourly" | "daily" | "weekly" | "monthly",
  hour: number,
  minute: number,
  dayOfWeek: number,
  dayOfMonth: number,
  tz: string,
): string {
  // Anchor to today in the target zone, then convert to UTC.
  const now = new Date();
  const localToday = getLocalParts(now, tz);
  const utcAnchor = localDateTimeToUTC(
    localToday.year, localToday.month, localToday.day, hour, minute, tz,
  );
  const utcM = utcAnchor.getUTCMinutes();
  const utcH = utcAnchor.getUTCHours();

  switch (type) {
    case "hourly":
      return `${utcM} * * * *`;
    case "daily":
      return `${utcM} ${utcH} * * *`;
    case "weekly": {
      // Adjust dow if local→UTC crossed midnight.
      const dayShift = utcAnchor.getUTCDate() - localToday.day;
      const adjusted = ((dayOfWeek + dayShift) % 7 + 7) % 7;
      return `${utcM} ${utcH} * * ${adjusted}`;
    }
    case "monthly":
      return `${utcM} ${utcH} ${dayOfMonth} * *`;
  }
}

/** Compute the next UTC instant a local hour:minute will occur in `tz`. */
export function nextOneOffUtc(hour: number, minute: number, tz: string): string {
  const now = new Date();
  const local = getLocalParts(now, tz);
  let target = localDateTimeToUTC(local.year, local.month, local.day, hour, minute, tz);
  if (target.getTime() <= now.getTime()) {
    // Already passed today → roll to tomorrow (in local zone).
    const tomorrow = new Date(now.getTime() + 86400000);
    const lt = getLocalParts(tomorrow, tz);
    target = localDateTimeToUTC(lt.year, lt.month, lt.day, hour, minute, tz);
  }
  return target.toISOString();
}
