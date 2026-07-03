import { useMemo, useState, useEffect } from "react";
import {
  Pencil, Play, Trash2, ChevronLeft, ChevronRight, Loader2, Check, X,
  ArrowLeft, Repeat, Clock, ChevronDown, ChevronUp, AlertTriangle,
  Search, FileText, Send, ShieldCheck, Globe, Cpu, Activity,
  Wand2, Languages, Bell, Sun, Brain, Heart,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Heartbeat } from "@/hooks/useHeartbeats";
import { useHeartbeatLogs } from "@/hooks/useHeartbeatLogs";
import { useHeartbeatExecutionTrace } from "@/hooks/useHeartbeatExecutionTrace";
import { cronToHuman } from "./TaskCard";
import { safeDate, safeFormat, safeDistanceToNow, safeLocaleString } from "./dateSafe";
import ReactMarkdown from "react-markdown";

interface TaskDetailPanelProps {
  task: Heartbeat;
  onToggle: (active: boolean) => void;
  onTrigger: () => void;
  onDelete: () => void;
  onUpdate: (params: { id: string; display_name?: string; task_config?: Record<string, any> }) => void;
  isTriggerPending: boolean;
  triggeringId: string | null;
  onBack?: () => void;
}

type LogRecord = { id: string; status: string; result: Record<string, any> | null; created_at: string };
type NormalizedStatus = "success" | "running" | "skipped" | "failed";

function normalizeStatus(log: LogRecord): NormalizedStatus {
  const logStatus = (log.status || "").toLowerCase();
  if (logStatus === "success") return "success";
  if (logStatus === "error") return "failed";
  if (logStatus === "skipped") return "skipped";
  const result = log.result || {};
  const autonomousStatus = String(result.autonomous_status || "").toLowerCase();
  if (autonomousStatus === "failed") return "failed";
  if (autonomousStatus === "completed") return "success";
  return "running";
}

function extractResultContent(result: Record<string, any> | null, status?: NormalizedStatus): string | null {
  if (!result) return null;
  if (status === "failed") {
    const err = result.error || result.autonomous_error || result.failure_reason;
    if (typeof err === "string" && err.trim().length > 0) return err;
  }
  const candidates = [result.full_result, result.content_preview, result.details, result.summary, result.error];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c;
  }
  return null;
}

function getLogTitle(log: LogRecord, status: NormalizedStatus): string {
  const result = log.result || {};
  if (typeof result.notification_title === "string" && result.notification_title.trim()) return result.notification_title;
  if (status === "running") {
    const step = result.steps_completed;
    const total = result.total_steps;
    if (typeof step === "number" && typeof total === "number" && total > 0) return `Task running (${Math.min(step, total)}/${total})`;
    return "Task is running...";
  }
  const content = extractResultContent(result, status);
  if (content) {
    if (status === "failed") return `Execution failed: ${content.slice(0, 64)}${content.length > 64 ? "…" : ""}`;
    return content.slice(0, 70) + (content.length > 70 ? "…" : "");
  }
  if (status === "success") return "Task completed";
  if (status === "skipped") return "Skipped — nothing to report";
  return "Execution failed";
}

