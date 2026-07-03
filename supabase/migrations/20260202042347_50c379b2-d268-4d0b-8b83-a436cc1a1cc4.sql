-- 1. Add suspension columns to pro_subscriptions
ALTER TABLE public.pro_subscriptions 
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

-- 2. Update initialize_user_credits to give 10 credits instead of 5
CREATE OR REPLACE FUNCTION public.initialize_user_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, balance, trial_credits_used)
  VALUES (NEW.id, 10, true);
  
  INSERT INTO public.credit_transactions (user_id, credits, transaction_type, balance_after, description)
  VALUES (NEW.id, 10, 'trial', 10, 'Welcome bonus - 10 free credits');
  
  RETURN NEW;
END;
$$;

-- 3. Create or replace check_and_increment_usage with admin bypass
CREATE OR REPLACE FUNCTION public.check_and_increment_usage(
  p_user_id UUID,
  p_feature_key TEXT DEFAULT 'general'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_pro BOOLEAN;
  v_has_personal_key BOOLEAN;
  v_daily_limit INTEGER;
  v_current_uses INTEGER;
  v_usage_date DATE := CURRENT_DATE;
  v_remaining INTEGER;
BEGIN
  -- Admin bypass - unlimited access
  IF public.has_role(p_user_id, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_admin', true,
      'remaining_uses', 999999,
      'daily_limit', -1,
      'is_pro', true,
      'has_personal_key', true,
      'message', 'Admin has unlimited access'
    );
  END IF;

  -- Check if user is Pro
  v_is_pro := public.is_pro_user(p_user_id);
  
  -- Check if user has personal API key
  SELECT (gemini_api_key IS NOT NULL AND gemini_api_key != '') INTO v_has_personal_key
  FROM public.ai_user_settings
  WHERE user_id = p_user_id;
  
  v_has_personal_key := COALESCE(v_has_personal_key, false);
  
  -- Calculate daily limit
  IF v_is_pro THEN
    v_daily_limit := 5; -- Base Pro uses
    IF v_has_personal_key THEN
      v_daily_limit := v_daily_limit + 10; -- +10 for personal key
    END IF;
  ELSE
    v_daily_limit := 3; -- Free tier
  END IF;
  
  -- Get or create daily usage record
  INSERT INTO public.daily_usage (user_id, usage_date, total_uses, daily_limit)
  VALUES (p_user_id, v_usage_date, 0, v_daily_limit)
  ON CONFLICT (user_id, usage_date) 
  DO UPDATE SET daily_limit = v_daily_limit
  RETURNING total_uses INTO v_current_uses;
  
  v_remaining := v_daily_limit - v_current_uses;
  
  -- Check if user has remaining uses
  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'daily_limit_reached',
      'remaining_uses', 0,
      'daily_limit', v_daily_limit,
      'is_pro', v_is_pro,
      'has_personal_key', v_has_personal_key,
      'message', 'Daily limit reached. Reset at midnight.'
    );
  END IF;
  
  -- Increment usage
  UPDATE public.daily_usage
  SET total_uses = total_uses + 1,
      updated_at = NOW()
  WHERE user_id = p_user_id AND usage_date = v_usage_date;
  
  RETURN jsonb_build_object(
    'success', true,
    'remaining_uses', v_remaining - 1,
    'daily_limit', v_daily_limit,
    'is_pro', v_is_pro,
    'has_personal_key', v_has_personal_key
  );
END;
$$;

