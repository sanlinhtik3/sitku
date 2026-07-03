
-- Add preferred_name to agent settings for identity persistence
ALTER TABLE user_agent_settings 
  ADD COLUMN IF NOT EXISTS preferred_name TEXT;

-- Add session context summary for rolling context window
ALTER TABLE agent_chat_sessions 
  ADD COLUMN IF NOT EXISTS context_summary TEXT;
