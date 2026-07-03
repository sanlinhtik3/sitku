-- Add columns to support dual-language subtitles and chunked processing

-- Original SRT content (source language) for dual-language display
ALTER TABLE public.srt_translations 
ADD COLUMN IF NOT EXISTS original_srt_content TEXT;

-- Chunked processing columns for long videos
ALTER TABLE public.srt_translations 
ADD COLUMN IF NOT EXISTS total_chunks INTEGER,
ADD COLUMN IF NOT EXISTS processed_chunks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS chunk_srts JSONB,
ADD COLUMN IF NOT EXISTS is_chunked_processing BOOLEAN DEFAULT false;

-- Add comments for documentation
COMMENT ON COLUMN public.srt_translations.original_srt_content IS 'Original language SRT file content for dual-language subtitle display';
COMMENT ON COLUMN public.srt_translations.total_chunks IS 'Total number of audio chunks for long video processing';
COMMENT ON COLUMN public.srt_translations.processed_chunks IS 'Number of chunks that have been processed';
COMMENT ON COLUMN public.srt_translations.chunk_srts IS 'Array of SRT content for each processed chunk';
COMMENT ON COLUMN public.srt_translations.is_chunked_processing IS 'Whether this translation uses chunked processing for long videos';