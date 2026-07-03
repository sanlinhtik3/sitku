
-- Create agent_heartbeats table for proactive recurring tasks
CREATE TABLE public.agent_heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  task_type TEXT NOT NULL DEFAULT 'custom',
  task_config JSONB DEFAULT '{}'::jsonb,
  last_run_at TIMESTAMPTZ,
  last_status TEXT DEFAULT 'pending',
  last_result JSONB,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_task_type CHECK (task_type IN ('briefing', 'memory_review', 'custom')),
  CONSTRAINT valid_status CHECK (last_status IN ('pending', 'success', 'failed', 'skipped')),
  UNIQUE(user_id, name)
);

-- Enable RLS
ALTER TABLE public.agent_heartbeats ENABLE ROW LEVEL SECURITY;

-- Users can view their own heartbeats
CREATE POLICY "Users can view own heartbeats"
  ON public.agent_heartbeats FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can create their own heartbeats
CREATE POLICY "Users can create own heartbeats"
  ON public.agent_heartbeats FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own heartbeats
CREATE POLICY "Users can update own heartbeats"
  ON public.agent_heartbeats FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can delete their own heartbeats
CREATE POLICY "Users can delete own heartbeats"
  ON public.agent_heartbeats FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role policy for cron updates (service role bypasses RLS, but explicit for clarity)
-- No additional policy needed - service role bypasses RLS

-- Index for the dispatcher query
CREATE INDEX idx_heartbeats_active_next_run 
  ON public.agent_heartbeats (is_active, next_run_at) 
  WHERE is_active = true;

-- Function to seed default heartbeats for new users
CREATE OR REPLACE FUNCTION public.seed_default_heartbeats(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.agent_heartbeats (user_id, name, display_name, cron_expression, is_active, task_type, task_config)
  VALUES
    (p_user_id, 'morning_briefing', 'Morning Briefing', '30 1 * * *', false, 'briefing', 
     '{"description": "Daily morning briefing with recent memories, tasks, and motivation", "timezone": "Asia/Yangon"}'::jsonb),
    (p_user_id, 'weekly_memory_review', 'Weekly Memory Review', '30 14 * * 0', false, 'memory_review',
     '{"description": "Weekly review of conversations to consolidate long-term memory", "timezone": "Asia/Yangon"}'::jsonb)
  ON CONFLICT (user_id, name) DO NOTHING;
END;
$$;
