-- Add unique constraint to prevent duplicate settings rows
CREATE UNIQUE INDEX IF NOT EXISTS ai_model_settings_singleton_idx ON ai_model_settings ((TRUE));