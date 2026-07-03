-- Fix lesson_type check constraint to include 'text'
ALTER TABLE public.lessons DROP CONSTRAINT IF EXISTS lessons_lesson_type_check;

ALTER TABLE public.lessons ADD CONSTRAINT lessons_lesson_type_check 
CHECK (lesson_type = ANY (ARRAY['video'::text, 'text'::text, 'quiz'::text, 'homework'::text]));