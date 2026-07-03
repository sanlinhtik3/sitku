import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { useMemo } from "react";
import { useConsultantMetrics } from "@/hooks/useConsultantData";
import {
  eachDayInRange,
  isFutureTimelineDay,
  timelineDayLabel,
  type DateRange,
} from "@/lib/consultantHelpers";

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : String(Math.round(n ?? 0));

export function ActivityInsightsCard({ range, periodLabel }: { range: DateRange; periodLabel: string }) {
  const metrics = useConsultantMetrics();

  const series = useMemo(() => {
    const byDay = new Map<string, number>();
    eachDayInRange(range).forEach((date) => byDay.set(date, 0));
    (metrics.data ?? []).forEach((m) => {
      if (m.metric_date < range.from || m.metric_date > range.to) return;
      byDay.set(m.metric_date, (byDay.get(m.metric_date) ?? 0) + m.likes + m.comments + m.shares + m.saves);
    });
    return Array.from(byDay, ([date, engagement]) => ({ date, dateLabel: timelineDayLabel(date, range), engagement, isFuture: isFutureTimelineDay(date) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [metrics.data, range]);

  const chartSeries = series.map((p) => p.isFuture ? { ...p, engagement: null } : p);
  const completedSeries = series.filter((p) => !p.isFuture);
  const total = series.reduce((s, p) => s + p.engagement, 0);
  const peak = series.reduce((m, p) => Math.max(m, p.engagement), 0);
  const hasActivityData = total > 0;

  const churn = useMemo(() => {
    if (completedSeries.length < 2) return null;
    const mid = Math.floor(completedSeries.length / 2);
    const avg = (arr: typeof completedSeries) => arr.reduce((s, p) => s + p.engagement, 0) / arr.length;
    const early = avg(completedSeries.slice(0, mid));
    const late = avg(completedSeries.slice(mid));
    if (early === 0) return null;
    return ((early - late) / early) * 100;
  }, [completedSeries]);

  return (
    <Card className="consultant-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{periodLabel} Activity</div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-lg font-semibold tabular-nums">{fmt(total)}</span>
            <span className="text-[10px] text-muted-foreground">engagement events</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground">Peak day</div>
            <div className="text-xs font-semibold tabular-nums text-emerald-300">{fmt(peak)}</div>
          </div>
          {churn !== null && (
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground">{churn > 0 ? "Churn" : "Growth"}</div>
              <div className={`text-xs font-semibold tabular-nums ${churn > 0 ? "text-rose-400" : "text-emerald-300"}`}>
                {churn > 0 ? "+" : ""}{Math.abs(churn).toFixed(1)}%
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="h-[160px]">
        {!hasActivityData ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            No engagement signals for {periodLabel.toLowerCase()}.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartSeries}>
              <defs>
                <linearGradient id="engGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#22c55e" />
                  <stop offset="100%" stopColor="#84cc16" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border) / 0.15)" vertical={false} />
              <XAxis dataKey="dateLabel" interval={0} minTickGap={0} stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} width={28} tickFormatter={(v) => fmt(v)} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11, borderRadius: 8 }}
                formatter={(v: number | null) => v == null ? ["Future", "Engagement"] : [fmt(Number(v)), "Engagement"]}
              />
              <Line type="monotone" dataKey="engagement" stroke="url(#engGrad)" strokeWidth={2.5} dot={{ r: 2.5, fill: "#22c55e" }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
