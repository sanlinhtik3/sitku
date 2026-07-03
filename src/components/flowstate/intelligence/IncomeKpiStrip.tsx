// Slim 4-cell KPI strip at the top of the Income Intelligence section.
// Replaces the throwaway "This Week · by source" subtitle with real numbers:
//   Today Income · Period Income · Sources (distinct in period) · Δ vs prev period.
// No Recharts; eager — always visible the moment the CFO tab opens.

import { Card } from "@/components/ui/card";
import { Sun, Wallet, Layers, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

const fmt = (n: number, cur: string) => {
  const v = n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
          : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
          : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);
  if (cur === "MMK") return `${v} Ks`;
  if (cur === "USD") return `$${v}`;
  if (cur === "THB") return `฿${v}`;
  return `${v} ${cur}`;
};

interface Props {
  todayIncome: number;
  periodIncome: number;
  sourceCount: number;
  deltaIncomePct: number | null;
  currency: string;
  periodLabel: string;
}

export function IncomeKpiStrip({ todayIncome, periodIncome, sourceCount, deltaIncomePct, currency, periodLabel }: Props) {
  const deltaPositive = (deltaIncomePct ?? 0) >= 0;
  const cells: Array<{ label: string; value: React.ReactNode; icon: React.ReactNode; tone?: "positive" | "negative" }> = [
    {
      label: "Today income",
      value: <span className="text-emerald-300">{fmt(todayIncome, currency)}</span>,
      icon: <Sun className="h-3.5 w-3.5" />,
      tone: "positive",
    },
    {
      label: `${periodLabel} income`,
      value: fmt(periodIncome, currency),
      icon: <Wallet className="h-3.5 w-3.5" />,
    },
    {
      label: `${periodLabel} sources`,
      value: sourceCount === 0 ? "—" : `${sourceCount}`,
      icon: <Layers className="h-3.5 w-3.5" />,
    },
    {
      label: "Δ vs prev",
      value: (
        <span className={cn("flex items-center gap-1", deltaPositive ? "text-emerald-300" : "text-rose-400")}>
          {deltaIncomePct == null ? "—" : (deltaPositive
            ? <TrendingUp className="h-3 w-3" />
            : <TrendingDown className="h-3 w-3" />)}
          {deltaIncomePct == null ? "" : `${deltaPositive ? "+" : ""}${deltaIncomePct.toFixed(1)}%`}
        </span>
      ),
      icon: deltaPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />,
      tone: deltaPositive ? "positive" : "negative",
    },
  ];

  return (
    <Card className="consultant-card p-0 overflow-hidden">
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border/20">
        {cells.map((c, i) => (
          <div key={i} className="p-3 relative">
            <div className={cn(
              "absolute left-0 top-0 h-full w-0.5",
              c.tone === "positive" ? "bg-emerald-400/70" : c.tone === "negative" ? "bg-rose-400/70" : "bg-sky-400/60",
            )} />
            <div className="flex items-center justify-between gap-2 text-muted-foreground">
              <span className="text-[10px] uppercase tracking-wider truncate">{c.label}</span>
              <span className="consultant-control h-6 w-6 rounded-md flex items-center justify-center opacity-75 text-muted-foreground/80">
                {c.icon}
              </span>
            </div>
            <div className="mt-1 text-base sm:text-lg font-semibold tabular-nums tracking-tight">
              {c.value}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
