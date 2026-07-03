// Pure helpers + types shared between the consultant dashboard (useConsultantData)
// and the chart parts (KpiIntelligenceChart, ActivityInsightsCard, SalesBarChart,
// IncomeNetTimeline). Extracted to break a production TDZ crash: the chart parts
// are bundled into the `vendor-charts` chunk, and importing these values from
// the consultant hook pulled the dashboard → chart parts → back into the chunk,
// so Rolldown evaluated the cycle before the helpers were initialized.
//
// This module has NO React and NO hook imports — it can't be part of any cycle.

export interface DateRange { from: string; to: string; }

export const CONSULTANT_FINANCE_CURRENCY = "USDT";

export type ConsultantRangePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "last_7_days"
  | "last_28_days"
  | "last_90_days";

export interface ConsultantRangeSelection {
  preset: ConsultantRangePreset;
  label: string;
  shortLabel: string;
  range: DateRange;
}

export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function defaultRange(days = 7): DateRange {
  const to = new Date();
  const from = new Date(); from.setDate(to.getDate() - (days - 1));
  return { from: localDateString(from), to: localDateString(to) };
}

export function consultantRangeForPreset(preset: ConsultantRangePreset): ConsultantRangeSelection {
  const today = new Date();
  const from = new Date(today);
  const to = new Date(today);
  const startOfWeek = (d: Date) => {
    const next = new Date(d);
    const day = next.getDay();
    const diff = day === 0 ? 6 : day - 1;
    next.setDate(next.getDate() - diff);
    return next;
  };
  const endOfWeek = (d: Date) => {
    const next = startOfWeek(d);
    next.setDate(next.getDate() + 6);
    return next;
  };
  const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

  switch (preset) {
    case "today":
      return { preset, label: "Today", shortLabel: "Today", range: { from: localDateString(today), to: localDateString(today) } };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { preset, label: "Yesterday", shortLabel: "Yesterday", range: { from: localDateString(y), to: localDateString(y) } };
    }
    case "this_week":
      return { preset, label: "This Week", shortLabel: "Week", range: { from: localDateString(startOfWeek(today)), to: localDateString(endOfWeek(today)) } };
    case "this_month":
      return { preset, label: "This Month", shortLabel: "Month", range: { from: localDateString(new Date(today.getFullYear(), today.getMonth(), 1)), to: localDateString(endOfMonth(today)) } };
    case "last_28_days":
      from.setDate(to.getDate() - 27);
      return { preset, label: "Last 28 Days", shortLabel: "28D", range: { from: localDateString(from), to: localDateString(to) } };
    case "last_90_days":
      from.setDate(to.getDate() - 89);
      return { preset, label: "Last 90 Days", shortLabel: "90D", range: { from: localDateString(from), to: localDateString(to) } };
    case "last_7_days":
    default:
      from.setDate(to.getDate() - 6);
      return { preset: "last_7_days", label: "Last 7 Days", shortLabel: "7D", range: { from: localDateString(from), to: localDateString(to) } };
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(s: string) {
  const [year, month, day] = s.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fmtDate(d);
}

function daysInclusive(range: DateRange) {
  return Math.max(1, Math.round((parseDate(range.to).getTime() - parseDate(range.from).getTime()) / DAY_MS) + 1);
}

export function eachDayInRange(range: DateRange) {
  const totalDays = daysInclusive(range);
  return Array.from({ length: totalDays }, (_, index) => addDays(range.from, index));
}

export function timelineDayLabel(date: string, range: DateRange) {
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  const sameMonth = sameYear && range.from.slice(5, 7) === range.to.slice(5, 7);
  return sameMonth ? date.slice(8) : date.slice(5);
}

export function isFutureTimelineDay(date: string) {
  return date > localDateString();
}
