// ═══ Project Titan: Module 3 - Message Manager ═══
// Message queries, cursor-based pagination, and optimistic merging.
// Phase 0 local-first migration: reads messages through ConversationRepository.

import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgentChatMessage } from "./types";
import { useRepositories } from "@/repositories/runtime/RepositoryProvider";

const PAGE_SIZE = 50;

export function useMessageManager(activeSessionId: string | null) {
  const { conversations } = useRepositories();
  const queryClient = useQueryClient();
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<AgentChatMessage[]>([]);

  const { data: messages = [], isLoading: isLoadingMessages, refetch: refetchMessages } = useQuery({
    queryKey: ["agent-messages", activeSessionId],
    queryFn: async () => {
      if (!activeSessionId) return [];
      const result = await conversations.listMessages({
        sessionId: activeSessionId,
        limit: PAGE_SIZE,
      });
      setHasMoreMessages(result.hasMore);
      return result.messages;
    },
    enabled: !!activeSessionId,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  useEffect(() => {
    setOptimisticMessages([]);
  }, [activeSessionId]);

  const loadEarlierMessages = useCallback(async () => {
    if (!activeSessionId || messages.length === 0) return;

    const oldestMessage = messages[0];
    const result = await conversations.listMessages({
      sessionId: activeSessionId,
      beforeCreatedAt: oldestMessage.created_at,
      limit: PAGE_SIZE,
    });

    setHasMoreMessages(result.hasMore);

    if (result.messages.length > 0) {
      queryClient.setQueryData(
        ["agent-messages", activeSessionId],
        (old: AgentChatMessage[] | undefined) => [...result.messages, ...(old || [])],
      );
    }
  }, [activeSessionId, messages, queryClient, conversations]);

  const mergedMessages = useMemo(() => {
    if (optimisticMessages.length === 0) return messages;
    const dbIds = new Set(messages.map(m => m.id));
    const uniqueOptimistic = optimisticMessages.filter(om =>
      (om.id.startsWith("optimistic_") || om.id.startsWith("bridge_")) && !dbIds.has(om.id)
    );
    if (uniqueOptimistic.length === 0) return messages;
    const latestDbTime = messages.length > 0
      ? new Date(messages[messages.length - 1].created_at).getTime()
      : 0;
    const stillPending = uniqueOptimistic.filter(om =>
      new Date(om.created_at).getTime() > latestDbTime - 5000
    );
    return stillPending.length > 0 ? [...messages, ...stillPending] : messages;
  }, [messages, optimisticMessages]);

  return {
    messages,
    mergedMessages,
    isLoadingMessages,
    refetchMessages,
    hasMoreMessages,
    loadEarlierMessages,
    optimisticMessages,
    setOptimisticMessages,
  };
}
