-- Add is_paused column to ai_user_settings for pause/resume functionality
ALTER TABLE ai_user_settings 
ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN ai_user_settings.is_paused IS 
'When true, system-granted free access is temporarily paused';