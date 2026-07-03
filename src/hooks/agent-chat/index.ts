// ═══ Project Titan: Module 5 - Orchestrator ═══
// Composes sub-hooks, manages shared state, and exposes the public API.

import { useState, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Artifact, ThinkingStep, ThinkingBlock, CompletedToolStep, CreditsExhaustedError, ToolCallState, TelemetryData, SubTask } from "./types";
import type { ToolProgressStep } from "@/components/agent-chat/streaming/ExecutionTimeline";
import type { TaskPlanStep } from "@/components/agent-chat/streaming/TaskDecompositionCard";
import { useSessionManager, type SessionManagerOptions } from "./useSessionManager";
import { useMessageManager } from "./useMessageManager";
import { useStreamProcessor } from "./useStreamProcessor";
import { useAutonomousTask } from "./useAutonomousTask";
import { useMultiTabSync } from "./useMultiTabSync";
import { useRepositories } from "@/repositories/runtime/RepositoryProvider";
import type { RepositorySubscription } from "@/repositories/contracts/conversation";


// Re-export types for consumers
export type {
  MessageAttachment, ThinkingStep, ThinkingBlock, AgentChatMessage, AgentChatSession,
  CreditsExhaustedError, CompletedToolStep, Artifact, ToolCallState, TelemetryData
} from "./types";

export interface UseAgentChatOptions extends SessionManagerOptions {}