-- 4. Update approve_pro_subscription to add 50 credits
CREATE OR REPLACE FUNCTION public.approve_pro_subscription(
  p_subscription_id UUID,
  p_admin_user_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sub RECORD;
  v_new_balance INTEGER;
BEGIN
  -- Check if caller is admin
  IF NOT public.has_role(p_admin_user_id, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  
  -- Get subscription
  SELECT * INTO v_sub FROM public.pro_subscriptions WHERE id = p_subscription_id;
  
  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_not_found');
  END IF;
  
  IF v_sub.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_not_pending');
  END IF;
  
  -- Approve subscription
  UPDATE public.pro_subscriptions
  SET status = 'active',
      approved_at = NOW(),
      starts_at = NOW(),
      expires_at = NOW() + (v_sub.duration_days || ' days')::INTERVAL
  WHERE id = p_subscription_id;
  
  -- Add 50 credits to user
  UPDATE public.user_credits
  SET balance = balance + 50,
      total_earned = total_earned + 50,
      updated_at = NOW()
  WHERE user_id = v_sub.user_id
  RETURNING balance INTO v_new_balance;
  
  -- If user_credits row doesn't exist, create it
  IF NOT FOUND THEN
    INSERT INTO public.user_credits (user_id, balance, total_earned)
    VALUES (v_sub.user_id, 50, 50)
    RETURNING balance INTO v_new_balance;
  END IF;
  
  -- Log credit transaction
  INSERT INTO public.credit_transactions (user_id, credits, transaction_type, reference_id, reference_type, balance_after, description)
  VALUES (v_sub.user_id, 50, 'pro_bonus', p_subscription_id, 'pro_subscription', v_new_balance, 'Pro Plan bonus - 50 credits');
  
  -- Send notification
  INSERT INTO public.notifications (user_id, type, title, message, related_id)
  VALUES (
    v_sub.user_id,
    'pro_subscription_approved',
    'Pro Plan Activated! 🎉',
    'Your Pro Plan is now active for ' || v_sub.duration_days || ' days. You also received 50 bonus credits!',
    p_subscription_id
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'expires_at', NOW() + (v_sub.duration_days || ' days')::INTERVAL,
    'credits_added', 50
  );
END;
$$;

-- 5. Create suspend_pro_subscription function
CREATE OR REPLACE FUNCTION public.suspend_pro_subscription(
  p_subscription_id UUID,
  p_admin_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sub RECORD;
BEGIN
  -- Check if caller is admin
  IF NOT public.has_role(p_admin_user_id, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  
  -- Get subscription
  SELECT * INTO v_sub FROM public.pro_subscriptions WHERE id = p_subscription_id;
  
  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_not_found');
  END IF;
  
  -- Suspend subscription
  UPDATE public.pro_subscriptions
  SET status = 'suspended',
      suspended_at = NOW(),
      suspended_by = p_admin_user_id,
      suspension_reason = p_reason
  WHERE id = p_subscription_id;
  
  -- Send notification
  INSERT INTO public.notifications (user_id, type, title, message, related_id)
  VALUES (
    v_sub.user_id,
    'pro_subscription_suspended',
    'Pro Plan Suspended',
    COALESCE('Your Pro Plan has been suspended. Reason: ' || p_reason, 'Your Pro Plan has been suspended.'),
    p_subscription_id
  );
  
  RETURN jsonb_build_object('success', true, 'subscription_id', p_subscription_id);
END;
$$;

-- 6. Create unsuspend_pro_subscription function
CREATE OR REPLACE FUNCTION public.unsuspend_pro_subscription(
  p_subscription_id UUID,
  p_admin_user_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sub RECORD;
BEGIN
  -- Check if caller is admin
  IF NOT public.has_role(p_admin_user_id, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  
  -- Get subscription
  SELECT * INTO v_sub FROM public.pro_subscriptions WHERE id = p_subscription_id;
  
  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_not_found');
  END IF;
  
  IF v_sub.status != 'suspended' THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_not_suspended');
  END IF;
  
  -- Unsuspend subscription (restore to active if not expired)
  UPDATE public.pro_subscriptions
  SET status = CASE WHEN expires_at > NOW() THEN 'active' ELSE 'expired' END,
      suspended_at = NULL,
      suspended_by = NULL,
      suspension_reason = NULL
  WHERE id = p_subscription_id;
  
  -- Send notification
  INSERT INTO public.notifications (user_id, type, title, message, related_id)
  VALUES (
    v_sub.user_id,
    'pro_subscription_restored',
    'Pro Plan Restored! 🎉',
    'Your Pro Plan has been restored.',
    p_subscription_id
  );
  
  RETURN jsonb_build_object('success', true, 'subscription_id', p_subscription_id);
END;
$$;

-- 7. Create admin_create_pro_subscription function for inviting users
CREATE OR REPLACE FUNCTION public.admin_create_pro_subscription(
  p_admin_user_id UUID,
  p_target_user_id UUID,
  p_duration_days INTEGER DEFAULT 30,
  p_notes TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_subscription_id UUID;
  v_new_balance INTEGER;
BEGIN
  -- Check if caller is admin
  IF NOT public.has_role(p_admin_user_id, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  
  -- Check if target user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;
  
  -- Check if user already has active subscription
  IF EXISTS (
    SELECT 1 FROM public.pro_subscriptions 
    WHERE user_id = p_target_user_id AND status = 'active' AND expires_at > NOW()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_already_pro');
  END IF;
  
  -- Create subscription directly as active
  INSERT INTO public.pro_subscriptions (
    user_id, plan_type, amount_paid, duration_days, status, 
    approved_at, starts_at, expires_at, payment_notes
  ) VALUES (
    p_target_user_id, 'pro', 0, p_duration_days, 'active',
    NOW(), NOW(), NOW() + (p_duration_days || ' days')::INTERVAL,
    COALESCE(p_notes, 'Granted by admin')
  ) RETURNING id INTO v_subscription_id;
  
  -- Add 50 credits to user
  UPDATE public.user_credits
  SET balance = balance + 50,
      total_earned = total_earned + 50,
      updated_at = NOW()
  WHERE user_id = p_target_user_id
  RETURNING balance INTO v_new_balance;
  
  IF NOT FOUND THEN
    INSERT INTO public.user_credits (user_id, balance, total_earned)
    VALUES (p_target_user_id, 50, 50)
    RETURNING balance INTO v_new_balance;
  END IF;
  
  -- Log credit transaction
  INSERT INTO public.credit_transactions (user_id, credits, transaction_type, reference_id, reference_type, balance_after, description)
  VALUES (p_target_user_id, 50, 'pro_bonus', v_subscription_id, 'pro_subscription', v_new_balance, 'Pro Plan bonus - 50 credits (Admin granted)');
  
  -- Send notification
  INSERT INTO public.notifications (user_id, type, title, message, related_id)
  VALUES (
    p_target_user_id,
    'pro_subscription_granted',
    'Pro Plan Activated! 🎉',
    'You have been granted Pro Plan access for ' || p_duration_days || ' days with 50 bonus credits!',
    v_subscription_id
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_subscription_id,
    'credits_added', 50
  );
END;
$$;

-- 8. Create reset_user_to_free function
CREATE OR REPLACE FUNCTION public.reset_user_to_free(
  p_admin_user_id UUID,
  p_target_user_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT public.has_role(p_admin_user_id, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  
  -- Cancel all active subscriptions
  UPDATE public.pro_subscriptions
  SET status = 'cancelled',
      suspended_at = NOW(),
      suspended_by = p_admin_user_id,
      suspension_reason = 'Reset to free tier by admin'
  WHERE user_id = p_target_user_id AND status IN ('active', 'pending');
  
  -- Reset daily usage
  DELETE FROM public.daily_usage WHERE user_id = p_target_user_id;
  
  -- Send notification
  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (
    p_target_user_id,
    'plan_reset',
    'Plan Reset',
    'Your plan has been reset to Free tier.'
  );
  
  RETURN jsonb_build_object('success', true, 'user_id', p_target_user_id);
END;
$$;