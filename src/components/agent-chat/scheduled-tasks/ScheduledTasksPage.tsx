import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { safeDistanceToNow } from "./dateSafe";
import {
  Clock, CalendarClock, Loader2, CheckCircle2, Plus, Sun, Brain, Heart, Send,
  Cpu, X, PauseCircle, ListChecks, SlidersHorizontal, Sparkles, MessageCircle,
} from "lucide-react";
import { useHeartbeats, Heartbeat } from "@/hooks/useHeartbeats";
import { CreateTaskForm } from "./CreateTaskForm";
import { supabase } from "@/integrations/supabase/client";
import type { BroadcastChannel } from "../neural-link/CreateChannelTaskDialog";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { TaskTemplateCards } from "./TaskTemplateCards";
import { TaskTemplate } from "./taskTemplates";
import { cronToHuman } from "./TaskCard";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ScheduledTasksPageProps {
  userId: string;
  onClose: () => void;
}

type FilterType = "all" | "active" | "paused" | "completed";
type CategoryType = "all" | "personal" | "telegram";

const SYSTEM_TASK_TYPES = ["briefing", "memory_review", "check_in"];
const TASK_PANEL_WIDTH_KEY = "beebot-automate-task-panel-width";
const TASK_PANEL_MIN_WIDTH = 300;
const TASK_PANEL_MAX_WIDTH = 560;
const TASK_DETAIL_MIN_WIDTH = 420;

function clampTaskPanelWidth(width: number, containerWidth?: number) {
  const responsiveMax = containerWidth
    ? Math.min(TASK_PANEL_MAX_WIDTH, Math.max(TASK_PANEL_MIN_WIDTH, containerWidth - TASK_DETAIL_MIN_WIDTH))
    : TASK_PANEL_MAX_WIDTH;
  return Math.min(Math.max(width, TASK_PANEL_MIN_WIDTH), responsiveMax);
}

function isSystemHeartbeat(h: { task_type: string; name: string }) {
  return SYSTEM_TASK_TYPES.includes(h.task_type) ||
    ["briefing", "memory_review", "check_in"].some(k => h.name?.includes(k));
}

