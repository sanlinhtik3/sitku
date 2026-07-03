ALTER TABLE public.agent_ai_usage
  ADD COLUMN IF NOT EXISTS widget_rendered BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS widget_should_have_rendered BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_agent_ai_usage_widget_rendered
  ON public.agent_ai_usage (user_id, created_at DESC)
  WHERE widget_rendered = true;