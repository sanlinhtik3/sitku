-- Add is_private column to lessons table for visibility control
ALTER TABLE public.lessons 
ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false;

-- Update RLS policy for lessons so users can only see published, non-private lessons
DROP POLICY IF EXISTS "Anyone can view all lessons including drafts" ON public.lessons;

CREATE POLICY "Users can view published public lessons"
ON public.lessons
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (is_published = true AND is_private = false)
);

-- Admins can still manage all lessons (keep existing policy)
-- This policy already exists: "Admins can manage lessons"