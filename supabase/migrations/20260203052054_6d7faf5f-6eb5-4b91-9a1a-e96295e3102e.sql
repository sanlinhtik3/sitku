-- Fix PGRST202 error: Add missing p_action_type parameter to check_and_increment_usage
-- This resolves "Failed to check usage limits" error in AI Content generation

CREATE OR REPLACE FUNCTION public.check_and_increment_usage(
  p_user_id uuid, 
  p_feature_key text DEFAULT 'general'::text,
  p_action_type text DEFAULT 'generation'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_pro BOOLEAN;
  v_is_admin BOOLEAN;
  v_has_personal_key BOOLEAN;
  v_daily_limit INTEGER;
  v_current_uses INTEGER;
  v_remaining_daily INTEGER;
  v_credit_balance INTEGER;
  v_pro_credits INTEGER;
  v_new_balance INTEGER;
  v_usage_type TEXT := 'daily_free';
  v_today DATE := CURRENT_DATE;
BEGIN
  -- 1. Admin bypass - unlimited access
  v_is_admin := public.has_role(p_user_id, 'admin'::public.app_role);
  IF v_is_admin THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_admin', true,
      'usage_type', 'admin_unlimited',
      'remaining_uses', 999999,
      'daily_limit', -1,
      'credit_balance', 0,
      'pro_credits', 0,
      'is_pro', false,
      'has_personal_key', false,
      'action_type', p_action_type
    );
  END IF;

  -- 2. Check Pro status
  v_is_pro := public.is_pro_user(p_user_id);
  
  -- 3. Check for personal API key
  SELECT (gemini_api_key IS NOT NULL AND gemini_api_key != '') INTO v_has_personal_key
  FROM public.ai_user_settings WHERE user_id = p_user_id;
  v_has_personal_key := COALESCE(v_has_personal_key, false);
  
  -- 4. Calculate daily limit based on plan and API key
  IF v_is_pro THEN
    v_daily_limit := 5;
    IF v_has_personal_key THEN 
      v_daily_limit := v_daily_limit + 10; -- Pro + API key = 15
    END IF;
  ELSE
    v_daily_limit := 3; -- Free tier
  END IF;
  
  -- 5. Get or create daily usage record
  INSERT INTO public.daily_usage (user_id, usage_date, total_uses, daily_limit)
  VALUES (p_user_id, v_today, 0, v_daily_limit)
  ON CONFLICT (user_id, usage_date) 
  DO UPDATE SET daily_limit = v_daily_limit
  RETURNING total_uses INTO v_current_uses;
  
  v_remaining_daily := v_daily_limit - v_current_uses;
  
  -- 6. Get credit balances (ensure user_credits record exists)
  INSERT INTO public.user_credits (user_id, balance, pro_bonus_credits)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;
  
  SELECT balance, COALESCE(pro_bonus_credits, 0) INTO v_credit_balance, v_pro_credits
  FROM public.user_credits WHERE user_id = p_user_id;
  
  v_credit_balance := COALESCE(v_credit_balance, 0);
  v_pro_credits := COALESCE(v_pro_credits, 0);
  
  -- 7. PRIORITY 1: Try daily free credits first
  IF v_remaining_daily > 0 THEN
    -- Increment daily usage based on feature key
    IF p_feature_key = 'beebot' THEN
      UPDATE public.daily_usage 
      SET total_uses = total_uses + 1, beebot_uses = COALESCE(beebot_uses, 0) + 1, updated_at = NOW()
      WHERE user_id = p_user_id AND usage_date = v_today;
    ELSIF p_feature_key = 'ai_content' THEN
      UPDATE public.daily_usage 
      SET total_uses = total_uses + 1, ai_content_uses = COALESCE(ai_content_uses, 0) + 1, updated_at = NOW()
      WHERE user_id = p_user_id AND usage_date = v_today;
    ELSIF p_feature_key = 'flowstate' THEN
      UPDATE public.daily_usage 
      SET total_uses = total_uses + 1, flowstate_uses = COALESCE(flowstate_uses, 0) + 1, updated_at = NOW()
      WHERE user_id = p_user_id AND usage_date = v_today;
    ELSIF p_feature_key = 'easy_srt' THEN
      UPDATE public.daily_usage 
      SET total_uses = total_uses + 1, easy_srt_uses = COALESCE(easy_srt_uses, 0) + 1, updated_at = NOW()
      WHERE user_id = p_user_id AND usage_date = v_today;
    ELSIF p_feature_key = 'creator_rocket' THEN
      UPDATE public.daily_usage 
      SET total_uses = total_uses + 1, creator_rocket_uses = COALESCE(creator_rocket_uses, 0) + 1, updated_at = NOW()
      WHERE user_id = p_user_id AND usage_date = v_today;
    ELSIF p_feature_key = 'workspace' THEN
      UPDATE public.daily_usage 
      SET total_uses = total_uses + 1, workspace_uses = COALESCE(workspace_uses, 0) + 1, updated_at = NOW()
      WHERE user_id = p_user_id AND usage_date = v_today;
    ELSE
      UPDATE public.daily_usage 
      SET total_uses = total_uses + 1, updated_at = NOW()
      WHERE user_id = p_user_id AND usage_date = v_today;
    END IF;
    
    RETURN jsonb_build_object(
      'success', true,
      'usage_type', 'daily_free',
      'remaining_uses', v_remaining_daily - 1,
      'daily_limit', v_daily_limit,
      'credit_balance', v_credit_balance,
      'pro_credits', v_pro_credits,
      'is_pro', v_is_pro,
      'has_personal_key', v_has_personal_key,
      'resets_at', (v_today + INTERVAL '1 day')::TEXT,
      'action_type', p_action_type
    );
  END IF;
  
  -- 8. PRIORITY 2: Try Pro bonus credits
  IF v_pro_credits > 0 THEN
    UPDATE public.user_credits
    SET pro_bonus_credits = pro_bonus_credits - 1, updated_at = NOW()
    WHERE user_id = p_user_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'usage_type', 'pro_credit',
      'remaining_uses', 0,
      'daily_limit', v_daily_limit,
      'credit_balance', v_credit_balance,
      'pro_credits', v_pro_credits - 1,
      'is_pro', v_is_pro,
      'has_personal_key', v_has_personal_key,
      'resets_at', (v_today + INTERVAL '1 day')::TEXT,
      'action_type', p_action_type
    );
  END IF;
  
  -- 9. PRIORITY 3: Try general credit balance
  IF v_credit_balance > 0 THEN
    UPDATE public.user_credits
    SET balance = balance - 1, updated_at = NOW()
    WHERE user_id = p_user_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'usage_type', 'credit_balance',
      'remaining_uses', 0,
      'daily_limit', v_daily_limit,
      'credit_balance', v_credit_balance - 1,
      'pro_credits', v_pro_credits,
      'is_pro', v_is_pro,
      'has_personal_key', v_has_personal_key,
      'resets_at', (v_today + INTERVAL '1 day')::TEXT,
      'action_type', p_action_type
    );
  END IF;
  
  -- 10. All resources exhausted
  RETURN jsonb_build_object(
    'success', false,
    'error', 'INSUFFICIENT_RESOURCES',
    'usage_type', NULL,
    'remaining_uses', 0,
    'daily_limit', v_daily_limit,
    'credit_balance', 0,
    'pro_credits', 0,
    'is_pro', v_is_pro,
    'has_personal_key', v_has_personal_key,
    'resets_at', (v_today + INTERVAL '1 day')::TEXT,
    'action_type', p_action_type
  );
END;
$function$;