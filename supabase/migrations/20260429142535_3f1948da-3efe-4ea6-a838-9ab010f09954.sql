-- Add curator metadata columns to user_memories
ALTER TABLE public.user_memories
  ADD COLUMN IF NOT EXISTS curator_score numeric(3,2),
  ADD COLUMN IF NOT EXISTS curator_reason text,
  ADD COLUMN IF NOT EXISTS merged_from uuid[],
  ADD COLUMN IF NOT EXISTS normalized_key text;

CREATE INDEX IF NOT EXISTS idx_user_memories_normkey
  ON public.user_memories(user_id, normalized_key)
  WHERE is_active = true AND normalized_key IS NOT NULL;

-- Curator decisions audit table
CREATE TABLE IF NOT EXISTS public.curator_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  candidate_content text NOT NULL,
  candidate_category text,
  decision text NOT NULL CHECK (decision IN ('insert','merge','reject','update')),
  reason text,
  matched_memory_id uuid,
  curator_score numeric(3,2),
  source_session_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.curator_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own curator decisions"
  ON public.curator_decisions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert curator decisions"
  ON public.curator_decisions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view all curator decisions"
  ON public.curator_decisions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_curator_decisions_user_recent
  ON public.curator_decisions(user_id, created_at DESC);
