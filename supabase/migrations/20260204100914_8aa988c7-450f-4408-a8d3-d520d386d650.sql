-- ═══════════════════════════════════════════════════════════════════
-- BEEBOT ACTIVE RECALL - RAG Architecture with Vector Embeddings
-- Phase 1: pgvector Extension + Episodic Memory Table
-- Phase 2: Knowledge Base Embeddings Table
-- ═══════════════════════════════════════════════════════════════════

-- Enable the pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- ═══ PHASE 1: CHAT MEMORY EMBEDDINGS (Episodic Memory) ═══

CREATE TABLE public.chat_memory_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id UUID NOT NULL REFERENCES public.agent_chat_sessions(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.agent_chat_messages(id) ON DELETE SET NULL,
  content_summary TEXT NOT NULL,
  embedding vector(768) NOT NULL,
  importance_score DECIMAL(3,2) DEFAULT 0.5,
  topic_tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for vector similarity search (IVFFlat for balanced speed/accuracy)
CREATE INDEX idx_chat_memory_embedding ON public.chat_memory_embeddings 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Index for user filtering with recency
CREATE INDEX idx_chat_memory_user ON public.chat_memory_embeddings(user_id, created_at DESC);

-- Index for session lookups
CREATE INDEX idx_chat_memory_session ON public.chat_memory_embeddings(session_id);

-- Enable RLS
ALTER TABLE public.chat_memory_embeddings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own memories
CREATE POLICY "Users can manage their own chat memories" 
ON public.chat_memory_embeddings
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ═══ PHASE 2: KNOWLEDGE BASE EMBEDDINGS (Semantic KB Search) ═══

CREATE TABLE public.knowledge_base_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES public.ai_generated_content(id) ON DELETE CASCADE,
  chunk_index INT DEFAULT 0,
  content_chunk TEXT NOT NULL,
  embedding vector(768) NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT now()
);

-- Index for vector search
CREATE INDEX idx_kb_embedding ON public.knowledge_base_embeddings 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Index for content lookups
CREATE INDEX idx_kb_content_id ON public.knowledge_base_embeddings(content_id);

-- RLS: KB embeddings are readable by all authenticated users (global content)
ALTER TABLE public.knowledge_base_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read KB embeddings" 
ON public.knowledge_base_embeddings
FOR SELECT 
USING (true);

-- Service role can manage KB embeddings (for triggers/edge functions)
CREATE POLICY "Service role can manage KB embeddings" 
ON public.knowledge_base_embeddings
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- ═══ VECTOR SEARCH FUNCTIONS ═══

-- Function: Search Episodic Memory (past conversations)
CREATE OR REPLACE FUNCTION public.search_episodic_memory(
  p_user_id UUID,
  p_query_embedding vector(768),
  p_time_range TEXT DEFAULT 'all_time',
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content_summary TEXT,
  similarity FLOAT,
  created_at TIMESTAMPTZ,
  session_title TEXT,
  topic_tags TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cm.id,
    cm.content_summary,
    1 - (cm.embedding <=> p_query_embedding) AS similarity,
    cm.created_at,
    s.title AS session_title,
    cm.topic_tags
  FROM public.chat_memory_embeddings cm
  JOIN public.agent_chat_sessions s ON cm.session_id = s.id
  WHERE cm.user_id = p_user_id
    AND (
      p_time_range = 'all_time' 
      OR (p_time_range = 'this_week' AND cm.created_at > NOW() - INTERVAL '7 days')
      OR (p_time_range = 'this_month' AND cm.created_at > NOW() - INTERVAL '30 days')
      OR (p_time_range = 'last_month' AND cm.created_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days')
    )
  ORDER BY cm.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Search Knowledge Base (semantic search)
CREATE OR REPLACE FUNCTION public.search_knowledge_base_semantic(
  p_query_embedding vector(768),
  p_category TEXT DEFAULT NULL,
  p_language TEXT DEFAULT NULL,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  content_id UUID,
  title TEXT,
  content_chunk TEXT,
  similarity FLOAT,
  category TEXT,
  language TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    agc.id AS content_id,
    agc.title,
    kbe.content_chunk,
    1 - (kbe.embedding <=> p_query_embedding) AS similarity,
    agc.category,
    agc.language
  FROM public.knowledge_base_embeddings kbe
  JOIN public.ai_generated_content agc ON kbe.content_id = agc.id
  WHERE agc.is_global = TRUE
    AND (p_category IS NULL OR agc.category = p_category)
    AND (p_language IS NULL OR agc.language = p_language)
  ORDER BY kbe.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ KB SYNC TRACKING TABLE ═══
-- Track which content needs embedding sync (for async processing)
CREATE TABLE public.kb_embedding_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES public.ai_generated_content(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_kb_sync_queue_status ON public.kb_embedding_sync_queue(status, created_at);

-- RLS for sync queue (service role only)
ALTER TABLE public.kb_embedding_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage sync queue" 
ON public.kb_embedding_sync_queue
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- ═══ TRIGGER: Auto-queue KB content for embedding sync ═══

CREATE OR REPLACE FUNCTION public.trigger_kb_embedding_sync()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process global content
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_global = TRUE THEN
      INSERT INTO public.kb_embedding_sync_queue (content_id, action)
      VALUES (OLD.id, 'delete');
    END IF;
    RETURN OLD;
  END IF;
  
  IF NEW.is_global = TRUE THEN
    -- Queue for embedding generation
    INSERT INTO public.kb_embedding_sync_queue (content_id, action)
    VALUES (NEW.id, CASE WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'update' END)
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for INSERT and UPDATE on ai_generated_content
DROP TRIGGER IF EXISTS trg_kb_content_insert_sync ON public.ai_generated_content;
CREATE TRIGGER trg_kb_content_insert_sync
  AFTER INSERT ON public.ai_generated_content
  FOR EACH ROW
  WHEN (NEW.is_global = TRUE)
  EXECUTE FUNCTION public.trigger_kb_embedding_sync();

DROP TRIGGER IF EXISTS trg_kb_content_update_sync ON public.ai_generated_content;
CREATE TRIGGER trg_kb_content_update_sync
  AFTER UPDATE OF title, content ON public.ai_generated_content
  FOR EACH ROW
  WHEN (NEW.is_global = TRUE)
  EXECUTE FUNCTION public.trigger_kb_embedding_sync();

-- Handle deletes
DROP TRIGGER IF EXISTS trg_kb_content_delete_sync ON public.ai_generated_content;
CREATE TRIGGER trg_kb_content_delete_sync
  BEFORE DELETE ON public.ai_generated_content
  FOR EACH ROW
  WHEN (OLD.is_global = TRUE)
  EXECUTE FUNCTION public.trigger_kb_embedding_sync();