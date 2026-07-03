-- Fix get_user_plan_status to use correct table name (pro_subscriptions)
-- Remove credits_remaining reference since column doesn't exist

CREATE OR REPLACE FUNCTION get_user_plan_status(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
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
  -- Check admin role
  SELECT public.has_role(p_user_id, 'admin'::public.app_role) INTO v_is_admin;

  -- Check personal API key
  SELECT EXISTS (
    SELECT 1 FROM ai_user_settings 
    WHERE user_id = p_user_id 
    AND gemini_api_key IS NOT NULL 
    AND gemini_api_key != ''
  ) INTO v_has_personal_key;

  -- Check credit balance
  SELECT COALESCE(balance, 0) INTO v_credit_balance
  FROM user_credits
  WHERE user_id = p_user_id;

  -- ✅ FIX: Use pro_subscriptions (NOT user_pro_subscriptions)
  -- ✅ FIX: Don't select credits_remaining (doesn't exist)
  SELECT expires_at
  INTO v_expires_at
  FROM pro_subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND expires_at > now()
  ORDER BY expires_at DESC
  LIMIT 1;

  IF v_expires_at IS NOT NULL THEN
    v_is_pro := true;
    v_plan_type := 'pro';
    v_days_remaining := EXTRACT(DAY FROM (v_expires_at - now()))::integer;
  END IF;

  -- Admin: unlimited access
  IF v_is_admin THEN
    v_plan_type := 'admin';
    v_daily_limit := 9999;
    v_remaining_uses := 9999;
    v_resets_at := now() + interval '1 day';
  ELSIF v_is_pro THEN
    v_daily_limit := 5;
    v_remaining_uses := 5;
    v_resets_at := v_expires_at;
  ELSIF v_has_personal_key THEN
    v_plan_type := 'personal_key';
    v_daily_limit := 9999;
    v_remaining_uses := 9999;
    v_resets_at := now() + interval '1 day';
  ELSIF v_credit_balance > 0 THEN
    v_plan_type := 'credits';
    v_daily_limit := v_credit_balance;
    v_remaining_uses := v_credit_balance;
    v_resets_at := null;
  ELSE
    SELECT COUNT(*) INTO v_uses_today
    FROM agent_chat_messages
    WHERE user_id = p_user_id
      AND role = 'user'
      AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Yangon');

    v_remaining_uses := GREATEST(v_daily_limit - v_uses_today, 0);
    v_resets_at := (date_trunc('day', now() AT TIME ZONE 'Asia/Yangon') + interval '1 day');
  END IF;

  v_result := json_build_object(
    'plan_type', v_plan_type,
    'is_pro', v_is_pro,
    'is_admin', v_is_admin,
    'has_personal_key', v_has_personal_key,
    'daily_limit', v_daily_limit,
    'uses_today', v_uses_today,
    'remaining_uses', v_remaining_uses,
    'expires_at', v_expires_at,
    'days_remaining', v_days_remaining,
    'pro_credits', v_pro_credits,
    'credit_balance', v_credit_balance,
    'resets_at', v_resets_at
  );

  RETURN v_result;
END;
$$;