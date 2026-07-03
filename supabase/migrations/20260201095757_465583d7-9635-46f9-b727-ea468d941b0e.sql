-- ═══════════════════════════════════════════════════════════════
-- PRO PLAN SYSTEM - DATABASE SCHEMA
-- ═══════════════════════════════════════════════════════════════

-- ═══ Table: pro_subscriptions ═══
-- Tracks Pro Plan subscriptions with 30-day duration
CREATE TABLE public.pro_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL DEFAULT 'pro',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, active, expired, cancelled
  
  -- Duration
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  duration_days INTEGER DEFAULT 30,
  
  -- Payment
  amount_paid NUMERIC(10,2) NOT NULL,
  payment_method_id UUID REFERENCES public.payment_methods(id),
  payment_receipt_url TEXT,
  payment_notes TEXT,
  
  -- Admin actions
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for active subscription lookup
CREATE INDEX idx_pro_subscriptions_user_status ON public.pro_subscriptions(user_id, status);
CREATE INDEX idx_pro_subscriptions_expires ON public.pro_subscriptions(expires_at) WHERE status = 'active';

-- ═══ Table: daily_usage ═══
-- Tracks daily usage counts per user (resets each day)
CREATE TABLE public.daily_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Usage counts per feature
  total_uses INTEGER DEFAULT 0,
  beebot_uses INTEGER DEFAULT 0,
  ai_content_uses INTEGER DEFAULT 0,
  flowstate_uses INTEGER DEFAULT 0,
  easy_srt_uses INTEGER DEFAULT 0,
  creator_rocket_uses INTEGER DEFAULT 0,
  workspace_uses INTEGER DEFAULT 0,
  
  -- Limits
  daily_limit INTEGER DEFAULT 3,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id, usage_date)
);

-- Index for today's usage lookup
CREATE INDEX idx_daily_usage_user_date ON public.daily_usage(user_id, usage_date);

-- ═══ Table: usage_logs ═══
-- Detailed usage history for analytics
CREATE TABLE public.usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  action_type TEXT NOT NULL,
  api_source TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for user usage history
CREATE INDEX idx_usage_logs_user ON public.usage_logs(user_id, created_at DESC);
CREATE INDEX idx_usage_logs_feature ON public.usage_logs(feature_key, created_at DESC);

-- ═══ Enable RLS ═══
ALTER TABLE public.pro_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

-- ═══ RLS Policies: pro_subscriptions ═══
CREATE POLICY "Users can view own subscriptions"
ON public.pro_subscriptions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own subscriptions"
ON public.pro_subscriptions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all subscriptions"
ON public.pro_subscriptions FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update subscriptions"
ON public.pro_subscriptions FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ═══ RLS Policies: daily_usage ═══
CREATE POLICY "Users can view own usage"
ON public.daily_usage FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all usage"
ON public.daily_usage FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ═══ RLS Policies: usage_logs ═══
CREATE POLICY "Users can view own logs"
ON public.usage_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all logs"
ON public.usage_logs FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ═══ Function: Check if user has active Pro subscription ═══
CREATE OR REPLACE FUNCTION public.is_pro_user(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pro_subscriptions
    WHERE user_id = p_user_id
    AND status = 'active'
    AND expires_at > NOW()
  );
$$;

