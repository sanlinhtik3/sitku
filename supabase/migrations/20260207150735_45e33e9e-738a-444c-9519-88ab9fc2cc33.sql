-- ============================================
-- FIX: set_system_api_key RPC function + Add enable_free_tier column
-- ============================================

-- 1. Add enable_free_tier column to ai_model_settings (for auto free tier access)
ALTER TABLE ai_model_settings 
ADD COLUMN IF NOT EXISTS enable_free_tier BOOLEAN DEFAULT true;

COMMENT ON COLUMN ai_model_settings.enable_free_tier IS 
'If true, ALL free users automatically get access to System API Key within their daily limits (like Claude/ChatGPT free tier)';

-- 2. Fix the set_system_api_key function (remove admin_users reference, use has_role instead)
CREATE OR REPLACE FUNCTION set_system_api_key(p_api_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- FIX: Use has_role() instead of non-existent admin_users table
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Update the system API key (there should only be one row typically)
  UPDATE ai_model_settings 
  SET system_api_key = p_api_key, 
      updated_at = now()
  WHERE id = (SELECT id FROM ai_model_settings ORDER BY updated_at DESC LIMIT 1);
  
  -- If no rows updated, insert new settings with the key
  IF NOT FOUND THEN
    INSERT INTO ai_model_settings (system_api_key, updated_at, enable_free_tier)
    VALUES (p_api_key, now(), true);
  END IF;
END;
$$;

-- 3. Grant execute permission to authenticated users (admin check is in the function)
GRANT EXECUTE ON FUNCTION set_system_api_key(text) TO authenticated;