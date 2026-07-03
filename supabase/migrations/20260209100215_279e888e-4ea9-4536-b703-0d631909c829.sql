-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 2: Intelligence Orchestrator RPC Functions
-- Dual-Core API Key Management + IU Deduction Logic
-- ═══════════════════════════════════════════════════════════════════════════

-- 2.1 Get Google (Gemini) System API Key - Admin only
CREATE OR REPLACE FUNCTION public.get_google_system_api_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  api_key TEXT;
BEGIN
  -- Only callable from edge functions (service role) or admin
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  SELECT google_system_api_key INTO api_key 
  FROM ai_model_settings 
  LIMIT 1;
  
  RETURN api_key;
END;
$$;

-- 2.2 Get Anthropic (Claude) System API Key - Admin only
CREATE OR REPLACE FUNCTION public.get_anthropic_system_api_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  api_key TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  SELECT anthropic_system_api_key INTO api_key 
  FROM ai_model_settings 
  LIMIT 1;
  
  RETURN api_key;
END;
$$;

-- 2.3 Set System API Keys - Admin only
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
    google_system_api_key = COALESCE(NULLIF(p_google_key, ''), google_system_api_key),
    anthropic_system_api_key = COALESCE(NULLIF(p_anthropic_key, ''), anthropic_system_api_key),
    updated_at = NOW()
  WHERE id = (SELECT id FROM ai_model_settings LIMIT 1);
  
  -- Log admin action
  INSERT INTO admin_audit_logs (admin_user_id, action, resource_type, details)
  VALUES (auth.uid(), 'update_api_keys', 'ai_model_settings', jsonb_build_object(
    'google_key_updated', p_google_key IS NOT NULL AND p_google_key != '',
    'anthropic_key_updated', p_anthropic_key IS NOT NULL AND p_anthropic_key != ''
  ));
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 2.4 Check if system API keys exist (for UI status)
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
    'default_claude_model', default_claude_model
  ) INTO result
  FROM ai_model_settings 
  LIMIT 1;
  
  RETURN COALESCE(result, jsonb_build_object(
    'has_google_key', false,
    'has_anthropic_key', false,
    'default_gemini_model', 'gemini-3-flash-preview',
    'default_claude_model', 'claude-4-5-sonnet'
  ));
END;
$$;

-- 2.5 Get User Intelligence Status (for dashboard display)
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
    'allowed_gemini_models', v_tier.allowed_gemini_models,
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

