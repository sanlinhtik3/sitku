// ═══ Autonomous Task Progress Card — Functional & Intelligent ═══
import { useRef, useEffect, useState, memo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { Check, Circle, Loader2, AlertCircle, ChevronDown, ChevronUp, ExternalLink, Search, FileEdit, Globe, Brain, Clock, Code, SkipForward, GitBranch } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AutonomousTask, AutonomousTaskStep } from "@/hooks/agent-chat/useAutonomousTask";
import { AGENT_ROLE_CONFIG } from "@/hooks/agent-chat/types";
import { AutonomousSubtasksDialog } from "./AutonomousSubtasksDialog";

interface AutonomousTaskCardProps {
  task: AutonomousTask;
  steps?: AutonomousTaskStep[];
  botEmoji?: string;
  isStale?: boolean;
}

function getErrorLabel(task: AutonomousTask): string {
  const meta = task.metadata as Record<string, unknown> | null;
  const errorType = meta?.error_type as string | undefined;
  const error = task.error || '';
  if (errorType === 'no_provider' || error.includes('No API key')) return 'API key not configured';
  if (errorType === 'fatal' && error.includes('providers exhausted')) return 'All AI providers unavailable';
  if (error.includes('quota') || error.includes('RESOURCE_EXHAUSTED')) return 'Provider quota exceeded';
  if (error.includes('rate limit') || error.includes('429')) return 'Rate limited — try again later';
  if (error.includes('timeout') || error.includes('abort')) return 'Task timed out';
  return error.slice(0, 80) || 'Something went wrong';
}

// ═══ Agent role icon mapping (local, augments shared AGENT_ROLE_CONFIG) ═══
const AGENT_ROLE_ICONS: Record<string, typeof Search> = {
  researcher: Search,
  analyst: Brain,
  writer: FileEdit,
  coder: Code,
  general: Brain,
};

// ═══ DAG layer computation (client-side BFS) ═══
function computeLayerInfo(steps: AutonomousTaskStep[]): { currentLayer: number; totalLayers: number } | null {
  if (steps.length === 0) return null;
  const depthMap = new Map<string, number>();
  // Assign depth 0 to root steps (no deps)
  for (const step of steps) {
    if (!step.depends_on || step.depends_on.length === 0) depthMap.set(step.id, 0);
  }
  // BFS to assign depths
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of steps) {
      if (depthMap.has(step.id)) continue;
      const deps = step.depends_on || [];
      if (deps.every(d => depthMap.has(d))) {
        const maxDep = Math.max(...deps.map(d => depthMap.get(d)!));
        depthMap.set(step.id, maxDep + 1);
        changed = true;
      }
    }
  }
  if (depthMap.size === 0) return null;
  const totalLayers = Math.max(...Array.from(depthMap.values())) + 1;
  const runningSteps = steps.filter(s => s.status === "running");
  if (runningSteps.length > 0) {
    const currentLayer = Math.min(...runningSteps.map(s => depthMap.get(s.id) ?? 0)) + 1;
    return { currentLayer, totalLayers };
  }
  const doneDepths = steps.filter(s => s.status === "done").map(s => depthMap.get(s.id) ?? 0);
  const currentLayer = doneDepths.length > 0 ? Math.min(Math.max(...doneDepths) + 2, totalLayers) : 1;
  return { currentLayer, totalLayers };
}

// ═══ Tool detection ═══
function detectTool(text: string, agentRole?: string): { label: string; icon: typeof Search } | null {
  // Phase 4: prefer agent role if available
  if (agentRole && AGENT_ROLE_CONFIG[agentRole]) {
    const config = AGENT_ROLE_CONFIG[agentRole];
    return { label: config.label, icon: AGENT_ROLE_ICONS[agentRole] ?? Brain };
  }
  const t = text.toLowerCase();
  if (t.includes("search") || t.includes("ရှာ") || t.includes("research") || t.includes("find")) return { label: "Search", icon: Search };
  if (t.includes("brows") || t.includes("web") || t.includes("url") || t.includes("fetch")) return { label: "Browser", icon: Globe };
  if (t.includes("writ") || t.includes("edit") || t.includes("save") || t.includes("creat") || t.includes("generat")) return { label: "Editor", icon: FileEdit };
  if (t.includes("code") || t.includes("program") || t.includes("script")) return { label: "Code", icon: Code };
  if (t.includes("analy") || t.includes("think") || t.includes("plan") || t.includes("reason")) return { label: "Reasoning", icon: Brain };
  return null;
}

function getToolActivity(steps: AutonomousTaskStep[]): { label: string; icon: typeof Search } | null {
  const running = steps.find(s => s.status === "running");
  if (!running) return null;
  return detectTool((running.title || "") + " " + (running.description || ""), running.agent_role) || { label: "Tools", icon: Brain };
}

function getStepToolIcon(step: AutonomousTaskStep): typeof Search | null {
  return detectTool((step.title || "") + " " + (step.description || ""), step.agent_role)?.icon ?? null;
}

