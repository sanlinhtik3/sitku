-- Add columns for YouTube video source tracking
ALTER TABLE public.srt_translations 
ADD COLUMN IF NOT EXISTS video_source TEXT DEFAULT 'upload',
ADD COLUMN IF NOT EXISTS youtube_url TEXT,
ADD COLUMN IF NOT EXISTS youtube_video_id TEXT;

-- Add constraint for valid video sources
ALTER TABLE public.srt_translations
ADD CONSTRAINT srt_translations_video_source_check 
CHECK (video_source IN ('upload', 'youtube'));

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_srt_translations_video_source 
ON public.srt_translations(video_source);