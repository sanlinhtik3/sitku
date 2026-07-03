ALTER TABLE public.user_memories
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS scope_key text,
  ADD COLUMN IF NOT EXISTS source_platform text,
  ADD COLUMN IF NOT EXISTS source_actor text;

ALTER TABLE public.user_memories DROP CONSTRAINT IF EXISTS user_memories_scope_check;
ALTER TABLE public.user_memories ADD CONSTRAINT user_memories_scope_check CHECK (scope IN ('personal', 'telegram_group'));

CREATE INDEX IF NOT EXISTS idx_user_memories_scope
  ON public.user_memories (user_id, scope, scope_key, priority DESC, confidence DESC)
  WHERE is_active = true;

ALTER TABLE public.chat_memory_embeddings
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS scope_key text,
  ADD COLUMN IF NOT EXISTS source_platform text;

ALTER TABLE public.chat_memory_embeddings DROP CONSTRAINT IF EXISTS chat_memory_embeddings_scope_check;
ALTER TABLE public.chat_memory_embeddings ADD CONSTRAINT chat_memory_embeddings_scope_check CHECK (scope IN ('personal', 'telegram_group'));

CREATE INDEX IF NOT EXISTS idx_chat_memory_embeddings_scope
  ON public.chat_memory_embeddings (user_id, scope, scope_key, created_at DESC);

ALTER TABLE public.agent_custom_skills
  ADD COLUMN IF NOT EXISTS standard_format text NOT NULL DEFAULT 'beebot.skill.v1',
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS portable_manifest jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_agent_custom_skills_standard
  ON public.agent_custom_skills (user_id, standard_format)
  WHERE is_active = true;