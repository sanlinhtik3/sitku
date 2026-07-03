-- Phase 1: User Token Quotas Table with Google AI Studio-style limits

-- Create the main user_token_quotas table
CREATE TABLE public.user_token_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  
  -- Token Allocation (like Google AI Studio's free tier)
  tokens_granted BIGINT DEFAULT 1000000, -- 1M free tokens
  tokens_used BIGINT DEFAULT 0,
  
  -- Rate Limits (per user, like Google AI Studio)
  rpm_limit INTEGER DEFAULT 10, -- Requests per minute
  tpm_limit INTEGER DEFAULT 250000, -- Tokens per minute  
  rpd_limit INTEGER DEFAULT 500, -- Requests per day
  
  -- Current Usage Tracking
  rpm_current INTEGER DEFAULT 0,
  rpm_reset_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 minute',
  tpm_current INTEGER DEFAULT 0,
  tpm_reset_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 minute',
  rpd_current INTEGER DEFAULT 0,
  rpd_reset_at TIMESTAMPTZ DEFAULT (DATE_TRUNC('day', NOW()) + INTERVAL '1 day'),
  
  -- Status
  quota_type TEXT DEFAULT 'free', -- 'free', 'pro', 'enterprise', 'custom'
  is_active BOOLEAN DEFAULT true,
  
  -- Admin Control
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- Optional expiration
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_token_quotas ENABLE ROW LEVEL SECURITY;

-- Users can read their own quota
CREATE POLICY "Users can view own quota" ON public.user_token_quotas
  FOR SELECT USING (auth.uid() = user_id);

-- Admins can manage all quotas (using existing has_role function)
CREATE POLICY "Admins can manage all quotas" ON public.user_token_quotas
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Create index for fast lookups
CREATE INDEX idx_user_token_quotas_user_id ON public.user_token_quotas(user_id);
CREATE INDEX idx_user_token_quotas_quota_type ON public.user_token_quotas(quota_type);

-- Create RPC function for atomic quota usage increment
CREATE OR REPLACE FUNCTION public.increment_quota_usage(
  p_user_id UUID,
  p_tokens INTEGER,
  p_requests INTEGER DEFAULT 1
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_result JSON;
BEGIN
  -- Get current quota
  SELECT * INTO v_quota FROM user_token_quotas WHERE user_id = p_user_id FOR UPDATE;
  
  IF NOT FOUND THEN
    -- Create default quota for new user
    INSERT INTO user_token_quotas (user_id) VALUES (p_user_id)
    RETURNING * INTO v_quota;
  END IF;
  
  -- Reset RPM if needed
  IF v_quota.rpm_reset_at < v_now THEN
    v_quota.rpm_current := 0;
    v_quota.rpm_reset_at := v_now + INTERVAL '1 minute';
  END IF;
  
  -- Reset TPM if needed
  IF v_quota.tpm_reset_at < v_now THEN
    v_quota.tpm_current := 0;
    v_quota.tpm_reset_at := v_now + INTERVAL '1 minute';
  END IF;
  
  -- Reset RPD if needed
  IF v_quota.rpd_reset_at < v_now THEN
    v_quota.rpd_current := 0;
    v_quota.rpd_reset_at := DATE_TRUNC('day', v_now) + INTERVAL '1 day';
  END IF;
  
  -- Update usage
  UPDATE user_token_quotas
  SET 
    tokens_used = tokens_used + p_tokens,
    rpm_current = v_quota.rpm_current + p_requests,
    rpm_reset_at = v_quota.rpm_reset_at,
    tpm_current = v_quota.tpm_current + p_tokens,
    tpm_reset_at = v_quota.tpm_reset_at,
    rpd_current = v_quota.rpd_current + p_requests,
    rpd_reset_at = v_quota.rpd_reset_at,
    updated_at = v_now
  WHERE user_id = p_user_id
  RETURNING json_build_object(
    'tokens_remaining', tokens_granted - tokens_used,
    'rpm_current', rpm_current,
    'rpm_limit', rpm_limit,
    'tpm_current', tpm_current,
    'tpm_limit', tpm_limit,
    'rpd_current', rpd_current,
    'rpd_limit', rpd_limit
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Create RPC function to check quota status
CREATE OR REPLACE FUNCTION public.check_quota_status(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_tokens_remaining BIGINT;
BEGIN
  SELECT * INTO v_quota FROM user_token_quotas WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    -- Return default quota info for new users
    RETURN json_build_object(
      'has_quota', false,
      'allowed', true,
      'tokens_remaining', 1000000,
      'reason', 'No quota record - will create on first use'
    );
  END IF;
  
  -- Calculate remaining tokens
  v_tokens_remaining := v_quota.tokens_granted - v_quota.tokens_used;
  
  -- Check if quota is active and not expired
  IF NOT v_quota.is_active THEN
    RETURN json_build_object('has_quota', true, 'allowed', false, 'reason', 'Quota is inactive');
  END IF;
  
  IF v_quota.expires_at IS NOT NULL AND v_quota.expires_at < v_now THEN
    RETURN json_build_object('has_quota', true, 'allowed', false, 'reason', 'Quota has expired');
  END IF;
  
  -- Check token limit
  IF v_tokens_remaining <= 0 THEN
    RETURN json_build_object('has_quota', true, 'allowed', false, 'reason', 'Token quota exhausted', 'tokens_remaining', 0);
  END IF;
  
  -- Check RPM (reset if needed)
  IF v_quota.rpm_reset_at > v_now AND v_quota.rpm_current >= v_quota.rpm_limit THEN
    RETURN json_build_object(
      'has_quota', true, 
      'allowed', false, 
      'reason', 'RPM limit exceeded', 
      'retry_after', v_quota.rpm_reset_at,
      'current', v_quota.rpm_current,
      'limit', v_quota.rpm_limit
    );
  END IF;
  
  -- Check RPD (reset if needed)
  IF v_quota.rpd_reset_at > v_now AND v_quota.rpd_current >= v_quota.rpd_limit THEN
    RETURN json_build_object(
      'has_quota', true, 
      'allowed', false, 
      'reason', 'Daily request limit exceeded', 
      'retry_after', v_quota.rpd_reset_at,
      'current', v_quota.rpd_current,
      'limit', v_quota.rpd_limit
    );
  END IF;
  
  -- All checks passed
  RETURN json_build_object(
    'has_quota', true,
    'allowed', true,
    'tokens_remaining', v_tokens_remaining,
    'rpm', json_build_object('current', v_quota.rpm_current, 'limit', v_quota.rpm_limit),
    'tpm', json_build_object('current', v_quota.tpm_current, 'limit', v_quota.tpm_limit),
    'rpd', json_build_object('current', v_quota.rpd_current, 'limit', v_quota.rpd_limit),
    'quota_type', v_quota.quota_type
  );
END;
$$;

-- Create trigger for updated_at
CREATE TRIGGER update_user_token_quotas_updated_at
BEFORE UPDATE ON public.user_token_quotas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.increment_quota_usage(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_quota_status(UUID) TO authenticated;