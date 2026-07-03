import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Coins, Zap, Clock, Activity, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { UsageRow } from "./MessageCostCard";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: UsageRow[];
}

const KIND_COLOR: Record<string, string> = {
  main_response: "from-primary/30 to-primary/5 border-primary/40 text-primary",
  observer: "from-cyan-500/25 to-cyan-500/5 border-cyan-500/40 text-cyan-300",
  narration: "from-sky-500/25 to-sky-500/5 border-sky-500/40 text-sky-300",
  embedding: "from-purple-500/25 to-purple-500/5 border-purple-500/40 text-purple-300",
  memory_reflection: "from-blue-500/25 to-blue-500/5 border-blue-500/40 text-blue-300",
  memory_summary: "from-blue-500/25 to-blue-500/5 border-blue-500/40 text-blue-300",
  memory_tagging: "from-blue-500/25 to-blue-500/5 border-blue-500/40 text-blue-300",
  evaluator: "from-amber-500/25 to-amber-500/5 border-amber-500/40 text-amber-300",
  planner: "from-fuchsia-500/25 to-fuchsia-500/5 border-fuchsia-500/40 text-fuchsia-300",
  revise: "from-rose-500/25 to-rose-500/5 border-rose-500/40 text-rose-300",
};

export function RunTraceModal({ open, onOpenChange, rows }: Props) {
  const totals = rows.reduce(
    (a, r) => ({
      calls: a.calls + 1,
      tokensIn: a.tokensIn + (r.tokens_input || 0),
      tokensOut: a.tokensOut + (r.tokens_output || 0),
      cached: a.cached + (r.cached_tokens || 0),
      cost: a.cost + Number(r.estimated_cost || 0),
      durMs: a.durMs + (r.request_duration_ms || 0),
    }),
    { calls: 0, tokensIn: 0, tokensOut: 0, cached: 0, cost: 0, durMs: 0 },
  );


  const t0 = rows[0]?.created_at ? new Date(rows[0].created_at).getTime() : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-background/80 backdrop-blur-2xl border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Run Trace · {totals.calls} calls
          </DialogTitle>
        </DialogHeader>

        {/* Totals strip */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <Stat icon={<Activity className="h-3 w-3" />} label="Calls" value={String(totals.calls)} />
          <Stat icon={<Zap className="h-3 w-3" />} label="Tokens" value={(totals.tokensIn + totals.tokensOut).toLocaleString()} sub={totals.cached > 0 ? `${totals.tokensIn}→${totals.tokensOut} · 📦${totals.cached}` : `${totals.tokensIn}→${totals.tokensOut}`} />
          <Stat icon={<Coins className="h-3 w-3" />} label="Cost" value={totals.cost < 0.001 ? "<$0.001" : `$${totals.cost.toFixed(4)}`} />
          <Stat icon={<Clock className="h-3 w-3" />} label="Total" value={`${(totals.durMs / 1000).toFixed(1)}s`} />
        </div>


        {/* Timeline */}
        <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
          {rows.map((r) => {
            const kind = r.call_kind || "main_response";
            const colors = KIND_COLOR[kind] || "from-muted/30 to-muted/5 border-border/40 text-muted-foreground";
            const offsetMs = new Date(r.created_at).getTime() - t0;
            return (
              <div
                key={r.id}
                className={cn(
                  "rounded-lg border bg-gradient-to-r px-3 py-2 flex items-center justify-between gap-3",
                  colors,
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {r.is_successful ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <XCircle className="h-3 w-3 shrink-0 text-red-400" />}
                  <span className="text-[10px] font-semibold uppercase tracking-wider">{kind}</span>
                  <span className="text-[10px] text-foreground/60 font-mono truncate">{r.model_used}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono shrink-0">
                  <span className="text-foreground/60">+{(offsetMs / 1000).toFixed(1)}s</span>
                  <span>{r.tokens_input}→{r.tokens_output}</span>
                  <span>{((r.request_duration_ms ?? 0) / 1000).toFixed(2)}s</span>
                  <span className="text-emerald-400/80">${Number(r.estimated_cost ?? 0).toFixed(5)}</span>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-muted-foreground/60 mt-2 text-center">
          Attributed by run_id when present; falls back to session window for legacy rows.
        </p>

      </DialogContent>
    </Dialog>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-xl px-3 py-2">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
      {sub && <div className="text-[9px] text-muted-foreground/60 font-mono">{sub}</div>}
    </div>
  );
}
