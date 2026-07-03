
-- ═══════════════════════════════════════════════════════════
-- 1. AGENT PROJECTS (Cowork equivalent)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.agent_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  custom_instructions TEXT,
  pinned_artifact_ids UUID[] NOT NULL DEFAULT '{}',
  color TEXT DEFAULT 'violet',
  emoji TEXT DEFAULT '📁',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_projects_user ON public.agent_projects(user_id, updated_at DESC);

ALTER TABLE public.agent_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own projects" ON public.agent_projects
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own projects" ON public.agent_projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own projects" ON public.agent_projects
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own projects" ON public.agent_projects
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_agent_projects_updated_at
  BEFORE UPDATE ON public.agent_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add project_id FK to existing sessions table
ALTER TABLE public.agent_chat_sessions
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.agent_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_chat_sessions_project ON public.agent_chat_sessions(project_id);

-- ═══════════════════════════════════════════════════════════
-- 2. SUB-AGENT STEPS (Dispatch live trace)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.agent_sub_agent_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  parent_message_id UUID,
  session_id UUID,
  sub_agent_id TEXT NOT NULL,
  step_index INTEGER NOT NULL DEFAULT 0,
  tool_name TEXT,
  tool_args JSONB,
  tool_result JSONB,
  status TEXT NOT NULL DEFAULT 'running',
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sub_agent_steps_parent ON public.agent_sub_agent_steps(parent_message_id, step_index);
CREATE INDEX idx_sub_agent_steps_user ON public.agent_sub_agent_steps(user_id, created_at DESC);

ALTER TABLE public.agent_sub_agent_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sub-agent steps" ON public.agent_sub_agent_steps
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role inserts sub-agent steps" ON public.agent_sub_agent_steps
  FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');
CREATE POLICY "Service role updates sub-agent steps" ON public.agent_sub_agent_steps
  FOR UPDATE USING (auth.uid() = user_id OR auth.role() = 'service_role');

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_sub_agent_steps;
ALTER TABLE public.agent_sub_agent_steps REPLICA IDENTITY FULL;

-- ═══════════════════════════════════════════════════════════
-- 3. TOOL TELEMETRY
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.agent_tool_telemetry (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tool_name TEXT NOT NULL,
  session_id UUID,
  message_id UUID,
  duration_ms INTEGER,
  is_successful BOOLEAN NOT NULL DEFAULT true,
  error_summary TEXT,
  invoked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tool_telemetry_tool_time ON public.agent_tool_telemetry(tool_name, invoked_at DESC);
CREATE INDEX idx_tool_telemetry_user ON public.agent_tool_telemetry(user_id, invoked_at DESC);

ALTER TABLE public.agent_tool_telemetry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tool telemetry" ON public.agent_tool_telemetry
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role inserts tool telemetry" ON public.agent_tool_telemetry
  FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');
