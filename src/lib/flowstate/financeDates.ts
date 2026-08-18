import { formatLocalDate, formatLocalDateTime, parseLocalDate } from "@/lib/dateUtils";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface FlowStateDeviceTime {
  transaction_date: string;
  occurred_at: string;
  timezone: string;
  timezone_offset_minutes: number;
}

export function transactionDateKey(input?: string | Date | null, fallback: Date = new Date()): string {
  if (input instanceof Date) return formatLocalDate(input);
  if (!input) return formatLocalDate(fallback);

  const raw = String(input).trim();
  if (DATE_ONLY_RE.test(raw)) return raw;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return formatLocalDate(parsed);

  const datePrefix = raw.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  return datePrefix ?? formatLocalDate(fallback);
}

export function isTransactionDateInRange(input: string | Date | null | undefined, from: string, to: string): boolean {
  const day = transactionDateKey(input);
  return day >= from && day <= to;
}

export function transactionMonthKey(input: string | Date | null | undefined): string {
  return transactionDateKey(input).slice(0, 7);
}

export function parseTransactionLocalDate(input: string | Date | null | undefined): Date {
  return parseLocalDate(transactionDateKey(input));
}

export function captureDeviceTransactionTime(input?: string | Date | null, now: Date = new Date()): FlowStateDeviceTime {
  const transactionDate = transactionDateKey(input, now);
  const localTime = formatLocalDateTime(now).slice(11);

  return {
    transaction_date: transactionDate,
    occurred_at: `${transactionDate}T${localTime}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
    timezone_offset_minutes: -now.getTimezoneOffset(),
  };
}