function getStatusMeta(status: NormalizedStatus) {
  if (status === "success") return { dot: "bg-emerald-400", label: "Success", badge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" };
  if (status === "running") return { dot: "bg-blue-400", label: "Running", badge: "text-blue-400 bg-blue-500/10 border-blue-500/20" };
  if (status === "skipped") return { dot: "bg-amber-400", label: "Skipped", badge: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
  return { dot: "bg-red-400", label: "Failed", badge: "text-red-400 bg-red-500/10 border-red-500/20" };
}

function ResultMarkdown({ content }: { content: string }) {
  return (
    <div className="text-[11px] text-muted-foreground leading-relaxed prose prose-invert prose-xs max-w-none
      [&_h1]:text-[13px] [&_h1]:font-bold [&_h1]:text-foreground [&_h1]:mb-1.5
      [&_h2]:text-[12px] [&_h2]:font-semibold [&_h2]:text-foreground/90 [&_h2]:mb-1
      [&_h3]:text-[11px] [&_h3]:font-semibold [&_h3]:text-foreground/80 [&_h3]:mb-1
      [&_p]:mb-1.5 [&_p]:text-muted-foreground
      [&_ul]:ml-3 [&_ul]:mb-1.5 [&_ol]:ml-3 [&_ol]:mb-1.5
      [&_li]:mb-0.5 [&_li]:text-muted-foreground
      [&_strong]:text-foreground/90 [&_em]:text-muted-foreground/80
      [&_a]:text-primary [&_a]:underline
      [&_code]:text-[10px] [&_code]:bg-muted/20 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
      [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted/20 [&_pre]:p-2
    ">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

function LatestResultPanel({ log, isTriggering, fallbackResult }: { log: LogRecord | null; isTriggering: boolean; fallbackResult?: Record<string, any> | null }) {
  // If no log but we have fallbackResult from task.last_result, synthesize a display
  const fallbackTs =
    safeDate(fallbackResult?.completed_at)?.toISOString()
    ?? safeDate(fallbackResult?.executed_at)?.toISOString()
    ?? new Date().toISOString();
  const effectiveLog = log || (fallbackResult ? {
    id: "synthetic",
    status: fallbackResult.autonomous_status === "completed" ? "success" : fallbackResult.autonomous_status === "failed" ? "error" : "running",
    result: fallbackResult,
    created_at: fallbackTs,
  } as LogRecord : null);

  if (!effectiveLog) {
    return (
      <div className="rounded-[22px] border border-white/[0.06] bg-white/[0.035] p-4">
        <div className="flex items-center gap-2 text-muted-foreground/60">
          {isTriggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
          <p className="text-xs font-medium">{isTriggering ? "Task is running..." : "No task result yet"}</p>
        </div>
        <p className="text-[11px] text-muted-foreground/50 mt-1">Trigger this task to generate full output here.</p>
      </div>
    );
  }

  const status = normalizeStatus(effectiveLog);
  const statusMeta = getStatusMeta(status);
  const result = effectiveLog.result || {};
  const content = extractResultContent(result, status);
  const failureDetail = status === "failed" ? extractResultContent(result, "failed") : null;

  return (
    <div className="rounded-[22px] border border-white/[0.06] bg-white/[0.035] overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-white/[0.06] flex items-center gap-2.5 bg-white/[0.02]">
        <div className={`shrink-0 h-2 w-2 rounded-full ${statusMeta.dot} ${status === "running" ? "animate-pulse" : ""}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-foreground truncate">{getLogTitle(effectiveLog, status)}</p>
          <p className="text-[10px] text-muted-foreground/60">
            {safeFormat(effectiveLog.created_at, "EEE MMM d yyyy · h:mm a")}
            {typeof result.duration_ms === "number" && result.duration_ms > 0 && (
              <span className="ml-1">· Ran for {(result.duration_ms / 1000).toFixed(2)}s</span>
            )}
          </p>
        </div>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium border ${statusMeta.badge}`}>
          {statusMeta.label}
        </span>
      </div>

      <div className="p-3.5 max-h-[34vh] overflow-y-auto">
        {content ? (
          <>
            {status === "failed" && failureDetail && (
              <div className="mb-2.5 rounded-[16px] border border-destructive/20 bg-destructive/5 px-2.5 py-2">
                <p className="text-[10px] font-semibold text-destructive mb-1">Failure reason</p>
                <p className="text-[11px] text-destructive/80 leading-relaxed whitespace-pre-wrap">{failureDetail}</p>
              </div>
            )}
            <ResultMarkdown content={content} />
          </>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground/60">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-[11px]">No response content captured yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ Pipeline Status Tracker ═══
type PipelineStage = { key: string; label: string; icon: typeof Search; status: "pending" | "active" | "done" | "failed" };

function derivePipelineStages(
  task: Heartbeat,
  latestLog: LogRecord | null,
  isTriggering: boolean,
  trace?: import("@/hooks/useHeartbeatExecutionTrace").ExecutionTrace | null,
): PipelineStage[] {
  const taskConfig = task.task_config as Record<string, any> | null;
  const isTelegram = taskConfig?.delivery_target === "telegram";
  const result = latestLog?.result || (task.last_result as Record<string, any>) || {};
  const taskStatus = task.last_status;

  // ═══ Trace-first resolution: if trace confirms completion, override everything ═══
  const traceCompleted = trace?.status === "completed" && (trace?.progressPct ?? 0) >= 100;
  const traceFailed = trace?.status === "failed";
  const autonomousCompleted = result.autonomous_status === "completed";

  // Task is truly done if trace says so OR autonomous_status says so OR heartbeat says success
  const isDone = traceCompleted || autonomousCompleted || taskStatus === "success";
  const isFailed = !isDone && (traceFailed || taskStatus === "failed" || taskStatus === "error");
  const isRunning = !isDone && !isFailed && (taskStatus === "running" || isTriggering);

  const stepsCompleted = typeof result.steps_completed === "number" ? result.steps_completed : 0;
  const hasContent = !!result.full_result || !!result.content_preview;
  const posted = result.posted === true || !!result.message_id || !!result.telegram_delivered_by_agent || !!result.telegram_fallback_delivery;
  const verified = result.verified_success === true || !!result.permanent_link || (result.verification_score != null && result.verification_score > 50);
  const postFailed = !!result.telegram_fallback_error && !posted;

  // If trace or autonomous confirms done, force all stages to done
  if (isDone && isTelegram) {
    return [
      { key: "research", label: "Research", icon: Search, status: "done" },
      { key: "format", label: "Format", icon: FileText, status: "done" },
      { key: "post", label: "Post", icon: Send, status: posted ? "done" : postFailed ? "failed" : "done" },
      { key: "verify", label: "Verify", icon: ShieldCheck, status: "done" },
    ];
  }

  if (isTelegram) {
    const researchDone = stepsCompleted >= 1 || hasContent || isFailed;

    return [
      { key: "research", label: "Research", icon: Search, status: researchDone ? "done" : isRunning ? "active" : "pending" },
      { key: "format", label: "Format", icon: FileText, status: hasContent ? "done" : (researchDone && isRunning) ? "active" : (isFailed && !hasContent) ? "failed" : "pending" },
      { key: "post", label: "Post", icon: Send, status: posted ? "done" : postFailed ? "failed" : (hasContent && isRunning) ? "active" : "pending" },
      { key: "verify", label: "Verify", icon: ShieldCheck, status: verified ? "done" : (posted && isRunning) ? "active" : (postFailed || (isFailed && !posted)) ? "failed" : "pending" },
    ];
  }

  if (isDone) {
    return [
      { key: "research", label: "Research", icon: Search, status: "done" },
      { key: "complete", label: "Complete", icon: Check, status: "done" },
    ];
  }

  return [
    { key: "research", label: "Research", icon: Search, status: (stepsCompleted >= 1 || isFailed) ? "done" : isRunning ? "active" : "pending" },
    { key: "complete", label: "Complete", icon: Check, status: isFailed ? "failed" : (stepsCompleted >= 1 && isRunning) ? "active" : "pending" },
  ];
}

function PipelineTracker({ task, latestLog, isTriggering, trace }: { task: Heartbeat; latestLog: LogRecord | null; isTriggering: boolean; trace: import("@/hooks/useHeartbeatExecutionTrace").ExecutionTrace }) {
  const stages = derivePipelineStages(task, latestLog, isTriggering, trace);
  const traceIsDone = trace.status === "completed" || trace.status === "failed";
  const autonomousDone = ((task.last_result as Record<string, any>)?.autonomous_status === "completed");
  const isRunning = !traceIsDone && !autonomousDone && (task.last_status === "running" || isTriggering);
  const progressPct = trace.progressPct || 0;
  const currentStep = trace.currentStep || 0;
  const totalSteps = trace.totalSteps || 0;
  const activeStepData = trace.steps.find((s) => s.status === "running" || s.status === "in_progress");

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setTick((t) => t + 1), 3000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const hasAnyActivity = stages.some((s) => s.status !== "pending");
  if (!hasAnyActivity && !isRunning) return null;

  return (
    <div className="rounded-[22px] border border-white/[0.06] bg-white/[0.035] p-3.5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold text-foreground/80">Pipeline</p>
        {isRunning && trace.taskId && (
          <span className="text-[8px] text-muted-foreground/40 font-mono tabular-nums">
            task:{trace.taskId.slice(0, 8)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-0">
        {stages.map((stage, i) => {
          const Icon = stage.icon;
          const isDone = stage.status === "done";
          const isActive = stage.status === "active";
          const isFailed = stage.status === "failed";

          return (
            <div key={stage.key} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1.5 flex-1">
                <div className={`
                  h-8 w-8 rounded-lg flex items-center justify-center border transition-all
                  ${isDone
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                    : isFailed
                      ? "bg-red-500/15 border-red-500/30 text-red-400"
                      : isActive
                        ? "bg-primary/15 border-primary/30 text-primary animate-pulse"
                        : "bg-muted/10 border-border/15 text-muted-foreground/30"
                  }
                `}>
                  {isDone ? <Check className="h-3.5 w-3.5" /> : isFailed ? <X className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                </div>
                <span className={`text-[9px] font-medium ${isDone ? "text-emerald-400" : isFailed ? "text-red-400" : isActive ? "text-primary" : "text-muted-foreground/40"}`}>
                  {stage.label}
                </span>
              </div>
              {i < stages.length - 1 && (
                <div className={`h-[2px] flex-1 mx-1 rounded-full transition-all ${isDone ? "bg-emerald-500/40" : isFailed ? "bg-red-500/30" : "bg-border/15"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Live proof-of-work: real step data */}
      {isRunning && (
        <div className="mt-3 space-y-2">
          <Progress value={progressPct} className="h-1.5" />
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground/60 tabular-nums">
              {totalSteps > 0 ? `Step ${Math.min(currentStep, totalSteps)}/${totalSteps}` : "Initializing…"}
            </span>
            <span className="text-[9px] text-primary/60 font-medium tabular-nums">{progressPct}%</span>
          </div>

          {/* Active sub-agent info */}
          {activeStepData && (
            <div className="rounded-lg border border-primary/15 bg-primary/5 px-2.5 py-1.5 flex items-center gap-2">
              <Cpu className="h-3 w-3 text-primary/70 animate-pulse shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium text-primary/80 truncate">
                  {activeStepData.agentRole ? `${activeStepData.agentRole}` : "Sub-agent"}
                  {activeStepData.title ? ` — ${activeStepData.title}` : ""}
                </p>
              </div>
            </div>
          )}

          {/* Agent roles used */}
          {trace.agentRoles.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Activity className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />
              {trace.agentRoles.map((role) => (
                <span key={role} className="text-[8px] px-1.5 py-0.5 rounded-full bg-muted/15 text-muted-foreground/60 border border-border/10">
                  {role}
                </span>
              ))}
            </div>
          )}

          {/* Last update timestamp */}
          {trace.updatedAt && (
            <p className="text-[8px] text-muted-foreground/30 tabular-nums">
              Last update: {safeFormat(trace.updatedAt, "h:mm:ss a", "")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ═══ Countdown Helper ═══
export interface CountdownResult {
  label: string;
  phase: "countdown" | "awaiting" | "executing" | "done" | "failed" | "inactive";
}

function useCountdown(
  targetDate: string | null | undefined,
  isActive: boolean,
  lastStatus?: string | null,
  lastResult?: Record<string, any> | null,
): CountdownResult | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  if (!isActive) return null;

  // If actively running, show execution phase
  if (lastStatus === "running") {
    const result = lastResult || {};

    // ═══ Fix: if autonomous_status already completed, show "Finalizing…" briefly then done ═══
    if (result.autonomous_status === "completed") {
      return { label: "Finalizing…", phase: "done" };
    }
    if (result.autonomous_status === "failed") {
      return { label: "Failed", phase: "failed" };
    }

    const step = typeof result.steps_completed === "number" ? result.steps_completed : null;
    const total = typeof result.total_steps === "number" ? result.total_steps : null;
    const pct = typeof result.progress_pct === "number" ? result.progress_pct : null;

    if (step !== null && total !== null && total > 0) {
      return { label: `Step ${Math.min(step, total)}/${total}`, phase: "executing" };
    }
    if (pct !== null && pct > 0) {
      return { label: `${pct}%`, phase: "executing" };
    }
    return { label: "Executing…", phase: "executing" };
  }

  if (!targetDate) return null;
  const targetMs = safeDate(targetDate)?.getTime();
  if (targetMs === undefined) return null;
  const diff = targetMs - now;

  if (diff <= 0) {
    // Time is up but not running yet — waiting for scheduler
    return { label: "Awaiting dispatch…", phase: "awaiting" };
  }

  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const timeLabel = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  return { label: timeLabel, phase: "countdown" };
}

export function TaskDetailPanel({
  task, onToggle, onTrigger, onDelete, onUpdate, isTriggerPending, triggeringId, onBack,
}: TaskDetailPanelProps) {
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const { logs, total, totalPages, isLoading: logsLoading } = useHeartbeatLogs(task.id, page);

  // Extract autonomous_task_id for live execution trace — allow trace even after completion
  // to close race windows where heartbeat status lags behind autonomous_tasks
  const lastResult = task.last_result as Record<string, any> | null;
  const autonomousTaskId = typeof lastResult?.autonomous_task_id === "string"
    ? lastResult.autonomous_task_id
    : null;
  const trace = useHeartbeatExecutionTrace(autonomousTaskId, task.id);

  const taskConfig = task.task_config as Record<string, any> | null;
  const prompt = taskConfig?.prompt || task.display_name;
  const isOneOff = taskConfig?.schedule_type === "one_off" || !task.cron_expression;
  // Prefer server-stamped local mirror for timezone accuracy (incl. half-hour zones).
  const serverLocalStamp = (taskConfig?.next_run_at_local as string | undefined) || null;
  const tzLabel = (taskConfig?.display_timezone_label as string | undefined) || null;
  const schedule = isOneOff && task.next_run_at
    ? `One-time: ${serverLocalStamp || safeLocaleString(task.next_run_at)}${tzLabel ? ` · ${tzLabel}` : ''}`
    : `${cronToHuman(task.cron_expression)}${tzLabel ? ` · ${tzLabel}` : ''}${serverLocalStamp ? ` (next: ${serverLocalStamp})` : ''}`;

  const isTriggering = isTriggerPending && triggeringId === task.id;
  const latestLog = useMemo(() => (page === 0 ? logs[0] ?? null : null), [logs, page]);
  const lastStatus = task.last_status;
  const isSuccess = lastStatus === "success";

  const handleStartEdit = () => { setEditPrompt(prompt); setEditing(true); };
  const handleSaveEdit = () => {
    if (editPrompt.trim() && editPrompt !== prompt) {
      onUpdate({ id: task.id, display_name: editPrompt.trim(), task_config: { ...taskConfig, prompt: editPrompt.trim() } });
    }
    setEditing(false);
  };

  // Timezone from centralized hook — no longer using raw Intl API
  // Note: useTimezone needs userId, but TaskDetailPanel doesn't have it directly.
  // We read it from the task's user_id field.
  const tzDetected = useMemo(() => {
    const rawOffset = new Date().getTimezoneOffset();
    const intlZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Quick offset validation
    const totalMin = -rawOffset;
    const sign = totalMin >= 0 ? "+" : "-";
    const absMin = Math.abs(totalMin);
    const h = Math.floor(absMin / 60);
    const m = absMin % 60;
    const offsetLabel = m > 0 ? `UTC${sign}${h}:${String(m).padStart(2, "0")}` : `UTC${sign}${h}`;

    // Cross-validate: if offset is -390 (UTC+6:30) but Intl says Bangkok, correct it
    const OFFSET_CORRECTIONS: Record<number, string> = {
      [-390]: "Asia/Yangon", [-330]: "Asia/Kolkata", [-345]: "Asia/Kathmandu",
      [-210]: "Asia/Tehran", [-270]: "Asia/Kabul", [-570]: "Australia/Darwin",
    };
    const corrected = OFFSET_CORRECTIONS[rawOffset];
    const EXPECTED: Record<string, number> = { "Asia/Bangkok": -420, "Asia/Yangon": -390, "Asia/Kolkata": -330 };
    const expected = EXPECTED[intlZone];
    const needsCorrection = expected !== undefined && expected !== rawOffset && !!corrected;
    const timezone = needsCorrection ? corrected : intlZone;

    return { timezone, offsetLabel };
  }, []);
  const tzName = tzDetected.timezone;
  const tzOffset = tzDetected.offsetLabel;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-white/[0.06] bg-white/[0.015]">
        <div className="flex items-center gap-2 mb-2">
          {onBack && (
            <button onClick={onBack} className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-white/[0.08] border border-white/[0.06] transition-colors md:hidden">
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-foreground truncate">{task.display_name}</h2>
            {isSuccess && (
              <div className="flex items-center gap-1 mt-0.5">
                <Check className="h-3 w-3 text-emerald-400" />
                <span className="text-[10px] text-emerald-400 font-medium">Completed successfully</span>
              </div>
            )}
          </div>
        </div>

        {/* Schedule + Timezone + Delivery info */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.07]">
            <Repeat className="h-3 w-3 text-primary/70" />
            <span className="text-[10px] text-muted-foreground font-medium">{schedule}</span>
          </div>

          {/* Timezone indicator — shows device timezone with UTC offset */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.03] border border-white/[0.06]" title={`Device timezone: ${tzName}`}>
            <Globe className="h-2.5 w-2.5 text-muted-foreground/50" />
            <span className="text-[9px] text-muted-foreground/60">{tzName}</span>
            <span className="text-[8px] text-primary/50 font-medium">{tzOffset}</span>
          </div>

          {/* Delivery target badge */}
          {taskConfig?.delivery_target === "telegram" ? (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#229ED9]/10 border border-[#229ED9]/20">
              <Send className="h-2.5 w-2.5 text-[#55C7FF]" />
              <span className="text-[10px] font-medium text-[#229ED9]">
                {taskConfig.delivery_channel_name ? `@${taskConfig.delivery_channel_name}` : "Default Channel"}
              </span>
            </div>
          ) : taskConfig?.delivery_target === "chat" ? (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
              <Cpu className="h-2.5 w-2.5 text-primary/70" />
              <span className="text-[10px] font-medium text-primary">Chat Only</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.07]">
              {task.task_type === "briefing" ? <Sun className="h-2.5 w-2.5 text-amber-300" /> :
               task.task_type === "memory_review" ? <Brain className="h-2.5 w-2.5 text-purple-300" /> :
               task.task_type === "check_in" ? <Heart className="h-2.5 w-2.5 text-emerald-300" /> :
               <Cpu className="h-2.5 w-2.5 text-muted-foreground/60" />}
              <span className="text-[10px] font-medium text-muted-foreground">
                {task.task_type === "briefing" ? "Briefing" :
                 task.task_type === "memory_review" ? "Memory Review" :
                 task.task_type === "check_in" ? "Check-In" :
                 "System Task"}
              </span>
            </div>
          )}

          {/* Mode (intent override) chip — click to cycle */}
          {(() => {
            const currentMode: string = (taskConfig?.mode as string) ||
              (taskConfig?.intent_override === "translate" ? "verbatim" :
               (taskConfig?.intent_override === "find_and_report" || taskConfig?.intent_override === "research") ? "research" :
               taskConfig?.intent_override === "reminder" ? "reminder" : "auto");
            const cycle: Record<string, string> = { auto: "verbatim", verbatim: "research", research: "reminder", reminder: "auto" };
            const intentMap: Record<string, string | null> = { auto: null, verbatim: "translate", research: "find_and_report", reminder: "reminder" };
            const labels: Record<string, string> = { auto: "Auto", verbatim: "Translate/Forward", research: "Research", reminder: "Reminder" };
            const icons: Record<string, typeof Wand2> = { auto: Wand2, verbatim: Languages, research: Search, reminder: Bell };
            const next = cycle[currentMode] || "auto";
            const ModeIcon = icons[currentMode] || Wand2;
            const handleClick = () => {
              const nextIntent = intentMap[next];
              const nextConfig: Record<string, any> = { ...(taskConfig || {}), mode: next };
              if (nextIntent) nextConfig.intent_override = nextIntent;
              else delete nextConfig.intent_override;
              onUpdate({ id: task.id, task_config: nextConfig });
            };
            return (
              <button
                onClick={handleClick}
                title={`Mode: ${labels[currentMode]} — click to switch to ${labels[next]}`}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/15 transition-colors"
              >
                <ModeIcon className="h-2.5 w-2.5 text-violet-300" />
                <span className="text-[10px] font-medium text-violet-300">{labels[currentMode]}</span>
              </button>
            );
          })()}

          <div className="flex-1" />
          <button onClick={handleStartEdit} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-primary/10 text-primary/60 hover:text-primary border border-white/[0.06] transition-colors" title="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <Switch checked={task.is_active} onCheckedChange={onToggle} className="scale-[0.8]" />
          <button
            onClick={onTrigger}
            disabled={isTriggering}
            className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-emerald-500/10 text-emerald-400/60 hover:text-emerald-400 border border-white/[0.06] transition-colors disabled:opacity-40"
            title="Test Run"
          >
            {isTriggering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button onClick={onDelete} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-red-500/10 text-red-400/60 hover:text-red-400 border border-white/[0.06] transition-colors" title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Prompt */}
      <div className="shrink-0 px-4 py-3 border-b border-white/[0.04]">
        {editing ? (
          <div className="flex items-start gap-1.5">
            <textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              rows={3}
              className="flex-1 rounded-[18px] border border-primary/30 bg-black/30 px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 resize-none"
              autoFocus
            />
            <div className="flex flex-col gap-1">
              <button onClick={handleSaveEdit} className="h-6 w-6 rounded-md flex items-center justify-center text-emerald-400 hover:bg-emerald-500/10">
                <Check className="h-3 w-3" />
              </button>
              <button onClick={() => setEditing(false)} className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted/20">
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground leading-relaxed">{prompt}</p>
        )}
      </div>

      {/* Results + History */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-3">
        {/* Pipeline Status Tracker */}
        <PipelineTracker task={task} latestLog={latestLog} isTriggering={isTriggering} trace={trace} />

        {/* ═══ Automation Quality Telemetry ═══ */}
        {(() => {
          const lr = (lastResult || latestLog?.result || {}) as Record<string, any>;
          const qScore: number | null = typeof lr.quality_score === "number" ? lr.quality_score : null;
          const intentClass: string | null = typeof lr.intent_class === "string" ? lr.intent_class : null;
          const heldBack = lr.quality_holdback === true;
          const retries = typeof lr.retry_count === "number" ? lr.retry_count : 0;
          const flags: string[] = Array.isArray(lr.gate_flags) ? lr.gate_flags : [];
          const reasons: string[] = Array.isArray(lr.gate_reasons) ? lr.gate_reasons : [];
          if (qScore === null && !intentClass && !heldBack && retries === 0 && flags.length === 0) return null;
          const scoreColor = qScore === null ? "text-muted-foreground"
            : qScore >= 80 ? "text-emerald-400"
            : qScore >= 50 ? "text-amber-400"
            : "text-red-400";
          return (
            <div className="rounded-[22px] border border-white/[0.06] bg-white/[0.035] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-foreground/80">Quality</p>
                {heldBack && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium border border-red-500/30 bg-red-500/10 text-red-400">
                    Held back
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                {qScore !== null && (
                  <div>
                    <span className="text-muted-foreground/60">Score: </span>
                    <span className={`font-semibold tabular-nums ${scoreColor}`}>{qScore}/100</span>
                  </div>
                )}
                {intentClass && (
                  <div>
                    <span className="text-muted-foreground/60">Intent: </span>
                    <span className="text-foreground/80 font-medium">{intentClass}</span>
                  </div>
                )}
                {retries > 0 && (
                  <div>
                    <span className="text-muted-foreground/60">Retries: </span>
                    <span className="text-amber-400 font-medium">{retries}</span>
                  </div>
                )}
              </div>
              {flags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {flags.map((f) => (
                    <span key={f} className="text-[9px] px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 font-medium">
                      {f}
                    </span>
                  ))}
                </div>
              )}
              {reasons.length > 0 && (
                <div className="text-[10px] text-muted-foreground/70 space-y-0.5 pt-1 border-t border-border/15">
                  {reasons.slice(0, 3).map((r, i) => (
                    <p key={i}>• {r}</p>
                  ))}
                </div>
              )}
              <button
                onClick={onTrigger}
                disabled={isTriggering}
                className="w-full text-[10px] py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {isTriggering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                Run again now
              </button>
            </div>
          );
        })()}

        <div>
          <p className="text-[11px] font-semibold text-foreground/80 mb-2">Task Result</p>
          {logsLoading && page === 0 ? (
            <div className="rounded-[22px] border border-white/[0.06] bg-white/[0.035] p-4 flex items-center gap-2 text-muted-foreground/60">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Loading result...</span>
            </div>
          ) : (
            <LatestResultPanel
              log={latestLog}
              isTriggering={isTriggering}
              fallbackResult={!latestLog && lastResult ? lastResult : null}
            />
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-foreground/80">
              Execution History
              {total > 0 && <span className="text-muted-foreground font-normal ml-1">({total})</span>}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(0)} disabled={page === 0} className="text-[10px] px-1.5 py-0.5 rounded text-primary hover:bg-primary/10 disabled:opacity-30 disabled:cursor-default font-medium transition-colors">Latest</button>
                <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="h-5 w-5 rounded flex items-center justify-center hover:bg-muted/30 disabled:opacity-30 transition-colors">
                  <ChevronLeft className="h-3 w-3 text-muted-foreground" />
                </button>
                <span className="text-[10px] text-muted-foreground tabular-nums">{page + 1}/{totalPages}</span>
                <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="h-5 w-5 rounded flex items-center justify-center hover:bg-muted/30 disabled:opacity-30 transition-colors">
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            )}
          </div>

          {logsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="h-10 w-10 rounded-[18px] bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-2">
                <Clock className="h-5 w-5 text-muted-foreground/40" />
              </div>
              <p className="text-xs font-medium text-muted-foreground/60">No records yet</p>
              <p className="text-[10px] text-muted-foreground/40 mt-0.5">Run the task to see execution history</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log, index) => (
                <LogEntry key={log.id} log={log} defaultExpanded={page === 0 && index === 0} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LogEntry({ log, defaultExpanded }: { log: LogRecord; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const status = normalizeStatus(log);
  const statusMeta = getStatusMeta(status);
  const result = log.result || {};
  const title = getLogTitle(log, status);
  const duration = typeof result.duration_ms === "number" ? `${(result.duration_ms / 1000).toFixed(2)}s` : null;
  const summary = extractResultContent(result, status);
  const failureDetail = status === "failed" ? extractResultContent(result, "failed") : null;
  const hasLongContent = typeof summary === "string" && summary.length > 140;

  return (
    <div className="rounded-[22px] border border-white/[0.06] bg-white/[0.035] backdrop-blur-sm overflow-hidden hover:border-white/[0.10] transition-all">
      <button
        onClick={() => hasLongContent && setExpanded(!expanded)}
        className="w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 hover:bg-muted/5 transition-colors"
      >
        <div className={`shrink-0 h-2 w-2 rounded-full mt-1.5 ${statusMeta.dot} ${status === "running" ? "animate-pulse" : ""}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-foreground leading-snug line-clamp-2">{title}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-muted-foreground/60">{safeFormat(log.created_at, "MMM d, h:mm a")}</span>
            <span className="text-[10px] text-muted-foreground/40">·</span>
            <span className="text-[10px] text-muted-foreground/50">{safeDistanceToNow(log.created_at)}</span>
            {duration && (
              <>
                <span className="text-[10px] text-muted-foreground/40">·</span>
                <span className="text-[10px] text-primary/70 font-medium">Ran for {duration}</span>
              </>
            )}
          </div>
        </div>
        {hasLongContent && (
          <div className="shrink-0 mt-1">
            {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground/40" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/40" />}
          </div>
        )}
      </button>

      {expanded && summary && (
        <div className="px-3.5 pb-3 border-t border-border/10">
          <div className="mt-2.5 max-h-[30vh] overflow-y-auto pr-1">
            {status === "failed" && failureDetail && (
              <div className="mb-2 rounded-[16px] border border-destructive/20 bg-destructive/5 px-2 py-1.5">
                <p className="text-[10px] font-semibold text-destructive">Failure reason</p>
                <p className="text-[10px] text-destructive/80 whitespace-pre-wrap">{failureDetail}</p>
              </div>
            )}
            <ResultMarkdown content={summary} />
          </div>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium border ${statusMeta.badge}`}>
              {statusMeta.label}
            </span>
            {result.api_source && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full text-muted-foreground/60 bg-muted/10 border border-border/10">
                {result.api_source === "personal_key" ? "Personal Key" : "Gateway"}
              </span>
            )}
            {result.model_used && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full text-muted-foreground/60 bg-muted/10 border border-border/10">
                {result.model_used}
              </span>
            )}
            {typeof result.steps_completed === "number" && typeof result.total_steps === "number" && result.total_steps > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full text-muted-foreground/60 bg-muted/10 border border-border/10">
                {Math.min(result.steps_completed, result.total_steps)}/{result.total_steps} steps
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { useCountdown };
