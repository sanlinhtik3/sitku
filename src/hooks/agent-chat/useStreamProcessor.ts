// ═══ Project Titan: Module 4 - Stream Processor (Refactored) ═══
// Orchestrates SSE streaming, image upload, relay continuation, error recovery.
// Event parsing delegated to useSSEParser.ts, tool finalization to useToolCallTracker.ts.

import React, { useCallback, useRef } from "react";
import { toast } from "sonner";
import { formatLocalDateTime } from "@/lib/dateUtils";
import { getDeviceTimeSnapshot } from "@/lib/deviceTime";
import type {
  AgentChatMessage,
  CreditsExhaustedError,
  ThinkingStep,
  CompletedToolStep,
  ToolCallState,
  SubTask,
} from "./types";

import { finalizeToolCalls } from "./useToolCallTracker";
import {
  handleSSEEvent,
  createVisualDripState,
  createDripController,
  resetPendingThoughts,
  createSSEBatchState,
  type SSEEventHandlers,
  type SSEBatchState,
} from "./useSSEParser";
import { uploadImageAttachments, type StorageAttachment } from "./useImageUpload";
import { useRepositories } from "@/repositories/runtime/RepositoryProvider";
import type { AgentRuntimeStreamResponse } from "@/repositories/contracts/agentRuntime";

export interface StreamProcessorConfig {
  userId: string;
  activeSessionId: string | null;
  /** Session kind for backend routing/isolation. Defaults to "partner". */
  sessionKind?: string;
  isStreaming: boolean;
  setIsStreaming: (v: boolean) => void;
  setStreamingContent: (v: string) => void;
  setStreamingIsError: (v: boolean) => void;
  setToolCalls: React.Dispatch<React.SetStateAction<ToolCallState[]>>;
  setThinkingStatus: (v: string | null) => void;
  setCurrentStep: (v: number | undefined) => void;
  setTotalSteps: (v: number | undefined) => void;
  setAccumulatedThoughts: React.Dispatch<React.SetStateAction<ThinkingStep[]>>;
  setCompletedToolSteps: React.Dispatch<React.SetStateAction<CompletedToolStep[]>>;
  setCreditsExhaustedError: (v: CreditsExhaustedError | null) => void;
  setRateLimitedUntil: (v: number | null) => void;
  setOptimisticMessages: React.Dispatch<React.SetStateAction<AgentChatMessage[]>>;
  setLastLatencyMs: (v: number | null) => void;
  setLastTokenUsage: (v: { input: number; output: number } | null) => void;
  setStreamStartTime: (v: number | null) => void;
  setTotalTokens: React.Dispatch<React.SetStateAction<{ input: number; output: number }>>;
  setToolExecutionCount: React.Dispatch<React.SetStateAction<number>>;
  setIsResearching: (v: boolean) => void;
  setSubTasks: React.Dispatch<React.SetStateAction<SubTask[]>>;
  setRelayRound?: (v: number) => void;
  setTotalRelayRounds?: (v: number) => void;
  setActiveJobId?: (v: string | null) => void;
  setToolProgressSteps?: React.Dispatch<React.SetStateAction<import("@/components/agent-chat/streaming/ExecutionTimeline").ToolProgressStep[]>>;
  setTaskPlanSteps?: React.Dispatch<React.SetStateAction<import("@/components/agent-chat/streaming/TaskDecompositionCard").TaskPlanStep[]>>;
  setNarrationMessages?: React.Dispatch<React.SetStateAction<{ id: string; text: string; timestamp: number }[]>>;
  setReasoningEffort?: (v: string | null) => void;
  setReasoningModel?: (v: string | null) => void;
  /** Optional: surface Anthropic native extended thinking blocks */
  setThinkingBlocks?: React.Dispatch<React.SetStateAction<import("./types").ThinkingBlock[]>>;
  /** Optional: live self-critique transparency state */
  setCritiqueState?: React.Dispatch<React.SetStateAction<import("./types").CritiqueState>>;

  abortControllerRef: React.MutableRefObject<AbortController | null>;
  manualCancelRef: React.MutableRefObject<boolean>;
  isStreamingRef: React.MutableRefObject<boolean>;
  receivedToolCallsRef: React.MutableRefObject<boolean>;
  staleTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  refetchMessages: () => Promise<unknown>;
  refetchSessions: () => Promise<unknown>;
  
}

