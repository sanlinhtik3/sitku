import { supabase } from "@/integrations/supabase/client";
import type { AgentChatMessage, AgentChatSession, MessageAttachment, ThinkingStep, ToolCallEntry, ToolResult } from "@/hooks/agent-chat/types";
import type {
  ConversationRepository,
  CountThreadRepliesInput,
  CreateMessageInput,
  CreateSessionInput,
  ListMessagesInput,
  ListMessagesResult,
  ListSessionsInput,
  RepositorySubscription,
  ThreadReplyCountMap,
} from "@/repositories/contracts/conversation";

function mapMessage(msg: any): AgentChatMessage {
  return {
    id: msg.id,
    session_id: msg.session_id,
    user_id: msg.user_id,
    role: msg.role as "user" | "assistant" | "tool",
    content: msg.content,
    attachments: msg.attachments as MessageAttachment[] | null,
    tool_calls: msg.tool_calls as ToolCallEntry[] | undefined,
    tool_results: msg.tool_results as ToolResult[] | undefined,
    thoughts: msg.thoughts as ThinkingStep[] | null,
    is_error: msg.is_error ?? false,
    created_at: msg.created_at ?? new Date().toISOString(),
    source_channel: msg.source_channel ?? null,
    response_rating: msg.response_rating ?? null,
    feedback_text: msg.feedback_text ?? null,
    feedback_at: msg.feedback_at ?? null,
    is_shared: msg.is_shared ?? false,
    share_uid: msg.share_uid ?? null,
    shared_at: msg.shared_at ?? null,
  };
}

export class SupabaseConversationRepository implements ConversationRepository {
  async listSessions(input: ListSessionsInput): Promise<AgentChatSession[]> {
    const { data, error } = await supabase
      .from("agent_chat_sessions")
      .select("*")
      .eq("user_id", input.userId)
      .eq("is_active", true)
      .filter("metadata->>kind", "eq", input.kind)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (error) throw error;
    return (data || []) as AgentChatSession[];
  }

  async createSession(input: CreateSessionInput): Promise<AgentChatSession> {
    const insertPayload: any = {
      user_id: input.userId,
      title: input.title,
      metadata: { ...(input.metadata || {}), kind: input.kind },
    };

    if (input.sessionInstructions) {
      insertPayload.session_instructions = input.sessionInstructions;
    }

    const { data, error } = await supabase
      .from("agent_chat_sessions")
      .insert(insertPayload)
      .select()
      .single();

    if (error) throw error;
    return data as AgentChatSession;
  }

  async archiveSession(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from("agent_chat_sessions")
      .update({ is_active: false })
      .eq("id", sessionId);
    if (error) throw error;
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    const { error } = await supabase
      .from("agent_chat_sessions")
      .update({ title })
      .eq("id", sessionId);
    if (error) throw error;
  }

  async updateSessionInstructions(sessionId: string, instructions: string | null): Promise<void> {
    const { error } = await supabase
      .from("agent_chat_sessions")
      .update({ session_instructions: instructions || null })
      .eq("id", sessionId);
    if (error) throw error;
  }

  async finalizeSessionSummary(sessionId: string): Promise<void> {
    await supabase.functions.invoke("agent-chat", {
      body: {
        action: "finalize_session_summary",
        session_id: sessionId,
      },
    });
  }

  async listMessages(input: ListMessagesInput): Promise<ListMessagesResult> {
    let query = supabase
      .from("agent_chat_messages")
      .select("*")
      .eq("session_id", input.sessionId)
      .order("created_at", { ascending: false })
      .limit(input.limit);

    if (input.beforeCreatedAt) {
      query = query.lt("created_at", input.beforeCreatedAt);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    return {
      messages: rows.reverse().map(mapMessage),
      hasMore: rows.length >= input.limit,
    };
  }

  async createMessage(input: CreateMessageInput): Promise<void> {
    const { error } = await supabase.from("agent_chat_messages").insert({
      session_id: input.sessionId,
      user_id: input.userId,
      role: input.role,
      content: input.content,
      attachments: input.attachments ?? null,
      tool_calls: input.toolCalls ?? null,
      tool_results: input.toolResults ?? null,
      thoughts: input.thoughts ?? null,
      is_error: input.isError ?? false,
      source_channel: input.sourceChannel ?? null,
    } as any);
    if (error) throw error;
  }

  async updateMessageContent(messageId: string, content: string): Promise<void> {
    const { error } = await supabase
      .from("agent_chat_messages")
      .update({ content })
      .eq("id", messageId);
    if (error) throw error;
  }

  async deleteMessage(messageId: string): Promise<void> {
    const { error } = await supabase
      .from("agent_chat_messages")
      .delete()
      .eq("id", messageId);
    if (error) throw error;
  }

  async countThreadReplies(input: CountThreadRepliesInput): Promise<ThreadReplyCountMap> {
    const { data: threads, error: threadsErr } = await supabase
      .from("agent_chat_sessions")
      .select("id, metadata")
      .eq("user_id", input.userId)
      .eq("is_active", true)
      .filter("metadata->>kind", "eq", "thread")
      .filter("metadata->>parent_session_id", "eq", input.parentSessionId);

    if (threadsErr || !threads?.length) return {};

    const threadIdToSourceId = new Map<string, string>();
    const threadIds: string[] = [];
    for (const t of threads as any[]) {
      const sourceId = t?.metadata?.source_message_id;
      if (sourceId && t?.id) {
        threadIdToSourceId.set(t.id, sourceId);
        threadIds.push(t.id);
      }
    }
    if (!threadIds.length) return {};

    const { data: rows, error: msgErr } = await supabase
      .from("agent_chat_messages")
      .select("session_id")
      .in("session_id", threadIds)
      .eq("role", "assistant");

    if (msgErr || !rows) return {};

    const map: ThreadReplyCountMap = {};
    for (const r of rows as { session_id: string }[]) {
      const sourceId = threadIdToSourceId.get(r.session_id);
      if (sourceId) map[sourceId] = (map[sourceId] || 0) + 1;
    }
    return map;
  }

  subscribeToSessionMessages(sessionId: string, onInsert: () => void): RepositorySubscription {
    const channel = supabase
      .channel("agent-messages-" + sessionId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_chat_messages",
          filter: "session_id=eq." + sessionId,
        },
        onInsert,
      )
      .subscribe();

    return { unsubscribe: () => supabase.removeChannel(channel) };
  }

  subscribeToUserMessages(userId: string, onInsert: (payload: unknown) => void): RepositorySubscription {
    const channel = supabase
      .channel("agent-user-messages-" + userId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_chat_messages",
          filter: "user_id=eq." + userId,
        },
        onInsert,
      )
      .subscribe();

    return { unsubscribe: () => supabase.removeChannel(channel) };
  }
}
