import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ChevronRight, Clock, Coins, Loader2, Sparkles, Zap } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { RunTraceModal } from "@/components/agent-chat/RunTraceModal";
import type { UsageRow } from "@/components/agent-chat/MessageCostCard";

type ProfileUsageRow = UsageRow & {
  session_id?: string | null;
  run_id?: string | null;
  parent_run_id?: string | null;
};

interface RunGroup {
  id: string;
  rows: ProfileUsageRow[];
  createdAt: string;
  calls: number;
  model: string;
  tokens: number;
  cost: number;
  durationMs: number;
  successful: boolean;
}

interface RecentRunTracesProps {
  userId?: string;
}

export function RecentRunTraces({ userId }: RecentRunTracesProps) {
  const [selectedRun, setSelectedRun] = useState<RunGroup | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["profile-recent-run-traces", userId],
    enabled: !!userId,
    queryFn: async () => {
      const client = supabase as any;
      const { data, error } = await client
        .from("agent_ai_usage")
        .select("id, session_id, message_id, run_id, parent_run_id, call_kind, model_used, provider, api_source, tokens_input, tokens_output, tokens_total, cached_tokens, estimated_cost, request_duration_ms, is_successful, created_at, metadata")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(80);

      if (error) throw error;
      return (data || []) as ProfileUsageRow[];
    },
    staleTime: 30_000,
  });

  const groups = useMemo(() => {
    const byRun = new Map<string, ProfileUsageRow[]>();
    for (const row of rows) {
      const key = row.parent_run_id || row.run_id || row.message_id || row.id;
      const bucket = byRun.get(key) || [];
      bucket.push(row);
      byRun.set(key, bucket);
    }

    return Array.from(byRun.entries())
      .map(([id, runRows]) => {
        const sortedRows = [...runRows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const latest = sortedRows[sortedRows.length - 1] || sortedRows[0];
        const main = sortedRows.find((row) => row.call_kind === "main_response") || sortedRows[0];
        const cost = sortedRows.reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0);
        const durationMs = sortedRows.reduce((sum, row) => sum + (row.request_duration_ms || 0), 0);
        const tokens = sortedRows.reduce((sum, row) => sum + (row.tokens_total || row.tokens_input + row.tokens_output || 0), 0);

        return {
          id,
          rows: sortedRows,
          createdAt: latest?.created_at || main?.created_at || new Date().toISOString(),
          calls: sortedRows.length,
          model: main?.model_used || "runtime-selected",
          tokens,
          cost,
          durationMs,
          successful: sortedRows.every((row) => row.is_successful),
        } satisfies RunGroup;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);
  }, [rows]);

  const selectedRows = selectedRun?.rows || [];

  return (
    <div className="rounded-[1.65rem] border border-border/35 bg-card/25 p-4 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-primary" />
            Run Trace Ledger
          </h4>
          <p className="mt-1 text-xs text-muted-foreground/75">
            Recent agent runs, token use, cost, and latency live here instead of the chat thread.
          </p>
        </div>
        <div className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">
          Transparent
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : groups.length > 0 ? (
        <div className="mt-4 space-y-2">
          {groups.map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => setSelectedRun(run)}
              className="w-full rounded-2xl border border-border/25 bg-background/35 p-3 text-left transition-all duration-200 hover:border-primary/30 hover:bg-primary/5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-xl border",
                        run.successful
                          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                          : "border-amber-400/25 bg-amber-400/10 text-amber-300",
                      )}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground/90">{run.model}</p>
                      <p className="text-[10px] text-muted-foreground/65">{format(new Date(run.createdAt), "MMM d, h:mm a")}</p>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="hidden items-center gap-1 sm:flex"><Activity className="h-3 w-3" />{run.calls}</span>
                  <span className="hidden items-center gap-1 sm:flex"><Zap className="h-3 w-3 text-amber-300/80" />{run.tokens.toLocaleString()}</span>
                  <span className="hidden items-center gap-1 md:flex"><Coins className="h-3 w-3 text-emerald-300/80" />{run.cost < 0.001 ? "<$0.001" : `$${run.cost.toFixed(4)}`}</span>
                  <span className="hidden items-center gap-1 md:flex"><Clock className="h-3 w-3 text-sky-300/80" />{(run.durationMs / 1000).toFixed(1)}s</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-border/30 bg-background/25 px-4 py-6 text-center text-sm text-muted-foreground">
          No run traces yet.
        </div>
      )}

      <RunTraceModal
        open={!!selectedRun}
        onOpenChange={(open) => {
          if (!open) setSelectedRun(null);
        }}
        rows={selectedRows}
      />
    </div>
  );
}
