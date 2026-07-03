-- Add new columns for conversation context and image support
ALTER TABLE public.bot_chat_logs 
ADD COLUMN IF NOT EXISTS chat_id TEXT,
ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text',
ADD COLUMN IF NOT EXISTS image_file_id TEXT;

-- Index for faster conversation lookup by chat_id
CREATE INDEX IF NOT EXISTS idx_bot_chat_logs_chat_id 
ON public.bot_chat_logs(chat_id, created_at DESC);

-- Index for user + chat combination
CREATE INDEX IF NOT EXISTS idx_bot_chat_logs_user_chat 
ON public.bot_chat_logs(user_id, chat_id, created_at DESC);