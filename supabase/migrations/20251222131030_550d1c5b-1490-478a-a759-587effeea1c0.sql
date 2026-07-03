-- Add dual language columns to cr_responses table
ALTER TABLE public.cr_responses 
ADD COLUMN IF NOT EXISTS result_en JSONB,
ADD COLUMN IF NOT EXISTS result_my JSONB;