export function useAgentChat(userId: string, options: UseAgentChatOptions = {}) {
  const queryClient = useQueryClient();
  const { conversations } = useRepositories();

  // ═══ Shared UI State ═══
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingIsError, setStreamingIsError] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCallState[]>([]);
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);
  const [creditsExhaustedError, setCreditsExhaustedError] = useState<CreditsExhaustedError | null>(null);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [completedToolSteps, setCompletedToolSteps] = useState<CompletedToolStep[]>([]);
  const [currentStep, setCurrentStep] = useState<number | undefined>(undefined);
  const [totalSteps, setTotalSteps] = useState<number | undefined>(undefined);
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  const [artifactPanelOpen, setArtifactPanelOpen] = useState(false);
  const [accumulatedThoughts, setAccumulatedThoughts] = useState<ThinkingStep[]>([]);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [lastTokenUsage, setLastTokenUsage] = useState<{ input: number; output: number } | null>(null);
  const [streamStartTime, setStreamStartTime] = useState<number | null>(null);
  const [totalTokens, setTotalTokens] = useState<{ input: number; output: number }>({ input: 0, output: 0 });
  const [toolExecutionCount, setToolExecutionCount] = useState(0);
  const [relayRound, setRelayRound] = useState(0);
  const [totalRelayRounds, setTotalRelayRounds] = useState(0);
  const [isResearching, setIsResearching] = useState(false);
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [toolProgressSteps, setToolProgressSteps] = useState<ToolProgressStep[]>([]);
  const [taskPlanSteps, setTaskPlanSteps] = useState<TaskPlanStep[]>([]);
  const [narrationMessages, setNarrationMessages] = useState<{ id: string; text: string; timestamp: number }[]>([]);
  const [reasoningEffort, setReasoningEffort] = useState<string | null>(null);
  const [reasoningModel, setReasoningModel] = useState<string | null>(null);
  const [thinkingBlocks, setThinkingBlocks] = useState<ThinkingBlock[]>([]);
  const [critiqueState, setCritiqueState] = useState<import("./types").CritiqueState>({ status: "idle", changed: false, issues: [] });
  // ═══ Refs ═══
  const receivedToolCallsRef = useRef(false);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const manualCancelRef = useRef(false);
  const channelRef = useRef<RepositorySubscription | null>(null);
  const isStreamingRef = useRef(false);




  // ═══ Sub-hooks ═══
  const {
    sessions, activeSessionId, setActiveSessionId,
    isLoadingSessions, refetchSessions,
    createSession, isCreatingSession,
    deleteSession, renameSession, updateSessionInstructions,
  } = useSessionManager(userId, options);

  const {
    mergedMessages, isLoadingMessages, refetchMessages,
    hasMoreMessages, loadEarlierMessages,
    setOptimisticMessages,
  } = useMessageManager(activeSessionId);

  const { sendMessage, cancelStreaming, retryLastMessage, emptyRetryTimerRef } = useStreamProcessor({

    userId, activeSessionId, sessionKind: options.kind ?? "partner", isStreaming,
    setIsStreaming, setStreamingContent, setStreamingIsError,
    setToolCalls, setThinkingStatus, setCurrentStep, setTotalSteps,
    setAccumulatedThoughts, setCompletedToolSteps,
    setCreditsExhaustedError, setRateLimitedUntil, setOptimisticMessages,
    setLastLatencyMs, setLastTokenUsage, setStreamStartTime,
    setTotalTokens, setToolExecutionCount,
    setIsResearching, setSubTasks,
    setRelayRound, setTotalRelayRounds,
    setActiveJobId,
    setToolProgressSteps,
    setTaskPlanSteps,
    setNarrationMessages,
    setReasoningEffort,
    setReasoningModel,
    setThinkingBlocks,
    setCritiqueState,
    abortControllerRef, manualCancelRef, isStreamingRef,
    receivedToolCallsRef, staleTimerRef,
    refetchMessages, refetchSessions,
  });

  // ═══ Autonomous Task Hook — uses forceTaskId from SSE handoff ═══
  const clearActiveJobId = useCallback(() => setActiveJobId(null), []);
  const autonomousTask = useAutonomousTask(activeSessionId, activeJobId, clearActiveJobId);

  const telemetry: TelemetryData = {
    lastLatencyMs, lastTokenUsage, streamStartTime, totalTokens, toolExecutionCount,
    relayRound,
    totalRelayRounds,
    reasoningEffort,
    reasoningModel,
    platform: (navigator as any).userAgentData?.platform || navigator.platform || 'unknown',
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    onlineStatus: navigator.onLine,
    connectionType: (navigator as any).connection?.effectiveType || 'unknown',
  };

  // ═══ Multi-Tab Sync via BroadcastChannel ═══
  useMultiTabSync(activeSessionId, isStreamingRef, queryClient);

  // ═══ Realtime subscription for message INSERTs ═══
  useEffect(() => {
    if (!activeSessionId) {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      return;
    }

    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }

    const subscription = conversations.subscribeToSessionMessages(activeSessionId, () => {
      if (!isStreamingRef.current) {
        setTimeout(() => {
          if (!isStreamingRef.current) {
            queryClient.invalidateQueries({ queryKey: ["agent-messages", activeSessionId] });
          }
        }, 100);
      }
    });

    channelRef.current = subscription;

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [activeSessionId, queryClient, conversations]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (staleTimerRef.current) {
        clearTimeout(staleTimerRef.current);
        staleTimerRef.current = null;
      }
      if (emptyRetryTimerRef.current) {
        clearTimeout(emptyRetryTimerRef.current);
        emptyRetryTimerRef.current = null;
      }
    };
  }, []);

  // Clear state on session change
  useEffect(() => {
    setCompletedToolSteps([]);
    setAccumulatedThoughts([]);
    setLastLatencyMs(null);
    setLastTokenUsage(null);
    setStreamStartTime(null);
    setActiveArtifact(null);
    setArtifactPanelOpen(false);
    setRelayRound(0);
    setTotalRelayRounds(0);
    setTotalTokens({ input: 0, output: 0 });
    setToolExecutionCount(0);
    setIsResearching(false);
    setSubTasks([]);
    setActiveJobId(null);
    setToolProgressSteps([]);
    setTaskPlanSteps([]);
    setNarrationMessages([]);
    setThinkingBlocks([]);
    setCritiqueState({ status: "idle", changed: false, issues: [] });
  }, [activeSessionId]);

  // ═══ Callbacks ═══
  const clearCreditsExhaustedError = useCallback(() => {
    setCreditsExhaustedError(null);
  }, []);

  const openArtifact = useCallback((artifact: Artifact) => {
    setActiveArtifact(prev => {
      if (prev && prev.title === artifact.title) {
        // Same content = no change (prevents version bump on re-click)
        if (prev.content === artifact.content) return prev;
        // Content changed = real update with version bump
        return { ...artifact, version: (prev.version || 1) + 1 };
      }
      return { ...artifact, version: 1 };
    });
    setArtifactPanelOpen(true);
  }, []);

  const closeArtifactPanel = useCallback(() => {
    setArtifactPanelOpen(false);
  }, []);

  // ═══ Public API (matches original exactly) ═══
  return {
    sessions,
    messages: mergedMessages,
    activeSessionId,
    setActiveSessionId,
    isLoadingSessions,
    isLoadingMessages,
    isStreaming,
    streamingContent,
    streamingIsError,
    toolCalls,
    thinkingStatus,
    creditsExhaustedError,
    clearCreditsExhaustedError,
    rateLimitedUntil,
    completedToolSteps,
    currentStep,
    totalSteps,
    accumulatedThoughts,
    activeArtifact,
    artifactPanelOpen,
    openArtifact,
    closeArtifactPanel,
    createSession,
    isCreatingSession,
    deleteSession,
    renameSession,
    updateSessionInstructions,
    sendMessage,
    retryLastMessage,
    cancelStreaming,
    refetchSessions,
    refetchMessages,
    hasMoreMessages,
    loadEarlierMessages,
    telemetry,
    relayRound,
    totalRelayRounds,
    streamStartTime,
    isResearching,
    subTasks,
    activeJobId,
    setActiveJobId,
    autonomousTask,
    toolProgressSteps,
    taskPlanSteps,
    narrationMessages,
    thinkingBlocks,
    critiqueState,
  };
}
