-- Add thoughts column to agent_chat_messages table for persisting thinking steps
ALTER TABLE agent_chat_messages 
ADD COLUMN IF NOT EXISTS thoughts jsonb DEFAULT NULL;

-- Add comment explaining the column's purpose
COMMENT ON COLUMN agent_chat_messages.thoughts IS 'Array of thinking steps shown to user during agent execution. Each step has: id, title, detail, tool_name, status (loading/done/error), timestamp';