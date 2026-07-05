import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import {
  useConsultantDailySnapshots,
  useConsultantFinanceSummary,
} from "@/hooks/useConsultantData";
import {
  eachDayInRange,
  isFutureTimelineDay,
  timelineDayLabel,
  CONSULTANT_FINANCE_CURRENCY,
  type DateRange,
} from "@/lib/consultantHelpers";

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K`
  : String(Math.round(n || 0));

interface Props {
  range: DateRange;
  dashboard?: {
    trend?: Array<{
      day: string;
      views?: number | string | null;
      engagement?: number | string | null;
    }>;
  } | null;
  periodLabel: string;
}

interface FinanceDay {
  entry_date: string;
  revenue?: number | string | null;
  spend?: number | string | null;
}

export function KpiIntelligenceChart({ range, dashboard, periodLabel }: Props) {
  const snapshots = useConsultantDailySnapshots(range);
  const finance = useConsultantFinanceSummary(range);

  const rows = useMemo(() => {
    const map = new Map<string, {
      date: string;
      views: number;
      engagement: number;
      followers: number;
      revenue: number;
      spend: number;
    }>();
    const ensure = (date: string) => {
      if (!map.has(date)) {
        map.set(date, { date, views: 0, engagement: 0, followers: 0, revenue: 0, spend: 0 });
      }
      return map.get(date)!;
    };

    eachDayInRange(range).forEach(ensure);

    (dashboard?.trend ?? []).forEach((p) => {
      const date = String(p.day);
      const r = ensure(date);
      r.views += Number(p.views || 0);
      r.engagement += Number(p.engagement || 0);
    });

    (snapshots.data ?? []).forEach((p) => {
      const r = ensure(p.captured_at);
      r.views += Number(p.total_views || 0);
      r.followers += Number(p.followers || 0);
      if (p.engagement_rate) r.engagement += Number(p.engagement_rate || 0);
    });

    const financeDays = (finance.data?.by_day ?? []) as FinanceDay[];
    financeDays.forEach((p) => {
      const r = ensure(p.entry_date);
      r.revenue += Number(p.revenue || 0);
      r.spend += Number(p.spend || 0);
    });

    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ ...r, dateLabel: timelineDayLabel(r.date, range), isFuture: isFutureTimelineDay(r.date) }));
  }, [dashboard?.trend, finance.data?.by_day, range, snapshots.data]);

  const chartRows = rows.map((r) => r.isFuture
    ? { ...r, views: null, engagement: null, followers: null, revenue: null, spend: null }
    : r
  );
  const activeRows = rows.filter((r) =>
    !r.isFuture && (r.views > 0 || r.engagement > 0 || r.followers > 0 || r.revenue > 0 || r.spend > 0)
  );
  const latest = activeRows[activeRows.length - 1];
  const previous = activeRows.length > 1 ? activeRows[activeRows.length - 2] : null;
  const momentum = latest && previous && previous.views > 0
    ? ((latest.views - previous.views) / previous.views) * 100
    : null;
  const hasChartData = activeRows.length > 0;

  return (
    <Card className="consultant-card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{periodLabel} KPI Timeline</div>
          <div className="text-sm font-semibold mt-0.5">Growth, money, and attention in one view</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] text-muted-foreground">Momentum</div>
          <div className={`text-sm font-semibold tabular-nums ${Number(momentum ?? 0) >= 0 ? "text-emerald-300" : "text-rose-400"}`}>
            {momentum == null ? "--" : `${momentum >= 0 ? "+" : ""}${momentum.toFixed(1)}%`}
          </div>
        </div>
      </div>

      <div className="h-[260px]">
        {!hasChartData ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            Add daily snapshots to unlock trend intelligence.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartRows}>
              <CartesianGrid stroke="hsl(var(--border) / 0.14)" vertical={false} />
              <XAxis dataKey="dateLabel" interval={0} minTickGap={0} stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} />
              <YAxis yAxisId="growth" stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} width={34} tickFormatter={(v) => fmt(Number(v))} />
              <YAxis yAxisId="money" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} width={34} tickFormatter={(v) => fmt(Number(v))} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11, borderRadius: 8 }}
                formatter={(v: number | null, name: string) => [v == null ? "Future" : fmt(Number(v)), name]}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 10 }} />
              <Line yAxisId="growth" type="monotone" dataKey="views" name="Views" stroke="#38bdf8" strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} animationDuration={700} animationEasing="ease-out" />
              <Line yAxisId="growth" type="monotone" dataKey="engagement" name="Engagement" stroke="#22c55e" strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} animationDuration={700} animationEasing="ease-out" />
              <Line yAxisId="growth" type="monotone" dataKey="followers" name="Followers" stroke="#a78bfa" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} animationDuration={700} animationEasing="ease-out" />
              <Line yAxisId="money" type="monotone" dataKey="revenue" name={`Revenue (${CONSULTANT_FINANCE_CURRENCY})`} stroke="#f59e0b" strokeWidth={2.3} dot={false} activeDot={{ r: 4 }} animationDuration={700} animationEasing="ease-out" />
              <Line yAxisId="money" type="monotone" dataKey="spend" name={`Spend (${CONSULTANT_FINANCE_CURRENCY})`} stroke="#fb7185" strokeWidth={2.1} dot={false} activeDot={{ r: 4 }} animationDuration={700} animationEasing="ease-out" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
