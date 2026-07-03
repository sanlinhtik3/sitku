import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface HeartbeatLog {
  id: string;
  heartbeat_id: string;
  user_id: string;
  status: string;
  result: Record<string, any> | null;
  created_at: string;
}

const PAGE_SIZE = 5;

/**
 * Filter out orphan "running" logs that were superseded by a later success/error/running log.
 * Only the most recent "running" log is kept (if no finalization exists yet).
 */
function filterOrphanRunningLogs(logs: HeartbeatLog[]): HeartbeatLog[] {
  // logs are sorted newest-first
  let seenFinal = false;
  return logs.filter((log) => {
    if (log.status !== "running") {
      seenFinal = true;
      return true;
    }
    // Keep running log only if it's the newest entry and no final log exists after it
    if (!seenFinal) {
      // This is the most recent running log — keep it only if it's the very first entry
      seenFinal = true; // treat first running as "seen" so subsequent ones are dropped
      return true;
    }
    // Orphan running log — drop it
    return false;
  });
}

export function useHeartbeatLogs(heartbeatId: string | null, page: number = 0) {
  const queryClient = useQueryClient();
  const queryKey = ["heartbeat-logs", heartbeatId, page];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!heartbeatId) return { logs: [], total: 0 };

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await supabase
        .from("agent_heartbeat_logs")
        .select("*", { count: "exact" })
        .eq("heartbeat_id", heartbeatId)
        .neq("status", "running") // Skip intermediate "running" start-logs
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      return {
        logs: (data || []) as HeartbeatLog[],
        total: count || 0,
      };
    },
    enabled: !!heartbeatId,
    staleTime: 1000 * 5,
  });

  // ─── Realtime subscription for log updates ───
  useEffect(() => {
    if (!heartbeatId) return;

    const channel = supabase
      .channel(`heartbeat-logs-${heartbeatId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_heartbeat_logs",
          filter: `heartbeat_id=eq.${heartbeatId}`,
        },
        () => {
          // Invalidate all pages for this heartbeat
          queryClient.invalidateQueries({ queryKey: ["heartbeat-logs", heartbeatId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [heartbeatId, queryClient]);

  return {
    logs: data?.logs || [],
    total: data?.total || 0,
    totalPages: Math.ceil((data?.total || 0) / PAGE_SIZE),
    isLoading,
    pageSize: PAGE_SIZE,
  };
}
