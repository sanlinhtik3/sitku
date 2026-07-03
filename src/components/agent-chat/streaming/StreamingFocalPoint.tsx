import { useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, Loader2, Circle, XCircle, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOOL_LABELS } from "@/hooks/agent-chat/types";
import type { ToolProgressStep } from "./ExecutionTimeline";
import type { TaskPlanStep } from "./TaskDecompositionCard";
import { LiveActivitySentence } from "./LiveActivitySentence";

interface StreamingFocalPointProps {
  /** Current thinking status text */
  currentStatus: string | null;
  isActive: boolean;
  streamStartTime?: number;
  stepCountLabel?: string;
  latestNarration?: string;
  onClick?: () => void;

  /** Task plan steps from SSE */
  taskPlanSteps: TaskPlanStep[];
  /** Tool progress steps from SSE */
  toolProgressSteps: ToolProgressStep[];

  /** Deep Think reasoning effort (e.g. "low", "medium", "high") */
  reasoningEffort?: string | null;
}

/**
 * Single unified focal point for all streaming feedback.
 * Merges: LiveThinkingIndicator (status + timer) +
 *         TaskDecompositionCard (plan steps) +
 *         ExecutionTimeline (tool progress)
 * into one compact, glassmorphic card.
 */
export function StreamingFocalPoint({
  currentStatus,
  isActive,
  streamStartTime,
  stepCountLabel,
  latestNarration,
  onClick,
  taskPlanSteps,
  toolProgressSteps,
  reasoningEffort,
}: StreamingFocalPointProps) {
  const timerRef = useRef<HTMLSpanElement>(null);

  // Live timer
  useEffect(() => {
    if (!isActive) return;
    const start = streamStartTime || Date.now();
    const tick = () => {
      if (!timerRef.current) return;
      const s = Math.floor((Date.now() - start) / 1000);
      const m = Math.floor(s / 60);
      const sec = s % 60;
      timerRef.current.textContent = m > 0
        ? `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
        : s > 0 ? `${String(sec).padStart(2, "0")}s` : "";
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isActive, streamStartTime]);

  if (!isActive) return null;

  const hasTaskPlan = taskPlanSteps.length > 0;
  const hasToolProgress = toolProgressSteps.length > 0;
  const phase = getPhaseColor(currentStatus);
  const displayText = currentStatus || "Thinking...";
  const fullText = stepCountLabel ? `${stepCountLabel} · ${displayText}` : displayText;

  // Progress stats
  const doneSteps = hasTaskPlan
    ? taskPlanSteps.filter(s => s.status === "done" || s.status === "error").length
    : toolProgressSteps.filter(s => s.status === "done").length;
  const totalSteps = hasTaskPlan ? taskPlanSteps.length : toolProgressSteps.length;
  const progress = totalSteps > 0 ? (doneSteps / totalSteps) * 100 : 0;
  const showProgress = hasTaskPlan || hasToolProgress;

  return (
    <div className="flex flex-col gap-1.5">
      {/* ─── Live activity sentence (above the focal card) ─── */}
      <LiveActivitySentence
        toolProgressSteps={toolProgressSteps}
        taskPlanSteps={taskPlanSteps}
        latestNarration={latestNarration}
        currentStatus={currentStatus}
        isStreaming={isActive}
      />

    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      onClick={onClick}
      onKeyDown={onClick ? (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      } : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? "Open task details" : undefined}
      className={cn(
        "rounded-2xl overflow-hidden",
        "bg-card/20 backdrop-blur-2xl",
        "border border-white/[0.06]",
        "shadow-[0_2px_20px_rgba(0,0,0,0.08)]",
        onClick && "cursor-pointer hover:bg-card/30 transition-colors group focus:outline-none focus:ring-1 focus:ring-primary/40",
      )}
    >
      {/* ─── Status Row: dot + status + progress + timer ─── */}
      <div className="flex items-center gap-2.5 px-3 py-2">
        {/* Phase-aware pulsing dot */}
        <div className="relative flex h-2 w-2 shrink-0">
          <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-50", phase.dot)} />
          <span className={cn("relative inline-flex rounded-full h-2 w-2", phase.dot)} />
        </div>

        {/* Status text */}
        <AnimatePresence mode="wait">
          <motion.span
            key={fullText}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.12 }}
            className="text-[12px] text-muted-foreground font-medium truncate min-w-0 flex-1"
          >
            {fullText}
          </motion.span>
        </AnimatePresence>

        {/* Deep Think badge */}
        {reasoningEffort && reasoningEffort !== "none" && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/15 border border-primary/20 shrink-0"
          >
            <Brain className="h-2.5 w-2.5 text-primary" />
            <span className="text-[9px] font-semibold text-primary uppercase tracking-wider">
              {reasoningEffort === "high" ? "Deep" : reasoningEffort === "medium" ? "Think" : "Quick"}
            </span>
          </motion.span>
        )}

        {/* Inline progress counter */}
        {showProgress && (
          <span className="text-[10px] text-muted-foreground/40 font-mono tabular-nums shrink-0">
            {doneSteps}/{totalSteps}
          </span>
        )}

        {/* Timer */}
        <span
          ref={timerRef}
          className="text-[10px] text-muted-foreground/35 font-mono tabular-nums shrink-0"
        />
      </div>

      {/* ─── Progress bar ─── */}
      {showProgress && (
        <div className="h-px mx-3 bg-white/[0.04] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
            className="h-full bg-primary/40"
          />
        </div>
      )}

      {/* Narration moved to LiveActivitySentence above (no duplicate). */}

      {/* ─── Task Plan Steps (vertical timeline) ─── */}
      {hasTaskPlan && (
        <div className="px-2.5 pb-1.5 pt-0.5 space-y-0.5">
          <AnimatePresence mode="popLayout">
            {taskPlanSteps.map((step, idx) => {
              const status = step.status || "pending";
              return (
                <motion.div
                  key={step.id || `${step.tool}-${idx}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: idx * 0.06 }}
                  className="flex items-center gap-2 py-1"
                >
                  <StepIcon status={status} size="sm" />
                  <span className="text-sm shrink-0">{step.emoji}</span>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className={cn(
                      "text-[11px] truncate font-medium",
                      status === "done" ? "text-foreground/45 line-through decoration-emerald-400/30"
                        : status === "error" ? "text-destructive/70 line-through"
                        : status === "running" ? "text-foreground/85"
                        : "text-foreground/35"
                    )}>
                      {step.label}
                    </span>
                    {status === "running" && step.context && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[9px] text-muted-foreground/40 truncate italic"
                      >
                        {step.context}
                      </motion.span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* ─── Tool Progress Rows (when no task plan) ─── */}
      {hasToolProgress && !hasTaskPlan && (
        <ToolProgressRows steps={toolProgressSteps} />
      )}
    </motion.div>
    </div>
  );
}

