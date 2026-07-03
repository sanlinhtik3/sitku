-- Add index for faster learning context lookups
CREATE INDEX IF NOT EXISTS idx_agent_learning_user_count 
ON agent_learning_context(user_id, usage_count DESC);

-- Add index for faster message history queries
CREATE INDEX IF NOT EXISTS idx_agent_messages_session_created 
ON agent_chat_messages(session_id, created_at ASC);

-- Add index for faster session queries
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_active 
ON agent_chat_sessions(user_id, is_active, last_message_at DESC);