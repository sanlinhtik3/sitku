// Income / Expense / Net per-day timeline (Recharts multi-line).
// Visual sibling of the consultant's `KpiIntelligenceChart`, but pure money
// (no growth/engagement). Range-filled with zeros by the hook so the x-axis is
// stable across "today/week/month/28d/90d" without gaps.

import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine,
} from "recharts";
import { timelineDayLabel, type DateRange } from "@/lib/consultantHelpers";
import type { IncomeDayRow } from "@/hooks/useFlowStateIncomeIntelligence";

const fmt = (n: number, cur: string) => {
  const v = n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
          : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
          : String(Math.round(n || 0));
  if (cur === "MMK") return `${v}`;
  if (cur === "USD") return `${v}`;
  return v;
};

interface Props {
  byDay: IncomeDayRow[];
  range: DateRange;
  currency: string;
  periodLabel: string;
  totalIncome: number;
  totalExpense: number;
  deltaIncomePct: number | null;
}

export function IncomeNetTimeline({ byDay, range, currency, periodLabel, totalIncome, totalExpense, deltaIncomePct }: Props) {
  const rows = byDay.map((r) => ({ ...r, dateLabel: timelineDayLabel(r.date, range) }));
  const hasData = rows.some((r) => r.income > 0 || r.expense > 0);
  const net = totalIncome - totalExpense;

  return (
    <Card className="consultant-card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{periodLabel} Income Timeline</div>
          <div className="text-sm font-semibold mt-0.5">Daily income · expense · net</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] text-muted-foreground">Income vs prev</div>
          <div className={`text-sm font-semibold tabular-nums ${(deltaIncomePct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-400"}`}>
            {deltaIncomePct == null ? "—" : `${deltaIncomePct >= 0 ? "+" : ""}${deltaIncomePct.toFixed(1)}%`}
          </div>
        </div>
      </div>

      <div className="h-[260px]">
        {!hasData ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center px-4">
            No transactions in this period.<br/>Add income / expense to unlock the timeline.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              <CartesianGrid stroke="hsl(var(--border) / 0.14)" vertical={false} />
              <XAxis dataKey="dateLabel" interval="preserveStartEnd" stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} width={42} tickFormatter={(v) => fmt(Number(v), currency)} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11, borderRadius: 8 }}
                formatter={(v: number, name: string) => [fmt(Number(v), currency), name]}
                labelFormatter={(l) => `${l}`}
              />
              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="2 4" />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="income"  name="Income"  stroke="#22c55e" strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="expense" name="Expense" stroke="#f43f5e" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="net"     name="Net"     stroke="#38bdf8" strokeWidth={2.0} strokeDasharray="4 3" dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <div className="space-y-0.5">
          <div>Income</div>
          <div className="text-emerald-300 text-xs font-semibold tabular-nums">{fmt(totalIncome, currency)}</div>
        </div>
        <div className="space-y-0.5">
          <div>Expense</div>
          <div className="text-rose-400 text-xs font-semibold tabular-nums">{fmt(totalExpense, currency)}</div>
        </div>
        <div className="space-y-0.5">
          <div>Net</div>
          <div className={`${net >= 0 ? "text-sky-300" : "text-rose-400"} text-xs font-semibold tabular-nums`}>{fmt(net, currency)}</div>
        </div>
      </div>
    </Card>
  );
}
