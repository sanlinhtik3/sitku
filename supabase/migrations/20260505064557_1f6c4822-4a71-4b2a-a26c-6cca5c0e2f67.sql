
-- 1) USER CONTEXT STATE (synthesized patterns cache)
CREATE TABLE public.user_context_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preference_summary text,
  emotional_baseline text,
  writing_style text,
  topic_clusters jsonb NOT NULL DEFAULT '[]'::jsonb,
  active_goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  recent_themes text[] NOT NULL DEFAULT '{}',
  synthesized_at timestamptz NOT NULL DEFAULT now(),
  synthesis_model text,
  source_episodic_count int NOT NULL DEFAULT 0,
  source_semantic_count int NOT NULL DEFAULT 0,
  ttl_minutes int NOT NULL DEFAULT 60
);
ALTER TABLE public.user_context_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own context state select" ON public.user_context_state FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users own context state insert" ON public.user_context_state FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users own context state update" ON public.user_context_state FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users own context state delete" ON public.user_context_state FOR DELETE USING (auth.uid() = user_id);

-- 2) NEXT BEST ACTIONS
CREATE TABLE public.next_best_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('task_suggestion','content_idea','reminder','review_prompt','followup','goal_nudge')),
  title text NOT NULL,
  reasoning text,
  confidence numeric(3,2) NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  trigger_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  shown_at timestamptz,
  acted_on_at timestamptz,
  dismissed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.next_best_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own nba select" ON public.next_best_actions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users own nba insert" ON public.next_best_actions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users own nba update" ON public.next_best_actions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users own nba delete" ON public.next_best_actions FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_nba_active ON public.next_best_actions(user_id, created_at DESC)
  WHERE acted_on_at IS NULL AND dismissed_at IS NULL;

-- 3) REFLEXIVE LEARNING (lessons learned)
CREATE TABLE public.reflexive_learning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_type text NOT NULL CHECK (trigger_type IN ('user_correction','tool_failure','guard_violation','low_rating','self_audit')),
  task_signature text NOT NULL,
  task_signature_embedding vector(768),
  what_went_wrong text NOT NULL,
  lesson_learned text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  hits int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_retrieved_at timestamptz
);
ALTER TABLE public.reflexive_learning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own lessons select" ON public.reflexive_learning FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users own lessons insert" ON public.reflexive_learning FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users own lessons update" ON public.reflexive_learning FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users own lessons delete" ON public.reflexive_learning FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_reflexive_active ON public.reflexive_learning(user_id, is_active, created_at DESC) WHERE is_active = true;
CREATE INDEX idx_reflexive_embedding ON public.reflexive_learning USING hnsw (task_signature_embedding vector_cosine_ops) WITH (m='16', ef_construction='64');

-- 4) AGENT THOUGHT TREES (ToT audit)
CREATE TABLE public.agent_thought_trees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.agent_chat_sessions(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.agent_chat_messages(id) ON DELETE SET NULL,
  user_message text,
  candidate_plans jsonb NOT NULL,
  selected_plan_id text NOT NULL,
  selection_reasoning text,
  evaluator_model text,
  latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_thought_trees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own trees select" ON public.agent_thought_trees FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users own trees insert" ON public.agent_thought_trees FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users own trees delete" ON public.agent_thought_trees FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_thought_trees_user ON public.agent_thought_trees(user_id, created_at DESC);

-- 5) AGENT CRITIQUE LOG (self-critique audit)
CREATE TABLE public.agent_critique_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.agent_chat_sessions(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.agent_chat_messages(id) ON DELETE SET NULL,
  original_draft text NOT NULL,
  refined_answer text,
  verdict text NOT NULL CHECK (verdict IN ('ok','refine','reject')),
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  critique_model text,
  latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_critique_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own critique select" ON public.agent_critique_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users own critique insert" ON public.agent_critique_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users own critique delete" ON public.agent_critique_log FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_critique_user ON public.agent_critique_log(user_id, created_at DESC);

-- 6) RPC: vector search reflexive lessons (security definer, explicit owner gate)
CREATE OR REPLACE FUNCTION public.match_reflexive_lessons(
  p_user_id uuid,
  p_query_embedding vector(768),
  p_match_threshold float DEFAULT 0.78,
  p_match_count int DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  lesson_learned text,
  what_went_wrong text,
  trigger_type text,
  similarity float
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.lesson_learned,
    r.what_went_wrong,
    r.trigger_type,
    1 - (r.task_signature_embedding <=> p_query_embedding) AS similarity
  FROM public.reflexive_learning r
  WHERE r.user_id = p_user_id
    AND r.is_active = true
    AND r.task_signature_embedding IS NOT NULL
    AND 1 - (r.task_signature_embedding <=> p_query_embedding) >= p_match_threshold
  ORDER BY r.task_signature_embedding <=> p_query_embedding ASC
  LIMIT p_match_count;
END;
$$;
