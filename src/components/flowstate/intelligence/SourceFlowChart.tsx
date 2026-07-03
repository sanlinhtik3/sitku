// Source Flow — diverging stacked chart of daily cashflow by SOURCE.
//   income sub-sources stack above 0, expense categories below 0.
// Toggle Area ↔ Line. Today (single-day range) falls back to horizontal bars
// since a 1-point line/area is meaningless. Brand-aware colors + rich tooltip.

import { useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { Card } from "@/components/ui/card";
import { AreaChart as AreaIcon, LineChart as LineIcon, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourceFlow, FlowSeries } from "@/hooks/useFlowStateSourceFlow";

const money = (n: number, cur: string) => {
  const v = Math.abs(n);
  const s = v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
          : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K`
          : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v || 0);
  const sym = cur === "MMK" ? "" : cur === "USD" ? "$" : cur === "THB" ? "฿" : "";
  const suffix = cur === "MMK" ? " Ks" : "";
  return `${n < 0 ? "−" : ""}${sym}${s}${suffix}`;
};

type Mode = "area" | "line";

interface Props {
  data: SourceFlow | undefined;
  currency: string;
  periodLabel: string;
}

interface TooltipPayloadItem { dataKey: string; value: number; }

function FlowTooltip({ active, payload, label, series, currency }: {
  active?: boolean; payload?: TooltipPayloadItem[]; label?: string; series: FlowSeries[]; currency: string;
}) {
  if (!active || !payload?.length) return null;
  const byKey = new Map(series.map((s) => [s.key, s]));
  const rows = payload
    .map((p) => ({ s: byKey.get(p.dataKey), value: Number(p.value || 0) }))
    .filter((r) => r.s && r.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  if (!rows.length) return null;
  const income = rows.filter((r) => r.s!.kind === "income").reduce((s, r) => s + r.value, 0);
  const expense = rows.filter((r) => r.s!.kind === "expense").reduce((s, r) => s + r.value, 0);
  const net = income + expense;

  return (
    <div className="rounded-lg border border-border/60 bg-card/95 backdrop-blur px-3 py-2 shadow-xl text-[11px] min-w-[160px]">
      <div className="font-semibold mb-1.5 text-foreground/90">{label}</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.s!.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: r.s!.color }} />
              <span className="truncate text-muted-foreground">{r.s!.label}</span>
            </span>
            <span className={cn("tabular-nums font-medium", r.s!.kind === "income" ? "text-emerald-300" : "text-rose-300")}>
              {money(r.value, currency)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-border/40 flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Net</span>
        <span className={cn("tabular-nums font-semibold", net >= 0 ? "text-emerald-300" : "text-rose-300")}>{money(net, currency)}</span>
      </div>
    </div>
  );
}

// Single-day fallback: horizontal bars (income right-ish, expense as magnitude).
function TodayBars({ data, currency }: { data: SourceFlow; currency: string }) {
  const items = data.series
    .map((s) => ({ s, value: Math.abs(s.total) }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value);
  const max = Math.max(0, ...items.map((i) => i.value));
  if (!items.length) {
    return <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground">No income or expense today.</div>;
  }
  return (
    <div className="h-[260px] overflow-y-auto custom-scrollbar pr-1 space-y-2 py-1">
      {items.map(({ s, value }) => (
        <div key={s.key} className="flex items-center gap-2.5">
          <span className="w-24 shrink-0 text-[11px] truncate flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
            {s.label}
          </span>
          <div className="flex-1 h-4 rounded-md bg-muted/25 overflow-hidden relative">
            <div className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, background: s.color, opacity: 0.85 }} />
          </div>
          <span className={cn("w-20 shrink-0 text-right text-[11px] tabular-nums font-medium", s.kind === "income" ? "text-emerald-300" : "text-rose-300")}>
            {money(s.kind === "expense" ? -value : value, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SourceFlowChart({ data, currency, periodLabel }: Props) {
  const [mode, setMode] = useState<Mode>("area");
  const series = data?.series ?? [];
  const rows = data?.rows ?? [];
  const hasData = series.length > 0 && rows.some((r) => series.some((s) => Number(r[s.key]) !== 0));

  return (
    <Card className="consultant-card p-4">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{periodLabel} Source Flow</div>
          <div className="text-sm font-semibold mt-0.5">Daily income & expense, by source</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {data && (
            <div className="hidden sm:flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1 text-emerald-300"><ArrowUpRight className="h-3 w-3" />{money(data.totals.income, currency)}</span>
              <span className="flex items-center gap-1 text-rose-300"><ArrowDownRight className="h-3 w-3" />{money(data.totals.expense, currency)}</span>
            </div>
          )}
          {!data?.isSingleDay && (
            <div className="flex items-center bb-glass-control rounded-lg p-0.5">
              {([["area", AreaIcon], ["line", LineIcon]] as const).map(([m, Icon]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "h-6 w-7 rounded-md flex items-center justify-center transition-colors",
                    mode === m ? "bg-[var(--bb-accent-soft)] text-[var(--beebot-accent)]" : "text-muted-foreground hover:text-foreground",
                  )}
                  title={m === "area" ? "Stacked area" : "Lines"}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!hasData ? (
        <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground text-center">
          No income or expense in this period.<br/>Add a transaction with a source to see the flow.
        </div>
      ) : data!.isSingleDay ? (
        <TodayBars data={data!} currency={currency} />
      ) : (
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} stackOffset="sign" margin={{ top: 6, right: 6, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="hsl(var(--border) / 0.14)" vertical={false} />
              <XAxis dataKey="dateLabel" interval="preserveStartEnd" minTickGap={16} stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} width={42} tickFormatter={(v) => money(Number(v), currency)} />
              <ReferenceLine y={0} stroke="hsl(var(--border) / 0.5)" />
              <Tooltip content={<FlowTooltip series={series} currency={currency} />} />
              {mode === "area"
                ? series.map((s) => (
                    <Area key={s.key} type="monotone" dataKey={s.key} stackId="flow" stroke={s.color} fill={s.color} fillOpacity={0.55} strokeWidth={1} isAnimationActive={false} />
                  ))
                : series.map((s) => (
                    <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
                  ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legend */}
      {hasData && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
