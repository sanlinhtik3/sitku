import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Coins, Zap, Clock, ChevronDown, ChevronUp, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { RunTraceModal } from "./RunTraceModal";

interface Props {
  sessionId: string;
  messageId: string;
  messageCreatedAt: string;
  // Window before message_created_at to attribute satellite calls (ms)
  windowMs?: number;
}

export interface UsageRow {
  id: string;
  call_kind: string | null;
  model_used: string;
  provider: string | null;
  api_source: string | null;
  tokens_input: number;
  tokens_output: number;
  tokens_total: number;
  cached_tokens: number | null;
  estimated_cost: number | null;
  request_duration_ms: number | null;
  is_successful: boolean;
  created_at: string;
  message_id: string | null;
  metadata: any;
}

export function MessageCostCard({ sessionId, messageId, messageCreatedAt, windowMs = 90_000 }: Props) {
  const [open, setOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["msg-usage", sessionId, messageId],
    queryFn: async () => {
      const client = supabase as any;
      // 1. Try deterministic attribution: find the main row tagged with this message_id
      //    then pull everything that shares its run_id (parent_run_id matches main's run_id).
      const mainRes = await client
        .from("agent_ai_usage")
        .select("id, run_id, created_at")
        .eq("message_id", messageId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const mainRunId: string | null = mainRes?.data?.run_id ?? null;

      if (mainRunId) {
        const det = await client
          .from("agent_ai_usage")
          .select("id, call_kind, model_used, provider, api_source, tokens_input, tokens_output, tokens_total, cached_tokens, estimated_cost, request_duration_ms, is_successful, created_at, message_id, metadata, run_id, parent_run_id")
          .eq("session_id", sessionId)
          .or(`run_id.eq.${mainRunId},parent_run_id.eq.${mainRunId},message_id.eq.${messageId}`)
          .order("created_at", { ascending: true });
        if (!det.error && (det.data?.length ?? 0) > 0) return det.data as UsageRow[];
      }

      // 2. Fallback: legacy window-based attribution for older messages without run_id.
      const msgTs = new Date(messageCreatedAt).getTime();
      const fromTs = new Date(msgTs - windowMs).toISOString();
      const toTs = new Date(msgTs + 5_000).toISOString();
      const { data, error } = await client
        .from("agent_ai_usage")
        .select("id, call_kind, model_used, provider, api_source, tokens_input, tokens_output, tokens_total, cached_tokens, estimated_cost, request_duration_ms, is_successful, created_at, message_id, metadata, run_id, parent_run_id")
        .eq("session_id", sessionId)
        .gte("created_at", fromTs)
        .lte("created_at", toTs)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as UsageRow[];
    },
    staleTime: 30_000,
  });

  const totals = useMemo(() => {
    const t = { calls: rows.length, tokensIn: 0, tokensOut: 0, cached: 0, cost: 0, durMs: 0, models: new Set<string>() };
    for (const r of rows) {
      t.tokensIn += r.tokens_input || 0;
      t.tokensOut += r.tokens_output || 0;
      t.cached += r.cached_tokens || 0;
      t.cost += Number(r.estimated_cost || 0);
      t.durMs += r.request_duration_ms || 0;
      t.models.add(r.model_used);
    }
    return t;
  }, [rows]);


  if (isLoading || rows.length === 0) return null;

  const fmtCost = totals.cost < 0.001 ? `<$0.001` : `$${totals.cost.toFixed(4)}`;
  const fmtTokens = (totals.tokensIn + totals.tokensOut).toLocaleString();

  return (
    <div className="mt-2 rounded-xl border border-border/40 bg-card/30 backdrop-blur-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-card/50 transition-colors"
      >
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><Activity className="h-3 w-3 text-primary/70" />{totals.calls} calls</span>
          <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-amber-400/70" />{fmtTokens} tok</span>
          {totals.cached > 0 && (
            <span className="flex items-center gap-1 text-cyan-400/80" title="Cached prompt tokens (Gemini context cache)">
              📦 {totals.cached.toLocaleString()}
            </span>
          )}
          <span className="flex items-center gap-1"><Coins className="h-3 w-3 text-emerald-400/70" />{fmtCost}</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-blue-400/70" />{(totals.durMs / 1000).toFixed(1)}s</span>
        </div>

        {open ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border/30 px-3 py-2 space-y-1.5 bg-background/20">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-[10px] font-mono">
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-medium",
                  r.call_kind === "main_response" || !r.call_kind ? "bg-primary/15 text-primary" :
                  r.call_kind === "embedding" ? "bg-purple-500/15 text-purple-300" :
                  r.call_kind?.startsWith("memory") ? "bg-blue-500/15 text-blue-300" :
                  "bg-muted/40 text-muted-foreground"
                )}>
                  {r.call_kind || "main"}
                </span>
                <span className="text-muted-foreground/80 truncate">{r.model_used}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground/70 shrink-0">
                <span>{r.tokens_input}+{r.tokens_output}</span>
                <span>{((r.request_duration_ms ?? 0) / 1000).toFixed(1)}s</span>
                <span className="text-emerald-400/70">${Number(r.estimated_cost ?? 0).toFixed(5)}</span>
              </div>
            </div>
          ))}
          <button
            onClick={() => setTraceOpen(true)}
            className="mt-2 w-full text-[10px] text-primary/80 hover:text-primary py-1.5 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors"
          >
            Open full run trace →
          </button>
        </div>
      )}

      <RunTraceModal open={traceOpen} onOpenChange={setTraceOpen} rows={rows} />
    </div>
  );
}
