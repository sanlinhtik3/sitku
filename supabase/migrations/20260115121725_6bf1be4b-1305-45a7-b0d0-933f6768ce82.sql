-- Add name and description columns to bot_settings for multi-bot support
ALTER TABLE public.bot_settings 
ADD COLUMN IF NOT EXISTS name text DEFAULT 'My Bot',
ADD COLUMN IF NOT EXISTS description text;

-- Add bot_id column to bot_chat_logs for multi-bot support
ALTER TABLE public.bot_chat_logs 
ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES public.bot_settings(id) ON DELETE CASCADE;

-- Add status tracking columns to bot_settings
ALTER TABLE public.bot_settings
ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
ADD COLUMN IF NOT EXISTS last_error_message text,
ADD COLUMN IF NOT EXISTS message_count_24h integer DEFAULT 0;

-- Create index for bot_chat_logs bot_id for faster queries
CREATE INDEX IF NOT EXISTS idx_bot_chat_logs_bot_id ON public.bot_chat_logs(bot_id);

-- Enable realtime for bot_settings to track status changes
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_settings;