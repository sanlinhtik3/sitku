// ═══ useThreadReplyCounts ═══
// Returns a stable map: { [sourceMessageId]: assistantReplyCount } for the
// active parent session. Phase 0 local-first migration: reads through
// ConversationRepository instead of importing Supabase directly.

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRepositories } from "@/repositories/runtime/RepositoryProvider";

export type ThreadReplyCountMap = Record<string, number>;

export function useThreadReplyCounts(
  userId: string | null | undefined,
  parentSessionId: string | null | undefined,
): ThreadReplyCountMap {
  const queryClient = useQueryClient();
  const { conversations } = useRepositories();

  const { data } = useQuery({
    queryKey: ["thread-reply-counts", userId, parentSessionId],
    queryFn: async (): Promise<ThreadReplyCountMap> => {
      if (!userId || !parentSessionId) return {};
      return conversations.countThreadReplies({ userId, parentSessionId });
    },
    enabled: !!userId && !!parentSessionId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!userId || !parentSessionId) return;
    const subscription = conversations.subscribeToUserMessages(userId, (payload: any) => {
      if (payload?.new?.role === "assistant") {
        queryClient.invalidateQueries({
          queryKey: ["thread-reply-counts", userId, parentSessionId],
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [userId, parentSessionId, queryClient, conversations]);

  return useMemo(() => data || {}, [data]);
}
