// Income Source — 2-ring nested donut (Recharts).
// Inner ring  = income category (Salary / Business / Investment / Gift / Other)
// Outer ring  = sub-source under that category ("Client A", "YouTube", …)
// Center      = period total income + distinct source count.
//
// Visually mirrors the consultant's `ChannelMixDonut` (same `consultant-card`
// shell, header pattern, tooltip styling) so the two surfaces feel like siblings.

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { IncomeSourceRow } from "@/hooks/useFlowStateIncomeIntelligence";

const fmtMoney = (n: number, cur: string) => {
  const v = n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
          : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
          : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);
  if (cur === "MMK") return `${v} Ks`;
  if (cur === "USD") return `$${v}`;
  if (cur === "THB") return `฿${v}`;
  return `${v} ${cur}`;
};

interface Props {
  bySource: IncomeSourceRow[];
  totalIncome: number;
  sourceCount: number;
  currency: string;
  periodLabel: string;
}

interface CategorySlice {
  ring: "category";
  source: string;
  amount: number;
  pct: number;
  color: string;
}

interface SubSourceSlice {
  ring: "sub";
  source: string;        // parent category
  name: string;          // sub-source label
  amount: number;
  pct: number;
  color: string;
}

// Slightly shift the parent color per sub-source so the outer ring reads as a
// family of the inner color, not arbitrary palette mixing.
function shadeFor(baseHex: string, idx: number, total: number): string {
  // Lighten by step; idx 0 = base, later = lighter, capped to avoid white-out.
  const m = baseHex.replace("#", "");
  if (m.length !== 6) return baseHex;
  const step = Math.min(0.6, idx / Math.max(total, 1) * 0.5);
  const lighten = (hex: string) => {
    const n = parseInt(hex, 16);
    const out = Math.round(n + (255 - n) * step);
    return out.toString(16).padStart(2, "0");
  };
  return `#${lighten(m.slice(0, 2))}${lighten(m.slice(2, 4))}${lighten(m.slice(4, 6))}`;
}

export function IncomeSourceDonut({
  bySource,
  totalIncome,
  sourceCount,
  currency,
  periodLabel,
}: Props) {
  const { inner, outer } = useMemo(() => {
    const inner: CategorySlice[] = bySource.map((b) => ({
      ring: "category",
      source: b.source,
      amount: b.amount,
      pct: b.pct,
      color: b.color,
    }));
    const outer: SubSourceSlice[] = bySource.flatMap((b) =>
      b.subSources.map((s, i) => ({
        ring: "sub",
        source: b.source,
        name: s.name,
        amount: s.amount,
        pct: s.pct, // pct within the parent category
        color: shadeFor(b.color, i, b.subSources.length),
      })),
    );
    return { inner, outer };
  }, [bySource]);

  const hasData = totalIncome > 0 && inner.length > 0;
  const top = bySource[0];

  return (
    <Card className="consultant-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{periodLabel} Income by Source</div>
          <div className="text-sm font-semibold mt-0.5">Category ▸ sub-source allocation</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-muted-foreground">Top source</div>
          <div className="text-xs font-semibold text-emerald-300 truncate max-w-[140px]">{top?.source ?? "—"}</div>
        </div>
      </div>

      <div className="h-[260px] relative">
        {!hasData ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center px-4">
            No income in this period.<br/>Add an income transaction to populate the source mix.
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11, borderRadius: 8 }}
                  formatter={(v: number, _name: string, item) => {
                    const p = item?.payload as CategorySlice | SubSourceSlice | undefined;
                    if (!p) return [fmtMoney(v, currency), ""];
                    if (p.ring === "category") return [`${fmtMoney(p.amount, currency)} · ${p.pct}%`, p.source];
                    return [`${fmtMoney(p.amount, currency)} · ${p.pct}% of ${p.source}`, p.name];
                  }}
                />
                {/* Inner: categories */}
                <Pie
                  data={inner}
                  dataKey="amount"
                  nameKey="source"
                  cx="50%" cy="50%"
                  innerRadius={48} outerRadius={72}
                  paddingAngle={1.5}
                  stroke="hsl(var(--background))"
                  strokeWidth={1}
                >
                  {inner.map((s, i) => (<Cell key={`cat-${i}`} fill={s.color} />))}
                </Pie>
                {/* Outer: sub-sources */}
                <Pie
                  data={outer}
                  dataKey="amount"
                  nameKey="name"
                  cx="50%" cy="50%"
                  innerRadius={78} outerRadius={104}
                  paddingAngle={1}
                  stroke="hsl(var(--background))"
                  strokeWidth={1}
                >
                  {outer.map((s, i) => (<Cell key={`sub-${i}`} fill={s.color} />))}
                </Pie>
                <Legend iconType="circle" wrapperStyle={{ fontSize: 10 }} verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center -translate-y-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total income</div>
              <div className="text-base font-bold tabular-nums">{fmtMoney(totalIncome, currency)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{sourceCount} {sourceCount === 1 ? "source" : "sources"}</div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
