-- ═══ BeeBot Agentic AI Upgrade: Phase 1 & 3 Database Schema ═══

-- ═══ 1. AGENT SKILLS TABLE - Track mastered capabilities ═══
CREATE TABLE public.agent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  skill_name TEXT NOT NULL,
  skill_category TEXT NOT NULL, -- 'financial', 'content', 'task', 'analytics'
  mastery_level INTEGER DEFAULT 1 CHECK (mastery_level >= 1 AND mastery_level <= 5),
  usage_count INTEGER DEFAULT 0,
  unlocked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  skill_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, skill_name)
);

-- Enable RLS
ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own skills
CREATE POLICY "Users can view own skills" ON public.agent_skills
  FOR SELECT TO public USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own skills" ON public.agent_skills
  FOR INSERT TO public WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own skills" ON public.agent_skills
  FOR UPDATE TO public USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_agent_skills_user ON public.agent_skills(user_id);
CREATE INDEX idx_agent_skills_name ON public.agent_skills(skill_name);

-- ═══ 2. SECURITY EVENTS TABLE - Audit log for security incidents ═══
CREATE TABLE public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'prompt_injection_attempt', 'unauthorized_access', 'rate_limit_exceeded', etc.
  event_data JSONB DEFAULT '{}',
  severity TEXT DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  ip_address TEXT,
  user_agent TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- Only admins can read security events
CREATE POLICY "Admins can view security events" ON public.security_events
  FOR SELECT TO public USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- System can insert (no user check needed for logging)
CREATE POLICY "Allow insert for authenticated users" ON public.security_events
  FOR INSERT TO public WITH CHECK (auth.uid() IS NOT NULL);

-- Indexes for efficient querying
CREATE INDEX idx_security_events_user ON public.security_events(user_id);
CREATE INDEX idx_security_events_type ON public.security_events(event_type);
CREATE INDEX idx_security_events_severity ON public.security_events(severity);
CREATE INDEX idx_security_events_created ON public.security_events(created_at DESC);

-- ═══ 3. AGENT USER MEMORIES TABLE (Explicit Long-term Memory) ═══
-- Extends existing agent_learning_context for explicit "remember this" type memories
-- We'll use context_type = 'explicit_memory' for these

-- Add an index for explicit memory queries
CREATE INDEX idx_agent_learning_explicit_memory 
  ON public.agent_learning_context(user_id, context_type) 
  WHERE context_type = 'explicit_memory';

-- ═══ 4. FUNCTION: Get User Trust Level ═══
-- Based on interaction history and behavior
CREATE OR REPLACE FUNCTION public.get_user_trust_level(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_count INTEGER;
  v_session_count INTEGER;
  v_security_issues INTEGER;
  v_is_admin BOOLEAN;
  v_trust_level INTEGER;
  v_trust_name TEXT;
BEGIN
  -- Check if user is admin
  v_is_admin := EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = p_user_id AND role = 'admin'
  );
  
  IF v_is_admin THEN
    RETURN jsonb_build_object(
      'level', 4,
      'name', 'admin',
      'label', '👑 Super Agent',
      'can_skip_confirmation', true,
      'can_batch_actions', true
    );
  END IF;
  
  -- Count total messages
  SELECT COUNT(*) INTO v_message_count
  FROM public.agent_chat_messages
  WHERE user_id = p_user_id;
  
  -- Count sessions
  SELECT COUNT(*) INTO v_session_count
  FROM public.agent_chat_sessions
  WHERE user_id = p_user_id;
  
  -- Count security issues in last 30 days
  SELECT COUNT(*) INTO v_security_issues
  FROM public.security_events
  WHERE user_id = p_user_id
    AND created_at > NOW() - INTERVAL '30 days'
    AND severity IN ('high', 'critical');
  
  -- Determine trust level
  IF v_security_issues > 0 THEN
    v_trust_level := 1;
    v_trust_name := 'restricted';
  ELSIF v_message_count >= 100 AND v_session_count >= 10 THEN
    v_trust_level := 3;
    v_trust_name := 'trusted';
  ELSIF v_message_count >= 20 THEN
    v_trust_level := 2;
    v_trust_name := 'regular';
  ELSE
    v_trust_level := 1;
    v_trust_name := 'new';
  END IF;
  
  RETURN jsonb_build_object(
    'level', v_trust_level,
    'name', v_trust_name,
    'label', CASE v_trust_level
      WHEN 1 THEN '🔰 New User'
      WHEN 2 THEN '⭐ Regular'
      WHEN 3 THEN '💎 Trusted'
      ELSE '🔰 New User'
    END,
    'message_count', v_message_count,
    'session_count', v_session_count,
    'can_skip_confirmation', v_trust_level >= 3,
    'can_batch_actions', v_trust_level >= 2
  );
END;
$$;

-- ═══ 5. FUNCTION: Get User Unlocked Skills ═══
CREATE OR REPLACE FUNCTION public.get_user_agent_skills(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_skills JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'skill_name', skill_name,
      'skill_category', skill_category,
      'mastery_level', mastery_level,
      'usage_count', usage_count,
      'unlocked_at', unlocked_at,
      'capabilities', skill_data->'capabilities'
    )
  ), '[]'::jsonb) INTO v_skills
  FROM public.agent_skills
  WHERE user_id = p_user_id
  ORDER BY mastery_level DESC, usage_count DESC;
  
  RETURN v_skills;
END;
$$;

-- ═══ 6. FUNCTION: Get User App Context ═══
-- Provides BeeBot with awareness of user's app journey
CREATE OR REPLACE FUNCTION public.get_user_app_context(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context JSONB;
  v_workspace_count INTEGER;
  v_course_count INTEGER;
  v_content_count INTEGER;
  v_transaction_count INTEGER;
BEGIN
  -- Count workspaces
  SELECT COUNT(*) INTO v_workspace_count
  FROM public.workspace_members
  WHERE user_id = p_user_id AND status = 'accepted';
  
  -- Count enrolled courses
  SELECT COUNT(*) INTO v_course_count
  FROM public.enrollments
  WHERE user_id = p_user_id AND status = 'approved';
  
  -- Count AI content
  SELECT COUNT(*) INTO v_content_count
  FROM public.ai_generated_content
  WHERE user_id = p_user_id;
  
  -- Count recent transactions
  SELECT COUNT(*) INTO v_transaction_count
  FROM public.user_transactions
  WHERE user_id = p_user_id
    AND created_at > NOW() - INTERVAL '30 days';
  
  RETURN jsonb_build_object(
    'workspaces', v_workspace_count,
    'enrolled_courses', v_course_count,
    'ai_content_count', v_content_count,
    'recent_transactions', v_transaction_count,
    'most_active_feature', CASE
      WHEN v_transaction_count > v_content_count AND v_transaction_count > v_workspace_count THEN 'FlowState'
      WHEN v_content_count > v_workspace_count THEN 'AI Content'
      WHEN v_workspace_count > 0 THEN 'Workspace'
      ELSE 'Exploring'
    END
  );
END;
$$;