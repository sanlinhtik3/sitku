-- Create bot_settings table
CREATE TABLE public.bot_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  telegram_bot_token TEXT,
  gemini_api_key TEXT,
  system_prompt TEXT DEFAULT 'You are a helpful assistant that responds to Telegram messages.',
  webhook_url TEXT,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Create bot_chat_logs table
CREATE TABLE public.bot_chat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  telegram_user_id TEXT NOT NULL,
  telegram_username TEXT,
  message TEXT NOT NULL,
  ai_reply TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_chat_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for bot_settings
CREATE POLICY "Users can view own bot settings" 
  ON public.bot_settings FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bot settings" 
  ON public.bot_settings FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bot settings" 
  ON public.bot_settings FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own bot settings" 
  ON public.bot_settings FOR DELETE 
  USING (auth.uid() = user_id);

-- RLS policies for bot_chat_logs
CREATE POLICY "Users can view own chat logs" 
  ON public.bot_chat_logs FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat logs" 
  ON public.bot_chat_logs FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Indexes for better performance
CREATE INDEX idx_bot_chat_logs_user_id ON public.bot_chat_logs(user_id);
CREATE INDEX idx_bot_chat_logs_created_at ON public.bot_chat_logs(created_at DESC);
CREATE INDEX idx_bot_settings_user_id ON public.bot_settings(user_id);

-- Trigger for updated_at on bot_settings
CREATE TRIGGER update_bot_settings_updated_at
  BEFORE UPDATE ON public.bot_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert feature flag for telegram_bot
INSERT INTO public.feature_flags (
  feature_key, 
  feature_name, 
  feature_name_my,
  description,
  description_my,
  icon, 
  status, 
  is_enabled, 
  category, 
  sort_order,
  show_in_nav
) VALUES (
  'telegram_bot',
  'Telegram AI Bot',
  'Telegram AI Bot',
  'Create and manage your own AI-powered Telegram bot',
  'သင့်ကိုယ်ပိုင် AI Telegram Bot ကို ဖန်တီးပြီး စီမံခန့်ခွဲပါ',
  'Bot',
  'beta',
  true,
  'productivity',
  7,
  true
);