
-- Step 1: Add enabled_gemini_models column
ALTER TABLE ai_model_settings 
ADD COLUMN IF NOT EXISTS enabled_gemini_models text[] 
DEFAULT ARRAY['gemini-2.5-flash-lite','gemini-2.5-flash','gemini-2.5-pro','gemini-3-flash-preview','gemini-3-pro-preview'];

-- Step 2: Update check_system_api_keys_status RPC to include enabled_gemini_models
CREATE OR REPLACE FUNCTION public.check_system_api_keys_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'has_google_key', google_system_api_key IS NOT NULL AND google_system_api_key != '',
    'has_anthropic_key', anthropic_system_api_key IS NOT NULL AND anthropic_system_api_key != '',
    'default_gemini_model', default_gemini_model,
    'default_claude_model', default_claude_model,
    'enable_google_provider', COALESCE(enable_google_provider, true),
    'enable_anthropic_provider', COALESCE(enable_anthropic_provider, false),
    'allow_personal_api_key', COALESCE(allow_personal_api_key, false),
    'enabled_gemini_models', COALESCE(enabled_gemini_models, ARRAY['gemini-2.5-flash-lite','gemini-2.5-flash','gemini-2.5-pro','gemini-3-flash-preview','gemini-3-pro-preview'])
  ) INTO result
  FROM ai_model_settings 
  LIMIT 1;
  
  RETURN COALESCE(result, jsonb_build_object(
    'has_google_key', false,
    'has_anthropic_key', false,
    'default_gemini_model', 'gemini-3-flash-preview',
    'default_claude_model', 'claude-4-5-sonnet',
    'enable_google_provider', true,
    'enable_anthropic_provider', false,
    'allow_personal_api_key', false,
    'enabled_gemini_models', ARRAY['gemini-2.5-flash-lite','gemini-2.5-flash','gemini-2.5-pro','gemini-3-flash-preview','gemini-3-pro-preview']
  ));
END;
$$;

-- Step 3: Update get_user_intelligence_status RPC to filter allowed_gemini_models by admin's enabled list
CREATE OR REPLACE FUNCTION public.get_user_intelligence_status(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_tier RECORD;
  v_credits RECORD;
  v_usage RECORD;
  v_is_admin BOOLEAN;
  v_has_personal_key BOOLEAN;
  v_today DATE := CURRENT_DATE;
  v_effective_limit INTEGER;
  v_enabled_gemini_models TEXT[];
  v_filtered_gemini_models TEXT[];
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  
  -- Check admin status
  v_is_admin := public.has_role(v_user_id, 'admin'::public.app_role);
  
  -- Get user credits and tier
  SELECT * INTO v_credits FROM user_credits WHERE user_id = v_user_id;
  
  -- Get tier config
  IF v_is_admin THEN
    SELECT * INTO v_tier FROM tier_registry WHERE tier_key = 'admin';
  ELSE
    SELECT * INTO v_tier FROM tier_registry 
    WHERE tier_key = COALESCE(v_credits.tier_key, 'explorer');
  END IF;
  
  -- Get today's usage
  SELECT * INTO v_usage FROM daily_usage 
  WHERE user_id = v_user_id AND usage_date = v_today;
  
  -- Check personal API key
  SELECT (gemini_api_key IS NOT NULL AND gemini_api_key != '') INTO v_has_personal_key
  FROM ai_user_settings WHERE user_id = v_user_id;
  
  -- Get admin-enabled gemini models
  SELECT COALESCE(ams.enabled_gemini_models, ARRAY['gemini-2.5-flash-lite','gemini-2.5-flash','gemini-2.5-pro','gemini-3-flash-preview','gemini-3-pro-preview'])
  INTO v_enabled_gemini_models
  FROM ai_model_settings ams
  LIMIT 1;
  
  -- Intersect tier's allowed models with admin's enabled models
  SELECT ARRAY(
    SELECT unnest(v_tier.allowed_gemini_models)
    INTERSECT
    SELECT unnest(v_enabled_gemini_models)
  ) INTO v_filtered_gemini_models;
  
  -- Calculate effective limit (with personal key bonus)
  v_effective_limit := v_tier.daily_iu_limit;
  IF COALESCE(v_has_personal_key, false) AND v_tier.iu_bonus_with_key > 0 THEN
    v_effective_limit := v_effective_limit + v_tier.iu_bonus_with_key;
  END IF;

  RETURN jsonb_build_object(
    -- Tier Identity
    'tier_key', v_tier.tier_key,
    'tier_display', v_tier.display_name,
    'tier_display_mm', v_tier.display_name_mm,
    'tier_icon', v_tier.icon_name,
    'tier_gradient', v_tier.color_gradient,
    
    -- IU Status
    'daily_iu_limit', v_effective_limit,
    'daily_iu_used', COALESCE(v_usage.iu_consumed, 0),
    'daily_iu_remaining', CASE 
      WHEN v_tier.daily_iu_limit = -1 THEN -1
      ELSE GREATEST(0, v_effective_limit - COALESCE(v_usage.iu_consumed, 0))
    END,
    'iu_bonus', COALESCE(v_credits.iu_bonus, 0),
    'iu_balance', COALESCE(v_credits.iu_balance, 0),
    
    -- Priority & Model
    'priority_level', v_tier.priority_level,
    'priority_label', v_tier.priority_label,
    'default_model', v_tier.default_model,
    'allowed_gemini_models', v_filtered_gemini_models,
    'allowed_claude_models', v_tier.allowed_claude_models,
    'context_limit', v_tier.max_context_window,
    'preferred_model', v_credits.preferred_model,
    'preferred_provider', v_credits.preferred_provider,
    
    -- Status Flags
    'is_unlimited', v_tier.daily_iu_limit = -1,
    'is_admin', v_is_admin,
    'has_personal_key', COALESCE(v_has_personal_key, false),
    
    -- Timing
    'resets_at', (v_today + 1)::TEXT || 'T00:00:00+06:30',
    
    -- Analytics
    'tokens_processed_today', COALESCE(v_usage.tokens_input, 0) + COALESCE(v_usage.tokens_output, 0),
    'model_used_today', v_usage.model_used
  );
END;
$$;
