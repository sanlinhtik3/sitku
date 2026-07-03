
-- Phase 1: Add provider toggle columns to ai_model_settings
ALTER TABLE public.ai_model_settings 
ADD COLUMN IF NOT EXISTS enable_google_provider BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS enable_anthropic_provider BOOLEAN DEFAULT false;

-- Phase 1: Add personal_anthropic_key to ai_user_settings
ALTER TABLE public.ai_user_settings
ADD COLUMN IF NOT EXISTS personal_anthropic_key TEXT;

-- Phase 1: Update check_system_api_keys_status RPC to return provider enablement
CREATE OR REPLACE FUNCTION public.check_system_api_keys_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'has_google_key', google_system_api_key IS NOT NULL AND google_system_api_key != '',
    'has_anthropic_key', anthropic_system_api_key IS NOT NULL AND anthropic_system_api_key != '',
    'default_gemini_model', default_gemini_model,
    'default_claude_model', default_claude_model,
    'enable_google_provider', COALESCE(enable_google_provider, true),
    'enable_anthropic_provider', COALESCE(enable_anthropic_provider, false),
    'allow_personal_api_key', COALESCE(allow_personal_api_key, false)
  ) INTO result
  FROM ai_model_settings 
  LIMIT 1;
  
  RETURN COALESCE(result, jsonb_build_object(
    'has_google_key', false,
    'has_anthropic_key', false,
    'default_gemini_model', 'gemini-3-flash-preview',
    'default_claude_model', 'claude-4-5-sonnet',
    'enable_google_provider', true,
    'enable_anthropic_provider', false,
    'allow_personal_api_key', false
  ));
END;
$$;
