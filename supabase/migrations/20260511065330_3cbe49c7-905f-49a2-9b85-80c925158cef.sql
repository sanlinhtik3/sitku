
CREATE TABLE IF NOT EXISTS public.beebot_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lesson_text TEXT NOT NULL,
  category TEXT,
  evidence_trajectory_ids UUID[] DEFAULT ARRAY[]::UUID[],
  confidence REAL NOT NULL DEFAULT 0.5,
  applied_count INTEGER NOT NULL DEFAULT 0,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  embedding vector(768),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lessons_user ON public.beebot_lessons(user_id, is_active, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_lessons_embedding ON public.beebot_lessons USING hnsw (embedding vector_cosine_ops);
ALTER TABLE public.beebot_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lessons_owner_all" ON public.beebot_lessons FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_lessons_updated BEFORE UPDATE ON public.beebot_lessons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.beebot_recall_lessons(
  p_user_id UUID,
  p_query_embedding vector(768),
  p_limit INTEGER DEFAULT 5,
  p_min_confidence REAL DEFAULT 0.4
)
RETURNS TABLE (id UUID, lesson_text TEXT, category TEXT, confidence REAL, similarity REAL)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.id, l.lesson_text, l.category, l.confidence,
    (1 - (l.embedding <=> p_query_embedding))::real AS similarity
  FROM public.beebot_lessons l
  WHERE l.user_id = p_user_id AND l.is_active = true
    AND l.confidence >= p_min_confidence AND l.embedding IS NOT NULL
  ORDER BY l.embedding <=> p_query_embedding
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.beebot_query_world_model(
  p_user_id UUID,
  p_entity_id UUID,
  p_depth INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_nodes JSONB;
  v_edges JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.beebot_entities WHERE id = p_entity_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('error', 'entity_not_found_or_forbidden');
  END IF;

  WITH RECURSIVE graph AS (
    SELECT e.id, 0 AS depth
    FROM public.beebot_entities e
    WHERE e.id = p_entity_id AND e.user_id = p_user_id
    UNION
    SELECT e2.id, g.depth + 1
    FROM graph g
    JOIN public.beebot_relations r ON (r.from_entity = g.id OR r.to_entity = g.id)
    JOIN public.beebot_entities e2 ON e2.id = (CASE WHEN r.from_entity = g.id THEN r.to_entity ELSE r.from_entity END)
    WHERE g.depth < p_depth AND e2.user_id = p_user_id AND r.user_id = p_user_id
  )
  SELECT jsonb_agg(DISTINCT jsonb_build_object(
    'id', e.id, 'type', e.entity_type, 'name', e.name,
    'attrs', e.attrs, 'importance', e.importance, 'depth', g.depth
  )) INTO v_nodes
  FROM graph g JOIN public.beebot_entities e ON e.id = g.id;

  SELECT jsonb_agg(DISTINCT jsonb_build_object(
    'from', r.from_entity, 'to', r.to_entity,
    'type', r.relation_type, 'strength', r.strength
  )) INTO v_edges
  FROM public.beebot_relations r
  WHERE r.user_id = p_user_id
    AND r.from_entity IN (SELECT id FROM graph)
    AND r.to_entity IN (SELECT id FROM graph);

  RETURN jsonb_build_object(
    'root', p_entity_id,
    'nodes', COALESCE(v_nodes, '[]'::jsonb),
    'edges', COALESCE(v_edges, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.beebot_upsert_entity(
  p_user_id UUID, p_type TEXT, p_name TEXT, p_canonical_key TEXT,
  p_attrs JSONB DEFAULT '{}'::jsonb, p_description TEXT DEFAULT NULL,
  p_importance REAL DEFAULT 0.5, p_embedding vector(768) DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.beebot_entities (user_id, entity_type, name, canonical_key, attrs, description, importance, embedding)
  VALUES (p_user_id, p_type, p_name, p_canonical_key, p_attrs, p_description, p_importance, p_embedding)
  ON CONFLICT (user_id, entity_type, canonical_key) DO UPDATE SET
    name = EXCLUDED.name,
    attrs = public.beebot_entities.attrs || EXCLUDED.attrs,
    description = COALESCE(EXCLUDED.description, public.beebot_entities.description),
    importance = GREATEST(public.beebot_entities.importance, EXCLUDED.importance),
    mention_count = public.beebot_entities.mention_count + 1,
    last_mentioned_at = now(),
    embedding = COALESCE(EXCLUDED.embedding, public.beebot_entities.embedding),
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
