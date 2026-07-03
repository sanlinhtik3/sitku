// ── Source Flow aggregation ────────────────────────────────────────────────
// Per-day, per-series cashflow for the Overview "Source Flow" chart:
//   • income series  → keyed by sub-source ("Facebook", "Binance Commission", …),
//                       stored POSITIVE (stack above the zero line)
//   • expense series → keyed by category ("Food", "Transport", …),
//                       stored NEGATIVE (stack below the zero line)
// Diverging stack → income up, expense down, net readable at a glance.
//
// Guards against spaghetti: only the top N income sources + top N expense
// categories get their own band; the rest collapse into "Other income" /
// "Other expense". A single-day range (Today) is flagged so the chart can fall
// back to bars (a line/area of one point is useless).
//
// Reads the local financeStore (see flowstate-local-finance memory); converts to
// `primaryCurrency` via useExchangeRates.

import { useQuery } from "@tanstack/react-query";
import { financeStore } from "@/repositories/local/financeStore";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { eachDayInRange, type DateRange } from "@/hooks/useConsultantData";

const TOP_N = 6;            // bands per side before bucketing into "Other"
const UNATTRIBUTED = "Unattributed";

// Known-platform brand colors — matched by substring so "Binance Commission" → binance.
const BRAND: Record<string, string> = {
  facebook: "#1877F2", messenger: "#1877F2", telegram: "#229ED9", binance: "#F0B90B",
  youtube: "#FF0000", instagram: "#E1306C", tiktok: "#25F4EE", twitter: "#1DA1F2", " x ": "#1DA1F2",
  linkedin: "#0A66C2", paypal: "#0070BA", stripe: "#635BFF", upwork: "#14A800", fiverr: "#1DBF73",
  patreon: "#FF424D", gumroad: "#FF90E8", payoneer: "#FF4800", wise: "#9FE870", github: "#8957e5",
  google: "#4285F4", adsense: "#4285F4", shopee: "#EE4D2D", lazada: "#0F146D", grab: "#00B14F",
  whatsapp: "#25D366", discord: "#5865F2", twitch: "#9146FF", reddit: "#FF4500",
  substack: "#FF6719", kofi: "#FF5E5B", "ko-fi": "#FF5E5B", apple: "#A2AAAD", amazon: "#FF9900",
  tether: "#26A17B", usdt: "#26A17B", bitcoin: "#F7931A", btc: "#F7931A", ethereum: "#627EEA",
};
const INCOME_PALETTE = ["#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#84cc16", "#34d399", "#2dd4bf"];
const EXPENSE_PALETTE = ["#f43f5e", "#fb7185", "#f97316", "#ef4444", "#e11d48", "#fb923c", "#dc2626"];
const OTHER_COLOR = "#94a3b8";

function brandColor(name: string): string | null {
  const n = ` ${name.toLowerCase()} `;
  for (const key of Object.keys(BRAND)) {
    if (n.includes(key.trim())) return BRAND[key];
  }
  return null;
}

export type SeriesKind = "income" | "expense";

export interface FlowSeries {
  key: string;        // safe recharts dataKey, e.g. "inc::Facebook"
  label: string;      // display name
  kind: SeriesKind;
  color: string;
  total: number;      // signed total over the range (income +, expense −)
}

export interface SourceFlow {
  /** Recharts rows: { date, dateLabel, [seriesKey]: signedAmount }. */
  rows: Array<Record<string, string | number>>;
  series: FlowSeries[];
  isSingleDay: boolean;
  totals: { income: number; expense: number; net: number };
}

function round2(n: number) { return Math.round(n * 100) / 100; }
function dayLabel(d: string, sameMonth: boolean) { return sameMonth ? d.slice(8) : d.slice(5); }

