
CREATE OR REPLACE FUNCTION search_personal_knowledge(
  p_user_id UUID,
  p_query_embedding vector(768),
  p_match_count INT DEFAULT 10,
  p_match_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  category TEXT,
  tags TEXT[],
  source_type TEXT,
  similarity FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id, c.title, c.content, c.category, c.tags, c.source_type,
    (1 - (e.embedding <=> p_query_embedding))::FLOAT AS similarity,
    c.created_at
  FROM knowledge_base_embeddings e
  JOIN ai_generated_content c ON c.id = e.content_id
  WHERE c.user_id = p_user_id
    AND c.is_personal = true
    AND (1 - (e.embedding <=> p_query_embedding)) > p_match_threshold
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;
