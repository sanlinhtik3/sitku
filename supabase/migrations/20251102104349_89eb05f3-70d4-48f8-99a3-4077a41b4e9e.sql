-- Add new columns to lessons table for draft functionality and thumbnails
ALTER TABLE public.lessons 
ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS thumbnail_url text;

-- Create index for filtering published lessons
CREATE INDEX IF NOT EXISTS idx_lessons_is_published ON public.lessons(is_published);