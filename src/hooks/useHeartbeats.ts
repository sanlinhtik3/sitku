import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Heartbeat {
  id: string;
  user_id: string;
  name: string;
  display_name: string;
  cron_expression: string | null;
  is_active: boolean;
  task_type: string;
  task_config: Record<string, any>;
  priority: 'low' | 'normal' | 'high' | 'critical';
  trigger_type: 'cron' | 'event' | 'hybrid';
  event_config: Record<string, any>;
  last_run_at: string | null;
  last_status: string | null;
  last_result: any;
  next_run_at: string | null;
  created_at: string;
}

export function useHeartbeats(userId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["heartbeats", userId];

  // Fetch all heartbeats for user
  const { data: heartbeats = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_heartbeats")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data || []) as Heartbeat[];
    },
    enabled: !!userId,
    staleTime: 1000 * 5,
  });

  const runningAutonomousTaskIds = useMemo(() => {
    const ids = heartbeats
      .filter((hb) => hb.last_status === "running")
      .map((hb) => (hb.last_result as Record<string, any> | null)?.autonomous_task_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    return Array.from(new Set(ids));
  }, [heartbeats]);

  // ─── Realtime subscription ───
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`heartbeats-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_heartbeats",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Force immediate refetch, don't just mark stale
          queryClient.invalidateQueries({ queryKey: ["heartbeats", userId] });
          queryClient.refetchQueries({ queryKey: ["heartbeats", userId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  // Realtime bridge: autonomous task completion -> heartbeat list status sync (without waiting for cron reconcile)
  useEffect(() => {
    if (!userId || runningAutonomousTaskIds.length === 0) return;

    const trackedTaskIds = new Set(runningAutonomousTaskIds);
    const channel = supabase
      .channel(`heartbeats-autonomous-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "autonomous_tasks" },
        (payload) => {
          const next = payload.new as Record<string, any> | null;
          if (!next) return;

          const autonomousTaskId = typeof next.id === "string" ? next.id : null;
          const autonomousStatus = String(next.status || "").toLowerCase();
          if (!autonomousTaskId || !trackedTaskIds.has(autonomousTaskId)) return;
          if (autonomousStatus !== "completed" && autonomousStatus !== "failed") return;

          queryClient.setQueryData(["heartbeats", userId], (prev: Heartbeat[] | undefined) => {
            if (!prev?.length) return prev;
            const nowIso = new Date().toISOString();

            return prev.map((hb) => {
              const lastResult = (hb.last_result as Record<string, any> | null) || {};
              if (hb.last_status !== "running" || lastResult.autonomous_task_id !== autonomousTaskId) {
                return hb;
              }

              return {
                ...hb,
                last_status: autonomousStatus === "completed" ? "success" : "failed",
                last_result: {
                  ...lastResult,
                  autonomous_status: autonomousStatus,
                  progress_pct:
                    typeof next.progress_pct === "number"
                      ? next.progress_pct
                      : autonomousStatus === "completed"
                        ? 100
                        : (lastResult.progress_pct ?? 0),
                  steps_completed:
                    typeof next.current_step === "number"
                      ? next.current_step
                      : (lastResult.steps_completed ?? 0),
                  total_steps:
                    typeof next.total_steps === "number"
                      ? next.total_steps
                      : (lastResult.total_steps ?? 0),
                  completed_at: nowIso,
                  ...(autonomousStatus === "failed"
                    ? { error: next.error || lastResult.error || "Autonomous execution failed" }
                    : {}),
                },
              };
            });
          });

          queryClient.invalidateQueries({ queryKey: ["heartbeats", userId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient, runningAutonomousTaskIds]);

  // Toggle heartbeat active/inactive
  const toggleHeartbeat = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const updates: any = { is_active };
      const { error } = await supabase
        .from("agent_heartbeats")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { is_active }) => {
      queryClient.invalidateQueries({ queryKey: ["heartbeats", userId] });
      toast.success(is_active ? "Heartbeat activated ✅" : "Heartbeat paused ⏸️");
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  // Manual trigger
  const triggerHeartbeat = useMutation({
    mutationFn: async (heartbeatId: string) => {
      const { data, error } = await supabase.functions.invoke("agent-heartbeat", {
        body: { heartbeat_id: heartbeatId, force_run: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["heartbeats", userId] });
      const result = data?.results?.[0];
      if (result?.status === "success") {
        toast.success("Task finished ✅ Full output is now in Task Result");
      } else if (result?.status === "running") {
        toast.info("Task is running in background… result will appear shortly");
      } else if (result?.status === "skipped") {
        toast.info("HEARTBEAT_OK — Nothing notable to report 🤫");
      } else {
        toast.warning("Heartbeat completed with issues");
      }
    },
    onError: (err) => toast.error(`Trigger failed: ${err.message}`),
  });

  // Delete heartbeat
  const deleteHeartbeat = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("agent_heartbeats")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["heartbeats", userId] });
      toast.success("Heartbeat deleted");
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  // Update heartbeat (edit prompt, schedule, priority)
  const updateHeartbeat = useMutation({
    mutationFn: async (params: {
      id: string;
      display_name?: string;
      cron_expression?: string | null;
      priority?: string;
      task_config?: Record<string, any>;
    }) => {
      const { id, ...updates } = params;
      const { error } = await supabase
        .from("agent_heartbeats")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["heartbeats", userId] });
      toast.success("Task updated ✅");
    },
    onError: (err) => toast.error(`Update failed: ${err.message}`),
  });

  // Create custom heartbeat
  const createHeartbeat = useMutation({
    mutationFn: async (params: {
      name: string;
      display_name: string;
      cron_expression: string | null;
      task_type: string;
      task_config?: Record<string, any>;
      next_run_at?: string;
      is_active?: boolean;
    }) => {
      const { next_run_at, is_active = false, ...rest } = params;
      const { error } = await supabase.from("agent_heartbeats").insert({
        user_id: userId,
        ...rest,
        is_active,
        ...(next_run_at ? { next_run_at } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["heartbeats", userId] });
      toast.success("Heartbeat created! Enable it when ready 🐝");
    },
    onError: (err) => toast.error(`Create failed: ${err.message}`),
  });

  return {
    heartbeats,
    isLoading,
    toggleHeartbeat,
    triggerHeartbeat,
    deleteHeartbeat,
    updateHeartbeat,
    createHeartbeat,
  };
}