export function useStreamProcessor(config: StreamProcessorConfig) {
  const { conversations, agentRuntime } = useRepositories();
  const {
    userId, activeSessionId, sessionKind = "partner", isStreaming,
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
  } = config;

  const emptyStreamRetriedRef = useRef(false);
  const autonomousTriggeredRef = useRef(false);
  const thoughtCounterRef = useRef(0);
  const emptyRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preflightTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const receivedAnySSERef = useRef(false); // Tracks any non-heartbeat SSE activity to prevent EMPTY STREAM false positives
  const [lastUserPayload, setLastUserPayload] = React.useState<{ content: string; isAdmin: boolean; attachments?: any[] } | null>(null);

  const batchStateRef = useRef<SSEBatchState>(createSSEBatchState());
  // Atomic in-flight lock: state reads in callback closures can be stale; refs are not.
  // Prevents double-fire of sendMessage from a fast double-click or accidental keypress.
  const sendInFlightRef = useRef(false);
  // Set when the hard-ceiling watchdog fires its abort. Lets the AbortError
  // catch branch differentiate "client gave up after 10 min" from a real
  // network drop, so we can show a non-misleading toast.
  const hardCeilingFiredRef = useRef(false);
  // Forward ref to retryLastMessage so finally-block toast actions can call it
  // before the const is initialized (avoids TDZ with useCallback ordering).
  const retryLastMessageRef = useRef<(() => void) | null>(null);
  // Resumable SSE: track last event_id and mission_id for Last-Event-ID reconnect
  const lastEventIdRef = useRef<number>(0);
  const lastMissionIdRef = useRef<string | null>(null);

  const sendMessage = useCallback(
    async (
      content: string,
      isAdmin: boolean = false,
      attachments?: { type: 'image' | 'file'; base64: string; mime_type: string; file_name: string }[],
      isRetry: boolean = false,
    ) => {
      if (!activeSessionId) return;
      // Atomic guard: ref check beats stale state read, blocks rapid double-send.
      if (sendInFlightRef.current || isStreamingRef.current) return;
      sendInFlightRef.current = true;

      // ═══ INSTANT FEEDBACK ═══
      setIsStreaming(true);
      setLastUserPayload({ content, isAdmin, attachments });

      isStreamingRef.current = true;
      receivedAnySSERef.current = false; // Reset SSE activity tracker for this request

      const trimmedContent = content.trim();

      // ═══ SMART PREFLIGHT ACKNOWLEDGMENT ═══
      // Immediately show intelligent Myanmar status before backend responds
      const preflight = classifyMessageForPreflight(trimmedContent);
      setThinkingStatus(preflight.initial);

      // Phase cycling — progressive updates while waiting for backend
      if (preflightTimerRef.current) clearInterval(preflightTimerRef.current);
      let phaseIdx = 0;
      preflightTimerRef.current = setInterval(() => {
        if (phaseIdx < preflight.phases.length && isStreamingRef.current) {
          setThinkingStatus(preflight.phases[phaseIdx]);
          phaseIdx++;
        } else if (preflightTimerRef.current) {
          clearInterval(preflightTimerRef.current);
          preflightTimerRef.current = null;
        }
      }, 2500);
      if (trimmedContent.length === 0 && (!attachments || attachments.length === 0)) {
        setIsStreaming(false);
        isStreamingRef.current = false;
        sendInFlightRef.current = false;
        setThinkingStatus(null);
        toast.error("Please enter a message");
        return;
      }
      if (!isAdmin && trimmedContent.length > 100000) {
        setIsStreaming(false);
        isStreamingRef.current = false;
        sendInFlightRef.current = false;
        setThinkingStatus(null);
        toast.error("Message too long. Maximum 100,000 characters.");
        return;
      }
      if (isAdmin && trimmedContent.length > 800000) {
        setIsStreaming(false);
        isStreamingRef.current = false;
        sendInFlightRef.current = false;
        setThinkingStatus(null);
        toast.error("Message too long. Maximum 800,000 characters (admin).");
        return;
      }

      setStreamingContent("");
      setStreamingIsError(false);
      setToolCalls([]);
      setAccumulatedThoughts([]);
      setSubTasks([]);
      setToolProgressSteps?.([]);
      setTaskPlanSteps?.([]);
      setNarrationMessages?.([]);
      setReasoningEffort?.(null);
      setReasoningModel?.(null);
      setIsResearching(false);
      setLastLatencyMs(null);
      setLastTokenUsage(null);
      setStreamStartTime(Date.now());
      receivedToolCallsRef.current = false;
      if (staleTimerRef.current) { clearTimeout(staleTimerRef.current); staleTimerRef.current = null; }
      abortControllerRef.current = new AbortController();
      manualCancelRef.current = false;

      // ═══ PHASE C: Clear stale activeJobId at send start ═══
      setActiveJobId?.(null);

      // ═══ STORAGE UPLOAD ═══
      let storageAttachments: StorageAttachment[] = [];
      if (attachments?.length) {
        storageAttachments = await uploadImageAttachments(attachments, userId, activeSessionId);
      }

      // ═══ OPTIMISTIC UI (skip on retry — message already visible) ═══
      if (!isRetry) {
        const optimisticMsg: AgentChatMessage = {
          id: `optimistic_${Date.now()}`,
          session_id: activeSessionId,
          user_id: userId,
          role: "user",
          content: trimmedContent || (attachments?.length ? "[Attachment]" : ""),
          attachments: storageAttachments.length > 0
            ? storageAttachments
            : attachments?.map(att => ({
                type: att.type as 'image' | 'file',
                mime_type: att.mime_type,
                file_name: att.file_name,
                size_bytes: Math.ceil((att.base64.length * 3) / 4),
                base64: att.base64,
              })) || null,
          is_error: false,
          created_at: new Date().toISOString(),
        };
        setOptimisticMessages(prev => [...prev, optimisticMsg]);
      }

      const contentRef = { current: "" };
      emptyStreamRetriedRef.current = false;
      autonomousTriggeredRef.current = false;
      let streamingIsError = false;
      let pendingContinuation: { context_snapshot: string; relay_round: number } | null = null;
      const MAX_RELAY_ROUNDS = 10;
      const MAX_RELAY_TOTAL_MS = 600_000;
      const relayStartTime = Date.now();

      // Hard ceiling: independent of activity-based inactivity timer.
      // Inactivity timer resets on every chunk so a busy-but-misbehaving stream
      // (e.g. infinite tool loop) could exceed the 10-min budget. This forces an abort.
      hardCeilingFiredRef.current = false;
      const hardCeilingTimerId: ReturnType<typeof setTimeout> = setTimeout(() => {
        console.warn("[AgentChat] Hard ceiling reached — aborting stream");
        hardCeilingFiredRef.current = true;
        try { abortControllerRef.current?.abort(); } catch (_) { /* noop */ }
      }, MAX_RELAY_TOTAL_MS);

      // ═══ Visual Drip Setup ═══
      const dripState = createVisualDripState();
      const { startThrottle, stopThrottle } = createDripController(dripState, setStreamingContent);

      // ═══ Shared SSE Event Handlers ═══
      // Wrapped setThinkingStatus: clears preflight timer when real backend status arrives
      const wrappedSetThinkingStatus = (v: string | null) => {
        if (preflightTimerRef.current) {
          clearInterval(preflightTimerRef.current);
          preflightTimerRef.current = null;
        }
        setThinkingStatus(v);
      };

      const makeHandlers = (idPrefix: string): SSEEventHandlers => {
        resetPendingThoughts(batchStateRef.current);
        return {
          setThinkingStatus: wrappedSetThinkingStatus, setCurrentStep, setTotalSteps,
          setAccumulatedThoughts, setToolCalls, setCompletedToolSteps,
          setStreamingContent, setStreamingIsError, setRateLimitedUntil,
          setToolExecutionCount, setLastTokenUsage, setTotalTokens, setLastLatencyMs,
          setIsResearching, setSubTasks,
          receivedToolCallsRef, thoughtCounterRef,
          contentRef,
          pendingContentRef: dripState.pendingContentRef,
          dripState,
          startThrottle,
          resetDripVisualLength: () => {
            dripState.visualLength = 0;
            dripState.boundaryCache = [0];
            dripState.cachedTextLen = 0;
          },
          onContinuation: (data) => { pendingContinuation = data; },
          // Phase 2 continuity: pre-fetch UI signal so the user never sees a blank gap
          onRelayHandover: (data) => {
            try {
              setRelayRound?.(data.next_round);
              setTotalRelayRounds?.(data.max_rounds);
              setThinkingStatus(`🔄 Continuing analysis... (round ${data.next_round}/${data.max_rounds})`);
            } catch (_) { /* noop */ }
          },
          onStreamError: () => { streamingIsError = true; },
          onAutonomousStarted: (taskId) => { autonomousTriggeredRef.current = true; setActiveJobId?.(taskId); },
          onToolProgress: (step) => {
            setToolProgressSteps?.(prev => {
              // Mark any previous running step as done
              const updated = prev.map(s => s.status === "running" ? { ...s, status: "done" as const, completedAt: Date.now() } : s);
              return [...updated, { id: step.stepId || `tp_${Date.now()}_${step.tool}`, tool: step.tool, emoji: step.emoji, label: step.label, status: "running" as const, startedAt: Date.now() }];
            });
          },
          onTaskPlan: (steps) => { setTaskPlanSteps?.(steps as import("@/components/agent-chat/streaming/TaskDecompositionCard").TaskPlanStep[]); },
          onToolContextUpdate: (toolName, context) => {
            // Patch the first running toolProgressStep matching this tool with context
            setToolProgressSteps?.(prev =>
              prev.map((s, i) => {
                if (s.tool === toolName && s.status === "running" && !s.context) {
                  return { ...s, context };
                }
                return s;
              })
            );
            // Also patch taskPlanSteps — find first matching pending/running step
            setTaskPlanSteps?.(prev => {
              let found = false;
              return prev.map(s => {
                if (!found && s.tool === toolName && !s.context) {
                  found = true;
                  return { ...s, context };
                }
                return s;
              });
            });
          },
          onPipelineNarration: (msg) => {
            setNarrationMessages?.(prev => {
              const idx = prev.findIndex(m => m.id === msg.id);
              if (idx !== -1) {
                const updated = [...prev];
                updated[idx] = { ...msg, timestamp: msg.timestamp || Date.now() };
                return updated;
              }
              return [...prev.slice(-19), msg];
            });
          },
          onReasoningInfo: (info) => {
            setReasoningEffort?.(info.effort);
            setReasoningModel?.(info.model);
          },
          onThinkingBlockEvent: (event) => {
            if (!setThinkingBlocks) return;
            const { phase, index, step: blockStep, text, chars } = event as any;
            if (phase === 'start') {
              setThinkingBlocks(prev => {
                if (prev.find(b => b.index === index)) return prev;
                return [...prev, { index, step: blockStep, text: '', startedAt: Date.now(), complete: false }];
              });
            } else if (phase === 'delta' && text) {
              setThinkingBlocks(prev => prev.map(b =>
                b.index === index ? { ...b, text: b.text + text } : b
              ));
            } else if (phase === 'stop') {
              setThinkingBlocks(prev => prev.map(b =>
                b.index === index ? { ...b, complete: true, completedAt: Date.now() } : b
              ));
            }
          },
          onCritiqueEvent: (event) => {
            if (!setCritiqueState) return;
            if (event.phase === "started") {
              setCritiqueState({ status: "auditing", changed: false, issues: [], startedAt: Date.now() });
            } else if (event.phase === "revising") {
              setCritiqueState(prev => ({ ...prev, status: "revising", issues: event.issues || [] }));
            } else if (event.phase === "done") {
              setCritiqueState(prev => ({ ...prev, status: "done", changed: !!event.changed }));
            }
          },
          onMissionId: (missionId: string) => {
            lastMissionIdRef.current = missionId;
          },
          onEventId: (eventId: number) => {
            if (eventId > lastEventIdRef.current) lastEventIdRef.current = eventId;
          },
          idPrefix,
        };
      };




      let clientTimeoutId: ReturnType<typeof setTimeout> | null = null;
      let heartbeatWatchdog: ReturnType<typeof setInterval> | null = null;
      let lastHeartbeatAt = Date.now();
      const HEARTBEAT_WATCHDOG_INTERVAL_MS = 3_000;
      const HEARTBEAT_STALE_THRESHOLD_MS = 45_000; // toast only if truly silent (>45s) — pre-think + critique can pause heartbeats
      try {
        const attachmentsMeta = storageAttachments.length > 0
          ? storageAttachments
          : attachments?.map(att => ({
              type: att.type,
              mime_type: att.mime_type,
              file_name: att.file_name,
              size_bytes: Math.ceil((att.base64.length * 3) / 4),
            }));

        // ═══ PRE-CONDITION GATE: Message must be saved before SSE fetch begins ═══
        // On retry, user message already exists in DB — skip insert to prevent duplicates.
        if (!isRetry) {
          const msgInsertPayload = {
            sessionId: activeSessionId,
            userId,
            role: "user" as const,
            content: trimmedContent || (attachments?.length ? "[Attachment]" : ""),
            attachments: (attachmentsMeta || null) as any,
          };

          const MAX_INSERT_RETRIES = 3;
          let insertSuccess = false;
          for (let attempt = 1; attempt <= MAX_INSERT_RETRIES; attempt++) {
            try {
              await conversations.createMessage(msgInsertPayload);
              insertSuccess = true;
              break;
            } catch (error: any) {
              console.warn(`[AgentChat] Message insert attempt ${attempt}/${MAX_INSERT_RETRIES} failed:`, error?.message || error);
              if (attempt < MAX_INSERT_RETRIES) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
              }
            }
          }

          if (!insertSuccess) {
            console.error("[AgentChat] Message insert failed after all retries — aborting send.");
            toast.error("Message could not be saved. Please try again.");
            setIsStreaming(false);
            isStreamingRef.current = false;
            sendInFlightRef.current = false;
            setThinkingStatus(null);
            return;
          }
        }

        // ═══ Device-Time Sovereignty: half-hour-corrected IANA + drift anchor ═══
        // Funnels every chat call through getDeviceTimeSnapshot() so the agent
        // always sees the user's TRUE local zone — even on Yangon (UTC+6:30),
        // Kolkata (UTC+5:30), Kathmandu (UTC+5:45) where browsers misreport.
        const tzSnap = getDeviceTimeSnapshot();
        const deviceContext = {
          timezone: tzSnap.timezone,                    // half-hour corrected IANA
          locale: tzSnap.locale,
          currentTime: tzSnap.nowLocal,
          timezoneOffset: tzSnap.offsetMinutes,
          timezoneCorrected: tzSnap.corrected,          // true if Intl was overridden
          timezoneOffsetLabel: tzSnap.offsetLabel,      // "UTC+6:30"
          deviceNowIso: tzSnap.nowIso,                  // server uses for drift detect
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
          userAgent: navigator.userAgent,
          platform: (navigator as any).userAgentData?.platform || navigator.platform || 'unknown',
          onlineStatus: navigator.onLine,
          connectionType: (navigator as any).connection?.effectiveType || 'unknown',
        };

        // ═══ DISTRIBUTED TRACE ID: Links frontend → SSE → backend → DB for debugging ═══
        const traceId = crypto.randomUUID();
        // ═══ Idempotency: stable per-send UUID. Server dedupes within 60s. ═══
        // Prevents double-charge when a transient network blip causes the
        // built-in fetch retry loop to re-send a request the server already
        // accepted. Survives across the loop's retries because we generate
        // it once per sendMessage() call.
        const clientRequestId = crypto.randomUUID();
        console.log(`[Trace] Request traceId: ${traceId}`);

        const preferredModel = localStorage.getItem('apex_preferred_model') || null;
        // Activity-based timeout: resets on every SSE event received.
        // 240s gives deep research + extended thinking runs enough headroom.
        const INACTIVITY_TIMEOUT_MS = 240_000; // 4 minutes of silence = dead connection
        const resetInactivityTimer = () => {
          if (clientTimeoutId) clearTimeout(clientTimeoutId);
          clientTimeoutId = setTimeout(() => { abortControllerRef.current?.abort(); }, INACTIVITY_TIMEOUT_MS);
        };
        resetInactivityTimer();

        const MAX_FETCH_RETRIES = 3;
        // Exponential backoff: 2s, 4s, 8s ±20% jitter
        const fetchRetryDelay = (attempt: number) => {
          const base = 2000 * Math.pow(2, attempt - 1);
          const jitter = base * 0.2 * (Math.random() * 2 - 1);
          return Math.round(base + jitter);
        };
        let fetchAttempt = 0;
        let response: AgentRuntimeStreamResponse;

        // Reset resumable-stream cursors on fresh send (not retry)
        lastEventIdRef.current = 0;
        lastMissionIdRef.current = null;

        const buildStartStreamInput = () => ({
            sessionId: activeSessionId,
            userId,
            sessionKind,
            message: trimmedContent,
            attachments: attachments,
            deviceContext,
            preferredModel,
            apiSourcePreference: localStorage.getItem('beebot-api-source') || 'personal',
            traceId,
            clientRequestId,
            resumeMissionId: lastMissionIdRef.current,
            resumeLastEventId: lastEventIdRef.current,
            signal: abortControllerRef.current!.signal,
        });

        while (true) {
          try {
            response = await agentRuntime.startStream(buildStartStreamInput());
            break;
          } catch (fetchError: unknown) {
            fetchAttempt++;
            const fe = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
            if (fe.name === "AbortError") throw fe;
            if (fetchAttempt > MAX_FETCH_RETRIES) throw fe;
            const delay = fetchRetryDelay(fetchAttempt);
            setThinkingStatus(`Reconnecting... (${fetchAttempt}/${MAX_FETCH_RETRIES})`);
            await new Promise(r => setTimeout(r, delay));
          }
        }

        // Handle 202 QUEUED
        if (response.status === 202) {
          const queuedData = await response.json<Record<string, any>>().catch(() => ({} as Record<string, any>));
          if (queuedData.code === 'QUEUED') {
            toast.info("Message queued — BeeBot will process it next 🐝", { duration: 4000 });
            setIsStreaming(false);
            isStreamingRef.current = false;
            sendInFlightRef.current = false;
            setThinkingStatus(null);
            return;
          }
        }

        if (!response.ok) {
          const errorData = await response.json<Record<string, any>>().catch(() => ({} as Record<string, any>));

          if (response.status === 429 && (errorData.code === 'DAILY_LIMIT_REACHED' || errorData.code === 'INSUFFICIENT_RESOURCES')) {
            setCreditsExhaustedError({
              type: errorData.code === 'INSUFFICIENT_RESOURCES' ? 'credits_exhausted' : 'daily_limit',
              dailyLimit: errorData.daily_limit || 3,
              creditBalance: errorData.credit_balance || 0,
              creditsRemaining: errorData.credits_remaining || 0,
              resetsAt: errorData.resets_at || '',
              isPro: errorData.is_pro || false,
              hasPersonalKey: errorData.has_personal_key || false,
            });
            const errorMessage = errorData.code === 'INSUFFICIENT_RESOURCES'
              ? "All credits exhausted. Please purchase more credits or wait until tomorrow."
              : "Daily limit reached. Please try again tomorrow or upgrade to Pro.";
            throw new Error(errorMessage);
          }
          if (response.status === 429 && errorData.code === 'SESSION_BUSY') {
            // Increased from 2 retries / 2s delay (4s total) to 5 retries with exponential backoff
            // (2s + 3s + 4s + 5s + 6s = 20s total) to handle cold-start scenarios.
            const maxBusyRetries = 5;
            for (let busyRetry = 1; busyRetry <= maxBusyRetries; busyRetry++) {
              const busyRetryDelay = 1000 + busyRetry * 1000; // 2s, 3s, 4s, 5s, 6s
              console.log(`[SESSION_BUSY] Retry ${busyRetry}/${maxBusyRetries} in ${busyRetryDelay/1000}s...`);
              // Show user-visible status during busy wait
              setThinkingStatus(`BeeBot is finishing another task... retrying (${busyRetry}/${maxBusyRetries})`);
              await new Promise(r => setTimeout(r, busyRetryDelay));
              try {
                // Fresh AbortController per retry to avoid cross-retry cancellation
                abortControllerRef.current = new AbortController();
                const retryResponse = await agentRuntime.startStream(buildStartStreamInput());
                if (retryResponse.ok) { response = retryResponse; break; }
                const retryData = await retryResponse.json<Record<string, any>>().catch(() => ({} as Record<string, any>));
                if (retryResponse.status !== 429 || retryData.code !== 'SESSION_BUSY') {
                  throw new Error(retryData.error || "Failed to get AI response");
                }
                if (busyRetry === maxBusyRetries) {
                  throw new Error("BeeBot is still thinking on another channel. Please try again in a moment. 🐝");
                }
              } catch (retryErr: unknown) {
                const re = retryErr instanceof Error ? retryErr : new Error(String(retryErr));
                if (re.name === "AbortError") throw re;
                if (busyRetry === maxBusyRetries) throw re;
              }
            }
            if (!response!.ok) throw new Error("Session busy after retries");
          } else if (response.status === 429) {
            setRateLimitedUntil(Date.now() + 30_000);
            throw new Error("Rate limit exceeded. Please try again later.");
          }
          if (response.status === 402) {
            throw new Error("Insufficient credits. Please add credits to continue.");
          }
          throw new Error(errorData.error || "Failed to get AI response");
        }

        const decoder = new TextDecoder("utf-8", { fatal: false });
        let buffer = "";
        let lastFailedLine: string | null = null;
        let accumulatorBytes = 0;
        // Cap accumulator at 256 KB — protects against runaway partial frames
        // (e.g. server hangs mid-frame and never sends the closing brace).
        const MAX_ACCUMULATOR_BYTES = 256 * 1024;
        // ═══ FIX #3/#4: 75s matches longer research chains and plan-generation phases ═══
        const CONTENT_SILENCE_LIMIT_MS = 75_000;
        const lastContentEventTime = { current: Date.now() };
        const silenceState = { attempted: false, limitMs: CONTENT_SILENCE_LIMIT_MS, assistantContentLength: 0 };

        const handlers = makeHandlers('');
        let streamDone = false;
        let consecutiveParseErrors = 0;
        const MAX_CONSECUTIVE_PARSE_ERRORS = 50;

        // Heartbeat watchdog: if server goes truly silent past the threshold,
        // surface an INLINE status (no toast spam) so the focal card stays the
        // single source of truth and the user never sees a flickering toast.
        lastHeartbeatAt = Date.now();
        heartbeatWatchdog = setInterval(() => {
          if (Date.now() - lastHeartbeatAt > HEARTBEAT_STALE_THRESHOLD_MS) {
            setThinkingStatus("Reconnecting to BeeBot…");
          }
        }, HEARTBEAT_WATCHDOG_INTERVAL_MS);

        // ═══ MAIN SSE LOOP ═══
        try {
          for await (const value of response.readChunks()) {
          resetInactivityTimer(); // Reset on every chunk received
          lastHeartbeatAt = Date.now(); // Update heartbeat watchdog
          buffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.startsWith(":") || line.trim() === "") continue;
            if (!line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") { streamDone = true; break; }

            try {
              const parsed = JSON.parse(jsonStr);
              lastFailedLine = null; // Reset accumulator on success
              accumulatorBytes = 0;
              consecutiveParseErrors = 0;
              // Track any non-heartbeat SSE activity to prevent false EMPTY STREAM retries
              if (parsed.type && parsed.type !== "heartbeat") {
                receivedAnySSERef.current = true;
              }
              silenceState.assistantContentLength = contentRef.current.length;
              const action = handleSSEEvent(parsed, handlers, lastContentEventTime, silenceState, batchStateRef.current);
              if (action === 'break') {
                // Silence-triggered break: only abort if parser already gave one retry chance (attempted=true)
                if (parsed.type === "heartbeat" && silenceState.attempted) {
                  console.error("[AgentChat] Content silence exceeded limit after retry - forcing recovery");
                  toast.warning("Connection unstable. Re-establishing link...", { duration: 5000 });
                  abortControllerRef.current?.abort();
                }
                streamDone = true;
                break;
              }
            } catch {
              consecutiveParseErrors++;
              // Circuit breaker: if 50 lines in a row fail to parse, the stream
              // is corrupt — bail out instead of spinning forever.
              if (consecutiveParseErrors > MAX_CONSECUTIVE_PARSE_ERRORS) {
                console.error("[SSE] Too many consecutive parse errors — aborting");
                streamingIsError = true;
                streamDone = true;
                toast.error("Stream corrupted — connection may be unstable. Tap to retry.", {
                  duration: 8000,
                  action: { label: "Retry", onClick: () => retryLastMessageRef.current?.() },
                });
                break;
              }
              // Incomplete-JSON accumulator: stitch the *JSON payloads* together,
              // not the raw SSE lines. Combining raw lines would leave a stray
              // `data: ` header inside the JSON body when a frame happens to be
              // split right after a newline that the server emitted mid-frame.
              if (lastFailedLine) {
                const combined = lastFailedLine + jsonStr;
                try {
                  const parsed = JSON.parse(combined);
                  lastFailedLine = null;
                  accumulatorBytes = 0;
                  consecutiveParseErrors = 0; // reset breaker on successful combined parse
                  silenceState.assistantContentLength = contentRef.current.length;
                  handleSSEEvent(parsed, handlers, lastContentEventTime, silenceState, batchStateRef.current);
                  continue;
                } catch {
                  if (combined.length > MAX_ACCUMULATOR_BYTES) {
                    console.warn("[SSE] Accumulator exceeded budget — discarding partial frame");
                    lastFailedLine = null;
                    accumulatorBytes = 0;
                  } else {
                    lastFailedLine = combined;
                    accumulatorBytes = combined.length;
                    // Continue inner loop — same chunk may still hold complete frames
                    continue;
                  }
                }
              } else if (!jsonStr.endsWith("}") && !jsonStr.endsWith("]")) {
                // Likely incomplete JSON — accumulate the *payload* (no `data: ` prefix)
                lastFailedLine = jsonStr;
                accumulatorBytes = jsonStr.length;
                continue;
              } else {
                console.warn("[AgentChat] Discarding malformed SSE:", line.slice(0, 100));
              }
            }
          }
          if (streamDone) break;
          }
        } catch (readErr) {
          // Stream connection died mid-read (network blip, server crash).
          // Don't silently swallow — surface as recoverable error so finally
          // block can offer retry instead of looking like a clean finish.
          const re = readErr instanceof Error ? readErr : new Error(String(readErr));
          if (re.name === "AbortError") throw re;
          console.warn("[SSE] Reader.read() failed:", re.message);
          streamingIsError = true;
        }

        // Flush any remaining UTF-8 multi-byte tail. Without this, a chunk
        // that ended mid-character (e.g. truncated Burmese codepoint) leaves
        // bytes in the decoder's internal buffer.
        try {
          const tail = decoder.decode();
          if (tail) buffer += tail;
        } catch (_) { /* noop */ }

        // ═══ FINAL BUFFER DRAIN ═══
        // SSE spec doesn't require a trailing "\n" on the final event. Without
        // this drain, a complete final `data: …` line would be silently dropped.
        if (buffer.trim().length > 0) {
          for (let raw of buffer.split("\n")) {
            if (raw.endsWith("\r")) raw = raw.slice(0, -1);
            if (!raw || raw.startsWith(":") || !raw.startsWith("data: ")) continue;
            const tailJson = raw.slice(6).trim();
            if (!tailJson || tailJson === "[DONE]") continue;
            try {
              const parsed = JSON.parse(tailJson);
              silenceState.assistantContentLength = contentRef.current.length;
              handleSSEEvent(parsed, handlers, lastContentEventTime, silenceState, batchStateRef.current);
            } catch {
              // Leftover partial frame — silently drop, don't crash completion.
            }
          }
          buffer = "";
        }

        stopThrottle();
        if (clientTimeoutId) { clearTimeout(clientTimeoutId); clientTimeoutId = null; }

        // ═══ INFINITE RELAY ═══
        while (pendingContinuation && !manualCancelRef.current) {
          const nextRound = pendingContinuation.relay_round + 1;
          const totalElapsed = Date.now() - relayStartTime;

          if (nextRound > MAX_RELAY_ROUNDS) { console.log(`[Relay] Max rounds reached (${MAX_RELAY_ROUNDS})`); break; }
          if (totalElapsed >= MAX_RELAY_TOTAL_MS) { console.log(`[Relay] Time limit reached (${Math.round(totalElapsed / 1000)}s)`); break; }

          console.log(`[Relay] Starting relay round ${nextRound}/${MAX_RELAY_ROUNDS} (elapsed: ${Math.round(totalElapsed / 1000)}s)`);
          setRelayRound?.(nextRound);
          setTotalRelayRounds?.(MAX_RELAY_ROUNDS);
          setThinkingStatus(`Continuing analysis... (Relay ${nextRound}/${MAX_RELAY_ROUNDS}) 🔄`);

          abortControllerRef.current = new AbortController();
          // Activity-based timeout for relay rounds too
          let relayTimeoutId: ReturnType<typeof setTimeout> | null = null;
          const resetRelayTimer = () => {
            if (relayTimeoutId) clearTimeout(relayTimeoutId);
            relayTimeoutId = setTimeout(() => { abortControllerRef.current?.abort(); }, INACTIVITY_TIMEOUT_MS);
          };
          resetRelayTimer();

          // Cap relay snapshot to prevent unbounded payload growth
          const rawSnapshot = pendingContinuation.context_snapshot;
          const currentSnapshot = typeof rawSnapshot === 'string'
            ? rawSnapshot.slice(0, 15000)
            : JSON.stringify(rawSnapshot).slice(0, 15000);
          pendingContinuation = null;

          try {
            const contResponse = await agentRuntime.continueStream({
                sessionId: activeSessionId,
                userId,
                message: trimmedContent,
                deviceContext,
                preferredModel,
                apiSourcePreference: localStorage.getItem('beebot-api-source') || 'personal',
                continuation: { context_snapshot: currentSnapshot, relay_round: nextRound },
                signal: abortControllerRef.current.signal,
            });

            if (!contResponse.ok) { console.warn(`[Relay] Failed with status ${contResponse.status}`); break; }

            buffer = "";
            let relayLastFailedLine: string | null = null;
            let relayAccumulatorBytes = 0;
            let relayConsecutiveParseErrors = 0;
            const RELAY_MAX_ACCUMULATOR_BYTES = 256 * 1024;
            const RELAY_MAX_CONSECUTIVE_PARSE_ERRORS = 50;
            const relayDecoder = new TextDecoder("utf-8", { fatal: false });
            streamDone = false;
            lastContentEventTime.current = Date.now();
            silenceState.attempted = false;

            const relayHandlers = makeHandlers('relay_');

            // ═══ RELAY SSE LOOP (unified — same handleSSEEvent) ═══
            try {
              for await (const cValue of contResponse.readChunks()) {
              resetRelayTimer(); // Reset on every chunk received
              buffer += relayDecoder.decode(cValue, { stream: true });

              let ni: number;
              while ((ni = buffer.indexOf("\n")) !== -1) {
                let cLine = buffer.slice(0, ni);
                buffer = buffer.slice(ni + 1);
                if (cLine.endsWith("\r")) cLine = cLine.slice(0, -1);
                if (cLine.startsWith(":") || cLine.trim() === "") continue;
                if (!cLine.startsWith("data: ")) continue;
                const cJson = cLine.slice(6).trim();
                if (cJson === "[DONE]") { streamDone = true; break; }

                try {
                  const cp = JSON.parse(cJson);
                  relayLastFailedLine = null;
                  relayAccumulatorBytes = 0;
                  relayConsecutiveParseErrors = 0;
                  silenceState.assistantContentLength = contentRef.current.length;
                  const action = handleSSEEvent(cp, relayHandlers, lastContentEventTime, silenceState, batchStateRef.current);
                  if (action === 'break') { streamDone = true; break; }
                } catch {
                  relayConsecutiveParseErrors++;
                  if (relayConsecutiveParseErrors > RELAY_MAX_CONSECUTIVE_PARSE_ERRORS) {
                    console.error("[Relay] Too many consecutive parse errors — aborting");
                    streamingIsError = true;
                    streamDone = true;
                    break;
                  }
                  // Incomplete-JSON accumulator (aligned with main loop):
                  // stitch JSON payloads, not raw SSE lines, to avoid stray
                  // `data: ` prefixes embedded inside the JSON body.
                  if (relayLastFailedLine) {
                    const combined = relayLastFailedLine + cJson;
                    try {
                      const parsed = JSON.parse(combined);
                      relayLastFailedLine = null;
                      relayAccumulatorBytes = 0;
                      relayConsecutiveParseErrors = 0; // reset breaker on combined-parse success
                      silenceState.assistantContentLength = contentRef.current.length;
                      handleSSEEvent(parsed, relayHandlers, lastContentEventTime, silenceState, batchStateRef.current);
                      continue;
                    } catch {
                      if (combined.length > RELAY_MAX_ACCUMULATOR_BYTES) {
                        console.warn("[Relay] Accumulator exceeded budget — discarding partial frame");
                        relayLastFailedLine = null;
                        relayAccumulatorBytes = 0;
                      } else {
                        relayLastFailedLine = combined;
                        relayAccumulatorBytes = combined.length;
                        continue;
                      }
                    }
                  } else if (!cJson.endsWith("}") && !cJson.endsWith("]")) {
                    relayLastFailedLine = cJson;
                    relayAccumulatorBytes = cJson.length;
                    continue;
                  } else {
                    console.warn("[Relay] Discarding malformed SSE:", cLine.slice(0, 100));
                  }
                }
              }
              if (streamDone) break;
              }
            } catch (relayReadErr) {
              const re = relayReadErr instanceof Error ? relayReadErr : new Error(String(relayReadErr));
              if (re.name === "AbortError") throw re;
              console.warn("[Relay] Reader.read() failed:", re.message);
              streamingIsError = true;
            }
            // Final UTF-8 flush for relay decoder
            try {
              const tail = relayDecoder.decode();
              if (tail) buffer += tail;
            } catch (_) { /* noop */ }
            // ═══ FINAL BUFFER DRAIN (relay) ═══
            // Catch any complete final `data: …` line that arrived without a
            // trailing "\n". SSE spec doesn't require one on the last event.
            if (buffer.trim().length > 0) {
              for (let raw of buffer.split("\n")) {
                if (raw.endsWith("\r")) raw = raw.slice(0, -1);
                if (!raw || raw.startsWith(":") || !raw.startsWith("data: ")) continue;
                const tailJson = raw.slice(6).trim();
                if (!tailJson || tailJson === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(tailJson);
                  silenceState.assistantContentLength = contentRef.current.length;
                  handleSSEEvent(parsed, relayHandlers, lastContentEventTime, silenceState, batchStateRef.current);
                } catch {
                  // Leftover partial frame — silently drop, don't crash completion.
                }
              }
              buffer = "";
            }
            stopThrottle();
          } catch (relayErr) {
            console.error("[Relay] Continuation failed:", relayErr);
            break;
          } finally {
            if (relayTimeoutId) clearTimeout(relayTimeoutId);
          }
        }

        // ═══ ORPHAN CLEANUP — mark as error, not done, to avoid masking real failures ═══
        setAccumulatedThoughts(prev =>
          prev.map(t => t.status === "loading" ? { ...t, status: "error" as const, detail: t.detail || "Result not received" } : t)
        );
        setRelayRound?.(0);
        setTotalRelayRounds?.(0);
        // Mark remaining running tool progress steps as done
        setToolProgressSteps?.(prev => prev.map(s => s.status === "running" ? { ...s, status: "done" as const, completedAt: Date.now() } : s));
        // Optimistic messages cleared in finally block (Hold-Until-Confirmed)
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        if (err.name === "AbortError") {
          if (manualCancelRef.current) {
            manualCancelRef.current = false;
          } else if (hardCeilingFiredRef.current) {
            hardCeilingFiredRef.current = false;
            toast.error("Response took too long and was halted after 10 minutes. Try a smaller scope or split the task.", { duration: 8000 });
          } else {
            toast.error("Connection lost — BeeBot may still be working. Tap retry or check back in a moment.", { duration: 8000 });
          }
        } else if (err.message?.includes("Failed to fetch")) {
          toast.error("Couldn't reach BeeBot. Tap Send to try again.", { duration: 5000 });
        } else {
          console.error("Send message error:", err);
          toast.error(err.message || "Failed to send message");
          try {
            await conversations.createMessage({
              sessionId: activeSessionId,
              userId,
              role: "assistant",
              content: `Error: ${err.message || "Failed to get response"}`,
              isError: true,
            });
            await refetchMessages();
          } catch (saveError) {
            console.error("Failed to save error message:", saveError);
          }
        }
      } finally {
        // ═══ GUARANTEED CLEANUP: Abort any lingering fetch to prevent zombie SSE connections ═══
        try { abortControllerRef.current?.abort(); } catch (_) { /* safe to ignore */ }

        // ═══ HOLD-UNTIL-CONFIRMED PATTERN ═══
        // Keep isStreamingRef TRUE during transition to block Realtime handler
        stopThrottle();
        if (clientTimeoutId) { clearTimeout(clientTimeoutId); clientTimeoutId = null; }
        if (heartbeatWatchdog) { clearInterval(heartbeatWatchdog); heartbeatWatchdog = null; }
        if (hardCeilingTimerId) clearTimeout(hardCeilingTimerId);
        if (preflightTimerRef.current) { clearInterval(preflightTimerRef.current); preflightTimerRef.current = null; }

        // Smart retry: refetch up to 3 times with increasing delays
        const RETRY_DELAYS = [0, 800, 1500];
        let dbConfirmed = false;
        let lastRefetchedData: Array<{ role: string; created_at: string; content: string }> = [];
        for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
          if (RETRY_DELAYS[attempt] > 0) await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
          const [msgResult] = await Promise.all([
            refetchMessages(),
            ...(attempt === 0 ? [refetchSessions()] : []),
          ]);
          const msgs = (msgResult as any)?.data;
          lastRefetchedData = Array.isArray(msgs) ? msgs : [];
          if (lastRefetchedData.some(
            (m) => m.role === 'assistant' && Date.now() - new Date(m.created_at).getTime() < 60000
          )) {
            dbConfirmed = true;
            break;
          }
          // Only trust error state for early break, NOT content presence
          if (streamingIsError) {
            dbConfirmed = true;
            break;
          }
        }

        // Bridge: if we have streamed content but DB hasn't confirmed, inject optimistic message
        if (!dbConfirmed && contentRef.current.length > 0 && !streamingIsError) {
          console.warn("[AgentChat] DB not confirmed after retries — injecting bridge message");
          const bridgeMsg = {
            id: `bridge_${Date.now()}`,
            session_id: activeSessionId || "",
            user_id: "",
            role: "assistant" as const,
            content: contentRef.current,
            attachments: null,
            thoughts: null,
            is_error: false,
            created_at: new Date().toISOString(),
            source_channel: null,
            is_shared: false,
            share_uid: null,
            shared_at: null,
          };
          setOptimisticMessages(prev => [...prev, bridgeMsg]);
          dbConfirmed = true; // treat as confirmed for downstream logic

          // Schedule cleanup: refetch after 3s to replace bridge with real DB record
          setTimeout(async () => {
            await refetchMessages();
            setOptimisticMessages(prev => prev.filter(m => !m.id.startsWith('bridge_')));
          }, 3000);
        }

        // Empty stream auto-retry (before atomic flush so we can early-return)
        // FIXED: If we received any SSE events (thinking_status, tool_call, etc.), the backend WAS active
        // — don't treat it as an empty stream even if content is empty (backend may have errored after activity)
        if (!dbConfirmed && !streamingIsError && !manualCancelRef.current && !emptyStreamRetriedRef.current && !receivedAnySSERef.current) {
          if (autonomousTriggeredRef.current) {
            console.log("[AgentChat] Autonomous mode active — skipping empty-stream auto-retry");
          } else {
            emptyStreamRetriedRef.current = true;
            console.warn("[AgentChat] EMPTY STREAM detected - auto-retrying once");
            // Flush state before retry
            setOptimisticMessages([]);
            setStreamingContent("");
            setIsStreaming(false);
            isStreamingRef.current = false;
            sendInFlightRef.current = false;
            emptyRetryTimerRef.current = setTimeout(() => {
              emptyRetryTimerRef.current = null;
              if (!isStreamingRef.current) {
                sendMessage(trimmedContent, isAdmin, attachments, true);
              }
            }, 2000);
            return;
          }
        }

        // ═══ P0: FALLBACK DETECTION AUTO-RETRY ═══
        // If the final content matches the old "temporary issue" pattern and we haven't retried yet,
        // auto-retry once before showing the error to the user
        const FALLBACK_PATTERNS = [
          /sorry.*temporary issue/i,
          /ယာယီပြဿနာ/,
          /encountered a temporary/i,
        ];
        const finalStreamContent = contentRef.current.trim();
        const isFallbackContent = FALLBACK_PATTERNS.some(p => p.test(finalStreamContent));
        if (isFallbackContent && !emptyStreamRetriedRef.current && !manualCancelRef.current && !autonomousTriggeredRef.current) {
          emptyStreamRetriedRef.current = true;
          console.warn("[AgentChat] FALLBACK PATTERN detected in response — auto-retrying once");
          setOptimisticMessages([]);
          setStreamingContent("");
          setIsStreaming(false);
          isStreamingRef.current = false;
          sendInFlightRef.current = false;
          emptyRetryTimerRef.current = setTimeout(() => {
            emptyRetryTimerRef.current = null;
            if (!isStreamingRef.current) {
              sendMessage(trimmedContent, isAdmin, attachments, true);
            }
          }, 2500);
          return;
        }

        // ═══ ATOMIC STATE FLUSH — all in one React batch, no gap ═══
        setOptimisticMessages([]);
        setStreamingContent("");
        setIsStreaming(false);
        setStreamingIsError(false);
        setThinkingStatus(null);
        setCurrentStep(undefined);
        setTotalSteps(undefined);

        // Capture tool diagnostics from finalizeToolCalls so we can surface
        // pipeline failures the user would otherwise never see.
        let toolDiagnostics: { incomplete: string[]; failed: string[] } = { incomplete: [], failed: [] };
        setToolCalls(prev => {
          const result = finalizeToolCalls(prev, setCompletedToolSteps, 'final_');
          toolDiagnostics = {
            incomplete: (result as any).__incompleteTools || [],
            failed: (result as any).__failedTools || [],
          };
          return result;
        });
        abortControllerRef.current = null;

        // ═══ TOOL PIPELINE FAILURE TOAST ═══
        // Surface tool failures the user can act on. Skipped on manual cancel
        // and on credit/rate-limit errors (those have their own dedicated UI).
        if (!manualCancelRef.current && !streamingIsError) {
          if (toolDiagnostics.incomplete.length > 0) {
            const names = toolDiagnostics.incomplete.slice(0, 3).join(", ");
            const extra = toolDiagnostics.incomplete.length > 3 ? ` (+${toolDiagnostics.incomplete.length - 3} more)` : "";
            toast.error(`Tool pipeline interrupted: ${names}${extra}. Tap retry to try again.`, {
              duration: 7000,
              action: { label: "Retry", onClick: () => retryLastMessageRef.current?.() },
            });
          } else if (toolDiagnostics.failed.length > 0 && !dbConfirmed) {
            // Only warn if tool failed AND no assistant message was saved
            const names = toolDiagnostics.failed.slice(0, 3).join(", ");
            toast.warning(`${names} returned an error. BeeBot's response may be incomplete.`, {
              duration: 6000,
            });
          }
        }

        // ═══ DEAD-AIR WATCHDOG ═══
        // No content + no error + no tool activity + DB has no new assistant
        // message = silent stall. Show actionable guidance instead of leaving
        // the UI in a "looks fine but nothing happened" state.
        if (
          !manualCancelRef.current &&
          !streamingIsError &&
          !dbConfirmed &&
          contentRef.current.length === 0 &&
          !receivedAnySSERef.current &&
          emptyStreamRetriedRef.current // we already retried once — don't double-toast
        ) {
          toast.error("BeeBot didn't respond. Please check your connection and try again.", {
            duration: 7000,
            action: { label: "Retry", onClick: () => retryLastMessageRef.current?.() },
          });
        }

        // LAST: unblock Realtime handler only after all state is settled
        isStreamingRef.current = false;
        sendInFlightRef.current = false;

        // ═══ ANTI-GHOST Layer 3 ═══
        const hasNewAssistantMsg = lastRefetchedData.some(
          (m) => m.role === 'assistant' && Date.now() - new Date(m.created_at).getTime() < 60000
        );
        if (!receivedToolCallsRef.current && hasNewAssistantMsg && !streamingIsError) {
          const lastMsg = lastRefetchedData
            .filter((m) => m.role === 'assistant')
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
          if (lastMsg) {
            const stalePatterns = [
              /ရှာပေးနေ/, /ရှာဖွေနေ/, /စောင့်ပေးပါ/, /ရှာနေ/,
              /searching/i, /looking up/i, /please wait/i,
              /let me (search|find|check|look)/i,
              /I('m| am) (searching|looking|checking|finding)/i,
            ];
            const isStale = stalePatterns.some(p => p.test(lastMsg.content));
            if (isStale) {
              staleTimerRef.current = setTimeout(() => {
                toast.warning("BeeBot may have completed without following up. Try asking again.", { duration: 8000 });
                staleTimerRef.current = null;
              }, 30000);
            }
          }
        }
      }
    },
    [activeSessionId, userId, isStreaming, refetchMessages, refetchSessions, conversations, agentRuntime]
  );

  const retryLastMessage = useCallback(() => {
    if (lastUserPayload) {
      sendMessage(lastUserPayload.content, lastUserPayload.isAdmin, lastUserPayload.attachments);
    }
  }, [lastUserPayload, sendMessage]);

  // Keep the forward ref in sync so toast actions inside sendMessage's
  // finally block can invoke the latest retry callback.
  retryLastMessageRef.current = retryLastMessage;

  const cancelStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      manualCancelRef.current = true;
      abortControllerRef.current.abort();
      setIsStreaming(false);
      setStreamingContent("");
      
      // ═══ SERVER-SIDE CANCEL: Tell the backend to stop processing ═══
      if (activeSessionId) {
        agentRuntime.cancelStream({ sessionId: activeSessionId })
          .catch(err => console.warn("[ServerCancel] Failed to send cancel:", err));
      }
    }
    if (emptyRetryTimerRef.current) {
      clearTimeout(emptyRetryTimerRef.current);
      emptyRetryTimerRef.current = null;
    }
  }, [activeSessionId, agentRuntime]);

  return { sendMessage, cancelStreaming, retryLastMessage, emptyRetryTimerRef };
}

