
-- ═══ AGENT CUSTOM SKILLS TABLE (OpenClaw Self-Hackable Skills) ═══
CREATE TABLE public.agent_custom_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  description TEXT,
  trigger_keywords TEXT[] DEFAULT '{}',
  execution_steps JSONB NOT NULL DEFAULT '[]',
  input_schema JSONB DEFAULT '{}',
  output_format TEXT DEFAULT 'text',
  is_active BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,
  created_by_agent BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, skill_name)
);

-- RLS
ALTER TABLE public.agent_custom_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own skills"
  ON public.agent_custom_skills FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for keyword matching
CREATE INDEX idx_agent_custom_skills_keywords ON public.agent_custom_skills USING GIN (trigger_keywords);
CREATE INDEX idx_agent_custom_skills_user ON public.agent_custom_skills(user_id, is_active);
