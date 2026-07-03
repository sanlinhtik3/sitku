
CREATE TABLE public.autonomous_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id UUID REFERENCES public.agent_chat_sessions(id) ON DELETE CASCADE,
  original_prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning',
  plan JSONB DEFAULT '[]'::jsonb,
  current_step INT DEFAULT 0,
  total_steps INT DEFAULT 0,
  progress_pct INT DEFAULT 0,
  result TEXT,
  error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.autonomous_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own autonomous tasks"
  ON public.autonomous_tasks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own autonomous tasks"
  ON public.autonomous_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role full access on autonomous_tasks"
  ON public.autonomous_tasks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.autonomous_tasks;
