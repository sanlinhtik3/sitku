import { Card } from "@/components/ui/card";
import { Flame } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { useConsultantFinanceSummary } from "@/hooks/useConsultantData";
import {
  isFutureTimelineDay,
  timelineDayLabel,
  CONSULTANT_FINANCE_CURRENCY,
  type DateRange,
} from "@/lib/consultantHelpers";

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : String(Math.round(n ?? 0));
const fmtMoney = (n: number) =>
  `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n ?? 0)} ${CONSULTANT_FINANCE_CURRENCY}`;

interface Props { range: DateRange; periodLabel: string; }

export function SalesBarChart({ range, periodLabel }: Props) {
  const fin = useConsultantFinanceSummary(range);
  const rows = (fin.data?.by_day ?? []) as Array<{ entry_date: string; spend: number; revenue: number }>;

  // Image-19 style: dual vertical bars per period — green (revenue) + red (spend).
  const bars = rows.map((r) => {
    const isFuture = isFutureTimelineDay(r.entry_date);
    const revenue = Number(r.revenue || 0);
    const spend = Number(r.spend || 0);
    return {
      date: timelineDayLabel(r.entry_date, range),
      revenue: isFuture ? null : revenue,
      spend: isFuture ? null : spend,
      actualRevenue: revenue,
      actualSpend: spend,
      isFuture,
    };
  });

  const totalRevenue = bars.reduce((s, b) => s + b.actualRevenue, 0);
  const totalSpend = bars.reduce((s, b) => s + b.actualSpend, 0);
  const totalNet = totalRevenue - totalSpend;
  const winning = totalRevenue > totalSpend;
  const hasFinancialData = totalRevenue > 0 || totalSpend > 0;

  return (
    <Card className="consultant-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{periodLabel} Revenue vs Spend</div>
          <div className="text-lg font-semibold tabular-nums mt-0.5">
            {fmt(Math.abs(totalNet))} <span className="text-xs text-muted-foreground">net {CONSULTANT_FINANCE_CURRENCY}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="flex items-center gap-1 text-[9px] text-emerald-400"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" />Revenue</span>
            <span className="flex items-center gap-1 text-[9px] text-rose-400"><span className="inline-block w-2 h-2 rounded-sm bg-rose-500" />Spend</span>
          </div>
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full
          ${winning ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                    : "bg-rose-500/15 text-rose-300 border border-rose-500/30"}`}>
          <Flame className="h-3 w-3" />
          {winning ? "Winning Streak" : "Recovery Mode"}
        </div>
      </div>

      <div className="h-[220px]">
        {!hasFinancialData ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            No financial data for {periodLabel.toLowerCase()}.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} barCategoryGap="30%" barGap={2}>
              <CartesianGrid stroke="hsl(var(--border) / 0.15)" vertical={false} />
              <XAxis dataKey="date" interval={0} minTickGap={0} stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v)} width={32} />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted) / 0.2)" }}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11, borderRadius: 8 }}
                formatter={(v: number | null, name: string) => [v == null ? "Future" : fmtMoney(v), name === "revenue" ? "Revenue" : "Spend"]}
              />
              <Bar dataKey="revenue" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={8} />
              <Bar dataKey="spend" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={8} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
