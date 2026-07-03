-- Create 2FA verification attempts table for rate limiting
CREATE TABLE public.two_fa_verification_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  attempted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  success BOOLEAN NOT NULL DEFAULT false,
  ip_address TEXT,
  user_agent TEXT
);

-- Create index for efficient rate limiting queries
CREATE INDEX idx_2fa_attempts_user_time 
ON public.two_fa_verification_attempts(user_id, attempted_at DESC);

-- Create index for cleanup of old records
CREATE INDEX idx_2fa_attempts_time 
ON public.two_fa_verification_attempts(attempted_at);

-- Enable RLS
ALTER TABLE public.two_fa_verification_attempts ENABLE ROW LEVEL SECURITY;

-- RLS policy: Only service role can access (edge function uses admin client)
-- No user-facing policies needed as this is internal security data

-- Add comment for documentation
COMMENT ON TABLE public.two_fa_verification_attempts IS 'Tracks 2FA verification attempts for rate limiting and security auditing';