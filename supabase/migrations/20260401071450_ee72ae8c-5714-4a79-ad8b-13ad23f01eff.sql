CREATE OR REPLACE FUNCTION public.increment_sessions_since_dream(p_user_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE agent_soul_config 
  SET sessions_since_dream = COALESCE(sessions_since_dream, 0) + 1 
  WHERE user_id = p_user_id;
$$;