
-- Drop existing functions first due to return type change
DROP FUNCTION IF EXISTS public.search_episodic_memory(UUID, vector(768), TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.search_user_memories(UUID, vector(768), INTEGER);

-- Recreate search_episodic_memory with similarity threshold
CREATE OR REPLACE FUNCTION public.search_episodic_memory(
  p_user_id UUID,
  p_query_embedding vector(768),
  p_time_range TEXT DEFAULT 'all_time',
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content_summary TEXT,
  created_at TIMESTAMPTZ,
  similarity FLOAT,
  session_title TEXT,
  topic_tags TEXT[],
  session_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.id,
    cm.content_summary,
    cm.created_at,
    (1 - (cm.embedding <=> p_query_embedding))::FLOAT AS similarity,
    s.title AS session_title,
    cm.topic_tags,
    cm.session_id
  FROM chat_memory_embeddings cm
  LEFT JOIN agent_chat_sessions s ON s.id = cm.session_id
  WHERE cm.user_id = p_user_id
    AND (1 - (cm.embedding <=> p_query_embedding)) > 0.3
    AND (
      p_time_range = 'all_time'
      OR (p_time_range = 'today' AND cm.created_at >= CURRENT_DATE)
      OR (p_time_range = 'this_week' AND cm.created_at >= CURRENT_DATE - INTERVAL '7 days')
      OR (p_time_range = 'this_month' AND cm.created_at >= CURRENT_DATE - INTERVAL '30 days')
    )
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$;

-- Recreate search_user_memories with similarity threshold
CREATE OR REPLACE FUNCTION public.search_user_memories(
  p_user_id UUID,
  p_query_embedding vector(768),
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  memory_key TEXT,
  memory_value TEXT,
  category TEXT,
  created_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    um.id,
    um.memory_key,
    um.memory_value,
    um.category,
    um.created_at,
    (1 - (um.embedding <=> p_query_embedding))::FLOAT AS similarity
  FROM user_memories um
  WHERE um.user_id = p_user_id
    AND (1 - (um.embedding <=> p_query_embedding)) > 0.3
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$;
