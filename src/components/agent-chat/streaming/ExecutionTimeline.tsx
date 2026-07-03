import { useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOOL_LABELS } from "@/hooks/agent-chat/types";

export interface ToolProgressStep {
  id: string;
  tool: string;
  emoji: string;
  label: string;
  status: "running" | "done" | "error";
  startedAt: number;
  completedAt?: number;
  context?: string;
}

interface ExecutionTimelineProps {
  steps: ToolProgressStep[];
  streamStartTime?: number | null;
}

function ElapsedTimer({ startedAt, stopped }: { startedAt: number; stopped?: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (stopped) {
      setElapsed(Date.now() - startedAt);
      return;
    }
    const tick = () => setElapsed(Date.now() - startedAt);
    tick();
    intervalRef.current = setInterval(tick, 100);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [startedAt, stopped]);

  const secs = (elapsed / 1000).toFixed(1);
  return (
    <span className="text-[10px] tabular-nums text-muted-foreground/40 font-mono">
      {secs}s
    </span>
  );
}

/** Group same-tool steps (done ones grouped, running shown individually) */
interface DisplayRow {
  key: string;
  tool: string;
  label: string;
  status: "running" | "done" | "error";
  count: number;
  startedAt: number;
  latestStep: ToolProgressStep;
}

function groupSteps(steps: ToolProgressStep[]): DisplayRow[] {
  // Group ALL done steps by tool (not just consecutive)
  const doneByTool = new Map<string, DisplayRow>();
  const activeRows: DisplayRow[] = [];

  for (const step of steps) {
    if (step.status === "done") {
      const existing = doneByTool.get(step.tool);
      if (existing) {
        existing.count++;
        existing.latestStep = step;
      } else {
        doneByTool.set(step.tool, {
          key: `done-${step.tool}`,
          tool: step.tool,
          label: step.label,
          status: "done",
          count: 1,
          startedAt: step.startedAt,
          latestStep: step,
        });
      }
    } else {
      // Running/error — show individually with unique key
      activeRows.push({
        key: `active-${step.id}`,
        tool: step.tool,
        label: step.label,
        status: step.status,
        count: 1,
        startedAt: step.startedAt,
        latestStep: step,
      });
    }
  }

  // Active first, then done groups
  return [...activeRows, ...Array.from(doneByTool.values())];
}

export function ExecutionTimeline({ steps, streamStartTime }: ExecutionTimelineProps) {
  const rows = useMemo(() => groupSteps(steps), [steps]);

  if (steps.length === 0) return null;

  const doneCount = steps.filter(s => s.status === "done").length;
  const runningCount = steps.filter(s => s.status === "running").length;
  const progress = steps.length > 0 ? (doneCount / steps.length) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-lg overflow-hidden bg-card/15 backdrop-blur-xl border border-white/[0.04]"
    >
      {/* Single-line header with inline progress */}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <div className="relative flex h-1.5 w-1.5 shrink-0">
          {runningCount > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-50" />}
          <span className={cn("relative inline-flex rounded-full h-1.5 w-1.5", runningCount > 0 ? "bg-primary" : "bg-emerald-400")} />
        </div>
        <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums">
          {doneCount}/{steps.length}
        </span>
        {/* Inline progress bar */}
        <div className="flex-1 h-px bg-white/[0.04] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
            className="h-full bg-primary/40"
          />
        </div>
        {streamStartTime && <ElapsedTimer startedAt={streamStartTime} />}
      </div>

      {/* Ultra-compact rows */}
      <div className="px-2 pb-1.5 space-y-px">
        <AnimatePresence mode="popLayout">
          {rows.map((row) => (
            <motion.div
              key={row.key}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className={cn(
                "flex items-center gap-1.5 py-0.5 px-1.5 rounded-md text-[11px]",
                row.status === "running" && "bg-primary/[0.03]",
              )}
            >
              {row.status === "running" && <Loader2 className="h-2.5 w-2.5 text-primary animate-spin shrink-0" />}
              {row.status === "done" && <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400/60 shrink-0" />}
              {row.status === "error" && <XCircle className="h-2.5 w-2.5 text-red-400/60 shrink-0" />}
              <span className={cn(
                "flex-1 truncate",
                row.status === "running" ? "text-foreground/75" : "text-muted-foreground/40"
              )}>
                {TOOL_LABELS[row.tool] || row.label}
                {row.count > 1 && <span className="ml-1 text-[9px] opacity-60 font-mono">×{row.count}</span>}
              </span>
              <ElapsedTimer startedAt={row.latestStep.startedAt} stopped={row.status !== "running"} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
