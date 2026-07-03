
-- Table 1: user_memories (Structured Vector Store)
CREATE TABLE public.user_memories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  embedding vector(768),
  category TEXT NOT NULL DEFAULT 'fact' CHECK (category IN ('preference', 'fact', 'relationship', 'work', 'opinion')),
  confidence DECIMAL(3,2) NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  source_session_id UUID REFERENCES public.agent_chat_sessions(id) ON DELETE SET NULL,
  last_accessed TIMESTAMPTZ NOT NULL DEFAULT now(),
  expiry TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table 2: user_psych_profile (One Row Per User)
CREATE TABLE public.user_psych_profile (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  traits JSONB NOT NULL DEFAULT '{}',
  mood_history JSONB NOT NULL DEFAULT '[]',
  dark_traits TEXT,
  interaction_style TEXT DEFAULT 'neutral',
  behavioral_patterns JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_user_memories_user_category ON public.user_memories(user_id, category) WHERE is_active = true;
CREATE INDEX idx_user_memories_expiry ON public.user_memories(expiry) WHERE expiry IS NOT NULL AND is_active = true;
CREATE INDEX idx_user_memories_embedding ON public.user_memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX idx_user_psych_profile_user ON public.user_psych_profile(user_id);

-- Enable RLS
ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_psych_profile ENABLE ROW LEVEL SECURITY;

-- RLS: user_memories
CREATE POLICY "Users can view own memories" ON public.user_memories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own memories" ON public.user_memories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own memories" ON public.user_memories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own memories" ON public.user_memories FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all memories" ON public.user_memories FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- RLS: user_psych_profile
CREATE POLICY "Users can view own psych profile" ON public.user_psych_profile FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all psych profiles" ON public.user_psych_profile FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- RPC: search_user_memories
CREATE OR REPLACE FUNCTION public.search_user_memories(
  p_user_id UUID,
  p_query_embedding vector(768),
  p_category TEXT DEFAULT NULL,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  category TEXT,
  confidence DECIMAL,
  similarity FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_memories um
  SET last_accessed = now()
  WHERE um.user_id = p_user_id AND um.is_active = true
    AND um.id IN (
      SELECT um2.id FROM public.user_memories um2
      WHERE um2.user_id = p_user_id AND um2.is_active = true
        AND (um2.expiry IS NULL OR um2.expiry > now())
        AND (p_category IS NULL OR um2.category = p_category)
      ORDER BY um2.embedding <=> p_query_embedding LIMIT p_limit
    );

  RETURN QUERY
  SELECT um.id, um.content, um.category, um.confidence,
    1 - (um.embedding <=> p_query_embedding)::FLOAT AS similarity, um.created_at
  FROM public.user_memories um
  WHERE um.user_id = p_user_id AND um.is_active = true
    AND (um.expiry IS NULL OR um.expiry > now())
    AND (p_category IS NULL OR um.category = p_category)
  ORDER BY um.embedding <=> p_query_embedding LIMIT p_limit;
END;
$$;

-- RPC: cleanup_expired_memories
CREATE OR REPLACE FUNCTION public.cleanup_expired_memories()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE affected INT;
BEGIN
  UPDATE public.user_memories SET is_active = false
  WHERE expiry IS NOT NULL AND expiry < now() AND is_active = true;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Trigger for updated_at
CREATE TRIGGER update_user_psych_profile_updated_at
BEFORE UPDATE ON public.user_psych_profile
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
