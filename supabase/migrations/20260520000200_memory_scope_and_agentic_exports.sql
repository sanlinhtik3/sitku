-- Phase 1/3: separate private Memory Vault from Telegram group memory,
-- and add lightweight standards/export metadata for portable skills.

ALTER TABLE public.user_memories
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS scope_key text,
  ADD COLUMN IF NOT EXISTS source_platform text,
  ADD COLUMN IF NOT EXISTS source_actor text;

ALTER TABLE public.user_memories
  DROP CONSTRAINT IF EXISTS user_memories_scope_check;

ALTER TABLE public.user_memories
  ADD CONSTRAINT user_memories_scope_check
  CHECK (scope IN ('personal', 'telegram_group'));

CREATE INDEX IF NOT EXISTS idx_user_memories_scope
  ON public.user_memories (user_id, scope, scope_key, priority DESC, confidence DESC)
  WHERE is_active = true;

ALTER TABLE public.chat_memory_embeddings
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS scope_key text,
  ADD COLUMN IF NOT EXISTS source_platform text;

ALTER TABLE public.chat_memory_embeddings
  DROP CONSTRAINT IF EXISTS chat_memory_embeddings_scope_check;

ALTER TABLE public.chat_memory_embeddings
  ADD CONSTRAINT chat_memory_embeddings_scope_check
  CHECK (scope IN ('personal', 'telegram_group'));

CREATE INDEX IF NOT EXISTS idx_chat_memory_embeddings_scope
  ON public.chat_memory_embeddings (user_id, scope, scope_key, created_at DESC);

ALTER TABLE public.agent_custom_skills
  ADD COLUMN IF NOT EXISTS standard_format text NOT NULL DEFAULT 'beebot.skill.v1',
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS portable_manifest jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_agent_custom_skills_standard
  ON public.agent_custom_skills (user_id, standard_format)
  WHERE is_active = true;

COMMENT ON COLUMN public.user_memories.scope IS
  'personal = private user memory; telegram_group = public group-scoped memory keyed by Telegram chat id.';
COMMENT ON COLUMN public.agent_custom_skills.portable_manifest IS
  'Portable skill manifest used for export/import bridges such as agentskills-style hubs.';

-- Keep semantic user-memory recall private by default. Group chat recall is
-- handled in application code with explicit telegram_group scope filtering.
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
    COALESCE(um.normalized_key, um.category)::TEXT AS memory_key,
    um.content::TEXT AS memory_value,
    um.category,
    um.created_at,
    (1 - (um.embedding <=> p_query_embedding))::FLOAT AS similarity
  FROM public.user_memories um
  WHERE um.user_id = p_user_id
    AND um.is_active = true
    AND um.scope = 'personal'
    AND um.scope_key IS NULL
    AND um.embedding IS NOT NULL
    AND (1 - (um.embedding <=> p_query_embedding)) > 0.3
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$;

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
  FROM public.chat_memory_embeddings cm
  LEFT JOIN public.agent_chat_sessions s ON s.id = cm.session_id
  WHERE cm.user_id = p_user_id
    AND cm.scope = 'personal'
    AND cm.scope_key IS NULL
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
