import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ExecutionTrace {
  taskId: string | null;
  status: string | null;
  progressPct: number;
  currentStep: number;
  totalSteps: number;
  agentRoles: string[];
  error: string | null;
  updatedAt: string | null;
  steps: ExecutionStep[];
  isLoading: boolean;
}

export interface ExecutionStep {
  id: string;
  stepIndex: number;
  agentRole: string | null;
  title: string | null;
  status: string;
  result: string | null;
  updatedAt: string;
}

const EMPTY_TRACE: ExecutionTrace = {
  taskId: null,
  status: null,
  progressPct: 0,
  currentStep: 0,
  totalSteps: 0,
  agentRoles: [],
  error: null,
  updatedAt: null,
  steps: [],
  isLoading: false,
};

/**
 * Subscribes to real-time updates from autonomous_tasks + autonomous_task_steps
 * for a given autonomous_task_id (extracted from heartbeat last_result).
 */
export function useHeartbeatExecutionTrace(
  autonomousTaskId: string | null,
  heartbeatId?: string | null,
): ExecutionTrace {
  const [trace, setTrace] = useState<ExecutionTrace>(EMPTY_TRACE);
  const queryClient = useQueryClient();

  const fetchSnapshot = useCallback(async (taskId: string) => {
    const [taskRes, stepsRes] = await Promise.all([
      supabase
        .from("autonomous_tasks")
        .select("status, progress_pct, current_step, total_steps, error, updated_at, agent_roles_used")
        .eq("id", taskId)
        .maybeSingle(),
      supabase
        .from("autonomous_task_steps")
        .select("id, step_index, agent_role, title, status, result, updated_at")
        .eq("task_id", taskId)
        .order("step_index", { ascending: true })
        .limit(20),
    ]);

    const task = taskRes.data;
    const steps = (stepsRes.data || []) as any[];

    setTrace({
      taskId,
      status: task?.status || null,
      progressPct: task?.progress_pct || 0,
      currentStep: task?.current_step || 0,
      totalSteps: task?.total_steps || 0,
      agentRoles: Array.isArray(task?.agent_roles_used) ? task.agent_roles_used : [],
      error: task?.error || null,
      updatedAt: task?.updated_at || null,
      steps: steps.map((s: any) => ({
        id: s.id,
        stepIndex: s.step_index,
        agentRole: s.agent_role,
        title: s.title,
        status: s.status,
        result: typeof s.result === "string" ? s.result?.slice(0, 200) : null,
        updatedAt: s.updated_at,
      })),
      isLoading: false,
    });

    // Fast UI reconciliation: if autonomous task is final, sync heartbeat caches immediately.
    if (heartbeatId && (task?.status === "completed" || task?.status === "failed")) {
      const resolvedStatus = task.status === "completed" ? "success" : "failed";
      const nowIso = new Date().toISOString();

      queryClient.setQueriesData({ queryKey: ["heartbeats"] }, (existing: any) => {
        if (!Array.isArray(existing)) return existing;

        return existing.map((hb: any) => {
          if (hb?.id !== heartbeatId || hb?.last_status !== "running") return hb;

          const lastResult = hb?.last_result && typeof hb.last_result === "object" ? hb.last_result : {};
          return {
            ...hb,
            last_status: resolvedStatus,
            last_result: {
              ...lastResult,
              autonomous_status: task.status,
              progress_pct:
                typeof task?.progress_pct === "number"
                  ? task.progress_pct
                  : task.status === "completed"
                    ? 100
                    : (lastResult.progress_pct ?? 0),
              steps_completed:
                typeof task?.current_step === "number"
                  ? task.current_step
                  : (lastResult.steps_completed ?? 0),
              total_steps:
                typeof task?.total_steps === "number"
                  ? task.total_steps
                  : (lastResult.total_steps ?? 0),
              completed_at: nowIso,
              ...(task.status === "failed"
                ? { error: task?.error || lastResult.error || "Autonomous execution failed" }
                : {}),
            },
          };
        });
      });

      queryClient.invalidateQueries({ queryKey: ["heartbeats"] });
      queryClient.invalidateQueries({ queryKey: ["heartbeat-logs", heartbeatId] });
    }
  }, [heartbeatId, queryClient]);

  useEffect(() => {
    if (!autonomousTaskId) {
      setTrace(EMPTY_TRACE);
      return;
    }

    setTrace((prev) => ({ ...prev, taskId: autonomousTaskId, isLoading: true }));
    fetchSnapshot(autonomousTaskId);

    // Realtime: autonomous_tasks
    const taskChannel = supabase
      .channel(`exec-trace-task-${autonomousTaskId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "autonomous_tasks", filter: `id=eq.${autonomousTaskId}` },
        () => fetchSnapshot(autonomousTaskId),
      )
      .subscribe();

    // Realtime: autonomous_task_steps
    const stepsChannel = supabase
      .channel(`exec-trace-steps-${autonomousTaskId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "autonomous_task_steps", filter: `task_id=eq.${autonomousTaskId}` },
        () => fetchSnapshot(autonomousTaskId),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(taskChannel);
      supabase.removeChannel(stepsChannel);
    };
  }, [autonomousTaskId, fetchSnapshot]);

  return trace;
}
