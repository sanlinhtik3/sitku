-- Add file_size_bytes column to track video file sizes
ALTER TABLE public.srt_translations 
ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;

COMMENT ON COLUMN public.srt_translations.file_size_bytes IS 'Video file size in bytes';