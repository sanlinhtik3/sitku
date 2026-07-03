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
import type { SqliteDatabase } from "./types";

type SessionRow = {
  id: string;
  user_id: string;
  title: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  message_count: number;
  metadata_json: string;
  session_instructions: string | null;
};

type MessageRow = {
  id: string;
  session_id: string;
  user_id: string;
  role: AgentChatMessage["role"];
  content: string;
  attachments_json: string | null;
  tool_calls_json: string | null;
  tool_results_json: string | null;
  thoughts_json: string | null;
  is_error: number;
  created_at: string;
  source_channel: string | null;
  response_rating: AgentChatMessage["response_rating"];
  feedback_text: string | null;
  feedback_at: string | null;
  is_shared: number;
  share_uid: string | null;
  shared_at: string | null;
};

type UserMessagePayload = {
  new: AgentChatMessage;
};

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) return prefix + "_" + globalThis.crypto.randomUUID();
  return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
}

function stringifyJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapSession(row: SessionRow): AgentChatSession {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_message_at: row.last_message_at,
    message_count: row.message_count,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
    session_instructions: row.session_instructions,
  };
}

function mapMessage(row: MessageRow): AgentChatMessage {
  return {
    id: row.id,
    session_id: row.session_id,
    user_id: row.user_id,
    role: row.role,
    content: row.content,
    attachments: parseJson<MessageAttachment[] | null>(row.attachments_json, null),
    tool_calls: parseJson<ToolCallEntry[] | undefined>(row.tool_calls_json, undefined),
    tool_results: parseJson<ToolResult[] | undefined>(row.tool_results_json, undefined),
    thoughts: parseJson<ThinkingStep[] | null>(row.thoughts_json, null),
    is_error: Boolean(row.is_error),
    created_at: row.created_at,
    source_channel: row.source_channel,
    response_rating: row.response_rating,
    feedback_text: row.feedback_text,
    feedback_at: row.feedback_at,
    is_shared: Boolean(row.is_shared),
    share_uid: row.share_uid,
    shared_at: row.shared_at,
  };
}

export class SqliteConversationRepository implements ConversationRepository {
  private sessionListeners = new Map<string, Set<() => void>>();
  private userListeners = new Map<string, Set<(payload: UserMessagePayload) => void>>();

  constructor(private readonly db: SqliteDatabase) {}

  async listSessions(input: ListSessionsInput): Promise<AgentChatSession[]> {
    const rows = this.db.prepare(`
      SELECT *
      FROM agent_chat_sessions
      WHERE user_id = ?
        AND is_active = 1
        AND json_extract(metadata_json, '$.kind') = ?
      ORDER BY last_message_at DESC NULLS LAST, updated_at DESC
    `).all(input.userId, input.kind) as SessionRow[];

    return rows.map(mapSession);
  }

  async createSession(input: CreateSessionInput): Promise<AgentChatSession> {
    const timestamp = nowIso();
    const session: AgentChatSession = {
      id: createId("session"),
      user_id: input.userId,
      title: input.title,
      is_active: true,
      created_at: timestamp,
      updated_at: timestamp,
      last_message_at: null,
      message_count: 0,
      metadata: { ...(input.metadata || {}), kind: input.kind },
      session_instructions: input.sessionInstructions || null,
    };

    this.db.prepare(`
      INSERT INTO agent_chat_sessions (
        id, user_id, title, is_active, created_at, updated_at, last_message_at,
        message_count, metadata_json, session_instructions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.user_id,
      session.title,
      1,
      session.created_at,
      session.updated_at,
      session.last_message_at,
      session.message_count,
      JSON.stringify(session.metadata),
      session.session_instructions ?? null,
    );

    return session;
  }

  async archiveSession(sessionId: string): Promise<void> {
    this.db.prepare(`
      UPDATE agent_chat_sessions
      SET is_active = 0, updated_at = ?
      WHERE id = ?
    `).run(nowIso(), sessionId);
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    this.db.prepare(`
      UPDATE agent_chat_sessions
      SET title = ?, updated_at = ?
      WHERE id = ?
    `).run(title, nowIso(), sessionId);
  }

  async updateSessionInstructions(sessionId: string, instructions: string | null): Promise<void> {
    this.db.prepare(`
      UPDATE agent_chat_sessions
      SET session_instructions = ?, updated_at = ?
      WHERE id = ?
    `).run(instructions || null, nowIso(), sessionId);
  }

  async finalizeSessionSummary(sessionId: string): Promise<void> {
    const row = this.db.prepare("SELECT metadata_json FROM agent_chat_sessions WHERE id = ?").get(sessionId) as { metadata_json?: string } | undefined;
    const metadata = parseJson<Record<string, unknown>>(row?.metadata_json, {});
    metadata.summary_finalized_at = nowIso();

    this.db.prepare(`
      UPDATE agent_chat_sessions
      SET metadata_json = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(metadata), nowIso(), sessionId);
  }

  async listMessages(input: ListMessagesInput): Promise<ListMessagesResult> {
    const rows = this.db.prepare(`
      SELECT *
      FROM agent_chat_messages
      WHERE session_id = ?
        AND (? IS NULL OR created_at < ?)
      ORDER BY created_at DESC
      LIMIT ?
    `).all(input.sessionId, input.beforeCreatedAt ?? null, input.beforeCreatedAt ?? null, input.limit) as MessageRow[];

    return {
      messages: rows.reverse().map(mapMessage),
      hasMore: rows.length >= input.limit,
    };
  }

