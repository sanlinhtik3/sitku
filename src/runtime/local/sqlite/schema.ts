import type { SqliteDatabase } from "./types";

export const LOCAL_AGENT_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS agent_chat_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_message_at TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  session_instructions TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_chat_sessions_user_active
  ON agent_chat_sessions(user_id, is_active, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_chat_sessions_kind
  ON agent_chat_sessions(json_extract(metadata_json, '$.kind'));

CREATE TABLE IF NOT EXISTS agent_chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES agent_chat_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  attachments_json TEXT,
  tool_calls_json TEXT,
  tool_results_json TEXT,
  thoughts_json TEXT,
  is_error INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  source_channel TEXT,
  response_rating TEXT,
  feedback_text TEXT,
  feedback_at TEXT,
  is_shared INTEGER NOT NULL DEFAULT 0,
  share_uid TEXT,
  shared_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_chat_messages_session_created
  ON agent_chat_messages(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_chat_messages_user_created
  ON agent_chat_messages(user_id, created_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS agent_chat_messages_fts
  USING fts5(message_id UNINDEXED, session_id UNINDEXED, content);

CREATE TRIGGER IF NOT EXISTS trg_agent_chat_messages_fts_insert
AFTER INSERT ON agent_chat_messages
BEGIN
  INSERT INTO agent_chat_messages_fts(message_id, session_id, content)
  VALUES (new.id, new.session_id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS trg_agent_chat_messages_fts_update
AFTER UPDATE OF content ON agent_chat_messages
BEGIN
  UPDATE agent_chat_messages_fts
  SET content = new.content
  WHERE message_id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_agent_chat_messages_fts_delete
AFTER DELETE ON agent_chat_messages
BEGIN
  DELETE FROM agent_chat_messages_fts
  WHERE message_id = old.id;
END;
`;

export function ensureLocalAgentSchema(db: SqliteDatabase): void {
  db.exec(LOCAL_AGENT_SCHEMA_SQL);
}
