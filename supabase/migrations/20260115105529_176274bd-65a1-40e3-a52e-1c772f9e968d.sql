-- Add use_shared_key column to bot_settings table
ALTER TABLE public.bot_settings 
ADD COLUMN IF NOT EXISTS use_shared_key BOOLEAN DEFAULT true;