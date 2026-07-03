import type { AgentChatMessage, AgentChatSession, MessageAttachment } from "@/hooks/agent-chat/types";

export type ThreadReplyCountMap = Record<string, number>;

export interface RepositorySubscription {
  unsubscribe: () => void;
}

export interface ListSessionsInput {
  userId: string;
  kind: string;
}

export interface CreateSessionInput {
  userId: string;
  title: string;
  kind: string;
  sessionInstructions?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ListMessagesInput {
  sessionId: string;
  beforeCreatedAt?: string;
  limit: number;
}

export interface ListMessagesResult {
  messages: AgentChatMessage[];
  hasMore: boolean;
}

export interface CreateMessageInput {
  sessionId: string;
  userId: string;
  role: AgentChatMessage["role"];
  content: string;
  attachments?: MessageAttachment[] | null;
  toolCalls?: AgentChatMessage["tool_calls"];
  toolResults?: AgentChatMessage["tool_results"];
  thoughts?: AgentChatMessage["thoughts"];
  isError?: boolean;
  sourceChannel?: string | null;
}

export interface CountThreadRepliesInput {
  userId: string;
  parentSessionId: string;
}

export interface ConversationRepository {
  listSessions(input: ListSessionsInput): Promise<AgentChatSession[]>;
  createSession(input: CreateSessionInput): Promise<AgentChatSession>;
  archiveSession(sessionId: string): Promise<void>;
  renameSession(sessionId: string, title: string): Promise<void>;
  updateSessionInstructions(sessionId: string, instructions: string | null): Promise<void>;
  finalizeSessionSummary(sessionId: string): Promise<void>;

  listMessages(input: ListMessagesInput): Promise<ListMessagesResult>;
  createMessage(input: CreateMessageInput): Promise<void>;
  updateMessageContent(messageId: string, content: string): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;

  countThreadReplies(input: CountThreadRepliesInput): Promise<ThreadReplyCountMap>;
  subscribeToSessionMessages(sessionId: string, onInsert: () => void): RepositorySubscription;
  subscribeToUserMessages(userId: string, onInsert: (payload: unknown) => void): RepositorySubscription;
}
