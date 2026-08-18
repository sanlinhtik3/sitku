// Income / Expense / Net per-day timeline (Recharts multi-line).
// Visual sibling of the consultant's `KpiIntelligenceChart`, but pure money
// (no growth/engagement). Range-filled with zeros by the hook so the x-axis is
// stable across "today/week/month/28d/90d" without gaps.

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { timelineDayLabel, type DateRange } from "@/lib/consultantHelpers";
import type { IncomeDayRow } from "@/hooks/useFlowStateIncomeIntelligence";
import { FuiBadge, FuiChartLegend, FuiMetric, FuiWidget } from "@/design-system/fui";

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
  const deltaTone = deltaIncomePct == null ? "offline" : deltaIncomePct >= 0 ? "success" : "danger";

  return (
    <FuiWidget
      className="flowstate-income-timeline"
      eyebrow={`${periodLabel} Income Timeline`}
      title="Daily income · expense · net"
      description="Daily movement inside the selected period"
      action={(
        <FuiBadge tone={deltaTone}>
          {deltaIncomePct == null ? "No baseline" : `${deltaIncomePct >= 0 ? "+" : ""}${deltaIncomePct.toFixed(1)}% vs prev`}
        </FuiBadge>
      )}
    >
      <FuiChartLegend items={[
        { label: "Income", color: "var(--bb-positive)" },
        { label: "Expense", color: "var(--bb-negative)" },
        { label: "Net", color: "var(--bb-info)", dashed: true },
      ]} className="mb-2" />
      <div className="flowstate-chart-canvas h-[228px]">
        {!hasData ? (
          <div className="flowstate-chart-empty">
            No transactions in this period.<br/>Add income / expense to unlock the timeline.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              <CartesianGrid stroke="var(--fui-chart-grid, hsl(var(--border) / 0.14))" vertical={false} />
              <XAxis dataKey="dateLabel" interval="preserveStartEnd" stroke="var(--bb-text-4)" fontSize={9} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--bb-text-4)" fontSize={9} tickLine={false} axisLine={false} width={42} tickFormatter={(v) => fmt(Number(v), currency)} />
              <Tooltip
                contentStyle={{ background: "var(--bb-bg-2)", border: "1px solid var(--bb-border)", color: "var(--bb-text-1)", fontSize: 11, borderRadius: "var(--bb-radius-control)" }}
                formatter={(v: number, name: string) => [fmt(Number(v), currency), name]}
                labelFormatter={(l) => `${l}`}
              />
              <ReferenceLine y={0} stroke="var(--bb-border)" strokeDasharray="2 4" />
              <Line type="monotone" dataKey="income"  name="Income"  stroke="var(--bb-positive)" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="expense" name="Expense" stroke="var(--bb-negative)" strokeWidth={2.0} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="net"     name="Net"     stroke="var(--bb-info)" strokeWidth={1.8} strokeDasharray="4 3" dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flowstate-chart-summary grid grid-cols-3 gap-2">
        <div>
          <div>Income</div>
          <FuiMetric className="text-[var(--bb-positive)]">{fmt(totalIncome, currency)}</FuiMetric>
        </div>
        <div>
          <div>Expense</div>
          <FuiMetric className="text-[var(--bb-negative)]">{fmt(totalExpense, currency)}</FuiMetric>
        </div>
        <div>
          <div>Net</div>
          <FuiMetric className={net >= 0 ? "text-[var(--bb-info)]" : "text-[var(--bb-negative)]"}>{fmt(net, currency)}</FuiMetric>
        </div>
      </div>
    </FuiWidget>
  );
}
