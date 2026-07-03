-- =============================================
-- AI Content Writer: Personal API Key Support
-- =============================================

-- 1. Add admin control columns to ai_model_settings
ALTER TABLE public.ai_model_settings 
  ADD COLUMN IF NOT EXISTS allow_personal_api_key BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_gateway_fallback_content BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_personal_key BOOLEAN DEFAULT false;

-- 2. Create ai_user_settings table for user-level API key storage
CREATE TABLE IF NOT EXISTS public.ai_user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  gemini_api_key TEXT,
  gemini_model TEXT DEFAULT 'gemini-2.5-flash',
  prefer_personal_key BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Enable RLS on ai_user_settings
ALTER TABLE public.ai_user_settings ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for ai_user_settings

-- Users can view their own settings
CREATE POLICY "Users can view own ai settings"
ON public.ai_user_settings
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own settings
CREATE POLICY "Users can insert own ai settings"
ON public.ai_user_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own settings
CREATE POLICY "Users can update own ai settings"
ON public.ai_user_settings
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own settings
CREATE POLICY "Users can delete own ai settings"
ON public.ai_user_settings
FOR DELETE
USING (auth.uid() = user_id);

-- Admins can view all settings
CREATE POLICY "Admins can view all ai user settings"
ON public.ai_user_settings
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can manage all settings
CREATE POLICY "Admins can manage all ai user settings"
ON public.ai_user_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 5. Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_ai_user_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_ai_user_settings_updated_at
BEFORE UPDATE ON public.ai_user_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_ai_user_settings_timestamp();

-- 6. Insert default ai_model_settings if not exists
INSERT INTO public.ai_model_settings (id, selected_model, allow_personal_api_key, allow_gateway_fallback_content, require_personal_key)
VALUES (gen_random_uuid(), 'google/gemini-2.5-flash', false, true, false)
ON CONFLICT DO NOTHING;