import React, { memo, useMemo, useState, useRef, useEffect } from "react";
import { User, Sparkles, AlertCircle, ImageIcon, Send, RotateCcw, Pencil, Check, X, Loader2, Zap, Trash2, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentChatMessage } from "@/hooks/useAgentChat";
import { AgentMarkdownContent } from "./AgentMarkdownContent";
import { MarkdownContent } from "@/components/lesson/MarkdownContent";
import { format } from "date-fns";
import { ContentActionButtons } from "./ContentActionButtons";
import { motion } from "motion/react";
import { ArtifactCard, detectArtifact } from "./ArtifactCard";

import { MessageActionBar } from "./MessageActionBar";
import { ThinkingAccordion, ThinkingStep } from "./ThinkingAccordion";
import { SourcesPill } from "./SourcesPill";
import { FileDownloadCard } from "./FileDownloadCard";
import { GeneratedImageCard } from "./GeneratedImageCard";
import { MessageAttachments } from "./MessageAttachments";
import { InlineWidgetCard } from "./InlineWidgetCard";
import { SubAgentTracePanel } from "./SubAgentTracePanel";
import { isPlaceholderOrLeakContent, getDraftContentResult, getGeneratedImages, getFileDownloads, getWidgets } from "./message-utils";
import { Bot, ChevronRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useLongPress } from "@/hooks/useLongPress";
import { MessageActionSheet } from "./MessageActionSheet";
import { ToolResultRenderer, shouldRenderInline } from "./tool-renderers/registry";

