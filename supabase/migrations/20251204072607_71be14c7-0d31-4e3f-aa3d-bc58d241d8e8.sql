-- Add text_content column for text-based lessons
ALTER TABLE public.lessons
ADD COLUMN text_content TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.lessons.text_content IS 'Rich text content for text-based lessons (stored as HTML)';