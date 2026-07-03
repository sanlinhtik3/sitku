ALTER TABLE public.agent_ai_usage
  ADD COLUMN IF NOT EXISTS call_kind          text,
  ADD COLUMN IF NOT EXISTS trace_id           text,
  ADD COLUMN IF NOT EXISTS task_id            text,
  ADD COLUMN IF NOT EXISTS client_request_id  text,
  ADD COLUMN IF NOT EXISTS provider           text,
  ADD COLUMN IF NOT EXISTS request_count      integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS metadata           jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS estimated_iu       numeric,
  ADD COLUMN IF NOT EXISTS run_id             uuid,
  ADD COLUMN IF NOT EXISTS parent_run_id      uuid;

CREATE INDEX IF NOT EXISTS idx_agent_ai_usage_run_id  ON public.agent_ai_usage(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_ai_usage_message ON public.agent_ai_usage(message_id);
CREATE INDEX IF NOT EXISTS idx_agent_ai_usage_user_created ON public.agent_ai_usage(user_id, created_at DESC);

COMMENT ON COLUMN public.agent_ai_usage.call_kind IS 'main_response | observer | narration | memory_reflection | memory_summary | memory_tagging | embedding | planner | evaluator | revise | tool_internal';
COMMENT ON COLUMN public.agent_ai_usage.run_id    IS 'Groups all calls produced by one user turn (one task).';