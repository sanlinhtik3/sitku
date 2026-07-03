import { useMemo, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Brain, ChevronDown } from "lucide-react";

import { ChatMessage } from "../ChatMessage";
import { PlanExecutionCard } from "../PlanExecutionCard";
import { CompletedToolStep } from "../AgentToolStep";
import { ThinkingStep } from "../ThinkingAccordion";
import { type ToolProgressStep } from "./ExecutionTimeline";
import { type TaskPlanStep } from "./TaskDecompositionCard";
import { StreamingFocalPoint } from "./StreamingFocalPoint";
import type { ThinkingBlock } from "@/hooks/agent-chat/types";

interface NarrationMessage {
  id: string;
  text: string;
  timestamp: number;
}

interface StreamingOverlayProps {
  isStreaming: boolean;
  streamingContent: string;
  streamingIsError: boolean;
  toolCalls: { name: string; status: "pending" | "running" | "success" | "error"; result?: any }[];
  thinkingStatus: string | null;
  completedToolSteps: CompletedToolStep[];
  currentStep?: number;
  totalSteps?: number;
  accumulatedThoughts: ThinkingStep[];
  botEmoji: string;
  isAdmin: boolean;
  relayRound: number;
  totalRelayRounds: number;
  streamStartTime?: number | null;
  isResearching?: boolean;
  subTasks?: import("@/hooks/agent-chat/types").SubTask[];
  toolProgressSteps?: ToolProgressStep[];
  taskPlanSteps?: TaskPlanStep[];
  narrationMessages?: NarrationMessage[];
  onOpenDetails?: () => void;
  reasoningEffort?: string | null;
  thinkingBlocks?: ThinkingBlock[];
}

export function StreamingOverlay({
  isStreaming,
  streamingContent,
  streamingIsError,
  toolCalls,
  thinkingStatus,
  completedToolSteps,
  currentStep,
  totalSteps,
  accumulatedThoughts,
  botEmoji,
  isAdmin,
  relayRound,
  totalRelayRounds,
  streamStartTime,
  isResearching = false,
  subTasks = [],
  toolProgressSteps = [],
  taskPlanSteps = [],
  narrationMessages = [],
  onOpenDetails,
  reasoningEffort,
  thinkingBlocks = [],
}: StreamingOverlayProps) {
  const enrichedTaskPlanSteps = useMemo(() => {
    if (taskPlanSteps.length === 0) return [];
    return taskPlanSteps.map((step) => ({
      ...step,
      status: (step.status as "pending" | "running" | "done") || "pending",
    }));
  }, [taskPlanSteps]);

  if (!isStreaming) return null;

  const hasThoughts = accumulatedThoughts.length >= 1;
  const hasToolProgress = toolProgressSteps.length > 0;
  const hasTaskPlan = taskPlanSteps.length >= 1;
  const hasReasoning = thinkingBlocks.length > 0;
  const hasContent = !!streamingContent || isResearching || subTasks.length > 0;

  // Only show legacy plan-execution card as a last-resort fallback when there is
  // NO unified focal surface available (no tool progress, no task plan, no
  // reasoning panel). Prevents stacked "thinking" chips top + bottom.
  const showPlanExecution = hasThoughts && !hasToolProgress && !hasTaskPlan && !hasReasoning;
  const showSkeleton = !hasContent && !thinkingStatus && !hasToolProgress && !hasTaskPlan && !hasThoughts && !hasReasoning;

  const doneSteps = toolProgressSteps.filter(s => s.status === "done").length;
  const stepCountLabel = hasToolProgress
    ? `Step ${Math.min(doneSteps + 1, toolProgressSteps.length)}/${toolProgressSteps.length}`
    : undefined;

  return (
    <div className="px-1 py-1 animate-fade-in">
      <div className="w-full flex justify-start">
        <div className="min-w-0 max-w-[85%] sm:max-w-[80%] flex flex-col items-start">
          {/* Header row: avatar + name — matches finished assistant layout */}
          <div className="flex items-center gap-2 mb-1.5 px-0.5">
            <div className="h-6 w-6 rounded-full flex items-center justify-center text-sm ring-1 ring-border/30 bg-gradient-to-br from-primary/15 to-primary/5">
              <span className="leading-none">{botEmoji}</span>
            </div>
            <span className="text-xs font-semibold text-foreground/85 leading-none">BeeBot</span>
          </div>

          <div className="flex flex-col gap-2 w-full">

          {/* Skeleton shimmer (initial empty state) */}
          {showSkeleton && <SkeletonLines />}

          {/* ═══ Unified Focal Point: status + task plan + tool progress ═══ */}
          <StreamingFocalPoint
            currentStatus={thinkingStatus}
            isActive={isStreaming}
            streamStartTime={streamStartTime ?? undefined}
            stepCountLabel={stepCountLabel}
            onClick={onOpenDetails}
            latestNarration={narrationMessages.length > 0 ? narrationMessages[narrationMessages.length - 1].text : undefined}
            taskPlanSteps={enrichedTaskPlanSteps}
            toolProgressSteps={toolProgressSteps}
            reasoningEffort={reasoningEffort}
          />

          {/* Native Anthropic Extended Thinking — collapsible accordion */}
          {thinkingBlocks.length > 0 && (
            <ExtendedThinkingPanel blocks={thinkingBlocks} />
          )}

          {/* Thinking steps (legacy fallback when no tool/task plan) */}
          {showPlanExecution && (
            <PlanExecutionCard
              thoughts={accumulatedThoughts}
              currentStatus={thinkingStatus}
              isStreaming={isStreaming}
            />
          )}

          {/* Streaming chat content */}
          {hasContent && (
            <StreamingContentInline
              streamingContent={streamingContent}
              streamingIsError={streamingIsError}
              accumulatedThoughts={accumulatedThoughts}
              isResearching={isResearching}
              subTasks={subTasks}
            />
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Skeleton shimmer — progressive reveal with gradient sweep */
function SkeletonLines() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 600);
    const t2 = setTimeout(() => setPhase(2), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-2.5 py-1"
    >
      <ShimmerBar width="w-3/4" delay={0} />
      {phase >= 1 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <ShimmerBar width="w-1/2" delay={150} />
        </motion.div>
      )}
      {phase >= 2 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <ShimmerBar width="w-2/5" delay={300} />
        </motion.div>
      )}
    </motion.div>
  );
}

