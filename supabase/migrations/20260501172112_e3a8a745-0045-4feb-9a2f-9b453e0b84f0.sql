ALTER TABLE public.agent_ai_usage
  ADD COLUMN IF NOT EXISTS first_token_ms INTEGER,
  ADD COLUMN IF NOT EXISTS tokens_per_sec NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS stream_duration_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_agent_ai_usage_user_created
  ON public.agent_ai_usage(user_id, created_at DESC);