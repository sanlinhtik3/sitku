-- Add gemini_model column to bot_settings table
ALTER TABLE public.bot_settings 
ADD COLUMN IF NOT EXISTS gemini_model text DEFAULT 'gemini-2.5-flash';