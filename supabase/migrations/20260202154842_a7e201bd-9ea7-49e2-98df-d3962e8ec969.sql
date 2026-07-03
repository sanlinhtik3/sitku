-- Drop existing functions first to allow parameter name changes
DROP FUNCTION IF EXISTS public.approve_pro_subscription(UUID, UUID);
DROP FUNCTION IF EXISTS public.admin_create_pro_subscription(TEXT, UUID, INTEGER);

-- Step 1: Fix credit_transactions constraint to allow 'pro_bonus' and 'referral'
ALTER TABLE public.credit_transactions
DROP CONSTRAINT IF EXISTS point_transactions_transaction_type_check;

ALTER TABLE public.credit_transactions
ADD CONSTRAINT point_transactions_transaction_type_check 
CHECK (transaction_type IN (
  'trial', 'purchase', 'usage', 'refund', 
  'admin_adjustment', 'testing', 'pro_bonus', 'referral'
));

-- Step 2: Add pro_bonus_credits column to user_credits table
ALTER TABLE public.user_credits 
ADD COLUMN IF NOT EXISTS pro_bonus_credits INTEGER DEFAULT 0;

-- Step 3: Create approve_pro_subscription function
CREATE FUNCTION public.approve_pro_subscription(
  p_subscription_id UUID,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_subscription RECORD;
  v_new_balance INTEGER;
  v_new_pro_credits INTEGER;
BEGIN
  -- Get subscription details
  SELECT * INTO v_subscription 
  FROM public.pro_subscriptions 
  WHERE id = p_subscription_id AND status = 'pending';
  
  IF v_subscription IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription not found or not pending');
  END IF;
  
  -- Update subscription status
  UPDATE public.pro_subscriptions
  SET status = 'active',
      approved_at = NOW(),
      approved_by = p_admin_id,
      expires_at = NOW() + INTERVAL '30 days'
  WHERE id = p_subscription_id;
  
  -- Add 50 Pro Bonus Credits to pro_bonus_credits (separate tracking)
  UPDATE public.user_credits
  SET pro_bonus_credits = COALESCE(pro_bonus_credits, 0) + 50,
      balance = balance + 50,
      total_earned = total_earned + 50,
      updated_at = NOW()
  WHERE user_id = v_subscription.user_id
  RETURNING balance, pro_bonus_credits INTO v_new_balance, v_new_pro_credits;
  
  -- Log the transaction
  INSERT INTO public.credit_transactions (
    user_id, credits, transaction_type, reference_id, 
    reference_type, balance_after, description
  )
  VALUES (
    v_subscription.user_id, 50, 'pro_bonus', p_subscription_id, 
    'pro_subscription', v_new_balance, 'Pro Plan bonus credits'
  );
  
  -- Send notification
  INSERT INTO public.notifications (user_id, type, title, message, related_id)
  VALUES (
    v_subscription.user_id,
    'pro_subscription_approved',
    'Pro Plan Activated! 🎉',
    'Your Pro Plan is now active for 30 days! You received 50 bonus credits.',
    p_subscription_id
  );
  
  RETURN jsonb_build_object(
    'success', true, 
    'new_balance', v_new_balance,
    'pro_credits', v_new_pro_credits
  );
END;
$$;

-- Step 4: Create admin_create_pro_subscription function
CREATE FUNCTION public.admin_create_pro_subscription(
  p_user_email TEXT,
  p_admin_id UUID,
  p_duration_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_subscription_id UUID;
  v_new_balance INTEGER;
  v_new_pro_credits INTEGER;
BEGIN
  -- Get user ID from email via profiles
  SELECT user_id INTO v_user_id
  FROM public.profiles
  WHERE LOWER(email) = LOWER(p_user_email);
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found with this email');
  END IF;
  
  -- Check for existing active subscription
  IF EXISTS(
    SELECT 1 FROM public.pro_subscriptions 
    WHERE user_id = v_user_id AND status = 'active' AND expires_at > NOW()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User already has an active Pro subscription');
  END IF;
  
  -- Create active subscription directly
  INSERT INTO public.pro_subscriptions (
    user_id, status, approved_at, approved_by, expires_at, payment_method
  )
  VALUES (
    v_user_id, 'active', NOW(), p_admin_id, 
    NOW() + (p_duration_days || ' days')::INTERVAL, 'admin_invite'
  )
  RETURNING id INTO v_subscription_id;
  
  -- Add 50 Pro Bonus Credits
  UPDATE public.user_credits
  SET pro_bonus_credits = COALESCE(pro_bonus_credits, 0) + 50,
      balance = balance + 50,
      total_earned = total_earned + 50,
      updated_at = NOW()
  WHERE user_id = v_user_id
  RETURNING balance, pro_bonus_credits INTO v_new_balance, v_new_pro_credits;
  
  -- Log the transaction
  INSERT INTO public.credit_transactions (
    user_id, credits, transaction_type, reference_id, 
    reference_type, balance_after, description
  )
  VALUES (
    v_user_id, 50, 'pro_bonus', v_subscription_id, 
    'pro_subscription', v_new_balance, 'Pro Plan bonus credits (Admin invite)'
  );
  
  -- Send notification
  INSERT INTO public.notifications (user_id, type, title, message, related_id)
  VALUES (
    v_user_id,
    'pro_subscription_approved',
    'Pro Plan Activated! 🎉',
    'You have been invited to Pro Plan for ' || p_duration_days || ' days! You received 50 bonus credits.',
    v_subscription_id
  );
  
  RETURN jsonb_build_object(
    'success', true, 
    'subscription_id', v_subscription_id,
    'user_id', v_user_id,
    'new_balance', v_new_balance,
    'pro_credits', v_new_pro_credits
  );
END;
$$;

-- Step 5: Create comprehensive status function
CREATE OR REPLACE FUNCTION public.get_user_comprehensive_status(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_pro BOOLEAN := false;
  v_plan_type TEXT := 'free';
  v_expires_at TIMESTAMPTZ;
  v_days_remaining INTEGER;
  v_daily_limit INTEGER := 3;
  v_uses_today INTEGER := 0;
  v_remaining_uses INTEGER;
  v_credit_balance INTEGER := 0;
  v_pro_credits INTEGER := 0;
  v_total_credits INTEGER := 0;
  v_has_personal_key BOOLEAN := false;
  v_resets_at TEXT;
  v_is_admin BOOLEAN := false;
BEGIN
  -- Check if user is admin
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles 
    WHERE user_id = p_user_id AND role = 'admin'
  ) INTO v_is_admin;
  
  -- Check Pro subscription status
  SELECT 
    true,
    'pro',
    expires_at,
    GREATEST(0, EXTRACT(DAY FROM (expires_at - NOW()))::INTEGER)
  INTO v_is_pro, v_plan_type, v_expires_at, v_days_remaining
  FROM public.pro_subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND expires_at > NOW()
    AND (suspended_at IS NULL)
  ORDER BY expires_at DESC
  LIMIT 1;
  
  -- Set defaults if not pro
  IF v_is_pro IS NULL THEN
    v_is_pro := false;
    v_plan_type := 'free';
    v_days_remaining := NULL;
  END IF;
  
  -- Check for personal API key
  SELECT EXISTS(
    SELECT 1 FROM public.ai_user_settings
    WHERE user_id = p_user_id AND gemini_api_key IS NOT NULL
  ) INTO v_has_personal_key;
  
  -- Calculate daily limit
  IF v_is_admin THEN
    v_daily_limit := -1; -- Unlimited for admins
  ELSIF v_is_pro THEN
    v_daily_limit := CASE WHEN v_has_personal_key THEN 15 ELSE 5 END;
  ELSE
    v_daily_limit := 3;
  END IF;
  
  -- Get today's usage
  SELECT COALESCE(total_uses, 0), COALESCE(daily_limit, v_daily_limit)
  INTO v_uses_today, v_daily_limit
  FROM public.daily_usage
  WHERE user_id = p_user_id 
    AND usage_date = CURRENT_DATE;
  
  IF v_uses_today IS NULL THEN
    v_uses_today := 0;
  END IF;
  
  -- Calculate remaining uses
  IF v_daily_limit = -1 THEN
    v_remaining_uses := -1; -- Unlimited
  ELSE
    v_remaining_uses := GREATEST(0, v_daily_limit - v_uses_today);
  END IF;
  
  -- Get credit balances
  SELECT 
    COALESCE(balance, 0),
    COALESCE(pro_bonus_credits, 0)
  INTO v_credit_balance, v_pro_credits
  FROM public.user_credits
  WHERE user_id = p_user_id;
  
  IF v_credit_balance IS NULL THEN
    v_credit_balance := 0;
    v_pro_credits := 0;
  END IF;
  
  v_total_credits := v_credit_balance;
  
  -- Calculate reset time (midnight Myanmar time)
  v_resets_at := TO_CHAR((CURRENT_DATE + INTERVAL '1 day') AT TIME ZONE 'Asia/Yangon', 'YYYY-MM-DD HH24:MI:SS');
  
  RETURN jsonb_build_object(
    'is_pro', v_is_pro,
    'is_admin', v_is_admin,
    'plan_type', v_plan_type,
    'expires_at', v_expires_at,
    'days_remaining', v_days_remaining,
    'daily_limit', v_daily_limit,
    'uses_today', v_uses_today,
    'remaining_uses', v_remaining_uses,
    'credit_balance', v_credit_balance,
    'pro_credits', v_pro_credits,
    'total_credits', v_total_credits,
    'has_personal_key', v_has_personal_key,
    'resets_at', v_resets_at
  );
END;
$$;