// ═══ Project Titan: Module 2 - Session Manager ═══
// Session CRUD, queries, and auto-select logic.
// Phase 0 local-first migration: this hook talks to ConversationRepository,
// not directly to Supabase. Supabase remains a temporary adapter underneath.

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AgentChatSession } from "./types";
import { useRepositories } from "@/repositories/runtime/RepositoryProvider";

export interface SessionManagerOptions {
  /** Session kind to scope to. Defaults to "partner" (main BeeBot). */
  kind?: string;
  /** Default title for newly-created sessions. */
  defaultTitle?: string;
  /** Optional session_instructions auto-attached to new sessions. */
  defaultInstructions?: string | null;
}

export function useSessionManager(userId: string, options: SessionManagerOptions = {}) {
  const { kind = "partner", defaultTitle, defaultInstructions = null } = options;
  const { conversations } = useRepositories();
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    setActiveSessionId(null);
  }, [kind]);

  const { data: sessions = [], isLoading: isLoadingSessions, refetch: refetchSessions } = useQuery({
    queryKey: ["agent-sessions", userId, kind],
    queryFn: async () => {
      return conversations.listSessions({ userId, kind });
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const createSession = useMutation({
    mutationFn: async (title?: string) => {
      if (activeSessionId && kind === "partner") {
        conversations.finalizeSessionSummary(activeSessionId)
          .catch(err => console.warn("[SessionFinalize] Non-blocking error:", err));
      }

      return conversations.createSession({
        userId,
        title: title || defaultTitle || "New Chat",
        kind,
        sessionInstructions: defaultInstructions,
      });
    },
    onSuccess: (session) => {
      setActiveSessionId(session.id);
      queryClient.invalidateQueries({ queryKey: ["agent-sessions", userId, kind] });
    },
    onError: (error) => {
      toast.error("Failed to create chat session");
      console.error("Create session error:", error);
    },
  });

  const deleteSession = useMutation({
    mutationFn: async (sessionId: string) => {
      await conversations.archiveSession(sessionId);
    },
    onSuccess: (_, deletedId) => {
      if (activeSessionId === deletedId) {
        const remaining = sessions.filter((s: AgentChatSession) => s.id !== deletedId);
        setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
      }
      queryClient.invalidateQueries({ queryKey: ["agent-sessions", userId, kind] });
    },
  });

  const renameSession = useMutation({
    mutationFn: async ({ sessionId, title }: { sessionId: string; title: string }) => {
      await conversations.renameSession(sessionId, title);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-sessions", userId, kind] });
    },
  });

  const updateSessionInstructions = useMutation({
    mutationFn: async ({ sessionId, instructions }: { sessionId: string; instructions: string | null }) => {
      await conversations.updateSessionInstructions(sessionId, instructions || null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-sessions", userId, kind] });
      toast.success("Session instructions saved");
    },
    onError: () => {
      toast.error("Failed to save session instructions");
    },
  });

  useEffect(() => {
    if (!isLoadingSessions && sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, isLoadingSessions, activeSessionId]);

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    isLoadingSessions,
    refetchSessions,
    createSession: createSession.mutateAsync,
    isCreatingSession: createSession.isPending,
    deleteSession: deleteSession.mutateAsync,
    renameSession: renameSession.mutateAsync,
    updateSessionInstructions: updateSessionInstructions.mutateAsync,
  };
}