function getHeartbeatTypeInfo(h: { task_type: string; name: string; task_config: unknown }) {
  const config = h.task_config as Record<string, any> | null;
  if (h.task_type === "briefing" || h.name?.includes("briefing"))
    return { icon: Sun, label: "Briefing", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/15" };
  if (h.task_type === "memory_review" || h.name?.includes("memory"))
    return { icon: Brain, label: "Memory", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/15" };
  if (h.task_type === "check_in" || h.name?.includes("check_in"))
    return { icon: Heart, label: "Check-In", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/15" };
  if (config?.delivery_target === "telegram")
    return { icon: Send, label: "Telegram", color: "text-[#229ED9]", bg: "bg-[#229ED9]/10 border-[#229ED9]/15" };
  if (config?.delivery_target === "chat")
    return { icon: Cpu, label: "Chat", color: "text-primary", bg: "bg-primary/10 border-primary/15" };
  return { icon: Clock, label: "Task", color: "text-muted-foreground", bg: "bg-muted/10 border-border/15" };
}

export function ScheduledTasksPage({ userId, onClose }: ScheduledTasksPageProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [category, setCategory] = useState<CategoryType>("all");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [templatePrefill, setTemplatePrefill] = useState<TaskTemplate | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [taskPanelWidth, setTaskPanelWidth] = useState(() => {
    if (typeof window === "undefined") return 340;
    const stored = Number(window.localStorage.getItem(TASK_PANEL_WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampTaskPanelWidth(stored) : 340;
  });
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const triggeringIdRef = useRef<string | null>(null);
  const { heartbeats, isLoading, toggleHeartbeat, triggerHeartbeat, deleteHeartbeat, updateHeartbeat, createHeartbeat } = useHeartbeats(userId);
  const [channels, setChannels] = useState<BroadcastChannel[]>([]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    window.localStorage.setItem(TASK_PANEL_WIDTH_KEY, String(Math.round(taskPanelWidth)));
  }, [isDesktop, taskPanelWidth]);

  const resizeTaskPanel = useCallback((clientX: number) => {
    const rect = splitContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTaskPanelWidth(clampTaskPanelWidth(clientX - rect.left, rect.width));
  }, []);

  const handleResizePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDesktop) return;
    event.preventDefault();
    resizeTaskPanel(event.clientX);

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMove = (moveEvent: PointerEvent) => resizeTaskPanel(moveEvent.clientX);
    const handleUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  }, [isDesktop, resizeTaskPanel]);

  const handleResizeKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isDesktop) return;
    const rect = splitContainerRef.current?.getBoundingClientRect();
    const step = event.shiftKey ? 40 : 16;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setTaskPanelWidth(width => clampTaskPanelWidth(width - step, rect?.width));
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setTaskPanelWidth(width => clampTaskPanelWidth(width + step, rect?.width));
    }
    if (event.key === "Home") {
      event.preventDefault();
      setTaskPanelWidth(TASK_PANEL_MIN_WIDTH);
    }
    if (event.key === "End") {
      event.preventDefault();
      setTaskPanelWidth(clampTaskPanelWidth(TASK_PANEL_MAX_WIDTH, rect?.width));
    }
  }, [isDesktop]);

  useEffect(() => {
    const fetchChannels = async () => {
      const { data } = await supabase
        .from("broadcast_channels")
        .select("id, channel_name, channel_id, is_default") as { data: Array<{ id: string; channel_name: string; channel_id: string; is_default: boolean | null }> | null };
      if (data) setChannels(data.map(c => ({ ...c, is_default: c.is_default ?? false })));
    };
    fetchChannels();
  }, [userId]);

  const allScheduled = useMemo(() => heartbeats.filter(h =>
    h.task_type === "scheduled_task" || isSystemHeartbeat(h)
  ), [heartbeats]);

  const categoryFiltered = useMemo(() => {
    switch (category) {
      case "personal":
        return allScheduled.filter(h => isSystemHeartbeat(h) || (h.task_config as any)?.delivery_target !== "telegram");
      case "telegram":
        return allScheduled.filter(h => (h.task_config as any)?.delivery_target === "telegram");
      default:
        return allScheduled;
    }
  }, [allScheduled, category]);

  const isCompletedOneOff = (h: Heartbeat) => {
    const cfg = h.task_config as Record<string, any> | null;
    const isOneOff = cfg?.schedule_type === "one_off" || !h.cron_expression;
    return isOneOff && !h.is_active && h.last_status === "success" && !!h.last_run_at;
  };

  const filteredTasks = useMemo(() => {
    switch (filter) {
      case "active": return categoryFiltered.filter(t => t.is_active);
      case "paused": return categoryFiltered.filter(t => !t.is_active && !isCompletedOneOff(t));
      case "completed": return categoryFiltered.filter(isCompletedOneOff);
      default: return categoryFiltered;
    }
  }, [categoryFiltered, filter]);

  const activeCount = categoryFiltered.filter(t => t.is_active).length;
  const completedCount = categoryFiltered.filter(isCompletedOneOff).length;
  const pausedCount = categoryFiltered.filter(t => !t.is_active && !isCompletedOneOff(t)).length;

  const selectedTask = useMemo(() => allScheduled.find(t => t.id === selectedTaskId) || null, [allScheduled, selectedTaskId]);

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Delete "${name}"?`)) {
      deleteHeartbeat.mutate(id);
      if (selectedTaskId === id) setSelectedTaskId(null);
    }
  };

  const handleTrigger = (id: string) => {
    triggeringIdRef.current = id;
    triggerHeartbeat.mutate(id, { onSettled: () => { triggeringIdRef.current = null; } });
  };

  const handleTemplateSelect = useCallback((template: TaskTemplate) => {
    setTemplatePrefill(template);
    setShowCreateForm(true);
  }, []);

  const filters: { key: FilterType; label: string; count: number; icon: typeof CheckCircle2 }[] = [
    { key: "all", label: "All", count: categoryFiltered.length, icon: ListChecks },
    { key: "active", label: "Active", count: activeCount, icon: Sparkles },
    { key: "paused", label: "Paused", count: pausedCount, icon: PauseCircle },
    { key: "completed", label: "Done", count: completedCount, icon: CheckCircle2 },
  ];

  const showMobileDetail = !!selectedTask;

  return (
    <div className="flex-1 min-h-0 m-1 sm:m-1.5 rounded-[32px] lg:border lg:border-white/[0.08] bg-[linear-gradient(180deg,#080a0c_0%,#050607_42%,#030405_100%)] backdrop-blur-2xl overflow-hidden flex flex-col relative shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
      {/* Integrated dashboard header */}
      <div className="shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-[18px] bg-primary/10 flex items-center justify-center border border-primary/18 shadow-[0_0_20px_hsl(var(--primary)/0.08)]">
            <CalendarClock className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold leading-tight text-foreground">Automate</h2>
              <span className="hidden rounded-full border border-primary/15 bg-primary/10 px-2 py-0.5 text-[9px] font-semibold text-primary sm:inline-flex">
                Agentic tasks
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground/75">
              {categoryFiltered.length} task{categoryFiltered.length !== 1 ? "s" : ""} · {activeCount} active · {completedCount} done
            </p>
          </div>

          <div className="ml-auto hidden items-center gap-1.5 md:flex">
            <StatusChip icon={Sparkles} label="Active" value={activeCount} tone="primary" />
            <StatusChip icon={PauseCircle} label="Paused" value={pausedCount} tone="neutral" />
            <StatusChip icon={CheckCircle2} label="Done" value={completedCount} tone="success" />
          </div>

          <button
            onClick={() => { setTemplatePrefill(null); setShowCreateForm(v => !v); }}
            className="ml-auto h-8 rounded-full bg-primary px-3 text-[11px] font-semibold text-primary-foreground shadow-[0_0_18px_hsl(var(--primary)/0.18)] transition-all hover:bg-primary/90 md:ml-0 flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New</span>
          </button>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full flex items-center justify-center border border-white/[0.07] bg-white/[0.035] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
            title="Close"
            aria-label="Close Automate"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={splitContainerRef} className="flex flex-1 min-h-0 overflow-hidden px-3 pb-3 sm:px-4 sm:pb-4">
        {/* ─── Left Panel: Task List ─── */}
        <div
          className={`flex flex-col w-full md:shrink-0 rounded-[26px] border border-white/[0.065] bg-black/20 overflow-hidden ${showMobileDetail ? "hidden md:flex" : "flex"}`}
          style={isDesktop ? { width: taskPanelWidth, minWidth: taskPanelWidth } : undefined}
        >
          <div className="shrink-0 px-4 pt-3 pb-3 border-b border-white/[0.06]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground/80 tracking-wider uppercase flex items-center gap-1.5">
                <SlidersHorizontal className="h-3 w-3" />
                My Tasks
              </span>
              <button
                onClick={() => { setTemplatePrefill(null); setShowCreateForm(v => !v); }}
                className="h-7 px-2.5 rounded-full text-[11px] font-medium bg-white/[0.05] text-foreground hover:bg-white/[0.08] border border-white/[0.08] transition-all flex items-center gap-1"
              >
                <Plus className="h-3 w-3" />
                Create
              </button>
            </div>

            {/* Category Tabs */}
            <div className="grid grid-cols-3 gap-1.5 mt-3 rounded-full bg-black/30 border border-white/[0.06] p-1">
              {([
                { key: "all" as CategoryType, label: "All", icon: ListChecks },
                { key: "personal" as CategoryType, label: "Mine", icon: Heart },
                { key: "telegram" as CategoryType, label: "Telegram", icon: Send },
              ]).map(c => (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={`px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-all whitespace-nowrap flex items-center justify-center gap-1 ${
                    category === c.key
                      ? "bg-primary text-primary-foreground shadow-[0_0_14px_hsl(var(--primary)/0.18)]"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
                  }`}
                >
                  <c.icon className="h-3 w-3" />
                  {c.label}
                </button>
              ))}
            </div>

            {/* Status Filter Pills */}
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {filters.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-2 py-1.5 rounded-[14px] text-[10.5px] font-medium transition-all whitespace-nowrap flex items-center justify-center gap-1 border ${
                    filter === f.key
                      ? "bg-white/[0.08] text-foreground border-white/[0.12]"
                      : "bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06] border-white/[0.04]"
                  }`}
                >
                  <f.icon className="h-3 w-3" />
                  {f.label}
                  <span className="opacity-60 tabular-nums">{f.count}</span>
                </button>
              ))}
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            {showCreateForm && (
              <div className="pt-2">
                <CreateTaskForm
                  onSubmit={(params) => {
                    createHeartbeat.mutate(params, {
                      onSuccess: () => { setShowCreateForm(false); setTemplatePrefill(null); },
                    });
                  }}
                  onCancel={() => { setShowCreateForm(false); setTemplatePrefill(null); }}
                  isPending={createHeartbeat.isPending}
                  prefill={templatePrefill}
                  channels={channels}
                />
              </div>
            )}

            <div className="px-3 py-2 space-y-1.5">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredTasks.length === 0 && !showCreateForm ? (
                <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                  <div className="h-12 w-12 rounded-[22px] bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-2">
                    <Clock className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground/60">No tasks yet</p>
                  <p className="text-[10px] text-muted-foreground/40 mt-0.5">Pick a template or create one</p>
                </div>
              ) : (
                filteredTasks.map(task => (
                  <TaskListItem
                    key={task.id}
                    task={task}
                    isSelected={selectedTaskId === task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <div
          role="separator"
          aria-label="Resize task list"
          aria-orientation="vertical"
          aria-valuemin={TASK_PANEL_MIN_WIDTH}
          aria-valuemax={TASK_PANEL_MAX_WIDTH}
          aria-valuenow={Math.round(taskPanelWidth)}
          tabIndex={0}
          onPointerDown={handleResizePointerDown}
          onKeyDown={handleResizeKeyDown}
          className={`
            group relative mx-1.5 hidden w-px shrink-0 cursor-col-resize bg-white/[0.06] outline-none md:block
            focus-visible:bg-primary/50
          `}
        >
          <div className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2" />
          <div className="absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.10] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        </div>

        {/* ─── Right Panel: Task Detail ─── */}
        <div className={`flex-1 flex flex-col min-w-0 rounded-[26px] border border-white/[0.065] bg-white/[0.025] overflow-hidden ${showMobileDetail ? "flex" : "hidden md:flex"}`}>
          {selectedTask ? (
            <TaskDetailPanel
              task={selectedTask}
              onToggle={(active) => toggleHeartbeat.mutate({ id: selectedTask.id, is_active: active })}
              onTrigger={() => handleTrigger(selectedTask.id)}
              onDelete={() => handleDelete(selectedTask.id, selectedTask.display_name)}
              onUpdate={(params) => updateHeartbeat.mutate(params)}
              isTriggerPending={triggerHeartbeat.isPending}
              triggeringId={triggeringIdRef.current}
              onBack={() => setSelectedTaskId(null)}
            />
          ) : (
            <ScrollArea className="flex-1">
              <div className="flex flex-col items-center justify-center min-h-full py-8 px-6">
                <div className="h-14 w-14 rounded-[26px] bg-gradient-to-br from-primary/15 to-cyan-400/5 border border-primary/15 flex items-center justify-center mx-auto mb-3 shadow-[0_0_28px_hsl(var(--primary)/0.10)]">
                  <CalendarClock className="h-6 w-6 text-primary/70" />
                </div>
                <p className="text-sm font-semibold text-foreground/80">Choose a task</p>
                <p className="text-[11px] text-muted-foreground/50 mt-1 mb-6 flex items-center gap-1.5">
                  <MessageCircle className="h-3 w-3" />
                  Templates make the first step easier
                </p>
                <div className="w-full max-w-lg">
                  <TaskTemplateCards onSelect={handleTemplateSelect} />
                </div>
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusChip({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number;
  tone: "primary" | "success" | "neutral";
}) {
  const toneClass = tone === "success"
    ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
    : tone === "neutral"
      ? "text-muted-foreground bg-white/[0.045] border-white/[0.075]"
      : "text-primary bg-primary/10 border-primary/20";
  return (
    <div className={`h-7 px-2.5 rounded-full border flex items-center gap-1.5 ${toneClass}`}>
      <Icon className="h-3 w-3" />
      <span className="text-[10px] font-semibold">{label}</span>
      <span className="text-[10px] tabular-nums opacity-80">{value}</span>
    </div>
  );
}

// ─── Task List Item with Type Badge ───
function TaskListItem({ task, isSelected, onClick }: { task: Heartbeat; isSelected: boolean; onClick: () => void }) {
  const taskConfig = task.task_config as Record<string, any> | null;
  const isOneOff = taskConfig?.schedule_type === "one_off" || !task.cron_expression;
  const schedule = isOneOff ? "One-time" : cronToHuman(task.cron_expression);
  const completed = !task.is_active && task.last_status === "success" && !!task.last_run_at && isOneOff;
  const typeInfo = getHeartbeatTypeInfo(task);
  const TypeIcon = typeInfo.icon;

  const lastResult = task.last_result as Record<string, any> | null;
  const lastTitle = lastResult?.notification_title || lastResult?.summary?.slice(0, 50) || null;
  const lastRunRelative = task.last_run_at
    ? safeDistanceToNow(task.last_run_at) || null
    : null;

  const statusDot = completed
    ? "bg-emerald-400"
    : task.last_status === "running"
      ? "bg-blue-400"
      : task.is_active
        ? task.last_status === "error" ? "bg-red-400" : "bg-emerald-400"
        : "bg-muted-foreground/40";
  const statusLabel = completed ? "Done" : task.is_active ? task.last_status === "error" ? "Needs check" : "Active" : "Paused";
  const statusText = completed
    ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
    : task.is_active
      ? task.last_status === "error"
        ? "text-red-300 bg-red-500/10 border-red-500/20"
        : "text-primary bg-primary/10 border-primary/20"
      : "text-muted-foreground bg-white/[0.04] border-white/[0.06]";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-[22px] px-3 py-3 transition-all group border ${
        isSelected
          ? "bg-primary/10 border-primary/30 shadow-[0_0_22px_hsl(var(--primary)/0.08)]"
          : "bg-white/[0.025] border-white/[0.04] hover:bg-white/[0.055] hover:border-white/[0.09]"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className={`shrink-0 h-8 w-8 rounded-[16px] border flex items-center justify-center ${typeInfo.bg}`}>
          <TypeIcon className={`h-3.5 w-3.5 ${typeInfo.color}`} />
        </div>
        <div className="flex-1 min-w-0">
        <p className={`text-[12px] font-medium leading-snug truncate flex-1 min-w-0 ${isSelected ? "text-primary" : "text-foreground"}`}>
          {task.display_name}
        </p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium border flex items-center gap-1 ${statusText}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusDot} ${task.is_active ? "animate-pulse" : ""}`} />
              {statusLabel}
            </span>
            <span className="text-[10px] text-muted-foreground/55">{schedule}</span>
            {lastRunRelative && (
              <span className="text-[9px] text-muted-foreground/40 ml-auto">{lastRunRelative}</span>
            )}
          </div>
          {lastTitle && (
            <p className="text-[10px] text-muted-foreground/45 mt-1.5 truncate">{lastTitle}</p>
          )}
        </div>
      </div>
    </button>
  );
}
