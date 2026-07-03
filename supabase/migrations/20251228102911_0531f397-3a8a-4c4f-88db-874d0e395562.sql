-- P0 Fix: Add cleanup function for expired generation locks
-- This function can be called periodically or on-demand to clean up stale locks

CREATE OR REPLACE FUNCTION public.cleanup_expired_generation_locks()
RETURNS TABLE(cleaned_response_id uuid, lock_id uuid, locked_at timestamptz, expired_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH expired_locks AS (
    UPDATE public.cr_responses
    SET 
      generation_lock_id = NULL,
      generation_locked_at = NULL,
      generation_lock_expires_at = NULL
    WHERE generation_lock_expires_at < NOW()
      AND generation_lock_id IS NOT NULL
    RETURNING id, generation_lock_id, generation_locked_at, generation_lock_expires_at
  )
  SELECT 
    id as cleaned_response_id,
    generation_lock_id as lock_id,
    generation_locked_at as locked_at,
    generation_lock_expires_at as expired_at
  FROM expired_locks;
END;
$$;

-- P0 Fix: Add security comment on API key column
COMMENT ON COLUMN public.cr_user_usage.gemini_api_key IS 
  'SENSITIVE: Personal Gemini API key - must NEVER be returned to frontend. Only access via edge functions with service role.';

-- Also add comment on ai_user_settings API key for consistency
COMMENT ON COLUMN public.ai_user_settings.gemini_api_key IS 
  'SENSITIVE: Personal Gemini API key - must NEVER be returned to frontend. Only access via edge functions with service role.';