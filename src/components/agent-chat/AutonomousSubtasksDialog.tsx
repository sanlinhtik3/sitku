// ═══ Autonomous Subtasks Dialog — Premium Intelligence Panel ═══
import { useState, useRef, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { Check, Circle, Loader2, AlertCircle, ChevronDown, Search, FileEdit, Globe, Brain, Clock, GitBranch } from "lucide-react";
import type { AutonomousTask, AutonomousTaskStep } from "@/hooks/agent-chat/useAutonomousTask";
import { AGENT_ROLE_CONFIG } from "@/hooks/agent-chat/types";
import { format } from "date-fns";

type ToolMeta = { label: string; icon: typeof Search };

function detectTool(text: string): ToolMeta | null {
  const t = text.toLowerCase();
  if (t.includes("search") || t.includes("ရှာ") || t.includes("research") || t.includes("find")) return { label: "Search", icon: Search };
  if (t.includes("brows") || t.includes("web") || t.includes("url") || t.includes("fetch")) return { label: "Browser", icon: Globe };
  if (t.includes("writ") || t.includes("edit") || t.includes("save") || t.includes("creat") || t.includes("generat")) return { label: "Editor", icon: FileEdit };
  if (t.includes("analy") || t.includes("think") || t.includes("plan") || t.includes("reason")) return { label: "Reasoning", icon: Brain };
  return null;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

interface AutonomousSubtasksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: AutonomousTask;
  steps?: AutonomousTaskStep[];
}

export function AutonomousSubtasksDialog({ open, onOpenChange, task, steps: liveProp }: AutonomousSubtasksDialogProps) {
  // Prefer live subscription data; fall back to task.plan snapshot
  const steps = (liveProp && liveProp.length > 0 ? liveProp : (task.plan || [])) as AutonomousTaskStep[];
  const runningStep = steps.find(s => s.status === "running");
  const doneCount = steps.filter(s => s.status === "done").length;
  const errorCount = steps.filter(s => s.status === "error").length;
  const isComplete = task.status === "completed";
  const isFailed = task.status === "failed";
  const isActive = !isComplete && !isFailed;

  const meta = task.metadata as Record<string, unknown> | null;
  const agentRoles = (task.agent_roles_used || meta?.agentRolesUsed as string[] || []) as string[];

  const totalDuration = useMemo(() => {
    if (!task.completed_at) return null;
    return formatElapsed(new Date(task.completed_at).getTime() - new Date(task.created_at).getTime());
  }, [task.completed_at, task.created_at]);

  const progressPct = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] p-0 gap-0 bg-background/95 backdrop-blur-2xl border-white/[0.08] flex flex-col !rounded-2xl">
        {/* Header with stats */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              Subtasks
              {task.execution_mode === 'dag' && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold flex items-center gap-0.5">
                  <GitBranch className="h-2 w-2" />
                  DAG
                </span>
              )}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {totalDuration && (
                <span className="text-[10px] font-mono text-muted-foreground/60 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" /> {totalDuration}
                </span>
              )}
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-semibold border",
                isComplete ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
                isFailed ? "text-destructive bg-destructive/10 border-destructive/20" :
                "text-primary bg-primary/10 border-primary/20"
              )}>
                {isComplete ? "Done" : isFailed ? "Failed" : `${doneCount}/${steps.length}`}
              </span>
            </div>
          </div>

          {/* Prompt preview */}
          <p className="text-[11px] text-muted-foreground/50 mt-2 line-clamp-2 leading-relaxed">
            {task.original_prompt.slice(0, 150)}{task.original_prompt.length > 150 ? "…" : ""}
          </p>

          {/* Agent Journey strip */}
          {agentRoles.length >= 2 && (
            <div className="mt-2 flex items-center gap-1 flex-wrap">
              <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">Journey:</span>
              {agentRoles.map((role, idx) => {
                const config = AGENT_ROLE_CONFIG[role] || AGENT_ROLE_CONFIG.general;
                return (
                  <span key={`${role}-${idx}`} className="flex items-center gap-0.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs cursor-default">{config.emoji}</span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        <p className="font-medium">{config.label}</p>
                        <p className="text-muted-foreground">{config.description}</p>
                      </TooltipContent>
                    </Tooltip>
                    {idx < agentRoles.length - 1 && (
                      <span className="text-muted-foreground/20 text-[10px]">→</span>
                    )}
                  </span>
                );
              })}
            </div>
          )}

          {/* Progress bar */}
          {steps.length > 0 && (
            <div className="mt-3 h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${isComplete ? 100 : progressPct}%` }}
                transition={{ duration: 0.5, ease: "circOut" }}
                className={cn(
                  "h-full rounded-full",
                  isFailed ? "bg-destructive" : isComplete ? "bg-emerald-500" : "bg-primary"
                )}
              />
            </div>
          )}
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="divide-y divide-white/[0.04]">
            {steps.map((step, idx) => (
              <SubtaskRow key={step.id} step={step} index={idx} totalSteps={steps.length} />
            ))}

            {steps.length === 0 && (
              <div className="px-5 py-10 text-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground/50">Preparing subtasks...</p>
              </div>
            )}
          </div>

          {/* Status footer */}
          {isComplete && (
            <div className="px-5 py-3 border-t border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <Check className="h-3 w-3 text-emerald-500" />
                </div>
                <div>
                  <span className="text-xs font-medium text-foreground/90">All {steps.length} tasks completed</span>
                  {totalDuration && <span className="text-[10px] text-muted-foreground/50 ml-2">in {totalDuration}</span>}
                </div>
              </div>
            </div>
          )}
          {isFailed && (
            <div className="px-5 py-3 border-t border-white/[0.06]">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs font-medium text-destructive">Task failed</span>
                  {task.error && <p className="text-[11px] text-destructive/60 mt-0.5">{task.error}</p>}
                  {errorCount > 0 && <p className="text-[10px] text-muted-foreground/40 mt-0.5">{errorCount} step(s) errored</p>}
                </div>
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Sticky Bottom — Active step indicator */}
        {runningStep && (
          <div className="border-t border-white/[0.06] bg-gradient-to-r from-primary/[0.04] to-transparent px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
              {runningStep.agent_role && AGENT_ROLE_CONFIG[runningStep.agent_role] && (
                <span className="text-xs flex-shrink-0">{AGENT_ROLE_CONFIG[runningStep.agent_role].emoji}</span>
              )}
              <span className="text-xs font-medium text-foreground/90 truncate flex-1">
                {runningStep.title}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground/60 flex-shrink-0 tabular-nums">
                {doneCount + 1}/{steps.length}
              </span>
            </div>
            {/* Show currentActivity from task metadata */}
            {(() => {
              const currentActivity = meta?.currentActivity as string | undefined;
              const displayText = currentActivity || runningStep.description;
              return displayText ? (
                <p className="text-[11px] text-primary/70 mt-1.5 pl-[18px] line-clamp-2 font-medium">
                  {displayText}
                </p>
              ) : null;
            })()}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SubtaskRow({ step, index, totalSteps }: { step: AutonomousTaskStep; index: number; totalSteps: number }) {
  const [inspecting, setInspecting] = useState(step.status === "running");
  const [showFullResult, setShowFullResult] = useState(false);
  const hasDetail = !!(step.result || step.description);
  const agentConfig = step.agent_role ? (AGENT_ROLE_CONFIG[step.agent_role] || null) : null;
  const tool = agentConfig ? null : detectTool((step.title || "") + " " + (step.description || ""));
  const ToolIcon = tool?.icon ?? null;
  const timerRef = useRef<HTMLSpanElement>(null);

  // Live elapsed timer for running steps
  useEffect(() => {
    if (step.status !== "running" || !step.started_at) return;
    const start = new Date(step.started_at).getTime();
    const tick = () => {
      if (!timerRef.current) return;
      timerRef.current.textContent = formatElapsed(Date.now() - start);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [step.status, step.started_at]);

  // Duration for completed steps
  const completedDuration = step.started_at && step.completed_at
    ? formatElapsed(new Date(step.completed_at).getTime() - new Date(step.started_at).getTime())
    : null;

  const timestamp = step.started_at
    ? format(new Date(step.started_at), "HH:mm")
    : step.completed_at
      ? format(new Date(step.completed_at), "HH:mm")
      : null;

  const statusIcon = {
    done: <Check className="h-3.5 w-3.5 text-emerald-500" />,
    running: <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />,
    error: <AlertCircle className="h-3.5 w-3.5 text-destructive" />,
    pending: <Circle className="h-3 w-3 text-muted-foreground/20" />,
    skipped: <Circle className="h-3 w-3 text-muted-foreground/10" />,
  };

  // Build the result string for display
  const resultStr = typeof step.result === "string"
    ? step.result
    : step.result
      ? JSON.stringify(step.result, null, 2)
      : step.description || "";
  const PREVIEW_LEN = 500;
  const isLong = resultStr.length > PREVIEW_LEN;
  const displayResult = isLong && !showFullResult ? resultStr.slice(0, PREVIEW_LEN) + "…" : resultStr;

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.04 }}
      className="overflow-hidden"
    >
      <div
        className={cn(
          "px-5 py-3 flex items-center gap-3 transition-colors",
          step.status === "running" && "bg-primary/[0.04]",
          hasDetail && "cursor-pointer hover:bg-white/[0.03]"
        )}
        onClick={() => hasDetail && setInspecting(v => !v)}
      >
        <div className="flex-shrink-0">{statusIcon[step.status] ?? statusIcon.pending}</div>

        {/* Agent role icon with tooltip, or fallback tool icon */}
        {agentConfig ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn(
                "text-xs flex-shrink-0 cursor-default",
                step.status === "done" ? "opacity-40" :
                step.status === "running" ? "opacity-100" : "opacity-20"
              )}>
                {agentConfig.emoji}
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">
              <p className="font-medium">{agentConfig.label}</p>
              <p className="text-muted-foreground">{agentConfig.description}</p>
            </TooltipContent>
          </Tooltip>
        ) : ToolIcon ? (
          <ToolIcon className={cn(
            "h-3.5 w-3.5 flex-shrink-0",
            step.status === "done" ? "text-muted-foreground/40" :
            step.status === "running" ? "text-primary/70" :
            "text-muted-foreground/20"
          )} />
        ) : null}

        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-xs",
            step.status === "running" ? "text-foreground font-medium" :
            step.status === "done" ? "text-muted-foreground" :
            step.status === "error" ? "text-destructive" :
            "text-muted-foreground/50"
          )}>
            {step.title}
          </p>
          {/* Dependency info */}
          {step.depends_on && step.depends_on.length > 0 && step.status !== "done" && (
            <span className="text-[9px] text-muted-foreground/30 flex items-center gap-0.5 mt-0.5">
              <GitBranch className="h-2 w-2" />
              {step.status === "pending"
                ? `Waiting for ${step.depends_on.length} dep${step.depends_on.length > 1 ? 's' : ''}`
                : step.status === "running"
                  ? `Resolved ${step.depends_on.length} dep${step.depends_on.length > 1 ? 's' : ''}`
                  : null
              }
            </span>
          )}
        </div>

        {/* Time info */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {step.status === "running" && (
            <span ref={timerRef} className="text-[10px] font-mono text-primary/60 tabular-nums" />
          )}
          {step.status === "done" && completedDuration && (
            <span className="text-[10px] font-mono text-muted-foreground/30">{completedDuration}</span>
          )}
          {timestamp && (
            <span className="text-[10px] font-mono text-muted-foreground/30">{timestamp}</span>
          )}
        </div>

        {hasDetail && (
          <ChevronDown className={cn(
            "h-3 w-3 text-muted-foreground/30 flex-shrink-0 transition-transform",
            inspecting && "rotate-180"
          )} />
        )}
      </div>

      {/* Live Inspect panel */}
      <AnimatePresence>
        {inspecting && hasDetail && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-3 pl-12">
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                <p className="text-[11px] text-muted-foreground/70 whitespace-pre-wrap leading-relaxed">
                  {step.status === "running" && step.description
                    ? step.description
                    : displayResult}
                </p>
                {step.status === "running" && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <div className="h-1 w-1 rounded-full bg-primary animate-pulse" />
                    <span className="text-[10px] text-muted-foreground/40">Live</span>
                  </div>
                )}
                {/* Show more/less for long results */}
                {step.status !== "running" && isLong && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowFullResult(v => !v); }}
                    className="text-[10px] text-primary/60 mt-1.5 hover:text-primary/80 transition-colors block"
                  >
                    {showFullResult ? "Show less" : `Show ${resultStr.length - PREVIEW_LEN} more chars`}
                  </button>
                )}
                {/* Dependency detail */}
                {step.depends_on && step.depends_on.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/[0.06]">
                    <span className="text-[9px] text-muted-foreground/40 flex items-center gap-1">
                      <GitBranch className="h-2.5 w-2.5" />
                      Depends on {step.depends_on.length} step{step.depends_on.length > 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
