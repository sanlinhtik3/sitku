
-- Fix 1: Update set_user_preferred_model to detect OpenRouter/xAI providers
CREATE OR REPLACE FUNCTION public.set_user_preferred_model(
  p_model_id TEXT,
  p_provider TEXT DEFAULT NULL
)
RETURNS JSONB
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
  
  UPDATE user_credits SET 
    preferred_model = p_model_id,
    preferred_provider = v_provider,
    updated_at = NOW()
  WHERE user_id = auth.uid();
  
  RETURN jsonb_build_object('success', true, 'model', p_model_id, 'provider', v_provider);
END;
$$;

-- Fix 3: Correct wrong model names and fix providers for OpenRouter users
UPDATE user_credits 
SET preferred_model = 'qwen/qwen3.6-plus-preview:free',
    preferred_provider = 'openrouter',
    updated_at = NOW()
WHERE preferred_model = 'qwen/qwen3.6-plus:free';

UPDATE user_credits 
SET preferred_provider = 'openrouter',
    updated_at = NOW()
WHERE preferred_model LIKE '%/%' 
  AND (preferred_provider IS NULL OR preferred_provider = 'google');
