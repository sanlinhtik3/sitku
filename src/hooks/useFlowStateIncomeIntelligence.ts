// ── Income Intelligence aggregation hook ───────────────────────────────────
// One hook → one shape → many widgets. Mirrors `useConsultantFinanceSummary`
// but for FlowState's personal-finance income side, with a 2-level drilldown
// (category ▸ sub-source). Reads `financeStore` (already local, see
// flowstate-local-finance memory) and converts all amounts to `primaryCurrency`
// via `useExchangeRates`.
//
// Consumers: FinanceRangeSelector + IncomeSourceDonut + IncomeNetTimeline +
// (P2) IncomeVsExpenseBars + TopIncomeSources + TodayIncomeList.

import { useQuery } from "@tanstack/react-query";
import { financeStore } from "@/repositories/local/financeStore";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import {
  eachDayInRange,
  localDateString,
  type DateRange,
} from "@/hooks/useConsultantData";

const UNATTRIBUTED = "Unattributed";

export interface IncomeSubSourceRow {
  name: string;          // sub-source label, e.g. "Client A" or "Unattributed"
  amount: number;
  pct: number;           // % of parent category
  count: number;
}

export interface IncomeSourceRow {
  source: string;        // income category name (e.g. "Salary", "Business")
  icon: string;
  color: string;
  amount: number;
  pct: number;           // % of total income
  count: number;
  subSources: IncomeSubSourceRow[];
}

export interface IncomeDayRow {
  date: string;          // yyyy-mm-dd
  income: number;
  expense: number;
  net: number;
}

export interface TopIncomeSourceRow {
  source: string;        // category name
  subSource?: string | null;
  amount: number;
  pct: number;
  count: number;
}

export interface TodayIncomeEntryRow {
  id: string;
  time: string;          // ISO date for sort; widgets format display
  category: string;
  source: string;        // sub-source or "Unattributed"
  amount: number;
  currency: string;
  note: string | null;
}

export interface IncomeIntelligence {
  totals: {
    income: number;
    expense: number;
    net: number;
    sourceCount: number;       // distinct (category × sub-source) seen in range
    deltaIncomePct: number | null;  // vs previous equal-length period
  };
  bySource: IncomeSourceRow[];
  byDay: IncomeDayRow[];
  topSources: TopIncomeSourceRow[];
  todayEntries: TodayIncomeEntryRow[];
  /** "category::sub-source" keys that appeared in the previous equal-length period.
      Used by IncomeBriefCard to flag sources that are NEW this period. */
  prevSourceKeys: string[];
}

// Local equivalent of useConsultantData's previousRange (kept local; tiny).
function previousRange(range: DateRange): DateRange {
  const fromMs = new Date(range.from + "T00:00:00").getTime();
  const toMs = new Date(range.to + "T00:00:00").getTime();
  const days = Math.max(1, Math.round((toMs - fromMs) / 86_400_000) + 1);
  const prevTo = new Date(fromMs - 86_400_000);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86_400_000);
  return { from: localDateString(prevFrom), to: localDateString(prevTo) };
}

/**
 * Build the Income Intelligence payload for a user, range, and target currency.
 * React-query is used so widgets that consume the same range share one cache entry.
 */
