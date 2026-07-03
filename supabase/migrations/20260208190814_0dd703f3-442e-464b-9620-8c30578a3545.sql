-- Step 1: Add auto_sync_enabled column to ai_model_settings
ALTER TABLE ai_model_settings 
ADD COLUMN IF NOT EXISTS auto_sync_enabled BOOLEAN DEFAULT true;

COMMENT ON COLUMN ai_model_settings.auto_sync_enabled IS 
'Controls whether the auto-embed trigger is active';

-- Step 2: Update the trigger function to check the flag
CREATE OR REPLACE FUNCTION trigger_auto_embed_content()
RETURNS TRIGGER AS $$
DECLARE
  is_enabled BOOLEAN;
BEGIN
  -- Check if auto-sync is enabled
  SELECT auto_sync_enabled INTO is_enabled 
  FROM ai_model_settings 
  LIMIT 1;
  
  -- If disabled, skip the trigger logic
  IF is_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  
  -- Original trigger logic: only process global content
  IF NEW.is_global = TRUE THEN
    NEW.embedding_status := 'pending';
    NEW.embedding_synced_at := NULL;
    NEW.embedding_error := NULL;
    
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