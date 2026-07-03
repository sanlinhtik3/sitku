// ═══ Compact Autonomous Status — Enhanced Progress Bar (P3) ═══

import { memo, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, ChevronRight, FileText, Circle, Loader2 } from "lucide-react";
import type { AutonomousTask } from "@/hooks/agent-chat/useAutonomousTask";

interface Props {
  task: AutonomousTask | null | undefined;
  onClick: () => void;
}

const STATUS_CONFIG = {
  planning: "Planning strategy...",
  compiling: "Compiling results...",
  working: "Working...",
} as const;

type PlanStep = { id: string; title: string; status: string };

export const InlineAutonomousStatus = memo(function InlineAutonomousStatus({ task, onClick }: Props) {
  if (!task) return null;

  const steps = useMemo(() => {
    try {
      return Array.isArray(task.plan) ? task.plan as PlanStep[] : [];
    } catch { return []; }
  }, [task.plan]);

  const doneCount = steps.filter(s => s.status === "done").length;
  const total = steps.length;
  const isComplete = task.status === "completed";
  const isFailed = task.status === "failed";
  const isTerminal = isComplete || isFailed;
  const activeStep = steps.find(s => s.status === "running");

  const statusText = useMemo(() => {
    if (isFailed) return "✗ Task Failed";
    if (isComplete) return "✓ Task Log";
    const meta = task.metadata as Record<string, unknown> | null;
    const activity = meta?.currentActivity as string | undefined;
    if (activity) return activity;
    return STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] || "Working...";
  }, [task.status, task.metadata, isComplete, isFailed]);

  // Terminal pill — compact, clickable
  if (isTerminal) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-[85%] sm:max-w-[80%]"
      >
        <button
          onClick={onClick}
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
            "border backdrop-blur-xl",
            isComplete
              ? "bg-emerald-500/[0.08] border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/[0.12] hover:border-emerald-500/30"
              : "bg-destructive/[0.08] border-destructive/20 text-destructive hover:bg-destructive/[0.12] hover:border-destructive/30"
          )}
        >
          {isComplete ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
          <span>{statusText}</span>
          <FileText className="h-3 w-3 opacity-50" />
        </button>
      </motion.div>
    );
  }

  // Active working bar with mini progress
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="w-full max-w-[85%] sm:max-w-[80%]"
    >
      <button
        onClick={onClick}
        className="group w-full text-left px-4 py-3 rounded-xl bg-card/40 backdrop-blur-xl border border-border/15 hover:border-border/30 hover:bg-card/60 transition-all"
      >
        <div className="flex items-center gap-3">
          {/* Pulsing dot */}
          <div className="relative h-2.5 w-2.5 flex-shrink-0">
            <div className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />
            <div className="h-2.5 w-2.5 rounded-full bg-primary" />
          </div>

          {/* Animated text */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.span
                key={statusText}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="text-sm text-foreground block truncate"
              >
                {statusText}
              </motion.span>
            </AnimatePresence>
          </div>

          {/* Counter + chevron */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {total > 0 && (
              <span className="text-xs text-muted-foreground/50 tabular-nums">
                {doneCount}/{total}
              </span>
            )}
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
          </div>
        </div>

        {/* Mini progress bar */}
        {total > 0 && (
          <div className="mt-1.5 h-1 w-full rounded-full bg-border/10 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary/80 to-primary/50 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(doneCount / total) * 100}%` }}
              transition={{ duration: 0.4, ease: "circOut" }}
            />
          </div>
        )}

        {/* Step list — show up to 5 steps */}
        {total > 0 && (
          <div className="mt-1 space-y-0.5">
            {steps.slice(0, 5).map((step, i) => (
              <motion.div
                key={step.id || i}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.15 }}
                className="flex items-center gap-2 py-0.5"
              >
                {step.status === "done" ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-400/70 shrink-0" />
                ) : step.status === "running" ? (
                  <Loader2 className="h-3 w-3 text-primary animate-spin shrink-0" />
                ) : (
                  <Circle className="h-3 w-3 text-muted-foreground/25 shrink-0" />
                )}
                <span className={cn(
                  "text-[11px] truncate",
                  step.status === "done" ? "text-muted-foreground/50 line-through" :
                  step.status === "running" ? "text-foreground font-medium" :
                  "text-muted-foreground/40"
                )}>
                  {step.title}
                </span>
              </motion.div>
            ))}
            {total > 5 && (
              <span className="text-[10px] text-muted-foreground/30 pl-5">
                +{total - 5} more steps
              </span>
            )}
          </div>
        )}
      </button>
    </motion.div>
  );
});
