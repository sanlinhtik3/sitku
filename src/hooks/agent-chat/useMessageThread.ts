// ═══ useMessageThread — per-message sub-conversation (HARDENED) ═══
// Reuses agent_chat_sessions + agent_chat_messages with metadata.kind='thread'
// and metadata.source_message_id. Thread sessions are filtered out of the main
// sidebar by useSessionManager (filters kind='partner').
//
// Hardening (2026-04):
//   - Race-safe session create (handles unique-violation 23505)
//   - AbortController for cancellable streams
//   - Attachments support (forwarded to agent-chat edge function)
//   - Resilient persist: if stream ends with content but no realtime arrives,
//     manually INSERT the assistant reply so the thread is never stuck blank.
//   - Apply guards: assistant-only, audit trail (pre_thread_content,
//     thread_applied_at), undo support, instant parent cache patch.
//   - Realtime UPDATE subscription on parent session for instant Apply propagation.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AgentChatMessage } from "./types";

export interface ThreadAttachment {
  type: "image" | "file";
  base64: string;
  mime_type: string;
  file_name: string;
}

interface UseMessageThreadOptions {
  userId: string;
  sourceMessageId: string | null;
  sourceContentPreview?: string;
  parentSessionId?: string | null;
  enabled?: boolean;
}

const THREAD_INSTRUCTIONS_PREFIX = `You are continuing a focused sub-discussion ("Thread") about ONE specific previous response.

The user wants to refine, edit, rewrite, extend, or ask focused follow-ups about THAT specific message. Keep your replies tightly scoped to it. Do not change topic. Do not summarise the whole prior conversation. Do not invent context that isn't in the source.

If the user asks you to rewrite or improve the message, return the new version directly so it can be applied.

═══ SOURCE MESSAGE (the one being discussed) ═══`;

function buildThreadInstructions(sourceContent: string): string {
  const trimmed = (sourceContent || "").slice(0, 8000);
  return `${THREAD_INSTRUCTIONS_PREFIX}\n${trimmed}\n═══ END SOURCE ═══`;
}

