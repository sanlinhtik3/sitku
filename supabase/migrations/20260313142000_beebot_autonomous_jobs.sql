-- Migration: Create agent_autonomous_jobs table
CREATE TABLE public.agent_autonomous_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.agent_chat_sessions(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'thinking', -- 'thinking', 'working', 'done', 'error'
  thinking_steps JSONB DEFAULT '[]'::jsonb,
  final_result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_autonomous_jobs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own autonomous jobs"
  ON public.agent_autonomous_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own autonomous jobs"
  ON public.agent_autonomous_jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own autonomous jobs"
  ON public.agent_autonomous_jobs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_autonomous_jobs;

-- Trigger for updated_at (assuming update_updated_at_column exists as it does in other migrations)
CREATE TRIGGER update_agent_autonomous_jobs_updated_at
  BEFORE UPDATE ON public.agent_autonomous_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
