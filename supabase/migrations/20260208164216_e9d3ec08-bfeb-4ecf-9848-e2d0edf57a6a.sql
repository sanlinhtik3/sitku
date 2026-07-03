-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║          NEURODIGITALBRAIN AUTO-PILOT UPGRADE - PHASE 1                 ║
-- ║          Embedding Status Tracking & Auto-Sync Trigger                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ═══ STEP 1: Add Status Tracking Columns ═══
ALTER TABLE ai_generated_content 
ADD COLUMN IF NOT EXISTS embedding_status TEXT DEFAULT 'pending';

ALTER TABLE ai_generated_content 
ADD COLUMN IF NOT EXISTS embedding_synced_at TIMESTAMPTZ;

ALTER TABLE ai_generated_content 
ADD COLUMN IF NOT EXISTS embedding_error TEXT;

-- ═══ STEP 2: Create Index for Efficient Filtering ═══
CREATE INDEX IF NOT EXISTS idx_ai_content_embedding_status 
ON ai_generated_content(embedding_status) 
WHERE is_global = true;

-- ═══ STEP 3: Create Auto-Sync Trigger Function ═══
CREATE OR REPLACE FUNCTION trigger_auto_embed_content()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger for global content
  IF NEW.is_global = TRUE THEN
    -- Reset status to pending when content changes
    NEW.embedding_status := 'pending';
    NEW.embedding_synced_at := NULL;
    NEW.embedding_error := NULL;
    
    -- Add to sync queue (with upsert to handle existing entries)
    INSERT INTO kb_embedding_sync_queue (content_id, action, status, created_at)
    VALUES (NEW.id, 'update', 'pending', NOW())
    ON CONFLICT (content_id) 
    DO UPDATE SET 
      action = 'update',
      status = 'pending',
      created_at = NOW(),
      error_message = NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ═══ STEP 4: Create Trigger on Insert and Content Update ═══
DROP TRIGGER IF EXISTS on_content_change_embed ON ai_generated_content;
CREATE TRIGGER on_content_change_embed
  BEFORE INSERT OR UPDATE OF content, title
  ON ai_generated_content
  FOR EACH ROW
  EXECUTE FUNCTION trigger_auto_embed_content();

-- ═══ STEP 5: Set Initial Status for Existing Global Content ═══
-- Mark items that already have embeddings as 'synced'
UPDATE ai_generated_content ac
SET embedding_status = 'synced',
    embedding_synced_at = NOW()
FROM knowledge_base_embeddings kbe
WHERE ac.id = kbe.content_id
  AND ac.is_global = true
  AND ac.embedding_status IS DISTINCT FROM 'synced';

-- Mark items without embeddings as 'pending'
UPDATE ai_generated_content ac
SET embedding_status = 'pending'
WHERE ac.is_global = true
  AND ac.embedding_status IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM knowledge_base_embeddings kbe WHERE kbe.content_id = ac.id
  );

-- ═══ STEP 6: Enable Realtime for Status Updates ═══
ALTER PUBLICATION supabase_realtime ADD TABLE ai_generated_content;