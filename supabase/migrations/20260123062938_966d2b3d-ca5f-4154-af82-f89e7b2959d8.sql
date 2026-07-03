-- Add progress tracking column
ALTER TABLE public.srt_translations 
ADD COLUMN IF NOT EXISTS progress_percent INTEGER DEFAULT 0;

-- Add source language column
ALTER TABLE public.srt_translations 
ADD COLUMN IF NOT EXISTS source_language TEXT DEFAULT 'en';

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.srt_translations;