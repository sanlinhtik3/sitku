import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSearchHighlight } from "@/hooks/agent-chat/useSearchHighlight";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDown, ChevronUp, Brain } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { MessageErrorBoundary } from "./MessageErrorBoundary";
import { ArtifactCard, detectArtifact } from "./ArtifactCard";
import { FollowUpChips } from "./FollowUpChips";
import { Artifact } from "./ArtifactPanel";
import { AgentChatMessage } from "@/hooks/useAgentChat";
import { ThinkingStep } from "./ThinkingAccordion";
import { CompletedToolStep } from "./AgentToolStep";

import { EmptySessionState } from "./streaming/EmptySessionState";
import { StreamingOverlay } from "./streaming/StreamingOverlay";
import { InlineAutonomousStatus } from "./InlineAutonomousStatus";
import type { AutonomousTask } from "@/hooks/agent-chat/useAutonomousTask";
import type { ToolProgressStep } from "./streaming/ExecutionTimeline";
import type { TaskPlanStep } from "./streaming/TaskDecompositionCard";


interface ChatMessageListProps {
  messages: AgentChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  streamingIsError?: boolean;
  toolCalls: { name: string; status: "pending" | "running" | "success" | "error"; result?: any }[];
  thinkingStatus: string | null;
  hasSession: boolean;
  onCreateSession: () => Promise<void>;
  onSendMessage?: (message: string) => void;
  onRetry?: () => void;

  botName?: string;
  botEmoji?: string;
  isAdmin?: boolean;
  completedToolSteps?: CompletedToolStep[];
  currentStep?: number;
  totalSteps?: number;
  onOpenArtifact?: (artifact: Artifact) => void;
  accumulatedThoughts?: ThinkingStep[];
  hasMoreMessages?: boolean;
  onLoadEarlierMessages?: () => void;
  onViewSources?: (messageId: string) => void;
  activeSourcesMessageId?: string | null;
  
  relayRound?: number;
  totalRelayRounds?: number;
  streamStartTime?: number | null;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRegenerateMessage?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onOpenThread?: (messageId: string) => void;
  activeThreadMessageId?: string | null;
  threadReplyCounts?: Record<string, number>;
  isResearching?: boolean;
  subTasks?: import("@/hooks/agent-chat/types").SubTask[];
  autonomousTask?: AutonomousTask | null;
  autonomousTaskStale?: boolean;
  onOpenSubtaskPanel?: (taskId: string) => void;
  toolProgressSteps?: ToolProgressStep[];
  taskPlanSteps?: TaskPlanStep[];
  narrationMessages?: { id: string; text: string; timestamp: number }[];
  reasoningEffort?: string | null;
  thinkingBlocks?: import("@/hooks/agent-chat/types").ThinkingBlock[];
  searchQuery?: string;
  /** UI scope. "memory" hides generic prompts/CTA in the empty state. */
  mode?: "general" | "memory";
}

