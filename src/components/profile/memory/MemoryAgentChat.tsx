// ═══ Memory Agent Chat v4 — Dedicated, Isolated Memory Curator ═══
//
// This is NOT the main BeeBot. It is a parallel, slim agent surface whose
// sole purpose is to capture and curate the user's personal memory.
//
// Isolation guarantees:
//   • Sessions live under metadata.kind = "memory"  →  invisible to /beebot
//   • System prompt scoped to memory-curator mandate via session_instructions
//   • No session sidebar, no main BeeBot history, no content/finance tools
//   • Only memory-relevant tool output is expected (`manage_memory`)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserMemories } from "@/hooks/useUserMemories";
import { useAgentChat } from "@/hooks/useAgentChat";
import { ChatMessageList } from "@/components/agent-chat/ChatMessageList";
import { ChatInput } from "@/components/agent-chat/ChatInput";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  Bot,
  Plus,
  History,
  Star,
  Trash2,
} from "lucide-react";

const MEMORY_CURATOR_INSTRUCTIONS = `You are BeeBot's Memory Curator — a focused sub-agent that ONLY manages the user's personal memory.

YOUR SOLE PURPOSE
• Parse anything the user writes as personal data: preferences, facts, work context, goals, schedule, opinions, relationships, custom rules.
• Use the \`manage_memory\` tool to save, dedupe, promote, pin, or archive memories.
• Briefly confirm what you stored (one or two sentences). Ask only when truly ambiguous.

HARD CONSTRAINTS — NEVER VIOLATE
• Do NOT generate articles, captions, scripts, Morning Briefings, or any long-form content.
• Do NOT call finance, workspace, content-generation, scheduling, or web-search tools.
• Do NOT discuss topics unrelated to the user's personal memory.
• Do NOT produce step-by-step "I will do X in N steps" plans. Just save and confirm.

OUTPUT STYLE
• Short, calm, neutral. No emojis unless the user uses them first.
• If the user writes Burmese, reply in Burmese. Otherwise mirror their language.
• If you saved something, name what was saved (e.g. "Saved your morning routine.").
• If a memory already exists or duplicates one, say so and skip.

You are invisible from main BeeBot. This conversation is for memory curation only.`;

interface Props {
  className?: string;
}

