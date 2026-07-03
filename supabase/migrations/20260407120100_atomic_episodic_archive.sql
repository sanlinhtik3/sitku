-- ═══ ATOMIC EPISODIC ARCHIVE RPC ═══
-- Performs both episodic memory insert AND embedding insert in a single transaction.
-- If the embedding insert fails, neither write is committed — preventing phantom memories.

CREATE OR REPLACE FUNCTION archive_episodic_with_embedding(
  p_user_id UUID,
  p_session_id UUID,
  p_content TEXT,
  p_metadata JSONB,
  p_content_summary TEXT DEFAULT NULL,
  p_embedding TEXT DEFAULT NULL,
  p_importance_score NUMERIC DEFAULT 0.5,
  p_topic_tags TEXT[] DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert plain-text episodic memory
  INSERT INTO agent_episodic_memory (user_id, session_id, memory_type, content, metadata)
  VALUES (p_user_id, p_session_id, 'conversation_turn', p_content, p_metadata);

  -- Insert embedding (only if provided)
  IF p_embedding IS NOT NULL AND p_content_summary IS NOT NULL THEN
    INSERT INTO chat_memory_embeddings (user_id, session_id, content_summary, embedding, importance_score, topic_tags)
    VALUES (p_user_id, p_session_id, p_content_summary, p_embedding::vector, p_importance_score, p_topic_tags);
  END IF;

  -- Both succeed or both rollback — ACID guarantee
END;
$$;