export function useMessageThread({
  userId,
  sourceMessageId,
  sourceContentPreview,
  parentSessionId,
  enabled = true,
}: UseMessageThreadOptions) {
  const queryClient = useQueryClient();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const realtimeInsertSeenRef = useRef(false);

  // ── Find or create the thread session (race-safe) ──
  useEffect(() => {
    if (!enabled || !userId || !sourceMessageId) {
      setThreadId(null);
      return;
    }
    let cancelled = false;

    const findExisting = async () => {
      return await supabase
        .from("agent_chat_sessions")
        .select("id")
        .eq("user_id", userId)
        .filter("metadata->>kind", "eq", "thread")
        .filter("metadata->>source_message_id", "eq", sourceMessageId)
        .eq("is_active", true)
        .maybeSingle();
    };

    (async () => {
      try {
        const existing = await findExisting();
        if (cancelled) return;
        if (existing.data?.id) {
          setThreadId(existing.data.id);
          return;
        }

        const created = await supabase
          .from("agent_chat_sessions")
          .insert({
            user_id: userId,
            title: "Thread",
            session_instructions: buildThreadInstructions(sourceContentPreview || ""),
            metadata: {
              kind: "thread",
              source_message_id: sourceMessageId,
              parent_session_id: parentSessionId ?? null,
            },
          })
          .select("id")
          .single();

        if (cancelled) return;

        if (created.error) {
          // 23505 = unique_violation → another tab/click won the race; re-SELECT.
          // PostgREST returns code as string in error.code; fall back to message check.
          const isUnique =
            (created.error as any)?.code === "23505" ||
            /duplicate key|unique constraint/i.test(created.error.message || "");
          if (isUnique) {
            const retry = await findExisting();
            if (cancelled) return;
            if (retry.data?.id) {
              setThreadId(retry.data.id);
              return;
            }
          }
          throw created.error;
        }

        setThreadId(created.data.id);
      } catch (err) {
        console.error("[useMessageThread] init failed:", err);
        if (!cancelled) setError("Failed to open thread");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, userId, sourceMessageId, sourceContentPreview, parentSessionId]);

  // ── Fetch thread messages ──
  const { data: messages = [], refetch: refetchMessages } = useQuery({
    queryKey: ["agent-thread-messages", threadId],
    queryFn: async () => {
      if (!threadId) return [] as AgentChatMessage[];
      const { data, error } = await supabase
        .from("agent_chat_messages")
        .select("*")
        .eq("session_id", threadId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as unknown as AgentChatMessage[]) || [];
    },
    enabled: !!threadId,
    staleTime: 5_000,
  });

  // ── Realtime: thread INSERT (own messages) ──
  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`thread-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_chat_messages",
          filter: `session_id=eq.${threadId}`,
        },
        (payload: any) => {
          if (payload?.new?.role === "assistant") {
            realtimeInsertSeenRef.current = true;
          }
          queryClient.invalidateQueries({ queryKey: ["agent-thread-messages", threadId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, queryClient]);

  // ── Realtime: parent session UPDATE (so Apply propagates instantly) ──
  useEffect(() => {
    if (!parentSessionId) return;
    const channel = supabase
      .channel(`thread-parent-${parentSessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "agent_chat_messages",
          filter: `session_id=eq.${parentSessionId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["agent-messages", parentSessionId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [parentSessionId, queryClient]);

  // ── Cancel an in-flight stream ──
  const cancelStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  // ── Send a message into the thread ──
  const sendMessage = useCallback(
    async (content: string, attachments?: ThreadAttachment[]) => {
      if (!threadId) {
        setError("Thread not ready");
        return;
      }
      const trimmed = content.trim();
      const hasAttachments = !!attachments?.length;
      if (!trimmed && !hasAttachments) return;

      setError(null);
      setIsStreaming(true);
      setStreamingContent("");
      realtimeInsertSeenRef.current = false;

      // Fresh AbortController per request
      cancelStreaming();
      abortRef.current = new AbortController();

      const clientRequestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      let acc = "";
      let aborted = false;

      try {
        // Persist user message immediately so the UI shows it
        await supabase.from("agent_chat_messages").insert({
          session_id: threadId,
          user_id: userId,
          role: "user",
          content: trimmed || (hasAttachments ? "[Attachment]" : ""),
          attachments: hasAttachments
            ? (attachments as any)
            : null,
        });
        await refetchMessages();

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("Not authenticated");

        const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
        const fnUrl = `${supabaseUrl}/functions/v1/agent-chat`;

        const response = await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            message: trimmed,
            sessionId: threadId,
            session_id: threadId,
            clientRequestId,
            client_request_id: clientRequestId,
            thread_mode: true,
            attachments: hasAttachments ? attachments : undefined,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Thread reply failed (${response.status})`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const evt = JSON.parse(payload);
              const delta =
                evt?.choices?.[0]?.delta?.content ??
                evt?.delta ??
                evt?.text ??
                "";
              if (delta) {
                acc += delta;
                setStreamingContent(acc);
              }
            } catch {
              /* swallow non-JSON keep-alives */
            }
          }
        }
      } catch (err: any) {
        aborted = err?.name === "AbortError";
        if (!aborted) {
          console.error("[useMessageThread] send failed:", err);
          setError(err?.message || "Reply failed");
        }
      } finally {
        // ── Resilient persist (B4) ──
        // If we accumulated content but realtime never delivered the assistant
        // INSERT within 1.5s, persist it ourselves so the thread is never blank.
        const persistFallback = async () => {
          if (!acc.trim()) return;
          await new Promise((r) => setTimeout(r, 1500));
          if (realtimeInsertSeenRef.current) return;
          // Double-check via fetch: maybe it landed but realtime channel was slow
          const recent = await supabase
            .from("agent_chat_messages")
            .select("id")
            .eq("session_id", threadId)
            .eq("role", "assistant")
            .gte("created_at", new Date(Date.now() - 60_000).toISOString())
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (recent.data?.id) return;
          await supabase.from("agent_chat_messages").insert({
            session_id: threadId,
            user_id: userId,
            role: "assistant",
            content: aborted ? `${acc}\n\n_[Cancelled by user]_` : acc,
            is_error: false,
          });
          queryClient.invalidateQueries({ queryKey: ["agent-thread-messages", threadId] });
        };
        persistFallback().catch((e) =>
          console.warn("[useMessageThread] fallback persist failed:", e)
        );

        setIsStreaming(false);
        setStreamingContent("");
        abortRef.current = null;
        setTimeout(() => refetchMessages(), 400);
      }
    },
    [threadId, userId, refetchMessages, cancelStreaming, queryClient]
  );

  // ── Apply last assistant reply back onto the source message (HARDENED) ──
  const applyToSource = useCallback(async (): Promise<{
    ok: boolean;
    previousContent?: string | null;
    newContent?: string;
  }> => {
    if (!sourceMessageId) return { ok: false };
    const lastAssistant = [...messages].reverse().find(
      (m) => m.role === "assistant" && !m.is_error
    );
    if (!lastAssistant?.content?.trim()) return { ok: false };

    try {
      // Fetch fresh source — guard against role mismatch and capture original content
      const { data: source, error: fetchErr } = await supabase
        .from("agent_chat_messages")
        .select("id, role, content")
        .eq("id", sourceMessageId)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!source) {
        console.warn("[useMessageThread] source message not found");
        return { ok: false };
      }
      if (source.role !== "assistant") {
        console.warn("[useMessageThread] refusing to apply: source is not an assistant message");
        return { ok: false };
      }

      const previousContent = source.content as string | null;
      const newContent = lastAssistant.content;

      const { error: updateErr } = await supabase
        .from("agent_chat_messages")
        .update({
          content: newContent,
          pre_thread_content: previousContent,
          thread_applied_at: new Date().toISOString(),
        })
        .eq("id", sourceMessageId);
      if (updateErr) throw updateErr;

      // Optimistic cache patch so parent updates immediately
      if (parentSessionId) {
        queryClient.setQueriesData(
          { queryKey: ["agent-messages", parentSessionId] },
          (old: any) => {
            if (!old) return old;
            const patch = (m: AgentChatMessage) =>
              m.id === sourceMessageId
                ? { ...m, content: newContent, pre_thread_content: previousContent }
                : m;
            if (Array.isArray(old)) return old.map(patch);
            if (Array.isArray(old?.messages))
              return { ...old, messages: old.messages.map(patch) };
            return old;
          }
        );
        queryClient.invalidateQueries({ queryKey: ["agent-messages", parentSessionId] });
      }

      return { ok: true, previousContent, newContent };
    } catch (err) {
      console.error("[useMessageThread] applyToSource failed:", err);
      return { ok: false };
    }
  }, [sourceMessageId, messages, parentSessionId, queryClient]);

  // ── Undo a previous Apply ──
  const undoApply = useCallback(async (): Promise<boolean> => {
    if (!sourceMessageId) return false;
    try {
      const { data: source, error: fetchErr } = await supabase
        .from("agent_chat_messages")
        .select("id, pre_thread_content")
        .eq("id", sourceMessageId)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!source?.pre_thread_content) return false;

      const restored = source.pre_thread_content;
      const { error: updateErr } = await supabase
        .from("agent_chat_messages")
        .update({
          content: restored,
          pre_thread_content: null,
          thread_applied_at: null,
        })
        .eq("id", sourceMessageId);
      if (updateErr) throw updateErr;

      if (parentSessionId) {
        queryClient.setQueriesData(
          { queryKey: ["agent-messages", parentSessionId] },
          (old: any) => {
            if (!old) return old;
            const patch = (m: AgentChatMessage) =>
              m.id === sourceMessageId
                ? { ...m, content: restored, pre_thread_content: null }
                : m;
            if (Array.isArray(old)) return old.map(patch);
            if (Array.isArray(old?.messages))
              return { ...old, messages: old.messages.map(patch) };
            return old;
          }
        );
        queryClient.invalidateQueries({ queryKey: ["agent-messages", parentSessionId] });
      }
      return true;
    } catch (err) {
      console.error("[useMessageThread] undoApply failed:", err);
      return false;
    }
  }, [sourceMessageId, parentSessionId, queryClient]);

  const replyCount = useMemo(
    () => messages.filter((m) => m.role === "assistant").length,
    [messages]
  );

  // Cleanup on unmount: abort any in-flight stream
  useEffect(() => () => cancelStreaming(), [cancelStreaming]);

  return {
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
    refetchMessages,
  };
}
