-- Add share columns to agent_chat_messages
ALTER TABLE agent_chat_messages 
ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS share_uid TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ;

-- Create index for fast share_uid lookups
CREATE INDEX IF NOT EXISTS idx_agent_chat_messages_share_uid 
ON agent_chat_messages(share_uid) WHERE share_uid IS NOT NULL;

-- RLS Policy: Allow public to view shared messages (for SharedBeeBot page)
CREATE POLICY "Anyone can view shared messages" 
ON agent_chat_messages FOR SELECT 
USING (is_shared = true AND share_uid IS NOT NULL);

-- RLS Policy: Users can update their own messages (for share/unshare)
CREATE POLICY "Users can update own messages for sharing"
ON agent_chat_messages FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);