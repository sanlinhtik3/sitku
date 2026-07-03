
-- BeeBot Agentic Era — P1 Autonomy Daemon

CREATE TABLE IF NOT EXISTS public.beebot_trajectories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  goal_id UUID,
  trigger_id UUID,
  source TEXT NOT NULL DEFAULT 'manual',
  task_summary TEXT NOT NULL,
  steps_taken JSONB NOT NULL DEFAULT '[]'::jsonb,
  tools_used TEXT[] DEFAULT ARRAY[]::TEXT[],
  outcome TEXT NOT NULL DEFAULT 'pending',
  outcome_summary TEXT,
  error_text TEXT,
  duration_ms INTEGER,
  step_count INTEGER DEFAULT 0,
  embedding vector(768),
  metadata JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trajectories_user ON public.beebot_trajectories(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trajectories_goal ON public.beebot_trajectories(goal_id) WHERE goal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trajectories_outcome ON public.beebot_trajectories(user_id, outcome);
CREATE INDEX IF NOT EXISTS idx_trajectories_embedding ON public.beebot_trajectories USING hnsw (embedding vector_cosine_ops);
ALTER TABLE public.beebot_trajectories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trajectories_owner_all" ON public.beebot_trajectories FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.beebot_proactive_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  schedule_cron TEXT,
  schedule_tz TEXT NOT NULL DEFAULT 'Asia/Yangon',
  condition JSONB DEFAULT '{}'::jsonb,
  action_prompt TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_fired_at TIMESTAMPTZ,
  next_fire_at TIMESTAMPTZ,
  fire_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_triggers_user ON public.beebot_proactive_triggers(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_triggers_next_fire ON public.beebot_proactive_triggers(next_fire_at) WHERE is_active = true;
ALTER TABLE public.beebot_proactive_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "triggers_owner_all" ON public.beebot_proactive_triggers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_triggers_updated BEFORE UPDATE ON public.beebot_proactive_triggers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
