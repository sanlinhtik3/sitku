import { format, formatDistanceToNow } from "date-fns";

/**
 * Date safety helpers — never throw on bad input.
 *
 * `Intl.DateTimeFormat.formatToParts` (used internally by date-fns `format`,
 * `formatDistanceToNow`, and `Date#toLocaleString`) throws `RangeError: Invalid
 * time value` whenever it receives an Invalid Date. A single bad timestamp
 * coming from the backend can crash an entire React subtree. These wrappers
 * return a fallback instead.
 */

export function safeDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  // Accept Date, ISO string, or epoch number/string
  const d = value instanceof Date ? value : new Date(value as string | number);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function safeFormat(value: unknown, fmt: string, fallback = "—"): string {
  const d = safeDate(value);
  if (!d) return fallback;
  try {
    return format(d, fmt);
  } catch {
    return fallback;
  }
}

export function safeDistanceToNow(value: unknown, fallback = ""): string {
  const d = safeDate(value);
  if (!d) return fallback;
  try {
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return fallback;
  }
}

export function safeLocaleString(value: unknown, fallback = "—"): string {
  const d = safeDate(value);
  if (!d) return fallback;
  try {
    return d.toLocaleString();
  } catch {
    return fallback;
  }
}