export function useFlowStateSourceFlow(
  userId: string | undefined,
  range: DateRange,
  primaryCurrency: string,
) {
  const { convert, isFallback, isLoading: ratesLoading } = useExchangeRates("USD");

  return useQuery({
    queryKey: ["flowstate-source-flow", userId, range.from, range.to, primaryCurrency, isFallback ? "fb" : "live"],
    enabled: !!userId && !ratesLoading,
    queryFn: async (): Promise<SourceFlow> => {
      const empty: SourceFlow = { rows: [], series: [], isSingleDay: range.from === range.to, totals: { income: 0, expense: 0, net: 0 } };
      if (!userId) return empty;

      const toPrimary = (amt: number, cur: string) =>
        cur === primaryCurrency ? amt : convert(amt, cur, primaryCurrency);

      const txns = await financeStore.listTransactions(userId, range.from, range.to);

      // ── 1. Totals per series label ───────────────────────────────────
      const incomeTotals = new Map<string, number>();
      const expenseTotals = new Map<string, { amount: number; color?: string }>();
      let incomeTotal = 0, expenseTotal = 0;

      for (const t of txns) {
        const v = toPrimary(Number(t.amount || 0), t.currency || primaryCurrency);
        if (t.type === "income") {
          const label = (t.source && t.source.trim()) || UNATTRIBUTED;
          incomeTotals.set(label, (incomeTotals.get(label) || 0) + v);
          incomeTotal += v;
        } else if (t.type === "expense") {
          const label = t.category?.name || "Uncategorized";
          const prev = expenseTotals.get(label);
          expenseTotals.set(label, { amount: (prev?.amount || 0) + v, color: t.category?.color || prev?.color });
          expenseTotal += v;
        }
      }

      // ── 2. Pick top-N per side, bucket the rest into "Other" ─────────
      const incomeSorted = [...incomeTotals.entries()].sort((a, b) => b[1] - a[1]);
      const expenseSorted = [...expenseTotals.entries()].sort((a, b) => b[1].amount - a[1].amount);

      const incomeKept = incomeSorted.slice(0, TOP_N);
      const incomeOther = incomeSorted.slice(TOP_N).reduce((s, [, v]) => s + v, 0);
      const expenseKept = expenseSorted.slice(0, TOP_N);
      const expenseOther = expenseSorted.slice(TOP_N).reduce((s, [, v]) => s + v.amount, 0);

      const series: FlowSeries[] = [];
      const labelToKey = new Map<string, { key: string; kind: SeriesKind; sign: 1 | -1 }>();

      incomeKept.forEach(([label], i) => {
        const key = `inc::${label}`;
        series.push({ key, label, kind: "income", color: brandColor(label) || INCOME_PALETTE[i % INCOME_PALETTE.length], total: round2(incomeTotals.get(label) || 0) });
        labelToKey.set(`inc::${label}`, { key, kind: "income", sign: 1 });
      });
      if (incomeOther > 0) {
        const key = "inc::__other__";
        series.push({ key, label: "Other income", kind: "income", color: OTHER_COLOR, total: round2(incomeOther) });
      }

      expenseKept.forEach(([label, v], i) => {
        const key = `exp::${label}`;
        series.push({ key, label, kind: "expense", color: v.color || EXPENSE_PALETTE[i % EXPENSE_PALETTE.length], total: round2(-v.amount) });
        labelToKey.set(`exp::${label}`, { key, kind: "expense", sign: -1 });
      });
      if (expenseOther > 0) {
        const key = "exp::__other__";
        series.push({ key, label: "Other expense", kind: "expense", color: OTHER_COLOR, total: round2(-expenseOther) });
      }

      const keptIncomeLabels = new Set(incomeKept.map(([l]) => l));
      const keptExpenseLabels = new Set(expenseKept.map(([l]) => l));

      // ── 3. Per-day rows (income +, expense −) ────────────────────────
      const days = eachDayInRange(range);
      const sameMonth = range.from.slice(0, 7) === range.to.slice(0, 7);
      const rowByDate = new Map<string, Record<string, string | number>>();
      for (const d of days) {
        const row: Record<string, string | number> = { date: d, dateLabel: dayLabel(d, sameMonth) };
        for (const s of series) row[s.key] = 0;
        rowByDate.set(d, row);
      }

      for (const t of txns) {
        const d = t.transaction_date?.slice(0, 10);
        const row = d && rowByDate.get(d);
        if (!row) continue;
        const v = round2(toPrimary(Number(t.amount || 0), t.currency || primaryCurrency));
        if (t.type === "income") {
          const label = (t.source && t.source.trim()) || UNATTRIBUTED;
          const key = keptIncomeLabels.has(label) ? `inc::${label}` : "inc::__other__";
          if (row[key] != null) row[key] = round2((row[key] as number) + v);
        } else if (t.type === "expense") {
          const label = t.category?.name || "Uncategorized";
          const key = keptExpenseLabels.has(label) ? `exp::${label}` : "exp::__other__";
          if (row[key] != null) row[key] = round2((row[key] as number) - v); // negative
        }
      }

      return {
        rows: [...rowByDate.values()],
        series,
        isSingleDay: range.from === range.to,
        totals: { income: round2(incomeTotal), expense: round2(expenseTotal), net: round2(incomeTotal - expenseTotal) },
      };
    },
  });
}
