// Today's income entries — always-today, independent of the range selector
// (so the user can scroll any range and still see "ဒီနေ့ ဘယ် source ကနေ ဘယ်လောက်").
// Mirrors the consultant's `DailyPostList` rhythm.

import { Card } from "@/components/ui/card";
import { Sun, ArrowDownLeft } from "lucide-react";
import type { TodayIncomeEntryRow } from "@/hooks/useFlowStateIncomeIntelligence";

const fmt = (n: number, cur: string) => {
  const v = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n || 0);
  if (cur === "MMK") return `${v} Ks`;
  if (cur === "USD") return `$${v}`;
  if (cur === "THB") return `฿${v}`;
  return `${v} ${cur}`;
};

const timeLabel = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

interface Props {
  entries: TodayIncomeEntryRow[];
  currency: string;
}

export function TodayIncomeList({ entries, currency }: Props) {
  const total = entries.reduce((s, e) => s + (e.amount || 0), 0);
  const distinctSources = new Set(entries.map((e) => `${e.category}::${e.source}`)).size;

  return (
    <Card className="consultant-card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Sun className="h-3 w-3 text-amber-300" /> Today · income
          </div>
          <div className="text-sm font-semibold mt-0.5">What came in so far</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] text-muted-foreground">Total today</div>
          <div className="text-sm font-semibold tabular-nums text-emerald-300">{fmt(total, currency)}</div>
          <div className="text-[10px] text-muted-foreground tabular-nums">
            {entries.length} {entries.length === 1 ? "entry" : "entries"} · {distinctSources} {distinctSources === 1 ? "source" : "sources"}
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          No income today yet.<br/>Tap <span className="text-foreground">+ Add</span> to log a new entry.
        </div>
      ) : (
        <div className="divide-y divide-border/15 max-h-[260px] overflow-y-auto custom-scrollbar -mr-1 pr-1">
          {entries.map((e) => (
            <div key={e.id} className="py-2.5 flex items-center gap-3">
              <div className="h-7 w-7 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
                <ArrowDownLeft className="h-3 w-3 text-emerald-300" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">
                  {e.source === "Unattributed"
                    ? <span className="text-muted-foreground italic">Unattributed</span>
                    : e.source}
                  <span className="ml-1.5 text-[10px] text-muted-foreground">· {e.category}</span>
                </div>
                {e.note && <div className="text-[10px] text-muted-foreground truncate mt-0.5">{e.note}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold tabular-nums text-emerald-300">
                  {fmt(e.amount, currency)}
                </div>
                <div className="text-[10px] text-muted-foreground tabular-nums">{timeLabel(e.time)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
