import { useState, useMemo, useEffect } from "react";
import { useHeartbeats, Heartbeat } from "@/hooks/useHeartbeats";
import { TaskDetailPanel, useCountdown, type CountdownResult } from "../scheduled-tasks/TaskDetailPanel";
import { CreateChannelTaskDialog, type BroadcastChannel } from "./CreateChannelTaskDialog";
import { cronToHuman } from "../scheduled-tasks/TaskCard";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Clock, Repeat, ListChecks, Check, Loader2, AlertCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ChannelTasksPanelProps {
  userId: string;
}

function getScheduleLabel(task: Heartbeat): string {
  const config = task.task_config as Record<string, any> | null;
  const scheduleType = config?.schedule_type;
  if (scheduleType === "one_off") return "One-time";
  return cronToHuman(task.cron_expression);
}

function getLastResultPreview(task: Heartbeat): string | null {
  const result = task.last_result as Record<string, any> | null;
  if (!result) return null;
  const content = result.notification_title || result.content_preview || result.summary || result.full_result;
  if (typeof content === "string" && content.trim()) {
    return content.slice(0, 80) + (content.length > 80 ? "…" : "");
  }
  return null;
}

function TaskListItem({ task, isSelected, onClick }: { task: Heartbeat; isSelected: boolean; onClick: () => void }) {
  const config = task.task_config as Record<string, any> | null;
  const preview = getLastResultPreview(task);
  const schedule = getScheduleLabel(task);
  const lastResult = task.last_result as Record<string, any> | null;
  const channelName = config?.delivery_channel_name;

  const autonomousCompleted = lastResult?.autonomous_status === "completed";
  const autonomousFailed = lastResult?.autonomous_status === "failed";
  const isSuccess = task.last_status === "success" || (task.last_status === "running" && autonomousCompleted);
  const isRunning = task.last_status === "running" && !autonomousCompleted && !autonomousFailed;
  const isFailed = task.last_status === "error" || task.last_status === "failed" || (task.last_status === "running" && autonomousFailed);
  const countdown = useCountdown(task.next_run_at, task.is_active && !isRunning, task.last_status, lastResult);

  const runningMeta = isRunning && lastResult ? {
    step: typeof lastResult.steps_completed === "number" ? lastResult.steps_completed : null,
    total: typeof lastResult.total_steps === "number" ? lastResult.total_steps : null,
    pct: typeof lastResult.progress_pct === "number" ? lastResult.progress_pct : 0,
  } : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-2.5 rounded-lg transition-all group",
        isSelected
          ? "bg-primary/10 border border-primary/20 shadow-sm shadow-primary/5"
          : "hover:bg-muted/20 border border-transparent"
      )}
    >
      <div className="flex items-start gap-2">
        <div className={cn(
          "shrink-0 mt-1 h-2 w-2 rounded-full transition-colors",
          isSuccess ? "bg-emerald-400 shadow-[0_0_6px_1px] shadow-emerald-400/40" :
          isRunning ? "bg-blue-400 animate-pulse shadow-[0_0_6px_1px] shadow-blue-400/40" :
          isFailed ? "bg-destructive shadow-[0_0_6px_1px] shadow-destructive/40" :
          task.is_active ? "bg-amber-400 shadow-[0_0_4px_1px] shadow-amber-400/30" : "bg-muted-foreground/30"
        )} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={cn("text-[12px] font-semibold truncate flex-1", isSelected ? "text-primary" : "text-foreground")}>
              {task.display_name}
            </p>
            {isSuccess && <Check className="h-3 w-3 text-emerald-400 shrink-0" />}
            {isFailed && <AlertCircle className="h-3 w-3 text-destructive shrink-0" />}
          </div>

          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <Repeat className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
            <span className="text-[10px] text-muted-foreground/60">{schedule}</span>
            {channelName && (
              <>
                <span className="text-[10px] text-muted-foreground/30">·</span>
                <Send className="h-2.5 w-2.5 text-[#229ED9] shrink-0" />
                <span className="text-[9px] text-[#229ED9]/70">@{channelName}</span>
              </>
            )}
          </div>

          {isRunning && runningMeta && (
            <div className="flex items-center gap-1.5 mt-1">
              <Loader2 className="h-2.5 w-2.5 text-blue-400 animate-spin shrink-0" />
              <span className="text-[9px] text-blue-400 font-medium tabular-nums">
                {runningMeta.step !== null && runningMeta.total !== null && runningMeta.total > 0
                  ? `Step ${Math.min(runningMeta.step, runningMeta.total)}/${runningMeta.total}`
                  : runningMeta.pct > 0
                    ? `${runningMeta.pct}%`
                    : "Executing…"
                }
              </span>
              {runningMeta.pct > 0 && (
                <div className="flex-1 h-1 rounded-full bg-muted/20 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-400/60 transition-all" style={{ width: `${runningMeta.pct}%` }} />
                </div>
              )}
            </div>
          )}

          {!isRunning && countdown && (
            <div className="flex items-center gap-1 mt-0.5">
              {countdown.phase === "awaiting" ? (
                <>
                  <Loader2 className="h-2.5 w-2.5 text-amber-400 animate-spin" />
                  <span className="text-[9px] text-amber-400 font-medium">{countdown.label}</span>
                </>
              ) : (
                <>
                  <Clock className="h-2.5 w-2.5 text-primary/50" />
                  <span className="text-[9px] text-primary/60 font-medium tabular-nums">{countdown.label}</span>
                </>
              )}
            </div>
          )}

          {preview && (
            <p className="text-[10px] text-muted-foreground/40 mt-1 line-clamp-1">{preview}</p>
          )}
          {task.last_run_at && (
            <p className="text-[9px] text-muted-foreground/30 mt-0.5">
              {formatDistanceToNow(new Date(task.last_run_at), { addSuffix: true })}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

export function ChannelTasksPanel({ userId }: ChannelTasksPanelProps) {
  const { heartbeats, isLoading, toggleHeartbeat, triggerHeartbeat, deleteHeartbeat, updateHeartbeat, createHeartbeat } = useHeartbeats(userId);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [channels, setChannels] = useState<BroadcastChannel[]>([]);

  useEffect(() => {
    const fetchChannels = async () => {
      const { data } = await supabase
        .from("broadcast_channels")
        .select("id, channel_name, channel_id, is_default") as { data: Array<{ id: string; channel_name: string; channel_id: string; is_default: boolean | null }> | null };
      if (data) setChannels(data.map(c => ({ ...c, is_default: c.is_default ?? false })));
    };
    fetchChannels();
  }, [userId, showCreate]);

  // Only Telegram broadcast tasks
  const telegramTasks = useMemo(() => {
    return heartbeats.filter(h => {
      const config = h.task_config as Record<string, any> | null;
      return h.task_type === "scheduled_task" && config?.delivery_target === "telegram";
    });
  }, [heartbeats]);

  const selectedTask = useMemo(() =>
    telegramTasks.find(t => t.id === selectedTaskId) || null,
    [telegramTasks, selectedTaskId]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#229ED9]/20 to-cyan-500/20 flex items-center justify-center border border-[#229ED9]/10">
            <Send className="h-3.5 w-3.5 text-[#229ED9]" />
          </div>
          <span className="text-xs font-semibold text-foreground">Broadcast Tasks</span>
          {telegramTasks.length > 0 && (
            <Badge className="text-[9px] px-1.5 py-0 h-4 bg-[#229ED9]/10 text-[#229ED9] border-[#229ED9]/20 rounded-full font-medium">
              {telegramTasks.length}
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCreate(true)}
          className="h-7 text-[11px] gap-1.5 border-[#229ED9]/30 hover:border-[#229ED9] hover:bg-[#229ED9]/5 text-[#229ED9]"
        >
          <Plus className="h-3 w-3" />
          Create
        </Button>
      </div>

      {telegramTasks.length === 0 && !selectedTask ? (
        <div className="text-center py-8 rounded-xl border border-dashed border-border/30 bg-card/20">
          <div className="h-10 w-10 rounded-xl bg-muted/20 flex items-center justify-center mx-auto mb-2">
            <Send className="h-5 w-5 text-muted-foreground/40" />
          </div>
          <p className="text-xs text-muted-foreground/60 font-medium">No broadcast tasks yet</p>
          <p className="text-[10px] text-muted-foreground/40 mt-0.5">Create a task to automate Telegram posting</p>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-3 min-h-[300px] overflow-hidden">
          <div className={cn(
            "md:w-[42%] lg:w-[38%] xl:w-[34%] md:min-w-[320px] md:max-w-[460px] shrink-0 rounded-xl border border-border/20 bg-card/30 backdrop-blur-sm overflow-hidden",
            selectedTask && "hidden md:block"
          )}>
            <ScrollArea className="h-[400px]">
              <div className="p-1.5 space-y-1">
                {telegramTasks.map((task) => (
                  <TaskListItem
                    key={task.id}
                    task={task}
                    isSelected={selectedTaskId === task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className={cn(
            "flex-1 min-w-0 rounded-xl border border-border/20 bg-card/30 backdrop-blur-sm overflow-hidden min-h-[400px]",
            !selectedTask && "hidden md:flex"
          )}>
            {selectedTask ? (
              <TaskDetailPanel
                task={selectedTask}
                onToggle={(active) => toggleHeartbeat.mutate({ id: selectedTask.id, is_active: active })}
                onTrigger={() => triggerHeartbeat.mutate(selectedTask.id)}
                onDelete={() => { deleteHeartbeat.mutate(selectedTask.id); setSelectedTaskId(null); }}
                onUpdate={(params) => updateHeartbeat.mutate(params)}
                isTriggerPending={triggerHeartbeat.isPending}
                triggeringId={triggerHeartbeat.variables || null}
                onBack={() => setSelectedTaskId(null)}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                <div className="h-12 w-12 rounded-2xl bg-muted/15 flex items-center justify-center mb-3 border border-border/10">
                  <Send className="h-6 w-6 text-muted-foreground/30" />
                </div>
                <p className="text-xs font-medium text-muted-foreground/50">Select a task to view details</p>
              </div>
            )}
          </div>
        </div>
      )}

      <CreateChannelTaskDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSubmit={(params) => {
          createHeartbeat.mutate(params);
          setShowCreate(false);
        }}
        isPending={createHeartbeat.isPending}
        channels={channels}
      />
    </div>
  );
}
