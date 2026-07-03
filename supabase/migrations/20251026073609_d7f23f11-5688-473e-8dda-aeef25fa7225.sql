-- Add index for efficient scheduled post queries
CREATE INDEX IF NOT EXISTS idx_posts_scheduled 
ON public.posts(published_at, is_published) 
WHERE is_published = false AND published_at IS NOT NULL;

-- Auto-publish function for scheduled posts
CREATE OR REPLACE FUNCTION public.auto_publish_scheduled_posts()
RETURNS void AS $$
BEGIN
  UPDATE public.posts
  SET is_published = true
  WHERE is_published = false 
    AND published_at IS NOT NULL 
    AND published_at <= NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;