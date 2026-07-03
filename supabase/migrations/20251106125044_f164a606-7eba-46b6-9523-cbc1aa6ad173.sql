-- Add is_published field to courses if it doesn't exist
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT false;

-- Set existing approved courses to published
UPDATE public.courses 
SET is_published = true 
WHERE approval_status = 'approved';

-- Drop existing RLS policies that depend on approval_status
DROP POLICY IF EXISTS "Anyone can view approved courses" ON public.courses;
DROP POLICY IF EXISTS "Creators can update their own pending courses" ON public.courses;
DROP POLICY IF EXISTS "Creators can delete their own pending courses" ON public.courses;

-- Create new RLS policy for viewing published courses
CREATE POLICY "Anyone can view published courses"
ON public.courses
FOR SELECT
USING (is_published = true OR has_role(auth.uid(), 'admin'::app_role));

-- Allow creators to update their own courses (including publish status)
CREATE POLICY "Creators can update their own courses"
ON public.courses
FOR UPDATE
USING (
  (has_role(auth.uid(), 'creator'::app_role) AND created_by = auth.uid()) 
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Allow creators to delete their own courses
CREATE POLICY "Creators can delete their own courses"
ON public.courses
FOR DELETE
USING (
  (has_role(auth.uid(), 'creator'::app_role) AND created_by = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
);