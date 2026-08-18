import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
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

interface Props {
  analysis?: {
    range: DateRange;
    daily: Array<{ date: string; revenue: number; spend: number }>;
  } | null;
  periodLabel: string;
}

export function SalesBarChart({ analysis, periodLabel }: Props) {
  const range = analysis?.range ?? { from: "", to: "" };
  const rows = analysis?.daily ?? [];

  // Image-19 style: dual vertical bars per period — green (revenue) + red (spend).
  const bars = rows.map((r) => {
    const isFuture = isFutureTimelineDay(r.date);
    const revenue = Number(r.revenue || 0);
    const spend = Number(r.spend || 0);
    return {
      date: timelineDayLabel(r.date, range),
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
  const hasFinancialData = totalRevenue > 0 || totalSpend > 0;

  return (
    <Card className="consultant-card p-4 sm:px-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="consultant-section-title">Revenue vs spend</div>
          <div className="mt-0.5 text-[11.5px] text-[#8a8a8e]">Daily · {CONSULTANT_FINANCE_CURRENCY} · net {fmt(Math.abs(totalNet))}</div>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[11px] text-[#8a8a8e]">
          <span className="inline-flex items-center gap-1.5"><span className="h-[7px] w-[7px] rounded-[2.5px] bg-[var(--consultant-ac)]" />Rev</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-[7px] w-[7px] rounded-[2.5px] bg-[#fb7185]" />Spend</span>
        </div>
      </div>

      <div className="h-[123px]">
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
              <Bar dataKey="revenue" fill="var(--consultant-ac)" radius={[4, 4, 0, 0]} maxBarSize={10} animationDuration={800} animationEasing="ease-out" />
              <Bar dataKey="spend" fill="#fb7185" radius={[4, 4, 0, 0]} maxBarSize={10} animationDuration={800} animationEasing="ease-out" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