export const ChatMessageList = React.memo(function ChatMessageList({
  messages, isLoading, isStreaming, streamingContent,
  streamingIsError = false, toolCalls, thinkingStatus,
  hasSession, onCreateSession, onSendMessage,
  botName = "BeeBot", botEmoji = "🐝", isAdmin = false,
  completedToolSteps = [], currentStep, totalSteps,
  onOpenArtifact, accumulatedThoughts = [],
  hasMoreMessages = false, onLoadEarlierMessages,
  onViewSources, activeSourcesMessageId,
  relayRound = 0, totalRelayRounds = 0, streamStartTime,
  onEditMessage,
  onRetry,
  onRegenerateMessage,
  onDeleteMessage,
  onOpenThread,
  activeThreadMessageId,
  threadReplyCounts,
  isResearching = false,
  subTasks = [],
  autonomousTask,
  autonomousTaskStale = false,
  onOpenSubtaskPanel,
  toolProgressSteps = [],
  taskPlanSteps = [],
  narrationMessages = [],
  reasoningEffort,
  thinkingBlocks = [],
  searchQuery = "",
  mode = "general",
}: ChatMessageListProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const isUserScrolling = useRef(false);

  // Pre-compute filtered messages for stable rendering.
  // Only suppress an empty/duplicate persisted assistant row while a stream
  // for the same content is still active. Keep the window short (700ms) so
  // a freshly committed reply never disappears post-stream.
  const filteredMessages = useMemo(() => {
    return messages.filter((message) => {
      if (!isStreaming) return true;
      if (message.id === "streaming") return true;
      if (message.role !== "assistant") return true;
      const age = Date.now() - new Date(message.created_at).getTime();
      if (age >= 700) return true;
      // Drop empty rows entirely while a stream is in flight.
      if (!message.content || message.content.trim().length === 0) return false;
      // Only treat as duplicate when both buffers carry meaningful content.
      const msgPrefix = (message.content || "").slice(0, 64).trim();
      const streamPrefix = (streamingContent || "").slice(0, 64).trim();
      if (msgPrefix.length >= 12 && streamPrefix.length >= 12 && msgPrefix === streamPrefix) return false;
      return true;
    });
  }, [messages, isStreaming, streamingContent]);

  const isNearBottom = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return true;
    return viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight) < 120;
  }, []);

  const scrollToBottom = useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
    setShowScrollButton(false);
  }, []);

  const scrollThrottleRef = useRef(false);
  const handleScroll = useCallback(() => {
    if (scrollThrottleRef.current) return;
    scrollThrottleRef.current = true;
    requestAnimationFrame(() => {
      if (!isNearBottom()) {
        setShowScrollButton(true);
        isUserScrolling.current = true;
      } else {
        setShowScrollButton(false);
        isUserScrolling.current = false;
      }
      setTimeout(() => { scrollThrottleRef.current = false; }, 100);
    });
  }, [isNearBottom]);

  // Reset auto-scroll when streaming ends
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      isUserScrolling.current = false;
      scrollToBottom();
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, scrollToBottom]);

  // Re-pin to bottom when the on-screen keyboard opens, so the latest message
  // never ends up obscured behind the keyboard. We only do this if the user
  // was already at the bottom (otherwise we'd yank their scroll position).
  const { keyboardHeight } = useKeyboardInset();
  const prevKeyboardOpenRef = useRef(false);
  useEffect(() => {
    const isOpen = keyboardHeight > 0;
    if (isOpen && !prevKeyboardOpenRef.current && !isUserScrolling.current) {
      // Defer to next frame so layout has settled.
      requestAnimationFrame(() => scrollToBottom());
    }
    prevKeyboardOpenRef.current = isOpen;
  }, [keyboardHeight, scrollToBottom]);

  // Auto-scroll only when new message *rows* arrive AND the user hasn't
  // scrolled away. Tool/step counter changes no longer trigger scroll —
  // they update inline and would otherwise yank the viewport mid-read.
  useEffect(() => {
    if (!isUserScrolling.current && filteredMessages.length > 0) {
      scrollToBottom();
    }
  }, [filteredMessages.length, scrollToBottom]);

  // During streaming, keep scrolled to bottom (throttled to max 10/sec)
  const lastScrollLen = useRef(0);
  const lastScrollTimeRef = useRef(0);
  useEffect(() => {
    if (!isStreaming) { lastScrollLen.current = 0; return; }
    const contentLen = streamingContent?.length || 0;
    if (contentLen > lastScrollLen.current) {
      lastScrollLen.current = contentLen;
      const now = Date.now();
      if (now - lastScrollTimeRef.current < 100) return;
      lastScrollTimeRef.current = now;
      if (!isUserScrolling.current) {
        const viewport = viewportRef.current;
        if (viewport) viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [isStreaming, streamingContent]);

  const detectedArtifact = useMemo(() => {
    if (isStreaming) return null;
    const lastAssistant = [...filteredMessages].reverse().find(m => m.role === 'assistant');
    return lastAssistant?.content ? detectArtifact(lastAssistant.content) : null;
  }, [isStreaming, filteredMessages]);

  // Debounce follow-up chip mount on the streaming → idle edge to avoid
  // a ~200ms flash on slow networks when streamingContent flushes one
  // tick before isStreaming flips.
  const [showFollowUps, setShowFollowUps] = useState(false);
  useEffect(() => {
    if (isStreaming) { setShowFollowUps(false); return; }
    const t = setTimeout(() => setShowFollowUps(true), 600);
    return () => clearTimeout(t);
  }, [isStreaming, filteredMessages.length]);

  // ═══ SEARCH HIGHLIGHTING ═══
  // Stable dep key when no query — avoids re-running the DOM walker on
  // every streaming tick. Only re-traverses when search is actually active.
  const trimmedQuery = searchQuery.trim();
  useSearchHighlight(viewportRef, searchQuery, trimmedQuery ? `${filteredMessages.length}|${isStreaming}` : "idle");

  // ═══ VIRTUALIZATION ═══
  // Below threshold, render normally so the existing scroll/auto-scroll/layout
  // behavior is unchanged. Above threshold, use react-virtual to keep DOM
  // node count constant on long chats (1000+ messages).
  // While search is active, fall back to the un-virtualized path so
  // useSearchHighlight + the overlay's match counter see every message
  // (virtualized rows are unmounted off-screen and would silently miss matches).
  const VIRTUALIZE_THRESHOLD = 80;
  const shouldVirtualize = filteredMessages.length >= VIRTUALIZE_THRESHOLD && !searchQuery.trim();

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? filteredMessages.length : 0,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => 220,
    overscan: 8,
    measureElement: (el) => el?.getBoundingClientRect().height ?? 220,
    getItemKey: (index) => filteredMessages[index]?.id ?? index,
  });

  if (isLoading) {
    return (
      <div className="flex-1 p-4 space-y-4">
        {[false, true, false].map((isRight, i) => (
          <div key={i} className={cn("flex gap-3", isRight && "flex-row-reverse")}>
            <Skeleton className="h-8 w-8 rounded-xl shrink-0 bg-muted/30" />
            <Skeleton className={cn("h-16 rounded-2xl bg-muted/20", isRight ? "w-[40%]" : "w-[65%]")} />
          </div>
        ))}
      </div>
    );
  }

  if (!hasSession || messages.length === 0) {
    return (
      <EmptySessionState
        botName={botName}
        botEmoji={botEmoji}
        hasSession={hasSession}
        onCreateSession={onCreateSession}
        onSendMessage={onSendMessage}
        mode={mode}
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-hidden relative">
      <div
        ref={viewportRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-busy={isStreaming}
        aria-label="Chat conversation"
        className="h-full overflow-y-auto overscroll-contain touch-pan-y scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
      >
        <div className="px-2 py-1.5">
          <div className="max-w-3xl mx-auto">
            {hasMoreMessages && onLoadEarlierMessages && (
              <div className="flex justify-center py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onLoadEarlierMessages}
                  className="rounded-full gap-1.5 h-7 px-3 bg-card/40 backdrop-blur-xl border border-border/20 hover:border-primary/30 text-xs text-muted-foreground"
                >
                  <ChevronUp className="h-3 w-3" />
                  Load earlier messages
                </Button>
              </div>
            )}

            

            {/* Message list — virtualized above VIRTUALIZE_THRESHOLD */}
            {shouldVirtualize ? (
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                }}
              >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const message = filteredMessages[virtualItem.index];
                  if (!message) return null;
                  return (
                    <div
                      key={virtualItem.key}
                      data-index={virtualItem.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                      className="py-1"
                    >
                      <MessageErrorBoundary messageId={message.id}>
                        <ChatMessage
                          message={message}
                          onSendMessage={onSendMessage}
                          botEmoji={botEmoji}
                          botName={botName}
                          isAdmin={isAdmin}
                          onViewSources={onViewSources}
                          activeSourcesMessageId={activeSourcesMessageId}
                          onOpenArtifact={onOpenArtifact}
                          onRetry={
                            onRetry
                              ? onRetry
                              : message.is_error && onSendMessage
                                ? () => {
                                    const msgIndex = filteredMessages.findIndex(m => m.id === message.id);
                                    for (let i = msgIndex - 1; i >= 0; i--) {
                                      if (filteredMessages[i].role === 'user' && filteredMessages[i].content) {
                                        onSendMessage(filteredMessages[i].content);
                                        return;
                                      }
                                    }
                                  }
                                : undefined
                          }
                          onEditMessage={message.role === 'user' ? onEditMessage : undefined}
                          onRegenerateMessage={message.role === 'assistant' ? onRegenerateMessage : undefined}
                          onDeleteMessage={onDeleteMessage}
                          onOpenThread={message.role === 'assistant' ? onOpenThread : undefined}
                          activeThreadMessageId={activeThreadMessageId}
                          threadReplyCount={message.role === 'assistant' ? threadReplyCounts?.[message.id] : undefined}
                        />
                      </MessageErrorBoundary>
                    </div>
                  );
                })}
              </div>
            ) : (
              filteredMessages.map((message) => (
                <div key={message.id} className="py-1">
                  <MessageErrorBoundary messageId={message.id}>
                    <ChatMessage
                      message={message}
                      onSendMessage={onSendMessage}
                      botEmoji={botEmoji}
                          botName={botName}
                      isAdmin={isAdmin}
                      onViewSources={onViewSources}
                      activeSourcesMessageId={activeSourcesMessageId}
                      onOpenArtifact={onOpenArtifact}
                      onRetry={
                        onRetry
                          ? onRetry
                          : message.is_error && onSendMessage
                            ? () => {
                                const msgIndex = filteredMessages.findIndex(m => m.id === message.id);
                                for (let i = msgIndex - 1; i >= 0; i--) {
                                  if (filteredMessages[i].role === 'user' && filteredMessages[i].content) {
                                    onSendMessage(filteredMessages[i].content);
                                    return;
                                  }
                                }
                              }
                            : undefined
                      }
                      onEditMessage={message.role === 'user' ? onEditMessage : undefined}
                      onRegenerateMessage={message.role === 'assistant' ? onRegenerateMessage : undefined}
                      onDeleteMessage={onDeleteMessage}
                      onOpenThread={message.role === 'assistant' ? onOpenThread : undefined}
                      activeThreadMessageId={activeThreadMessageId}
                      threadReplyCount={message.role === 'assistant' ? threadReplyCounts?.[message.id] : undefined}
                    />
                  </MessageErrorBoundary>
                </div>
              ))
            )}

            <AnimatePresence>
              {isStreaming && (
                <StreamingOverlay
                  isStreaming={isStreaming}
                  streamingContent={streamingContent}
                  streamingIsError={streamingIsError}
                  toolCalls={toolCalls}
                  thinkingStatus={thinkingStatus}
                  completedToolSteps={completedToolSteps}
                  currentStep={currentStep}
                  totalSteps={totalSteps}
                  accumulatedThoughts={accumulatedThoughts}
                  botEmoji={botEmoji}
                  isAdmin={isAdmin}
                  relayRound={relayRound}
                  totalRelayRounds={totalRelayRounds}
                  streamStartTime={streamStartTime}
                  isResearching={isResearching}
                  subTasks={subTasks}
                  toolProgressSteps={toolProgressSteps}
                  taskPlanSteps={taskPlanSteps}
                  narrationMessages={narrationMessages}
                  onOpenDetails={() => onOpenSubtaskPanel?.("__streaming__")}
                  reasoningEffort={reasoningEffort}
                  thinkingBlocks={thinkingBlocks}
                />
              )}
            </AnimatePresence>

            {/* Autonomous Task — compact inline status. Suppress when the
                streaming overlay's focal point is already showing this task
                to prevent duplicated UI within ~80px on mobile. */}
            <AnimatePresence>
              {autonomousTask && !isStreaming && (
                <InlineAutonomousStatus
                  task={autonomousTask}
                  onClick={() => onOpenSubtaskPanel?.(autonomousTask.id)}
                />
              )}
            </AnimatePresence>

            {detectedArtifact && onOpenArtifact && (
              <ArtifactCard artifact={detectedArtifact} onClick={() => onOpenArtifact(detectedArtifact)} />
            )}


            <div ref={bottomRef} className="h-2" />
          </div>
        </div>
      </div>

      {showScrollButton && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="absolute left-1/2 -translate-x-1/2 bottom-3 z-10"
        >
          <Button
            size="sm"
            variant="secondary"
            onClick={() => { isUserScrolling.current = false; scrollToBottom(); }}
            aria-label={isStreaming ? "Resume auto-scroll to follow live response" : "Scroll to most recent message"}
            className={cn(
              "rounded-full gap-1.5 h-8 px-3 bg-card/80 backdrop-blur-xl border shadow-lg",
              isStreaming
                ? "border-primary/40 hover:border-primary/60 ring-1 ring-primary/20"
                : "border-border/40 hover:border-primary/30",
            )}
          >
            {isStreaming && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
              </span>
            )}
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="text-xs">{isStreaming ? "New tokens" : "New messages"}</span>
          </Button>
        </motion.div>
      )}
    </div>
  );
});

