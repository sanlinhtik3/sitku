// ═══ MessageThreadPanel — sub-conversation that reuses ChatMessage + ChatInput ═══
// Phase 4 + 5 hardening:
//  - Real cancel wired to useMessageThread.cancelStreaming
//  - Bilingual empty-state + Apply toast
//  - Apply button hidden when source is a user message
//  - a11y: role/aria-live/aria-busy/aria-keyshortcuts, Esc handler
//  - Smart auto-scroll (only when near bottom, throttled via rAF)
//  - Collapsible long source messages (>1000 chars)
//  - Retry button on error
//  - Mobile: swipe-down-to-close, safe-area inset on input

import { memo, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { X, Loader2, Sparkles, CheckCircle2, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { useMessageThread } from "@/hooks/agent-chat/useMessageThread";
import type { AgentChatMessage } from "@/hooks/agent-chat/types";
import { ChatMessage } from "../ChatMessage";
import { ChatInput } from "../ChatInput";
import { MessageErrorBoundary } from "../MessageErrorBoundary";
import { toast } from "sonner";

/** Defensive normalizer — ensures every field rendered downstream is a safe shape.
 *  Prevents `Cannot read properties of undefined (reading 'length')` crashes
 *  when a partial/in-flight message row arrives with missing arrays/strings. */
function normalizeMessage(m: AgentChatMessage | null | undefined): AgentChatMessage | null {
  if (!m || typeof m !== "object") return null;
  return {
    ...m,
    content: typeof m.content === "string" ? m.content : "",
    attachments: Array.isArray(m.attachments) ? m.attachments : null,
    tool_calls: Array.isArray(m.tool_calls) ? m.tool_calls : undefined,
    tool_results: Array.isArray(m.tool_results) ? m.tool_results : undefined,
    thoughts: Array.isArray(m.thoughts) ? m.thoughts : null,
    subTasks: Array.isArray(m.subTasks) ? m.subTasks : undefined,
    is_error: !!m.is_error,
    created_at: m.created_at || new Date().toISOString(),
  } as AgentChatMessage;
}

interface MessageThreadPanelProps {
  userId: string;
  sourceMessage: AgentChatMessage;
  parentSessionId?: string | null;
  botEmoji?: string;
  onClose: () => void;
}

const SOURCE_COLLAPSE_THRESHOLD = 1000;
const NEAR_BOTTOM_PX = 120;

export const MessageThreadPanel = memo(function MessageThreadPanel({
  userId,
  sourceMessage,
  parentSessionId,
  botEmoji = "🐝",
  onClose,
}: MessageThreadPanelProps) {
  const {
    threadId,
    messages,
    isStreaming,
    streamingContent,
    error,
    sendMessage,
    cancelStreaming,
    applyToSource,
    undoApply,
    replyCount,
  } = useMessageThread({
    userId,
    sourceMessageId: sourceMessage.id,
    sourceContentPreview: sourceMessage.content || "",
    parentSessionId,
  });

  const [applying, setApplying] = useState(false);
  const [sourceExpanded, setSourceExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const scrollRafRef = useRef(false);
  const lastUserMessageRef = useRef<string>("");

  // ── Smart scroll (only when near bottom) ──
  const isNearBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return true;
    return el.scrollHeight - (el.scrollTop + el.clientHeight) < NEAR_BOTTOM_PX;
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = true;
    requestAnimationFrame(() => {
      userScrolledUpRef.current = !isNearBottom();
      scrollRafRef.current = false;
    });
  }, [isNearBottom]);

  useEffect(() => {
    if (userScrolledUpRef.current) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, streamingContent]);

  // Reset scroll-lock when stream ends
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      userScrolledUpRef.current = false;
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // ── Esc handler: stream-running → cancel; else → close ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isStreaming) {
        cancelStreaming();
        toast.info("Stopped");
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isStreaming, cancelStreaming, onClose]);

  // ── Mobile: swipe-down-to-close ──
  const touchStartYRef = useRef<number | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0]?.clientY ?? null;
  }, []);
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStartYRef.current;
      touchStartYRef.current = null;
      if (start == null) return;
      const end = e.changedTouches[0]?.clientY ?? start;
      const dy = end - start;
      // Only close on swipe initiated near top (header zone) to avoid hijacking scroll
      if (dy > 80 && start < 80) onClose();
    },
    [onClose],
  );

  const handleSend = useCallback(
    async (
      content: string,
      attachments?: { type: "image" | "file"; base64: string; mime_type: string; file_name: string }[],
    ) => {
      if (!threadId || isStreaming) return;
      lastUserMessageRef.current = content;
      // Sending implies user wants to follow new content
      userScrolledUpRef.current = false;
      sendMessage(content, attachments);
    },
    [threadId, isStreaming, sendMessage],
  );

  const handleApply = useCallback(async () => {
    setApplying(true);
    const result = await applyToSource();
    setApplying(false);
    if (result.ok) {
      toast.success("ပြန်ပြင်ပြီးပါပြီ · Applied to original", {
        description: "ပြန်ဖျက်ဖို့ Undo နှိပ်ပါ",
        action: {
          label: "Undo",
          onClick: async () => {
            const ok = await undoApply();
            if (ok) toast.success("ပြန်ဖျက်ပြီးပါပြီ · Reverted to previous content");
            else toast.error("Could not undo");
          },
        },
      });
      onClose();
    } else {
      toast.error("Nothing to apply yet");
    }
  }, [applyToSource, undoApply, onClose]);

  const handleRetry = useCallback(() => {
    const last = lastUserMessageRef.current?.trim();
    if (!last) {
      toast.info("Type a message to retry");
      return;
    }
    sendMessage(last);
  }, [sendMessage]);

  const safeMessages = useMemo(
    () => (Array.isArray(messages) ? messages.map(normalizeMessage).filter(Boolean) as AgentChatMessage[] : []),
    [messages],
  );
  const safeSourceMessage = useMemo(() => normalizeMessage(sourceMessage), [sourceMessage]);

  const lastAssistantHasContent = safeMessages.some((m) => m.role === "assistant" && m.content?.trim());
  const sourceIsUser = safeSourceMessage?.role === "user";

  // ── Collapsible source ──
  const sourceContent = safeSourceMessage?.content || "";
  const isLongSource = sourceContent.length > SOURCE_COLLAPSE_THRESHOLD;
  const collapsedSourceMessage = useMemo<AgentChatMessage | null>(() => {
    if (!safeSourceMessage) return null;
    if (!isLongSource || sourceExpanded) return safeSourceMessage;
    return {
      ...safeSourceMessage,
      content: sourceContent.slice(0, SOURCE_COLLAPSE_THRESHOLD).trimEnd() + " …",
    };
  }, [safeSourceMessage, sourceContent, isLongSource, sourceExpanded]);

  // Synthesize a streaming placeholder shaped like AgentChatMessage so we can
  // render it through the same <ChatMessage> component as everything else.
  const streamingMessage = useMemo<AgentChatMessage | null>(() => {
    if (!isStreaming) return null;
    return normalizeMessage({
      id: "__thread_streaming__",
      session_id: threadId || "",
      user_id: userId,
      role: "assistant",
      content: streamingContent || "...",
      is_error: false,
      created_at: new Date().toISOString(),
    } as AgentChatMessage);
  }, [isStreaming, streamingContent, threadId, userId]);

  return (
    <div
      role="complementary"
      aria-label="Message thread sub-conversation"
      className="flex flex-col h-full max-h-full overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2.5 bg-transparent">
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">Thread</div>
            <div className="text-[10px] text-muted-foreground/70 leading-tight">
              {replyCount > 0
                ? `${replyCount} ${replyCount === 1 ? "reply" : "replies"}`
                : "Refine this message"}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close thread"
          aria-keyshortcuts="Escape"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Single continuous conversation: source + replies + streaming ── */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-busy={isStreaming}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-2 sm:px-3 py-2 space-y-4"
      >
        {/* Source message — rendered with the same <ChatMessage> as the main chat */}
        {collapsedSourceMessage && (
          <MessageErrorBoundary messageId={collapsedSourceMessage.id}>
            <ChatMessage message={collapsedSourceMessage} botEmoji={botEmoji} skipAnimation />
          </MessageErrorBoundary>
        )}

        {isLongSource && (
          <div className="flex justify-center -mt-2">
            <button
              type="button"
              onClick={() => setSourceExpanded((v) => !v)}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/50 px-2 py-0.5 rounded-full border border-border/30 transition-colors"
              aria-expanded={sourceExpanded}
            >
              {sourceExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3" /> Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" /> Show full source
                </>
              )}
            </button>
          </div>
        )}

        {/* Replies */}
        {safeMessages.map((msg) => (
          <MessageErrorBoundary key={msg.id} messageId={msg.id}>
            <ChatMessage message={msg} botEmoji={botEmoji} skipAnimation />
          </MessageErrorBoundary>
        ))}

        {/* Streaming reply */}
        {streamingMessage && (
          <MessageErrorBoundary messageId={streamingMessage.id}>
            <ChatMessage message={streamingMessage} botEmoji={botEmoji} isStreaming skipAnimation />
          </MessageErrorBoundary>
        )}

        {/* Empty hint — bilingual */}
        {safeMessages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center text-center px-4 py-6">
            <Sparkles className="h-5 w-5 text-primary/60 mb-2" aria-hidden="true" />
            <p className="text-xs text-muted-foreground max-w-[260px]">
              ဒီ message ကို ပြန်ပြင်ချင်တာ၊ ပိုကောင်းအောင် လုပ်ချင်တာ၊ ထပ်မေးချင်တာ ဘာမဆို စပြောလိုက်ပါ။
            </p>
            <p className="text-[11px] text-muted-foreground/70 max-w-[260px] mt-1.5">
              Ask a follow-up, refine wording, or request a rewrite — replies stay scoped to this message.
            </p>
            <p className="text-[10px] text-muted-foreground/50 mt-2 font-mono">Esc to close · ⌘/Ctrl+Enter to send</p>
          </div>
        )}

        {error && (
          <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">{error}</span>
            {lastUserMessageRef.current && (
              <button
                type="button"
                onClick={handleRetry}
                className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/15 hover:bg-destructive/25 text-destructive text-[10px] font-medium border border-destructive/30 transition-colors"
                aria-label="Retry last message"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Apply button + shared ChatInput ── */}
      <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">
        <AnimatePresence>
          {lastAssistantHasContent && !sourceIsUser && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="px-2 sm:px-3 pt-2"
            >
              <button
                onClick={handleApply}
                disabled={applying}
                aria-label="Apply latest reply to original message (with undo)"
                className={cn(
                  "w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg",
                  "text-[11px] font-medium",
                  "bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30",
                  "transition-colors disabled:opacity-50",
                )}
              >
                {applying ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                )}
                Apply latest reply to original message
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <ChatInput
          onSend={handleSend}
          isStreaming={isStreaming}
          onCancel={cancelStreaming}
          disabled={!threadId}
        />
      </div>
    </div>
  );
});