export function useFlowStateIncomeIntelligence(
  userId: string | undefined,
  range: DateRange,
  primaryCurrency: string,
) {
  const { convert, isFallback, isLoading: ratesLoading } = useExchangeRates("USD");

  return useQuery({
    queryKey: [
      "flowstate-income-intel",
      userId,
      range.from,
      range.to,
      primaryCurrency,
      // bust cache when the FX table flips between live & fallback
      isFallback ? "fallback" : "live",
    ],
    enabled: !!userId && !ratesLoading,
    queryFn: async (): Promise<IncomeIntelligence> => {
      if (!userId) {
        return {
          totals: { income: 0, expense: 0, net: 0, sourceCount: 0, deltaIncomePct: null },
          bySource: [], byDay: [], topSources: [], todayEntries: [], prevSourceKeys: [],
        };
      }

      const toPrimary = (amt: number, cur: string) =>
        cur === primaryCurrency ? amt : convert(amt, cur, primaryCurrency);

      // ── Pull current + previous period in parallel ─────────────────────
      const prev = previousRange(range);
      const [rows, prevRows] = await Promise.all([
        financeStore.listTransactions(userId, range.from, range.to),
        financeStore.listTransactions(userId, prev.from, prev.to),
      ]);

      // ── Totals (current) ───────────────────────────────────────────────
      let income = 0, expense = 0;
      for (const t of rows) {
        const v = toPrimary(Number(t.amount || 0), t.currency || primaryCurrency);
        if (t.type === "income") income += v;
        else if (t.type === "expense") expense += v;
      }
      const net = income - expense;

      // ── Previous-period income for delta + source-key set (for new-source flag) ──
      let prevIncome = 0;
      const prevSourceSet = new Set<string>();
      for (const t of prevRows) {
        if (t.type !== "income") continue;
        prevIncome += toPrimary(Number(t.amount || 0), t.currency || primaryCurrency);
        const cat = t.category?.name || "Uncategorized";
        const sub = (t.source && t.source.trim()) || UNATTRIBUTED;
        prevSourceSet.add(`${cat}::${sub}`);
      }
      const deltaIncomePct = prevIncome > 0
        ? Number((((income - prevIncome) / prevIncome) * 100).toFixed(1))
        : income > 0 ? 100 : null;

      // ── by-source / by-sub-source (income only) ────────────────────────
      type Bucket = { source: string; icon: string; color: string; amount: number; count: number; sub: Map<string, { amount: number; count: number }> };
      const buckets = new Map<string, Bucket>();
      const incomeRows = rows.filter((t) => t.type === "income");

      for (const t of incomeRows) {
        const catName = t.category?.name || "Uncategorized";
        const icon = t.category?.icon || "💰";
        const color = t.category?.color || "#22c55e";
        const subName = (t.source && t.source.trim()) || UNATTRIBUTED;
        const v = toPrimary(Number(t.amount || 0), t.currency || primaryCurrency);

        let b = buckets.get(catName);
        if (!b) {
          b = { source: catName, icon, color, amount: 0, count: 0, sub: new Map() };
          buckets.set(catName, b);
        }
        b.amount += v;
        b.count += 1;
        const sub = b.sub.get(subName) || { amount: 0, count: 0 };
        sub.amount += v;
        sub.count += 1;
        b.sub.set(subName, sub);
      }

      const bySource: IncomeSourceRow[] = [...buckets.values()]
        .map((b) => ({
          source: b.source,
          icon: b.icon,
          color: b.color,
          amount: round2(b.amount),
          pct: income > 0 ? Number(((b.amount / income) * 100).toFixed(1)) : 0,
          count: b.count,
          subSources: [...b.sub.entries()]
            .map(([name, v]) => ({
              name,
              amount: round2(v.amount),
              pct: b.amount > 0 ? Number(((v.amount / b.amount) * 100).toFixed(1)) : 0,
              count: v.count,
            }))
            .sort((a, c) => c.amount - a.amount),
        }))
        .sort((a, c) => c.amount - a.amount);

      // Distinct source count = sum of distinct sub-source labels across categories.
      const sourceCount = bySource.reduce((s, b) => s + b.subSources.length, 0);

      // ── by-day (range-filled with zeros so the chart has stable x-axis) ──
      const dayMap = new Map<string, IncomeDayRow>();
      for (const d of eachDayInRange(range)) dayMap.set(d, { date: d, income: 0, expense: 0, net: 0 });
      for (const t of rows) {
        const d = t.transaction_date?.slice(0, 10);
        if (!d || !dayMap.has(d)) continue;
        const row = dayMap.get(d)!;
        const v = toPrimary(Number(t.amount || 0), t.currency || primaryCurrency);
        if (t.type === "income") row.income += v;
        else if (t.type === "expense") row.expense += v;
      }
      const byDay: IncomeDayRow[] = [...dayMap.values()].map((r) => ({
        date: r.date,
        income: round2(r.income),
        expense: round2(r.expense),
        net: round2(r.income - r.expense),
      }));

      // ── topSources (flatten category › sub-source, rank desc) ──────────
      const topSources: TopIncomeSourceRow[] = bySource.flatMap((b) =>
        b.subSources.map((s) => ({
          source: b.source,
          subSource: s.name === UNATTRIBUTED ? null : s.name,
          amount: s.amount,
          pct: income > 0 ? Number(((s.amount / income) * 100).toFixed(1)) : 0,
          count: s.count,
        })),
      ).sort((a, c) => c.amount - a.amount).slice(0, 10);

      // ── todayEntries (today's income rows for the "Today" widget) ──────
      const todayStr = localDateString();
      const todayEntries: TodayIncomeEntryRow[] = incomeRows
        .filter((t) => t.transaction_date?.slice(0, 10) === todayStr)
        .sort((a, c) => (c.created_at || "").localeCompare(a.created_at || ""))
        .map((t) => ({
          id: t.id,
          time: t.created_at || t.transaction_date,
          category: t.category?.name || "Uncategorized",
          source: (t.source && t.source.trim()) || UNATTRIBUTED,
          amount: round2(toPrimary(Number(t.amount || 0), t.currency || primaryCurrency)),
          currency: primaryCurrency,
          note: t.description ?? null,
        }));

      return {
        totals: {
          income: round2(income),
          expense: round2(expense),
          net: round2(net),
          sourceCount,
          deltaIncomePct,
        },
        bySource,
        byDay,
        topSources,
        todayEntries,
        prevSourceKeys: [...prevSourceSet],
      };
    },
  });
}

function round2(n: number) { return Math.round(n * 100) / 100; }
