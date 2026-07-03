import { useMemo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, CheckCircle2, AlertCircle, ChevronDown, Timer, Layers, Zap, Search, ShieldCheck, Globe, FileEdit, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { getToolIcon, getToolConfig } from "./tool-config";
import { Progress } from "@/components/ui/progress";
import type { ThinkingStep } from "@/hooks/agent-chat/types";

// ═══ Phase Detection ═══
function detectPhase(working: ThinkingStep | null, doneCount: number): { label: string; icon: typeof Zap } {
  if (!working) return doneCount > 0 ? { label: "Complete", icon: CheckCircle2 } : { label: "Idle", icon: Zap };
  const tool = working.tool_name || "";
  if (tool.includes("search") || tool.includes("knowledge") || tool.includes("recall") || tool.includes("memory"))
    return { label: "Researching", icon: Search };
  if (tool.includes("reflection") || tool.includes("quality") || tool.includes("debug"))
    return { label: "Verifying", icon: ShieldCheck };
  return { label: "Executing", icon: Zap };
}

// ═══ Props ═══
interface PlanExecutionCardProps {
  thoughts: ThinkingStep[];
  currentStatus: string | null;
  isStreaming: boolean;
  className?: string;
}

export function PlanExecutionCard({ thoughts, currentStatus, isStreaming, className }: PlanExecutionCardProps) {
  const { working, parallel, done, errored, stepTimings, total, progress } = useMemo(() => {
    const doneArr: ThinkingStep[] = [];
    const loading: ThinkingStep[] = [];
    const erroredArr: ThinkingStep[] = [];
    const timings = new Map<string, number>();

    const deduped = new Map<string, ThinkingStep>();
    // ═══ Filter out internal guard retry events from user view ═══
    const HIDDEN_STATUSES = ["anti_ghost_retry", "hallucination_guard", "quality_requeue"];
    const filtered = thoughts.filter(t => {
      const detail = (t.detail || "").toLowerCase();
      const title = (t.title || "").toLowerCase();
      return !HIDDEN_STATUSES.some(s => detail.includes(s) || title.includes(s));
    });
    const sorted = [...filtered].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    for (const t of sorted) {
      const existing = deduped.get(t.id);
      if (!existing || t.status === "done" || t.status === "error") {
        deduped.set(t.id, t);
      }
    }

    for (const t of deduped.values()) {
      if (t.status === "done") {
        doneArr.push(t);
        if (t.startedAt) {
          const elapsed = new Date(t.timestamp).getTime() - new Date(t.startedAt).getTime();
          if (elapsed > 0) timings.set(t.id, elapsed);
        }
      } else if (t.status === "error") erroredArr.push(t);
      else loading.push(t);
    }

    const total = doneArr.length + loading.length + erroredArr.length;
    const progress = total > 0 ? (doneArr.length / total) * 100 : 0;

    return {
      working: loading[0] ?? null,
      parallel: loading.slice(1),
      done: doneArr,
      errored: erroredArr,
      stepTimings: timings,
      total,
      progress,
    };
  }, [thoughts]);

  const startTime = useMemo(() => {
    if (thoughts.length === 0) return null;
    return Math.min(...thoughts.map(t => new Date(t.startedAt || t.timestamp).getTime()));
  }, [thoughts]);

  const timerRef = useRef<HTMLSpanElement>(null);
  const collapsedTimerRef = useRef<HTMLSpanElement>(null);

  const isActive = !!working || parallel.length > 0;

  useEffect(() => {
    if (!startTime) return;
    const tick = () => {
      const s = Math.floor((Date.now() - startTime) / 1000);
      const text = s > 0 ? `${s}s` : "";
      if (timerRef.current) timerRef.current.textContent = text;
      if (collapsedTimerRef.current) collapsedTimerRef.current.textContent = text;
    };
    tick();
    if (!isActive) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime, isActive]);

  const phase = useMemo(() => detectPhase(working, done.length), [working, done.length]);

  const allDone = !working && parallel.length === 0 && errored.length === 0;
  const [doneExpanded, setDoneExpanded] = useState(false);
  const showCollapsed = allDone && isStreaming && done.length > 0;

  const headerStep = working || done[done.length - 1];
  const HeaderIcon = headerStep ? getToolIcon(headerStep.tool_name) : null;
  const headerConfig = headerStep?.tool_name ? getToolConfig(headerStep.tool_name) : null;
  const hasParallel = parallel.length > 0;
  const PhaseIcon = phase.icon;

  // ═══ Collapsed summary ═══
  if (showCollapsed) {
    const lastDone = done[done.length - 1];
    const lastToolConfig = lastDone?.tool_name ? getToolConfig(lastDone.tool_name) : null;
    return (
      <motion.div
        initial={{ opacity: 1, height: "auto" }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          "flex items-center gap-2.5 py-2 px-3 rounded-xl",
          "bg-card/20 backdrop-blur-2xl border border-white/[0.06]",
          className
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
        <span className="text-xs text-muted-foreground/70">
          {done.length} step{done.length > 1 ? "s" : ""} completed
          {lastToolConfig ? ` · ${lastToolConfig.label}` : ""}
        </span>
        <span ref={collapsedTimerRef} className="text-[10px] text-muted-foreground/40 font-mono ml-auto tabular-nums" />
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "rounded-2xl overflow-hidden",
        "bg-card/25 backdrop-blur-2xl",
        "border border-white/[0.06]",
        "shadow-[0_4px_32px_rgba(0,0,0,0.12)]",
        working && "shadow-[0_4px_32px_hsl(var(--primary)/0.06)] border-primary/10",
        className
      )}
    >
      {/* ═══ Header ═══ */}
      {headerStep && (
        <div className="px-4 py-2.5 border-b border-white/[0.04]">
          <div className="flex items-center gap-2.5">
            {working && (
              <span className={cn(
                "text-[9px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 shrink-0",
                "bg-primary/10 text-primary border border-primary/15"
              )}>
                <PhaseIcon className="h-2.5 w-2.5" />
                {phase.label}
              </span>
            )}
            {HeaderIcon && (
              <div className={cn("shrink-0", headerConfig?.color || "text-primary")}>
                <HeaderIcon className="h-3.5 w-3.5" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground/85 truncate">
                {currentStatus || headerStep.title}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isActive && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
                  <Timer className="h-2.5 w-2.5 text-muted-foreground/50" />
                  <span ref={timerRef} className="text-[10px] text-muted-foreground/50 font-mono tabular-nums" />
                </div>
              )}
              {hasParallel && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent-foreground/60 font-medium flex items-center gap-1 border border-accent/10">
                  <Layers className="h-2.5 w-2.5" />
                  {parallel.length + 1}×
                </span>
              )}
              {working && <Loader2 className="h-3 w-3 text-primary animate-spin" />}
            </div>
          </div>
          {total > 1 && (
            <div className="mt-2">
              <div className="h-[2px] bg-white/[0.03] rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-primary/60 via-primary to-primary/60 rounded-full"
                />
              </div>
              <p className="text-[9px] text-muted-foreground/30 mt-1 text-right font-mono tabular-nums">
                {done.length}/{total}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="px-3 py-2.5 space-y-2.5">
        {/* ═══ WORKING ═══ */}
        {working && (
          <Section label="WORKING" color="primary" pulse>
            <StepRow step={working} variant="working" />
            {hasParallel && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {parallel.map((step) => (
                  <ParallelChip key={step.id} step={step} />
                ))}
              </div>
            )}
          </Section>
        )}

        {/* ═══ ERROR ═══ */}
        {errored.length > 0 && (
          <Section label="ERROR" color="destructive">
            {errored.map((step) => (
              <StepRow key={step.id} step={step} variant="error" />
            ))}
          </Section>
        )}

        {/* ═══ DONE ═══ */}
        {done.length > 0 && (
          <Section label="DONE" color="emerald">
            <AnimatePresence initial={false}>
              {done.length <= 3 || doneExpanded ? (
                done.map((step) => (
                  <StepRow key={step.id} step={step} variant="done" elapsedMs={stepTimings.get(step.id)} />
                ))
              ) : (
                <motion.div key="collapsed-done" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <StepRow step={done[done.length - 1]} variant="done" elapsedMs={stepTimings.get(done[done.length - 1].id)} />
                </motion.div>
              )}
            </AnimatePresence>
            {done.length > 3 && (
              <button
                onClick={() => setDoneExpanded(!doneExpanded)}
                className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors mt-1 pl-1"
              >
                <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", doneExpanded && "rotate-180")} />
                {doneExpanded ? "Collapse" : `+${done.length - 1} more`}
              </button>
            )}
          </Section>
        )}
      </div>
    </motion.div>
  );
}

// ═══ Sub-components ═══

function Section({ label, color, pulse, children }: {
  label: string; color: string; pulse?: boolean; children: React.ReactNode;
}) {
  const colorMap: Record<string, string> = {
    primary: "text-primary",
    destructive: "text-red-400",
    emerald: "text-emerald-400",
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className={cn(pulse && "relative")}
    >
      {pulse && (
        <div className="absolute -inset-x-1 -inset-y-0.5 rounded-xl bg-gradient-to-r from-primary/[0.03] via-primary/[0.06] to-primary/[0.03] animate-pulse pointer-events-none" />
      )}
      <div className="relative">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={cn("text-[9px] font-bold tracking-[0.15em] uppercase", colorMap[color] || "text-muted-foreground")}>
            {label}
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-white/[0.06] to-transparent" />
        </div>
        <div className="space-y-0.5">{children}</div>
      </div>
    </motion.div>
  );
}

function getContextualStepIcon(step: ThinkingStep): typeof Search | null {
  const combined = ((step.tool_name || "") + " " + (step.title || "")).toLowerCase();
  if (combined.includes("search") || combined.includes("knowledge") || combined.includes("recall") || combined.includes("research") || combined.includes("memory")) return Search;
  if (combined.includes("brows") || combined.includes("web") || combined.includes("fetch") || combined.includes("url")) return Globe;
  if (combined.includes("writ") || combined.includes("edit") || combined.includes("save") || combined.includes("generat") || combined.includes("creat") || combined.includes("content")) return FileEdit;
  if (combined.includes("think") || combined.includes("plan") || combined.includes("reason") || combined.includes("analy") || combined.includes("reflect")) return Brain;
  if (combined.includes("verif") || combined.includes("quality") || combined.includes("debug") || combined.includes("check")) return ShieldCheck;
  return null;
}

function StepRow({ step, variant, elapsedMs }: {
  step: ThinkingStep; variant: "working" | "done" | "error"; elapsedMs?: number;
}) {
  const ToolIcon = getToolIcon(step.tool_name);
  const config = step.tool_name ? getToolConfig(step.tool_name) : null;
  const ContextIcon = getContextualStepIcon(step);

  const statusIcon = {
    working: <Loader2 className="h-3 w-3 text-primary animate-spin shrink-0" />,
    done: <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />,
    error: <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />,
  }[variant];

  return (
    <motion.div
      layout
      key={step.id}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8, transition: { duration: 0.1 } }}
      transition={{ duration: 0.15 }}
      className={cn(
        "flex items-center gap-2 py-1 px-1.5 rounded-lg transition-colors",
        variant === "working" && "bg-primary/[0.04]",
        variant === "error" && "bg-red-500/[0.04]"
      )}
    >
      {statusIcon}
      {ContextIcon ? (
        <ContextIcon className={cn("h-3 w-3 shrink-0", config?.color || "text-muted-foreground/50")} />
      ) : (
        <div className={cn("shrink-0", config?.color || "text-muted-foreground/50")}>
          <ToolIcon className="h-3 w-3" />
        </div>
      )}
      <span className={cn(
        "text-[11px] truncate flex-1 font-medium",
        variant === "done" ? "text-muted-foreground/50" : "text-foreground/80"
      )}>
        {step.title}
      </span>
      {step.detail && variant !== "done" && (
        <span className="text-[10px] text-muted-foreground/40 truncate max-w-[180px] shrink-0">
          {step.detail}
        </span>
      )}
      {variant === "done" && elapsedMs !== undefined && elapsedMs > 0 && (
        <span className="text-[9px] text-muted-foreground/35 shrink-0 font-mono tabular-nums">
          {elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`}
        </span>
      )}
    </motion.div>
  );
}

function ParallelChip({ step }: { step: ThinkingStep }) {
  const ToolIcon = getToolIcon(step.tool_name);
  const config = step.tool_name ? getToolConfig(step.tool_name) : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-lg",
        "bg-primary/[0.04] border border-primary/10"
      )}
    >
      <Loader2 className="h-2.5 w-2.5 text-primary animate-spin" />
      <div className={cn("shrink-0", config?.color || "text-muted-foreground/50")}>
        <ToolIcon className="h-2.5 w-2.5" />
      </div>
      <span className="text-[10px] text-foreground/65 truncate max-w-[120px] font-medium">
        {step.title}
      </span>
    </motion.div>
  );
}
