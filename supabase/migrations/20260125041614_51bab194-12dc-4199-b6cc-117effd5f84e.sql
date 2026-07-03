-- Add missing step tracking columns for progress updates
ALTER TABLE public.srt_translations 
ADD COLUMN IF NOT EXISTS current_step TEXT,
ADD COLUMN IF NOT EXISTS step_message TEXT;

-- Update status check constraint to include 'generating' status
ALTER TABLE public.srt_translations 
DROP CONSTRAINT IF EXISTS srt_translations_status_check;

ALTER TABLE public.srt_translations 
ADD CONSTRAINT srt_translations_status_check 
CHECK (status IN ('pending', 'processing', 'extracting', 'transcribing', 'translating', 'generating', 'completed', 'failed'));