function getStatusPhase(task: AutonomousTask, toolActivity: ReturnType<typeof getToolActivity>): { dot: string; text: string } {
  const meta = task.metadata as Record<string, unknown> | null;
  const currentActivity = meta?.currentActivity as string | undefined;

  if (task.status === "completed") return { dot: "bg-emerald-500", text: "Completed" };
  if (task.status === "failed") return { dot: "bg-destructive", text: "Failed" };
  if (task.status === "compiling") return { dot: "bg-amber-400 animate-pulse", text: currentActivity || "Compiling results..." };
  if (task.status === "planning") return { dot: "bg-violet-400 animate-pulse", text: currentActivity || "Planning..." };
  if (currentActivity) return { dot: "bg-primary animate-pulse", text: currentActivity };
  if (!toolActivity) return { dot: "bg-amber-400 animate-pulse", text: "Thinking..." };
  return { dot: "bg-primary animate-pulse", text: `Using ${toolActivity.label}` };
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export const AutonomousTaskCard = memo(function AutonomousTaskCard({ task, steps: liveProp, botEmoji = "🐝", isStale = false }: AutonomousTaskCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const timerRef = useRef<HTMLSpanElement>(null);
  const isCompleted = task.status === "completed";
  const isFailed = task.status === "failed";
  const isActive = !isCompleted && !isFailed && !isStale;
  // Prefer live step subscription data; fall back to task.plan snapshot
  const steps = (liveProp && liveProp.length > 0 ? liveProp : (task.plan || [])) as AutonomousTaskStep[];
  const toolActivity = getToolActivity(steps);
  const phase = getStatusPhase(task, toolActivity);
  const doneSteps = steps.filter(s => s.status === "done").length;
  const isDAG = task.execution_mode === "dag";
  const parallelCount = steps.filter(s => s.status === "running").length;
  const meta = task.metadata as Record<string, unknown> | null;
  const agentRoles = (task.agent_roles_used || meta?.agentRolesUsed as string[] || []) as string[];
  const layerInfo = isDAG ? computeLayerInfo(steps) : null;

  // Auto-collapse on completion
  useEffect(() => {
    if (isCompleted || isFailed) {
      const timer = setTimeout(() => setExpanded(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [isCompleted, isFailed]);

  // Elapsed timer
  useEffect(() => {
    if (!isActive) return;
    const start = new Date(task.created_at).getTime();
    const tick = () => {
      if (!timerRef.current) return;
      timerRef.current.textContent = formatElapsed(Date.now() - start);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isActive, task.created_at]);

  // Completion duration
  const completionDuration = !isActive && task.completed_at
    ? formatElapsed(new Date(task.completed_at).getTime() - new Date(task.created_at).getTime())
    : null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="py-1.5"
      >
        <div className={cn(
          "rounded-xl overflow-hidden transition-all duration-300",
          "bg-white/[0.04] backdrop-blur-xl border border-white/[0.08]",
          "shadow-[0_0_40px_rgba(0,0,0,0.12)]",
          isActive && "shadow-[0_0_40px_hsl(var(--primary)/0.08)]",
          isFailed && "border-destructive/30"
        )}>
          {/* Header */}
          <div
            className={cn(
              "px-4 py-3 flex items-center justify-between cursor-pointer transition-colors",
              "hover:bg-white/[0.03]",
              isActive && "bg-gradient-to-r from-primary/[0.03] via-transparent to-primary/[0.03]"
            )}
            onClick={() => setExpanded(v => !v)}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className="text-sm">{botEmoji}</span>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5">
                  BeeBot's workspace
                  {isDAG && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                      <GitBranch className="h-2 w-2" />
                      DAG
                    </span>
                  )}
                  {parallelCount > 1 && isActive && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-500/10 text-[9px] font-bold text-amber-500">
                      ⚡ {parallelCount}×
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", phase.dot)} />
                  {isActive && toolActivity ? (
                    <span className="flex items-center gap-1 truncate">
                      <toolActivity.icon className="h-2.5 w-2.5 inline shrink-0" />
                      {phase.text}
                      {steps.length > 0 && (
                        <span className="text-muted-foreground/50 ml-0.5">
                          ({doneSteps}/{steps.length})
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="truncate">{phase.text}</span>
                  )}
                </div>
                {/* Agent role badges with tooltips */}
                {agentRoles.length > 0 && (isCompleted || isActive) && (
                  <div className="flex items-center gap-1 mt-0.5">
                    {agentRoles.slice(0, 5).map(role => {
                      const config = AGENT_ROLE_CONFIG[role] || AGENT_ROLE_CONFIG.general;
                      return (
                        <Tooltip key={role}>
                          <TooltipTrigger asChild>
                            <span className="text-[9px] text-muted-foreground/50 cursor-default">
                              {config.emoji}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">
                            <p className="font-medium">{config.label}</p>
                            <p className="text-muted-foreground">{config.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Timer or duration */}
              {isActive ? (
                <span ref={timerRef} className="text-[10px] font-mono text-muted-foreground tabular-nums" />
              ) : completionDuration ? (
                <span className="text-[10px] font-mono text-muted-foreground/50 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  {completionDuration}
                </span>
              ) : null}

              <button
                onClick={(e) => { e.stopPropagation(); setDialogOpen(true); }}
                className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-white/[0.06] transition-colors text-muted-foreground hover:text-foreground"
                title="View subtasks"
              >
                <ExternalLink className="h-3 w-3" />
              </button>

              {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-px w-full bg-white/[0.06]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${task.progress_pct ?? 0}%` }}
              transition={{ duration: 0.6, ease: "circOut" }}
              className={cn(
                "h-full",
                isFailed ? "bg-destructive" : isCompleted ? "bg-emerald-500" : "bg-primary"
              )}
            />
          </div>

          {/* Stale indicator */}
          {isStale && (
            <div className="px-4 py-2.5 border-t border-white/[0.05]">
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3 text-muted-foreground animate-pulse flex-shrink-0" />
                <p className="text-xs text-muted-foreground">Task appears stale — dismissing...</p>
              </div>
            </div>
          )}

          {/* Error */}
          {isFailed && !isStale && (
            <div className="px-4 py-2.5 border-t border-white/[0.05]">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0" />
                <p className="text-xs text-destructive/80">{getErrorLabel(task)}</p>
              </div>
            </div>
          )}

          {/* Step list */}
          <AnimatePresence>
            {expanded && steps.length > 0 && !isFailed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className="overflow-hidden"
              >
                <div className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider flex items-center gap-1.5">
                      Progress
                      {layerInfo && isActive && (
                        <span className="font-normal normal-case text-muted-foreground/40">
                          · Layer {layerInfo.currentLayer}/{layerInfo.totalLayers}
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {parallelCount > 1 && isActive && (
                        <span className="text-[9px] text-amber-500/80 flex items-center gap-0.5">
                          ⚡ {parallelCount} parallel
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums">
                        {doneSteps}/{steps.length}
                      </span>
                    </div>
                  </div>
                  {steps.map((step, idx) => (
                    <StepRow key={step.id} step={step} index={idx} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Collapsed prompt preview */}
          {!expanded && !isFailed && (
            <div className="px-4 py-2 border-t border-white/[0.05]">
              <p className="text-[11px] text-muted-foreground truncate">
                {(task.original_prompt ?? "").slice(0, 100)}{(task.original_prompt?.length ?? 0) > 100 ? "…" : ""}
              </p>
            </div>
          )}
        </div>
      </motion.div>

      <AutonomousSubtasksDialog open={dialogOpen} onOpenChange={setDialogOpen} task={task} steps={liveProp} />
    </>
  );
});

// ═══ Step Row ═══
function StepRow({ step, index }: { step: AutonomousTaskStep; index: number }) {
  const timerRef = useRef<HTMLSpanElement>(null);
  const ToolIcon = getStepToolIcon(step);

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

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className={cn(
        "flex items-center gap-2.5 py-0.5 px-1 rounded-md transition-colors",
        step.status === "running" && "bg-primary/[0.05]"
      )}
    >
      <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
        {step.status === "done" ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : step.status === "running" ? (
          <Loader2 className="h-3 w-3 text-primary animate-spin" />
        ) : step.status === "error" ? (
          <AlertCircle className="h-3 w-3 text-destructive" />
        ) : step.status === "skipped" ? (
          <SkipForward className="h-3 w-3 text-muted-foreground/40" />
        ) : (
          <Circle className="h-2.5 w-2.5 text-muted-foreground/30" />
        )}
      </div>

      {/* Agent role emoji */}
      {step.agent_role && AGENT_ROLE_CONFIG[step.agent_role] ? (
        <span className={cn(
          "text-[10px] flex-shrink-0",
          step.status === "done" ? "opacity-40" :
          step.status === "running" ? "opacity-100" :
          "opacity-20"
        )}>
          {AGENT_ROLE_CONFIG[step.agent_role].emoji}
        </span>
      ) : ToolIcon ? (
        <ToolIcon className={cn(
          "h-3 w-3 flex-shrink-0",
          step.status === "done" ? "text-muted-foreground/40" :
          step.status === "running" ? "text-primary/70" :
          "text-muted-foreground/20"
        )} />
      ) : null}

      <div className="flex-1 min-w-0">
        <span className={cn(
          "text-xs block truncate",
          step.status === "done" ? "text-muted-foreground" :
          step.status === "running" ? "text-foreground font-medium" :
          step.status === "error" ? "text-destructive" :
          step.status === "skipped" ? "text-muted-foreground/30 line-through" :
          "text-muted-foreground/40"
        )}>
          {step.title}
        </span>
        {step.status === "running" && (
          <span className="flex items-center gap-1.5 mt-0.5">
            <span ref={timerRef} className="text-[10px] font-mono text-muted-foreground/50 tabular-nums" />
            {step.description && (
              <span className="text-[10px] text-primary/60 truncate">— {step.description}</span>
            )}
          </span>
        )}
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
    </motion.div>
  );
}
