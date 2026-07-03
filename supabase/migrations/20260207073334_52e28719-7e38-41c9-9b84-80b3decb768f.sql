-- Add system_api_key column to ai_model_settings for Admin's centralized Gemini key
ALTER TABLE ai_model_settings 
ADD COLUMN IF NOT EXISTS system_api_key TEXT;

COMMENT ON COLUMN ai_model_settings.system_api_key IS 
'Admin Gemini API key for system-granted users. Stored encrypted at rest. Never exposed to frontend.';

-- RPC to securely set system API key (admin only)
CREATE OR REPLACE FUNCTION set_system_api_key(p_api_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  -- Check if current user is admin
  SELECT EXISTS (
    SELECT 1 FROM admin_users WHERE user_id = auth.uid()
  ) INTO is_admin;
  
  IF NOT is_admin THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Update the system API key (there should only be one row)
  UPDATE ai_model_settings SET system_api_key = p_api_key, updated_at = now();
  
  -- If no rows updated, insert new settings
  IF NOT FOUND THEN
    INSERT INTO ai_model_settings (system_api_key, updated_at)
    VALUES (p_api_key, now());
  END IF;
END;
$$;

-- RPC to check if system key exists (for frontend display - returns boolean only, never the key)
CREATE OR REPLACE FUNCTION check_system_api_key_exists()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT system_api_key IS NOT NULL AND system_api_key != '' 
  FROM ai_model_settings LIMIT 1;
$$;

-- RPC to get system API key (for edge functions only - requires service role or admin)
-- This is called server-side only from edge functions
CREATE OR REPLACE FUNCTION get_system_api_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  api_key text;
BEGIN
  SELECT system_api_key INTO api_key FROM ai_model_settings LIMIT 1;
  RETURN api_key;
END;
$$;