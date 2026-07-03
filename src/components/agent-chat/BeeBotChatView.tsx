import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { AGENT_ROLE_CONFIG } from "@/hooks/agent-chat/types";
import { DialogTitle } from "@/components/ui/dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import {
  RefreshCw,
  X,
  HardDrive,
  Globe,
  Brain,
  Zap,
  Sparkles,
  Key,
  Cloud,
  Shield,
} from "lucide-react";
import { MessageThreadPanel } from "./thread/MessageThreadPanel";
import { ScheduledTasksPage } from "./scheduled-tasks/ScheduledTasksPage";

import { AgentConsultantPanel } from "./consultant/AgentConsultantPanel";
import { getModelDisplayName, getModelProvider, OPENROUTER_MODELS, AI_MODELS } from "@/lib/ai-models";
import { useAgentChat } from "@/hooks/useAgentChat";
import { useAgentSettings } from "@/hooks/useAgentSettings";
import { useThreadReplyCounts } from "@/hooks/agent-chat/useThreadReplyCounts";
import { useIntelligenceStatus } from "@/hooks/useIntelligenceStatus";
import { ChatSessionSidebar } from "./ChatSessionSidebar";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";


import { ResourceTelemetryPanel } from "./ResourceTelemetryPanel";
import { AgenticRuntimeStatus } from "./AgenticRuntimeStatus";
import { ArtifactPanel } from "./ArtifactPanel";
import { MessageSearchOverlay } from "./MessageSearchOverlay";
import { AutonomousSubtaskPanel } from "./AutonomousSubtaskPanel";
import type { Artifact } from "./ArtifactPanel";

import { MonitoringBannerLoader } from "./MonitoringModeBanner";
import { ToolSourcesPanel } from "./ToolSourcesPanel";
import type { ToolEntry } from "./ToolSourcesPanel";
import { getToolConfig, formatToolSummary } from "./tool-config";

import { useSystemHealth } from "@/hooks/useSystemHealth";
import { SystemHealthDot } from "./SystemHealthDot";
import { TokenUsageIndicator } from "./TokenUsageIndicator";
import { SidebarOrchestrator } from "./SidebarOrchestrator";
import { DialogRouter } from "./DialogRouter";
import { LocalRuntimeSettingsDialog } from "./LocalRuntimeSettingsDialog";

import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAgentChatQueries } from "@/hooks/agent-chat/useAgentChatQueries";
import { useAgentDialogState } from "@/hooks/agent-chat/useAgentDialogState";
import { useIdlePrefetch } from "@/hooks/useIdlePrefetch";
import { useRepositories } from "@/repositories/runtime/RepositoryProvider";
import type { AgentRuntimeStatus as RuntimeStatus } from "@/repositories/contracts/agentRuntime";

interface BeeBotChatViewProps {
  userId: string;
  open?: boolean;
  onClose?: () => void;
  initialMessage?: string;
  inDialog?: boolean;
  className?: string;
  /**
   * When true, hides the ChatSessionSidebar (and its embedded UserProfileDialog).
   * Use this when BeeBotChatView is mounted inside another Dialog (e.g. the
   * Memory Agent surface inside UserProfileDialog) to prevent recursive Dialog
   * nesting which causes Radix `setRef` to loop ("Maximum update depth exceeded").
   */
  embedded?: boolean;
}

