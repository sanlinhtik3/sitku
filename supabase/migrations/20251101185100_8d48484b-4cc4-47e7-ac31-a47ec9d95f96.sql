-- Add video platform support to lessons table
ALTER TABLE public.lessons 
ADD COLUMN IF NOT EXISTS video_platform TEXT DEFAULT 'youtube' CHECK (video_platform IN ('youtube', 'vimeo')),
ADD COLUMN IF NOT EXISTS vimeo_url TEXT;

-- Add comment for clarity
COMMENT ON COLUMN public.lessons.video_platform IS 'Video hosting platform: youtube or vimeo';
COMMENT ON COLUMN public.lessons.vimeo_url IS 'Vimeo video URL when platform is vimeo';