-- ═══ Session Instructions: Per-session project context (like Claude.ai Projects) ═══
-- Adds session_instructions column to agent_chat_sessions table
-- Allows users to set custom context for individual chat sessions

ALTER TABLE agent_chat_sessions
ADD COLUMN IF NOT EXISTS session_instructions text DEFAULT NULL;

COMMENT ON COLUMN agent_chat_sessions.session_instructions IS
  'Optional per-session instructions injected into system prompt. Enables project-level context like Claude.ai Projects.';
