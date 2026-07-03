CREATE OR REPLACE FUNCTION public.set_system_api_keys(
  p_google_key TEXT DEFAULT NULL,
  p_anthropic_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  UPDATE ai_model_settings SET
    google_system_api_key = CASE 
      WHEN p_google_key = '' THEN NULL
      WHEN p_google_key IS NOT NULL THEN p_google_key
      ELSE google_system_api_key
    END,
    anthropic_system_api_key = CASE 
      WHEN p_anthropic_key = '' THEN NULL
      WHEN p_anthropic_key IS NOT NULL THEN p_anthropic_key
      ELSE anthropic_system_api_key
    END,
    updated_at = NOW()
  WHERE id = (SELECT id FROM ai_model_settings LIMIT 1);
  
  INSERT INTO admin_audit_logs (admin_user_id, action, resource_type, details)
  VALUES (auth.uid(), 'update_api_keys', 'ai_model_settings', jsonb_build_object(
    'google_key_updated', p_google_key IS NOT NULL,
    'google_key_removed', p_google_key = '',
    'anthropic_key_updated', p_anthropic_key IS NOT NULL,
    'anthropic_key_removed', p_anthropic_key = ''
  ));
  
  RETURN jsonb_build_object('success', true);
END;
$$;