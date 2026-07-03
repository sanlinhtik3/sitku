-- Add auth method control columns to auth_settings table
ALTER TABLE public.auth_settings
ADD COLUMN IF NOT EXISTS google_auth_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS email_auth_enabled boolean NOT NULL DEFAULT true;