// Ranked list of top income (category › sub-source) for the current range.
// Mirrors the consultant's `TopPerformersList` visual rhythm (rank chip + bar +
// right-aligned amount) so finance and consultant feel like siblings.

import { Card } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TopIncomeSourceRow } from "@/hooks/useFlowStateIncomeIntelligence";

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
  rows: TopIncomeSourceRow[];
  totalIncome: number;
  currency: string;
  periodLabel: string;
}

export function TopIncomeSources({ rows, totalIncome, currency, periodLabel }: Props) {
  // Bar widths use the leader as the 100% reference so the eye sees relative size,
  // not absolute share-of-total (which is already in the donut).
  const max = Math.max(0, ...rows.map((r) => r.amount));

  return (
    <Card className="consultant-card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{periodLabel} Top Sources</div>
          <div className="text-sm font-semibold mt-0.5">Highest-earning category ▸ sub-source</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] text-muted-foreground">Sources</div>
          <div className="text-xs font-semibold text-emerald-300 tabular-nums">{rows.length}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          No income in this period.<br/>Add an income transaction to populate the ranking.
        </div>
      ) : (
        <div className="divide-y divide-border/15">
          {rows.map((row, idx) => {
            const barPct = max > 0 ? Math.round((row.amount / max) * 100) : 0;
            const sharePct = totalIncome > 0 ? row.pct : 0;
            return (
              <div key={`${row.source}-${row.subSource ?? "u"}-${idx}`} className="py-2.5 flex items-center gap-3">
                <div className="text-[11px] tabular-nums text-muted-foreground w-5">#{idx + 1}</div>
                <div className="h-7 w-7 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-3 w-3 text-emerald-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate flex items-center gap-1.5">
                    {row.subSource || <span className="text-muted-foreground italic">Unattributed</span>}
                    <span className="text-[10px] text-muted-foreground/70">·</span>
                    <span className="text-[10px] text-muted-foreground truncate">{row.source}</span>
                  </div>
                  <div className="mt-1 relative h-1 rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className={cn("absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400/70 to-emerald-300/40")}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold tabular-nums text-emerald-300">
                    {fmt(row.amount, currency)}
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {row.count}× · {sharePct.toFixed(1)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
