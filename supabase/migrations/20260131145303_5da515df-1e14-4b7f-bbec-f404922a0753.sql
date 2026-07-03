-- ═══ BeeBot Personalization System ═══
-- Table to store user's personal AI assistant settings

CREATE TABLE public.user_agent_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  bot_name TEXT NOT NULL DEFAULT 'BeeBot',
  bot_emoji TEXT NOT NULL DEFAULT '🐝',
  personality_mode TEXT NOT NULL DEFAULT 'friendly',
  welcome_shown BOOLEAN NOT NULL DEFAULT false,
  custom_instructions TEXT,
  preferred_language TEXT DEFAULT 'burmese',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.user_agent_settings ENABLE ROW LEVEL SECURITY;

-- Strict RLS: Users can ONLY access their own agent settings
CREATE POLICY "Users can view own agent settings"
  ON public.user_agent_settings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own agent settings"
  ON public.user_agent_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agent settings"
  ON public.user_agent_settings
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_user_agent_settings_updated_at
  BEFORE UPDATE ON public.user_agent_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE public.user_agent_settings IS 'Stores personalized AI assistant (BeeBot) settings for each user';