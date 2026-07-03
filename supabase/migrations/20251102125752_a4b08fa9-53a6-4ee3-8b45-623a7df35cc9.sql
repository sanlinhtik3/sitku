-- Update RLS policy to explicitly allow viewing all lessons including drafts
DROP POLICY IF EXISTS "Anyone can view lessons" ON public.lessons;

CREATE POLICY "Anyone can view all lessons including drafts"
ON public.lessons
FOR SELECT
USING (true);

-- Add comment for clarity
COMMENT ON POLICY "Anyone can view all lessons including drafts" ON public.lessons IS 
'Allows anyone to view all lessons regardless of is_published status. This includes draft lessons.';