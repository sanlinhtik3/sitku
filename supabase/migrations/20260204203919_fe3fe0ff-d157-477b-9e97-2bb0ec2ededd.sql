-- ═══ CREATE RPC FUNCTION: Get Recent Session Summaries ═══
-- This function efficiently fetches session summaries for memory warm-up

CREATE OR REPLACE FUNCTION public.get_recent_session_summaries(
  p_user_id uuid,
  p_limit int DEFAULT 3
)
RETURNS TABLE (
  session_key text,
  summary jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    alc.context_key::text,
    alc.context_value,
    alc.created_at
  FROM agent_learning_context alc
  WHERE alc.user_id = p_user_id
    AND alc.context_type = 'session_summary'
  ORDER BY alc.created_at DESC
  LIMIT p_limit;
END;
$$;

-- ═══ CREATE RPC FUNCTION: Cleanup Old Session Summaries ═══
-- Keeps only the most recent 30 summaries per user

CREATE OR REPLACE FUNCTION public.cleanup_old_session_summaries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete session summaries beyond the 30 most recent per user
  DELETE FROM agent_learning_context alc
  WHERE alc.context_type = 'session_summary'
    AND alc.id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
        FROM agent_learning_context
        WHERE context_type = 'session_summary'
      ) ranked
      WHERE rn <= 30
    );
    
  -- Also clean old episodic memories (keep max 500 per user, importance > 0.3)
  DELETE FROM chat_memory_embeddings cme
  WHERE cme.id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY importance_score DESC, created_at DESC) as rn
      FROM chat_memory_embeddings
      WHERE importance_score >= 0.3
    ) ranked
    WHERE rn <= 500
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_recent_session_summaries(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_session_summaries() TO service_role;