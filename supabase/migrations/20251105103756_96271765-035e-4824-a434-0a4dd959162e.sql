-- Create auth_settings table for global authentication configuration
CREATE TABLE public.auth_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  signup_enabled BOOLEAN NOT NULL DEFAULT true,
  signin_enabled BOOLEAN NOT NULL DEFAULT true,
  rate_limit_enabled BOOLEAN NOT NULL DEFAULT true,
  max_login_attempts INTEGER NOT NULL DEFAULT 5,
  lockout_duration_minutes INTEGER NOT NULL DEFAULT 15,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(user_id)
);

-- Enable RLS
ALTER TABLE public.auth_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read/update auth settings
CREATE POLICY "Admins can manage auth settings"
ON public.auth_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default settings
INSERT INTO public.auth_settings (signup_enabled, signin_enabled, rate_limit_enabled, max_login_attempts, lockout_duration_minutes)
VALUES (true, true, true, 5, 15);

-- Create login_attempts table to track authentication attempts
CREATE TABLE public.login_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  ip_address TEXT,
  attempt_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  success BOOLEAN NOT NULL DEFAULT false,
  user_agent TEXT,
  attempt_type TEXT NOT NULL DEFAULT 'signin' -- 'signin' or 'signup'
);

-- Enable RLS
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Only system can insert, admins can read
CREATE POLICY "System can insert login attempts"
ON public.login_attempts
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can view login attempts"
ON public.login_attempts
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster lookups
CREATE INDEX idx_login_attempts_email ON public.login_attempts(email);
CREATE INDEX idx_login_attempts_ip ON public.login_attempts(ip_address);
CREATE INDEX idx_login_attempts_time ON public.login_attempts(attempt_time);

-- Function to clean old login attempts (older than 24 hours)
CREATE OR REPLACE FUNCTION public.clean_old_login_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  DELETE FROM public.login_attempts
  WHERE attempt_time < NOW() - INTERVAL '24 hours';
END;
$function$;

-- Trigger to update updated_at on auth_settings
CREATE TRIGGER update_auth_settings_updated_at
BEFORE UPDATE ON public.auth_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();