export function BeeBotChatView({
  userId,
  open = true,
  onClose,
  initialMessage,
  inDialog,
  className,
  embedded = false,
}: BeeBotChatViewProps) {
  const queryClient = useQueryClient();
  const { conversations, agentRuntime } = useRepositories();

  const [subtaskPanel, setSubtaskPanel] = useState<{ open: boolean; taskId: string | null }>({
    open: false,
    taskId: null,
  });
  const [activeThreadMessageId, setActiveThreadMessageId] = useState<string | null>(null);
  const [localRuntimeSettingsOpen, setLocalRuntimeSettingsOpen] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);

  // Idle-prefetch top dialog chunks
  useIdlePrefetch([
    () => import("./SoulEditor"),
    () => import("./NeuralLinkDialog"),
  ]);

  // ═══ Extracted Dialog State ═══
  const ds = useAgentDialogState();

  // ═══ Agent Chat Hook ═══
  const {
    sessions,
    messages,
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
    retryLastMessage,
    sendMessage,
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
    toolProgressSteps,
    taskPlanSteps,
    activeJobId,
    setActiveJobId,
    autonomousTask,
    narrationMessages,
    thinkingBlocks,
  } = useAgentChat(userId);

  // Prefetch subtask panel chunk when streaming starts so click is instant
  useEffect(() => {
    if (isStreaming) {
      import("./AutonomousSubtaskPanel");
    }
  }, [isStreaming]);

  const refreshRuntimeStatus = useCallback(() => {
    agentRuntime.getStatus()
      .then(setRuntimeStatus)
      .catch(() => {
        setRuntimeStatus(null);
      });
  }, [agentRuntime]);

  useEffect(() => {
    if (open && !localRuntimeSettingsOpen) refreshRuntimeStatus();
  }, [open, localRuntimeSettingsOpen, refreshRuntimeStatus]);

  // ═══ Smart Auto-Switch: auto-open on task start, auto-close on artifact ═══
  const prevTaskStatus = useRef<string | null>(null);
  useEffect(() => {
    const task = autonomousTask?.activeTask;
    const status = task?.status ?? null;
    const prev = prevTaskStatus.current;
    prevTaskStatus.current = status;
    if (status && !prev && task && (status === "planning" || status === "working")) {
      setSubtaskPanel({ open: true, taskId: task.id });
    }
    if (prev && (prev === "working" || prev === "compiling") && status === "completed" && artifactPanelOpen) {
      setSubtaskPanel({ open: false, taskId: null });
    }
  }, [autonomousTask?.activeTask?.status, autonomousTask?.activeTask?.id, artifactPanelOpen]);

  const systemHealth = useSystemHealth(supabase, telemetry.lastLatencyMs);

  // Current active agent indicator (from task metadata)
  const currentAgentIndicator = useMemo(() => {
    const task = autonomousTask?.activeTask;
    if (!task || !autonomousTask?.isActive) return null;
    const taskMeta = task.metadata as Record<string, unknown> | null;
    const role = taskMeta?.currentAgentRole as string | undefined;
    if (!role) return null;
    return AGENT_ROLE_CONFIG[role] ?? AGENT_ROLE_CONFIG.general;
  }, [autonomousTask?.activeTask, autonomousTask?.isActive]);

  // Pre-warm Deno isolate when view opens
  useEffect(() => {
    if (open) {
      agentRuntime.warmup().catch(() => {});
    }
  }, [agentRuntime, open]);

  const handleViewSources = useCallback(
    (messageId: string) => {
      if (artifactPanelOpen) closeArtifactPanel();
      ds.setSourcesMessageId((prev) => (prev === messageId ? null : messageId));
    },
    [artifactPanelOpen, closeArtifactPanel],
  );

  const handleOpenThread = useCallback((messageId: string) => {
    setActiveThreadMessageId((prev) => (prev === messageId ? null : messageId));
  }, []);

  const threadSourceMessage = useMemo(
    () => (activeThreadMessageId ? messages.find((m) => m.id === activeThreadMessageId) : null),
    [activeThreadMessageId, messages],
  );

  const threadReplyCounts = useThreadReplyCounts(userId, activeSessionId);

  const selectedMessageSources = useMemo<ToolEntry[]>(() => {
    if (!ds.sourcesMessageId) return [];
    const msg = messages.find((m) => m.id === ds.sourcesMessageId);
    if (!msg?.tool_results) return [];
    return msg.tool_results.map((tr: any) => {
      const config = getToolConfig(tr.name);
      const isSearchWeb = tr.name === "search_web";
      return {
        toolName: tr.name,
        label: config.label,
        icon: config.icon,
        color: config.color,
        summary: formatToolSummary(tr.name, tr.result),
        status:
          tr.error || tr.result?.success === false || tr.result?.error ? ("error" as const) : ("success" as const),
        results:
          isSearchWeb && tr.result?.results
            ? (tr.result.results || []).map((r: any) => ({
                title: r.title || "Untitled",
                url: r.url || "#",
                snippet: r.snippet || r.content?.slice(0, 150),
              }))
            : undefined,
      };
    });
  }, [ds.sourcesMessageId, messages]);

  const liveToolEntries = useMemo<ToolEntry[]>(() => {
    if (!isStreaming && toolCalls.length === 0 && completedToolSteps.length === 0) return [];
    const completed = completedToolSteps.map((step) => {
      const config = getToolConfig(step.name);
      return {
        toolName: step.name,
        label: config.label,
        icon: config.icon,
        color: config.color,
        summary: step.summary,
        status: step.status as "success" | "error",
      };
    });
    const active = toolCalls.map((tc) => {
      const config = getToolConfig(tc.name);
      return {
        toolName: tc.name,
        label: config.label,
        icon: config.icon,
        color: config.color,
        summary: "Processing...",
        status: (tc.status === "success" || tc.status === "error" ? tc.status : "running") as ToolEntry["status"],
      };
    });
    return [...completed, ...active];
  }, [isStreaming, completedToolSteps, toolCalls]);

  const isSourcesPanelOpen = !!ds.sourcesMessageId && selectedMessageSources.length > 0;

  const {
    botName,
    botEmoji,
    settings: agentSettings,
    updateSettings,
    isUpdating: isSavingSoul,
  } = useAgentSettings(userId);
  const intelligenceStatus = useIntelligenceStatus(open ? userId : undefined);
  const tierLevel = intelligenceStatus.getTierLevel();
  const { isAdmin, aiSettings, systemAISettings } = useAgentChatQueries(
    userId,
    open,
    intelligenceStatus.defaultModel || "gemini-3.5-flash",
  );
  const isPersonalBypassUnlimited =
    ds.apiSource === "personal" &&
    (aiSettings?.hasPersonalKey ?? false) &&
    (systemAISettings?.bypassIUForPersonalKey ?? false);

  const handleModelChange = (modelId: string) => {
    const provider = modelId.startsWith("claude")
      ? "anthropic"
      : modelId.startsWith("google/")
        ? "google"
        : modelId.includes("/")
        ? "openrouter"
        : modelId.startsWith("grok")
          ? "xai"
          : "google";
    intelligenceStatus.setPreferredModel({ modelId, provider });
  };
  const handleRefresh = () => {
    refetchSessions();
    refetchMessages();
    toast.success("Refreshing...");
  };

  // ═══ Local model override for instant badge updates ═══
  const [activeModelOverride, setActiveModelOverride] = useState<string | null>(null);

  // ═══ Auto-Fallback: switch model when active provider is disabled ═══
  useEffect(() => {
    const currentModel =
      activeModelOverride || intelligenceStatus.preferredModel || intelligenceStatus.defaultModel || "gemini-3.5-flash";
    const provider = getModelProvider(currentModel);
    const disabled = (aiSettings?.disabledConnectors ?? []) as string[];
    const isGeminiDisabled = disabled.includes("gemini");
    const isOpenrouterDisabled = disabled.includes("openrouter");
    const hasGemini = aiSettings?.hasPersonalKey ?? false;
    const hasOR = aiSettings?.hasOpenrouterKey ?? false;
    const hasSystemKey = intelligenceStatus.apiKeyStatus?.hasGoogleKey ?? false;
    const hasGeminiAccess = (hasGemini || hasSystemKey) && !isGeminiDisabled;

    const providerUnavailable =
      (provider === "google" && !hasGeminiAccess) ||
      (provider === "openrouter" && (isOpenrouterDisabled || !hasOR));

    if (providerUnavailable) {
      if (hasOR && !isOpenrouterDisabled) {
        setActiveModelOverride("openai/gpt-4o");
        handleModelChange("openai/gpt-4o");
        toast.info("Switched to OpenRouter (previous provider disabled)");
      } else if (hasGeminiAccess) {
        setActiveModelOverride("gemini-3.5-flash");
        handleModelChange("gemini-3.5-flash");
        toast.info("Switched to Gemini (previous provider disabled)");
      } else {
        setActiveModelOverride(null);
      }
    } else {
      // Provider is available — clear override so RPC data takes over
      setActiveModelOverride(null);
    }
  }, [
    aiSettings?.disabledConnectors,
    aiSettings?.hasOpenrouterKey,
    aiSettings?.hasPersonalKey,
    intelligenceStatus.apiKeyStatus?.hasGoogleKey,
  ]);

  const handleSendMessage = async (
    content: string,
    attachments?: { type: "image"; base64: string; mime_type: string; file_name: string }[],
  ) => {
    if (!activeSessionId) {
      const session = await createSession("New Chat");
      if (session) await sendMessage(content, isAdmin || false, attachments);
    } else {
      sendMessage(content, isAdmin || false, attachments);
    }
  };

  // ═══ REGENERATE MESSAGE ═══
  const handleRegenerateMessage = useCallback(
    async (messageId: string) => {
      if (!activeSessionId || isStreaming) return;
      const msgIndex = messages.findIndex((m) => m.id === messageId);
      if (msgIndex < 0) return;
      let userContent = "";
      for (let i = msgIndex - 1; i >= 0; i--) {
        if (messages[i].role === "user" && messages[i].content) {
          userContent = messages[i].content;
          break;
        }
      }
      if (!userContent) return;
      try {
        await conversations.deleteMessage(messageId);
        refetchMessages();
        await handleSendMessage(userContent);
      } catch (err) {
        console.error("[Regenerate] Error:", err);
      }
    },
    [activeSessionId, isStreaming, messages, refetchMessages, handleSendMessage, conversations],
  );

  // ═══ MESSAGE EDITING ═══
  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (!activeSessionId || isStreaming) return;
      try {
        await conversations.updateMessageContent(messageId, newContent);
        refetchMessages();
        sendMessage(newContent, isAdmin || false);
      } catch (err) {
        console.error("[EditMessage] Failed:", err);
        toast.error("Failed to edit message");
      }
    },
    [activeSessionId, isStreaming, isAdmin, sendMessage, refetchMessages, conversations],
  );

  // ═══ DELETE MESSAGE ═══
  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      if (!activeSessionId) return;
      try {
        await conversations.deleteMessage(messageId);
        refetchMessages();
        toast.success("Message deleted");
      } catch (err) {
        console.error("[DeleteMessage] Failed:", err);
        toast.error("Failed to delete message");
      }
    },
    [activeSessionId, refetchMessages, conversations],
  );

  const initialMessageSentRef = useRef(false);
  useEffect(() => {
    if (open && initialMessage && !initialMessageSentRef.current && !isStreaming) {
      initialMessageSentRef.current = true;
      const timer = setTimeout(() => handleSendMessage(initialMessage), 500);
      return () => clearTimeout(timer);
    }
    if (!open) initialMessageSentRef.current = false;
  }, [open, initialMessage]);

  // ═══ In-session search ═══
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const messageContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd-F / Ctrl-F to open. Don't override when in browser-search context
      // outside our chat container (e.g. user is in DevTools).
      if ((e.metaKey || e.ctrlKey) && e.key === "f" && open) {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape" && searchOpen) {
        e.preventDefault();
        setSearchOpen(false);
        setSearchQuery("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, searchOpen]);

  const handleSaveArtifact = async (artifact: Artifact) => {
    const { error } = await supabase.from("ai_generated_content").insert({
      user_id: userId,
      title: artifact.title,
      content: artifact.content,
      category: artifact.type === "code" ? "code" : "general",
      source_type: "beebot_artifact",
    });
    if (error) throw error;
  };

  const displayBotName = isAdmin ? `Super ${botName}` : botName;

  return (
    <div className={cn("flex-1 flex flex-col lg:flex-row min-h-0 max-h-full overflow-hidden relative", className)}>
      {inDialog && (
        <VisuallyHidden.Root>
          <DialogTitle>{displayBotName}</DialogTitle>
        </VisuallyHidden.Root>
      )}

      <div className="absolute top-0 right-0 w-60 h-60 bg-primary/5 rounded-full blur-[80px] pointer-events-none z-0" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-accent/3 rounded-full blur-[60px] pointer-events-none z-0" />
      {!embedded && (
        <ChatSessionSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={(id) => {
            if (ds.tasksOpen) ds.setTasksOpen(false);
            if (ds.consultantOpen) ds.setConsultantOpen(false);
            setActiveSessionId(id);
          }}
          onCreateSession={async () => {
            if (ds.tasksOpen) ds.setTasksOpen(false);
            if (ds.consultantOpen) ds.setConsultantOpen(false);
            await createSession("New Chat");
          }}
          onDeleteSession={deleteSession}
          onRenameSession={renameSession}
          onUpdateSessionInstructions={updateSessionInstructions}
          isLoading={isLoadingSessions}
          isCreating={isCreatingSession}
          isOpen={ds.sidebarOpen}
          onToggle={ds.toggleSidebar}
          botName={displayBotName}
          botEmoji={botEmoji}
          isAdmin={isAdmin || false}
          tierDisplay={intelligenceStatus.tierDisplay || "Explorer"}
          modelDisplay={getModelDisplayName(
            activeModelOverride || intelligenceStatus.preferredModel || intelligenceStatus.defaultModel,
          )}
          iuRemaining={intelligenceStatus.dailyIURemaining}
          iuLimit={intelligenceStatus.dailyIULimit}
          isUnlimited={intelligenceStatus.isUnlimited || isPersonalBypassUnlimited}
          iuBonus={intelligenceStatus.iuBonus}
          iuBalance={intelligenceStatus.iuBalance}
          profileOpen={ds.profileOpen}
          onOpenProfile={() => ds.setProfileOpen(true)}
          onCloseProfile={ds.setProfileOpen}
          profileTab={ds.profileTab}
          onProfileTabChange={ds.setProfileTab}
          scheduledTasksActive={ds.tasksOpen}
          onOpenScheduledTasks={() => { ds.setTasksOpen(true); }}
          consultantActive={ds.consultantOpen}
          onOpenConsultant={() => { ds.setTasksOpen(false); ds.setConsultantOpen(true); }}
        />
      )}

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden transition-all duration-300 relative">
        {/* Floating Action Cluster */}
        {!embedded && !ds.tasksOpen && !ds.consultantOpen && (
          <div
            className={cn(
              "absolute top-2 right-2 sm:top-3 sm:right-3 z-20 flex items-center gap-0.5 px-1 py-0.5 rounded-full border border-border/30",
              isStreaming ? "bg-card/80" : "bg-card/60 backdrop-blur-sm",
            )}
          >
            <AgenticRuntimeStatus
              isStreaming={isStreaming}
              currentStep={currentStep}
              totalSteps={totalSteps}
              toolCalls={toolCalls}
              completedToolSteps={completedToolSteps}
              totalTokens={telemetry.totalTokens}
              healthStatus={systemHealth.status}
              reasoningEffort={telemetry.reasoningEffort}
              runtimeStatus={runtimeStatus}
            />
            {currentAgentIndicator && (
              <span className="text-[10px] text-primary/70 flex items-center gap-1 px-2 select-none">
                <span>{currentAgentIndicator.emoji}</span>
                <span className="hidden sm:inline font-medium">{currentAgentIndicator.label}</span>
              </span>
            )}
            <button
              onClick={() => ds.setTelemetryOpen((prev) => !prev)}
              className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center transition-colors",
                ds.telemetryOpen
                  ? "bg-primary/20 text-primary"
                  : "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
              )}
              title="System Telemetry"
              aria-label="System Telemetry"
            >
              <Zap className="h-4 w-4" />
            </button>

            <button
              onClick={() => setLocalRuntimeSettingsOpen(true)}
              className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
              title="Local Runtime"
              aria-label="Local Runtime"
            >
              <HardDrive className="h-4 w-4" />
            </button>

            <button
              onClick={handleRefresh}
              className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
              title="Refresh"
              aria-label="Refresh chat"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                title="Close"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {activeSessionId && <MonitoringBannerLoader sessionId={activeSessionId} userId={userId} />}

        <ResourceTelemetryPanel
          isOpen={ds.telemetryOpen && !ds.tasksOpen && !ds.consultantOpen}
          onClose={() => ds.setTelemetryOpen(false)}
          isStreaming={isStreaming}
          currentStep={currentStep}
          totalSteps={totalSteps}
          completedToolSteps={completedToolSteps}
          toolCalls={toolCalls}
          telemetry={telemetry}
        />

        {ds.tasksOpen ? (
          <ScheduledTasksPage userId={userId} onClose={() => ds.setTasksOpen(false)} />
        ) : ds.consultantOpen ? (
          <AgentConsultantPanel
            userId={userId}
            onClose={() => ds.setConsultantOpen(false)}
          />
        ) : (
        <div className={cn("flex-1 min-h-0 overflow-hidden flex flex-col relative", !embedded && "m-1 sm:m-1.5 rounded-glass-container lg:border lg:border-border/30 bg-card/30 backdrop-blur-xl")}>
          <div ref={messageContainerRef} className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
            <MessageSearchOverlay
              open={searchOpen}
              query={searchQuery}
              onQueryChange={setSearchQuery}
              onClose={() => {
                setSearchOpen(false);
                setSearchQuery("");
              }}
              scrollContainerRef={messageContainerRef}
            />
            <ChatMessageList
              onRetry={retryLastMessage}
              messages={messages}
              isLoading={isLoadingMessages}
              isStreaming={isStreaming}
              streamingContent={streamingContent}
              streamingIsError={streamingIsError}
              toolCalls={toolCalls}
              thinkingStatus={thinkingStatus}
              hasSession={!!activeSessionId}
              onCreateSession={async () => {
                await createSession("New Chat");
              }}
              onSendMessage={handleSendMessage}
              botName={botName}
              botEmoji={botEmoji}
              isAdmin={isAdmin || false}
              completedToolSteps={completedToolSteps}
              currentStep={currentStep}
              totalSteps={totalSteps}
              onOpenArtifact={openArtifact}
              accumulatedThoughts={accumulatedThoughts}
              hasMoreMessages={hasMoreMessages}
              onLoadEarlierMessages={loadEarlierMessages}
              onViewSources={handleViewSources}
              activeSourcesMessageId={ds.sourcesMessageId}
              relayRound={relayRound}
              totalRelayRounds={totalRelayRounds}
              streamStartTime={streamStartTime}
              onEditMessage={handleEditMessage}
              onRegenerateMessage={handleRegenerateMessage}
              onDeleteMessage={handleDeleteMessage}
              isResearching={isResearching}
              subTasks={subTasks}
              autonomousTask={autonomousTask.activeTask}
              autonomousTaskStale={autonomousTask.isStale}
              onOpenSubtaskPanel={(taskId) => setSubtaskPanel({ open: true, taskId })}
              toolProgressSteps={toolProgressSteps}
              taskPlanSteps={taskPlanSteps}
              narrationMessages={narrationMessages}
              reasoningEffort={telemetry.reasoningEffort}
              thinkingBlocks={thinkingBlocks}
              searchQuery={searchOpen ? searchQuery : ""}
              onOpenThread={handleOpenThread}
              activeThreadMessageId={activeThreadMessageId}
              threadReplyCounts={threadReplyCounts}
            />
          </div>

          {/* Divider — messages and input share the same glass panel */}
          <div className="shrink-0">
            <ChatInput
              placeholder={embedded ? "Ask BeeBot about this note..." : undefined}
              promptSuggestions={embedded ? ["Summarize note", "Find related", "Improve writing"] : undefined}
              onSend={handleSendMessage}
              isStreaming={isStreaming}
              onCancel={cancelStreaming}
              disabled={isLoadingMessages}
              cooldownUntil={rateLimitedUntil}
              isAdmin={isAdmin || false}
              tierLevel={tierLevel}
              currentModel={intelligenceStatus.preferredModel || intelligenceStatus.defaultModel || "gemini-3.5-flash"}
              onModelChange={handleModelChange}
              enableGoogleProvider={systemAISettings?.enableGoogleProvider ?? true}
              enableAnthropicProvider={systemAISettings?.enableAnthropicProvider ?? false}
              hasAnthropicKey={aiSettings?.hasAnthropicKey ?? false}
              hasSystemGoogleKey={intelligenceStatus.apiKeyStatus?.hasGoogleKey ?? false}
              enabledGeminiModels={systemAISettings?.enabledGeminiModels}
              allowPersonalKey={systemAISettings?.allowPersonalKey ?? true}
              hasPersonalKey={aiSettings?.hasPersonalKey ?? false}
              apiSource={ds.apiSource}
              onApiSourceChange={ds.handleApiSourceChange}
              onOpenApiKeyDialog={(tab?: string) => {
                if (tab) ds.setApiKeyInitialTab(tab);
                else ds.setApiKeyDialogOpen(true);
              }}
              onOpenTavily={() => ds.setTavilyKeyOpen(true)}
              onOpenTelegram={() => ds.setTelegramDialogOpen(true)}
              onOpenSoulEditor={() => ds.setSoulEditorOpen(true)}
              onOpenFacebook={() => ds.setFacebookDialogOpen(true)}
              onOpenNotion={() => ds.setNotionDialogOpen(true)}
              hasTavilyKey={aiSettings?.hasTavilyKey ?? false}
              hasTelegramLink={aiSettings?.hasTelegramLink ?? false}
              hasSoulConfig={!!agentSettings?.custom_instructions}
              hasOpenrouterKey={aiSettings?.hasOpenrouterKey ?? false}
              hasXaiKey={aiSettings?.hasXaiKey ?? false}
              hasFacebookPages={aiSettings?.hasFacebookPages ?? false}
              hasNotionKey={aiSettings?.hasNotionKey ?? false}
              disabledConnectors={(aiSettings?.disabledConnectors ?? []) as string[]}
              onToggleConnector={async (id, enabled) => {
                const current = (aiSettings?.disabledConnectors ?? []) as string[];
                const next = enabled ? current.filter((c: string) => c !== id) : [...current, id];
                await supabase
                  .from("ai_user_settings")
                  .update({ disabled_connectors: next } as any)
                  .eq("user_id", userId);
                queryClient.invalidateQueries({ queryKey: ["user-ai-settings", userId] });
                queryClient.invalidateQueries({ queryKey: ["intelligence-status"] });
              }}
              connectorsDialogOpen={ds.connectorsDialogOpen}
              onConnectorsDialogOpenChange={(open) => ds.setConnectorsDialogOpen(open)}
              connectorsTab={ds.connectorsTab as "apps" | "custom-api"}
              onConnectorsTabChange={ds.setConnectorsTab}
            />
          </div>
        </div>
        )}
      </div>

      <SidebarOrchestrator
        showArtifact={artifactPanelOpen}
        showTools={isSourcesPanelOpen}
        showSubtasks={subtaskPanel.open && !!subtaskPanel.taskId}
        showThread={!!activeThreadMessageId && !!threadSourceMessage}
        artifactPanel={
          <ArtifactPanel
            artifact={activeArtifact}
            isOpen={artifactPanelOpen}
            onClose={closeArtifactPanel}
            onSave={handleSaveArtifact}
          />
        }
        toolsPanel={
          <ToolSourcesPanel
            sources={ds.sourcesMessageId ? selectedMessageSources : liveToolEntries}
            isOpen={isSourcesPanelOpen}
            onClose={ds.handleCloseSources}
          />
        }
        subtaskPanel={
          subtaskPanel.taskId === "__streaming__" ? (
            <AutonomousSubtaskPanel
              taskId="__streaming__"
              task={null}
              steps={[]}
              isStale={false}
              onClose={() => setSubtaskPanel({ open: false, taskId: null })}
              streamingToolSteps={toolProgressSteps}
              streamingTaskPlanSteps={taskPlanSteps}
              completedToolSteps={completedToolSteps}
              narrationMessages={narrationMessages}
            />
          ) : subtaskPanel.taskId ? (
            <AutonomousSubtaskPanel
              taskId={subtaskPanel.taskId}
              task={autonomousTask.activeTask}
              steps={autonomousTask.steps}
              isStale={autonomousTask.isStale}
              onClose={() => setSubtaskPanel({ open: false, taskId: null })}
            />
          ) : null
        }
        threadPanel={
          threadSourceMessage ? (
            <MessageThreadPanel
              userId={userId}
              sourceMessage={threadSourceMessage}
              parentSessionId={activeSessionId}
              botEmoji={botEmoji}
              onClose={() => setActiveThreadMessageId(null)}
            />
          ) : null
        }
      />

      {/* Sub-dialogs — isolated in DialogRouter to prevent ChatMessageList re-renders */}
      <DialogRouter
        ds={ds}
        userId={userId}
        agentSettings={agentSettings}
        creditsExhaustedError={creditsExhaustedError}
        clearCreditsExhaustedError={clearCreditsExhaustedError}
        queryClient={queryClient}
        updateSettings={updateSettings}
        isSavingSoul={isSavingSoul}
      />
      <LocalRuntimeSettingsDialog
        open={localRuntimeSettingsOpen}
        onOpenChange={(nextOpen) => {
          setLocalRuntimeSettingsOpen(nextOpen);
          if (!nextOpen) refreshRuntimeStatus();
        }}
      />
    </div>
  );
}