-- 2.6 Main Intelligence Orchestrator: Check and Deduct IU
CREATE OR REPLACE FUNCTION public.check_and_deduct_intelligence(
  p_user_id UUID,
  p_feature_key TEXT DEFAULT 'general',
  p_model_requested TEXT DEFAULT NULL,
  p_estimated_tokens INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier RECORD;
  v_credits RECORD;
  v_model_cost RECORD;
  v_is_admin BOOLEAN;
  v_has_personal_key BOOLEAN;
  v_estimated_iu DECIMAL;
  v_actual_model TEXT;
  v_actual_provider TEXT;
  v_today DATE := CURRENT_DATE;
  v_daily_iu_used DECIMAL;
  v_effective_limit DECIMAL;
  v_daily_remaining DECIMAL;
  v_deduct_from TEXT;
  v_new_balance DECIMAL;
  v_tier_key TEXT;
BEGIN
  -- 1. ADMIN BYPASS (Sovereign tier)
  v_is_admin := public.has_role(p_user_id, 'admin'::public.app_role);
  IF v_is_admin THEN
    -- Determine provider from model
    IF p_model_requested ILIKE 'claude%' THEN
      v_actual_provider := 'anthropic';
    ELSE
      v_actual_provider := 'google';
    END IF;
    
    -- Track usage (but don't deduct)
    INSERT INTO daily_usage (user_id, usage_date, total_uses, iu_consumed, model_used, provider_used)
    VALUES (p_user_id, v_today, 1, 0, COALESCE(p_model_requested, 'claude-4-6-opus'), v_actual_provider)
    ON CONFLICT (user_id, usage_date) 
    DO UPDATE SET total_uses = daily_usage.total_uses + 1,
                  model_used = COALESCE(p_model_requested, 'claude-4-6-opus'),
                  provider_used = v_actual_provider;
    
    RETURN jsonb_build_object(
      'success', true,
      'tier', 'admin',
      'tier_display', 'Sovereign',
      'tier_display_mm', 'အချုပ်အခြာ',
      'model', COALESCE(p_model_requested, 'claude-4-6-opus'),
      'provider', v_actual_provider,
      'priority', 'dedicated',
      'priority_level', 3,
      'iu_cost', 0,
      'iu_remaining', -1,
      'is_unlimited', true,
      'context_limit', 500000
    );
  END IF;

  -- 2. Get user's credits and tier
  SELECT * INTO v_credits FROM user_credits WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    -- Auto-create for new users
    INSERT INTO user_credits (user_id, balance, tier_key, iu_balance, iu_bonus)
    VALUES (p_user_id, 10, 'explorer', 10, 0)
    RETURNING * INTO v_credits;
  END IF;
  
  v_tier_key := COALESCE(v_credits.tier_key, 'explorer');
  SELECT * INTO v_tier FROM tier_registry WHERE tier_key = v_tier_key AND is_active = true;
  IF NOT FOUND THEN
    SELECT * INTO v_tier FROM tier_registry WHERE tier_key = 'explorer';
  END IF;

  -- 3. Check personal API key
  SELECT (gemini_api_key IS NOT NULL AND gemini_api_key != '') INTO v_has_personal_key
  FROM ai_user_settings WHERE user_id = p_user_id;

  -- 4. Determine model and validate access
  v_actual_model := COALESCE(p_model_requested, COALESCE(v_credits.preferred_model, v_tier.default_model));
  
  -- Check if model is allowed for tier
  IF v_actual_model ILIKE 'claude%' THEN
    IF NOT (v_actual_model = ANY(v_tier.allowed_claude_models)) THEN
      v_actual_model := v_tier.default_model;
    END IF;
    v_actual_provider := 'anthropic';
  ELSE
    IF NOT (v_actual_model = ANY(v_tier.allowed_gemini_models)) THEN
      v_actual_model := v_tier.default_model;
    END IF;
    v_actual_provider := 'google';
  END IF;

  -- 5. Get model cost
  SELECT * INTO v_model_cost FROM model_cost_matrix WHERE model_id = v_actual_model;
  v_estimated_iu := COALESCE(v_model_cost.base_iu_per_request, 0.5) 
    + (p_estimated_tokens / 1000.0 * COALESCE(v_model_cost.iu_per_1k_input, 0.01))
    + (p_estimated_tokens * 2 / 1000.0 * COALESCE(v_model_cost.iu_per_1k_output, 0.04));

  -- 6. Get daily usage
  SELECT COALESCE(iu_consumed, 0) INTO v_daily_iu_used
  FROM daily_usage WHERE user_id = p_user_id AND usage_date = v_today;
  v_daily_iu_used := COALESCE(v_daily_iu_used, 0);

  -- Calculate effective limit
  v_effective_limit := v_tier.daily_iu_limit;
  IF COALESCE(v_has_personal_key, false) AND v_tier.iu_bonus_with_key > 0 THEN
    v_effective_limit := v_effective_limit + v_tier.iu_bonus_with_key;
  END IF;

  -- 7. Check for unlimited tier
  IF v_tier.daily_iu_limit = -1 THEN
    -- Track but don't deduct
    INSERT INTO daily_usage (user_id, usage_date, total_uses, iu_consumed, model_used, provider_used, tokens_input)
    VALUES (p_user_id, v_today, 1, v_estimated_iu, v_actual_model, v_actual_provider, p_estimated_tokens)
    ON CONFLICT (user_id, usage_date) 
    DO UPDATE SET total_uses = daily_usage.total_uses + 1,
                  iu_consumed = daily_usage.iu_consumed + v_estimated_iu,
                  model_used = v_actual_model,
                  provider_used = v_actual_provider,
                  tokens_input = daily_usage.tokens_input + p_estimated_tokens;
    
    RETURN jsonb_build_object(
      'success', true,
      'tier', v_tier.tier_key,
      'tier_display', v_tier.display_name,
      'tier_display_mm', v_tier.display_name_mm,
      'model', v_actual_model,
      'provider', v_actual_provider,
      'priority', v_tier.priority_label,
      'priority_level', v_tier.priority_level,
      'iu_cost', v_estimated_iu,
      'iu_remaining', -1,
      'is_unlimited', true,
      'context_limit', v_tier.max_context_window,
      'has_personal_key', COALESCE(v_has_personal_key, false)
    );
  END IF;

  -- 8. Deduction priority: Daily → Bonus → Balance
  v_daily_remaining := GREATEST(0, v_effective_limit - v_daily_iu_used);

  IF v_daily_remaining >= v_estimated_iu THEN
    v_deduct_from := 'daily';
    INSERT INTO daily_usage (user_id, usage_date, total_uses, iu_consumed, model_used, provider_used, tokens_input, daily_limit)
    VALUES (p_user_id, v_today, 1, v_estimated_iu, v_actual_model, v_actual_provider, p_estimated_tokens, v_effective_limit)
    ON CONFLICT (user_id, usage_date) 
    DO UPDATE SET total_uses = daily_usage.total_uses + 1,
                  iu_consumed = daily_usage.iu_consumed + v_estimated_iu,
                  model_used = v_actual_model,
                  provider_used = v_actual_provider,
                  tokens_input = daily_usage.tokens_input + p_estimated_tokens;
    v_new_balance := v_daily_remaining - v_estimated_iu + COALESCE(v_credits.iu_bonus, 0) + COALESCE(v_credits.iu_balance, 0);

  ELSIF COALESCE(v_credits.iu_bonus, 0) >= v_estimated_iu THEN
    v_deduct_from := 'bonus';
    UPDATE user_credits SET iu_bonus = iu_bonus - v_estimated_iu, updated_at = NOW() 
    WHERE user_id = p_user_id;
    v_new_balance := v_credits.iu_bonus - v_estimated_iu + COALESCE(v_credits.iu_balance, 0);

  ELSIF COALESCE(v_credits.iu_balance, 0) >= v_estimated_iu THEN
    v_deduct_from := 'balance';
    UPDATE user_credits SET 
      iu_balance = iu_balance - v_estimated_iu, 
      balance = balance - CEIL(v_estimated_iu)::integer,
      updated_at = NOW() 
    WHERE user_id = p_user_id;
    v_new_balance := v_credits.iu_balance - v_estimated_iu;

  ELSE
    -- INSUFFICIENT IU
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_intelligence',
      'tier', v_tier.tier_key,
      'tier_display', v_tier.display_name,
      'tier_display_mm', v_tier.display_name_mm,
      'iu_required', v_estimated_iu,
      'iu_remaining', v_daily_remaining + COALESCE(v_credits.iu_bonus, 0) + COALESCE(v_credits.iu_balance, 0),
      'daily_limit', v_effective_limit,
      'resets_at', (v_today + 1)::TEXT || 'T00:00:00+06:30'
    );
  END IF;

  -- 9. Log transaction
  INSERT INTO iu_transactions (user_id, iu_amount, transaction_type, source_pool, feature_key, model_used, provider_used, tokens_processed, balance_after)
  VALUES (p_user_id, -v_estimated_iu, 'usage', v_deduct_from, p_feature_key, v_actual_model, v_actual_provider, p_estimated_tokens, v_new_balance);

  -- 10. Success response
  RETURN jsonb_build_object(
    'success', true,
    'tier', v_tier.tier_key,
    'tier_display', v_tier.display_name,
    'tier_display_mm', v_tier.display_name_mm,
    'model', v_actual_model,
    'provider', v_actual_provider,
    'priority', v_tier.priority_label,
    'priority_level', v_tier.priority_level,
    'iu_cost', v_estimated_iu,
    'iu_remaining', v_new_balance,
    'daily_limit', v_effective_limit,
    'deducted_from', v_deduct_from,
    'context_limit', v_tier.max_context_window,
    'has_personal_key', COALESCE(v_has_personal_key, false),
    'is_unlimited', false
  );
END;
$$;

-- 2.7 Update user preferred model
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