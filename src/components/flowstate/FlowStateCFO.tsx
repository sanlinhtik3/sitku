import { lazy, Suspense, useState, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { consultantRangeForPreset, type ConsultantRangePreset } from "@/lib/consultantHelpers";
import { useFlowStateIncomeIntelligence } from "@/hooks/useFlowStateIncomeIntelligence";
import { FinanceRangeSelector } from "@/components/flowstate/intelligence/FinanceRangeSelector";

// Lazy — Recharts (~499KB) only pulled in when the CFO tab is open AND has data.
const IncomeSourceDonut = lazy(() => import("@/components/flowstate/intelligence/IncomeSourceDonut").then((m) => ({ default: m.IncomeSourceDonut })));
const IncomeNetTimeline = lazy(() => import("@/components/flowstate/intelligence/IncomeNetTimeline").then((m) => ({ default: m.IncomeNetTimeline })));
// Eager — no Recharts; cheap and always wanted as soon as the income section paints.
import { IncomeKpiStrip } from "@/components/flowstate/intelligence/IncomeKpiStrip";
import { TopIncomeSources } from "@/components/flowstate/intelligence/TopIncomeSources";
import { TodayIncomeList } from "@/components/flowstate/intelligence/TodayIncomeList";
import { IncomeBriefCard } from "@/components/flowstate/intelligence/IncomeBriefCard";

const ChartSkeleton = ({ h = 260 }: { h?: number }) => (
  <div className="consultant-card p-4">
    <div className="flex items-center justify-center text-xs text-muted-foreground gap-2" style={{ height: h }}>
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  </div>
);

interface FlowStateCFOProps {
  userId: string;
  currency: string;
  /** Retained for backward-compat with existing callers (FlowStateDialog); no longer used. */
  onOpenInBeeBot?: (prompt: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- onOpenInBeeBot kept for API stability after CFO Suite removal.
export function FlowStateCFO({ userId, currency, onOpenInBeeBot: _onOpenInBeeBot }: FlowStateCFOProps) {
  // ── Income Intelligence range — single source of truth for the whole tab. ──
  const [incomeRangePreset, setIncomeRangePreset] = useState<ConsultantRangePreset>("this_week");
  const incomeRangeSel = useMemo(() => consultantRangeForPreset(incomeRangePreset), [incomeRangePreset]);
  const incomeIntel = useFlowStateIncomeIntelligence(userId, incomeRangeSel.range, currency);

  const ii = incomeIntel.data;

  return (
    <div className="space-y-4">
      {/* ─── Income Intelligence ─── */}
      <section aria-label="Income intelligence" className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Income Intelligence</div>
            <div className="text-sm font-semibold mt-0.5">{incomeRangeSel.label} · by source</div>
          </div>
          <FinanceRangeSelector value={incomeRangePreset} onChange={setIncomeRangePreset} />
        </div>

        {/* 4-cell KPI strip (today vs period, source count, Δ vs prev). */}
        <IncomeKpiStrip
          todayIncome={ii?.todayEntries.reduce((s, e) => s + e.amount, 0) ?? 0}
          periodIncome={ii?.totals.income ?? 0}
          sourceCount={ii?.totals.sourceCount ?? 0}
          deltaIncomePct={ii?.totals.deltaIncomePct ?? null}
          currency={currency}
          periodLabel={incomeRangeSel.label}
        />

        {/* Donut + Timeline — primary visual pair. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Suspense fallback={<ChartSkeleton />}>
            <IncomeSourceDonut
              bySource={ii?.bySource ?? []}
              totalIncome={ii?.totals.income ?? 0}
              sourceCount={ii?.totals.sourceCount ?? 0}
              currency={currency}
              periodLabel={incomeRangeSel.label}
            />
          </Suspense>
          <Suspense fallback={<ChartSkeleton />}>
            <IncomeNetTimeline
              byDay={ii?.byDay ?? []}
              range={incomeRangeSel.range}
              currency={currency}
              periodLabel={incomeRangeSel.label}
              totalIncome={ii?.totals.income ?? 0}
              totalExpense={ii?.totals.expense ?? 0}
              deltaIncomePct={ii?.totals.deltaIncomePct ?? null}
            />
          </Suspense>
        </div>

        {/* Brief (auto-observations) + Top Sources (period) + Today's entries. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <IncomeBriefCard data={ii} currency={currency} periodLabel={incomeRangeSel.label} />
          <TopIncomeSources
            rows={ii?.topSources ?? []}
            totalIncome={ii?.totals.income ?? 0}
            currency={currency}
            periodLabel={incomeRangeSel.label}
          />
          <TodayIncomeList entries={ii?.todayEntries ?? []} currency={currency} />
        </div>
      </section>
    </div>
  );
}
