
-- ═══ Create agent_user_facts table ═══
CREATE TABLE IF NOT EXISTS public.agent_user_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fact_key TEXT NOT NULL,
  fact_value TEXT NOT NULL,
  source TEXT DEFAULT 'user_told',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, fact_key)
);

ALTER TABLE public.agent_user_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own facts" ON public.agent_user_facts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_agent_user_facts_user ON public.agent_user_facts(user_id);

-- ═══ Create agent_episodic_memory table ═══
CREATE TABLE IF NOT EXISTS public.agent_episodic_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.agent_chat_sessions(id) ON DELETE SET NULL,
  memory_type TEXT NOT NULL DEFAULT 'conversation_turn',
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.agent_episodic_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own episodic memory" ON public.agent_episodic_memory
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_agent_episodic_memory_user ON public.agent_episodic_memory(user_id);
CREATE INDEX idx_agent_episodic_memory_session ON public.agent_episodic_memory(session_id);
