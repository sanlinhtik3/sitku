-- Defect 2: Migrate IVFFlat indexes to HNSW for better recall at scale
DROP INDEX IF EXISTS idx_kb_embedding;
CREATE INDEX idx_kb_embedding ON knowledge_base_embeddings 
  USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);

DROP INDEX IF EXISTS idx_chat_memory_embedding;
CREATE INDEX idx_chat_memory_embedding ON chat_memory_embeddings 
  USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);

DROP INDEX IF EXISTS idx_user_memories_embedding;
CREATE INDEX idx_user_memories_embedding ON user_memories 
  USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);

-- Defect 4: Add is_personal column for Personal Knowledge Engine
ALTER TABLE ai_generated_content ADD COLUMN IF NOT EXISTS is_personal BOOLEAN DEFAULT false;