/** Compact tool progress rows with grouping */
function ToolProgressRows({ steps }: { steps: ToolProgressStep[] }) {
  const rows = useMemo(() => {
    const doneByTool = new Map<string, { key: string; tool: string; label: string; count: number; step: ToolProgressStep }>();
    const active: { key: string; step: ToolProgressStep }[] = [];

    for (const s of steps) {
      if (s.status === "done") {
        const existing = doneByTool.get(s.tool);
        if (existing) { existing.count++; existing.step = s; }
        else doneByTool.set(s.tool, { key: `d-${s.tool}`, tool: s.tool, label: s.label, count: 1, step: s });
      } else {
        active.push({ key: `a-${s.id}`, step: s });
      }
    }
    return { active, done: Array.from(doneByTool.values()) };
  }, [steps]);

  return (
    <div className="px-2 pb-2 pt-1 space-y-px">
      <AnimatePresence mode="popLayout">
        {rows.active.map(({ key, step }) => (
          <motion.div
            key={key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="flex items-center gap-1.5 py-0.5 px-1.5 rounded-md text-[11px] bg-primary/[0.03]"
          >
            <Loader2 className="h-2.5 w-2.5 text-primary animate-spin shrink-0" />
            <span className="flex-1 truncate text-foreground/70">
              {TOOL_LABELS[step.tool] || step.label}
            </span>
            {step.context && (
              <span className="text-[9px] text-muted-foreground/35 truncate max-w-[120px] italic">{step.context}</span>
            )}
          </motion.div>
        ))}
        {rows.done.map(({ key, tool, label, count }) => (
          <motion.div
            key={key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.1 }}
            className="flex items-center gap-1.5 py-0.5 px-1.5 rounded-md text-[11px]"
          >
            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400/50 shrink-0" />
            <span className="flex-1 truncate text-muted-foreground/40">
              {TOOL_LABELS[tool] || label}
              {count > 1 && <span className="ml-1 text-[9px] opacity-50 font-mono">×{count}</span>}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function StepIcon({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  switch (status) {
    case "done": return <CheckCircle2 className={cn(cls, "text-emerald-400")} />;
    case "error": return <XCircle className={cn(cls, "text-destructive")} />;
    case "running": return <Loader2 className={cn(cls, "text-primary animate-spin")} />;
    default: return <Circle className={cn(cls, "text-muted-foreground/25")} />;
  }
}

interface PhaseColor { dot: string }

function getPhaseColor(status: string | null): PhaseColor {
  if (!status) return { dot: "bg-amber-400" };
  const l = status.toLowerCase();
  if (l.includes("✍️") || l.includes("ရေး") || l.includes("final") || l.includes("assembl") || l.includes("ပြင်ဆင်"))
    return { dot: "bg-emerald-400" };
  if (l.includes("🔍") || l.includes("ရှာ") || l.includes("search") || l.includes("စစ်ဆေး") || l.includes("verif"))
    return { dot: "bg-sky-400" };
  if (l.includes("📡") || l.includes("data") || l.includes("ဆွဲယူ") || l.includes("connect") || l.includes("ချိတ်ဆက်"))
    return { dot: "bg-violet-400" };
  if (l.includes("execut") || l.includes("tool") || l.includes("work"))
    return { dot: "bg-primary" };
  return { dot: "bg-amber-400" };
}
