-- Enhanced user_sessions table with geolocation and device details
ALTER TABLE public.user_sessions 
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS region TEXT,
ADD COLUMN IF NOT EXISTS coordinates JSONB,
ADD COLUMN IF NOT EXISTS os TEXT,
ADD COLUMN IF NOT EXISTS browser TEXT,
ADD COLUMN IF NOT EXISTS device_type TEXT,
ADD COLUMN IF NOT EXISTS device_name TEXT,
ADD COLUMN IF NOT EXISTS is_trusted BOOLEAN DEFAULT false;

-- Add session control to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS max_concurrent_sessions INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS enforce_single_device BOOLEAN DEFAULT false;

-- Create session_settings table for global configuration
CREATE TABLE IF NOT EXISTS public.session_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_enforce_single_device BOOLEAN DEFAULT false,
  default_session_timeout_minutes INTEGER DEFAULT 10080,
  max_concurrent_sessions_default INTEGER DEFAULT 5,
  suspicious_login_threshold INTEGER DEFAULT 3,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(user_id)
);

-- Enable RLS on session_settings
ALTER TABLE public.session_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage session settings
CREATE POLICY "Admins can manage session settings"
ON public.session_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default settings
INSERT INTO public.session_settings (global_enforce_single_device, default_session_timeout_minutes, max_concurrent_sessions_default)
VALUES (false, 10080, 5)
ON CONFLICT (id) DO NOTHING;

-- Create RPC function for admin to logout user session
CREATE OR REPLACE FUNCTION public.admin_logout_user_session(
  p_session_id UUID,
  p_admin_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
BEGIN
  -- Check if caller is admin
  IF NOT has_role(p_admin_user_id, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  
  -- Get session details
  SELECT * INTO v_session FROM public.user_sessions WHERE id = p_session_id;
  
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
  END IF;
  
  -- Revoke session
  UPDATE public.user_sessions
  SET is_active = false,
      revoked_at = NOW(),
      revoked_by = p_admin_user_id
  WHERE id = p_session_id;
  
  -- Log action
  PERFORM log_admin_action(
    'logout_user_session',
    'user_session',
    p_session_id,
    jsonb_build_object(
      'target_user_id', v_session.user_id,
      'session_token', v_session.session_token
    )
  );
  
  RETURN jsonb_build_object('success', true, 'session_id', p_session_id);
END;
$$;

-- Create RPC function for admin to logout all user sessions
CREATE OR REPLACE FUNCTION public.admin_logout_all_user_sessions(
  p_user_id UUID,
  p_admin_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Check if caller is admin
  IF NOT has_role(p_admin_user_id, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  
  -- Get count of active sessions
  SELECT COUNT(*) INTO v_count 
  FROM public.user_sessions 
  WHERE user_id = p_user_id AND is_active = true;
  
  -- Revoke all active sessions
  UPDATE public.user_sessions
  SET is_active = false,
      revoked_at = NOW(),
      revoked_by = p_admin_user_id
  WHERE user_id = p_user_id AND is_active = true;
  
  -- Log action
  PERFORM log_admin_action(
    'logout_all_user_sessions',
    'user_session',
    p_user_id,
    jsonb_build_object(
      'sessions_count', v_count
    )
  );
  
  RETURN jsonb_build_object('success', true, 'sessions_revoked', v_count);
END;
$$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active ON public.user_sessions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_country ON public.user_sessions(country);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON public.user_sessions(last_activity DESC);