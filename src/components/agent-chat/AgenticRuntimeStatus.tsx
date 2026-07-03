import { memo, useMemo } from "react";
import { Activity, Brain, CheckCircle2, Cloud, HardDrive, ShieldCheck, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompletedToolStep, ToolCallState } from "@/hooks/agent-chat/types";
import type { AgentRuntimeStatus as RuntimeStatus } from "@/repositories/contracts/agentRuntime";

interface AgenticRuntimeStatusProps {
  isStreaming: boolean;
  currentStep?: number;
  totalSteps?: number;
  toolCalls: ToolCallState[];
  completedToolSteps: CompletedToolStep[];
  totalTokens: { input: number; output: number };
  healthStatus?: string;
  reasoningEffort?: string | null;
  runtimeStatus?: RuntimeStatus | null;
  className?: string;
}

export const AgenticRuntimeStatus = memo(function AgenticRuntimeStatus({
  isStreaming,
  currentStep,
  totalSteps,
  toolCalls,
  completedToolSteps,
  totalTokens,
  healthStatus,
  reasoningEffort,
  runtimeStatus,
  className,
}: AgenticRuntimeStatusProps) {
  const state = useMemo(() => {
    const activeTools = toolCalls.filter((tool) => tool.status === "pending" || tool.status === "running").length;
    const failedTools = completedToolSteps.filter((step) => step.status === "error").length;
    const completedTools = completedToolSteps.filter((step) => step.status === "success").length;
    const hasSteps = Boolean(currentStep && totalSteps);

    let phase = "Ready";
    if (activeTools > 0) phase = "Tooling";
    else if (isStreaming && hasSteps) phase = "Reasoning";
    else if (isStreaming) phase = "Thinking";

    const reliability = failedTools > 0 ? "Recovering" : healthStatus === "degraded" ? "Guarded" : "Stable";

    return {
      phase,
      activeTools,
      completedTools,
      failedTools,
      totalToolEvents: activeTools + completedTools + failedTools,
      reliability,
      hasSteps,
      tokens: totalTokens.input + totalTokens.output,
    };
  }, [completedToolSteps, currentStep, healthStatus, isStreaming, toolCalls, totalSteps, totalTokens.input, totalTokens.output]);

  const RuntimeIcon = runtimeStatus?.adapter === "electron-local" ? HardDrive : Cloud;
  const runtimeLabel = runtimeStatus?.model || runtimeStatus?.label || "Runtime";

  return (
    <div
      className={cn(
        "hidden xl:flex h-8 items-center gap-1.5 rounded-full border border-primary/20 bg-background/75 px-2 text-[10px] text-muted-foreground shadow-[0_0_24px_rgba(0,255,178,0.08)] backdrop-blur-xl",
        isStreaming && "border-primary/35 bg-primary/10 text-primary/90",
        className,
      )}
      title={`Agentic runtime: ${state.phase}${state.hasSteps ? ` step ${currentStep}/${totalSteps}` : ""}`}
      aria-label="Agentic runtime status"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Brain className={cn("h-3.5 w-3.5", isStreaming && "animate-pulse")} />
      </span>
      <span className="font-semibold text-foreground/85">Agentic Core</span>
      <span className="h-3 w-px bg-border/50" />
      <span
        className={cn(
          "flex items-center gap-1",
          runtimeStatus?.adapter === "electron-local" ? "text-emerald-300" : "text-sky-300",
        )}
        title={
          runtimeStatus
            ? `${runtimeStatus.label}${runtimeStatus.baseUrl ? ` · ${runtimeStatus.baseUrl}` : ""}`
            : "Runtime status"
        }
      >
        <RuntimeIcon className="h-3 w-3" />
        <span className="max-w-[120px] truncate">{runtimeLabel}</span>
      </span>
      <span className="h-3 w-px bg-border/50" />
      <span className="flex items-center gap-1">
        <Activity className="h-3 w-3" />
        {state.phase}
      </span>
      {state.hasSteps && (
        <span className="font-mono text-primary/80">
          {currentStep}/{totalSteps}
        </span>
      )}
      <span className="flex items-center gap-1">
        <Wrench className="h-3 w-3" />
        {state.totalToolEvents}
      </span>
      <span
        className={cn(
          "flex items-center gap-1",
          state.failedTools > 0 ? "text-amber-300" : "text-emerald-300",
        )}
      >
        {state.failedTools > 0 ? <ShieldCheck className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
        {state.reliability}
      </span>
      {reasoningEffort && <span className="hidden 2xl:inline font-mono text-muted-foreground/80">{reasoningEffort}</span>}
      {state.tokens > 0 && <span className="hidden 2xl:inline font-mono text-muted-foreground/80">{state.tokens.toLocaleString()} tok</span>}
    </div>
  );
});
