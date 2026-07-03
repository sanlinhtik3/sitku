import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

// Loader component that queries session metadata for monitoring_goal_id
export function MonitoringBannerLoader({ sessionId, userId }: { sessionId: string; userId: string }) {
  const queryClient = useQueryClient();

  const { data: goalId } = useQuery({
    queryKey: ["monitoring-goal-id", sessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("agent_chat_sessions")
        .select("metadata")
        .eq("id", sessionId)
        .single();
      return (data?.metadata as any)?.monitoring_goal_id || null;
    },
    refetchInterval: 60000,
    enabled: !!sessionId,
  });

  if (!goalId) return null;

  return (
    <MonitoringModeBanner
      goalId={goalId}
      userId={userId}
      onExit={async () => {
        // 1. Cancel the goal
        await supabase.from("agent_goals")
          .update({ status: "cancelled", completed_at: new Date().toISOString() })
          .eq("id", goalId);

        // 2. Deactivate associated heartbeat
        await supabase.from("agent_heartbeats")
          .update({ is_active: false })
          .eq("task_type", "goal_step")
          .filter("task_config->>goal_id", "eq", goalId);

        // 3. Clear monitoring mode from session metadata (atomic RPC)
        await supabase.rpc("toggle_monitoring_goal", { p_session_id: sessionId, p_goal_id: null });

        // 4. Invalidate queries
        queryClient.invalidateQueries({ queryKey: ["monitoring-goal-id", sessionId] });
      }}
    />
  );
}

interface MonitoringModeBannerProps {
  goalId: string;
  userId: string;
  onExit: () => void;
}

export function MonitoringModeBanner({ goalId, userId, onExit }: MonitoringModeBannerProps) {
  const [cancelling, setCancelling] = useState(false);

  const { data } = useQuery({
    queryKey: ["monitoring-goal", goalId],
    queryFn: async () => {
      const [goalRes, tasksRes, logRes] = await Promise.all([
        supabase.from("agent_goals").select("title, status, progress, started_at").eq("id", goalId).single(),
        supabase.from("agent_task_queue").select("status").eq("goal_id", goalId),
        supabase.from("agent_communication_log").select("created_at, query_type")
          .eq("target_type", "goal_execution")
          .filter("metadata->>goal_id", "eq", goalId)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const tasks = tasksRes.data || [];
      const completed = tasks.filter((t: any) => t.status === "completed").length;
      return {
        goal: goalRes.data,
        completed,
        total: tasks.length,
        lastActivity: logRes.data?.created_at,
      };
    },
    refetchInterval: 60000,
    enabled: !!goalId,
  });

  if (!data?.goal) return null;

  const pct = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
  const lastTime = data.lastActivity
    ? new Date(data.lastActivity).toLocaleTimeString("en-US", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, hour: "2-digit", minute: "2-digit" })
    : "—";

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await onExit();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className={cn(
      "shrink-0 mx-2 mt-2 rounded-xl p-3",
      "bg-primary/5 border border-primary/20 backdrop-blur-xl",
      "animate-in fade-in slide-in-from-top-2 duration-300"
    )}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Target className="h-3.5 w-3.5 text-primary animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground truncate">
              🐝 Background Objective Active
            </p>
            <p className="text-[11px] text-muted-foreground truncate">{data.goal.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-muted-foreground">⏱️ {lastTime}</span>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className={cn(
              "h-6 w-6 rounded-full flex items-center justify-center transition-colors",
              cancelling ? "opacity-50" : "hover:bg-destructive/20"
            )}
            title="Cancel Objective"
          >
            <X className={cn("h-3 w-3", cancelling ? "text-muted-foreground animate-spin" : "text-destructive")} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Progress value={pct} className="h-1.5 flex-1" />
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">{data.completed}/{data.total}</span>
      </div>
    </div>
  );
}
