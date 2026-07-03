-- Update the video_platform check constraint to include 'mux'
ALTER TABLE public.lessons 
DROP CONSTRAINT IF EXISTS lessons_video_platform_check;

ALTER TABLE public.lessons 
ADD CONSTRAINT lessons_video_platform_check 
CHECK (video_platform IN ('youtube', 'vimeo', 'mux'));