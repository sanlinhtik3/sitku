-- Create secure RPC function to check if user has API key
-- This function returns ONLY a boolean, never the actual key value

-- For ai_user_settings (used by AI Content, BeeBot, Agent Chat)
CREATE OR REPLACE FUNCTION public.check_user_has_gemini_api_key(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT gemini_api_key IS NOT NULL AND gemini_api_key != ''
     FROM public.ai_user_settings
     WHERE user_id = p_user_id
       AND user_id = auth.uid()),  -- Extra safety: user can only check their own
    false
  );
$$;

-- For srt_user_settings (used by Easy SRT)
CREATE OR REPLACE FUNCTION public.check_user_has_srt_api_key(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT gemini_api_key IS NOT NULL AND gemini_api_key != ''
     FROM public.srt_user_settings
     WHERE user_id = p_user_id
       AND user_id = auth.uid()),  -- Extra safety: user can only check their own
    false
  );
$$;

-- For cr_user_usage (used by Creator Rocket)
CREATE OR REPLACE FUNCTION public.check_user_has_cr_api_key(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT gemini_api_key IS NOT NULL AND gemini_api_key != ''
     FROM public.cr_user_usage
     WHERE user_id = p_user_id
       AND user_id = auth.uid()),  -- Extra safety: user can only check their own
    false
  );
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.check_user_has_gemini_api_key(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_has_srt_api_key(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_has_cr_api_key(UUID) TO authenticated;