import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SubAgentStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  avgDurationMs: number | null;
}

interface SubAgentTask {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export function useSubAgentStats(isActive: boolean = true) {
  const zombieCleanupDone = useRef(false);

  // Fix 6: One-time zombie cleanup on mount, not inside the polling queryFn
  useEffect(() => {
    if (zombieCleanupDone.current) return;
    zombieCleanupDone.current = true;

    const cleanup = async () => {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: zombies } = await supabase
        .from("agent_sub_tasks")
        .select("id")
        .eq("status", "running")
        .lt("created_at", twoMinutesAgo);

      if (zombies && zombies.length > 0) {
        console.log(`[SubAgentStats] Cleaning up ${zombies.length} zombie tasks`);
        for (const z of zombies) {
          await supabase
            .from("agent_sub_tasks")
            .update({ status: "timed_out", completed_at: new Date().toISOString() })
            .eq("id", z.id);
        }
      }
    };
    cleanup();
  }, []);

  const statsQuery = useQuery({
    queryKey: ["sub-agent-stats"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: tasks } = await supabase
        .from("agent_sub_tasks")
        .select("id, status, created_at, completed_at")
        .gte("created_at", since);

      const activeTasks = (tasks || []) as SubAgentTask[];
      const running = activeTasks.filter((t) => t.status === "running").length;
      const completed = activeTasks.filter((t) => t.status === "completed").length;
      const failed = activeTasks.filter((t) => t.status === "failed" || t.status === "timed_out").length;
      const pending = activeTasks.filter((t) => t.status === "pending").length;

      const durations = activeTasks
        .filter((t) => t.status === "completed" && t.completed_at && t.created_at)
        .map((t) => new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime());

      const avgDurationMs = durations.length > 0
        ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length)
        : null;

      return {
        total: activeTasks.length,
        pending,
        running,
        completed,
        failed,
        avgDurationMs,
      } as SubAgentStats;
    },
    // PERF: No refetchInterval — Realtime subscription handles updates
    staleTime: 10000,
  });

  // Real-time toast notifications — only when UI is active
  useEffect(() => {
    if (!isActive) return;

    const channel = supabase
      .channel("sub-agent-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_sub_tasks" },
        (payload) => {
          const task = payload.new as SubAgentTask;
          if (task.status === "running") {
            toast.info(`🐝 Worker Bee spawned`, {
              duration: 4000,
            });
          }
          statsQuery.refetch();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agent_sub_tasks" },
        (payload) => {
          const task = payload.new as SubAgentTask;
          if (task.status === "completed") {
            toast.success(`🐝 Worker Bee done`, {
              duration: 4000,
            });
          } else if (task.status === "failed") {
            toast.error(`🐝 Worker Bee failed`, {
              duration: 5000,
            });
          }
          statsQuery.refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isActive]);

  return {
    stats: statsQuery.data,
    isLoading: statsQuery.isLoading,
    refetch: statsQuery.refetch,
    hasActiveWork: (statsQuery.data?.running || 0) > 0,
  };
}
