
-- ============================================
-- Component 1: agent_sub_tasks table
-- ============================================
CREATE TABLE public.agent_sub_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_session_id UUID REFERENCES public.agent_chat_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  task_description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result JSONB,
  tools_used TEXT[],
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.agent_sub_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sub-tasks"
  ON public.agent_sub_tasks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sub-tasks"
  ON public.agent_sub_tasks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sub-tasks"
  ON public.agent_sub_tasks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_agent_sub_tasks_session ON public.agent_sub_tasks(parent_session_id);
CREATE INDEX idx_agent_sub_tasks_user ON public.agent_sub_tasks(user_id);

-- ============================================
-- Component 3: agent_tool_definitions table
-- ============================================
CREATE TABLE public.agent_tool_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tool_name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'advanced',
  description TEXT NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  requires_admin BOOLEAN NOT NULL DEFAULT false,
  trigger_keywords TEXT[] NOT NULL DEFAULT '{}',
  embedding vector(768),
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_tool_definitions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read tool definitions
CREATE POLICY "Authenticated users can read tool definitions"
  ON public.agent_tool_definitions FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can modify tool definitions
CREATE POLICY "Admins can manage tool definitions"
  ON public.agent_tool_definitions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_agent_tool_definitions_category ON public.agent_tool_definitions(category);
CREATE INDEX idx_agent_tool_definitions_active ON public.agent_tool_definitions(is_active);
CREATE INDEX idx_agent_tool_definitions_keywords ON public.agent_tool_definitions USING GIN(trigger_keywords);

-- HNSW index for semantic search
CREATE INDEX idx_agent_tool_definitions_embedding ON public.agent_tool_definitions 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- Trigger for updated_at
CREATE TRIGGER update_agent_tool_definitions_updated_at
  BEFORE UPDATE ON public.agent_tool_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
