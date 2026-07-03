
CREATE TABLE IF NOT EXISTS public.beebot_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  name TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  attrs JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  importance REAL NOT NULL DEFAULT 0.5,
  mention_count INTEGER NOT NULL DEFAULT 1,
  last_mentioned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  embedding vector(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, entity_type, canonical_key)
);
CREATE INDEX IF NOT EXISTS idx_entities_user_type ON public.beebot_entities(user_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_importance ON public.beebot_entities(user_id, importance DESC);
CREATE INDEX IF NOT EXISTS idx_entities_embedding ON public.beebot_entities USING hnsw (embedding vector_cosine_ops);
ALTER TABLE public.beebot_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entities_owner_all" ON public.beebot_entities FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.beebot_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  from_entity UUID NOT NULL REFERENCES public.beebot_entities(id) ON DELETE CASCADE,
  to_entity UUID NOT NULL REFERENCES public.beebot_entities(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  strength REAL NOT NULL DEFAULT 0.5,
  evidence JSONB DEFAULT '{}'::jsonb,
  observed_count INTEGER NOT NULL DEFAULT 1,
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, from_entity, to_entity, relation_type)
);
CREATE INDEX IF NOT EXISTS idx_relations_user ON public.beebot_relations(user_id);
CREATE INDEX IF NOT EXISTS idx_relations_from ON public.beebot_relations(from_entity);
CREATE INDEX IF NOT EXISTS idx_relations_to ON public.beebot_relations(to_entity);
ALTER TABLE public.beebot_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "relations_owner_all" ON public.beebot_relations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_entities_updated BEFORE UPDATE ON public.beebot_entities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
