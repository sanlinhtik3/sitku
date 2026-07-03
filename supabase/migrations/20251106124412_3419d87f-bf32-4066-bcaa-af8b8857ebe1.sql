-- Fix RLS policies for lesson_sections table to allow creators to manage sections for their courses

-- Drop existing policies if any
DROP POLICY IF EXISTS "Creators can insert sections for their courses" ON public.lesson_sections;
DROP POLICY IF EXISTS "Creators can update sections for their courses" ON public.lesson_sections;
DROP POLICY IF EXISTS "Creators can delete sections for their courses" ON public.lesson_sections;
DROP POLICY IF EXISTS "Users can view sections for published courses" ON public.lesson_sections;

-- Allow creators to insert sections for their own courses
CREATE POLICY "Creators can insert sections for their courses"
ON public.lesson_sections
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = lesson_sections.course_id
    AND courses.created_by = auth.uid()
  )
);

-- Allow creators to update sections for their own courses
CREATE POLICY "Creators can update sections for their courses"
ON public.lesson_sections
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = lesson_sections.course_id
    AND courses.created_by = auth.uid()
  )
);

-- Allow creators to delete sections for their own courses
CREATE POLICY "Creators can delete sections for their courses"
ON public.lesson_sections
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = lesson_sections.course_id
    AND courses.created_by = auth.uid()
  )
);

-- Allow users to view sections for courses
CREATE POLICY "Users can view sections for courses"
ON public.lesson_sections
FOR SELECT
USING (true);