// ═══ THINKING LEAK SAFETY NET ═══
const THINKING_LEAK_PATTERNS = [
  /\[Thinking:?\]\s*\n[\s\S]*?(?=\n(?:##|\*\*|🐝|[\u1000-\u109F])|$)/gi,
  /\[Thinking:?\][^\n]*\n?/gi,
  /^(The user is asking|The user wants|The user has asked|The user needs)[^.]*\.\s*\n?/gmi,
  /^(I have already provided|From the previous|I should present|I can use the information)[^.]*\.\s*\n?/gmi,
  /^(Plan:\s*\n|Response Construction:|Let's use the )[^\n]*\n?/gmi,
  /^(I will now|I'll now|Now I need to|Now let me|Let me analyze)[^.]*\.\s*\n?/gmi,
  // Gemini native code execution syntax leaks
  /<tool_code>[\s\S]*?<\/tool_code>/g,
  /<tool_code>[\s\S]*$/g, // unclosed during streaming
  // Markdown code block tool-call JSON leaks (Gemini alternative format)
  /```(?:json)?\s*\n?\s*\{[^}]*"tool_(?:code|name)"[\s\S]*?```/g,
  /```(?:json)?\s*\n?\s*\{[^}]*"tool_(?:code|name)"[\s\S]*$/g, // unclosed
  // Generic inline tool-call JSON leak — matches any tool name (snake_case)
  /\{"name"\s*:\s*"[a-z][a-z0-9_]*"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}/g,
  // Truncated/unclosed tool-call JSON during streaming
  /\{"name"\s*:\s*"[a-z][a-z0-9_]*"\s*,\s*"arguments"\s*:\s*\{[\s\S]*$/g,
];

function stripThinkingLeaks(content: string): string {
  if (!content) return content;
  let cleaned = content;
  for (const pattern of THINKING_LEAK_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  return cleaned.replace(/^\s*\n+/, '').trim();
}

const StreamingText = memo(function StreamingText({ content }: { content: string }) {
  return <span className="whitespace-pre-wrap">{content}</span>;
});

const FinalMarkdown = memo(function FinalMarkdown({ content }: { content: string }) {
  const cleanContent = useMemo(() => stripThinkingLeaks(content), [content]);
  return <AgentMarkdownContent content={cleanContent} />;
});

/**
 * StagedStreamingContent — atomic markdown block streaming (OpenClaw-style).
 * Holds half-formed syntax (open code fences, partial tables, lone `**`/`*`,
 * partial headings) in a plain text tail until the closing token arrives, then
 * promotes the completed prefix to a fully rendered markdown block. Eliminates
 * the flicker of literal `**`, `###`, half-fenced code, broken table pipes.
 */
const StagedStreamingContent = memo(function StagedStreamingContent({ content }: { content: string }) {
  const { completedPart, trailingPart } = useMemo(() => {
    if (!content) return { completedPart: "", trailingPart: "" };

    // 1. Open (unclosed) code fence — keep entire fence in trailing tail
    //    so it never renders as plaintext flash before the closing ```.
    const fenceMatches = content.match(/```/g);
    if (fenceMatches && fenceMatches.length % 2 === 1) {
      const lastFence = content.lastIndexOf("```");
      const before = content.slice(0, lastFence).replace(/\s+$/, "");
      const tail = content.slice(lastFence);
      return { completedPart: before, trailingPart: tail };
    }

    // 2. Find the latest "safe" block boundary (paragraph break or block start)
    const blockMarkerPattern = /\n(?=\n|#{1,6}\s|[-*+]\s|\d+\.\s|```|>|\|)/g;
    let lastSafeBreak = -1;
    let match: RegExpExecArray | null;
    while ((match = blockMarkerPattern.exec(content)) !== null) {
      lastSafeBreak = match.index;
    }
    if (lastSafeBreak <= 0) {
      // No block boundary yet — entire content is "in progress"
      return { completedPart: "", trailingPart: content };
    }

    let safe = content.slice(0, lastSafeBreak);
    let tail = content.slice(lastSafeBreak).replace(/^\n/, "");

    // 3. Hold lone unmatched `**` (bold) or `*` (italic) at end of safe part
    //    so it doesn't render as a literal asterisk for a frame.
    const trimmed = safe.trimEnd();
    if (/(\*\*|\*|_|`)[^*_`\n]{0,40}$/.test(trimmed)) {
      // Find start of the unmatched marker, push everything from there into tail
      const m = trimmed.match(/(\*\*|\*|_|`)[^*_`\n]{0,40}$/);
      if (m && m.index !== undefined) {
        const cut = m.index;
        tail = safe.slice(cut) + (tail ? "\n" + tail : "");
        safe = safe.slice(0, cut);
      }
    }

    // 4. Hold a partial table row (line starting with `|` but no trailing newline)
    //    so we never flash `| col1 | col` before the row completes.
    const lastNl = safe.lastIndexOf("\n");
    const lastLine = safe.slice(lastNl + 1);
    if (lastLine.startsWith("|") && !lastLine.endsWith("|")) {
      tail = lastLine + (tail ? "\n" + tail : "");
      safe = safe.slice(0, lastNl < 0 ? 0 : lastNl);
    }

    return { completedPart: safe, trailingPart: tail };
  }, [content]);

  if (!completedPart) {
    return <span className="whitespace-pre-wrap streaming-tail" key={trailingPart.length}>{trailingPart}</span>;
  }
  return (
    <>
      <AgentMarkdownContent content={completedPart} />
      {trailingPart && (
        <span className="whitespace-pre-wrap streaming-tail opacity-90" key={trailingPart.length}>
          {trailingPart}
        </span>
      )}
    </>
  );
});

/**
 * VelocityCursor — Claude/Kimi-style thin caret that pulses with token velocity.
 * - Active streaming (token in last 250ms) → fast pulse
 * - Idle gap (250ms–800ms)                  → slow breath
 * - Stalled (>800ms)                        → dim fade
 * - isEnding (stream finished)              → 220ms fade-out then unmount
 */
const VelocityCursor = memo(function VelocityCursor({
  contentLength,
  isEnding = false,
}: { contentLength: number; isEnding?: boolean }) {
  const [phase, setPhase] = useState<"active" | "idle" | "stalled">("active");
  const [unmount, setUnmount] = useState(false);
  const lastChange = useRef<number>(Date.now());
  const lastLen = useRef<number>(contentLength);

  useEffect(() => {
    if (contentLength !== lastLen.current) {
      lastLen.current = contentLength;
      lastChange.current = Date.now();
      setPhase("active");
    }
  }, [contentLength]);

  useEffect(() => {
    if (isEnding) return;
    const id = setInterval(() => {
      const gap = Date.now() - lastChange.current;
      setPhase(gap < 250 ? "active" : gap < 800 ? "idle" : "stalled");
    }, 200);
    return () => clearInterval(id);
  }, [isEnding]);

  useEffect(() => {
    if (!isEnding) return;
    const t = setTimeout(() => setUnmount(true), 240);
    return () => clearTimeout(t);
  }, [isEnding]);

  if (unmount) return null;
  const cls = isEnding ? "velocity-cursor--ending" : `velocity-cursor--${phase}`;
  return <span className={cn("velocity-cursor", cls)} aria-hidden="true" />;
});

/**
 * WarmingShimmer — Claude-style 3-dot wave shown when isStreaming=true but no
 * content has arrived yet. Removes the "did my message even send?" feeling
 * during the first-token gap on slow networks.
 */
const WarmingShimmer = memo(function WarmingShimmer() {
  return (
    <span className="warming-shimmer" aria-label="Assistant is preparing a response">
      <span className="warming-shimmer__dot" />
      <span className="warming-shimmer__dot" />
      <span className="warming-shimmer__dot" />
    </span>
  );
});

export interface ChatMessageProps {
  message: AgentChatMessage;
  isStreaming?: boolean;
  onSendMessage?: (message: string) => void;
  botEmoji?: string;
  botName?: string;
  isAdmin?: boolean;
  thoughts?: ThinkingStep[];
  skipAnimation?: boolean;
  onViewSources?: (messageId: string) => void;
  activeSourcesMessageId?: string | null;
  onOpenArtifact?: (artifact: import("./ArtifactPanel").Artifact) => void;
  onRetry?: () => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRegenerateMessage?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onOpenThread?: (messageId: string) => void;
  activeThreadMessageId?: string | null;
  threadReplyCount?: number;
}

export const ChatMessage = memo(
  function ChatMessage({
    message, isStreaming, onSendMessage, botEmoji = "🐝", botName = "BeeBot",
    isAdmin = false, thoughts, skipAnimation = false,
    onViewSources, activeSourcesMessageId, onOpenArtifact, onRetry,
    onEditMessage, onRegenerateMessage, onDeleteMessage,
    onOpenThread, activeThreadMessageId, threadReplyCount,
  }: ChatMessageProps) {
    const isUser = message.role === "user";
    const isError = message.is_error;
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState("");
    const [copiedUserMsg, setCopiedUserMsg] = useState(false);
    const [actionSheetOpen, setActionSheetOpen] = useState(false);

    // Long-press → bottom-sheet of message actions (Copy/Edit/Regenerate/Branch/Delete).
    // Disabled while the message is the active streaming reply (no actions valid yet).
    const longPressHandlers = useLongPress(
      () => setActionSheetOpen(true),
      { disabled: isStreaming || message.id === "streaming" || isEditing },
    );
    const { user } = useAuth();
    const userDisplayName = useMemo(() => {
      const meta: any = user?.user_metadata || {};
      return (meta.full_name || meta.name || meta.user_name || user?.email?.split("@")[0] || "You") as string;
    }, [user]);
    const userAvatarUrl = (user?.user_metadata as any)?.avatar_url || (user?.user_metadata as any)?.picture || null;
    const userInitials = useMemo(() => {
      const parts = userDisplayName.trim().split(/\s+/).slice(0, 2);
      return parts.map(p => p[0]?.toUpperCase() || "").join("") || "U";
    }, [userDisplayName]);
    const displayBotName = isAdmin ? `Super ${botName}` : botName;

    const handleCopyUserMessage = async () => {
      if (!message.content) return;
      try {
        await navigator.clipboard.writeText(message.content);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = message.content;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedUserMsg(true);
      setTimeout(() => setCopiedUserMsg(false), 1500);
    };
    const editRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
      if (isEditing && editRef.current) {
        editRef.current.focus();
        editRef.current.style.height = "auto";
        editRef.current.style.height = Math.min(editRef.current.scrollHeight, 200) + "px";
      }
    }, [isEditing, editContent]);

    const handleStartEdit = () => { setEditContent(message.content || ""); setIsEditing(true); };
    const handleCancelEdit = () => { setIsEditing(false); setEditContent(""); };
    const handleSaveEdit = () => {
      const trimmed = editContent.trim();
      if (!trimmed || trimmed === message.content?.trim()) { handleCancelEdit(); return; }
      onEditMessage?.(message.id, trimmed);
      setIsEditing(false);
      setEditContent("");
    };
    const handleEditKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Escape") handleCancelEdit();
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
    };

    const toolCount = useMemo(() => message.tool_results?.length || 0, [message.tool_results]);
    const draftResult = getDraftContentResult(message);
    const hasDraftContent = !!draftResult;
    const isFallback = draftResult?.is_fallback === true;
    const fileDownloads = getFileDownloads(message);
    const generatedImages = getGeneratedImages(message);
    const widgets = getWidgets(message);

    const hasToolResults = message.tool_results && message.tool_results.length > 0;
    const cannedFallbackRegex = /ပြည့်စုံသော အဖြေ မပြုစုနိုင်|couldn't compose a complete answer|i couldn't compose|unable to compose/i;
    const isCannedFallbackWithRichOutput =
      (widgets.length > 0 || generatedImages.length > 0 || fileDownloads.length > 0) &&
      !!message.content &&
      cannedFallbackRegex.test(message.content);
    // Hide placeholder/leak content always — even when no tool results exist —
    // so model echoes like "Let me check..." don't render to the user.
    const shouldHideContent = !isUser && (
      isCannedFallbackWithRichOutput ||
      isPlaceholderOrLeakContent(message.content)
    );

    // ═══ Thought Reconciliation: fix historical "No result received" when tool_results show success ═══
    const rawThoughts = thoughts || message.thoughts || [];
    const displayThoughts = useMemo(() => {
      if (!rawThoughts.length || !message.tool_results?.length) return rawThoughts;
      return rawThoughts.map((t: any) => {
        if (t.status === "error" && (t.detail === "No result received" || !t.detail)) {
          const matchingResult = (message.tool_results as any[])?.find(
            (tr: any) => t.tool_name && tr.name === t.tool_name && !tr.error
          );
          if (matchingResult) {
            const summary = typeof matchingResult.result === 'object'
              ? JSON.stringify(matchingResult.result).slice(0, 200)
              : String(matchingResult.result).slice(0, 200);
            return { ...t, status: "done", detail: summary };
          }
        }
        return t;
      });
    }, [rawThoughts, message.tool_results]);

    // Autonomous Mode removed (2026-04). Legacy `isAutonomous` metadata is
    // ignored — historical autonomous messages now render as normal replies.
    const isAutonomous = false;
    const autonomousData: any = null;

    const detectedArtifact = useMemo(() => {
      return null;
    }, []);

    // ═══ Manus-style Autonomous Block ═══
    if (isAutonomous) {
      const currentStep = autonomousData.currentStep || 0;
      const totalSteps = autonomousData.totalSteps || 1;
      const status = autonomousData.status || "thinking";
      const steps = autonomousData.steps || [];

      return (
        <div className={cn("flex gap-3 gpu-layer group/msg w-full max-w-2xl mx-auto", !skipAnimation && "animate-message-in")}>
          {/* Manus-style inline identity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">{botEmoji}</span>
              <span className="text-xs font-semibold text-foreground/80">BeeBot</span>
              <div className={cn(
                "h-1.5 w-1.5 rounded-full",
                status === 'done' ? "bg-emerald-500" : status === 'thinking' ? "bg-primary animate-pulse" : "bg-primary animate-pulse"
              )} />
              <span className="text-[10px] text-muted-foreground font-medium capitalize">{status}</span>
            </div>

             {/* Clean task card — Glassmorphic */}
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-glass-card overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.12)]">
              {/* Header */}
              <div className="px-4 py-3 flex items-center justify-between border-b border-white/[0.06]">
                <span className="text-xs text-muted-foreground">
                  {status === 'done' ? "Task completed" : "Working on task..."}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {currentStep}/{totalSteps}
                </span>
              </div>

              {/* Step list */}
              {steps.length > 0 && (
                <div className="px-4 py-3 space-y-1.5">
                  {steps.map((step: any, idx: number) => (
                    <motion.div
                      key={step.id || idx}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className="flex items-center gap-2.5"
                    >
                      <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                        {step.status === 'done' ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : step.status === 'loading' ? (
                          <Loader2 className="h-3 w-3 text-primary animate-spin" />
                        ) : (
                          <div className="h-2.5 w-2.5 rounded-full border border-muted-foreground/30" />
                        )}
                      </div>
                      <span className={cn(
                        "text-xs",
                        step.status === 'done' ? "text-muted-foreground" :
                        step.status === 'loading' ? "text-foreground font-medium" :
                        "text-muted-foreground/40"
                      )}>
                        {step.title}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Final content */}
              {status === 'done' && message.content && (
                <div className="px-4 py-3 border-t border-border/20">
                  <FinalMarkdown content={message.content} />
                  {detectedArtifact && onOpenArtifact && (
                    <div className="mt-3">
                      <ArtifactCard artifact={detectedArtifact} onClick={() => onOpenArtifact(detectedArtifact)} />
                    </div>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="px-4 py-2 border-t border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    status === 'done' ? "bg-emerald-500" : status === 'thinking' ? "bg-amber-400 animate-pulse" : "bg-primary animate-pulse"
                  )} />
                  <span className="text-[10px] text-muted-foreground/60">Autonomous Mode</span>
                </div>
                <span className="text-[10px] text-muted-foreground/40 font-mono">
                  {format(new Date(message.created_at), "HH:mm")}
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ═══ Standard Message Layout — Avatar + name above bubble, aligned by role ═══
    return (
      <div
        className={cn("gpu-layer group/msg w-full flex", isUser ? "justify-end" : "justify-start", !skipAnimation && "animate-message-in")}
        {...longPressHandlers}
      >
        <div className={cn("min-w-0 max-w-[85%] sm:max-w-[80%] flex flex-col", isUser ? "items-end" : "items-start")}>
          {/* Header row above the bubble: avatar + name (+ optional model badge) */}
          <div className={cn("flex items-center gap-2 mb-1.5 px-0.5", isUser ? "flex-row-reverse" : "flex-row")}>
            {isUser ? (
              <Avatar className="h-6 w-6 ring-1 ring-border/30">
                {userAvatarUrl && <AvatarImage src={userAvatarUrl} alt={userDisplayName} />}
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white text-[10px] font-semibold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div className={cn(
                "h-6 w-6 rounded-full flex items-center justify-center text-sm ring-1 ring-border/30",
                isError ? "bg-destructive/10" : "bg-gradient-to-br from-primary/15 to-primary/5"
              )}>
                <span className="leading-none">{isError ? "⚠️" : botEmoji}</span>
              </div>
            )}
            <span className="text-xs font-semibold text-foreground/85 leading-none">
              {isUser ? userDisplayName : displayBotName}
            </span>
            {!isUser && (() => {
              const model = (message as any).metadata?.model_used || (message as any).model_used;
              if (!model) return null;
              const lower = (model as string).toLowerCase();
              const badge = lower.includes("pro") ? "Pro" : lower.includes("flash") ? "Flash" : lower.includes("nano") ? "Nano" : null;
              if (!badge) return null;
              return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground font-medium leading-none">{badge}</span>;
            })()}
          </div>



          {!isUser && displayThoughts.length > 0 && (
            <ThinkingAccordion thoughts={displayThoughts} isStreaming={isStreaming} hasContent={!!message.content?.trim()} className="mb-2" />
          )}

          {!shouldHideContent && (message.content?.trim().length > 0 || (isUser && message.attachments?.length)) && (
            <div className={cn("rounded-[var(--glass-radius-card)] w-fit max-w-full overflow-hidden", (message.isResearching || (message.subTasks && message.subTasks.length > 0)) && !isUser ? "p-0 bg-transparent border-0" : "px-4 py-2.5", isUser ? "bg-primary/10 border border-primary/25 text-foreground" : isError ? "bg-destructive/10 border border-destructive/30 text-destructive" : (message.isResearching || (message.subTasks && message.subTasks.length > 0)) ? "" : cn("bg-card/30 border border-border/20", isStreaming ? "border-primary/50 relative z-[1]" : "backdrop-blur-sm"))}>
              {isUser ? (
                <div className="space-y-2">
                  {message.attachments && message.attachments.length > 0 && <MessageAttachments attachments={message.attachments} />}
                  {isEditing ? (
                    <div className="space-y-2 min-w-[200px]">
                      <textarea
                        ref={editRef}
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                        className="w-full text-sm bg-transparent border border-primary/30 rounded-glass-control px-3 py-2 outline-none focus:border-primary/60 resize-none min-h-[36px] max-h-[200px]"
                        rows={1}
                      />
                      <div className="flex items-center gap-1.5 justify-end">
                        <button onClick={handleCancelEdit} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" title="Cancel (Esc)">
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={handleSaveEdit} disabled={!editContent.trim() || editContent.trim() === message.content?.trim()} className="p-1.5 rounded-md text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" title="Save & Resend (Enter)">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      {message.content && <p className="text-sm whitespace-pre-wrap">{message.content}</p>}
                      {!isStreaming && (
                        <div className="absolute -top-1 -right-1 flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-all duration-150">
                          {onEditMessage && (
                            <button onClick={handleStartEdit} className="p-1 rounded-md bg-card/80 border border-border/30 text-muted-foreground hover:text-foreground hover:bg-muted/80 backdrop-blur-sm" title="Edit message">
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                          {message.content && (
                            <button onClick={handleCopyUserMessage} className="p-1 rounded-md bg-card/80 border border-border/30 text-muted-foreground hover:text-foreground hover:bg-muted/80 backdrop-blur-sm" title={copiedUserMsg ? "Copied" : "Copy message"}>
                              {copiedUserMsg ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
                            </button>
                          )}
                          {onDeleteMessage && (
                            <button onClick={() => onDeleteMessage(message.id)} className="p-1 rounded-md bg-card/80 border border-destructive/30 text-muted-foreground hover:text-destructive hover:bg-destructive/10 backdrop-blur-sm" title="Delete message">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm relative">
                  {(message.isResearching || (message.subTasks && message.subTasks.length > 0)) ? (
                    <div className="flex flex-col w-full">
                      {/* Working Block — Manus-style */}
                     <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-glass-card p-3 space-y-1.5 w-full shadow-[0_0_24px_rgba(0,0,0,0.08)]">
                         <div className="flex items-center gap-2 mb-2">
                           <div className={cn("h-2 w-2 rounded-full", isStreaming ? "bg-amber-400 animate-pulse" : "bg-emerald-500")} />
                          <span className="text-xs font-medium text-foreground/80">
                            {isStreaming ? "Working..." : "Completed"}
                          </span>
                        </div>
                        
                        {message.subTasks?.map((task) => (
                          <div key={task.id} className="flex items-center gap-2.5 text-xs">
                            <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                              {task.status === 'running' && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                              {task.status === 'success' && <Check className="h-3 w-3 text-emerald-500" />}
                              {task.status === 'error' && <AlertCircle className="h-3 w-3 text-destructive" />}
                              {task.status === 'pending' && <div className="h-2.5 w-2.5 rounded-full border border-muted-foreground/30" />}
                            </div>
                            <span className={cn(
                              task.status === 'running' ? "text-muted-foreground" : 
                              task.status === 'success' ? "text-muted-foreground" :
                              task.status === 'error' ? "text-destructive" :
                              "text-muted-foreground/40"
                            )}>
                              {task.text}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Final Output */}
                      {message.content && message.content.trim().length > 0 && (
                        <>
                          <hr className="my-3 border-border/30" />
                          {isStreaming ? (<><StagedStreamingContent content={message.content} /><VelocityCursor contentLength={message.content?.length || 0} /></>) : (<FinalMarkdown content={message.content} />)}
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      {isStreaming ? (
                        message.content && message.content.length > 0 ? (
                          <><StagedStreamingContent content={message.content} /><VelocityCursor contentLength={message.content.length} /></>
                        ) : (
                          <WarmingShimmer />
                        )
                      ) : (<FinalMarkdown content={message.content} />)}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Inline rich tool-result cards — search results, scraped pages,
              KB articles, flowstate balance, image previews, memory recall.
              Mundane tools (workspace task, user info, etc.) are skipped here
              and remain accessible via the SourcesPanel sidebar. */}
          {!isUser && !isStreaming && message.tool_results && message.tool_results.length > 0 && !shouldHideContent && (
            <div className="mt-2 w-full max-w-full flex flex-col gap-2">
              {message.tool_results
                .filter((tr: any) => shouldRenderInline(tr.name))
                .map((tr: any, idx: number) => (
                  <ToolResultRenderer
                    key={`${tr.name}-${idx}`}
                    name={tr.name}
                    status={tr.error ? "error" : "success"}
                    result={tr.result}
                    compact
                  />
                ))}
            </div>
          )}

          {/* Fallback: when content is hidden but tool_results have real data */}
          {!isUser && shouldHideContent && message.tool_results && message.tool_results.length > 0 && (
            <div className="rounded-[var(--glass-radius-card)] px-4 py-2.5 w-fit max-w-full bg-card/30 border border-border/20 backdrop-blur-sm">
              <div className="text-sm space-y-1">
                {message.tool_results
                  .filter((tr: any) => tr.result?.success)
                  .map((tr: any, idx: number) => {
                    const r = tr.result;
                    if (r.accounts && Array.isArray(r.accounts)) {
                      return (
                        <div key={idx}>
                          {r.accounts.map((acc: any, i: number) => (
                            <p key={i}>💰 {acc.account_name || acc.name || "Account"}: {Number(acc.balance ?? 0).toLocaleString()} {acc.currency || "THB"}</p>
                          ))}
                        </div>
                      );
                    }
                    if (r.transactions && Array.isArray(r.transactions)) {
                      return (
                        <div key={idx}>
                          {r.transactions.slice(0, 5).map((tx: any, i: number) => (
                            <p key={i}>{tx.type === "income" ? "📈" : "📉"} {Number(tx.amount || 0).toLocaleString()} {tx.currency || "THB"} — {tx.description || tx.category || ""}</p>
                          ))}
                        </div>
                      );
                    }
                    if (r.message) return <p key={idx}>✅ {r.message}</p>;
                    if (r.display_message) return <p key={idx}>{r.display_message}</p>;
                    return <p key={idx}>✅ Operation completed.</p>;
                  })}
              </div>
            </div>
          )}

          {/* Smart Error Recovery */}
          {isError && !isStreaming && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {onRetry && (
                <button onClick={onRetry} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 hover:border-destructive/40 transition-all duration-200">
                  <RotateCcw className="h-3 w-3" />
                  Retry
                </button>
              )}
              {onRegenerateMessage && (
                <button onClick={() => onRegenerateMessage(message.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted/30 hover:bg-muted/50 text-muted-foreground border border-border/30 hover:border-border/50 transition-all duration-200">
                  <Sparkles className="h-3 w-3" />
                  Try different approach
                </button>
              )}
              {onSendMessage && (
                <button onClick={() => onSendMessage("Please simplify your previous response and try again with a shorter answer.")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted/30 hover:bg-muted/50 text-muted-foreground border border-border/30 hover:border-border/50 transition-all duration-200">
                  <Zap className="h-3 w-3" />
                  Simplify & retry
                </button>
              )}
            </div>
          )}

          {generatedImages.length > 0 && message.id !== "streaming" && (
            <div className="flex flex-col gap-2 mt-2">
              {generatedImages.map((img, idx) => <GeneratedImageCard key={idx} imageUrl={img.imageUrl} description={img.description} modelUsed={img.modelUsed} prompt={img.prompt} aspectRatio={img.aspectRatio} />)}
            </div>
          )}

          {widgets.length > 0 && message.id !== "streaming" && (
            <div className="flex flex-col gap-3 mt-2 w-full">
              {widgets.map((w, idx) => (
                <InlineWidgetCard key={idx} html={w.html} title={w.title} height={w.height} preset={w.preset} data={w.data} onSendMessage={onSendMessage} sessionId={message.session_id} messageId={message.id} />
              ))}
              {(!message.content || !message.content.trim()) && !isStreaming && (
                <div className="text-xs text-muted-foreground/70 italic px-1">
                  Tap any element above to explore further.
                </div>
              )}
            </div>
          )}

          {message.role === "assistant" && message.id !== "streaming" && user?.id && (
            <SubAgentTracePanel parentMessageId={message.id} userId={user.id} />
          )}

          {fileDownloads.length > 0 && message.id !== "streaming" && (
            <div className="flex flex-col gap-2 mt-2">
              {fileDownloads.map((fd, idx) => <FileDownloadCard key={idx} fileType={fd.fileType} content={fd.content} filename={fd.filename} onPreview={onOpenArtifact} />)}
            </div>
          )}

          {hasDraftContent && !isStreaming && onSendMessage && (
            <ContentActionButtons
              content={draftResult?.content || message.content}
              contentId={draftResult?.content_id}
              isFallback={isFallback}
              onSave={draftResult?.saved ? undefined : async () => { onSendMessage("ဟုတ်ပါပြီ save လုပ်ပေးပါ"); }}
              onRegenerate={() => { onSendMessage("ထပ်ပြီး regenerate လုပ်ပေးပါ"); }}
            />
          )}

          {!isUser && !isError && !isStreaming && (
            <div className="flex items-center gap-2 flex-wrap">
              <MessageActionBar
                message={message}
                onRegenerate={
                  onRegenerateMessage
                    ? () => onRegenerateMessage(message.id)
                    : onSendMessage
                      ? () => onSendMessage("ထပ်ပြီး regenerate လုပ်ပေးပါ")
                      : undefined
                }
                onDelete={onDeleteMessage ? () => onDeleteMessage(message.id) : undefined}
                botName={displayBotName}
                onOpenThread={onOpenThread}
                isThreadActive={activeThreadMessageId === message.id}
                threadReplyCount={threadReplyCount}
              />
              {toolCount > 0 && onViewSources && (
                <SourcesPill sourceCount={toolCount} onClick={() => onViewSources(message.id)} isActive={activeSourcesMessageId === message.id} />
              )}
            </div>
          )}

          <div className={cn("mt-1 px-0.5 flex items-center gap-1", isUser ? "self-end flex-row-reverse" : "self-start flex-row")}>
            {message.source_channel === "telegram" && <Send className="h-2.5 w-2.5 text-blue-400/60" />}
            <span className="text-[10px] text-muted-foreground/60">{format(new Date(message.created_at), "HH:mm")}</span>
          </div>
        </div>

        {/* Long-press action sheet (mobile only — useLongPress ignores mouse events) */}
        <MessageActionSheet
          open={actionSheetOpen}
          onOpenChange={setActionSheetOpen}
          content={message.content || ""}
          isUser={isUser}
          isStreaming={isStreaming}
          onEdit={isUser && onEditMessage ? () => {
            setEditContent(message.content || "");
            setIsEditing(true);
          } : undefined}
          onRegenerate={!isUser && onRegenerateMessage ? () => onRegenerateMessage(message.id) : undefined}
          onOpenThread={onOpenThread ? () => onOpenThread(message.id) : undefined}
          onDelete={onDeleteMessage ? () => onDeleteMessage(message.id) : undefined}
        />
      </div>
    );
  },
  (prev, next) => {
    if (prev.message.id !== next.message.id) return false;
    if (prev.message.content !== next.message.content) return false;
    if (prev.isStreaming !== next.isStreaming) return false;
    if (prev.botEmoji !== next.botEmoji) return false;
    if (prev.skipAnimation !== next.skipAnimation) return false;
    if (prev.activeSourcesMessageId !== next.activeSourcesMessageId) return false;
    if (prev.activeThreadMessageId !== next.activeThreadMessageId) return false;
    if (prev.threadReplyCount !== next.threadReplyCount) return false;
    const prevLen = prev.thoughts?.length || prev.message.thoughts?.length || 0;
    const nextLen = next.thoughts?.length || next.message.thoughts?.length || 0;
    if (prevLen !== nextLen) return false;
    return true;
  },
);
