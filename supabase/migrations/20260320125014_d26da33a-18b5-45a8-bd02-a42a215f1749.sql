CREATE TABLE public.agent_loop_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  mission_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  step_index INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  tool_arguments JSONB DEFAULT '{}'::jsonb,
  tool_result JSONB DEFAULT '{}'::jsonb,
  is_success BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, mission_id, step_index, tool_name)
);

ALTER TABLE public.agent_loop_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own checkpoints" ON public.agent_loop_checkpoints
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_checkpoints_session_mission ON public.agent_loop_checkpoints(session_id, mission_id);
CREATE INDEX idx_checkpoints_cleanup ON public.agent_loop_checkpoints(created_at);