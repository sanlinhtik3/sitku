-- Add allow_dm column to bot_settings table for controlling DM responses
ALTER TABLE public.bot_settings 
ADD COLUMN IF NOT EXISTS allow_dm boolean DEFAULT false;