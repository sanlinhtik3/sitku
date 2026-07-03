// ═══ Autonomous Subtask Side Panel (V5) ═══
// V5: Adds NarrationFeed — conversational agent commentary during streaming.

import { useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ListTodo, PanelRightClose, AlertCircle, Loader2, Zap } from "lucide-react";
import type { AutonomousTask, AutonomousTaskStep } from "@/hooks/agent-chat/useAutonomousTask";
import type { ToolProgressStep } from "./streaming/ExecutionTimeline";
import type { CompletedToolStep } from "./AgentToolStep";

import { AutonomousTaskCard } from "./AutonomousTaskCard";
import { ExecutionTimeline } from "./streaming/ExecutionTimeline";

interface NarrationMessage {
  id: string;
  text: string;
  timestamp: number;
}

interface Props {
  task?: AutonomousTask | null;
  steps?: AutonomousTaskStep[];
  isStale?: boolean;
  taskId: string;
  onClose: () => void;
  // Streaming mode props
  streamingToolSteps?: ToolProgressStep[];
  streamingTaskPlanSteps?: any[];
  completedToolSteps?: CompletedToolStep[];
  narrationMessages?: NarrationMessage[];
}

export function AutonomousSubtaskPanel({
  task, steps, isStale = false, onClose,
  streamingToolSteps = [], streamingTaskPlanSteps = [], completedToolSteps = [],
  narrationMessages = [],
  taskId,
}: Props) {
  const isStreamingMode = taskId === "__streaming__";
  const hasStreamingData = streamingToolSteps.length > 0 || streamingTaskPlanSteps.length > 0;
  const narrationEndRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col h-full bg-background/95 backdrop-blur-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/15 shrink-0">
        <div className="flex items-center gap-2.5">
          {isStreamingMode ? (
            <Zap className="h-4 w-4 text-primary" />
          ) : (
            <ListTodo className="h-4 w-4 text-primary" />
          )}
          <span className="text-sm font-bold text-foreground">
            {isStreamingMode ? "Live Pipeline" : "Subtasks"}
          </span>
          {isStreamingMode && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium animate-pulse">
              LIVE
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-muted/20 text-muted-foreground hover:text-foreground transition-all"
          aria-label="Close subtask panel"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {isStreamingMode ? (
            hasStreamingData || narrationMessages.length > 0 ? (
              <div className="space-y-4">
                {narrationMessages.length > 0 && (
                  <NarrationFeed messages={narrationMessages} endRef={narrationEndRef} />
                )}
                {streamingToolSteps.length > 0 && (
                  <ExecutionTimeline steps={streamingToolSteps} />
                )}
                {completedToolSteps.length > 0 && (
                  <div className="space-y-2 mt-3">
                    <p className="text-[11px] text-muted-foreground/50 uppercase tracking-wider font-semibold">
                      Completed Tools
                    </p>
                    {completedToolSteps.map((step, i) => (
                      <div key={i} className="flex flex-col gap-0.5 text-xs text-muted-foreground/70 py-1.5 border-b border-border/10 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-primary text-[10px]">✓</span>
                          <span className="font-medium text-muted-foreground/90">{step.label || step.name}</span>
                        </div>
                        <p className="pl-5 text-[11px] text-muted-foreground/60 truncate">
                          {step.context || step.summary}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <EmptyState message="Pipeline data loading..." sub="Tool progress will appear as the agent works" />
            )
          ) : task ? (
            <AutonomousTaskCard task={task} steps={steps} botEmoji="🐝" isStale={isStale} />
          ) : (
            <EmptyState message="No subtask data available" sub="Task data will appear when a background task runs" />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-xs">Loading task data...</span>
    </div>
  );
}

function EmptyState({ message, sub }: { message: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertCircle className="h-8 w-8 text-muted-foreground/20 mb-3" />
      <p className="text-sm text-muted-foreground/50">{message}</p>
      <p className="text-xs text-muted-foreground/30 mt-1">{sub}</p>
    </div>
  );
}

function NarrationFeed({ messages, endRef }: { messages: NarrationMessage[]; endRef: React.RefObject<HTMLDivElement | null> }) {
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="space-y-1.5 mb-3">
      <p className="text-[11px] text-muted-foreground/50 uppercase tracking-wider font-semibold flex items-center gap-1.5">
        <Zap className="h-3 w-3 text-primary" />
        Agent Commentary
      </p>
      <div className="max-h-[120px] overflow-y-auto space-y-1 pr-1">
        {messages.map((msg, i) => {
          const isLatest = i === messages.length - 1;
          return (
            <div
              key={msg.id}
              className={`text-[11px] leading-relaxed pl-2.5 border-l-2 transition-all duration-300 ${
                isLatest
                  ? "border-primary/50 text-foreground/80 animate-fade-in"
                  : "border-border/20 text-muted-foreground/50"
              }`}
            >
              {msg.text}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
