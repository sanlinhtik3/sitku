CREATE OR REPLACE FUNCTION public.set_user_preferred_model(p_model_id text, p_provider text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider TEXT;
BEGIN
  -- Determine provider from model if not specified
  IF p_provider IS NULL THEN
    IF p_model_id ILIKE 'claude%' THEN
      v_provider := 'anthropic';
    ELSIF p_model_id LIKE '%/%' THEN
      v_provider := 'openrouter';
    ELSIF p_model_id ILIKE 'grok%' THEN
      v_provider := 'xai';
    ELSE
      v_provider := 'google';
    END IF;
  ELSE
    v_provider := p_provider;
  END IF;

  -- Update user_credits (primary)
  UPDATE user_credits SET
    preferred_model = p_model_id,
    preferred_provider = v_provider,
    updated_at = NOW()
  WHERE user_id = auth.uid();

  -- Sync to ai_user_settings so backend fallback reads correct value
  UPDATE ai_user_settings SET
    gemini_model = p_model_id
  WHERE user_id = auth.uid();

  -- If no ai_user_settings row exists, create one
  IF NOT FOUND THEN
    INSERT INTO ai_user_settings (user_id, gemini_model)
    VALUES (auth.uid(), p_model_id)
    ON CONFLICT (user_id) DO UPDATE SET gemini_model = EXCLUDED.gemini_model;
  END IF;

  RETURN jsonb_build_object('success', true, 'model', p_model_id, 'provider', v_provider);
END;
$$;