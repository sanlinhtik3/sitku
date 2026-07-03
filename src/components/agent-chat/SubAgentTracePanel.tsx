import { memo, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bot, CheckCircle2, Loader2, XCircle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubAgentStep {
  id: string;
  sub_agent_id: string;
  step_index: number;
  tool_name: string | null;
  status: string;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

interface SubAgentTracePanelProps {
  parentMessageId: string;
  userId: string;
}

/**
 * Live trace of sub-agent tool executions.
 * Subscribes to `agent_sub_agent_steps` Realtime for `parent_message_id`.
 * Renders a nested tree: sub_agent_id → ordered tool steps.
 */
export const SubAgentTracePanel = memo(function SubAgentTracePanel({
  parentMessageId,
  userId,
}: SubAgentTracePanelProps) {
  const [steps, setSteps] = useState<SubAgentStep[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("agent_sub_agent_steps")
        .select("id, sub_agent_id, step_index, tool_name, status, error_message, duration_ms, created_at")
        .eq("parent_message_id", parentMessageId)
        .eq("user_id", userId)
        .order("step_index", { ascending: true });
      if (mounted && data) setSteps(data as SubAgentStep[]);
    })();

    const channel = supabase
      .channel(`sub-agent-steps-${parentMessageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_sub_agent_steps",
          filter: `parent_message_id=eq.${parentMessageId}`,
        },
        (payload) => {
          if (!mounted) return;
          const row = (payload.new || payload.old) as SubAgentStep;
          if (payload.eventType === "INSERT") {
            setSteps((prev) => [...prev, payload.new as SubAgentStep].sort((a, b) => a.step_index - b.step_index));
          } else if (payload.eventType === "UPDATE") {
            setSteps((prev) => prev.map((s) => (s.id === row.id ? (payload.new as SubAgentStep) : s)));
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [parentMessageId, userId]);

  if (steps.length === 0) return null;

  // Group by sub_agent_id
  const groups = steps.reduce<Record<string, SubAgentStep[]>>((acc, s) => {
    (acc[s.sub_agent_id] = acc[s.sub_agent_id] || []).push(s);
    return acc;
  }, {});

  return (
    <div className="my-2 rounded-lg border border-border/50 bg-muted/20 backdrop-blur-sm overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        <Bot className="h-3.5 w-3.5 text-primary" />
        <span>Sub-agent dispatch ({steps.length} step{steps.length === 1 ? "" : "s"})</span>
        <ChevronRight className={cn("h-3.5 w-3.5 ml-auto transition-transform", !collapsed && "rotate-90")} />
      </button>
      {!collapsed && (
        <div className="px-3 pb-2 space-y-2">
          {Object.entries(groups).map(([agentId, agentSteps]) => (
            <div key={agentId} className="border-l-2 border-primary/30 pl-3 py-1 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{agentId}</div>
              {agentSteps.map((step) => {
                const Icon =
                  step.status === "success" ? CheckCircle2 :
                  step.status === "error" ? XCircle : Loader2;
                const color =
                  step.status === "success" ? "text-emerald-500" :
                  step.status === "error" ? "text-destructive" : "text-primary animate-spin";
                return (
                  <div key={step.id} className="flex items-center gap-2 text-xs">
                    <Icon className={cn("h-3 w-3 shrink-0", color)} />
                    <span className="font-mono text-foreground/80">{step.tool_name || "(no tool)"}</span>
                    {step.duration_ms != null && (
                      <span className="text-muted-foreground text-[10px] ml-auto">{step.duration_ms}ms</span>
                    )}
                    {step.error_message && (
                      <span className="text-destructive text-[10px] truncate" title={step.error_message}>
                        {step.error_message.slice(0, 40)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
