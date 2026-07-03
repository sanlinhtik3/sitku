-- Add unique constraint on content_id for upsert operations
-- This fixes the "no unique or exclusion constraint matching ON CONFLICT" error
ALTER TABLE kb_embedding_sync_queue 
ADD CONSTRAINT kb_embedding_sync_queue_content_id_key UNIQUE (content_id);