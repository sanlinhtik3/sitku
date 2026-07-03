-- Expand user_memories category whitelist + add priority/tags
ALTER TABLE public.user_memories
  DROP CONSTRAINT IF EXISTS user_memories_category_check;

ALTER TABLE public.user_memories
  ADD CONSTRAINT user_memories_category_check
  CHECK (category = ANY (ARRAY[
    'preference'::text,
    'fact'::text,
    'relationship'::text,
    'work'::text,
    'opinion'::text,
    'life_event'::text,
    'viz_preferences'::text,
    'goals'::text,
    'custom'::text
  ]));

ALTER TABLE public.user_memories
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.user_memories
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_user_memories_priority
  ON public.user_memories (user_id, priority DESC, confidence DESC)
  WHERE is_active = true;

UPDATE public.user_memories
   SET priority = 100
 WHERE pinned = true
   AND priority = 0;
