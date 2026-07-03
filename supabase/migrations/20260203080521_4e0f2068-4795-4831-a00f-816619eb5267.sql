-- ═══════════════════════════════════════════════════════════════════════
-- SUPER BEEBOT AGENTIC AI: J.A.R.V.I.S.-Level Intelligence Tables
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Self-Improvement Engine: Store autonomous learning insights
CREATE TABLE IF NOT EXISTS public.agent_self_improvements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  improvement_type TEXT NOT NULL CHECK (improvement_type IN ('response_quality', 'tool_usage', 'reasoning', 'personality', 'user_interaction', 'system_optimization')),
  insight TEXT NOT NULL,
  learned_from JSONB DEFAULT '{}'::jsonb, -- { session_id, message_id, user_feedback, context }
  confidence DECIMAL(3,2) DEFAULT 0.50 CHECK (confidence >= 0 AND confidence <= 1),
  applied_count INTEGER DEFAULT 0,
  success_rate DECIMAL(3,2) DEFAULT 0.50 CHECK (success_rate >= 0 AND success_rate <= 1),
  is_active BOOLEAN DEFAULT true,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Knowledge Synthesis: Aggregate learnings across users/sessions
CREATE TABLE IF NOT EXISTS public.agent_knowledge_synthesis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  synthesized_knowledge JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_count INTEGER DEFAULT 1,
  quality_score DECIMAL(3,2) DEFAULT 0.50 CHECK (quality_score >= 0 AND quality_score <= 1),
  category TEXT DEFAULT 'general',
  language TEXT DEFAULT 'burmese',
  is_approved BOOLEAN DEFAULT false, -- Admin must approve for global use
  approved_by UUID REFERENCES auth.users(id),
  last_synthesized_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Multi-Agent Teaching System: Spread knowledge to all BeeBot instances
CREATE TABLE IF NOT EXISTS public.agent_teachings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teaching_type TEXT NOT NULL CHECK (teaching_type IN ('skill', 'knowledge', 'reasoning_pattern', 'response_style', 'tool_optimization', 'personality_trait')),
  teaching_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_agent TEXT DEFAULT 'super_beebot',
  source_improvement_id UUID REFERENCES public.agent_self_improvements(id),
  target_audience TEXT DEFAULT 'all' CHECK (target_audience IN ('all', 'admin_agents', 'user_specific', 'new_users', 'power_users')),
  adoption_count INTEGER DEFAULT 0,
  effectiveness_score DECIMAL(3,2) DEFAULT 0.50 CHECK (effectiveness_score >= 0 AND effectiveness_score <= 1),
  is_approved BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Proactive Suggestions Log: Track agent-initiated suggestions
CREATE TABLE IF NOT EXISTS public.agent_proactive_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.agent_chat_sessions(id) ON DELETE SET NULL,
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('financial_advice', 'productivity_tip', 'learning_path', 'feature_discovery', 'optimization', 'health_reminder', 'security_alert')),
  context_trigger TEXT NOT NULL,
  suggestion_content TEXT NOT NULL,
  urgency TEXT DEFAULT 'low' CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
  was_helpful BOOLEAN,
  user_feedback TEXT,
  was_accepted BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Autonomous Actions Log: Track self-made decisions
CREATE TABLE IF NOT EXISTS public.agent_autonomous_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.agent_chat_sessions(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  action_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  trust_level INTEGER NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  was_auto_executed BOOLEAN DEFAULT false,
  required_confirmation BOOLEAN DEFAULT true,
  user_confirmed BOOLEAN,
  outcome TEXT CHECK (outcome IN ('success', 'failure', 'cancelled', 'pending')),
  outcome_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all new tables
ALTER TABLE public.agent_self_improvements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_knowledge_synthesis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_teachings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_proactive_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_autonomous_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- agent_self_improvements: Only admins can read/write (system-level learning)
CREATE POLICY "Admins can manage self-improvements"
  ON public.agent_self_improvements FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- agent_knowledge_synthesis: Admins can manage, all users can read approved
CREATE POLICY "Admins can manage knowledge synthesis"
  ON public.agent_knowledge_synthesis FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can read approved knowledge"
  ON public.agent_knowledge_synthesis FOR SELECT
  USING (is_approved = true);

-- agent_teachings: Admins can manage, all can read approved
CREATE POLICY "Admins can manage teachings"
  ON public.agent_teachings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can read approved teachings"
  ON public.agent_teachings FOR SELECT
  USING (is_approved = true);

-- agent_proactive_suggestions: Users can see their own
CREATE POLICY "Users can view their suggestions"
  ON public.agent_proactive_suggestions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "System can insert suggestions"
  ON public.agent_proactive_suggestions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their suggestion feedback"
  ON public.agent_proactive_suggestions FOR UPDATE
  USING (user_id = auth.uid());

-- agent_autonomous_actions: Users can see their own
CREATE POLICY "Users can view their autonomous actions"
  ON public.agent_autonomous_actions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "System can insert autonomous actions"
  ON public.agent_autonomous_actions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can confirm their actions"
  ON public.agent_autonomous_actions FOR UPDATE
  USING (user_id = auth.uid());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_self_improvements_active ON public.agent_self_improvements(is_active, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_self_improvements_type ON public.agent_self_improvements(improvement_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_synthesis_approved ON public.agent_knowledge_synthesis(is_approved, category);
CREATE INDEX IF NOT EXISTS idx_teachings_approved ON public.agent_teachings(is_approved, teaching_type);
CREATE INDEX IF NOT EXISTS idx_proactive_suggestions_user ON public.agent_proactive_suggestions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_autonomous_actions_user ON public.agent_autonomous_actions(user_id, created_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_super_agent_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_self_improvements_timestamp
  BEFORE UPDATE ON public.agent_self_improvements
  FOR EACH ROW EXECUTE FUNCTION public.update_super_agent_timestamp();

CREATE TRIGGER update_teachings_timestamp
  BEFORE UPDATE ON public.agent_teachings
  FOR EACH ROW EXECUTE FUNCTION public.update_super_agent_timestamp();