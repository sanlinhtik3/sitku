
-- Create group_bots table (multi group sub agent support)
CREATE TABLE public.group_bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_settings_id UUID REFERENCES public.bot_settings(id) ON DELETE SET NULL,
  name TEXT DEFAULT 'Group Bot',
  bot_token TEXT,
  bot_username TEXT,
  bot_name TEXT,
  trigger_word TEXT,
  custom_instruction TEXT,
  is_active BOOLEAN DEFAULT true,
  allow_dm BOOLEAN DEFAULT false,
  allow_web_search BOOLEAN DEFAULT false,
  webhook_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.group_bots ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own group bots
CREATE POLICY "Users manage own group bots"
  ON public.group_bots FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Migrate existing group bot data from bot_settings
INSERT INTO public.group_bots (user_id, bot_settings_id, name, bot_token, bot_username, bot_name, trigger_word, custom_instruction, is_active, allow_dm, allow_web_search)
SELECT 
  bs.user_id,
  bs.id,
  COALESCE(bs.group_bot_name, 'Group Bot'),
  bs.group_bot_token,
  bs.group_bot_username,
  bs.group_bot_name,
  bs.trigger_word,
  bs.group_bot_custom_instruction,
  COALESCE(bs.group_bot_active, true),
  COALESCE(bs.group_bot_allow_dm, false),
  COALESCE(bs.group_bot_allow_web_search, false)
FROM public.bot_settings bs
WHERE bs.group_bot_token IS NOT NULL;
