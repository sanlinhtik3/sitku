
-- AUTONOMY ENGINE Phase 1: Create 3 new tables (constraint already updated)

-- 1. agent_goals
CREATE TABLE public.agent_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 3,
  goal_type TEXT NOT NULL DEFAULT 'research',
  config JSONB NOT NULL DEFAULT '{}',
  progress JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own goals" ON public.agent_goals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_agent_goals_user_status ON public.agent_goals (user_id, status);

-- 2. agent_task_queue
CREATE TABLE public.agent_task_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id UUID NOT NULL REFERENCES public.agent_goals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  payload JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  checkpoint_state JSONB,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  priority INTEGER NOT NULL DEFAULT 5,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_task_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own tasks" ON public.agent_task_queue
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service inserts tasks" ON public.agent_task_queue
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_task_queue_goal_status ON public.agent_task_queue (goal_id, status, priority);
CREATE INDEX idx_task_queue_scheduled ON public.agent_task_queue (status, scheduled_for) WHERE status IN ('queued', 'retrying');

-- 3. delivery_retry_queue
CREATE TABLE public.delivery_retry_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  channel TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_retry_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own retries" ON public.delivery_retry_queue
  FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_delivery_retry_status ON public.delivery_retry_queue (status, next_retry_at) WHERE status IN ('queued', 'retrying');