  async createMessage(input: CreateMessageInput): Promise<void> {
    const timestamp = nowIso();
    const message: AgentChatMessage = {
      id: createId("message"),
      session_id: input.sessionId,
      user_id: input.userId,
      role: input.role,
      content: input.content,
      attachments: input.attachments ?? null,
      tool_calls: input.toolCalls,
      tool_results: input.toolResults,
      thoughts: input.thoughts ?? null,
      is_error: input.isError ?? false,
      created_at: timestamp,
      source_channel: input.sourceChannel ?? null,
      response_rating: null,
      feedback_text: null,
      feedback_at: null,
      is_shared: false,
      share_uid: null,
      shared_at: null,
    };

    this.write(() => {
      this.db.prepare(`
        INSERT INTO agent_chat_messages (
          id, session_id, user_id, role, content, attachments_json, tool_calls_json,
          tool_results_json, thoughts_json, is_error, created_at, source_channel,
          response_rating, feedback_text, feedback_at, is_shared, share_uid, shared_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        message.id,
        message.session_id,
        message.user_id,
        message.role,
        message.content,
        stringifyJson(message.attachments),
        stringifyJson(message.tool_calls),
        stringifyJson(message.tool_results),
        stringifyJson(message.thoughts),
        message.is_error ? 1 : 0,
        message.created_at,
        message.source_channel ?? null,
        message.response_rating ?? null,
        message.feedback_text ?? null,
        message.feedback_at ?? null,
        message.is_shared ? 1 : 0,
        message.share_uid ?? null,
        message.shared_at ?? null,
      );

      this.db.prepare(`
        UPDATE agent_chat_sessions
        SET message_count = message_count + 1,
            last_message_at = ?,
            updated_at = ?
        WHERE id = ?
      `).run(message.created_at, message.created_at, message.session_id);
    });

    this.emitMessage(message);
  }

  async updateMessageContent(messageId: string, content: string): Promise<void> {
    this.db.prepare("UPDATE agent_chat_messages SET content = ? WHERE id = ?").run(content, messageId);
  }

  async deleteMessage(messageId: string): Promise<void> {
    const row = this.db.prepare("SELECT session_id FROM agent_chat_messages WHERE id = ?").get(messageId) as { session_id?: string } | undefined;
    if (!row?.session_id) return;

    this.write(() => {
      this.db.prepare("DELETE FROM agent_chat_messages WHERE id = ?").run(messageId);
      this.refreshSessionMessageStats(row.session_id);
    });
  }

  async countThreadReplies(input: CountThreadRepliesInput): Promise<ThreadReplyCountMap> {
    const rows = this.db.prepare(`
      SELECT
        json_extract(s.metadata_json, '$.source_message_id') AS source_message_id,
        COUNT(m.id) AS assistant_count
      FROM agent_chat_sessions s
      LEFT JOIN agent_chat_messages m
        ON m.session_id = s.id
       AND m.role = 'assistant'
      WHERE s.user_id = ?
        AND s.is_active = 1
        AND json_extract(s.metadata_json, '$.kind') = 'thread'
        AND json_extract(s.metadata_json, '$.parent_session_id') = ?
      GROUP BY source_message_id
    `).all(input.userId, input.parentSessionId) as { source_message_id: string | null; assistant_count: number }[];

    const map: ThreadReplyCountMap = {};
    for (const row of rows) {
      if (row.source_message_id) map[row.source_message_id] = Number(row.assistant_count || 0);
    }
    return map;
  }

  subscribeToSessionMessages(sessionId: string, onInsert: () => void): RepositorySubscription {
    const listeners = this.sessionListeners.get(sessionId) || new Set<() => void>();
    listeners.add(onInsert);
    this.sessionListeners.set(sessionId, listeners);

    return {
      unsubscribe: () => {
        listeners.delete(onInsert);
        if (!listeners.size) this.sessionListeners.delete(sessionId);
      },
    };
  }

  subscribeToUserMessages(userId: string, onInsert: (payload: unknown) => void): RepositorySubscription {
    const listeners = this.userListeners.get(userId) || new Set<(payload: UserMessagePayload) => void>();
    const typedListener = onInsert as (payload: UserMessagePayload) => void;
    listeners.add(typedListener);
    this.userListeners.set(userId, listeners);

    return {
      unsubscribe: () => {
        listeners.delete(typedListener);
        if (!listeners.size) this.userListeners.delete(userId);
      },
    };
  }

  private refreshSessionMessageStats(sessionId: string): void {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS message_count, MAX(created_at) AS last_message_at
      FROM agent_chat_messages
      WHERE session_id = ?
    `).get(sessionId) as { message_count?: number; last_message_at?: string | null } | undefined;

    this.db.prepare(`
      UPDATE agent_chat_sessions
      SET message_count = ?, last_message_at = ?, updated_at = ?
      WHERE id = ?
    `).run(Number(row?.message_count || 0), row?.last_message_at ?? null, nowIso(), sessionId);
  }

  private write<T>(fn: () => T): T {
    if (this.db.transaction) return this.db.transaction(fn)();

    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private emitMessage(message: AgentChatMessage): void {
    this.sessionListeners.get(message.session_id)?.forEach((listener) => listener());
    this.userListeners.get(message.user_id)?.forEach((listener) => listener({ new: message }));
  }
}
