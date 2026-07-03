-- Create srt_global_settings table for admin controls
CREATE TABLE public.srt_global_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  allow_personal_api_key BOOLEAN DEFAULT true,
  allow_gateway_access BOOLEAN DEFAULT false,
  gateway_model TEXT DEFAULT 'gemini-2.5-flash',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Insert default row
INSERT INTO public.srt_global_settings (id, allow_personal_api_key, allow_gateway_access, gateway_model)
VALUES ('00000000-0000-0000-0000-000000000001', true, false, 'gemini-2.5-flash');

-- Enable RLS
ALTER TABLE public.srt_global_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read global settings
CREATE POLICY "Anyone can read srt_global_settings"
ON public.srt_global_settings FOR SELECT
USING (true);

-- Only admins can update (using user_roles table)
CREATE POLICY "Admins can update srt_global_settings"
ON public.srt_global_settings FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
  )
);

-- Create srt_user_settings table for per-user AI settings
CREATE TABLE public.srt_user_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gemini_api_key TEXT,
  gemini_model TEXT DEFAULT 'gemini-2.5-flash',
  allow_gateway_fallback BOOLEAN DEFAULT true,
  total_translations INTEGER DEFAULT 0,
  last_translation_at TIMESTAMP WITH TIME ZONE,
  granted_at TIMESTAMP WITH TIME ZONE,
  granted_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.srt_user_settings ENABLE ROW LEVEL SECURITY;

-- Users can read their own settings
CREATE POLICY "Users can read own srt_user_settings"
ON public.srt_user_settings FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own settings
CREATE POLICY "Users can insert own srt_user_settings"
ON public.srt_user_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own settings
CREATE POLICY "Users can update own srt_user_settings"
ON public.srt_user_settings FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can read all settings
CREATE POLICY "Admins can read all srt_user_settings"
ON public.srt_user_settings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
  )
);

-- Admins can update all settings
CREATE POLICY "Admins can update all srt_user_settings"
ON public.srt_user_settings FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
  )
);

-- Admins can insert for any user
CREATE POLICY "Admins can insert srt_user_settings"
ON public.srt_user_settings FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_srt_user_settings_updated_at
BEFORE UPDATE ON public.srt_user_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_srt_global_settings_updated_at
BEFORE UPDATE ON public.srt_global_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();