import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Eye, Heart, DollarSign, Target, Layers, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONSULTANT_FINANCE_CURRENCY } from "@/lib/consultantHelpers";

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
  : String(Math.round(n ?? 0));
const fmtMoney = (n: number) =>
  `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n ?? 0)} ${CONSULTANT_FINANCE_CURRENCY}`;

interface KpiItem {
  label: string;
  value: string | number;
  delta?: number; // pct
  icon: React.ReactNode;
  tone?: "default" | "positive" | "negative";
}

interface DashboardSummary {
  revenue?: number;
  spend?: number;
  roi_pct?: number | null;
  total_posts?: number;
  views?: number;
  engagement?: number;
}

export function OverviewKpiGrid({ data, periodLabel }: { data?: DashboardSummary | null; periodLabel: string }) {
  const d = data ?? {};
  const items: KpiItem[] = [
    { label: `${periodLabel} Revenue`, value: fmtMoney(d.revenue ?? 0), icon: <DollarSign className="h-3.5 w-3.5" />, tone: "positive" },
    { label: `${periodLabel} Spend`,   value: fmtMoney(d.spend ?? 0),   icon: <Layers className="h-3.5 w-3.5" />, tone: "negative" },
    { label: `${periodLabel} ROI`,     value: d.roi_pct == null ? "—" : `${d.roi_pct}%`, delta: d.roi_pct, icon: <Target className="h-3.5 w-3.5" />, tone: (d.roi_pct ?? 0) >= 0 ? "positive" : "negative" },
    { label: `${periodLabel} Posts`,   value: d.total_posts ?? 0, icon: <Activity className="h-3.5 w-3.5" /> },
    { label: `${periodLabel} Views`,   value: fmt(d.views ?? 0), icon: <Eye className="h-3.5 w-3.5" /> },
    { label: `${periodLabel} Engage`,  value: fmt(d.engagement ?? 0), icon: <Heart className="h-3.5 w-3.5" />, tone: "positive" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {items.map((it) => (
        <Card key={it.label}
          className={cn(
            "consultant-card relative overflow-hidden p-3.5 transition group",
          )}>
          <div className={cn(
            "absolute left-0 top-0 h-full w-0.5",
            it.tone === "positive" ? "bg-emerald-400/70" : it.tone === "negative" ? "bg-rose-400/70" : "bg-sky-400/60",
          )} />
          <div className="flex items-center justify-between gap-2 text-muted-foreground">
            <span className="text-[10px] uppercase tracking-wider truncate">{it.label}</span>
            <span className={cn(
              "consultant-control h-7 w-7 rounded-[var(--glass-radius-control)] flex items-center justify-center opacity-75 group-hover:opacity-100 transition",
              it.tone === "positive" ? "text-emerald-300" : it.tone === "negative" ? "text-rose-300" : "text-sky-300",
            )}>{it.icon}</span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-lg sm:text-xl font-semibold tabular-nums tracking-tight">{it.value}</span>
            {it.delta != null && (
              <span className={cn(
                "text-[10px] font-semibold tabular-nums flex items-center gap-0.5",
                it.tone === "negative" ? "text-rose-400" : "text-emerald-400",
              )}>
                {it.tone === "negative"
                  ? <TrendingDown className="h-2.5 w-2.5" />
                  : <TrendingUp className="h-2.5 w-2.5" />}
                {it.delta > 0 ? "+" : ""}{Number(it.delta).toFixed(1)}%
              </span>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
