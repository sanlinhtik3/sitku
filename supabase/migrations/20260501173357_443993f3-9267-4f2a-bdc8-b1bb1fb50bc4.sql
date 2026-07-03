-- ═══ RPC 1: match_chat_memories ═══
-- Used by active-memory-query.ts. HNSW cosine search on chat_memory_embeddings, user-scoped.
CREATE OR REPLACE FUNCTION public.match_chat_memories(
  query_embedding vector(768),
  match_threshold double precision DEFAULT 0.7,
  match_count integer DEFAULT 5,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity double precision,
  created_at timestamptz,
  importance_score numeric,
  topic_tags text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization: caller must match p_user_id (or be admin)
  IF p_user_id IS NULL OR (auth.uid() <> p_user_id AND NOT public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    cme.id,
    cme.content_summary AS content,
    1 - (cme.embedding <=> query_embedding) AS similarity,
    cme.created_at,
    cme.importance_score,
    cme.topic_tags
  FROM public.chat_memory_embeddings cme
  WHERE cme.user_id = p_user_id
    AND cme.embedding IS NOT NULL
    AND 1 - (cme.embedding <=> query_embedding) > match_threshold
  ORDER BY cme.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ═══ RPC 2: archive_episodic_with_embedding ═══
-- Used by memory-helpers.ts archiveToEpisodicMemory. Atomic write to chat_memory_embeddings.
-- Legacy agent_episodic_memory write intentionally removed (per existing code comments).
CREATE OR REPLACE FUNCTION public.archive_episodic_with_embedding(
  p_user_id uuid,
  p_session_id uuid,
  p_content text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_content_summary text DEFAULT NULL,
  p_embedding vector(768) DEFAULT NULL,
  p_importance_score numeric DEFAULT 0.5,
  p_topic_tags text[] DEFAULT ARRAY[]::text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Authorization: only allow caller to write own memories (or service role)
  IF p_user_id IS NULL OR (auth.uid() IS NOT NULL AND auth.uid() <> p_user_id AND NOT public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: archive_episodic_with_embedding';
  END IF;

  IF p_embedding IS NULL THEN
    RAISE EXCEPTION 'p_embedding is required';
  END IF;

  INSERT INTO public.chat_memory_embeddings (
    user_id, session_id, content_summary, embedding, importance_score, topic_tags
  )
  VALUES (
    p_user_id, p_session_id,
    COALESCE(p_content_summary, p_content),
    p_embedding,
    p_importance_score,
    p_topic_tags
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ═══ RPC 3: reinforce_recalled_memories ═══
-- Used by memory-vault.ts to boost confidence + refresh last_accessed on recalled memories.
-- Schema note: user_memories has `last_accessed` (not last_accessed_at) and `confidence` (no separate access_count).
CREATE OR REPLACE FUNCTION public.reinforce_recalled_memories(
  p_memory_ids uuid[],
  p_confidence_boost double precision DEFAULT 0.03
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_updated integer := 0;
BEGIN
  IF p_memory_ids IS NULL OR array_length(p_memory_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Caller must be authenticated; only their own memories are touched.
  -- Admins may reinforce any memory (matches existing admin SELECT policy).
  UPDATE public.user_memories
  SET
    last_accessed = now(),
    confidence = LEAST(1.0, COALESCE(confidence, 0.5) + p_confidence_boost)
  WHERE id = ANY(p_memory_ids)
    AND is_active = true
    AND (
      user_id = v_caller
      OR (v_caller IS NOT NULL AND public.has_role(v_caller, 'admin'::app_role))
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_chat_memories(vector, double precision, integer, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_episodic_with_embedding(uuid, uuid, text, jsonb, text, vector, numeric, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reinforce_recalled_memories(uuid[], double precision) TO authenticated, service_role;