-- ═══ Function: Check & Increment Daily Usage ═══
CREATE OR REPLACE FUNCTION public.check_and_increment_usage(
  p_user_id UUID,
  p_feature_key TEXT,
  p_action_type TEXT DEFAULT 'generation'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_pro BOOLEAN;
  v_daily_limit INTEGER;
  v_current_uses INTEGER;
  v_has_personal_key BOOLEAN;
  v_feature_column TEXT;
BEGIN
  -- Check Pro status
  v_is_pro := public.is_pro_user(p_user_id);
  
  -- Check personal API key
  SELECT gemini_api_key IS NOT NULL INTO v_has_personal_key
  FROM public.ai_user_settings WHERE user_id = p_user_id;
  
  -- Calculate daily limit: Free=3, Pro=5, Pro+PersonalKey=15
  IF v_is_pro THEN
    v_daily_limit := CASE WHEN v_has_personal_key THEN 15 ELSE 5 END;
  ELSE
    v_daily_limit := 3;
  END IF;
  
  -- Get or create today's usage record
  INSERT INTO public.daily_usage (user_id, usage_date, daily_limit)
  VALUES (p_user_id, CURRENT_DATE, v_daily_limit)
  ON CONFLICT (user_id, usage_date) 
  DO UPDATE SET daily_limit = v_daily_limit, updated_at = NOW();
  
  -- Get current usage
  SELECT total_uses INTO v_current_uses
  FROM public.daily_usage 
  WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;
  
  -- Check limit
  IF v_current_uses >= v_daily_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'daily_limit_reached',
      'current_uses', v_current_uses,
      'daily_limit', v_daily_limit,
      'is_pro', v_is_pro,
      'has_personal_key', v_has_personal_key,
      'resets_at', (CURRENT_DATE + INTERVAL '1 day')::TEXT
    );
  END IF;
  
  -- Determine feature column to update
  v_feature_column := CASE p_feature_key
    WHEN 'beebot' THEN 'beebot_uses'
    WHEN 'ai_content' THEN 'ai_content_uses'
    WHEN 'flowstate' THEN 'flowstate_uses'
    WHEN 'easy_srt' THEN 'easy_srt_uses'
    WHEN 'creator_rocket' THEN 'creator_rocket_uses'
    WHEN 'workspace' THEN 'workspace_uses'
    ELSE NULL
  END;
  
  -- Increment total usage and feature-specific usage
  IF v_feature_column = 'beebot_uses' THEN
    UPDATE public.daily_usage SET total_uses = total_uses + 1, beebot_uses = beebot_uses + 1, updated_at = NOW()
    WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;
  ELSIF v_feature_column = 'ai_content_uses' THEN
    UPDATE public.daily_usage SET total_uses = total_uses + 1, ai_content_uses = ai_content_uses + 1, updated_at = NOW()
    WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;
  ELSIF v_feature_column = 'flowstate_uses' THEN
    UPDATE public.daily_usage SET total_uses = total_uses + 1, flowstate_uses = flowstate_uses + 1, updated_at = NOW()
    WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;
  ELSIF v_feature_column = 'easy_srt_uses' THEN
    UPDATE public.daily_usage SET total_uses = total_uses + 1, easy_srt_uses = easy_srt_uses + 1, updated_at = NOW()
    WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;
  ELSIF v_feature_column = 'creator_rocket_uses' THEN
    UPDATE public.daily_usage SET total_uses = total_uses + 1, creator_rocket_uses = creator_rocket_uses + 1, updated_at = NOW()
    WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;
  ELSIF v_feature_column = 'workspace_uses' THEN
    UPDATE public.daily_usage SET total_uses = total_uses + 1, workspace_uses = workspace_uses + 1, updated_at = NOW()
    WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;
  ELSE
    UPDATE public.daily_usage SET total_uses = total_uses + 1, updated_at = NOW()
    WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;
  END IF;
  
  -- Log usage
  INSERT INTO public.usage_logs (user_id, feature_key, action_type, api_source)
  VALUES (p_user_id, p_feature_key, p_action_type, 
    CASE WHEN v_has_personal_key THEN 'personal_key' ELSE 'system' END);
  
  RETURN jsonb_build_object(
    'success', true,
    'remaining_uses', v_daily_limit - v_current_uses - 1,
    'daily_limit', v_daily_limit,
    'is_pro', v_is_pro,
    'has_personal_key', v_has_personal_key
  );
END;
$$;