/** Single shimmer bar with gradient sweep animation */
function ShimmerBar({ width, delay }: { width: string; delay: number }) {
  return (
    <div
      className={`h-3 rounded-full ${width} relative overflow-hidden bg-muted/20`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite]"
        style={{
          background: "linear-gradient(90deg, transparent 0%, hsl(var(--primary) / 0.08) 40%, hsl(var(--primary) / 0.15) 50%, hsl(var(--primary) / 0.08) 60%, transparent 100%)",
          animationDelay: `${delay}ms`,
        }}
      />
    </div>
  );
}

/** Inline streaming content */
function StreamingContentInline({
  streamingContent,
  streamingIsError,
  accumulatedThoughts,
  isResearching,
  subTasks,
}: {
  streamingContent: string;
  streamingIsError: boolean;
  accumulatedThoughts: ThinkingStep[];
  isResearching: boolean;
  subTasks: import("@/hooks/agent-chat/types").SubTask[];
}) {
  const createdAtRef = useRef(new Date().toISOString());
  const memoThoughts = useMemo<ThinkingStep[]>(() => [], []);

  return (
    <ChatMessage
      message={{
        id: "streaming",
        session_id: "",
        user_id: "",
        role: "assistant",
        content: streamingContent,
        is_error: streamingIsError,
        created_at: createdAtRef.current,
        isResearching,
        subTasks,
      }}
      thoughts={memoThoughts}
      isStreaming={!streamingIsError}
      botEmoji=""
      skipAnimation
    />
  );
}

/** Native Anthropic Extended Thinking accordion — collapsible, live-stream */
function ExtendedThinkingPanel({ blocks }: { blocks: ThinkingBlock[] }) {
  const [open, setOpen] = useState(false);
  const activeBlock = blocks.find((b) => !b.complete) ?? blocks[blocks.length - 1];
  const isLive = blocks.some((b) => !b.complete);
  const totalChars = blocks.reduce((sum, b) => sum + (b.text?.length || 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-primary/15 bg-gradient-to-br from-primary/5 to-primary/0 overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground/85 hover:bg-primary/5 transition-colors"
      >
        <Brain className={`h-3.5 w-3.5 text-primary ${isLive ? "animate-pulse" : ""}`} />
        <span className="flex-1 text-left">
          {isLive ? "Thinking…" : "Reasoning"}
          {!isLive && totalChars > 0 && (
            <span className="ml-1.5 text-[10px] text-muted-foreground">({totalChars.toLocaleString()} chars)</span>
          )}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && activeBlock && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="border-t border-primary/10"
          >
            <div className="max-h-[260px] overflow-y-auto px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono">
              {blocks.map((b, i) => (
                <div key={b.index ?? i} className={i > 0 ? "mt-2 pt-2 border-t border-primary/5" : ""}>
                  {b.text || (isLive ? "…" : "")}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
