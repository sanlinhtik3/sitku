import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import {
  isFutureTimelineDay,
  timelineDayLabel,
} from "@/lib/consultantHelpers";

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K`
  : String(Math.round(n || 0));

interface Props {
  analysis?: {
    range: { from: string; to: string };
    daily: Array<{ date: string; views: number; engagement: number }>;
    peakDay?: { date: string } | null;
  } | null;
  periodLabel: string;
}

export function KpiIntelligenceChart({ analysis, periodLabel }: Props) {
  const range = analysis?.range ?? { from: "", to: "" };
  const rows = (analysis?.daily ?? []).map((row) => ({
    ...row,
    dateLabel: timelineDayLabel(row.date, range),
    isFuture: isFutureTimelineDay(row.date),
  }));

  const chartRows = rows.map((r) => r.isFuture
    ? { ...r, views: null, engagement: null }
    : r
  );
  const activeRows = rows.filter((r) =>
    !r.isFuture && (r.views > 0 || r.engagement > 0)
  );
  const latest = activeRows[activeRows.length - 1];
  const previous = activeRows.length > 1 ? activeRows[activeRows.length - 2] : null;
  const momentum = latest && previous && previous.views > 0
    ? ((latest.views - previous.views) / previous.views) * 100
    : null;
  const hasChartData = activeRows.length > 0;
  const peakLabel = analysis?.peakDay?.date
    ? new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${analysis.peakDay.date}T00:00:00Z`))
    : "--";

  return (
    <Card className="consultant-card p-4 sm:px-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="consultant-section-title">Momentum</div>
          <div className="text-[11.5px] text-[#8a8a8e] mt-0.5">Daily views & engagement · peak {peakLabel}</div>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[11px] text-[#8a8a8e]">
          <span className="inline-flex items-center gap-1.5"><span className="h-[7px] w-[7px] rounded-full bg-[#34d399]" />Views</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-[7px] w-[7px] rounded-full bg-[#c4b5fd]" />Engage</span>
        </div>
      </div>

      <div className="h-[123px]">
        {!hasChartData ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            Add daily snapshots to unlock trend intelligence.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartRows}>
              <defs><linearGradient id="consultantViewsArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#34d399" stopOpacity={.25}/><stop offset="1" stopColor="#34d399" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid stroke="hsl(var(--border) / 0.14)" vertical={false} />
              <XAxis dataKey="dateLabel" interval={0} minTickGap={0} stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} />
              <YAxis yAxisId="growth" stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} width={34} tickFormatter={(v) => fmt(Number(v))} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11, borderRadius: 8 }}
                formatter={(v: number | null, name: string) => [v == null ? "Future" : fmt(Number(v)), name]}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 10 }} />
              <Area yAxisId="growth" type="monotone" dataKey="views" name="Views" stroke="#34d399" fill="url(#consultantViewsArea)" strokeWidth={2.4} dot={false} activeDot={{ r: 4, fill:"#34d399" }} animationDuration={700} animationEasing="ease-out" />
              <Line yAxisId="growth" type="monotone" dataKey="engagement" name="Engagement" stroke="#c4b5fd" strokeWidth={2} dot={false} activeDot={{ r: 4 }} animationDuration={700} animationEasing="ease-out" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