-- ═══ Function: Get User Plan Status ═══
CREATE OR REPLACE FUNCTION public.get_user_plan_status(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription RECORD;
  v_usage RECORD;
  v_has_personal_key BOOLEAN;
  v_daily_limit INTEGER;
BEGIN
  -- Get active subscription
  SELECT * INTO v_subscription
  FROM public.pro_subscriptions
  WHERE user_id = p_user_id 
  AND status = 'active' 
  AND expires_at > NOW()
  ORDER BY expires_at DESC
  LIMIT 1;
  
  -- Check personal API key
  SELECT gemini_api_key IS NOT NULL INTO v_has_personal_key
  FROM public.ai_user_settings WHERE user_id = p_user_id;
  
  -- Calculate daily limit
  IF v_subscription IS NOT NULL THEN
    v_daily_limit := CASE WHEN v_has_personal_key THEN 15 ELSE 5 END;
  ELSE
    v_daily_limit := 3;
  END IF;
  
  -- Get today's usage
  SELECT * INTO v_usage
  FROM public.daily_usage
  WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;
  
  RETURN jsonb_build_object(
    'is_pro', v_subscription IS NOT NULL,
    'plan_type', CASE WHEN v_subscription IS NOT NULL THEN 'pro' ELSE 'free' END,
    'expires_at', v_subscription.expires_at,
    'days_remaining', CASE 
      WHEN v_subscription IS NOT NULL 
      THEN GREATEST(0, EXTRACT(DAY FROM v_subscription.expires_at - NOW())::INTEGER)
      ELSE NULL END,
    'daily_limit', v_daily_limit,
    'uses_today', COALESCE(v_usage.total_uses, 0),
    'remaining_uses', v_daily_limit - COALESCE(v_usage.total_uses, 0),
    'has_personal_key', COALESCE(v_has_personal_key, false),
    'resets_at', (CURRENT_DATE + INTERVAL '1 day')::TEXT
  );
END;
$$;

-- ═══ Function: Approve Pro Subscription ═══
CREATE OR REPLACE FUNCTION public.approve_pro_subscription(
  p_subscription_id UUID,
  p_admin_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
BEGIN
  -- Check admin role
  IF NOT public.has_role(p_admin_user_id, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  SELECT * INTO v_sub FROM public.pro_subscriptions WHERE id = p_subscription_id;
  
  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription not found');
  END IF;
  
  IF v_sub.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription is not pending');
  END IF;
  
  UPDATE public.pro_subscriptions
  SET status = 'active',
      starts_at = NOW(),
      expires_at = NOW() + (duration_days || ' days')::INTERVAL,
      approved_at = NOW(),
      approved_by = p_admin_user_id,
      updated_at = NOW()
  WHERE id = p_subscription_id;
  
  -- Create notification
  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (
    v_sub.user_id,
    'pro_subscription_approved',
    'Pro Plan Activated! 🎉',
    'Your Pro Plan is now active for 30 days. Enjoy premium features!'
  );
  
  RETURN jsonb_build_object('success', true, 'subscription_id', p_subscription_id);
END;
$$;

-- ═══ Function: Reject Pro Subscription ═══
CREATE OR REPLACE FUNCTION public.reject_pro_subscription(
  p_subscription_id UUID,
  p_admin_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
BEGIN
  -- Check admin role
  IF NOT public.has_role(p_admin_user_id, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  SELECT * INTO v_sub FROM public.pro_subscriptions WHERE id = p_subscription_id;
  
  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription not found');
  END IF;
  
  UPDATE public.pro_subscriptions
  SET status = 'cancelled',
      rejected_at = NOW(),
      rejection_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_subscription_id;
  
  -- Create notification
  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (
    v_sub.user_id,
    'pro_subscription_rejected',
    'Pro Plan Request Update',
    'Your Pro Plan request was not approved. Reason: ' || COALESCE(p_reason, 'Not specified')
  );
  
  RETURN jsonb_build_object('success', true, 'subscription_id', p_subscription_id);
END;
$$;

-- ═══ Function: Expire old subscriptions (for scheduled job) ═══
CREATE OR REPLACE FUNCTION public.expire_pro_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.pro_subscriptions
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'active' AND expires_at < NOW();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ═══ Trigger: Update updated_at ═══
CREATE TRIGGER update_pro_subscriptions_updated_at
  BEFORE UPDATE ON public.pro_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_daily_usage_updated_at
  BEFORE UPDATE ON public.daily_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();