export const MemoryAgentChat = ({ className }: Props) => {
  const { user } = useAuth();
  const { memoryFiles, totalCount } = useUserMemories(user?.id);
  const [historyOpen, setHistoryOpen] = useState(false);

  // ── Isolated agent chat scoped to "memory" kind ──
  const chat = useAgentChat(user?.id || "", {
    kind: "memory",
    defaultTitle: "Memory Session",
    defaultInstructions: MEMORY_CURATOR_INSTRUCTIONS,
  });

  const stats = useMemo(() => {
    let pinned = 0;
    let latest = "";
    for (const f of memoryFiles) {
      for (const m of f.memories) {
        if (m.pinned || (m.priority ?? 0) >= 50) pinned++;
        if (m.created_at && m.created_at > latest) latest = m.created_at;
      }
    }
    return { pinned, latest };
  }, [memoryFiles]);

  const lastUpdatedLabel = useMemo(() => {
    if (!stats.latest) return null;
    try {
      return formatDistanceToNow(new Date(stats.latest), { addSuffix: true });
    } catch {
      return null;
    }
  }, [stats.latest]);

  const ensureSession = useCallback(async () => {
    if (chat.activeSessionId) return chat.activeSessionId;
    const session = await chat.createSession(undefined);
    return session?.id ?? null;
  }, [chat]);

  // ═══ Auto-create first memory session on mount so the surface is immediately usable ═══
  // Without this, users had to click "+" before they could type anything.
  const autoCreatedRef = useRef(false);
  useEffect(() => {
    if (autoCreatedRef.current) return;
    if (!user?.id) return;
    if (chat.isLoadingSessions) return;
    if (chat.activeSessionId) return;
    if (chat.sessions.length > 0) return; // useSessionManager auto-selects existing
    if (chat.isCreatingSession) return;
    autoCreatedRef.current = true;
    chat.createSession(undefined).catch((e) => {
      autoCreatedRef.current = false;
      console.error("[MemoryAgent] auto-create session failed", e);
    });
  }, [user?.id, chat.isLoadingSessions, chat.activeSessionId, chat.sessions.length, chat.isCreatingSession, chat.createSession]);

  const handleNewSession = useCallback(async () => {
    try {
      await chat.createSession(undefined);
    } catch (e) {
      console.error("[MemoryAgent] new session failed", e);
    }
  }, [chat]);

  const handleSend = useCallback(
    async (
      content: string,
      attachments?: { type: "image" | "file"; base64: string; mime_type: string; file_name: string }[],
    ) => {
      const sessionId = await ensureSession();
      if (!sessionId) return;
      await chat.sendMessage(content, false, attachments);
    },
    [chat, ensureSession],
  );

  if (!user?.id) return null;

  return (
    <div
      className={cn(
        "rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card/40 to-card/20 backdrop-blur-sm overflow-hidden flex flex-col",
        className,
      )}
    >
      {/* ── Slim header ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/15 bg-card/20 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative shrink-0">
            <div className="p-1 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/30">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-1 ring-background" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-semibold truncate">Memory Agent</h4>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                Memory only
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground/70 truncate flex items-center gap-1.5">
              <span className="text-primary font-medium">{totalCount}</span>
              <span>memories</span>
              {stats.pinned > 0 && (
                <>
                  <span>·</span>
                  <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                  <span>{stats.pinned} pinned</span>
                </>
              )}
              {lastUpdatedLabel && (
                <span className="hidden sm:inline">· updated {lastUpdatedLabel}</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Start a new memory session"
            onClick={handleNewSession}
            disabled={chat.isCreatingSession}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>

          <DropdownMenu open={historyOpen} onOpenChange={setHistoryOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Memory session history"
              >
                <History className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Memory sessions
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {chat.sessions.length === 0 ? (
                <div className="px-2 py-3 text-[11px] text-muted-foreground text-center">
                  No memory sessions yet.
                </div>
              ) : (
                chat.sessions.slice(0, 12).map((s) => {
                  const isActive = s.id === chat.activeSessionId;
                  return (
                    <DropdownMenuItem
                      key={s.id}
                      className={cn(
                        "flex items-center justify-between gap-2 text-xs",
                        isActive && "bg-primary/10 text-primary",
                      )}
                      onClick={() => {
                        chat.setActiveSessionId(s.id);
                        setHistoryOpen(false);
                      }}
                    >
                      <span className="truncate flex-1">{s.title || "Memory Session"}</span>
                      <button
                        type="button"
                        className="opacity-60 hover:opacity-100 hover:text-destructive shrink-0"
                        title="Delete session"
                        onClick={(e) => {
                          e.stopPropagation();
                          chat.deleteSession(s.id).catch(console.error);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </DropdownMenuItem>
                  );
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Message stream ── */}
      <div className="h-[420px] sm:h-[480px] flex flex-col min-h-0 bg-background/40">
        <ChatMessageList
          messages={chat.messages}
          isLoading={chat.isLoadingMessages}
          isStreaming={chat.isStreaming}
          streamingContent={chat.streamingContent}
          streamingIsError={chat.streamingIsError}
          toolCalls={chat.toolCalls}
          thinkingStatus={chat.thinkingStatus}
          hasSession={!!chat.activeSessionId}
          onCreateSession={handleNewSession}
          onSendMessage={handleSend}
          botName="Memory Agent"
          botEmoji="🧠"
          isAdmin={false}
          mode="memory"
          completedToolSteps={chat.completedToolSteps}
          currentStep={chat.currentStep}
          totalSteps={chat.totalSteps}
          accumulatedThoughts={chat.accumulatedThoughts}
          hasMoreMessages={chat.hasMoreMessages}
          onLoadEarlierMessages={chat.loadEarlierMessages}
          relayRound={chat.relayRound}
          totalRelayRounds={chat.totalRelayRounds}
          streamStartTime={chat.streamStartTime}
          isResearching={chat.isResearching}
          subTasks={chat.subTasks}
          toolProgressSteps={chat.toolProgressSteps}
          taskPlanSteps={chat.taskPlanSteps}
          narrationMessages={chat.narrationMessages}
        />

        {/* ── Composer ── */}
        <div className="border-t border-border/15 bg-card/30 shrink-0">
          <ChatInput
            onSend={handleSend}
            isStreaming={chat.isStreaming}
            onCancel={chat.cancelStreaming}
            disabled={false}
            isAdmin={false}
            tierLevel={0}
          />
        </div>
      </div>
    </div>
  );
};
