-- Allow creators to insert lessons for their own courses
CREATE POLICY "Creators can insert lessons for their courses"
ON public.lessons
FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = lessons.course_id
    AND courses.created_by = auth.uid()
  )
);

-- Allow creators to update lessons for their own courses
CREATE POLICY "Creators can update lessons for their courses"
ON public.lessons
FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = lessons.course_id
    AND courses.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = lessons.course_id
    AND courses.created_by = auth.uid()
  )
);

-- Allow creators to delete lessons for their own courses
CREATE POLICY "Creators can delete lessons for their courses"
ON public.lessons
FOR DELETE
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = lessons.course_id
    AND courses.created_by = auth.uid()
  )
);

-- Allow creators to view all lessons for their own courses
CREATE POLICY "Creators can view lessons for their courses"
ON public.lessons
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = lessons.course_id
    AND courses.created_by = auth.uid()
  )
);