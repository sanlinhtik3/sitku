-- Add email verification requirement setting to auth_settings
ALTER TABLE public.auth_settings
ADD COLUMN IF NOT EXISTS require_email_verification BOOLEAN NOT NULL DEFAULT true;

-- Add unverified account cleanup days setting
ALTER TABLE public.auth_settings
ADD COLUMN IF NOT EXISTS unverified_cleanup_days INTEGER NOT NULL DEFAULT 7;

-- Add block disposable emails setting
ALTER TABLE public.auth_settings
ADD COLUMN IF NOT EXISTS block_disposable_emails BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.auth_settings.require_email_verification IS 'Require users to verify their email before accessing the app';
COMMENT ON COLUMN public.auth_settings.unverified_cleanup_days IS 'Number of days before unverified accounts are deleted (0 = disabled)';
COMMENT ON COLUMN public.auth_settings.block_disposable_emails IS 'Block signups from disposable email domains';