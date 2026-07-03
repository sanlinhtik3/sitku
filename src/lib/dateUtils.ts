/**
 * Date utilities that ALWAYS use the user's local browser/device time.
 * NEVER use toISOString() for date-only strings (it converts to UTC and shifts dates).
 * NEVER hardcode Myanmar, server, or UTC time for user-facing dates.
 */

/** Returns "YYYY-MM-DD" in the user's LOCAL timezone */
export function formatLocalDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parses "YYYY-MM-DD" as LOCAL date (not UTC) */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Returns local "YYYY-MM-DDTHH:mm:ss" without timezone suffix */
export function formatLocalDateTime(date: Date = new Date()): string {
  const d = formatLocalDate(date);
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${d}T${h}:${m}:${s}`;
}

/** Check if two dates are the same calendar day in local time */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Get start-of-day and end-of-day boundaries in local time, returned as ISO for DB queries */
export function getLocalDayBoundsUTC(date: Date): { start: string; end: string } {
  const localStart = new Date(date);
  localStart.setHours(0, 0, 0, 0);
  const localEnd = new Date(date);
  localEnd.setHours(23, 59, 59, 999);
  return {
    start: localStart.toISOString(),
    end: localEnd.toISOString(),
  };
}
