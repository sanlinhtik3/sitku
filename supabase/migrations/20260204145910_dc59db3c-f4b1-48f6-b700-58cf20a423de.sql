-- =====================================================
-- Pro+ Plan Support Migration  
-- Drop and recreate functions with pro_plus support
-- =====================================================

-- Drop all affected functions first
DROP FUNCTION IF EXISTS public.get_user_plan_status(uuid);
DROP FUNCTION IF EXISTS public.check_and_increment_usage(uuid, text, text);
DROP FUNCTION IF EXISTS public.approve_pro_subscription(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_create_pro_subscription(uuid, uuid, integer, text);
DROP FUNCTION IF EXISTS public.admin_create_pro_subscription(uuid, uuid, integer, text, text);

-- Recreate get_user_plan_status with pro_plus support
CREATE OR REPLACE FUNCTION public.get_user_plan_status(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
  v_is_pro boolean := false;
  v_plan_type text := 'free';
  v_expires_at timestamp with time zone;
  v_days_remaining integer;
  v_daily_limit integer := 3;
  v_uses_today integer := 0;
  v_remaining_uses integer;
  v_has_personal_key boolean := false;
  v_resets_at timestamp with time zone;
  v_is_admin boolean := false;
  v_pro_credits integer := 0;
  v_credit_balance integer := 0;
BEGIN
  -- Check if admin
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE user_id = p_user_id AND role = 'admin'
  ) INTO v_is_admin;

  -- Check for active pro subscription
  SELECT 
    true,
    plan_type,
    expires_at,
    EXTRACT(DAY FROM (expires_at - now()))::integer
  INTO 
    v_is_pro,
    v_plan_type,
    v_expires_at,
    v_days_remaining
  FROM pro_subscriptions
  WHERE user_id = p_user_id 
    AND status = 'active'
    AND expires_at > now()
  ORDER BY expires_at DESC
  LIMIT 1;

  IF v_is_pro IS NULL THEN
    v_is_pro := false;
    v_plan_type := 'free';
    v_days_remaining := NULL;
  END IF;

  -- Check for personal API key
  SELECT EXISTS (
    SELECT 1 FROM ai_user_settings 
    WHERE user_id = p_user_id 
      AND gemini_api_key IS NOT NULL 
      AND gemini_api_key != ''
  ) INTO v_has_personal_key;

  -- Get pro bonus credits
  SELECT COALESCE(pro_credits, 0) INTO v_pro_credits
  FROM pro_credits WHERE user_id = p_user_id;

  -- Get credit balance
  SELECT COALESCE(balance, 0) INTO v_credit_balance
  FROM credit_balances WHERE user_id = p_user_id;

  -- Calculate daily limit based on plan type
  IF v_is_admin THEN
    v_daily_limit := -1;
  ELSIF v_plan_type = 'pro_plus' THEN
    IF v_has_personal_key THEN
      v_daily_limit := -1; -- Unlimited for Pro+ with API key
    ELSE
      v_daily_limit := 10; -- Pro+ base
    END IF;
  ELSIF v_is_pro THEN
    v_daily_limit := 5;
    IF v_has_personal_key THEN
      v_daily_limit := v_daily_limit + 10;
    END IF;
  ELSE
    v_daily_limit := 3;
  END IF;

  -- Get today's usage
  SELECT COALESCE(uses_count, 0) INTO v_uses_today
  FROM daily_usage
  WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;

  -- Calculate remaining uses
  IF v_daily_limit = -1 THEN
    v_remaining_uses := -1;
  ELSE
    v_remaining_uses := GREATEST(0, v_daily_limit - v_uses_today);
  END IF;

  v_resets_at := (CURRENT_DATE + INTERVAL '1 day')::timestamp with time zone;

  v_result := json_build_object(
    'is_pro', v_is_pro OR v_plan_type = 'pro_plus',
    'plan_type', v_plan_type,
    'expires_at', v_expires_at,
    'days_remaining', v_days_remaining,
    'daily_limit', v_daily_limit,
    'uses_today', v_uses_today,
    'remaining_uses', v_remaining_uses,
    'has_personal_key', v_has_personal_key,
    'resets_at', v_resets_at,
    'pro_credits', v_pro_credits,
    'credit_balance', v_credit_balance
  );

  RETURN v_result;
END;
$$;

-- Recreate check_and_increment_usage with pro_plus support
CREATE OR REPLACE FUNCTION public.check_and_increment_usage(
  p_user_id uuid,
  p_feature_key text DEFAULT 'general',
  p_action_type text DEFAULT 'generation'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
  v_is_pro boolean := false;
  v_plan_type text := 'free';
  v_has_personal_key boolean := false;
  v_daily_limit integer := 3;
  v_uses_today integer := 0;
  v_remaining_uses integer;
  v_resets_at timestamp with time zone;
  v_pro_credits integer := 0;
  v_credit_balance integer := 0;
  v_usage_type text := 'daily_free';
BEGIN
  -- Check if admin
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE user_id = p_user_id AND role = 'admin'
  ) INTO v_is_admin;

  IF v_is_admin THEN
    RETURN json_build_object(
      'success', true,
      'remaining_uses', -1,
      'daily_limit', -1,
      'is_pro', true,
      'resets_at', NULL,
      'usage_type', 'admin_unlimited'
    );
  END IF;

  -- Check for active pro subscription
  SELECT true, plan_type
  INTO v_is_pro, v_plan_type
  FROM pro_subscriptions
  WHERE user_id = p_user_id 
    AND status = 'active'
    AND expires_at > now()
  ORDER BY expires_at DESC
  LIMIT 1;

  IF v_is_pro IS NULL THEN
    v_is_pro := false;
    v_plan_type := 'free';
  END IF;

  -- Check for personal API key
  SELECT EXISTS (
    SELECT 1 FROM ai_user_settings 
    WHERE user_id = p_user_id 
      AND gemini_api_key IS NOT NULL 
      AND gemini_api_key != ''
  ) INTO v_has_personal_key;

  -- Get pro bonus credits
  SELECT COALESCE(pro_credits, 0) INTO v_pro_credits
  FROM pro_credits WHERE user_id = p_user_id;

  -- Get credit balance
  SELECT COALESCE(balance, 0) INTO v_credit_balance
  FROM credit_balances WHERE user_id = p_user_id;

  -- Calculate daily limit
  IF v_plan_type = 'pro_plus' THEN
    IF v_has_personal_key THEN
      v_daily_limit := -1;
    ELSE
      v_daily_limit := 10;
    END IF;
  ELSIF v_is_pro THEN
    v_daily_limit := 5;
    IF v_has_personal_key THEN
      v_daily_limit := v_daily_limit + 10;
    END IF;
  ELSE
    v_daily_limit := 3;
  END IF;

  -- Get today's usage
  SELECT COALESCE(uses_count, 0) INTO v_uses_today
  FROM daily_usage
  WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;

  v_resets_at := (CURRENT_DATE + INTERVAL '1 day')::timestamp with time zone;

  -- Check if user has remaining uses
  IF v_daily_limit = -1 THEN
    v_remaining_uses := -1;
    v_usage_type := 'pro_credit';
    
    INSERT INTO daily_usage (user_id, usage_date, uses_count)
    VALUES (p_user_id, CURRENT_DATE, 1)
    ON CONFLICT (user_id, usage_date)
    DO UPDATE SET uses_count = daily_usage.uses_count + 1;
    
    RETURN json_build_object(
      'success', true,
      'remaining_uses', -1,
      'daily_limit', -1,
      'is_pro', true,
      'resets_at', v_resets_at,
      'usage_type', v_usage_type
    );
  ELSIF v_uses_today < v_daily_limit THEN
    v_usage_type := CASE WHEN v_is_pro OR v_plan_type = 'pro_plus' THEN 'pro_credit' ELSE 'daily_free' END;
    
    INSERT INTO daily_usage (user_id, usage_date, uses_count)
    VALUES (p_user_id, CURRENT_DATE, 1)
    ON CONFLICT (user_id, usage_date)
    DO UPDATE SET uses_count = daily_usage.uses_count + 1;

    v_remaining_uses := v_daily_limit - v_uses_today - 1;
    
    RETURN json_build_object(
      'success', true,
      'remaining_uses', v_remaining_uses,
      'daily_limit', v_daily_limit,
      'is_pro', v_is_pro OR v_plan_type = 'pro_plus',
      'resets_at', v_resets_at,
      'usage_type', v_usage_type
    );
  ELSIF v_pro_credits > 0 THEN
    UPDATE pro_credits SET pro_credits = pro_credits - 1 WHERE user_id = p_user_id;
    
    RETURN json_build_object(
      'success', true,
      'remaining_uses', v_pro_credits - 1,
      'daily_limit', v_daily_limit,
      'is_pro', v_is_pro OR v_plan_type = 'pro_plus',
      'resets_at', v_resets_at,
      'usage_type', 'pro_credit'
    );
  ELSIF v_credit_balance > 0 THEN
    UPDATE credit_balances SET balance = balance - 1 WHERE user_id = p_user_id;
    
    RETURN json_build_object(
      'success', true,
      'remaining_uses', v_credit_balance - 1,
      'daily_limit', v_daily_limit,
      'is_pro', v_is_pro OR v_plan_type = 'pro_plus',
      'resets_at', v_resets_at,
      'usage_type', 'credit_balance'
    );
  ELSE
    RETURN json_build_object(
      'success', false,
      'remaining_uses', 0,
      'daily_limit', v_daily_limit,
      'is_pro', v_is_pro OR v_plan_type = 'pro_plus',
      'resets_at', v_resets_at,
      'error', 'Daily limit reached. Resets at midnight.',
      'usage_type', NULL
    );
  END IF;
END;
$$;

-- Recreate approve_pro_subscription with pro_plus support
CREATE OR REPLACE FUNCTION public.approve_pro_subscription(
  p_subscription_id uuid,
  p_admin_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription record;
  v_user_id uuid;
  v_duration_days integer;
  v_plan_type text;
BEGIN
  SELECT * INTO v_subscription
  FROM pro_subscriptions
  WHERE id = p_subscription_id AND status = 'pending';
  
  IF v_subscription IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Subscription not found or not pending');
  END IF;

  v_user_id := v_subscription.user_id;
  v_duration_days := v_subscription.duration_days;
  v_plan_type := COALESCE(v_subscription.plan_type, 'pro');

  UPDATE pro_subscriptions
  SET 
    status = 'active',
    starts_at = now(),
    expires_at = now() + (v_duration_days || ' days')::interval,
    approved_at = now(),
    approved_by = p_admin_id
  WHERE id = p_subscription_id;

  INSERT INTO pro_credits (user_id, pro_credits)
  VALUES (v_user_id, 50)
  ON CONFLICT (user_id)
  DO UPDATE SET pro_credits = pro_credits.pro_credits + 50;

  INSERT INTO notifications (user_id, title, message, type)
  VALUES (
    v_user_id,
    CASE v_plan_type 
      WHEN 'pro_plus' THEN 'Pro+ Plan Activated! 🌟'
      ELSE 'Pro Plan Activated! 🎉'
    END,
    CASE v_plan_type
      WHEN 'pro_plus' THEN 'Your Pro+ Plan is now active for ' || v_duration_days || ' days. You received 50 bonus credits and get 10 daily credits (Unlimited with Personal API Key)!'
      ELSE 'Your Pro Plan is now active for ' || v_duration_days || ' days. You received 50 bonus credits!'
    END,
    'success'
  );

  RETURN json_build_object(
    'success', true, 
    'plan_type', v_plan_type,
    'expires_at', now() + (v_duration_days || ' days')::interval,
    'bonus_credits', 50
  );
END;
$$;

-- Create admin_create_pro_subscription with plan_type parameter
CREATE OR REPLACE FUNCTION public.admin_create_pro_subscription(
  p_admin_user_id uuid,
  p_target_user_id uuid,
  p_duration_days integer DEFAULT 30,
  p_notes text DEFAULT NULL,
  p_plan_type text DEFAULT 'pro'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_subscription_id uuid;
  v_validated_plan_type text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE user_id = p_admin_user_id AND role = 'admin'
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  v_validated_plan_type := CASE 
    WHEN p_plan_type IN ('pro', 'pro_plus') THEN p_plan_type 
    ELSE 'pro' 
  END;

  INSERT INTO pro_subscriptions (
    user_id, plan_type, status, amount_paid, duration_days,
    starts_at, expires_at, approved_at, approved_by, payment_notes
  )
  VALUES (
    p_target_user_id, v_validated_plan_type, 'active', 0, p_duration_days,
    now(), now() + (p_duration_days || ' days')::interval, now(), p_admin_user_id, p_notes
  )
  RETURNING id INTO v_subscription_id;

  INSERT INTO pro_credits (user_id, pro_credits)
  VALUES (p_target_user_id, 50)
  ON CONFLICT (user_id)
  DO UPDATE SET pro_credits = pro_credits.pro_credits + 50;

  INSERT INTO notifications (user_id, title, message, type)
  VALUES (
    p_target_user_id,
    CASE v_validated_plan_type 
      WHEN 'pro_plus' THEN 'Pro+ Plan Granted! 🌟'
      ELSE 'Pro Plan Granted! 🎉'
    END,
    CASE v_validated_plan_type
      WHEN 'pro_plus' THEN 'You have been granted Pro+ Plan for ' || p_duration_days || ' days with 50 bonus credits and Unlimited access with Personal API Key!'
      ELSE 'You have been granted Pro Plan for ' || p_duration_days || ' days with 50 bonus credits!'
    END,
    'success'
  );

  RETURN json_build_object('success', true, 'subscription_id', v_subscription_id, 'plan_type', v_validated_plan_type);
END;
$$;