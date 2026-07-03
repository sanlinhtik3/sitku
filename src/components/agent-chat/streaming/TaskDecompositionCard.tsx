import { motion, AnimatePresence } from "motion/react";
import { Sparkles, CheckCircle2, Loader2, Circle, Search, PenLine, Zap, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TaskPlanStep {
  id?: string;
  tool: string;
  label: string;
  emoji: string;
  status?: "pending" | "running" | "done" | "error";
  context?: string;
}

interface TaskDecompositionCardProps {
  steps: TaskPlanStep[];
}

/** Derive a dynamic phase label from step statuses */
function getPhaseLabel(steps: TaskPlanStep[]): { label: string; icon: React.ReactNode } {
  const statuses = steps.map(s => s.status || "pending");
  const allDone = statuses.every(s => s === "done" || s === "error");
  const allPending = statuses.every(s => s === "pending");
  const hasError = statuses.some(s => s === "error");
  const runningStep = steps.find(s => s.status === "running");

  if (allDone && hasError) return { label: "Completed with errors", icon: <XCircle className="h-3 w-3 text-destructive" /> };
  if (allDone) return { label: "Complete", icon: <CheckCircle2 className="h-3 w-3 text-emerald-400" /> };
  if (allPending) return { label: "Planning...", icon: <Sparkles className="h-3 w-3 text-primary" /> };

  // Determine phase from the running tool
  if (runningStep) {
    const tool = runningStep.tool;
    if (tool.includes("search") || tool.includes("browser") || tool.includes("scrape")) {
      return { label: "Researching", icon: <Search className="h-3 w-3 text-primary" /> };
    }
    if (tool.includes("generat") || tool.includes("content") || tool.includes("write")) {
      return { label: "Writing", icon: <PenLine className="h-3 w-3 text-primary" /> };
    }
  }

  return { label: "Working", icon: <Zap className="h-3 w-3 text-primary" /> };
}

export function TaskDecompositionCard({ steps }: TaskDecompositionCardProps) {
  if (steps.length === 0) return null;

  const doneCount = steps.filter(s => s.status === "done" || s.status === "error").length;
  const phase = getPhaseLabel(steps);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        "rounded-2xl overflow-hidden",
        "bg-card/25 backdrop-blur-2xl",
        "border border-white/[0.06]",
        "shadow-[0_4px_32px_rgba(0,0,0,0.12)]"
      )}
    >
      {/* Header — dynamic phase */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-white/[0.04]">
        <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
          {phase.icon}
        </div>
        <span className="text-xs font-semibold text-foreground/85 tracking-wide">{phase.label}</span>
        <span className="ml-auto text-[10px] text-muted-foreground/40 font-mono">
          {doneCount}/{steps.length}
        </span>
      </div>

      {/* Plan steps */}
      <div className="px-4 py-3 space-y-1">
        <AnimatePresence mode="popLayout">
          {steps.map((step, idx) => {
            const status = step.status || "pending";
            return (
              <motion.div
                key={step.id || `${step.tool}-${idx}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.08 }}
                className="flex items-start gap-3 py-1.5 group"
              >
                {/* Status icon with connector */}
                <div className="relative flex flex-col items-center mt-0.5">
                  <div className="shrink-0">
                    {status === "done" ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : status === "error" ? (
                      <XCircle className="h-5 w-5 text-destructive" />
                    ) : status === "running" ? (
                      <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground/30" />
                    )}
                  </div>
                  {idx < steps.length - 1 && (
                    <div className={cn(
                      "w-px h-3 mt-0.5",
                      status === "done"
                        ? "bg-emerald-400/40"
                        : status === "error"
                          ? "bg-destructive/40"
                          : status === "running"
                            ? "bg-gradient-to-b from-primary/30 to-transparent"
                            : "bg-muted-foreground/10"
                    )} />
                  )}
                </div>

                {/* Emoji */}
                <span className="text-sm shrink-0 mt-px">{step.emoji}</span>

                {/* Label + context */}
                <div className="flex flex-col min-w-0 flex-1">
                  <span className={cn(
                    "text-xs truncate font-medium",
                    status === "done"
                      ? "text-foreground/50 line-through decoration-emerald-400/30"
                      : status === "error"
                        ? "text-destructive/80 line-through decoration-destructive/30"
                        : status === "running"
                          ? "text-foreground/90"
                          : "text-foreground/40"
                  )}>
                    {step.label}
                  </span>
                  {/* Context subtitle — shows search query, URL, etc. */}
                  {status === "running" && step.context && (
                    <motion.span
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[10px] text-muted-foreground/50 truncate italic mt-0.5"
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
    </motion.div>
  );
}
