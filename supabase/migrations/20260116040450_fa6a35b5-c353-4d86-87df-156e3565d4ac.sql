-- Add trigger_word column to bot_settings
ALTER TABLE public.bot_settings 
ADD COLUMN IF NOT EXISTS trigger_word text DEFAULT 'ဗျို့မောင်တက်ကြွ';

COMMENT ON COLUMN public.bot_settings.trigger_word IS 'Trigger word/phrase to activate the bot in group chats';