// ═══ SMART PREFLIGHT CLASSIFIER ═══
// Analyzes message content to show intelligent Myanmar acknowledgment instantly
function classifyMessageForPreflight(content: string): {
  initial: string;
  phases: string[];
} {
  const lower = content.toLowerCase();

  if (/price|ဈေးနှုန်း|crypto|bitcoin|btc|eth|market|coin|ဈေး/.test(lower)) {
    return {
      initial: "🔍 ဈေးနှုန်း data ရှာဖွေနေပါတယ်... ခဏစောင့်ပေးပါ",
      phases: [
        "📡 Market data ဆွဲယူနေတယ်...",
        "📊 ဈေးနှုန်းတွေ စစ်ဆေးနေတယ်...",
        "✍️ အဖြေ ပြင်ဆင်နေတယ်...",
      ],
    };
  }

  if (/search|ရှာ|find|research|လေ့လာ|ဘာလဲ|ရှင်းပြ|explain|what is/.test(lower)) {
    return {
      initial: "🔍 Data ရှာဖွေနေပါတယ်... ခဏစောင့်ပေးပါ",
      phases: [
        "📚 Knowledge Base စစ်ဆေးနေတယ်...",
        "📖 အချက်အလက်တွေ ဖတ်နေတယ်...",
        "✍️ အဖြေ ပြင်ဆင်နေတယ်...",
      ],
    };
  }

  if (/write|ရေး|create|ဖန်တီး|generate|content|article|caption|script|post/.test(lower)) {
    return {
      initial: "✍️ Content ပြင်ဆင်နေပါတယ်... ခဏစောင့်ပေးပါ",
      phases: [
        "🧠 အကြောင်းအရာ လေ့လာနေတယ်...",
        "📝 Content structure ချနေတယ်...",
        "✍️ ရေးသားနေတယ်...",
      ],
    };
  }

  if (/expense|income|ငွေ|money|flowstate|balance|ဝင်ငွေ|ထွက်ငွေ|ကုန်ကျ/.test(lower)) {
    return {
      initial: "💰 Financial data စစ်ဆေးနေပါတယ်...",
      phases: [
        "📒 ငွေစာရင်း ဖွင့်နေတယ်...",
        "🧮 Data တွက်ချက်နေတယ်...",
        "✍️ အဖြေ ပြင်ဆင်နေတယ်...",
      ],
    };
  }

  if (/task|workspace|အလုပ်|assign|todo|project|team/.test(lower)) {
    return {
      initial: "📋 Workspace စစ်ဆေးနေပါတယ်...",
      phases: [
        "📂 Task list ဖွင့်နေတယ်...",
        "🔍 Data စစ်ဆေးနေတယ်...",
        "✍️ အဖြေ ပြင်ဆင်နေတယ်...",
      ],
    };
  }

  // Default — operational phase descriptions
  return {
    initial: "🔍 Intent ခွဲခြမ်းစိတ်ဖြာနေတယ်...",
    phases: [
      "📋 Context နဲ့ Memory တွေ ပြင်ဆင်နေတယ်...",
      "⚡ Response strategy ချမှတ်နေတယ်...",
      "🤖 AI Model ဆီ ပို့နေတယ်...",
    ],
  };
}
