-- Add Mux video platform support to lessons table
ALTER TABLE public.lessons
ADD COLUMN IF NOT EXISTS mux_playback_id TEXT,
ADD COLUMN IF NOT EXISTS mux_asset_id TEXT,
ADD COLUMN IF NOT EXISTS video_platform TEXT DEFAULT 'youtube';

-- Add index for faster lookups when querying by Mux asset ID
CREATE INDEX IF NOT EXISTS idx_lessons_mux_asset_id ON public.lessons(mux_asset_id);

-- Add comment for documentation
COMMENT ON COLUMN public.lessons.mux_playback_id IS 'Mux playback ID for video streaming';
COMMENT ON COLUMN public.lessons.mux_asset_id IS 'Mux asset ID for video management';
COMMENT ON COLUMN public.lessons.video_platform IS 'Video platform: youtube, vimeo, or mux';